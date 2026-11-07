import Foundation
import Testing
@testable import OpenUIGen

/// Compiler parity with the server. Every program in `catalog/openui/fixtures.json` (written by
/// `npm run openui:export`) must compile, over its own dataset, to the element tree the server's
/// lang-core evaluation produced: the same kinds, properties and children in the same order.
struct OpenUIFixtureTests {
    struct Fixture: Decodable, CustomTestStringConvertible {
        let key: String
        let program: String
        let dataset: OpenUIDataset
        let expected: PValue

        var testDescription: String { key }
    }

    private struct Suite: Decodable {
        let fixtures: [Fixture]
    }

    private static let suite = Result {
        let url = try #require(Bundle(for: BundleToken.self).url(forResource: "fixtures", withExtension: "json"))
        return try JSONDecoder().decode(Suite.self, from: Data(contentsOf: url))
    }

    static let fixtures = (try? suite.get().fixtures) ?? []

    @Test func bundlesTheFixtures() throws {
        #expect(try !Self.suite.get().fixtures.isEmpty)
    }

    @Test(arguments: fixtures)
    func compilesToTheServersTree(_ fixture: Fixture) throws {
        let scene = try OpenUICompiler().compile(
            program: fixture.program,
            documentID: "fixture",
            datasets: [fixture.dataset]
        )
        let root = try #require(scene.roots.first)
        let tree = Self.tree(root, in: scene)
        if tree != fixture.expected {
            Issue.record("\(Self.difference(tree, fixture.expected, at: "root") ?? "The trees differ")")
        }
    }

    /// The same samples called by name, `pick1 = MatchCard(d.answers.q1.record)`, through the bundled
    /// templates: the same tree, and the same element ids as the expanded program.
    @Test(arguments: fixtures.filter { fixture in
        OpenUITemplate.bundled().contains { fixture.key.hasPrefix($0.name + "/") }
    })
    func compilesComponentCallsByName(_ fixture: Fixture) throws {
        let name = String(fixture.key.prefix { $0 != "/" })
        let head = fixture.program.split(separator: "\n").prefix(2).joined(separator: "\n")
        let called = try OpenUICompiler().compile(
            program: head + "\npick1 = \(name)(d.answers.q1.record)\n",
            documentID: "fixture",
            datasets: [fixture.dataset]
        )
        let expanded = try OpenUICompiler().compile(
            program: fixture.program,
            documentID: "fixture",
            datasets: [fixture.dataset]
        )
        let root = try #require(called.roots.first)
        if Self.tree(root, in: called) != fixture.expected {
            Issue
                .record(
                    "\(Self.difference(Self.tree(root, in: called), fixture.expected, at: "root") ?? "The trees differ")"
                )
        }
        #expect(Set(called.elements.keys) == Set(expanded.elements.keys))
    }

    /// The caller's @Each item is not the template's own: Leaderboard draws its entries with "e" too.
    @Test func templateScopeIsItsOwn() throws {
        let fixture = try #require(Self.fixtures.first { $0.key == "Leaderboard/full" })
        let board = try #require(fixture.dataset.result["answers"]?["q1"]?["record"])
        let dataset = OpenUIDataset(
            args: .object(["run": .string("scope")]),
            result: .object(["boards": .list([board, board])])
        )
        let scene = try OpenUICompiler().compile(
            program: """
            root = Screen([pick1])
            d = Query("sports_dataset", {run: "scope"}, {})
            pick1 = Stack("v", 12, @Each(d.boards, "e", Leaderboard(e)))
            """,
            documentID: "scope",
            datasets: [dataset]
        )
        let entries = board["entries"]?.listValue?.count ?? 0
        #expect(scene.elements.values.filter { $0.kind == "Row" }.count == 2 * entries)
    }

