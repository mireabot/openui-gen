import Charts
import SwiftUI

struct ColorCellPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let size = props.cgFloat("size")
        RoundedRectangle(cornerRadius: 4)
            .fill(fill)
            .aspectRatio(1, contentMode: .fit)
            .frame(width: size, height: size)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(props.string("label") ?? "")
            .accessibilityAddTraits(.isImage)
    }

    private var fill: Color {
        if let color = props.string("color"),
           color.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil,
           let resolved = palette.value(color)
        {
            return resolved
        }
        return palette.color(token: props.string("fill") ?? "surface.filled")
    }
}

// MARK: Progress

/// `Progress(@value, style, tone?, label?, caption?)`: value is 0–100.
struct ProgressPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let fraction = min(max((props.number("value") ?? 0) / 100, 0), 1)
        if props.string("style") == "ring" {
            ring(fraction)
        } else {
            bar(fraction)
        }
    }

    private var fill: Color {
        if let tone = props.string("tone") { return palette.tone(tone) }
        return palette.color(token: palette.theme?.spec("Progress", "bar.fill")?.stringValue ?? "surface.brand")
    }

    private var track: Color {
        palette.color(token: palette.theme?.spec("Progress", "track.fill")?.stringValue ?? "surface.control")
    }

    private func ring(_ fraction: Double) -> some View {
        VStack(spacing: 4) {
            ZStack {
                Circle().stroke(track, lineWidth: 6)
                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(fill, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 58, height: 58)
            .padding(3)
            if let label = props.string("label") {
                Text(label).primitiveFont(.footnote).foregroundStyle(palette.color(token: "ink.secondary"))
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue(Text(fraction, format: .percent.precision(.fractionLength(0))))
    }

    private func bar(_ fraction: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let label = props.string("label") {
                Text(label).primitiveFont(.footnote, weight: .medium)
                    .foregroundStyle(palette.color(token: "ink.primary"))
            }
            Capsule()
                .fill(track)
                .frame(height: 8)
                .overlay(alignment: .leading) {
                    WeightedRowLayout(weights: [fraction, 1 - fraction], spacing: 0) {
                        Capsule().fill(fill)
                        Color.clear
                    }
                }
                .clipShape(.capsule)
            if let caption = props.string("caption") {
                Text(caption).primitiveFont(.footnote).foregroundStyle(palette.color(token: "ink.tertiary"))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityValue(Text(fraction, format: .percent.precision(.fractionLength(0))))
    }
}

// MARK: Bars

/// `Bars(@series, selectable?, average?, selected?, values?, style?)` on Swift Charts. Tap selects a
/// bar; a horizontal drag scrubs across them with the readout above the chart, as on PriceChart.
struct BarsPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @State private var selection: Int?
    @State private var scrubbing = false

    /// A horizontal bar's band height.
    private static let row: CGFloat = 28

    struct Bar: Identifiable {
        let id: Int
        let label: String
        let value: Double
        /// A unique category per bar: labels can repeat (T, T in a week).
        var key: String { "\(id)" }
    }

    var body: some View {
        let bars = series
        let look = ChartLook(props.value("style"))
        let horizontal = look.orientation == "horizontal"
        let peak = max(1, bars.map(\.value).max() ?? 1)
        let selected = selection ?? props.int("selected") ?? -1
        let lit: Int = switch look.highlight {
        case "none": -1
        case "max": bars.firstIndex { $0.value == peak } ?? -1
        case "last": bars.count - 1
        default: selected
        }
        VStack(alignment: .leading, spacing: 8) {
            if props.flag("selectable") || scrubbing { readout(bars, index: scrubbing ? selected : -1) }
            if horizontal {
                // Labels lead each row in their own column, one 28 pt band per bar, so they always
                // sit beside their bar (axis labels on a categorical y axis don't).
                HStack(alignment: .top, spacing: 12) {
                    if look.axis != "none", look.axis != "y" {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(bars) { bar in
                                Text(bar.label)
                                    .primitiveFont(.footnote)
                                    .foregroundStyle(palette.ink("tertiary"))
                                    .lineLimit(1)
                                    .frame(height: Self.row)
                                    .geometryGroup()
                            }
                        }
                    }
                    chart(bars, look: look, horizontal: true, lit: lit, peak: peak)
                        .frame(height: CGFloat(bars.count) * Self.row)
                }
            } else {
                chart(bars, look: look, horizontal: false, lit: lit, peak: peak)
                    .frame(height: 128)
            }
        }
        .animation(.snappy, value: lit)
    }

    private func chart(_ bars: [Bar], look: ChartLook, horizontal: Bool, lit: Int, peak: Double) -> some View {
        let radius: CGFloat = switch look.corners {
        case "square": 0
        case "soft": PrimitiveMetrics.innerRadius
        default: PrimitiveMetrics.pill
        }
        let rest = look.ink.map { palette.ink($0) } ?? palette.color(token: "surface.control")
        let showsValues = props.flag("values")
        let labels = look.axis != "none" && look.axis != "y"
        let valueAxis = look.axis == "y" || look.axis == "both"
        return Chart {
            ForEach(bars) { bar in
                let fill = bar.id == lit ? palette.color(token: "surface.brand") : rest
                let width: MarkDimension = .ratio(bar.id == lit ? 0.8 : 0.55)
                if horizontal {
                    BarMark(x: .value("Value", bar.value), y: .value("Bar", bar.key), height: width)
                        .clipShape(.rect(cornerRadius: radius))
                        .foregroundStyle(fill)
                        .annotation(position: .trailing, spacing: 6) {
                            if showsValues { valueLabel(bar.value, emphasised: bar.id == lit) }
                        }
                } else {
                    BarMark(x: .value("Bar", bar.key), y: .value("Value", bar.value), width: width)
                        .clipShape(.rect(cornerRadius: radius))
                        .foregroundStyle(fill)
                        .annotation(position: .top, spacing: 4) {
                            if showsValues { valueLabel(bar.value, emphasised: bar.id == lit) }
                        }
                }
            }
            if props.flag("average"), !bars.isEmpty {
                let average = bars.map(\.value).reduce(0, +) / Double(bars.count)
                if horizontal {
                    RuleMark(x: .value("Average", average))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4])).foregroundStyle(palette.ink("tertiary"))
                } else {
                    RuleMark(y: .value("Average", average))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4])).foregroundStyle(palette.ink("tertiary"))
                }
            }
        }
        .chartXAxis {
            if horizontal { valueMarks(grid: look.grid, labels: valueAxis) } else { categoryMarks(bars, show: labels) }
        }
        .chartYAxis {
            // Horizontal bars carry their labels in a column beside the chart.
            if !horizontal { valueMarks(grid: look.grid, labels: valueAxis) }
        }
        .chartLegend(.hidden)
        .chartOverlay { proxy in
            GeometryReader { frame in
                Rectangle().fill(.clear).contentShape(.rect)
                    .onTapGesture { location in
                        guard props.flag("selectable"),
                              let index = index(at: location, proxy: proxy, frame: frame, horizontal: horizontal)
                        else { return }
                        selection = selection == index ? -1 : index
                    }
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 12)
                            .onChanged { drag in
                                guard props.flag("selectable"),
                                      horizontal ? abs(drag.translation.height) > abs(drag.translation.width) :
                                      abs(drag.translation.width) > abs(drag.translation.height),
                                      let index = index(
                                          at: drag.location,
                                          proxy: proxy,
                                          frame: frame,
                                          horizontal: horizontal
                                      ) else { return }
                                scrubbing = true
                                selection = index
                            }
                            .onEnded { _ in scrubbing = false }
                    )
            }
        }
        // Resolve the chart and its labels as one geometry during parent movement.
        .geometryGroup()
        .accessibilityElement(children: .combine)
    }

    private func index(at location: CGPoint, proxy: ChartProxy, frame: GeometryProxy, horizontal: Bool) -> Int? {
        let origin = proxy.plotFrame.map { frame[$0].origin } ?? .zero
        let key: String? = horizontal ? proxy.value(atY: location.y - origin.y) : proxy
            .value(atX: location.x - origin.x)
        return key.flatMap(Int.init)
    }

    private func valueLabel(_ value: Double, emphasised: Bool) -> some View {
        Text(PrimitiveNumberFormat(kind: .count).string(value))
            .primitiveFont(.footnote, weight: emphasised ? .medium : .regular)
            .foregroundStyle(palette.color(token: emphasised ? "ink.primary" : "ink.tertiary"))
            .lineLimit(1)
            .geometryGroup()
    }

    private func categoryMarks(_ bars: [Bar], show: Bool) -> some AxisContent {
        AxisMarks(position: .bottom) { value in
            if show {
                // Centred under its bar.
                AxisValueLabel(centered: true) {
                    if let key = value.as(String.self), let index = Int(key), bars.indices.contains(index) {
                        Text(bars[index].label)
                            .primitiveFont(.footnote)
                            .foregroundStyle(palette.ink("tertiary"))
                            .geometryGroup()
                    }
                }
            }
        }
    }

    private func valueMarks(grid: Bool, labels: Bool) -> some AxisContent {
        AxisMarks(values: .automatic(desiredCount: 3)) { value in
            if grid { AxisGridLine().foregroundStyle(palette.color(token: "outline.subtle")) }
            if labels {
                AxisValueLabel {
                    if let number = value.as(Double.self) {
                        Text(PrimitiveNumberFormat(kind: .count).string(number)).primitiveFont(.footnote)
                            .foregroundStyle(palette.ink("tertiary"))
                    }
                }
            }
        }
    }

    /// Above the chart: the scrubbed (or selected) bar's label and value; its space is kept.
    private func readout(_ bars: [Bar], index: Int) -> some View {
        let shown = bars.indices.contains(index) ? bars[index] : bars.indices
            .contains(selection ?? -1) ? bars[selection!] : nil
        return HStack {
            Text(shown.map { PrimitiveNumberFormat(kind: .decimal).string($0.value) } ?? " ")
            Spacer()
            Text(shown?.label ?? "").foregroundStyle(palette.ink("secondary"))
        }
        .primitiveFont(.footnote)
        .monospacedDigit()
        .opacity(shown == nil ? 0 : 1)
    }

    private var series: [Bar] {
        props.list("series").enumerated().map { index, item in
            Bar(
                id: index,
                label: item["label"].flatMap(PrimitiveProps.text) ?? "",
                value: item["value"]?.numberValue ?? 0
            )
        }
    }
}

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

