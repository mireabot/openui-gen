import NukeUI
import SwiftUI
import UIKit

// MARK: - Shared

/// Columns per page: 5 or fewer on one page; else the largest of 5, 4, 3 that divides the count,
/// else the one leaving the fewest empty slots on the last page (16 → 4, 15 → 5, 9 → 3, 7 → 4).
func metricChunkSize(_ total: Int) -> Int {
    if total <= 5 { return max(total, 1) }
    if let even = [5, 4, 3].first(where: { total % $0 == 0 }) { return even }
    let empty = { (size: Int) in (size - total % size) % size }
    return [5, 4, 3].reduce(5) { empty($1) < empty($0) ? $1 : $0 }
}

/// Light colours take the dark screen ink; the rest the light on-brand ink (WCAG luminance).
private func isLight(_ hex: String?) -> Bool {
    guard let hex, hex.hasPrefix("#"), hex.count == 7, let value = Int(hex.dropFirst(), radix: 16) else { return false }
    let channel = { (shift: Int) -> Double in
        let level = Double((value >> shift) & 0xFF) / 255
        return level <= 0.03928 ? level / 12.92 : pow((level + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0) > 0.35
}

// MARK: - ValueColumns

/// `ValueColumns(columns)`: one metric across subjects. A value pill per column at its height on a
/// plot band, then the mark, name and caption. More than five page sideways with
/// `containerRelativeFrame(.horizontal, count: n)`, opening on the last page.
struct ValueColumnsPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    private static let plot: CGFloat = 152
    private static let gap: CGFloat = 8

    private struct Column: Identifiable {
        let id: Int
        let name: String
        let caption: String
        let value: Double
        let display: String
        let secondary: String
        let colorHex: String?
        let image: String?
        let kind: String
    }

    private var columns: [Column] {
        props.list("columns").enumerated().map { index, item in
            Column(
                id: index,
                name: item["name"]?.stringValue ?? "",
                caption: item["caption"]?.stringValue ?? "",
                value: item["value"]?.numberValue ?? 0,
                display: item["display"]?.stringValue ?? "",
                secondary: item["secondary"]?.stringValue ?? "",
                colorHex: item["color"]?.stringValue,
                image: item["logo"]?.stringValue,
                kind: item["kind"]?.stringValue ?? "club"
            )
        }
    }

    var body: some View {
        let columns = columns
        if !columns.isEmpty {
            let perPage = metricChunkSize(columns.count)
            let pages = Int((Double(columns.count) / Double(perPage)).rounded(.up))
            let top = max(columns.map(\.value).max() ?? 1, 0) > 0 ? columns.map(\.value).max()! : 1
            let hasSecondary = columns.contains { !$0.secondary.isEmpty }
            VStack(spacing: 12) {
                ZStack(alignment: .top) {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(palette.color(token: "surface.filled"))
                        .frame(height: Self.plot)
                    ScrollView(.horizontal) {
                        HStack(spacing: Self.gap) {
                            let marks = props.childReferences("marks")
                            ForEach(columns) { column in
                                columnView(
                                    column,
                                    mark: column.id < marks.count ? marks[column.id] : nil,
                                    top: top,
                                    hasSecondary: hasSecondary,
                                    leader: column.value > 0 && column.value == top
                                )
                                .containerRelativeFrame(.horizontal, count: perPage, spacing: Self.gap)
                                .id(column.id)
                            }
                        }
                        .scrollTargetLayout()
                    }
                    .scrollIndicators(.hidden)
                    .scrollTargetBehavior(.viewAligned(limitBehavior: .always))
                    .scrollDisabled(pages < 2)
                }
            }
        }
    }

    private func columnView(
        _ column: Column,
        mark: PrimitiveChild?,
        top: Double,
        hasSecondary: Bool,
        leader: Bool
    ) -> some View {
        let pill: CGFloat = hasSecondary ? 52 : 28
        let lift = CGFloat(max(column.value, 0) / top) * (Self.plot - pill - 16)
        let fill = palette.value(column.colorHex) ?? palette.color(token: "surface.brand")
        return VStack(spacing: 12) {
            ZStack(alignment: .bottom) {
                Rectangle()
                    .fill(palette.color(token: "outline.subtle"))
                    .frame(width: 1)
                    .frame(maxHeight: .infinity)
                // Its text's own width, clamped to 64...86 and to the column; a longer value wraps.
                ClampedWidth(min: 64, max: 86) {
                    VStack(spacing: 0) {
                        Text(column.display)
                            .primitiveFont(.body, weight: .semibold)
                            .monospacedDigit()
                            .foregroundStyle(
                                palette
                                    .color(token: isLight(column.colorHex) ? "surface.screen" : "ink.onBrand")
                            )
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .frame(maxWidth: .infinity)
                            .background(fill)
                        if hasSecondary {
                            Text(column.secondary.isEmpty ? "–" : column.secondary)
                                .primitiveFont(.footnote, weight: .medium)
                                .monospacedDigit()
                                .foregroundStyle(palette.color(token: "surface.screen"))
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .frame(maxWidth: .infinity)
                                .background(palette.color(token: "ink.primary"))
                        }
                    }
                }
                .clipShape(.rect(cornerRadius: 8))
                .padding(.bottom, 8 + lift)
            }
            .frame(height: Self.plot)
            VStack(spacing: 4) {
                if let mark { PrimitiveNodeView(id: mark) }
                // A long name wraps to a second centred line instead of being cut.
                Text(column.name)
                    .primitiveFont(.body, weight: leader ? .semibold : .regular)
                    .foregroundStyle(palette.ink("primary"))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                if !column.caption.isEmpty {
                    Text(column.caption)
                        .primitiveFont(.footnote, weight: .semibold)
                        .monospacedDigit()
                        .foregroundStyle(palette.ink("secondary"))
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }
            }
        }
    }
}

/// Proposes its child the child's own one-line width clamped to `min...max`, and never more than the
/// space offered (the column), so text wraps inside instead of spilling over its neighbours. The height
/// follows the wrapped text.
private struct ClampedWidth: Layout {
    var min: CGFloat
    var max: CGFloat

    private func width(_ subview: LayoutSubview, offered: CGFloat?) -> CGFloat {
        let ideal = subview.sizeThatFits(.unspecified).width
        return Swift.min(Swift.max(ideal, min), max, offered ?? .infinity)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let width = width(child, offered: proposal.width)
        return CGSize(width: width, height: child.sizeThatFits(ProposedViewSize(width: width, height: nil)).height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
    }
}
