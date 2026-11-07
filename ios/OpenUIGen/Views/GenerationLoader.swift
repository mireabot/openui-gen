import SwiftUI

/// The wait after a prompt is sent, before the first part of the screen arrives: a 3×3 pixel grid
/// pulsing in a pattern, the pipeline's current step shimmering beside it, and the time since the run
/// started.
///
/// Adapted from SwiftUX's Indeterminate Pixel Loader (`LoadingPixelState`). No looping animation holds
/// state: the grid and the shimmer read wall-clock time modulo their period, each in its own
/// `TimelineView`. The timer counts from the session's own start, so it agrees with the status card.
/// Under Reduce Motion the grid rests, the label stays still and the timer still ticks.
struct GenerationLoader: View {
    var label = "Starting"
    var startedAt = Date.now
    var variant = GenerationLoaderVariant.drive

    var body: some View {
        HStack(spacing: 10) {
            PixelGrid(pattern: variant.pattern)
            Text(label)
                .primitiveFont(.footnote, weight: .medium)
                .lineLimit(1)
                .shimmering()
                .contentTransition(.opacity)
                .animation(.easeOut(duration: 0.2), value: label)
            ElapsedTimer(startedAt: startedAt)
        }
        .fixedSize()
    }
}

// MARK: - Grid

/// A separate view so that its display-rate timeline redraws the nine cells and nothing around them.
private struct PixelGrid: View {
    let pattern: GenerationLoaderPattern

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let cellSize: CGFloat = 4
    private let cellSpacing: CGFloat = 1.5

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            VStack(spacing: cellSpacing) {
                ForEach(0 ..< 3, id: \.self) { row in
                    HStack(spacing: cellSpacing) {
                        ForEach(0 ..< 3, id: \.self) { column in
                            cell(at: row * 3 + column, time: time)
                        }
                    }
                }
            }
        }
    }

    /// A corner radius of half the side is a circle, so the round and square variants differ by a value.
    private func cell(at index: Int, time: TimeInterval) -> some View {
        RoundedRectangle(cornerRadius: pattern.isRounded ? cellSize / 2 : 1)
            .fill(.primary)
            .frame(width: cellSize, height: cellSize)
            .opacity(pattern.opacity(forCell: index, at: time, isAnimating: !reduceMotion))
    }
}

// MARK: - Timer

private struct ElapsedTimer: View {
    let startedAt: Date

    var body: some View {
        TimelineView(.periodic(from: startedAt, by: 0.1)) { context in
            Text(Self.formatted(max(0, context.date.timeIntervalSince(startedAt))))
                .primitiveFont(.footnote)
                .monospacedDigit()
                .foregroundStyle(.secondary)
        }
    }

    /// Whole deciseconds: `4.2s`, then `1m 3.4s` from a minute on. Integer maths, so 59.95 never reads "60.0s".
    static func formatted(_ elapsed: TimeInterval) -> String {
        let deciseconds = Int(elapsed * 10)
        guard deciseconds >= 600 else { return "\(deciseconds / 10).\(deciseconds % 10)s" }
        let remainder = deciseconds % 600
        return "\(deciseconds / 600)m \(remainder / 10).\(remainder % 10)s"
    }
}

// MARK: - Shimmer

private struct Shimmer: ViewModifier {
    /// One sweep across the label, as in the source's `ShimmerModifier`.
    private let period: TimeInterval = 1.4
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content.foregroundStyle(.secondary)
        } else {
            TimelineView(.animation) { context in
                let phase = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
                content
                    .foregroundStyle(.secondary)
                    .overlay {
                        content
                            .foregroundStyle(.primary)
                            .mask(Self.band(at: phase))
                    }
            }
        }
    }

    /// A soft highlight centred at `phase`, travelling from before the leading edge to past the trailing one.
    static func band(at phase: Double) -> LinearGradient {
        let centre = -0.3 + phase * 1.6
        let stops = [centre - 0.3, centre, centre + 0.3].map { min(1, max(0, $0)) }
        return LinearGradient(
            stops: [
                .init(color: .clear, location: stops[0]),
                .init(color: .white, location: stops[1]),
                .init(color: .clear, location: stops[2]),
            ],
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}

private extension View {
    func shimmering() -> some View { modifier(Shimmer()) }
}

#Preview {
    VStack(alignment: .leading, spacing: 20) {
        ForEach(GenerationLoaderVariant.allCases) { variant in
            GenerationLoader(label: "Designing the dataset", variant: variant)
        }
    }
    .padding()
}
