import Foundation
import Testing
@testable import OpenUIGen

@MainActor
struct OpenUISessionTests {
    /// Catches `AskModel` starting a fresh session per prompt: the second prompt would go to
    /// `/lang/sports/stream` as a new screen instead of editing the one on screen.
    @Test func aSecondPromptFollowsUpOnTheShownDocument() async throws {
        let stream = FakeOpenUIStream([
            [.done(text: "Chelsea season", document: "doc", revision: 1)],
            [.done(text: "Chelsea last five", document: "doc", revision: 2)],
        ])
        let model = AskModel(service: stream)

        model.prompt = "How has Chelsea done this season?"
        await model.send()
        model.prompt = "only the last five matches"
        await model.send()

        #expect(stream.requests.map(\.documentID) == [nil, "doc"])
        #expect(stream.requests.map(\.baseRevision) == [nil, 1])
        #expect(model.session?.shownText == "Chelsea last five")
        #expect(model.errorMessage == nil)
    }

    /// A follow-up must land on the next revision of the shown document. Anything else is a
    /// stale write: it fails, and the screen keeps what the user was looking at.
    @Test(arguments: [
        OpenUIDocumentVersion(id: "doc", revision: 3),
        OpenUIDocumentVersion(id: "other", revision: 2),
    ])
    func aFollowUpOnTheWrongRevisionKeepsTheScreen(answer: OpenUIDocumentVersion) async throws {
        let stream = FakeOpenUIStream([
            [.done(text: "Chelsea season", document: "doc", revision: 1)],
            [.done(text: "stale", document: answer.id, revision: answer.revision)],
        ])
        let session = try OpenUISession(service: stream)
        try await session.ask("How has Chelsea done this season?")

        await #expect(throws: OpenUIError.staleRevision) {
            try await session.ask("only the last five matches")
        }
        #expect(session.shownText == "Chelsea season")
        #expect(session.document == OpenUIDocumentVersion(id: "doc", revision: 1))
    }
}
