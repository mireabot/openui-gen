import Foundation

struct GalleryComponent: Identifiable {
    let name: String
    let summary: String?
    let samples: [GallerySample]

    var id: String { name }
}

struct GallerySample: Identifiable {
    let id: String
    /// The fixture's variant (`full`, `sparse`), when a component has several.
    let variant: String?
    let content: GallerySampleContent
}

enum GallerySampleContent {
    /// A retained session, as in a generated screen.
    case scene(Result<OpenUISession, any Error>)
    /// Plain SwiftUI, with no primitive on the wire yet.
    case clubCard(ClubStop)
    case clubTimeline([ClubStop], initial: Int = 0)
}

/// Everything on the Components page, as one list. Sports components come from the catalog and the
/// server's own expansions in `fixtures.json`, so they match what the server streams. Club career
/// samples are plain SwiftUI over `ClubSamples`, and they replace `ClubTimeline`'s fixtures here.
/// Primitives follow, from `PrimitiveSamples`.
/// A sample that fails to compile stays on the page with its error.
@MainActor
enum ComponentGallery {
    static func components(baseURL: URL) throws -> [GalleryComponent] {
        let compiler = try OpenUICompiler()
        let service = OpenUIStreamService(baseURL: baseURL)
        let render = { (id: String, program: String, dataset: OpenUIDataset) in
            Result {
                let session = try OpenUISession(service: service, compiler: compiler)
                try session.restore(OpenUIArchive(
                    documentID: "gallery/" + id,
                    revision: 1,
                    origin: baseURL,
                    program: program,
                    datasets: [dataset]
                ))
                return session
            }
        }

        let fixtures = try bundled(FixtureFile.self, "fixtures").fixtures
        let sports = try bundled(SportsFile.self, "sports-components").components.map { component in
            let prefix = component.name + "/"
            let samples = component.name == "ClubTimeline" ? careerTimelines : fixtures
                .filter { $0.key.hasPrefix(prefix) }
                .map { fixture in
                    GallerySample(
                        id: fixture.key,
                        variant: String(fixture.key.dropFirst(prefix.count)),
                        content: .scene(render(fixture.key, fixture.program, fixture.dataset))
                    )
                }
            return GalleryComponent(name: component.name, summary: component.intent, samples: samples)
        }

        let dataset = try PrimitiveSamples.dataset()
        let primitives = PrimitiveSamples.groups.flatMap(\.samples).map { sample in
            GalleryComponent(name: sample.name, summary: nil, samples: [GallerySample(
                id: sample.name,
                variant: nil,
                content: .scene(render(sample.name, PrimitiveSamples.program(body: sample.body), dataset))
            )])
        }
        return sports + [clubCard] + primitives
    }

    /// Real careers only, one for each way the years group, then an NBA and an NFL career.
    private static var careerTimelines: [GallerySample] {
        [
            GallerySample(
                id: "ClubTimeline/several-per-year",
                variant: "Several clubs per year: Jhon Durán, 8 clubs, 3 loans",
                content: .clubTimeline(ClubSamples.duran)
            ),
            GallerySample(
                id: "ClubTimeline/one-per-year",
                variant: "One club per year: Erling Haaland, 5 clubs",
                content: .clubTimeline(ClubSamples.haaland)
            ),
            GallerySample(
                id: "ClubTimeline/nba",
                variant: "NBA, ESPN seasons: James Harden, 6 teams, 2 mid-season trades",
                content: .clubTimeline(ClubSamples.harden, initial: ClubSamples.harden.count - 1)
            ),
            GallerySample(
                id: "ClubTimeline/nfl",
                variant: "NFL, ESPN seasons: Russell Wilson, 4 teams",
                content: .clubTimeline(ClubSamples.wilson, initial: ClubSamples.wilson.count - 1)
            ),
        ]
    }

    private static var clubCard: GalleryComponent {
        GalleryComponent(name: "ClubCard", summary: "A club in a player's career.", samples: [
            GallerySample(id: "ClubCard/loan", variant: "loan", content: .clubCard(ClubSamples.benfica)),
            GallerySample(
                id: "ClubCard/stats",
                variant: "loan, 3 stats",
                content: .clubCard(ClubSamples.benficaWithStats)
            ),
        ])
    }

    private static func bundled<File: Decodable>(_ type: File.Type, _ name: String) throws -> File {
        try JSONDecoder().decode(type, from: BundledResource.data(named: name))
    }

    private struct FixtureFile: Decodable {
        let fixtures: [GalleryFixture]
    }

    private struct SportsFile: Decodable {
        let components: [SportsComponent]
    }
}

private struct GalleryFixture: Decodable {
    let key: String
    let program: String
    let dataset: OpenUIDataset
}

private struct SportsComponent: Decodable {
    let name: String
    let intent: String
}
