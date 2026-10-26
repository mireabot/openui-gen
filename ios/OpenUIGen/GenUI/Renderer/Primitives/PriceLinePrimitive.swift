import Charts
import SwiftUI

/// A chart primitive's `style` object (catalog LINE_STYLE / BAR_STYLE / SHARE_STYLE). Each field
/// maps onto one Swift Charts modifier; unset fields keep the primitive's defaults.
struct ChartLook {
    let curve: String?
    let weight: String?
    let area: String?
    let points: String?
    let axis: String?
    let grid: Bool
    let domain: String?
    let ink: String?
    let orientation: String?
    let corners: String?
    let highlight: String?
    let shape: String?

    init(_ value: PValue?) {
        let field = { (key: String) in value?[key]?.stringValue }
        curve = field("curve")
        weight = field("weight")
        area = field("area")
        points = field("points")
        axis = field("axis")
        grid = value?["grid"]?.boolValue ?? false
        domain = field("domain")
        ink = field("ink")
        orientation = field("orientation")
        corners = field("corners")
        highlight = field("highlight")
        shape = field("shape")
    }

    /// `curve` → `interpolationMethod`: linear (default), monotone, smooth (Catmull-Rom), step.
    var interpolation: InterpolationMethod {
        switch curve {
        case "monotone": .monotone
        case "smooth": .catmullRom
        case "step": .stepCenter
        default: .linear
        }
    }

    /// `weight` → line width 1 · 2 (default) · 3.
    var lineWidth: CGFloat {
        switch weight {
        case "thin": 1
        case "bold": 3
        default: 2
        }
    }

    var showsXAxis: Bool { axis == "x" || axis == "both" }
    var showsYAxis: Bool { axis == "y" || axis == "both" }
}

