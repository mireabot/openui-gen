import Foundation

/// The clubs grouped by year: one stop per unique year, in the order the years first appear.
struct ClubYears: Equatable {
    struct Stop: Identifiable, Equatable {
        let year: String
        let index: Int
        let firstCard: Int

        var id: String { year }
    }

    let stops: [Stop]
    private let stopOfCard: [Int]

    init(clubs: [ClubStop]) {
        var stops: [Stop] = []
        stopOfCard = clubs.enumerated().map { card, club in
            if let stop = stops.first(where: { $0.year == club.year }) { return stop.index }
            stops.append(Stop(year: club.year, index: stops.count, firstCard: card))
            return stops.count - 1
        }
        self.stops = stops
    }

    /// The stop a card belongs to. A card out of range counts as the first stop.
    func stop(ofCard card: Int) -> Int {
        stopOfCard.indices.contains(card) ? stopOfCard[card] : 0
    }
}

/// The rules between the year rail and the cards, with no views in it. The view reports what its two
/// scroll views did, and scrolls wherever the answers say.
///
/// - Cards swiped freely: the rail stays still inside a year, and moves once a card from another year is centred.
/// - Rail tapped, or swiped and settled: the cards jump to that year's first club.
/// - During a jump the cards pass other years, so `jumpTarget` makes them count for nothing. It clears when
///   the target card is centred, or when a finger lands on the cards. No timer: it lasts as long as the jump does.
/// - While the rail is swiped, `railHeld` stops the cards moving it, until it settles.
struct ClubYearAnchor {
    enum RailSettle: Equatable {
        case jump(toStop: Int)
        case realign(toStop: Int)
    }

    let years: ClubYears
    private(set) var centredCard: Int
    private(set) var shownStop: Int
    private var railStop: Int
    private var jumpTarget: Int?
    private var railHeld = false

    init(clubs: [ClubStop], initialCard: Int) {
        years = ClubYears(clubs: clubs)
        centredCard = min(max(initialCard, 0), max(clubs.count - 1, 0))
        shownStop = years.stop(ofCard: centredCard)
        railStop = shownStop
    }

    /// Starts a jump to a stop's first club and returns that card.
    mutating func jump(toStop stop: Int) -> Int {
        let card = years.stops.first { $0.index == stop }?.firstCard ?? 0
        shownStop = stop
        railHeld = false
        jumpTarget = card == centredCard ? nil : card
        return card
    }

    /// A new card is the centred one. Returns the stop the rail should move to, if it should move.
    mutating func cardCentred(_ card: Int) -> Int? {
        centredCard = card
        if let target = jumpTarget {
            guard card == target else { return nil }
            jumpTarget = nil
        }
        guard !railHeld else { return nil }
        let stop = years.stop(ofCard: card)
        guard stop != shownStop else { return nil }
        shownStop = stop
        return stop
    }

    /// A finger landed on the cards: it beats a running jump and a rail still coasting.
    /// Returns the stop the rail should move to, if the cards were interrupted in another year.
    mutating func cardsTouched() -> Int? {
        jumpTarget = nil
        railHeld = false
        return cardCentred(centredCard)
    }

    mutating func railDragged() {
        railHeld = true
    }

    mutating func railMoved(toStop stop: Int) {
        railStop = stop
    }

    /// The rail came to rest. After a swipe that is a jump to where it stopped. Otherwise it should already
    /// be on the shown stop; if a swipe was cut short by a finger on the cards, it goes back there.
    mutating func railSettled() -> RailSettle? {
        if railHeld {
            railHeld = false
            return .jump(toStop: railStop)
        }
        return railStop == shownStop ? nil : .realign(toStop: shownStop)
    }
}
