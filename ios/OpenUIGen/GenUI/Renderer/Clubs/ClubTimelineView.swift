import SwiftUI

/// The wire representation reuses the same timeline as the native component gallery.
struct YearTimelinePrimitive: View {
    let props: PrimitiveProps

    var body: some View {
        let clubs = props.list("items").map { item in
            ClubStop(
                id: item["id"]?.stringValue ?? "",
                name: item["name"]?.stringValue ?? "",
                logo: item["logo"]?.stringValue,
                color: item["color"]?.stringValue ?? "",
                year: item["year"]?.stringValue ?? "",
                dates: item["dates"]?.stringValue ?? "",
                location: item["location"]?.stringValue,
                loan: item["marker"]?.stringValue == "currency",
                stats: (item["stats"]?.listValue ?? []).map { stat in
                    ClubStat(label: stat["label"]?.stringValue ?? "", value: stat["value"]?.stringValue ?? "")
                }
            )
        }
        let initial = Int(min(Double(max(clubs.count - 1, 0)), max(0, props.number("initial") ?? 0)))
        ClubTimelineView(clubs: clubs, initial: initial)
            .id(props.value("items"))
    }
}

/// One stop per year over one row of club cards. The years anchor the cards: see `ClubYearAnchor` for the
/// rules. With a single year there is nothing to move between, so the rail is hidden.
///
/// The state belongs to one list of clubs. To swap the list, give the view a new `.id`.
struct ClubTimelineView: View {
    let clubs: [ClubStop]

    @Environment(\.primitivePalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var anchor: ClubYearAnchor
    @State private var cardPosition: ScrollPosition
    @State private var railPosition: ScrollPosition
    @State private var width: CGFloat = 0

    /// - Parameter initial: the card to open on.
    init(clubs: [ClubStop], initial: Int = 0) {
        self.clubs = clubs
        let anchor = ClubYearAnchor(clubs: clubs, initialCard: initial)
        _anchor = State(initialValue: anchor)
        _cardPosition = State(initialValue: Self.position(at: clubs.isEmpty ? nil : clubs[anchor.centredCard].id))
        _railPosition = State(
            initialValue: Self
                .position(at: anchor.years.stops.first { $0.index == anchor.shownStop }?.id)
        )
    }

    private static func position(at id: String?) -> ScrollPosition {
        id.map { ScrollPosition(id: $0, anchor: .center) } ?? ScrollPosition(idType: String.self)
    }

    /// Slide, snap, a subtle fast spring, no stagger. With reduce motion, no animation at all.
    private var motion: Animation? {
        reduceMotion ? nil : .spring(duration: 0.35, bounce: 0.12)
    }

    var body: some View {
        VStack(spacing: 16) {
            // The margins that centre the first and last items need the width. Waiting for it means both
            // scroll views start with the right margins, so the opening position lands first time.
            if width > 0, !clubs.isEmpty {
                if anchor.years.stops.count > 1 { rail }
                cards
            }
        }
        .frame(maxWidth: .infinity)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    }

    // MARK: Rail

    private var rail: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 0) {
                ForEach(anchor.years.stops) { stop in
                    Button {
                        jump(toStop: stop.index)
                    } label: {
                        Text(stop.year)
                            .font(.system(size: 22, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(palette.ink("primary"))
                            .frame(width: ClubTimelineLayout.yearWidth, height: ClubTimelineLayout.yearHeight)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .visualEffect { content, proxy in
                        content.opacity(ClubTimelineLayout.yearOpacity(
                            distance: proxy.stepsFromCentre(step: ClubTimelineLayout.yearWidth)
                        ))
                    }
                }
            }
            .scrollTargetLayout()
        }
        .contentMargins(.horizontal, max((width - ClubTimelineLayout.yearWidth) / 2, 0), for: .scrollContent)
        .scrollIndicators(.hidden)
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition($railPosition, anchor: .center)
        .onScrollGeometryChange(for: Int?.self) {
            $0.nearestStop(count: anchor.years.stops.count)
        } action: { _, stop in
            if let stop { anchor.railMoved(toStop: stop) }
        }
        .onScrollPhaseChange { _, phase in
            switch phase {
            case .interacting: anchor.railDragged()
            case .idle: railSettled()
            default: break
            }
        }
    }

    // MARK: Cards

    private var cards: some View {
        ScrollView(.horizontal) {
            // Eager on purpose: a career is a handful of clubs, and every card must be measured for one shared height.
            HStack(spacing: ClubTimelineLayout.cardGap) {
                ForEach(clubs) { club in
                    ClubCardView(club: club)
                        .frame(width: ClubTimelineLayout.cardWidth)
                        .visualEffect { content, proxy in
                            content.opacity(ClubTimelineLayout.cardOpacity(
                                distance: proxy.stepsFromCentre(step: ClubTimelineLayout.cardStep)
                            ))
                        }
                }
            }
            .scrollTargetLayout()
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, PrimitiveMetrics.railVerticalPadding)
        }
        .contentMargins(.horizontal, max((width - ClubTimelineLayout.cardWidth) / 2, 0), for: .scrollContent)
        .scrollIndicators(.hidden)
        // not sure about byOne: the web lets a hard flick cross several cards. `.viewAligned` alone would allow that
        // here too.
        .scrollTargetBehavior(.viewAligned(limitBehavior: .alwaysByOne))
        .scrollPosition($cardPosition, anchor: .center)
        .onScrollGeometryChange(for: Int?.self) {
            $0.nearestStop(count: clubs.count)
        } action: { _, card in
            if let card, let stop = anchor.cardCentred(card) { moveRail(toStop: stop) }
        }
        .onScrollPhaseChange { _, phase in
            guard phase == .tracking || phase == .interacting else { return }
            if let stop = anchor.cardsTouched() { moveRail(toStop: stop) }
        }
    }

