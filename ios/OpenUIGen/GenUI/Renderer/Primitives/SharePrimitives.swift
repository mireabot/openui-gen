import Charts
import SwiftUI

// MARK: ShareBar

/// `ShareBar(@parts, legend?, selectable?, style?)`: a pill track split into coloured parts (or a
/// donut / pie on Swift Charts), with a legend.
struct ShareBarPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @State private var selection: Int?

    struct Part: Identifiable {
        let id: Int
        let label: String
        let value: Double
        let color: Color
        let detail: String
    }

    var body: some View {
        let parts = parts
        let total = max(parts.map(\.value).reduce(0, +), .leastNonzeroMagnitude)
        VStack(alignment: .leading, spacing: PrimitiveMetrics.labelGap) {
            switch ChartLook(props.value("style")).shape {
            case let shape? where shape == "donut" || shape == "pie":
                // SectorMark: 1.5° gaps, inner radius 0.62 for the donut; 160 square, centred.
                Chart(parts) { part in
                    SectorMark(
                        angle: .value("Share", part.value),
                        innerRadius: .ratio(shape == "donut" ? 0.62 : 0),
                        angularInset: parts.count > 1 ? 1.5 : 0
                    )
                    .cornerRadius(PrimitiveMetrics.innerRadius)
                    .foregroundStyle(part.color)
                    .opacity(selection == nil || selection == part.id ? 1 : 0.3)
                }
                .chartLegend(.hidden)
                .frame(width: 160, height: 160)
                .frame(maxWidth: .infinity)
            default:
                WeightedRowLayout(weights: parts.map { CGFloat($0.value) }, spacing: 0) {
                    ForEach(parts) { part in
                        Rectangle().fill(part.color).opacity(selection == nil || selection == part.id ? 1 : 0.3)
                    }
                }
                .frame(height: 16)
                .background(palette.color(token: "surface.control"))
                .clipShape(.capsule)
            }
            if props.bool("legend") ?? true {
                if props.flag("selectable") {
                    VStack(spacing: 4) {
                        ForEach(parts) { part in
                            Button { selection = selection == part.id ? nil : part.id } label: {
                                HStack(spacing: 8) {
                                    Circle().fill(part.color).frame(width: 8, height: 8)
                                    Text(part.label).frame(maxWidth: .infinity, alignment: .leading)
                                    Text(part.detail).foregroundStyle(palette.ink("secondary"))
                                    Text(
                                        "\((100 * part.value / total).formatted(.number.precision(.fractionLength(1))))%"
                                    )
                                }
                                .primitiveFont(.footnote)
                                .monospacedDigit()
                                .foregroundStyle(palette.ink("primary"))
                                .padding(.horizontal, 8)
                                .frame(minHeight: 44)
                                .background(
                                    selection == part.id ? palette.color(token: "surface.control") : .clear,
                                    in: .rect(cornerRadius: 8)
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(selection == part.id ? .isSelected : [])
                        }
                    }
                } else {
                    FlowLayout(spacing: 8) {
                        ForEach(parts) { part in
                            HStack(spacing: 6) {
                                Circle().fill(part.color).frame(width: 8, height: 8)
                                Text("\(part.label) \(Int((100 * part.value / total).rounded()))%")
                                    .primitiveFont(.footnote)
                                    .foregroundStyle(palette.color(token: "ink.secondary"))
                            }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: props.flag("selectable") ? .contain : .combine)
    }

    private var parts: [Part] {
        props.list("parts").enumerated().map { index, item in
            Part(
                id: index,
                label: item["label"].flatMap(PrimitiveProps.text) ?? "",
                value: max(0, item["value"]?.numberValue ?? item["share"]?.numberValue ?? 0),
                color: palette.ink(item["ink"]?.stringValue),
                detail: item["detail"].flatMap(PrimitiveProps.text) ?? ""
            )
        }
    }
}

// MARK: SplitBar

/// `SplitBar(@sides, size?, dim?, legend?)`: how votes split between two or three sides, in the
/// data's order. A pill track where each side's width is its share of the votes, 2 pt apart.
struct SplitBarPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    struct Side: Identifiable {
        let id: Int
        let label: String
        let count: Double
        let tone: String
        /// A team's `#hex`; it wins over the tone when present.
        let color: String?
    }

    private static let gap: CGFloat = 2

    private func fill(_ side: Side) -> Color {
        side.color.flatMap { $0.hasPrefix("#") ? palette.value($0) : nil } ?? palette.tone(side.tone)
    }

    var body: some View {
        let sides = sides
        let shown = sides.filter(\.count.isNormal)
        let top = sides.map(\.count).max() ?? 0
        let winners = sides.filter { $0.count == top }.count
        let dims = props.flag("dim") && winners == 1
        let size = props.string("size")
        let height: CGFloat = size == "micro" ? 4 : size == "thin" ? 6 : 8
        // Each side's rectangle takes its share of the width (count / total), 2 pt apart.
        let total = max(shown.map(\.count).reduce(0, +), .leastNonzeroMagnitude)
        let bar = GeometryReader { geometry in
            let room = max(0, geometry.size.width - Self.gap * CGFloat(max(0, shown.count - 1)))
            HStack(spacing: Self.gap) {
                ForEach(shown) { side in
                    Rectangle()
                        .fill(fill(side))
                        .opacity(dims && side.count != top ? 0.35 : 1)
                        .frame(width: room * side.count / total)
                }
            }
        }
        .frame(width: size == "micro" ? 40 : nil, height: height)
        .frame(maxWidth: size == "micro" ? nil : .infinity, alignment: .leading)
        .clipShape(.capsule)
        .accessibilityElement(children: .ignore)

        if props.flag("legend") {
            VStack(alignment: .leading, spacing: 8) {
                bar
                HStack {
                    ForEach(shown) { side in
                        Text("\(side.label) \(Int(side.count))")
                            .foregroundStyle(fill(side))
                        if side.id != shown.last?.id { Spacer(minLength: 8) }
                    }
                }
                .primitiveFont(.footnote)
                .monospacedDigit()
            }
        } else {
            bar
        }
    }

    private var sides: [Side] {
        props.list("sides").enumerated().map { index, item in
            Side(
                id: index,
                label: item["label"].flatMap(PrimitiveProps.text) ?? "",
                count: max(0, item["count"]?.numberValue ?? 0),
                tone: item["tone"]?.stringValue ?? "neutral",
                color: item["color"]?.stringValue
            )
        }
    }
}
