import SwiftUI

/// The grid's animations, from SwiftUX's Indeterminate Pixel Loader. Each case carries its whole
/// pattern, so the view never switches on it.
enum GenerationLoaderVariant: String, CaseIterable, Identifiable {
    case drive
    case dots
    case orbit

    var id: Self { self }

    var pattern: GenerationLoaderPattern {
        switch self {
        case .drive: GenerationLoaderPattern(delays: Self.chevronDelays, duration: 0.65, isRounded: false)
        case .dots: GenerationLoaderPattern(delays: Self.chevronDelays, duration: 0.65, isRounded: true)
        case .orbit: GenerationLoaderPattern(delays: Self.orbitDelays, duration: 0.95, isRounded: false)
        }
    }

    /// `(column + |row − 1|) × 90ms`: a ">" sweeping left to right. The 650ms cycle is shorter than
    /// the sweep, so two fronts are always in flight.
    private static let chevronDelays: [TimeInterval?] = (0..<9).map { (index: Int) -> TimeInterval? in
        let row = index / 3
        let column = index % 3
        let step: Int = column + abs(row - 1)
        return Double(step) * 0.09
    }

    /// Clockwise around the perimeter from the top-left. The centre is not in the order, so it rests.
    private static let orbitOrder = [0, 1, 2, 5, 8, 7, 6, 3]

    private static let orbitDelays: [TimeInterval?] = (0..<9).map { index in
        orbitOrder.firstIndex(of: index).map { Double($0) * 0.11 }
    }
}

/// Per-cell delays for a 3×3 grid, row by row. `nil` marks a cell that stays at the inactive opacity.
struct GenerationLoaderPattern {
    let delays: [TimeInterval?]
    let duration: TimeInterval
    let isRounded: Bool

    static let baseOpacity: Double = 0.15
    static let inactiveOpacity: Double = 0.07

    /// The cell's opacity at `time` (any monotonic clock, in seconds): base → 1 → base, ease-in-out on
    /// each half, with the delay as a phase shift, so every cell is mid-cycle on the first frame.
    func opacity(forCell index: Int, at time: TimeInterval, isAnimating: Bool) -> Double {
        guard let delay = delays[index] else { return Self.inactiveOpacity }
        guard isAnimating else { return Self.baseOpacity }
        let progress = (time - delay).truncatingRemainder(dividingBy: duration) / duration
        // Folding the second half onto the first is exact because ease-in-out is symmetric.
        let rise = progress < 0.5 ? progress * 2 : (1 - progress) * 2
        return Self.baseOpacity + (1 - Self.baseOpacity) * UnitCurve.easeInOut.value(at: rise)
    }
}