// MARK: Rating and Note

/// `Rating(@value, @count?, max?)`: stars in the brand ink.
struct RatingPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let maximum = max(1, props.int("max") ?? 5)
        let value = props.number("value") ?? 0
        let filled = Int(min(value, Double(maximum)).rounded())
        HStack(spacing: 4) {
            ForEach(0 ..< maximum, id: \.self) { star in
                SymbolGlyph(name: star < filled ? "star.fill" : "star", size: 16)
                    .foregroundStyle(palette.color(token: "ink.brand"))
            }
            if let count = props.number("count") {
                Text("(\(PrimitiveNumberFormat(kind: .count).string(count)))")
                    .primitiveFont(.footnote)
                    .foregroundStyle(palette.color(token: "ink.tertiary"))
            }
        }
        .accessibilityElement(children: .ignore)
    }
}

/// `Note(text, tone?, title?, icon?)`: a tinted message, radius 12, padding 12.
struct NotePrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        HStack(alignment: .top, spacing: PrimitiveMetrics.labelGap) {
            if let icon = props.string("icon") { SymbolGlyph(name: icon, size: 24) }
            VStack(alignment: .leading, spacing: 0) {
                if let title = props.string("title") {
                    Text(title).primitiveFont(.footnote, weight: .semibold)
                }
                Text(props.string("text") ?? "").primitiveFont(.footnote, weight: .medium)
            }
            Spacer(minLength: 0)
        }
        .padding(PrimitiveMetrics.labelGap)
        .frame(maxWidth: .infinity, alignment: .leading)
        .primitiveSurface(
            palette.look("Note", "tones.\(props.string("tone") ?? "neutral")"),
            radius: PrimitiveMetrics.controlRadius
        )
        .accessibilityElement(children: .combine)
    }
}
