import Foundation

/// A sample for every primitive in `primitives.json`, grouped as the catalog groups them. Each one is
/// the body of a `Screen`, written as the server writes programs: data props read the shared dataset
/// through `d`, and copy props are literals.
enum PrimitiveSamples {
    struct Group {
        let title: String
        let samples: [(name: String, body: String)]
    }

    static func program(body: String) -> String {
        """
        root = Screen([\(body)])
        d = Query("\(tool)", \(args), {})
        """
    }

    static func dataset() throws -> OpenUIDataset {
        try OpenUIDataset(
            tool: tool,
            args: .object(["run": .string("gallery")]),
            result: JSONDecoder().decode(PValue.self, from: Data(GallerySampleData.json.utf8))
        )
    }

    private static let tool = "sports_dataset"
    private static let args = #"{run: "gallery"}"#

    static let groups = [root, layout, text, media, controls, charts, rows, chrome]

    private static let root = Group(title: "Root", samples: [
        ("Screen", #"""
        Text("The whole response", "headline", "semibold"),
        Text("Its children are the blocks of the page, 28 apart.", "body", null, "secondary")
        """#),
    ])

    private static let layout = Group(title: "Layout", samples: [
        ("Stack", #"""
        Stack("v", 8, [Text("Vertical", "footnote", null, "secondary"), Text("Chelsea", "body"), Text("Arsenal", "body")]),
        Stack("h", 8, [Text("Horizontal, between", "body"), Badge("Live", "good")], "center", "between"),
        Stack("wrap", 8, [Pill("Goals", "11"), Pill("Assists", "3"), Pill("Shots", "24"), Pill("Minutes", "5,400")]),
        Stack("v", 12, @Each(d.clubs, "c", KeyValue(c.name, "Premier League")), null, null, null, true)
        """#),
        ("Grid", #"""
        Grid("2", 12, @Each(d.clubs, "c", Card([
          Text(c.name, "body", "medium"),
          Number(c.points, "count", "title2", "semibold", null, null, null, null, " pts")
        ])))
        """#),
        ("Rail", #"""
        Rail(12, @Each(d.clubs, "c", Card([
          Text(c.name, "body", "medium", null, 2, null, null, true),
          Number(c.points, "count", "headline", "semibold")
        ])), 170)
        """#),
        ("Card", #"""
        Card([Text("Default surface", "body")]),
        Card([Text("Filled surface", "body")], "filled"),
        Card([Text("Outlined, control radius", "body")], "outlined", "control", 12),
        Card([Text("Selected", "body")], null, null, null, true)
        """#),
        ("Section", #"""
        Section(
          "Premier League",
          [Row("Chelsea v Arsenal", "Saturday, 12:30 PM")],
          "Matchweek 10",
          Chip("All", "open"),
          "Times are local.",
          true
        )
        """#),
        ("Divider", #"""
        Text("Above", "body"),
        Divider(),
        Text("Inset", "body"),
        Divider(true),
        Text("Edge to edge", "body"),
        Divider(null, true)
        """#),
        ("Spacer", #"""
        Stack("v", 0, [Text("Above", "body"), Spacer(32), Text("32 below", "body")])
        """#),
        ("ZStack", #"""
        ZStack([
          Image(d.player.photo, "16-9", true),
          Stack("v", 4, [Text("Cole Palmer", "headline", "semibold"), Text("Player of the match", "footnote")])
        ], "bottom-leading", 16, true)
        """#),
        ("Disclosure", #"""
        Disclosure("Stamford Bridge", [Text("Capacity 40,173. Opened in 1877.", "body", null, "secondary")], true, "London"),
        Disclosure("Emirates Stadium", [Text("Capacity 60,704.", "body", null, "secondary")], false, "London", Badge("Away", "neutral"))
        """#),
        ("Show", #"""
        Show(true, Text("Shown, because when is true", "body")),
        Show(false, Text("Hidden, because when is false", "body"))
        """#),
    ])

    private static let text = Group(title: "Text", samples: [
        ("Text", #"""
        Text("Title 1", "title1", "semibold"),
        Text("Display", "display", "semibold"),
        Text("Title 2", "title2", "medium"),
        Text("Title 3", "title3"),
        Text("Headline", "headline", "semibold"),
        Text("Body in secondary ink", "body", null, "secondary"),
        Text("Footnote in tertiary ink", "footnote", null, "tertiary"),
        Text("Good tone", "body", null, null, null, null, "good"),
        Text("Warn tone", "body", null, null, null, null, "warn"),
        Text("Bad tone", "body", null, null, null, null, "bad"),
        Text("A colour from the data", "body", null, null, null, null, null, null, d.swatch),
        Text("A long line that stops after one line, however much more of it there is to read.", "body", null, null, 1)
        """#),
        ("Number", #"""
        Number(d.goals, "integer", "title1", "semibold", null, null, null, null, " goals"),
        Number(d.xg, "decimal", "headline"),
        Number(d.progress, "percent", "headline"),
        Number(d.wage, "currency", "headline", null, null, null, null, true),
        Number(d.minutes, "duration", "headline"),
        Number(d.attendance, "count", "headline"),
        Number(d.xg, "decimal", "headline", null, null, null, true)
        """#),
    ])

    private static let media = Group(title: "Media", samples: [
        ("Icon", #"""
        Stack("h", 16, [Icon("soccerball", 16), Icon("sportscourt", 24), Icon("trophy.fill", 28, "orange")], "center")
        """#),
        ("Image", #"""
        Image(d.player.photo, "4-3", true),
        Stack("h", 12, [Image(d.club.logo, "1-1", true, 80), Image(d.club.logo, "2-3", false, 56)], "center")
        """#),
        ("Avatar", #"""
        Stack("h", 12, [
          Avatar(d.club.name, 56, d.club.logo, null, null, d.club.color, "club"),
          Avatar(d.player.name, 56, d.player.photo, null, null, d.player.color, "player"),
          Avatar("Arsenal", 56),
          Avatar("Brentford", 56, null, "orange", "rounded"),
          Avatar("Everton", 20)
        ], "center")
        """#),
        ("IconTile", #"""
        Stack("h", 12, [
          IconTile("soccerball", 56, "brand"),
          IconTile("trophy.fill", 56, "soft"),
          IconTile("sportscourt", 56, "neutral")
        ], "center")
        """#),
        ("AvatarStack", #"""
        AvatarStack(d.squad, 40),
        AvatarStack(d.squad, 20, 2)
        """#),
    ])

    private static let controls = Group(title: "Controls", samples: [
        ("Button", #"""
        Button("Follow Chelsea", "open", "primary", "bell", true),
        Stack("wrap", 8, [
          Button("Secondary", "open", "secondary"),
          Button("Outline", "open", "outline", "star"),
          Button("Text", "open", "text", "arrow.right", null, null, true),
          Button("Disabled", "open", "primary", null, null, true)
        ])
        """#),
        ("IconButton", #"""
        Stack("h", 8, [
          IconButton("bell", "Follow", "open"),
          IconButton("star.fill", "Favourite", "open", "filled"),
          IconButton("square.and.arrow.up", "Share", "open", "plain", true)
        ], "center")
        """#),
        ("Pill", #"""
        Stack("wrap", 8, [Pill("Kickoff", "6:30 PM"), Pill("Chelsea", null, "blue"), Pill("Arsenal", "1st", "red")])
        """#),
        ("Badge", #"""
        Stack("wrap", 8, [
          Badge("7.7", "neutral", null, "small", "tone.good.fg", "surface.screen"),
          Badge("Neutral", "neutral"),
          Badge("Won", "good", "checkmark"),
          Badge("Doubtful", "warn"),
          Badge("Lost", "bad"),
          Badge("7.2", "good", null, "large"),
          Badge("7.2", "good", null, "large", "tone.good.fg", "surface.screen")
        ])
        """#),
        ("Chip", #"""
        Stack("wrap", 8, [Chip("All", "open", true), Chip("Premier League", "open"), Chip("Favourites", "open", false, "star")])
        """#),
        ("SegmentedControl", #"""
        SegmentedControl(["Table", "Form", "Scorers"], 0, [
          Text("The league table goes here.", "body"),
          Text("The last five matches go here.", "body"),
          Text("The top scorers go here.", "body")
        ])
        """#),
        ("Toggle", #"""
        Toggle("Match alerts", true, "Kickoff, goals and full time"),
        Toggle("Transfer news"),
        Toggle("Unavailable", false, null, true)
        """#),
        ("Stepper", #"""
        Stepper(d.subs, "subs", 1)
        """#),
    ])

    private static let charts = Group(title: "Data", samples: [
        ("ColorCell", #"""
        Stack("h", 8, [
          ColorCell("Won", "tone.good.fg", null, "24"),
          ColorCell("Doubtful", "tone.warn.fg", null, "24"),
          ColorCell("Lost", "tone.bad.fg", null, "24"),
          ColorCell("Drawn", "outline.control", null, "24"),
          ColorCell("Upcoming", "surface.filled", null, "24"),
          ColorCell("Club", "surface.brand", d.swatch, "24")
        ], "center")
        """#),
        ("Progress", #"""
        Progress(d.progress, "bar", "good", "Season complete", "26 of 38 matches"),
        Progress(d.progress, "ring", "warn", "Target")
        """#),
        ("Bars", #"""
        Bars(d.form, true, true, 2, true),
        Bars(d.form, null, null, null, true, {orientation: "horizontal", corners: "soft", highlight: "max"})
        """#),
        ("ShareBar", #"""
        ShareBar(d.shots, true),
        ShareBar(d.shots, true, true, {shape: "donut"})
        """#),
        ("Rating", #"""
        Rating(d.rating, d.reviews, 5)
        """#),
        ("SplitBar", #"""
        SplitBar(d.possession, null, null, true),
        SplitBar(d.votes, "thin", true, true),
        Stack("h", 8, [Text("Fan vote", "footnote"), SplitBar(d.votes, "micro")], "center")
        """#),
        ("Note", #"""
        Note("Kickoff moved to 8:00 PM.", "neutral"),
        Note("Palmer is back in training.", "good", "Team news", "cross.case"),
        Note("Two yellow cards away from a ban.", "warn", null, "exclamationmark.triangle"),
        Note("Match postponed.", "bad"),
        Note("New season stats are in.", "brand", null, "sparkles"),
        Note(
          "A long note stops after two lines, so the rest of this sentence about fixture changes, kickoff times and travel never shows.",
          "neutral",
          null,
          "info.circle"
        )
        """#),
    ])

    private static let rows = Group(title: "Rows", samples: [
        ("Row", #"""
        Row(
          "Cole Palmer",
          "Attacking midfielder",
          Avatar(d.player.name, 40, d.player.photo, null, null, d.player.color, "player"),
          Number(d.goals, "count", "headline", "semibold"),
          "open"
        ),
        Row("Match alerts", null, Icon("bell", 24), Toggle("Alerts", true)),
        Row(
          "Chelsea",
          "Premier League",
          Avatar(d.club.name, 40, d.club.logo, null, null, d.club.color),
          Badge("3rd", "neutral")
        )
        """#),
        ("KeyValue", #"""
        KeyValue("Stadium", "Stamford Bridge"),
        KeyValue("Website", "chelseafc.com", "open")
        """#),
    ])

    private static let chrome = Group(title: "Chrome", samples: [
        ("NavBar", #"""
        NavBar("Chelsea v Arsenal", "back", [IconButton("square.and.arrow.up", "Share", "open")]),
        NavBar("Team news", "close", [
          IconButton("bell", "Follow", "open", "filled"),
          IconButton("star", "Favourite", "open", "filled")
        ], "filled")
        """#),
        ("Dock", #"""
        Dock([Button("Follow Chelsea", "open", "primary", "bell", true)])
        """#),
    ])
}

/// What the samples read through `d`.
private enum GallerySampleData {
    static let json = #"""
    {
      "club": { "name": "Chelsea", "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/363.png", "color": "clear" },
      "player": {
        "name": "Cole Palmer",
        "photo": "https://images.fotmob.com/image_resources/playerimages/1096353.png",
        "color": "#034694"
      },
      "clubs": [
        { "name": "Arsenal", "points": 25 },
        { "name": "Chelsea", "points": 22 },
        { "name": "Manchester City", "points": 21 },
        { "name": "Liverpool", "points": 19 }
      ],
      "squad": ["Cole Palmer", "João Pedro", "Moisés Caicedo", "Enzo Fernández"],
      "goals": 11, "attendance": 40173, "wage": 325000, "xg": 9.42, "minutes": 5400,
      "progress": 68, "rating": 4.5, "reviews": 128, "subs": 3,
      "form": [
        { "label": "Aug", "value": 7 },
        { "label": "Sep", "value": 4 },
        { "label": "Oct", "value": 9 },
        { "label": "Nov", "value": 6 },
        { "label": "Dec", "value": 10 }
      ],
      "shots": [
        { "label": "Foot", "value": 18, "ink": "blue", "detail": "18 shots" },
        { "label": "Head", "value": 5, "ink": "orange", "detail": "5 shots" },
        { "label": "Free kick", "value": 2, "ink": "green", "detail": "2 shots" }
      ],
      "possession": [
        { "label": "Chelsea", "count": 37.3, "tone": "neutral", "color": "#034694" },
        { "label": "Manchester City", "count": 62.7, "tone": "good", "color": "#99c5ea" }
      ],
      "votes": [
        { "label": "Win", "count": 52, "tone": "good" },
        { "label": "Draw", "count": 23, "tone": "neutral" },
        { "label": "Loss", "count": 25, "tone": "bad" }
      ],
      "swatch": "#6f42c1"
    }
    """#
}
