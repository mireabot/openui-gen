import SwiftUI

/// Every component the renderer can draw, each with sample data.
struct ComponentGalleryView: View {
    let theme: DesignTheme?
    let screenColor: Color
    let baseURL: URL

    @State private var sections: [GallerySection] = []
    @State private var failure: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: .sectionHeaders) {
                if let failure {
                    Text(failure)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(PrimitiveMetrics.screenInset)
                }
                ForEach(sections) { section in
                    Section {
                        ForEach(section.components) { component in
                            GalleryComponentView(component: component, theme: theme, baseURL: baseURL)
                        }
                    } header: {
                        Text(section.title)
                            .font(.title3.weight(.semibold))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, PrimitiveMetrics.screenInset)
                            .padding(.vertical, 12)
                            .background(screenColor)
                    }
                }
            }
        }
        .scrollIndicators(.hidden)
        .background(screenColor.ignoresSafeArea())
        .navigationTitle("Components")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard sections.isEmpty, failure == nil else { return }
            do {
                sections = try ComponentGallery.sections(baseURL: baseURL)
            } catch {
                failure = error.localizedDescription
            }
        }
    }
}

private struct GalleryComponentView: View {
    let component: GalleryComponent
    let theme: DesignTheme?
    let baseURL: URL

    private var palette: PrimitivePalette { PrimitivePalette(theme: theme) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Divider()
            VStack(alignment: .leading, spacing: 4) {
                Text(component.name)
                    .font(.headline.monospaced())
                if let summary = component.summary {
                    Text(summary)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, PrimitiveMetrics.screenInset)
            .padding(.top, 20)
            ForEach(component.samples) { sample in
                if let variant = sample.variant {
                    Text(variant)
                        .font(.footnote.monospaced())
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, PrimitiveMetrics.screenInset)
                        .padding(.top, 16)
                }
                switch sample.content {
                case let .scene(.success(session)):
                    OpenUISceneView(root: session.root, theme: theme, scrolls: false) { session.edit($0, value: $1) }
                        .primitiveMediaBaseURL(baseURL)
                case let .scene(.failure(error)):
                    Text(error.localizedDescription)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(PrimitiveMetrics.screenInset)
                case let .clubCard(club):
                    ClubCardView(club: club)
                        .frame(width: 280)
                        .padding(PrimitiveMetrics.screenInset)
                        .environment(\.primitivePalette, palette)
                case let .clubTimeline(clubs, initial):
                    ClubTimelineView(clubs: clubs, initial: initial)
                        .padding(.vertical, PrimitiveMetrics.screenInset)
                        .environment(\.primitivePalette, palette)
                }
            }
        }
    }
}