/// Shared price plot for Sparkline and PriceChart, on Swift Charts. Both series share the exact
/// session scale. PriceChart scrubs: the readout sits above the plot (its space is kept, so
/// nothing jumps), the selected point is marked on the line, and with `measure` a tap pins a start.
struct PriceLinePrimitive: View {
    let props: PrimitiveProps
    let compact: Bool
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveStackAxis) private var axis
    @State private var hover: Int?
    @State private var pin: Int?

    struct Point: Identifiable {
        let id: Int
        let label: String
        let value: Double
        /// `pre`, `regular` or `after` for an intraday point; nil when the data has no sessions.
        var session: String?
    }

    /// A shaded pre-market or after-hours stretch, in point indexes.
    struct SessionBand: Identifiable {
        let start: Int
        let end: Int
        let session: String
        var id: Int { start }
        var label: String { session == "pre" ? "Pre-market" : "After hours" }
    }

    private func points(_ key: String) -> [Point] {
        // Ids are set after the filter, so they stay contiguous for the x scale.
        props.list(key).compactMap { item -> Point? in
            guard let value = item["value"]?.numberValue, value.isFinite else { return nil }
            return Point(
                id: 0, label: item["label"].flatMap(PrimitiveProps.text) ?? "", value: value,
                session: item["session"]?.stringValue
            )
        }
        .enumerated().map { offset, point in
            Point(id: offset, label: point.label, value: point.value, session: point.session)
        }
    }

    /// Each run of pre / after points, widened to share its boundary point with the regular
    /// session (as the line does) so the band meets the regular stretch. Same rule as the web.
    static func sessionBands(_ series: [Point]) -> [SessionBand] {
        var bands: [SessionBand] = []
        var index = 0
        while index < series.count {
            guard let session = series[index].session, session == "pre" || session == "after" else {
                index += 1
                continue
            }
            var last = index
            while last + 1 < series.count, series[last + 1].session == session {
                last += 1
            }
            let band = SessionBand(
                start: index > 0 ? index - 1 : index,
                end: last < series.count - 1 ? last + 1 : last,
                session: session
            )
            if band.end > band.start { bands.append(band) }
            index = last + 1
        }
        return bands
    }

    var body: some View {
        let series = points("points")
        if series.count >= 2 {
            let other = points("comparison")
            let aligned = other.count == series.count && zip(other, series)
                .allSatisfy { $0.label == $1.label } ? other : []
            VStack(alignment: .leading, spacing: 8) {
                if !compact { readout(series).opacity(hover == nil ? 0 : 1) }
                plot(series, aligned: aligned)
                if !compact { footer(series, aligned: aligned) }
            }
            .frame(width: compact && axis == .horizontal ? 72 : nil)
        } else if !compact {
            Text("Price history unavailable").primitiveFont(.footnote).foregroundStyle(palette.ink("secondary"))
        }
    }

    private func plot(_ series: [Point], aligned: [Point]) -> some View {
        let geometry = LineGeometry(
            series: series, aligned: aligned, look: ChartLook(props.value("style")), palette: palette,
            reference: props.number("reference"), compact: compact,
            threshold: compact || props.string("tone") == "threshold", fill: props.flag("fill")
        )
        return Chart {
            LinePlotContent(
                geometry: geometry, series: series, aligned: aligned, palette: palette,
                bands: compact || props.string("sessions") == "off" ? [] : Self.sessionBands(series),
                compact: compact, baseline: props.flag("baseline"), annotate: props.flag("annotate"),
                referenceLabel: compact ? nil : props.string("referenceLabel"),
                hover: compact ? nil : hover, pin: compact ? nil : pin, display: display
            )
        }
        .chartXScale(domain: 0 ... series.count - 1)
        .chartYScale(domain: geometry.floor ... geometry.ceiling)
        .chartXAxis {
            if !compact, geometry.look.showsXAxis {
                AxisMarks(values: [0, (series.count - 1) / 2, series.count - 1]) { value in
                    // The ends align inward so the first and last labels stay inside the plot.
                    let index = value.as(Int.self) ?? 0
                    AxisValueLabel(anchor: index == 0 ? .topLeading : index == series.count - 1 ? .topTrailing : .top) {
                        if let index = value.as(Int.self), series.indices.contains(index) {
                            Text(series[index].label).primitiveFont(.footnote).foregroundStyle(palette.ink("tertiary"))
                        }
                    }
                }
            }
        }
        .chartYAxis {
            if !compact, geometry.look.showsYAxis || geometry.look.grid {
                AxisMarks(position: .trailing, values: geometry.ticks) { value in
                    if geometry.look.grid { AxisGridLine().foregroundStyle(palette.color(token: "outline.subtle")) }
                    if geometry.look.showsYAxis {
                        AxisValueLabel {
                            if let tick = value.as(Double.self) {
                                Text(display(tick)).primitiveFont(.footnote).foregroundStyle(palette.ink("tertiary"))
                            }
                        }
                    }
                }
            }
        }
        .chartLegend(.hidden)
        .chartOverlay { proxy in
            if !compact { scrubSurface(proxy: proxy, count: series.count) }
        }
        .frame(height: compact ? 40 : props.string("height") == "compact" ? 120 : 200)
        .accessibilityElement(children: .ignore)
        .accessibilityValue(
            "\(series[0].label) \(display(series[0].value)) to \(series.last!.label) \(display(series.last!.value))"
        )
    }

    /// Drag anywhere on the plot to read a point; with `measure`, a tap pins the start.
    private func scrubSurface(proxy: ChartProxy, count: Int) -> some View {
        GeometryReader { frame in
            Rectangle().fill(.clear).contentShape(.rect)
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            let origin = proxy.plotFrame.map { frame[$0].origin.x } ?? 0
                            guard let index: Int = proxy.value(atX: value.location.x - origin) else { return }
                            hover = min(count - 1, max(0, index))
                        }
                        .onEnded { value in
                            if props.flag("measure"), abs(value.translation.width) < 3,
                               abs(value.translation.height) < 3
                            {
                                pin = hover
                            }
                            hover = nil
                        }
                )
        }
    }

    @ViewBuilder
    private func footer(_ series: [Point], aligned: [Point]) -> some View {
        if !aligned.isEmpty {
            HStack(spacing: 8) {
                Rectangle().fill(palette.ink("secondary")).frame(width: 20, height: 2)
                Text(props.string("comparisonLabel") ?? "Comparison").primitiveFont(.footnote)
                    .foregroundStyle(palette.ink("secondary"))
            }
        }
        if !ChartLook(props.value("style")).showsXAxis {
            HStack {
                Text(series[0].label)
                Spacer()
                Text(
                    props.flag("measure") ? pin.map { "From \(series[$0].label)" } ?? "Tap to pin a start" : series
                        .last!.label
                )
            }
            .primitiveFont(.footnote)
            .foregroundStyle(palette.ink("tertiary"))
        }
    }

    private func display(_ value: Double) -> String {
        if props.string("unit") == "percent" { return value.formatted(.number.precision(.fractionLength(2))) + "%" }
        if props.string("unit") == "number" { return value.formatted(.number.precision(.fractionLength(2))) }
        return PrimitiveNumberFormat(kind: .currency).string(value)
    }

    /// Above the plot while scrubbing: the value and its label, or the measured move from the pin.
    private func readout(_ series: [Point]) -> some View {
        let index = min(series.count - 1, max(0, hover ?? series.count - 1))
        let start = min(series.count - 1, max(0, pin ?? 0))
        let change = series[index].value - series[start].value
        return HStack {
            Text(display(series[index].value))
            Spacer()
            if props.flag("measure"), hover != nil {
                Text(
                    "\(display(change)) · \((100 * change / series[start].value).formatted(.number.precision(.fractionLength(2))))%"
                )
                .foregroundStyle(palette.tone(change >= 0 ? "good" : "bad"))
            } else {
                Text(series[index].label).foregroundStyle(palette.ink("secondary"))
            }
        }
        .primitiveFont(.footnote)
        .monospacedDigit()
    }
}

