import NukeUI
import SwiftUI
import UIKit

// MARK: - Shared

/// Columns per page: 5 or fewer on one page; else the largest of 5, 4, 3 that divides the count,
/// else the one leaving the fewest empty slots on the last page (16 → 4, 15 → 5, 9 → 3, 7 → 4).
func metricChunkSize(_ total: Int) -> Int {
    if total <= 5 { return max(total, 1) }
    if let even = [5, 4, 3].first(where: { total % $0 == 0 }) { return even }
    let empty = { (n: Int) in (n - total % n) % n }
    return [5, 4, 3].reduce(5) { empty($1) < empty($0) ? $1 : $0 }
}

/// A photo on its colour disc, a crest on nothing, or initials on the colour.
private struct MetricMark: View {
    let name: String
    let color: Color
    let image: String?
    let kind: String
    let size: CGFloat
    @Environment(\.primitiveMediaBaseURL) private var base
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let url = PrimitiveImages.url(image, base: base)
        LazyImage(url: url) { state in
            if let image = state.image {
                // The whole photo fits the frame and the disc fills all of it, so a wide headshot
                // still sits on a full circle instead of a cut band.
                image.resizable()
                    .scaledToFit()
                    .frame(width: size, height: size)
                    .background(kind == "club" ? Color.clear : color)
            } else {
                Text(Self.initials(name))
                    .primitiveFont(.footnote, weight: .semibold)
                    .foregroundStyle(palette.color(token: "ink.onBrand"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(color)
            }
        }
        .pipeline(PrimitiveImages.pipeline)
        .frame(width: size, height: size)
        .clipShape(.circle)
    }

    static func initials(_ name: String) -> String {
        let words = name.split(separator: " ")
        guard let first = words.first?.first else { return "" }
        guard words.count > 1, let last = words.last?.first else { return String(first).uppercased() }
        return "\(first)\(last)".uppercased()
    }
}

/// Light colours take the dark screen ink; the rest the light on-brand ink (WCAG luminance).
private func isLight(_ hex: String?) -> Bool {
    guard let hex, hex.hasPrefix("#"), hex.count == 7, let value = Int(hex.dropFirst(), radix: 16) else { return false }
    let channel = { (shift: Int) -> Double in
        let c = Double((value >> shift) & 0xFF) / 255
        return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
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
    @State private var position: Int?

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
                image: item["image"]?.stringValue,
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
                            ForEach(columns) { column in
                                columnView(column, top: top, hasSecondary: hasSecondary, leader: column.value > 0 && column.value == top)
                                    .containerRelativeFrame(.horizontal, count: perPage, spacing: Self.gap)
                                    .id(column.id)
                            }
                        }
                        .scrollTargetLayout()
                    }
                    .scrollIndicators(.hidden)
                    // Its own content height: a horizontal scroll view would otherwise cut the marks and names.
                    .fixedSize(horizontal: false, vertical: true)
                    .scrollTargetBehavior(.viewAligned(limitBehavior: .always))
                    .scrollPosition(id: $position, anchor: .leading)
                    .scrollDisabled(pages < 2)
                }
                if pages > 1 {
                    dots(pages: pages, perPage: perPage, count: columns.count)
                }
            }
            .onAppear { if pages > 1 { position = (pages - 1) * perPage } }
        }
    }

    private func columnView(_ column: Column, top: Double, hasSecondary: Bool, leader: Bool) -> some View {
        let pill: CGFloat = hasSecondary ? 52 : 28
        let lift = CGFloat(max(column.value, 0) / top) * (Self.plot - pill - 16)
        let fill = palette.value(column.colorHex) ?? palette.color(token: "surface.brand")
        return VStack(spacing: 12) {
            ZStack(alignment: .bottom) {
                Rectangle()
                    .fill(palette.color(token: "outline.subtle"))
                    .frame(width: 1)
                    .frame(maxHeight: .infinity)
                VStack(spacing: 0) {
                    Text(column.display)
                        .primitiveFont(.body, weight: .semibold)
                        .monospacedDigit()
                        .foregroundStyle(palette.color(token: isLight(column.colorHex) ? "surface.screen" : "ink.onBrand"))
                        .frame(width: 64, height: 28)
                        .background(fill)
                    if hasSecondary {
                        Text(column.secondary.isEmpty ? "–" : column.secondary)
                            .primitiveFont(.footnote, weight: .medium)
                            .monospacedDigit()
                            .foregroundStyle(palette.color(token: "surface.screen"))
                            .frame(width: 64, height: 24)
                            .background(palette.color(token: "ink.primary"))
                    }
                }
                .clipShape(.rect(cornerRadius: 8))
                .padding(.bottom, 8 + lift)
            }
            .frame(height: Self.plot)
            VStack(spacing: 4) {
                MetricMark(name: column.name, color: fill, image: column.image, kind: column.kind, size: 40)
                Text(column.name)
                    .primitiveFont(.body, weight: leader ? .semibold : .regular)
                    .foregroundStyle(palette.ink("primary"))
                    .lineLimit(1)
                if !column.caption.isEmpty {
                    Text(column.caption)
                        .primitiveFont(.footnote, weight: .semibold)
                        .monospacedDigit()
                        .foregroundStyle(palette.ink("secondary"))
                        .lineLimit(1)
                }
            }
        }
    }

    private func dots(pages: Int, perPage: Int, count: Int) -> some View {
        let current = min((position ?? (pages - 1) * perPage) / perPage, pages - 1)
        return HStack(spacing: 0) {
            ForEach(0 ..< pages, id: \.self) { page in
                Button {
                    withAnimation(.easeOut(duration: 0.25)) { position = page * perPage }
                } label: {
                    Circle()
                        .fill(palette.color(token: page == current ? "ink.primary" : "outline.control"))
                        .frame(width: 6, height: 6)
                        .frame(width: 16, height: 24)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - MetricLines

/// `MetricLines(lines, periods, from, to, style, kind, caption?, details?)`: up to four stepped lines
/// over the same periods, scrubbed like StepTimeline (hold 0.1 s, drag to snap). `player` shows one
/// metric's total, or a legend grid for several; `race` sorts one row per player at the scrub.
/// A line with one value draws flat across the plot; fewer than 5 values, while another line has more,
/// carry the last value to the end dotted.
struct MetricLinesPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var scrub: Int?
    @State private var focus: Int?
    @State private var revealed = false

    private static let axisWidth: CGFloat = 32
    private static let rowHeight: CGFloat = 48

    struct Line: Identifiable {
        let id: Int
        let label: String
        let color: Color
        let opacity: Double
        let values: [Double?]
        let decimals: Int
        let image: String?
        let photoColor: Color
        let note: String
        var present: Int { values.compactMap(\.self).count }
    }

    private var cumulative: Bool { props.string("kind") != "period" }
    private var race: Bool { props.string("style") == "race" }
    private var periods: [String] { props.list("periods").compactMap(\.stringValue) }

    private var lines: [Line] {
        props.list("lines").prefix(4).enumerated().map { index, item in
            let color = palette.value(item["color"]?.stringValue) ?? palette.ink("primary")
            return Line(
                id: index,
                label: item["label"]?.stringValue ?? "",
                color: color,
                opacity: item["opacity"]?.numberValue ?? 1,
                values: (item["values"]?.listValue ?? []).map(\.numberValue),
                decimals: Int(item["decimals"]?.numberValue ?? 0),
                image: item["image"]?.stringValue,
                photoColor: palette.value(item["photoColor"]?.stringValue) ?? color,
                note: item["note"]?.stringValue ?? ""
            )
        }
    }

    var body: some View {
        let lines = lines
        let count = max(periods.count, lines.map(\.values.count).max() ?? 0)
        if !lines.isEmpty, count >= 1 {
            let index = scrub ?? count - 1
            VStack(alignment: .leading, spacing: 16) {
                if race {
                    raceHeader(lines, index: index)
                } else if lines.count == 1 {
                    total(lines[0], index: index, last: count - 1)
                } else {
                    legend(lines, index: index)
                }
                plot(lines, count: count, index: index)
            }
            .sensoryFeedback(.selection, trigger: scrub) { _, new in new != nil }
            .onAppear { revealed = true }
        }
    }

    // MARK: Values

    /// The value a line shows at a period; a cumulative total carries through a gap.
    private func value(_ line: Line, at index: Int) -> (value: Double?, present: Bool) {
        let own = index < line.values.count ? line.values[index] : nil
        if own != nil || !cumulative { return (own, own != nil) }
        for i in stride(from: min(index, line.values.count) - 1, through: 0, by: -1) {
            if let earlier = line.values[i] { return (earlier, false) }
        }
        return (nil, false)
    }

    private func text(_ value: Double?, decimals: Int) -> String {
        guard let value else { return "–" }
        return String(format: "%.\(decimals)f", value)
    }

    private func period(_ index: Int) -> String {
        index < periods.count ? periods[index] : ""
    }

    // MARK: Headers

    private func total(_ line: Line, index: Int, last: Int) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(text(value(line, at: last).value, decimals: line.decimals))
                    .primitiveFont(.title1, weight: .semibold)
                    .monospacedDigit()
                    .foregroundStyle(palette.ink("primary"))
                Text(props.string("caption").flatMap { $0.isEmpty ? nil : $0 } ?? line.label)
                    .primitiveFont(.footnote)
                    .foregroundStyle(palette.ink("secondary"))
            }
            Spacer(minLength: 0)
            if scrub != nil {
                let details = props.list("details").compactMap(\.stringValue)
                let shown = value(line, at: index).value
                VStack(alignment: .trailing, spacing: 4) {
                    Text(period(index))
                        .primitiveFont(.footnote, weight: .semibold)
                        .foregroundStyle(palette.ink("primary"))
                    if !details.isEmpty {
                        let detail = index < details.count ? details[index] : ""
                        Text(detail.isEmpty && (index >= line.values.count || line.values[index] == nil) ? "Did not play" : detail)
                            .primitiveFont(.footnote)
                            .foregroundStyle(palette.ink("secondary"))
                    }
                    Text(cumulative ? "\(text(shown, decimals: line.decimals)) so far" : text(shown, decimals: line.decimals))
                        .primitiveFont(.footnote, weight: .semibold)
                        .monospacedDigit()
                        .foregroundStyle(palette.ink("secondary"))
                        .padding(.horizontal, 8)
                        .frame(height: 20)
                        .background(palette.color(token: "surface.filled"), in: .rect(cornerRadius: 4))
                }
                .fixedSize()
            }
        }
        .frame(minHeight: 72, alignment: .top)
    }

    private func legend(_ lines: [Line], index: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(cumulative ? "Running totals" : "Per period") · \(scrub == nil ? "after \(period(index).lowercased())" : period(index).lowercased())")
                .primitiveFont(.footnote)
                .monospacedDigit()
                .foregroundStyle(palette.ink("secondary"))
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(lines) { line in
                    let on = focus == line.id
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) { focus = on ? nil : line.id }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 8) {
                                Capsule().fill(line.color.opacity(line.opacity)).frame(width: 12, height: 3)
                                Text(line.label)
                                    .primitiveFont(.footnote)
                                    .foregroundStyle(palette.ink("secondary"))
                                    .lineLimit(1)
                            }
                            Text(text(value(line, at: index).value, decimals: line.decimals))
                                .primitiveFont(.title3, weight: .semibold)
                                .monospacedDigit()
                                .foregroundStyle(palette.ink("primary"))
                        }
                        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                        .padding(.horizontal, 12)
                        .background(palette.color(token: on ? "surface.filled" : "surface.card"), in: .rect(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(palette.color(token: on ? "outline.control" : "outline.subtle")))
                        .opacity(focus != nil && !on ? 0.5 : 1)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func raceHeader(_ lines: [Line], index: Int) -> some View {
        let values = lines.map { value($0, at: index) }
        let order = lines.indices.sorted { (values[$0].value ?? -1) > (values[$1].value ?? -1) }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(props.string("caption") ?? "")
                    .primitiveFont(.footnote)
                    .foregroundStyle(palette.ink("secondary"))
                Spacer(minLength: 12)
                Text("After \(period(index).lowercased())")
                    .primitiveFont(.footnote, weight: .medium)
                    .monospacedDigit()
                    .foregroundStyle(palette.ink(scrub == nil ? "secondary" : "primary"))
            }
            ZStack(alignment: .top) {
                ForEach(lines) { line in
                    let shown = values[line.id]
                    HStack(spacing: 12) {
                        MetricMark(name: line.label, color: line.photoColor, image: line.image, kind: "player", size: 32)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(line.label)
                                .primitiveFont(.body, weight: .medium)
                                .foregroundStyle(palette.ink("primary"))
                                .lineLimit(1)
                            Text(shown.present || shown.value == nil ? line.note : "\(line.note) · did not play")
                                .primitiveFont(.footnote)
                                .foregroundStyle(palette.ink("secondary"))
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        Text(text(shown.value, decimals: line.decimals))
                            .primitiveFont(.title3, weight: .semibold)
                            .monospacedDigit()
                            .foregroundStyle(palette.ink("primary"))
                    }
                    .frame(height: Self.rowHeight)
                    .offset(y: CGFloat(order.firstIndex(of: line.id) ?? 0) * Self.rowHeight)
                    .animation(reduceMotion ? nil : .timingCurve(0.23, 1, 0.32, 1, duration: 0.2), value: order)
                }
            }
            .frame(height: Self.rowHeight * CGFloat(lines.count), alignment: .top)
        }
    }

    // MARK: Plot

    private func plot(_ lines: [Line], count: Int, index: Int) -> some View {
        let height: CGFloat = race ? 200 : 220
        let top = Self.ticks(max(lines.flatMap { $0.values.compactMap(\.self) }.max() ?? 1, 1)).last ?? 1
        return VStack(spacing: 8) {
            GeometryReader { proxy in
                let width = max(proxy.size.width - Self.axisWidth - 8, 0)
                let x = { (i: Int) -> CGFloat in count <= 1 ? 0 : CGFloat(i) / CGFloat(count - 1) * width }
                let y = { (v: Double) -> CGFloat in 8 + (1 - CGFloat(v / top)) * (height - 10) }
                ZStack(alignment: .topLeading) {
                    lineLayer(lines, count: count, x: x, y: y)
                        .opacity(0.3)
                    lineLayer(lines, count: count, x: x, y: y)
                        .mask(alignment: .leading) {
                            Rectangle().frame(width: scrub.map { x($0) + 2 } ?? width + 8)
                        }
                    if let scrub {
                        Path { path in
                            path.move(to: CGPoint(x: x(scrub), y: 0))
                            path.addLine(to: CGPoint(x: x(scrub), y: height))
                        }
                        .stroke(palette.ink("secondary"), style: StrokeStyle(lineWidth: 1, dash: [2, 3]))
                    }
                    ForEach(lines) { line in
                        if let shown = value(line, at: index).value {
                            Circle()
                                .fill(line.color.opacity(line.opacity))
                                .frame(width: 8, height: 8)
                                .padding(2)
                                .background(palette.color(token: "surface.screen"), in: .circle)
                                .opacity(focus != nil && focus != line.id ? 0.2 : 1)
                                .position(x: x(index), y: y(shown))
                        }
                    }
                    ForEach(Self.ticks(top), id: \.self) { tick in
                        Text(text(tick, decimals: tick.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1))
                            .primitiveFont(.footnote)
                            .monospacedDigit()
                            .foregroundStyle(palette.ink("tertiary"))
                            .frame(width: Self.axisWidth, alignment: .trailing)
                            .position(x: width + 8 + Self.axisWidth / 2, y: y(tick))
                    }
                }
                .mask(alignment: .leading) {
                    Rectangle()
                        .frame(width: revealed ? proxy.size.width : 0)
                        .animation(reduceMotion ? nil : .timingCurve(0.23, 1, 0.32, 1, duration: 0.6), value: revealed)
                }
                .contentShape(.rect)
                .gesture(MetricLinesPressGesture { location in
                    guard let location else { scrub = nil; return }
                    let fraction = width > 0 ? min(max(location.x / width, 0), 1) : 1
                    let next = Int((fraction * CGFloat(count - 1)).rounded())
                    if next != scrub { scrub = next }
                })
            }
            .frame(height: height)
            HStack {
                Text(props.string("from") ?? "")
                Spacer()
                Text(props.string("to") ?? "")
            }
            .primitiveFont(.footnote)
            .foregroundStyle(palette.ink("tertiary"))
            .padding(.trailing, Self.axisWidth + 8)
        }
    }

    private func lineLayer(_ lines: [Line], count: Int, x: @escaping (Int) -> CGFloat, y: @escaping (Double) -> CGFloat) -> some View {
        let ordered = lines.sorted { a, _ in a.id != focus }
        return ZStack(alignment: .topLeading) {
            ForEach(ordered) { line in
                let others = lines.filter { $0.id != line.id }.map(\.present).max() ?? 0
                let paths = Self.paths(line, count: count, others: others, x: x, y: y)
                let dim = focus != nil && focus != line.id ? 0.2 : 1
                ZStack {
                    paths.solid.stroke(line.color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    paths.dotted.stroke(line.color, style: StrokeStyle(lineWidth: 2, dash: [2, 3]))
                }
                .opacity(line.opacity * dim)
            }
        }
    }

    /// The solid steps and the dotted carry of one line.
    static func paths(_ line: Line, count: Int, others: Int, x: (Int) -> CGFloat, y: (Double) -> CGFloat) -> (solid: Path, dotted: Path) {
        let present = line.values.enumerated().compactMap { index, value in value.map { (index, $0) } }
        var solid = Path()
        var dotted = Path()
        if present.count == 1, let only = present.first {
            solid.move(to: CGPoint(x: x(0), y: y(only.1)))
            solid.addLine(to: CGPoint(x: x(count - 1), y: y(only.1)))
            return (solid, dotted)
        }
        for (index, value) in line.values.enumerated() {
            guard let value else { continue }
            let previous = index > 0 ? line.values[index - 1] : nil
            if previous == nil {
                solid.move(to: CGPoint(x: x(index), y: y(value)))
            } else {
                solid.addLine(to: CGPoint(x: x(index), y: y(value)))
            }
            let next = index + 1 < line.values.count ? line.values[index + 1] : nil
            if next != nil {
                solid.addLine(to: CGPoint(x: x(index + 1), y: y(value)))
            } else if previous == nil {
                // A point with gaps on both sides still shows, as a short tick.
                solid.move(to: CGPoint(x: x(index) - 2, y: y(value)))
                solid.addLine(to: CGPoint(x: x(index) + 2, y: y(value)))
            }
        }
        if let last = present.last, present.count < 5, others >= 5, last.0 < count - 1 {
            dotted.move(to: CGPoint(x: x(last.0), y: y(last.1)))
            dotted.addLine(to: CGPoint(x: x(count - 1), y: y(last.1)))
        }
        return (solid, dotted)
    }

    /// Zero and round steps up to just above the top, at most five labels.
    static func ticks(_ max: Double) -> [Double] {
        let size = pow(10, floor(log10(Swift.max(max, 1))))
        let step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5].map { $0 * size }.first { max / $0 <= 4 } ?? size * 10
        let count = Swift.max(1, Int(ceil(max / step - 1e-9)))
        return (0 ... count).map { (Double($0) * step * 100).rounded() / 100 }
    }
}

/// Hold for 0.1 s, then drag, so a vertical swipe that starts on the chart still scrolls the screen.
private struct MetricLinesPressGesture: UIGestureRecognizerRepresentable {
    var onChange: (CGPoint?) -> Void

    func makeUIGestureRecognizer(context _: Context) -> UILongPressGestureRecognizer {
        let recognizer = UILongPressGestureRecognizer()
        recognizer.minimumPressDuration = 0.1
        return recognizer
    }

    func handleUIGestureRecognizerAction(_ recognizer: UILongPressGestureRecognizer, context: Context) {
        switch recognizer.state {
        case .began, .changed:
            onChange(context.converter.localLocation)
        case .ended, .cancelled, .failed:
            onChange(nil)
        default:
            break
        }
    }
}
