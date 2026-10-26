import Foundation
import Observation

/// Sends prompts to `POST /lang/sports/stream` and keeps the OpenUI session that renders them.
/// The first prompt starts a document; later prompts are follow-ups on it.
@MainActor
@Observable
final class AskModel {
    var prompt = ""
    private(set) var session: OpenUISession?
    private(set) var errorMessage: String?

    @ObservationIgnored private let service: any OpenUIStreaming

    init(service: any OpenUIStreaming) {
        self.service = service
    }

    var isBusy: Bool {
        session?.phase == .loading || session?.phase == .updating
    }

    func send() async {
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isBusy else { return }
        prompt = ""
        errorMessage = nil
        do {
            let session = try session ?? OpenUISession(service: service)
            self.session = session
            try await session.ask(text)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    /// Drops the document so the next prompt starts a new one.
    func reset() {
        session = nil
        errorMessage = nil
    }

    private static func message(for error: any Error) -> String {
        switch error {
        case let failure as OpenUIError: "\(failure)"
        case let HTTPFailure.status(code, _): "The server answered \(code)."
        default: error.localizedDescription
        }
    }
}
