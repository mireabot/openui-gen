import Foundation

/// `GET /health`.
struct ServerHealth: Decodable, Equatable {
    let status: String
}

/// Checks that the backend is reachable.
struct HealthService: Sendable {
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func checkHealth() async throws(HTTPFailure) -> ServerHealth {
        try await client.get("health")
    }
}
