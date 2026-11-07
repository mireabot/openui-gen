import NukeUI
import SwiftUI
import UIKit

/// `StepTimeline(value, segments, ticks, caption?)`: a value over time as a stepped line in stretches,
/// each in its own colour with its crest above its middle, and prices on the trailing edge. Drawing and
/// scrubbing follow the SwiftUX Win Probability Chart (Kalshi): the line holds each value until the next
/// tick and draws in from the left; hold 0.1 s and drag to snap to the nearest tick, with a dotted line,
/// a dot, a selection haptic and everything right of the finger dimmed. The header's right side follows
/// the scrub and keeps its space, so nothing jumps.
struct StepTimelinePrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveMediaBaseURL) private var base
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selected: Reading?
    /// The last scrubbed tick. It outlives the press so the dim and the dotted line fade out in place.
    @State private var faded: Reading?
    @State private var revealed = false

    private static let plotHeight: CGFloat = 200
    private static let headerHeight: CGFloat = 68
    private static let axisWidth: CGFloat = 44
    private static let axisSpacing: CGFloat = 8
    private static let crest: CGFloat = 20

    struct Reading: Identifiable, Equatable {
        let id: Int
        let segment: Int
        let date: Date
        let label: String
        let value: Double
        let display: String
    }

    struct Stretch: Identifiable {
        let id: Int
        let name: String
        let line: Color
        let tag: Color
        let logo: String?
        let readings: [Reading]
    }

    private struct Tick: Identifiable {
        let value: Double
        let display: String
        var id: Double { value }
    }

    private var isScrubbing: Bool { selected != nil }
    private var motion: StepTimelineMotion { StepTimelineMotion(reduceMotion: reduceMotion) }

    var body: some View {
        let stretches = stretches()
        let readings = stretches.flatMap(\.readings)
        if let last = readings.last, readings.count >= 2 {
            VStack(alignment: .leading, spacing: 12) {
                header(stretches)
                plot(stretches, readings: readings, last: last)
            }
            .sensoryFeedback(.selection, trigger: selected?.id) { _, new in new != nil }
            .onAppear { revealed = true }
        } else {
            Text(props.string("value") ?? "")
                .primitiveFont(.title1, weight: .semibold)
                .foregroundStyle(palette.ink("primary"))
        }
    }

    private func stretches() -> [Stretch] {
        var nextID = 0
        return props.list("segments").enumerated().compactMap { index, item in
            let readings = (item["points"]?.listValue ?? []).compactMap { point -> Reading? in
                guard let x = point["x"]?.numberValue, let value = point["value"]?.numberValue else { return nil }
                defer { nextID += 1 }
                return Reading(
                    id: nextID,
                    segment: index,
                    date: Date(timeIntervalSince1970: x / 1000),
                    label: point["label"]?.stringValue ?? "",
                    value: value,
                    display: point["display"]?.stringValue ?? ""
                )
            }
            guard !readings.isEmpty else { return nil }
            return Stretch(
                id: index,
                name: item["name"]?.stringValue ?? "",
                line: color(item["lineColor"]) ?? palette.ink("primary"),
                tag: color(item["tagColor"]) ?? palette.color(token: "surface.brand"),
                logo: item["logo"]?.stringValue,
                readings: readings
            )
        }
    }

    private func color(_ value: PValue?) -> Color? {
        value?.stringValue.flatMap { $0.hasPrefix("#") ? palette.value($0) : nil }
    }

    // MARK: Header

    private func header(_ stretches: [Stretch]) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(props.string("value") ?? "")
                    .primitiveFont(.title1, weight: .semibold)
                    .monospacedDigit()
                    .foregroundStyle(palette.ink("primary"))
                if let caption = props.string("caption"), !caption.isEmpty {
                    Text(caption)
                        .primitiveFont(.footnote)
                        .foregroundStyle(palette.ink("secondary"))
                }
            }
            Spacer(minLength: 0)
            if let selected, let stretch = stretches.first(where: { $0.id == selected.segment }) {
                selection(selected, in: stretch)
            }
        }
        .frame(minHeight: Self.headerHeight, alignment: .top)
    }

    private func selection(_ reading: Reading, in stretch: Stretch) -> some View {
        VStack(alignment: .trailing, spacing: 6) {
            Text(stretch.name)
                .primitiveFont(.footnote, weight: .semibold)
                .foregroundStyle(stretch.line)
            Text(reading.label)
                .primitiveFont(.footnote)
                .foregroundStyle(palette.ink("secondary"))
            Text(reading.display)
                .primitiveFont(.footnote, weight: .semibold)
                .monospacedDigit()
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .frame(height: 20)
                .background(stretch.tag, in: .rect(cornerRadius: 4))
        }
        .fixedSize()
    }

    // MARK: Plot

    private func plot(_ stretches: [Stretch], readings: [Reading], last: Reading) -> some View {
        GeometryReader { proxy in
            let plot = StepTimelinePlot(
                rect: CGRect(
                    x: 0,
                    y: 0,
                    width: max(proxy.size.width - Self.axisWidth - Self.axisSpacing, 0),
                    height: proxy.size.height
                ),
                start: readings[0].date,
                end: last.date,
                top: max(readings.map(\.value).max() ?? 1, 1)
            )
            ZStack(alignment: .topLeading) {
                lines(stretches, plot: plot, edge: (faded ?? last).date)
                scrubLine(plot: plot)
                dot(selected ?? last, stretches: stretches, plot: plot)
                ForEach(stretches) { crest($0, in: stretches, plot: plot) }
                axis(plot: plot)
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
            .contentShape(.rect)
            .gesture(StepTimelinePressGesture { location in
                scrub(to: location, in: readings, plot: plot)
            })
        }
        .frame(height: Self.plotHeight)
    }

    /// Finger down or moving: snap to the nearest tick right away, no animation. Finger up: clear.
    private func scrub(to location: CGPoint?, in readings: [Reading], plot: StepTimelinePlot) {
        guard let location else {
            selected = nil
            return
        }
        guard let reading = plot.nearest(toX: location.x, in: readings), reading != selected else { return }
        selected = reading
        faded = reading
    }

    /// Every stretch's line, wiped in from the left on appear, with everything right of the scrub at 0.4.
    /// The dim's edge follows the tick with no animation; only its amount animates.
    private func lines(_ stretches: [Stretch], plot: StepTimelinePlot, edge: Date) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(stretches) { stretch in
                plot.line(of: stretch, in: stretches)
                    .stroke(stretch.line, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: plot.rect.width, height: plot.rect.height)
        .mask(alignment: .leading) {
            HStack(spacing: 0) {
                Rectangle().frame(width: max(plot.x(for: edge), 0))
                Rectangle()
                    .opacity(isScrubbing ? 0.4 : 1)
                    .animation(motion.scrubFade(isScrubbing: isScrubbing), value: isScrubbing)
            }
        }
        .mask(alignment: .leading) {
            Rectangle()
                .frame(width: revealed ? plot.rect.width : 0)
                .animation(motion.reveal, value: revealed)
        }
    }

    /// A dotted line on the scrubbed tick. It fades, while its position always moves with the finger.
    @ViewBuilder
    private func scrubLine(plot: StepTimelinePlot) -> some View {
        if let faded {
            let x = plot.x(for: faded.date)
            Path { path in
                path.move(to: CGPoint(x: x, y: plot.rect.minY))
                path.addLine(to: CGPoint(x: x, y: plot.rect.maxY))
            }
            .stroke(palette.ink("secondary"), style: StrokeStyle(lineWidth: 1, dash: [2, 3]))
            .opacity(isScrubbing ? 1 : 0)
            .animation(motion.scrubFade(isScrubbing: isScrubbing), value: isScrubbing)
        }
    }

    private func dot(_ reading: Reading, stretches: [Stretch], plot: StepTimelinePlot) -> some View {
        Circle()
            .fill(stretches.first { $0.id == reading.segment }?.line ?? palette.ink("primary"))
            .frame(width: 8, height: 8)
            .padding(2)
            .background(palette.color(token: "surface.screen"), in: .circle)
            .opacity(revealed ? 1 : 0)
            .animation(motion.revealTrailing, value: revealed)
            .position(x: plot.x(for: reading.date), y: plot.y(for: reading.value))
    }

    /// The crest at the middle of its stretch, 4 above its highest value, or nothing when the stretch is too narrow.
    @ViewBuilder
    private func crest(_ stretch: Stretch, in stretches: [Stretch], plot: StepTimelinePlot) -> some View {
        let index = stretches.firstIndex { $0.id == stretch.id } ?? 0
        let left = plot.x(for: stretch.readings[0].date)
        let right = plot
            .x(for: index + 1 < stretches.count ? stretches[index + 1].readings[0].date : stretch.readings.last!.date)
        let highest = stretch.readings.map(\.value).max() ?? stretch.readings[0].value
        if right - left >= Self.crest, let url = PrimitiveImages.url(stretch.logo, base: base) {
            LazyImage(url: url) { state in
                state.image?.resizable().scaledToFit()
            }
            .pipeline(PrimitiveImages.pipeline)
            .frame(width: Self.crest, height: Self.crest)
            .opacity(revealed ? 1 : 0)
            .animation(motion.revealTrailing, value: revealed)
            .position(x: (left + right) / 2, y: max(Self.crest / 2, plot.y(for: highest) - 4 - Self.crest / 2))
            .allowsHitTesting(false)
        }
    }

    /// The only axis: price labels at the trailing edge, level with their values.
    private func axis(plot: StepTimelinePlot) -> some View {
        let ticks = props.list("ticks").compactMap { tick -> Tick? in
            guard let value = tick["value"]?.numberValue else { return nil }
            return Tick(value: value, display: tick["display"]?.stringValue ?? "")
        }
        return ForEach(ticks) { tick in
            Text(tick.display)
                .primitiveFont(.footnote)
                .monospacedDigit()
                .foregroundStyle(palette.ink("tertiary"))
                .lineLimit(1)
                .fixedSize()
                .frame(width: Self.axisWidth, alignment: .trailing)
                .position(
                    x: plot.rect.maxX + Self.axisSpacing + Self.axisWidth / 2,
                    y: plot.y(for: tick.value)
                )
        }
    }
}

