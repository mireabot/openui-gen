import Foundation
import Testing
@testable import OpenUIGen

struct OpenUIImportedScreenTests {
    private static let program = #"""
    root = Screen([a])
    d = Query("sports_dataset", {run: "run-1"}, {})
    a = Text(d.title, "body")
    """#
    /// `program` as a JSON string.
    private static let quoted = #""root = Screen([a])\nd = Query(\"sports_dataset\", {run: \"run-1\"}, {})\n"# +
        #"a = Text(d.title, \"body\")""#

    /// Catches the web's formats drifting from this parser: any source it stops reading fails here.
    /// The snapshot's own run differs on purpose, because the program's run is the one the compiler
    /// looks up. Taking it from the snapshot would leave the screen with no data.
    @Test(arguments: [
        #"""
        {"savedAt": "2026-11-04", "id": "run-1", "revision": 1, "turns": [], "program": \#(quoted),
         "snapshot": {"tool": "sports_dataset", "args": {"run": "other"}, "result": {"title": "Hi"}, "fields": []}}
        """#,
        #"""
        {"prompt": "Table", "program": \#(quoted),
         "snapshot": {"tool": "sports_dataset", "args": {"run": "run-1"}, "result": {"title": "Hi"}}}
        """#,
        #"{"program": \#(quoted), "dataset": {"result": {"title": "Hi"}}}"#,
        #"{"program": \#(quoted), "result": {"title": "Hi"}}"#,
    ])
    func readsEveryAcceptedFormat(json: String) throws {
        let screen = try OpenUIImportedScreen(json: json)

        #expect(screen.program == Self.program)
        #expect(screen.dataset == OpenUIDataset(
            args: .object(["run": .string("run-1")]),
            result: .object(["title": .string("Hi")])
        ))
    }

    /// Each row is one thing a bad paste can be missing, and the message the user gets for it.
    @Test(arguments: [
        ("not json", OpenUIImportedScreen.Failure.invalidJSON),
        (#"[1, 2]"#, .missingProgram),
        (#"{"snapshot": {"result": {}}}"#, .missingProgram),
        (#"{"program": "  ", "snapshot": {"result": {}}}"#, .missingProgram),
        (#"{"program": \#(quoted)}"#, .missingSnapshot),
        (#"{"program": \#(quoted), "snapshot": null}"#, .missingSnapshot),
        (#"{"program": \#(quoted), "snapshot": {"result": 3}}"#, .missingSnapshot),
        (#"{"program": "root = Screen([])", "snapshot": {"result": {}}}"#, .missingQuery),
    ])
    func rejectsABadPaste(json: String, failure: OpenUIImportedScreen.Failure) {
        #expect(throws: failure) { try OpenUIImportedScreen(json: json) }
    }

    /// Catches a pasted screen reaching for the network: the fake records any request, and the
    /// fake's `query` throws, so the text can only come from the pasted snapshot.
    @MainActor
    @Test func aPastedScreenRendersFromItsOwnSnapshot() throws {
        let stream = FakeOpenUIStream([])
        let screen = try OpenUIImportedScreen(
            json: #"{"program": \#(Self.quoted), "snapshot": {"result": {"title": "Hi"}}}"#
        )
        let session = try OpenUISession(service: stream)

        try session.restore(OpenUIArchive(
            documentID: "pasted",
            revision: 1,
            origin: URL(filePath: "/"),
            program: screen.program,
            datasets: [screen.dataset]
        ))

        #expect(session.shownText == "Hi")
        #expect(stream.requests.isEmpty)
    }
}
