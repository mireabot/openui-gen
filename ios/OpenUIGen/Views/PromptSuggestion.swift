import Foundation

/// A starter question above the composer. A question about one league carries that league, so its chip
/// shows the league's mark.
struct PromptSuggestion: Identifiable, Hashable {
    let id: String
    let text: String
    let league: League?

    /// A league with a mark on ESPN's CDN, the source the server's data already comes from. These are
    /// ESPN's dark-background marks (`500-dark`), because Kino is dark only.
    enum League: String {
        case premierLeague
        case laLiga
        case nfl
        case nba

        var logo: URL {
            switch self {
            case .premierLeague: Self.espn("leaguelogos/soccer/500-dark/23")
            case .laLiga: Self.espn("leaguelogos/soccer/500-dark/15")
            case .nfl: Self.espn("teamlogos/leagues/500-dark/nfl")
            case .nba: Self.espn("teamlogos/leagues/500-dark/nba")
            }
        }

        private static func espn(_ path: String) -> URL {
            URL(string: "https://a.espncdn.com/i/\(path).png")!
        }
    }
}

extension PromptSuggestion {
    /// One or two per league, so the first screen shows all three sports.
    static let starters = [
        PromptSuggestion(id: "pl-table", text: "Premier League table this season", league: .premierLeague),
        PromptSuggestion(id: "lebron-trophies", text: "Which trophies has LeBron James won?", league: .nba),
        PromptSuggestion(id: "chiefs-injuries", text: "Chiefs injury report", league: .nfl),
        PromptSuggestion(id: "chelsea-season", text: "How has Chelsea done this season?", league: .premierLeague),
        PromptSuggestion(id: "laliga-scorers", text: "LaLiga top scorers", league: .laLiga),
    ]
}
