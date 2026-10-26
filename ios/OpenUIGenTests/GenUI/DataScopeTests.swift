import Foundation
import Testing
@testable import OpenUIGen

struct DataScopeTests {
    private static let data: PValue = .object([
        "open": .object(["name": .string("NIKE"), "estimate": .number(0.12)]),
        "buckets": .list([
            .object(["label": .string("Food")]),
            .object(["label": .string("Rent")]),
        ]),
        "groups": .list([
            .object([
                "title": .string("A"),
                "items": .list([.object(["label": .string("a1")]), .object(["label": .string("a2")])]),
            ]),
            .object(["title": .string("B"), "items": .list([.object(["label": .string("b1")])])]),
        ]),
    ])

    private let scope = DataScope(data: Self.data)

    @Test
    func resolvesDottedPathsAndIndices() {
        #expect(scope.resolve("open.name") == .string("NIKE"))
        #expect(scope.resolve("open.estimate") == .number(0.12))
        #expect(scope.resolve("buckets[1].label") == .string("Rent"))
        #expect(scope.count(of: "buckets") == 2)
    }

    @Test
    func missingStepsResolveToNil() {
        #expect(scope.resolve("open.ticker") == nil)
        #expect(scope.resolve("buckets[5].label") == nil)
        #expect(scope.resolve("buckets[x]") == nil)
        #expect(scope.resolve("open.name.first") == nil)
        #expect(scope.resolve(".label") == nil, "no Repeat item outside a Repeat")
    }

    @Test
    func itemPathsReadTheCurrentRepeatItem() {
        let bucket = scope.entering("buckets", at: 0)
        #expect(bucket.resolve(".label") == .string("Food"))
        #expect(bucket.resolve("open.name") == .string("NIKE"), "absolute paths still read the document")
    }

    @Test
    func nestedRepeatsIterateItemFields() {
        let group = scope.entering("groups", at: 0)
        #expect(group.count(of: ".items") == 2)
        let item = group.entering(".items", at: 1)
        #expect(item.resolve(".label") == .string("a2"))
        #expect(item.frames.map(\.path) == ["groups", ".items"])
        #expect(item.frames.map(\.index) == [0, 1])
        #expect(scope.entering("groups", at: 1).entering(".items", at: 0).resolve(".label") == .string("b1"))
    }

    @Test
    func resolvesValuesDeeply() {
        let bucket = scope.entering("buckets", at: 1)
        #expect(bucket.resolve(PValue.data(".label")) == .string("Rent"))
        #expect(
            bucket
                .resolve(PValue.list([.data(".label"), .data(".nope"), .number(1)])) ==
                .list([.string("Rent"), .null, .number(1)])
        )
        #expect(bucket.resolve(PValue.string("literal")) == .string("literal"))
    }

    @Test func replacesNestedRepeatRecordsWithoutChangingTheSource() {
        let scope =
            DataScope(data: .object(["groups": .list([.object(["items": .list([.object(["value": .number(1)]),
                                                                               .object(["value": .number(2)])])])])]))
            .entering("groups", at: 0).entering(".items", at: 1)
        #expect(scope.absolutePath(".value") == "groups[0].items[1].value")
        let updated = scope.overriding(".value", with: .number(9))
        #expect(updated.resolve(".value") == .number(9))
        #expect(updated.resolve("groups[0].items[0].value") == .number(1))
        #expect(scope.resolve(".value") == .number(2))
    }
}
