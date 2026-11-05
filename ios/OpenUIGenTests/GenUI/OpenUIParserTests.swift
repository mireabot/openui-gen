import Foundation
import Testing
@testable import OpenUIGen

/// The server writes one statement per line with no `;`, and a writer fill repeats a hole
/// statement that the frame declared empty; the later one wins.
struct OpenUIParserTests {
    private static let program = """
    root = Screen([pick1, pick2])
    d = Query("sports_dataset", {run: "r1"}, {})
    pick1 = Section(pick1_title, [Grid("2", 12, @Each(d.rivals, "p", Card([Text(p.club, "body", "semibold", null, 1)])))], pick1_subtitle)
    pick1_title = ""
    pick1_subtitle = ""
    pick2 = Card([Text(d.fixture.when, "footnote", null, "secondary")])
    pick1_title = "Rivals & Fixtures"
    pick1_subtitle = "Rival form and the next fixture"

    """

    @Test func newlineSeparatedStatements() throws {
        var parser = OpenUIParser()
        let parsed = try parser.parse(Self.program)
        #expect(parsed.order == ["root", "d", "pick1", "pick1_title", "pick1_subtitle", "pick2"])
        #expect(parsed.statements["pick1_title"] == .literal(.string("Rivals & Fixtures")))
    }

    @Test func compilesTheStreamedProgram() throws {
        let dataset = OpenUIDataset(
            args: .object(["run": .string("r1")]),
            result: .object([
                "rivals": .list([.object(["club": .string("Arsenal")]), .object(["club": .string("Chelsea")])]),
                "fixture": .object(["when": .string("Arsenal · Wed, Oct 22")]),
            ])
        )
        let scene = try OpenUICompiler().compile(program: Self.program, documentID: "r1", datasets: [dataset])
        let screen = try #require(scene.roots.first.flatMap { scene.elements[$0] })
        #expect(screen.kind == "Screen")
        #expect(screen.slots.values.first?.count == 2)
        #expect(scene.elements.values.filter { $0.kind == "Text" }.count == 3)
    }

    @Test func aPartialStreamKeepsWholeStatements() throws {
        var parser = OpenUIParser()
        let cut = String(Self.program.prefix(while: { $0 != "@" }))
        let parsed = try parser.parse(cut, allowIncomplete: true)
        #expect(parsed.order == ["root", "d"])
    }
}