/// Scale, colours and fills of one line chart, computed once per render.
private struct LineGeometry {
    typealias Point = PriceLinePrimitive.Point
    let look: ChartLook
    let floor: Double
    let ceiling: Double
    let ticks: [Double]
    let reference: Double?
    let threshold: Bool
    let up: Color
    let down: Color
    let stroke: Color
    let line: AnyShapeStyle
    let area: AnyShapeStyle?
    let dots: [Int]

    init(
        series: [Point],
        aligned: [Point],
        look: ChartLook,
        palette: PrimitivePalette,
        reference: Double?,
        compact: Bool,
        threshold wantsThreshold: Bool,
        fill: Bool
    ) {
        self.look = look
        self.reference = reference
        let fixed = look.ink.map { palette.ink($0) }
        up = fixed ?? palette.tone("good")
        down = fixed ?? palette.tone("bad")
        stroke = fixed ?? palette.tone(series.last!.value >= series.first!.value ? "good" : "bad")
        let values = series.map(\.value) + aligned.map(\.value)
        let scale = values + (reference.map { [$0] } ?? []) + (look.domain == "zero" ? [0] : [])
        let low = scale.min()!
        let high = scale.max()!
        let pad = max(high - low, 1) * 0.1
        // An explicit domain, so the threshold's colour stop sits exactly at the reference.
        let bottom = look.domain == "zero" && low >= 0 ? 0 : low - pad
        let top = high + pad
        floor = bottom
        ceiling = top
        ticks = [values.min()!, (values.min()! + values.max()!) / 2, values.max()!]
        let zones = reference != nil && fixed == nil && wantsThreshold
        threshold = zones
        let stop = reference.map { min(1, max(0, (top - $0) / (top - bottom))) } ?? 0
        let (up, down, stroke) = (up, down, stroke)
        line = zones
            ? AnyShapeStyle(LinearGradient(stops: [
                .init(color: up, location: 0), .init(color: up, location: stop),
                .init(color: down, location: stop), .init(color: down, location: 1),
            ], startPoint: .top, endPoint: .bottom))
            : AnyShapeStyle(stroke)
        switch look.area ?? (!compact || fill ? "gradient" : "none") {
        case "none":
            area = nil
        case "solid":
            area = AnyShapeStyle(stroke.opacity(0.12))
        default:
            area = zones
                ? AnyShapeStyle(LinearGradient(stops: [
                    .init(color: up.opacity(0.24), location: 0), .init(color: up.opacity(0.04), location: stop),
                    .init(color: down.opacity(0.04), location: stop), .init(color: down.opacity(0.24), location: 1),
                ], startPoint: .top, endPoint: .bottom))
                : AnyShapeStyle(LinearGradient(
                    colors: [stroke.opacity(0.24), stroke.opacity(0)],
                    startPoint: .top,
                    endPoint: .bottom
                ))
        }
        dots = switch look.points {
        case "all": Array(series.indices)
        case "ends": [0, series.count - 1]
        case "last": [series.count - 1]
        default: []
        }
    }

    /// A point's colour: its zone under a threshold, else the line colour.
    func color(of value: Double) -> Color {
        guard threshold, let reference else { return stroke }
        return value >= reference ? up : down
    }
}

