import Foundation

/// A small JSON REST client for the openui-gen backend.
///
/// Requests are built from a path relative to `baseURL`; bodies and responses are JSON.
/// Every failure is reported as `HTTPFailure`.
struct APIClient: Sendable {
    let baseURL: URL
    private let session: URLSession
    private let timeout: TimeInterval

    init(baseURL: URL, session: URLSession = .shared, timeout: TimeInterval = 30) {
        self.baseURL = baseURL
        self.session = session
        self.timeout = timeout
    }

    func get<Response: Decodable>(
        _ path: String,
        as _: Response.Type = Response.self
    ) async throws(HTTPFailure) -> Response {
        try await send(request(path, method: "GET"))
    }

    func post<Response: Decodable>(
        _ path: String,
        body: some Encodable,
        as _: Response.Type = Response.self
    ) async throws(HTTPFailure) -> Response {
        var request = request(path, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw .transport(error)
        }
        return try await send(request)
    }

    private func request(_ path: String, method: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path), timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func send<Response: Decodable>(_ request: URLRequest) async throws(HTTPFailure) -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            if error is CancellationError || (error as? URLError)?.code == .cancelled {
                throw .cancelled
            }
            throw .transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw .transport(URLError(.badServerResponse))
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            throw .status(http.statusCode, body: data)
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw .decoding(error)
        }
    }
}
