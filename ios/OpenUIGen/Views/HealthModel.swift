import Foundation
import Observation

/// Loads `/health` for `RootView`.
@MainActor
@Observable
final class HealthModel {
    enum State: Equatable {
        case idle
        case loading
        case reachable(status: String)
        case failed(message: String)
    }

    private(set) var state: State = .idle

    @ObservationIgnored private let service: HealthService

    init(service: HealthService) {
        self.service = service
    }

    func check() async {
        state = .loading
        do throws(HTTPFailure) {
            let health = try await service.checkHealth()
            state = .reachable(status: health.status)
        } catch .cancelled {
            state = .idle
        } catch {
            state = .failed(message: Self.message(for: error))
        }
    }

    private static func message(for failure: HTTPFailure) -> String {
        switch failure {
        case let .transport(error): error.localizedDescription
        case .cancelled: "Cancelled."
        case let .status(code, _): "The server answered \(code)."
        case .decoding: "The server answered with something other than openui-gen's /health."
        }
    }
}