/// The marks: area, baseline and reference rules, the line(s), dots, high/low, pin and scrub point.
private struct LinePlotContent: ChartContent {
    typealias Point = PriceLinePrimitive.Point
    let geometry: LineGeometry
    let series: [Point]
    let aligned: [Point]
    let palette: PrimitivePalette
    let bands: [PriceLinePrimitive.SessionBand]
    let compact: Bool
    let baseline: Bool
    let annotate: Bool
    let referenceLabel: String?
    let hover: Int?
    let pin: Int?
    let display: (Double) -> String

    var body: some ChartContent {
        // Under everything else: full-height bands fading from the top, labelled when wide enough.
        ForEach(bands) { band in
            RectangleMark(
                xStart: .value("Index", band.start),
                xEnd: .value("Index", band.end),
                yStart: .value("Floor", geometry.floor),
                yEnd: .value("Ceiling", geometry.ceiling)
            )
            .foregroundStyle(LinearGradient(
                colors: [palette.ink("primary").opacity(0.07), palette.ink("primary").opacity(0)],
                startPoint: .top,
                endPoint: .bottom
            ))
            .annotation(position: .overlay, alignment: .top, spacing: 6) {
                if Double(band.end - band.start) / Double(max(series.count - 1, 1)) >= 0.18 {
                    Text(band.label).primitiveFont(.footnote).foregroundStyle(palette.ink("secondary"))
                        .padding(.top, 6)
                }
            }
        }
        if let area = geometry.area {
            ForEach(series) { point in
                AreaMark(
                    x: .value("Index", point.id),
                    yStart: .value("Floor", geometry.floor),
                    yEnd: .value("Value", point.value),
                    series: .value("Series", "area")
                )
                .interpolationMethod(geometry.look.interpolation)
                .foregroundStyle(area)
            }
        }
        if baseline {
            RuleMark(y: .value("Baseline", series[0].value))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 4]))
                .foregroundStyle(palette.color(token: "outline.control"))
        }
        if let reference = geometry.reference {
            RuleMark(y: .value("Reference", reference))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                .foregroundStyle(palette.color(token: "outline.control"))
                .annotation(position: .top, alignment: .trailing, spacing: 2) {
                    if let referenceLabel {
                        Text(referenceLabel).primitiveFont(.footnote).foregroundStyle(palette.ink("tertiary"))
                    }
                }
        }
        ForEach(series) { point in
            LineMark(x: .value("Index", point.id), y: .value("Value", point.value), series: .value("Series", "main"))
                .interpolationMethod(geometry.look.interpolation)
                .lineStyle(StrokeStyle(lineWidth: geometry.look.lineWidth, lineCap: .round, lineJoin: .round))
                .foregroundStyle(geometry.line)
        }
        ForEach(aligned) { point in
            LineMark(
                x: .value("Index", point.id),
                y: .value("Value", point.value),
                series: .value("Series", "comparison")
            )
            .interpolationMethod(geometry.look.interpolation)
            .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 4]))
            .foregroundStyle(palette.ink("secondary"))
        }
        ForEach(geometry.dots, id: \.self) { index in
            PointMark(x: .value("Index", index), y: .value("Value", series[index].value))
                .symbolSize(64)
                .foregroundStyle(geometry.color(of: series[index].value))
        }
        if annotate, !compact {
            extreme(high: true)
            extreme(high: false)
        }
        if let pin, series.indices.contains(pin) {
            RuleMark(x: .value("Pin", pin))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
                .foregroundStyle(palette.ink("secondary"))
        }
        if let hover, series.indices.contains(hover) {
            RuleMark(x: .value("Selected", hover))
                .lineStyle(StrokeStyle(lineWidth: 1))
                .foregroundStyle(palette.color(token: "outline.control"))
            PointMark(x: .value("Selected", hover), y: .value("Value", series[hover].value))
                .symbolSize(80)
                .foregroundStyle(geometry.color(of: series[hover].value))
        }
    }

    /// The high or low written on the line (`annotate`).
    private func extreme(high: Bool) -> some ChartContent {
        let point = series.max { high ? $0.value < $1.value : $0.value > $1.value } ?? series[0]
        return PointMark(x: .value("Index", point.id), y: .value("Value", point.value))
            .symbolSize(0)
            .annotation(position: high ? .top : .bottom, spacing: 4) {
                Text("\(high ? "High" : "Low") \(display(point.value))")
                    .primitiveFont(.footnote).foregroundStyle(palette.ink("secondary"))
            }
    }
}
