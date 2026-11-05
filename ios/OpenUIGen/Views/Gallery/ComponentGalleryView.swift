import SwiftUI

/// Every component the renderer can draw, each with sample data.
struct ComponentGalleryView: View {
    let theme: DesignTheme?
    let screenColor: Color
    let baseURL: URL

    @State private var components: [GalleryComponent] = []
    @State private var failure: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if let failure {
                    Text(failure)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(PrimitiveMetrics.screenInset)
                }
                ForEach(components) { component in
                    GalleryComponentView(component: component, theme: theme, baseURL: baseURL)
                }
            }
        }
        .scrollIndicators(.hidden)
        .background(screenColor.ignoresSafeArea())
        .navigationTitle("Components")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard components.isEmpty, failure == nil else { return }
            do {
                components = try ComponentGallery.components(baseURL: baseURL)
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
                    OpenUISceneView(root: session.root, theme: theme, scrolls: false)
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
