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
