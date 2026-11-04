import Foundation
import Observation

/// One rendered element. A view holds its handle directly; the session writes a property only
/// when its evaluated value changed, so an untouched element never invalidates.
@MainActor
@Observable
public final class OpenUIElementHandle {
    public nonisolated let id: OpenUIElementID
    public nonisolated let kind: String
    public private(set) var properties: [String: PValue]
    public private(set) var bindings: [String: OpenUIEditAddress]
    /// One stable handle per child slot. A slot observes its own children, not theirs.
    public let slots: [String: OpenUISlotHandle]

    init(_ element: OpenUISemanticElement) {
        id = element.id
        kind = element.kind
        properties = element.properties
        bindings = element.bindings
        slots = element.slots.mapValues { _ in OpenUISlotHandle() }
    }

    /// Returns whether anything observable changed.
    func update(_ element: OpenUISemanticElement) -> Bool {
        var changed = false
        if properties != element.properties { properties = element.properties; changed = true }
        if bindings != element.bindings { bindings = element.bindings; changed = true }
        return changed
    }
}

@MainActor
@Observable
public final class OpenUISlotHandle {
    public private(set) var children: [OpenUIElementHandle] = []

    func set(_ handles: [OpenUIElementHandle]) -> Bool {
        guard !children.elementsEqual(handles, by: ===) else { return false }
        children = handles
        return true
    }
}

/// The screen's top-level membership. Changing a part's content does not touch it.
@MainActor
@Observable
public final class OpenUIRootHandle {
    public private(set) var children: [OpenUIElementHandle] = []

    func set(_ handles: [OpenUIElementHandle]) -> Bool {
        guard !children.elementsEqual(handles, by: ===) else { return false }
        children = handles
        return true
    }
}

/// What one commit changed, for tests and traces.
public struct OpenUICommit: Equatable, Sendable {
    public var created = 0
    public var updated = 0
    public var slots = 0
    public var removed = 0
    public var root = false
}

/// One OpenUI document on screen: the program, its dataset seeds, local calculator edits and the
/// retained handles. Initial generation commits accepted statements as they stream. A follow-up
/// keeps the screen as it is until the backend completes, then commits the new revision once.
///
///     let session = try OpenUISession(service: OpenUIStreamService(baseURL: server))
///     try await session.ask("Premier League table this season")
///     try await session.ask("get the latest report rather than upcoming") // a follow-up
///     OpenUISceneView(root: session.root)
@MainActor
@Observable
public final class OpenUISession {
    public enum Phase: Equatable, Sendable { case idle, loading, updating, ready }

    public let root = OpenUIRootHandle()
    public private(set) var phase = Phase.idle
    public private(set) var activities: [DSLActivity] = []
    public private(set) var skeleton: PrimitiveSkeleton?
    public private(set) var document: OpenUIDocumentVersion?
    public private(set) var issues: [PValue] = []
    public private(set) var startedAt = Date.now
    /// When the run stopped, so its timer holds; nil while it runs.
    public private(set) var finishedAt: Date?
    /// Dollars spent so far in this run, per pipeline stage.
    public private(set) var stageCosts: [String: Double] = [:]

    @ObservationIgnored private let service: any OpenUIStreaming
    @ObservationIgnored private let compiler: OpenUICompiler
    @ObservationIgnored private var registry: [OpenUIElementID: OpenUIElementHandle] = [:]
    @ObservationIgnored private var program = ""
    @ObservationIgnored private var datasets: [OpenUIDataset] = []
    @ObservationIgnored private var edits: [OpenUIEditAddress: Double] = [:]
    @ObservationIgnored private var documentKey = "draft"
    @ObservationIgnored public private(set) var lastCommit = OpenUICommit()
    /// Every request, raw event, compile failure and error since the session started, oldest first.
    @ObservationIgnored public private(set) var log: [String] = []

    /// The whole trace as text, for pasting into a bug report.
    public var logText: String { log.joined(separator: "\n") }

    public init(service: any OpenUIStreaming, compiler: OpenUICompiler? = nil) throws {
        self.service = service
        self.compiler = try compiler ?? OpenUICompiler()
    }