// MARK: - Plot maths

/// Maps dates and values into a rect, so a dot always sits on its line. The line starts flush with the
/// leading edge, and the top keeps room for the crests.
private struct StepTimelinePlot {
    var rect: CGRect
    var start: Date
    var end: Date
    var top: Double
    var headroom: CGFloat = 28
    var inset: CGFloat = 4

    private var innerWidth: CGFloat { max(rect.width - inset, 0) }
    private var span: TimeInterval { end.timeIntervalSince(start) }

    func x(for date: Date) -> CGFloat {
        rect.minX + innerWidth * (span > 0 ? date.timeIntervalSince(start) / span : 0)
    }

    func y(for value: Double) -> CGFloat {
        let height = max(rect.height - headroom - inset, 0)
        return rect.minY + headroom + height * (1 - min(max(value / top, 0), 1))
    }

    /// The tick closest in time to a finger at `x`.
    func nearest(toX x: CGFloat, in readings: [StepTimelinePrimitive.Reading]) -> StepTimelinePrimitive.Reading? {
        guard innerWidth > 0 else { return readings.last }
        let target = start.addingTimeInterval(span * min(max((x - rect.minX) / innerWidth, 0), 1))
        return readings.min { abs($0.date.timeIntervalSince(target)) < abs($1.date.timeIntervalSince(target)) }
    }

