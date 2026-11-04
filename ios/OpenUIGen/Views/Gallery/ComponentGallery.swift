import Foundation

struct GallerySection: Identifiable {
    let title: String
    let components: [GalleryComponent]

    var id: String { title }
}

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
    /// A retained session, so sliders recalculate as they do in a generated screen.
    case scene(Result<OpenUISession, any Error>)
    /// Plain SwiftUI, with no primitive on the wire yet.
    case clubCard(ClubStop)
    case clubTimeline([ClubStop], initial: Int = 0)
}

/// Everything on the Components page. Sports components come from the catalog and the server's own
/// expansions in `fixtures.json`, so they match what the server streams. Primitives come from
/// `PrimitiveSamples`. Clubs are plain SwiftUI over `ClubSamples`. A sample that fails to compile
/// stays on the page with its error.
@MainActor
enum ComponentGallery {
    static func sections(baseURL: URL) throws -> [GallerySection] {
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
            return GalleryComponent(
                name: component.name,
                summary: component.intent,
                samples: fixtures.filter { $0.key.hasPrefix(prefix) }.map { fixture in
                    GallerySample(
                        id: fixture.key,
                        variant: String(fixture.key.dropFirst(prefix.count)),
                        content: .scene(render(fixture.key, fixture.program, fixture.dataset))
                    )
                }
            )
        }

        let dataset = try PrimitiveSamples.dataset()
        let primitives = PrimitiveSamples.groups.map { group in
            GallerySection(title: group.title, components: group.samples.map { sample in
                GalleryComponent(name: sample.name, summary: nil, samples: [GallerySample(
                    id: sample.name,
                    variant: nil,
                    content: .scene(render(sample.name, PrimitiveSamples.program(body: sample.body), dataset))
                )])
            })
        }
        return [clubs, GallerySection(title: "Sports", components: sports)] + primitives
    }

    private static var clubs: GallerySection {
        GallerySection(title: "Clubs", components: [
            GalleryComponent(name: "ClubCard", summary: "A club in a player's career.", samples: [
                GallerySample(id: "ClubCard/loan", variant: "loan", content: .clubCard(ClubSamples.benfica)),
                GallerySample(id: "ClubCard/stats", variant: "loan, 3 stats", content: .clubCard(ClubSamples.benficaWithStats)),
            ]),
            GalleryComponent(name: "ClubTimeline", summary: "Clubs in one row, with years above them.", samples: [
                GallerySample(id: "ClubTimeline/duran", variant: "Durán", content: .clubTimeline(ClubSamples.duran)),
                GallerySample(
                    id: "ClubTimeline/duran-stats",
                    variant: "Durán, stats, opens on his current club",
                    content: .clubTimeline(ClubSamples.duranWithStats, initial: ClubSamples.duranWithStats.count - 1)
                ),
                GallerySample(id: "ClubTimeline/haaland", variant: "Haaland", content: .clubTimeline(ClubSamples.haaland)),
            ]),
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
