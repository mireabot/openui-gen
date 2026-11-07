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
    private(set) var saveState = SaveState.idle
    /// The prompt of the run in progress or last finished, when it edits a screen; nil for a new screen.
    private(set) var followUp: String?

    enum SaveState: Equatable { case idle, saving, saved, failed }

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
        saveState = .idle
        followUp = session == nil ? nil : text
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

    /// Keeps a copy of the screen as it stands on the server.
    func save() async {
        guard let document = session?.document, saveState != .saving, saveState != .saved else { return }
        saveState = .saving
        do {
            try await service.save(document)
            saveState = .saved
        } catch {
            saveState = .failed
        }
    }

    /// Drops the document so the next prompt starts a new one.
    func reset() {
        session = nil
        errorMessage = nil
        saveState = .idle
        followUp = nil
    }

    private static func message(for error: any Error) -> String {
        switch error {
        case let failure as OpenUIError: "\(failure)"
        case let HTTPFailure.status(code, _): "The server answered \(code)."
        default: error.localizedDescription
        }
    }
}
