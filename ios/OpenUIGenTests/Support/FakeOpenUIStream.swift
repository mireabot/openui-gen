import Foundation
@testable import OpenUIGen

/// The shared fake for `OpenUIStreaming`: each `stream` call plays the next scripted list of
/// events, and every request is recorded so tests can check what reached the server.
final class FakeOpenUIStream: OpenUIStreaming, @unchecked Sendable {
    private let lock = NSLock()
    private var scripts: [[OpenUIStreamEvent]]
    private var recorded: [OpenUIStreamRequest] = []

    init(_ scripts: [[OpenUIStreamEvent]]) {
        self.scripts = scripts
    }

    var requests: [OpenUIStreamRequest] {
        lock.withLock { recorded }
    }

    func stream(_ request: OpenUIStreamRequest) -> AsyncThrowingStream<OpenUIStreamEvent, any Error> {
        let events = lock.withLock {
            recorded.append(request)
            return scripts.isEmpty ? [] : scripts.removeFirst()
        }
        return AsyncThrowingStream { continuation in
            for event in events {
                continuation.yield(event)
            }
            continuation.finish()
        }
    }

    func query(tool: String, args _: PValue) async throws -> PValue {
        throw OpenUIError.missingQuery(tool)
    }

    func save(_: OpenUIDocumentVersion) async throws {}
}

extension OpenUIStreamEvent {
    /// A one-Text screen that closes the stream as `document` at `revision`.
    static func done(text: String, document: String, revision: Int) -> OpenUIStreamEvent {
        .done(OpenUIStreamDone(
            program: "root = Screen([a])\na = Text(\"\(text)\", \"body\")",
            run: document,
            document: OpenUIDocumentVersion(id: document, revision: revision)
        ))
    }
}

extension OpenUISession {
    /// The `content` of the first Text on screen, as the user sees it.
    var shownText: String? {
        root.children.first?.slots["children"]?.children.first?.properties["content"]?.stringValue
    }
}
