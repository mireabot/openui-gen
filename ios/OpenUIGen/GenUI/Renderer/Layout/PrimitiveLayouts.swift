import SwiftUI

/// Flows children left to right and wraps them into rows (ShareBar legend).
struct FlowLayout: Layout {
    var spacing: CGFloat

    /// Item indices per row for the given sizes in a container `width` wide. An item wider
    /// than the container gets a row of its own.
    static func rows(for sizes: [CGSize], width: CGFloat, spacing: CGFloat) -> [[Int]] {
        var rows: [[Int]] = []
        var current: [Int] = []
        var x: CGFloat = 0
        for (index, size) in sizes.enumerated() {
            let needed = current.isEmpty ? size.width : x + spacing + size.width
            if !current.isEmpty, needed > width {
                rows.append(current)
                current = [index]
                x = size.width
            } else {
                current.append(index)
                x = needed
            }
        }
        if !current.isEmpty { rows.append(current) }
        return rows
    }

    /// Each item at its own width, capped at the row: a phrase wider than the row wraps inside
    /// it instead of keeping its one-line width and running past the edge.
    static func sizes(_ subviews: Subviews, width: CGFloat?) -> [CGSize] {
        subviews.map { subview in
            let ideal = subview.sizeThatFits(.unspecified)
            guard let width, ideal.width > width else { return ideal }
            return subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
        }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        let sizes = Self.sizes(subviews, width: proposal.width)
        let width = proposal.width ?? .infinity
        let rows = Self.rows(for: sizes, width: width, spacing: spacing)
        let widest = rows.map { row in rowWidth(row, sizes) }.max() ?? 0
        let height = rows.map { row in row.map { sizes[$0].height }.max() ?? 0 }.reduce(0, +)
            + spacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? widest, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        let sizes = Self.sizes(subviews, width: bounds.width)
        var y = bounds.minY
        for row in Self.rows(for: sizes, width: bounds.width, spacing: spacing) {
            let height = row.map { sizes[$0].height }.max() ?? 0
            var x = bounds.minX
            for index in row {
                subviews[index].place(
                    at: CGPoint(x: x, y: y + (height - sizes[index].height) / 2),
                    proposal: ProposedViewSize(sizes[index])
                )
                x += sizes[index].width + spacing
            }
            y += height + spacing
        }
    }

    private func rowWidth(_ row: [Int], _ sizes: [CGSize]) -> CGFloat {
        row.map { sizes[$0].width }.reduce(0, +) + spacing * CGFloat(max(0, row.count - 1))
    }
}

/// Equal-width columns in rows (Grid). Each row is as tall as its tallest cell.
struct ColumnsLayout: Layout {
    var columns: Int
    var spacing: CGFloat
    var rowSpacing: CGFloat? = nil
    /// An extra first column this many columns wide, for a row label (a player's name); 0 for none.
    var lead: Int = 0

    static func columnWidth(container width: CGFloat, columns: Int, spacing: CGFloat) -> CGFloat {
        let count = CGFloat(max(1, columns))
        return max(0, (width - spacing * (count - 1)) / count)
    }

    /// Cells per row, including the lead column.
    private var perRow: Int { max(1, columns) + (lead > 0 ? 1 : 0) }

    /// Each column's width: equal units, with the lead column `lead` units wide.
    private func widths(container width: CGFloat) -> [CGFloat] {
        guard lead > 0 else {
            return Array(repeating: Self.columnWidth(container: width, columns: columns, spacing: spacing), count: perRow)
        }
        let unit = max(0, (width - spacing * CGFloat(perRow - 1)) / CGFloat(max(1, columns) + lead))
        return [unit * CGFloat(lead)] + Array(repeating: unit, count: max(1, columns))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        let width = proposal.width ?? idealWidth(subviews)
        let heights = rowHeights(subviews, widths: widths(container: width))
        return CGSize(width: width, height: heights.reduce(0, +) + (rowSpacing ?? spacing) * CGFloat(max(0, heights.count - 1)))
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        let widths = widths(container: bounds.width)
        let heights = rowHeights(subviews, widths: widths)
        var y = bounds.minY
        for (row, height) in heights.enumerated() {
            var x = bounds.minX
            for column in 0 ..< perRow {
                let index = row * perRow + column
                guard subviews.indices.contains(index) else { break }
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: widths[column], height: height))
                x += widths[column] + spacing
            }
            y += height + (rowSpacing ?? spacing)
        }
    }

    private func rowHeights(_ subviews: Subviews, widths: [CGFloat]) -> [CGFloat] {
        stride(from: 0, to: subviews.count, by: perRow).map { start in
            subviews[start ..< min(start + perRow, subviews.count)].enumerated()
                .map { offset, subview in subview.sizeThatFits(ProposedViewSize(width: widths[offset], height: nil)).height }
                .max() ?? 0
        }
    }

    private func idealWidth(_ subviews: Subviews) -> CGFloat {
        let widest = subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        let count = CGFloat(max(1, columns) + lead)
        return widest * count + spacing * CGFloat(perRow - 1)
    }
}

/// Splits the width between children in proportion to their weights (bar widths, share
/// segments). Children fill the proposed height.
struct WeightedRowLayout: Layout {
    var weights: [CGFloat]
    var spacing: CGFloat

    static func widths(container width: CGFloat, weights: [CGFloat], spacing: CGFloat) -> [CGFloat] {
        let total = weights.reduce(0, +)
        let available = max(0, width - spacing * CGFloat(max(0, weights.count - 1)))
        guard total > 0 else { return weights.map { _ in available / CGFloat(max(1, weights.count)) } }
        return weights.map { available * $0 / total }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        let widths = Self.widths(container: width, weights: resolvedWeights(subviews.count), spacing: spacing)
        let height = proposal.height ?? zip(subviews, widths)
            .map { $0.sizeThatFits(ProposedViewSize(width: $1, height: nil)).height }
            .max() ?? 0
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        let widths = Self.widths(container: bounds.width, weights: resolvedWeights(subviews.count), spacing: spacing)
        var x = bounds.minX
        for (subview, width) in zip(subviews, widths) {
            subview.place(
                at: CGPoint(x: x, y: bounds.minY),
                proposal: ProposedViewSize(width: width, height: bounds.height)
            )
            x += width + spacing
        }
    }

    private func resolvedWeights(_ count: Int) -> [CGFloat] {
        (0 ..< count).map { weights.indices.contains($0) ? weights[$0] : 1 }
    }
}

/// Takes the proposed width and lets its one child keep its ideal width, overflowing to the
/// trailing side: a rail drawn without a scroll view (static rendering).
struct LeadingOverflowLayout: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        let ideal = subviews.first?.sizeThatFits(ProposedViewSize(width: nil, height: proposal.height)) ?? .zero
        return CGSize(width: proposal.width ?? ideal.width, height: ideal.height)
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        guard let child = subviews.first else { return }
        let ideal = child.sizeThatFits(ProposedViewSize(width: nil, height: bounds.height))
        child.place(at: bounds.origin, proposal: ProposedViewSize(ideal))
    }
}