    /// One stretch's line: it holds each value until the next tick. It rises from the last stretch's value
    /// in its own colour and holds its last value up to the next stretch.
    func line(of stretch: StepTimelinePrimitive.Stretch, in stretches: [StepTimelinePrimitive.Stretch]) -> Path {
        let index = stretches.firstIndex { $0.id == stretch.id } ?? 0
        let points = stretch.readings.map { CGPoint(x: x(for: $0.date), y: y(for: $0.value)) }
        var path = Path()
        guard let first = points.first else { return path }
        if index > 0, let before = stretches[index - 1].readings.last {
            path.move(to: CGPoint(x: first.x, y: y(for: before.value)))
            path.addLine(to: first)
        } else {
            path.move(to: first)
        }
        for point in points.dropFirst() {
            path.addLine(to: CGPoint(x: point.x, y: path.currentPoint?.y ?? point.y))
            path.addLine(to: point)
        }
        if index + 1 < stretches.count, let next = stretches[index + 1].readings.first {
            path.addLine(to: CGPoint(x: x(for: next.date), y: path.currentPoint?.y ?? first.y))
        }
        return path
    }
}

// MARK: - Motion

/// Every timing the chart uses, in one place. Scrub positions never animate; only these do.
private struct StepTimelineMotion {
    var reduceMotion: Bool

    /// The line draws in from the left on appear.
    var reveal: Animation? {
        reduceMotion ? nil : .timingCurve(0.42, 0.27, 0.34, 0.96, duration: 0.9)
    }

    /// The dot and crests arrive once the line is mostly drawn.
    var revealTrailing: Animation? {
        reduceMotion ? nil : .easeOut(duration: 0.25).delay(0.7)
    }

    /// Press: quick, so the finger feels connected. Release: a little longer, so the chart settles.
    func scrubFade(isScrubbing: Bool) -> Animation {
        if reduceMotion { return .linear(duration: 0.1) }
        return isScrubbing ? .easeOut(duration: 0.15) : .easeOut(duration: 0.25)
    }
}

// MARK: - Gesture

/// Hold for 0.1 s, then drag. The short hold lets a vertical swipe that starts on the chart still scroll the screen.
private struct StepTimelinePressGesture: UIGestureRecognizerRepresentable {
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