    /// Whether a finished part is on screen: the opening program's empty `Screen` has none.
    public var hasContent: Bool { shownBlocks > 0 }

    public var totalCost: Double { stageCosts.values.reduce(0, +) }

    /// Skeleton frames for the parts still being written, under the finished ones.
    public var pendingBlocks: [SkeletonFrame] {
        guard phase == .loading, let skeleton else { return [] }
        return skeleton.pendingBlocks(afterShowing: shownBlocks)
    }

    private var shownBlocks: Int {
        root.children.reduce(0) { $0 + ($1.kind == "Screen" ? $1.slots["children"]?.children.count ?? 0 : 1) }
    }

    /// The first message starts a document; later messages are follow-ups on it.
    public func ask(_ prompt: String, targets: [String]? = nil) async throws {
        if let document { try await followUp(prompt, on: document, targets: targets) } else {
            try await start(prompt)
        }
    }

    /// A calculator input changed on screen. Only the session owns edits.
    public func edit(_ address: OpenUIEditAddress, value: Double) {
        edits[address] = value
        try? recompile(allowIncomplete: phase == .loading)
    }

    public func archive(origin: URL) throws -> OpenUIArchive {
        guard let document else { throw OpenUIError.missingDocument }
        return OpenUIArchive(
            documentID: document.id,
            revision: document.revision,
            origin: origin,
            program: program,
            datasets: datasets
        )
    }

    public func restore(_ archive: OpenUIArchive) throws {
        program = archive.program
        datasets = archive.datasets
        documentKey = archive.documentID
        document = .init(id: archive.documentID, revision: archive.revision)
        try recompile(allowIncomplete: false)
        phase = .ready
    }

    // MARK: - Requests

    private func start(_ prompt: String) async throws {
        begin(.loading)
        program = ""
        datasets = []
        edits = [:]
        let request = request(prompt)
        trace("ask", request)
        do {
            for try await event in service.stream(request) {
                try Task.checkCancellation()
                trace(event)
                switch event {
                case let .activity(value): record(value)
                case let .usage(value): recordCost(value)
                case let .data(dataset):
                    datasets.append(dataset)
                    if case let .string(run)? = dataset.args["run"], documentKey == "draft" { documentKey = run }
                case let .skeleton(value): skeleton = value
                case let .openui(text, replace):
                    program = replace ? text : program + text
                    // A prefix can reference a seed that has not arrived; the next statement retries.
                    do { try recompile(allowIncomplete: true) } catch { trace("compile (partial)", error) }
                case let .issue(value): issues.append(value)
                case let .done(done):
                    program = done.program
                    if let version = done.document { documentKey = version.id; document = version }
                    try recompile(allowIncomplete: false)
                    finish()
                    return
                }
            }
            throw OpenUIError.incompleteStream
        } catch {
            trace("failed", error)
            if hasContent { finish() } else { phase = .idle; finishedAt = .now }
            throw error
        }
    }

    /// Activity streams while the visible document stays put. Content commits once, after `done`
    /// confirms the document and its next revision.
    private func followUp(_ prompt: String, on base: OpenUIDocumentVersion, targets: [String]?) async throws {
        begin(.updating)
        var stagedProgram: String?
        var stagedSeeds: [OpenUIDataset] = []
        let request = request(prompt, document: base, targets: targets)
        trace("follow-up", request)
        do {
            for try await event in service.stream(request) {
                try Task.checkCancellation()
                trace(event)
                switch event {
                case let .activity(value): record(value)
                case let .usage(value): recordCost(value)
                case let .data(dataset): stagedSeeds.append(dataset)
                case let .openui(text, _): stagedProgram = text
                case let .issue(value): issues.append(value)
                case .skeleton: continue
                case let .done(done):
                    guard let version = done.document, version.id == base.id, version.revision == base.revision + 1
                    else { throw OpenUIError.staleRevision }
                    try commitFollowUp(program: stagedProgram ?? done.program, seeds: stagedSeeds, version: version)
                    finish()
                    return
                }
            }
            throw OpenUIError.incompleteStream
        } catch {
            trace("failed", error)
            finish()
            throw error
        }
    }