    // MARK: Moves

    private func jump(toStop stop: Int) {
        let card = anchor.jump(toStop: stop)
        withAnimation(motion) {
            cardPosition.scrollTo(id: clubs[card].id, anchor: .center)
            scrollRail(toStop: stop)
        }
    }

    private func moveRail(toStop stop: Int) {
        withAnimation(motion) { scrollRail(toStop: stop) }
    }

    private func scrollRail(toStop stop: Int) {
        guard let id = anchor.years.stops.first(where: { $0.index == stop })?.id else { return }
        railPosition.scrollTo(id: id, anchor: .center)
    }

    private func railSettled() {
        switch anchor.railSettled() {
        case let .jump(stop): jump(toStop: stop)
        case let .realign(stop): moveRail(toStop: stop)
        case nil: break
        }
    }
}

// MARK: - Layout

/// Sizes and fades. Not on the view, because `visualEffect` closures run off the main actor.
private enum ClubTimelineLayout {
    static let yearWidth: CGFloat = 96
    static let yearHeight: CGFloat = 40
    static let cardWidth: CGFloat = 280
    static let cardGap: CGFloat = 16
    static let cardStep: CGFloat = cardWidth + cardGap

    static func yearOpacity(distance: CGFloat) -> CGFloat {
        max(0.28, 1 - distance * 0.62)
    }

    static func cardOpacity(distance: CGFloat) -> CGFloat {
        1 - 0.55 * min(1, distance)
    }
}

private extension GeometryProxy {
    /// How many steps this view's centre is from the centre of its scroll view, with fractions while moving.
    func stepsFromCentre(step: CGFloat) -> CGFloat {
        guard let visible = bounds(of: .scrollView) else { return 0 }
        return abs(frame(in: .scrollView).midX - visible.midX) / step
    }
}

private extension ScrollGeometry {
    /// Which of `count` equal stops is nearest the centre, from how far along the scrollable range the
    /// offset is. Nil before the first layout. The first stop rests at the start of the range and the last
    /// at the end, because the margins centre them.
    func nearestStop(count: Int) -> Int? {
        let start = -contentInsets.leading
        let end = contentSize.width + contentInsets.trailing - containerSize.width
        guard count >= 1, contentSize.width > 0 else { return nil }
        guard end > start else { return 0 }
        let along = (contentOffset.x - start) / (end - start)
        return min(max(Int((along * CGFloat(count - 1)).rounded()), 0), count - 1)
    }
}
