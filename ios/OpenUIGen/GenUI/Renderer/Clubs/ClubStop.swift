import Foundation

/// One label and value in a club card's stats row. Not tied to any particular stat.
struct ClubStat: Hashable, Sendable {
    let label: String
    let value: String
}

/// One club in a player's career: what `ClubCardView` shows and where `ClubTimelineView` files it.
struct ClubStop: Identifiable, Hashable, Sendable {
    static let maxStats = 3

    let id: String
    let name: String
    /// Nil or empty when there is no crest: the card shows a monogram on `color`.
    var logo: String?
    /// The club colour as `#rrggbb`.
    let color: String
    /// The year this club sits under on the timeline's rail.
    let year: String
    /// The player's dates at the club, ready to show.
    let dates: String
    var location: String?
    var loan = false
    var stats: [ClubStat] = []

    /// The stats the card has room for.
    var shownStats: [ClubStat] {
        Array(stats.prefix(Self.maxStats))
    }
}
