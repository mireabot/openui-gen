import Foundation

// One club per line, so the values read like the web's data.ts.
// swiftlint:disable line_length

/// SAMPLE DATA for the Components page, not live data. Copied from the web canvas's
/// `club-timeline/data.ts`: FotMob career history, read 2026-11-04.
enum ClubSamples {
    /// Jhon Durán: 8 clubs, several per year, 3 loans.
    static let duran = duranWithStats.map(withoutStats)

    /// Durán's last club, a loan, with no stats.
    static let benfica = withoutStats(benficaWithStats)

    /// Erling Haaland: 5 clubs, one per year.
    static let haaland = [
        club("bryne", "Bryne", crest: 8531, color: "#ef4941", year: "2016", dates: "Mar 2016 – Jan 2017", location: "Bryne, Norway"),
        club("molde", "Molde", crest: 9917, color: "#0068b0", year: "2017", dates: "Feb 2017 – Dec 2018", location: "Molde, Norway"),
        club("salzburg", "Salzburg", crest: 10013, color: "#f13032", year: "2019", dates: "Jan 2019 – Dec 2019", location: "Wals-Siezenheim, Austria"),
        club("dortmund", "Borussia Dortmund", crest: 9789, color: "#ffd900", year: "2020", dates: "Jan 2020 – Jun 2022", location: "Dortmund, Germany"),
        club("city", "Manchester City", crest: 8456, color: "#76b4e5", year: "2022", dates: "Jul 2022 – Present", location: "Manchester, England"),
    ]

    static let duranWithStats = [
        club("envigado", "Envigado", crest: 4402, color: "#ff5406", year: "2019", dates: "Jan 2019 – Dec 2021", location: "Envigado, Colombia", stats: stats(49, 10, 4)),
        club("chicago", "Chicago Fire", crest: 6397, color: "#ff0000", year: "2022", dates: "Jan 2022 – Jan 2023", location: "Chicago, Illinois, USA", stats: stats(28, 8, 3)),
        club("chicago-ii", "Chicago Fire II", crest: 1_348_118, color: "#7bccef", year: "2022", dates: "Mar 2022 – Dec 2022", location: "Bridgeview, Illinois, USA", stats: stats(2, 0, 0)),
        club("villa", "Aston Villa", crest: 10252, color: "#9d2358", year: "2023", dates: "Jan 2023 – Jan 2025", location: "Birmingham, England", stats: stats(78, 20, 0)),
        club("nassr", "Al Nassr", crest: 101_918, color: "#fbd129", year: "2025", dates: "Jan 2025 – Feb 2026", location: "Riyadh, Saudi Arabia", stats: stats(18, 12, 0)),
        club("fenerbahce", "Fenerbahçe", crest: 8695, color: "#ffed00", year: "2025", dates: "Jul 2025 – Feb 2026", location: "İstanbul, Turkey", loan: true, stats: stats(21, 5, 2)),
        club("zenit", "Zenit St. Petersburg", crest: 8698, color: "#7fcbf3", year: "2026", dates: "Feb 2026 – Jun 2026", location: "St. Petersburg, Russia", loan: true, stats: stats(9, 2, 0)),
        benficaWithStats,
    ]

    /// Durán's last club, a loan, with 3 stats.
    static let benficaWithStats = club("benfica", "Benfica", crest: 9772, color: "#c00001", year: "2026", dates: "Jul 2026 – Jun 2027", location: "Lisboa, Portugal", loan: true, stats: stats(17, 5, 0))

    /// James Harden, NBA: 6 teams, 2 mid-season trades. Built as the server builds an ESPN career
    /// (one spell per run of seasons with a team), from ESPN's athlete stats recorded 2026-11-05.
    static let harden = [
        espn("oklahoma-city-thunder-2009-10", "Oklahoma City Thunder", logo: "https://a.espncdn.com/i/teamlogos/nba/500/okc.png", color: "#c67c03", year: "2009", dates: "2009-10 – 2011-12", location: "Oklahoma City"),
        espn("houston-rockets-2012-13", "Houston Rockets", logo: "https://a.espncdn.com/i/teamlogos/nba/500/hou.png", color: "#d40026", year: "2012", dates: "2012-13 – 2020-21", location: "Houston"),
        espn("brooklyn-nets-2020-21", "Brooklyn Nets", logo: "https://a.espncdn.com/i/teamlogos/nba/500/bkn.png", color: "#000000", year: "2020", dates: "2020-21 – 2021-22", location: "Brooklyn"),
        espn("philadelphia-76ers-2021-22", "Philadelphia 76ers", logo: "https://a.espncdn.com/i/teamlogos/nba/500/phi.png", color: "#000000", year: "2021", dates: "2021-22 – 2022-23", location: "Philadelphia"),
        espn("la-clippers-2023-24", "LA Clippers", logo: "https://a.espncdn.com/i/teamlogos/nba/500/lac.png", color: "#1d428a", year: "2023", dates: "2023-24 – 2025-26", location: "LA"),
        espn("cleveland-cavaliers-2025-26", "Cleveland Cavaliers", logo: "https://a.espncdn.com/i/teamlogos/nba/500/cle.png", color: "#860038", year: "2025", dates: "2025-26 – 2026-27", location: "Cleveland"),
    ]

    /// Russell Wilson, NFL: 4 teams, from the same ESPN source.
    static let wilson = [
        espn("seattle-seahawks-2012", "Seattle Seahawks", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png", color: "#224970", year: "2012", dates: "2012 – 2021", location: "Seattle"),
        espn("denver-broncos-2022", "Denver Broncos", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/den.png", color: "#002e4d", year: "2022", dates: "2022 – 2023", location: "Denver"),
        espn("pittsburgh-steelers-2024", "Pittsburgh Steelers", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png", color: "#000000", year: "2024", dates: "2024", location: "Pittsburgh"),
        espn("new-york-giants-2025", "New York Giants", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png", color: "#003c7f", year: "2025", dates: "2025", location: "New York"),
    ]

    // swiftlint:enable line_length

    // swiftlint:disable:next function_parameter_count
    private static func club(
        _ id: String,
        _ name: String,
        crest: Int,
        color: String,
        year: String,
        dates: String,
        location: String,
        loan: Bool = false,
        stats: [ClubStat] = []
    ) -> ClubStop {
        ClubStop(
            id: id,
            name: name,
            logo: "https://images.fotmob.com/image_resources/logo/teamlogo/\(crest).png",
            color: color,
            year: year,
            dates: dates,
            location: location,
            loan: loan,
            stats: stats
        )
    }

    // swiftlint:disable:next function_parameter_count
    private static func espn(_ id: String, _ name: String, logo: String, color: String, year: String, dates: String, location: String) -> ClubStop {
        ClubStop(id: id, name: name, logo: logo, color: color, year: year, dates: dates, location: location, loan: false, stats: [])
    }

    private static func stats(_ appearances: Int, _ goals: Int, _ assists: Int) -> [ClubStat] {
        [
            ClubStat(label: "Apps", value: String(appearances)),
            ClubStat(label: "Goals", value: String(goals)),
            ClubStat(label: "Assists", value: String(assists)),
        ]
    }

    private static func withoutStats(_ club: ClubStop) -> ClubStop {
        var club = club
        club.stats = []
        return club
    }
}
