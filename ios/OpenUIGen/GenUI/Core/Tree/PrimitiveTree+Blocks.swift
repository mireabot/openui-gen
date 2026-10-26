import Foundation

/// The tree's top blocks: what `PrimitiveSkeleton.blocks` stands in for, one to one.
public struct PrimitiveTopBlocks: Sendable, Equatable {
    public let ids: [String]
    /// Gap between the blocks: the unwrapped Stack's, or 28 between root children.
    public let gap: Double

    public init(ids: [String], gap: Double) {
        self.ids = ids
        self.gap = gap
    }
}

public extension PrimitiveTree {
    /// The placement's children, unwrapped while there is exactly one child and it is a
    /// vertical Stack. Mirrors `topBlocks` in the backend's `src/dsl/skeleton.ts`.
    ///
    /// While streaming, a single child that is not defined yet may still turn out to be
    /// that Stack; `isContainerSettled` tells the two apart.
    var topBlocks: PrimitiveTopBlocks {
        var ids = rootIDs
        var gap = 28.0
        var seen: Set<String> = []
        while ids.count == 1, let only = node(ids[0]), only.primitive == "Stack",
              only.props["axis"] == .string("v"), seen.insert(only.id).inserted
        {
            gap = Self.number(only.props["gap"]) ?? 0
            ids = only.children["children"] ?? []
        }
        return PrimitiveTopBlocks(ids: ids, gap: gap)
    }

    /// True once the top container's line has arrived, so `topBlocks.ids` is final:
    /// there is a root, and the blocks are not one id still waiting for its line.
    var isContainerSettled: Bool {
        let ids = topBlocks.ids
        if ids.isEmpty { return placement != nil }
        return ids.count > 1 || node(ids[0]) != nil
    }

    /// Defined, and every descendant (through every node argument) defined too.
    func isComplete(_ id: String) -> Bool {
        var seen: Set<String> = []
        return isComplete(id, seen: &seen)
    }

    private func isComplete(_ id: String, seen: inout Set<String>) -> Bool {
        guard let node = node(id) else { return false }
        // A cycle is a validation issue elsewhere; here it just ends the walk.
        guard seen.insert(id).inserted else { return true }
        return node.childIDs.allSatisfy { isComplete($0, seen: &seen) }
    }

    /// A number prop, or a numeric string (`Grid("2", …)`), as the backend's `num` reads it.
    private static func number(_ value: PValue?) -> Double? {
        if let number = value?.numberValue { return number }
        if let string = value?.stringValue, !string.isEmpty { return Double(string) }
        return nil
    }
}