    /// A copy param replaces its default; null keeps the record's.
    @Test func copyParamsReplaceTheirDefault() throws {
        let fixture = try #require(Self.fixtures.first { $0.key == "MetricBars/full" })
        let head = fixture.program.split(separator: "\n").prefix(2).joined(separator: "\n")
        let texts = { (args: String) throws -> [PValue] in
            try OpenUICompiler().compile(
                program: head + "\npick1 = MetricBars(d.answers.q1.record\(args))\n",
                documentID: "params",
                datasets: [fixture.dataset]
            ).elements.values.filter { $0.kind == "Text" }.compactMap { $0.properties["content"] }
        }
        let heading = try #require(fixture.dataset.result["answers"]?["q1"]?["record"]?["heading"])
        #expect(try texts(", null").contains(heading))
        #expect(try texts(", \"Points per game\"").contains(.string("Points per game")))
        #expect(try !texts(", \"Points per game\"").contains(heading))
    }

    /// `StatsCard(record, false)` draws only the stat rail; null keeps the header.
    @Test func statsCardHeaderFlag() throws {
        let fixture = try #require(Self.fixtures.first { $0.key == "StatsCard/full" })
        let head = fixture.program.split(separator: "\n").prefix(2).joined(separator: "\n")
        let name = try #require(fixture.dataset.result["answers"]?["q1"]?["record"]?["name"])
        let scene = { (args: String) throws -> OpenUIScene in
            try OpenUICompiler().compile(
                program: head + "\npick1 = StatsCard(d.answers.q1.record\(args))\n",
                documentID: "flag",
                datasets: [fixture.dataset]
            )
        }
        /// Texts under a Show that is open, as the renderer draws them.
        func shown(_ scene: OpenUIScene) -> [PValue] {
            var texts: [PValue] = []
            func walk(_ id: OpenUIElementID) {
                guard let element = scene.elements[id] else { return }
                if element.kind == "Show", element.properties["when"] != .bool(true) { return }
                if element.kind == "Text", let content = element.properties["content"] { texts.append(content) }
                element.slots.values.flatMap(\.self).forEach(walk)
            }
            scene.roots.forEach(walk)
            return texts
        }
        #expect(try shown(scene(", null")).contains(name))
        #expect(try !shown(scene(", false")).contains(name))
    }

    /// `{kind, properties, slots}` without null properties or empty slots, as the export writes it.
    private static func tree(_ id: OpenUIElementID, in scene: OpenUIScene) -> PValue {
        guard let element = scene.elements[id] else { return .null }
        let slots = element.slots.filter { !$0.value.isEmpty }.mapValues { ids in
            PValue.list(ids.map { tree($0, in: scene) })
        }
        return .object([
            "kind": .string(element.kind),
            "properties": .object(element.properties.filter { $0.value != .null }),
            "slots": .object(slots),
        ])
    }

    /// The first place two trees differ, so a failure names the element and property.
    private static func difference(_ actual: PValue, _ expected: PValue, at path: String) -> String? {
        switch (actual, expected) {
        case let (.object(lhs), .object(rhs)):
            for key in Set(lhs.keys).union(rhs.keys).sorted() {
                let step = expected["kind"]?.stringValue.map { "\(path)(\($0)).\(key)" } ?? "\(path).\(key)"
                guard let left = lhs[key], let right = rhs[key] else {
                    let swift = lhs[key].map { "\($0)" } ?? "nothing", server = rhs[key].map { "\($0)" } ?? "nothing"
                    return "\(step): Swift has \(swift), the server has \(server)"
                }
                if let found = difference(left, right, at: step) { return found }
            }
            return nil
        case let (.list(lhs), .list(rhs)) where lhs.count == rhs.count:
            return zip(lhs, rhs).enumerated().lazy.compactMap { difference($1.0, $1.1, at: "\(path)[\($0)]") }.first
        default:
            return actual == expected ? nil : "\(path): Swift has \(actual), the server has \(expected)"
        }
    }
}

private final class BundleToken {}
