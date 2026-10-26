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
