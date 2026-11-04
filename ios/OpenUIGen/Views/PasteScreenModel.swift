import Foundation
import Observation

/// Turns pasted JSON into a rendered screen. Main-actor because it owns an `OpenUISession`.
@MainActor
@Observable
final class PasteScreenModel {
    enum State {
        case editing(failure: String?)
        case rendered(OpenUISession)
    }

    var text = "" {
        didSet { if text != oldValue { state = .editing(failure: nil) } }
    }

    private(set) var state = State.editing(failure: nil)

    var canRender: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Restores the pasted program and data into a session, the way the Components page shows its
    /// fixtures. Restoring never touches the service, and this screen has no way to ask or save.
    func render(baseURL: URL) {
        do {
            let screen = try OpenUIImportedScreen(json: text)
            let session = try OpenUISession(service: OpenUIStreamService(baseURL: baseURL))
            try session.restore(OpenUIArchive(
                documentID: "pasted",
                revision: 1,
                origin: baseURL,
                program: screen.program,
                datasets: [screen.dataset]
            ))
            state = session.hasContent ? .rendered(session) : .editing(failure: "This screen is empty.")
        } catch {
            state = .editing(failure: error.localizedDescription)
        }
    }

    func edit() {
        state = .editing(failure: nil)
    }
}