    private func commitFollowUp(program next: String, seeds: [OpenUIDataset], version: OpenUIDocumentVersion) throws {
        let previousProgram = program
        let previousDatasets = datasets
        program = next
        datasets += seeds
        do { try recompile(allowIncomplete: false) } catch {
            program = previousProgram
            datasets = previousDatasets
            throw error
        }
        document = version
    }

    private func request(
        _ prompt: String,
        document: OpenUIDocumentVersion? = nil,
        targets: [String]? = nil
    ) -> OpenUIStreamRequest {
        OpenUIStreamRequest(
            prompt: prompt,
            timeZone: TimeZone.current.identifier,
            documentID: document?.id,
            baseRevision: document?.revision,
            targets: targets
        )
    }

    private func begin(_ next: Phase) {
        phase = next
        activities = []
        issues = []
        startedAt = .now
        finishedAt = nil
        stageCosts = [:]
    }

    private func finish() {
        phase = .ready
        skeleton = nil
        finishedAt = .now
    }

    private func recordCost(_ value: PValue) {
        guard let stage = value["stage"]?.stringValue, let cost = value["costUSD"]?.numberValue else { return }
        stageCosts[stage, default: 0] += cost
    }

    private func record(_ value: PValue) {
        guard let data = try? JSONEncoder().encode(value),
              let activity = try? JSONDecoder().decode(DSLActivity.self, from: data) else { return }
        if let index = activities.firstIndex(where: { $0.stage == activity.stage }) {
            activities[index] = activity
        } else {
            activities.append(activity)
        }
    }

    // MARK: - Trace

    private func trace(_ label: String, _ value: some Encodable) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let body = (try? encoder.encode(value)).map { String(decoding: $0, as: UTF8.self) } ?? "\(value)"
        append(label, body)
    }

    private func trace(_ label: String, _ error: any Error) {
        append(label, "\(error.localizedDescription) · \(String(reflecting: error))")
    }

    private func trace(_ event: OpenUIStreamEvent) {
        switch event {
        case let .activity(value): trace("activity", value)
        case let .usage(value): trace("usage", value)
        case let .data(dataset): trace("data", dataset)
        case let .skeleton(value): trace("skeleton", value)
        case let .openui(text, replace): append(replace ? "openui (replace)" : "openui", text)
        case let .issue(value): trace("issue", value)
        case let .done(done): append(
                "done",
                "document \(done.document.map { "\($0.id) r\($0.revision)" } ?? "none")\n\(done.program)"
            )
        }
    }

    private func append(_ label: String, _ body: String) {
        let elapsed = String(format: "%.2f", Date.now.timeIntervalSince(startedAt))
        log.append("[\(elapsed)s] \(label): \(body)")
    }

    // MARK: - Commit

    private func recompile(allowIncomplete: Bool) throws {
        let scene = try compiler.compile(
            program: program,
            documentID: documentKey,
            datasets: datasets,
            edits: edits,
            allowIncomplete: allowIncomplete
        )
        lastCommit = commit(scene)
    }

    /// Reconciles a scene into the retained handles in one synchronous main-actor pass. Surviving
    /// handles stay the same objects; only changed properties and child lists are written.
    private func commit(_ scene: OpenUIScene) -> OpenUICommit {
        var result = OpenUICommit()
        var next: [OpenUIElementID: OpenUIElementHandle] = [:]
        for (id, element) in scene.elements {
            if let handle = registry[id], handle.kind == element.kind,
               Set(handle.slots.keys) == Set(element.slots.keys)
            {
                if handle.update(element) { result.updated += 1 }
                next[id] = handle
            } else {
                next[id] = OpenUIElementHandle(element)
                result.created += 1
            }
        }
        for (id, element) in scene.elements {
            guard let handle = next[id] else { continue }
            for (name, children) in element.slots
                where handle.slots[name]?.set(children.compactMap { next[$0] }) == true
            {
                result.slots += 1
            }
        }
        result.root = root.set(scene.roots.compactMap { next[$0] })
        result.removed = registry.keys.count { next[$0] == nil }
        registry = next
        return result
    }
}
