import SwiftUI

/// The top blocks while a skeleton is in play. Slot i is skeleton block i until the tree's
/// i-th top block is complete, then it cross-fades to the real block.
///
/// - Before the top container's line arrives: every skeleton block, `skeleton.gap` apart.
/// - After: one slot per real top block (`PrimitiveTree.topBlocks`); a block past the
///   skeleton's count shimmers as a generic 64 pt box, and skeleton blocks past the real
///   count are dropped.
/// - Once streaming ends: no skeleton at all; an incomplete block draws what arrived.
struct SkeletonBlocks: View {
    let skeleton: PrimitiveSkeleton
    let isStreaming: Bool
    /// What to draw when the stream ended before the container arrived (a fragment).
    let fallbackIDs: [String]
    @Environment(\.primitiveTree) private var tree
    @Environment(\.primitiveHiddenIDs) private var hidden

    var body: some View {
        let settled = tree.isContainerSettled
        VStack(alignment: .leading, spacing: settled ? tree.topBlocks.gap : skeleton.gap) {
            // Slots are keyed by position: blocks only ever append while streaming, so
            // skeleton block i keeps its identity when the container line names its node.
            ForEach(slots(settled: settled)) { slot in
                BlockSlot(slot: slot, showsSkeleton: isStreaming && !(slot.nodeID.map(tree.isComplete) ?? false))
            }
        }
    }

    private func slots(settled: Bool) -> [Slot] {
        guard settled else {
            if isStreaming {
                return skeleton.blocks.enumerated().map { Slot(id: $0.offset, nodeID: nil, frame: $0.element) }
            }
            return fallbackIDs.enumerated().map { Slot(id: $0.offset, nodeID: $0.element, frame: Self.generic) }
        }
        return tree.topBlocks.ids.enumerated().compactMap { index, id in
            guard !hidden.contains(id) else { return nil }
            let frame = index < skeleton.blocks.count ? skeleton.blocks[index] : Self.generic
            return Slot(id: index, nodeID: id, frame: frame)
        }
    }

    /// For a block the skeleton did not foresee.
    static let generic = SkeletonFrame.box(.init(height: 64, radius: .points(PrimitiveMetrics.controlRadius)))

    struct Slot: Identifiable {
        let id: Int
        let nodeID: String?
        let frame: SkeletonFrame
    }
}

/// One block position: its skeleton, or the real node once it is complete.
private struct BlockSlot: View {
    let slot: SkeletonBlocks.Slot
    let showsSkeleton: Bool

    var body: some View {
        // One container keeps identity stable, so the swap cross-fades.
        ZStack(alignment: .topLeading) {
            if showsSkeleton {
                SkeletonBlockView(frame: slot.frame)
                    .transition(.opacity)
            } else if let id = slot.nodeID {
                PrimitiveNodeView(id: id)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
