import Foundation
import Testing
@testable import OpenUIGen

/// The stub's response and recorded request are shared, so the tests run one at a time.
@Suite(.serialized)
struct APIClientTests {
    private let client = APIClient(baseURL: URL(string: "http://test.local")!, session: StubURLProtocol.session)

    /// Catches a path joined wrongly onto the base URL, or a decode into the wrong shape.
    @Test func getsAPathUnderTheBaseURL() async throws {
        StubURLProtocol.respond(200, #"{"status":"ok"}"#)

        let health = try await HealthService(client: client).checkHealth()

        #expect(health == ServerHealth(status: "ok"))
        let request = try #require(StubURLProtocol.lastRequest)
        #expect(request.url?.absoluteString == "http://test.local/health")
        #expect(request.httpMethod == "GET")
    }

    enum Failure: Equatable {
        case status(Int, body: String)
        case decoding
    }

    /// A non-2xx answer keeps its status and body (the server explains errors in JSON); a 2xx
    /// answer of the wrong shape is a decoding failure, not a transport one, so the app says
    /// "not this server" rather than "offline".
    @Test(arguments: [
        (299, #"{"unexpected":true}"#, Failure.decoding),
        (300, #"{"error":"moved"}"#, Failure.status(300, body: #"{"error":"moved"}"#)),
        (500, #"{"error":"internal_error"}"#, Failure.status(500, body: #"{"error":"internal_error"}"#)),
    ])
    func classifiesFailures(status: Int, body: String, expected: Failure) async {
        StubURLProtocol.respond(status, body)

        do throws(HTTPFailure) {
            let _: ServerHealth = try await client.get("health")
            Issue.record("Expected \(expected)")
        } catch {
            let actual: Failure? = switch error {
            case let .status(code, body): .status(code, body: String(bytes: body, encoding: .utf8) ?? "")
            case .decoding: .decoding
            case .transport, .cancelled: nil
            }
            #expect(actual == expected)
        }
    }

    /// POST is a mutation: the server must receive the body as JSON.
    @Test func postsTheBodyAsJSON() async throws {
        struct Pick: Encodable { let team: String }
        StubURLProtocol.respond(200, #"{"status":"ok"}"#)

        let _: ServerHealth = try await client.post("tools/sports_dataset", body: Pick(team: "Chelsea"))

        let request = try #require(StubURLProtocol.lastRequest)
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(StubURLProtocol.lastBody == Data(#"{"team":"Chelsea"}"#.utf8))
    }
}

/// Answers every request with the stubbed status and body, and records the last request so the
/// test body can assert on it (expectations inside the protocol run outside the test).
private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    private nonisolated(unsafe) static var response: (status: Int, body: Data) = (200, Data())
    nonisolated(unsafe) static var lastRequest: URLRequest?
    nonisolated(unsafe) static var lastBody: Data?

    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: configuration)
    }()

    static func respond(_ status: Int, _ body: String) {
        response = (status, Data(body.utf8))
        lastRequest = nil
        lastBody = nil
    }

    /// URLSession moves `httpBody` into a stream before the protocol sees the request.
    private static func body(of request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: buffer.count)
            guard read > 0 else { break }
            data.append(buffer, count: read)
        }
        return data
    }

    override static func canInit(with _: URLRequest) -> Bool { true }
    override static func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastRequest = request
        Self.lastBody = Self.body(of: request)
        let (status, body) = Self.response
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
