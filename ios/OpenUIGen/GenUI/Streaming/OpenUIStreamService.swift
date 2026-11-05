import Foundation

public struct OpenUIDocumentVersion: Codable, Equatable, Sendable {
    public let id: String
    public let revision: Int
    public init(id: String, revision: Int) { self.id = id; self.revision = revision }
}

public struct OpenUIStreamDone: Decodable, Equatable, Sendable {
    public let program: String
    public let run: String
    public let document: OpenUIDocumentVersion?
    public let model: String?
    public let issues: [PValue]?
    public init(
        program: String,
        run: String,
        document: OpenUIDocumentVersion? = nil,
        model: String? = nil,
        issues: [PValue]? = nil
    ) {
        self.program = program; self.run = run; self.document = document; self.model = model; self
            .issues = issues
    }
}

public enum OpenUIStreamEvent: Sendable, Equatable {
    case activity(PValue)
    case usage(PValue)
    case data(OpenUIDataset)
    case skeleton(PrimitiveSkeleton)
    case openui(text: String, replace: Bool)
    case issue(PValue)
    case done(OpenUIStreamDone)
}

public struct OpenUIStreamRequest: Sendable, Encodable {
    public let prompt: String
    public let model: String?
    public let timeZone: String?
    public let documentID: String?
    public let baseRevision: Int?
    public let targets: [String]?
    public init(
        prompt: String,
        model: String? = nil,
        timeZone: String? = nil,
        documentID: String? = nil,
        baseRevision: Int? = nil,
        targets: [String]? = nil
    ) {
        self.prompt = prompt; self.model = model; self.timeZone = timeZone; self.documentID = documentID; self
            .baseRevision = baseRevision; self.targets = targets
    }

    private enum CodingKeys: String, CodingKey { case prompt, model, timeZone, baseRevision, targets }
}

public protocol OpenUIStreaming: Sendable {
    func stream(_ request: OpenUIStreamRequest) -> AsyncThrowingStream<OpenUIStreamEvent, any Error>
    func query(tool: String, args: PValue) async throws -> PValue
    /// Keeps a copy of this revision on the server.
    func save(_ document: OpenUIDocumentVersion) async throws
}

public struct OpenUIStreamService: OpenUIStreaming {
    public let baseURL: URL
    private let session: URLSession
    public init(baseURL: URL, session: URLSession = .shared) { self.baseURL = baseURL; self.session = session }
    public func stream(_ request: OpenUIStreamRequest) -> AsyncThrowingStream<OpenUIStreamEvent, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do { try await run(request) { continuation.yield($0) }; continuation.finish() }
                catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func query(tool: String, args: PValue) async throws -> PValue {
        guard tool == "sports_dataset" else { throw OpenUIError.missingQuery(tool) }
        var request = URLRequest(url: baseURL.appending(path: "tools/sports_dataset"))
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(args)
        let (data, response) = try await session.data(for: request)
        try Self.check(response, data: data)
        return try JSONDecoder().decode(PValue.self, from: data)
    }

    public func save(_ document: OpenUIDocumentVersion) async throws {
        var request = URLRequest(
            url: baseURL.appending(path: "lang/sports").appending(component: document.id)
                .appending(path: "save")
        )
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["revision": document.revision])
        let (data, response) = try await session.data(for: request)
        try Self.check(response, data: data)
    }

    private func run(_ body: OpenUIStreamRequest, yield: (OpenUIStreamEvent) -> Void) async throws {
        let url: URL = if let id = body.documentID {
            baseURL.appending(path: "lang/sports").appending(component: id).appending(path: "follow-up")
        } else { baseURL.appending(path: "lang/sports/stream") }
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.timeoutInterval = 180
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONEncoder().encode(body)
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if !(200 ..< 300).contains(http.statusCode) {
            var data = Data(); for try await byte in bytes {
                data.append(byte)
            }; try Self.check(response, data: data)
        }
        var framer = ScreenEventFramer()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard let frame = try framer.accept(byte), let event = try Self.decodeEvent(
                name: frame.name,
                data: frame.data
            ) else { continue }
            yield(event)
            if case .done = event { return }
        }
        throw OpenUIError.incompleteStream
    }

    public static func decodeEvent(name: String, data: Data) throws -> OpenUIStreamEvent? {
        let decoder = JSONDecoder()
        switch name {
        case "activity": return try .activity(decoder.decode(PValue.self, from: data))
        case "usage": return try .usage(decoder.decode(PValue.self, from: data))
        case "data": return try .data(decoder.decode(OpenUIDataset.self, from: data))
        case "skeleton": return try .skeleton(decoder.decode(PrimitiveSkeleton.self, from: data))
        case "openui":
            let value = try decoder.decode(PValue.self, from: data)
            guard let text = value["text"]?.stringValue else { throw OpenUIError.syntax("Missing OpenUI text") }
            return .openui(text: text, replace: value["replace"]?.boolValue ?? false)
        case "issue":
            let value = try decoder.decode(PValue.self, from: data); return .issue(value["issue"] ?? value)
        case "done": return try .done(decoder.decode(OpenUIStreamDone.self, from: data))
        case "failure", "error":
            let value = try? decoder.decode(PValue.self, from: data)
            throw OpenUIError.server(value?["message"]?.stringValue ?? String(decoding: data, as: UTF8.self))
        default: return nil
        }
    }

    private static func check(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if http.statusCode == 409 { throw OpenUIError.staleRevision }
        guard (200 ..< 300).contains(http.statusCode) else { throw HTTPFailure.status(http.statusCode, body: data) }
    }
}
