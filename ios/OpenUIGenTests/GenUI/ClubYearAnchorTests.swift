import Testing
@testable import OpenUIGen

/// The year anchoring has no view in it, so its rules are checked here. Stops for Durán:
/// 0 = 2019 (card 0), 1 = 2022 (cards 1-2), 2 = 2023 (card 3), 3 = 2025 (cards 4-5), 4 = 2026 (cards 6-7).
struct ClubYearAnchorTests {
    @Test func groupsClubsByYear() {
        let years = ClubYears(clubs: ClubSamples.duran)
        #expect(years.stops.map(\.year) == ["2019", "2022", "2023", "2025", "2026"])
        #expect(years.stops.map(\.firstCard) == [0, 1, 3, 4, 6])
        #expect((0 ..< 8).map(years.stop(ofCard:)) == [0, 1, 1, 2, 3, 3, 4, 4])
    }

    @Test func railMovesOnlyWhenTheCentredCardIsFromAnotherYear() {
        var anchor = ClubYearAnchor(clubs: ClubSamples.duran, initialCard: 1)
        #expect(anchor.cardCentred(2) == nil)
        #expect(anchor.cardCentred(3) == 2)
        #expect(anchor.cardCentred(2) == 1)
    }

    @Test func cardsPassingOtherYearsDuringAJumpDoNotMoveTheRail() {
        var anchor = ClubYearAnchor(clubs: ClubSamples.duran, initialCard: 7)
        #expect(anchor.jump(toStop: 0) == 0)
        #expect((1 ... 6).reversed().compactMap { anchor.cardCentred($0) }.isEmpty)
        #expect(anchor.cardCentred(0) == nil)
        #expect(anchor.cardCentred(1) == 1)
    }

    @Test func aFingerOnTheCardsEndsAJump() {
        var anchor = ClubYearAnchor(clubs: ClubSamples.duran, initialCard: 7)
        _ = anchor.jump(toStop: 0)
        #expect(anchor.cardCentred(4) == nil)
        #expect(anchor.cardsTouched() == 3)
    }

    @Test func swipingTheRailHoldsOffTheCardsThenJumpsWhenItSettles() {
        var anchor = ClubYearAnchor(clubs: ClubSamples.duran, initialCard: 0)
        anchor.railDragged()
        anchor.railMoved(toStop: 3)
        #expect(anchor.cardCentred(1) == nil)
        #expect(anchor.railSettled() == .jump(toStop: 3))
        #expect(anchor.jump(toStop: 3) == 4)
    }

    @Test func aRailThatComesToRestAfterTheCardsMovedItDoesNotJump() {
        var anchor = ClubYearAnchor(clubs: ClubSamples.duran, initialCard: 0)
        #expect(anchor.cardCentred(1) == 1)
        anchor.railMoved(toStop: 1)
        #expect(anchor.railSettled() == nil)
    }

    @Test func aRailLeftOffItsYearGoesBack() {
        var anchor = ClubYearAnchor(clubs: ClubSamples.duran, initialCard: 0)
        anchor.railDragged()
        anchor.railMoved(toStop: 3)
        #expect(anchor.cardsTouched() == nil)
        #expect(anchor.railSettled() == .realign(toStop: 0))
    }

    @Test func statsClipToThree() {
        var club = ClubSamples.benficaWithStats
        club.stats.append(ClubStat(label: "Minutes", value: "900"))
        #expect(club.shownStats.map(\.label) == ["Apps", "Goals", "Assists"])
    }
}
