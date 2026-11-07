import SwiftUI

/// A prompt bar over the rendered OpenUI screen, with the pipeline's progress while it streams.
struct AskView: View {
    @Bindable var model: AskModel
    let health: HealthModel
    let baseURL: URL

    private let theme = DesignTheme.bundled(brand: DesignTheme.defaultBrand)

    /// The run card, opened from the composer's `$` button.
    @State private var runOpen = false
    /// The composer's height, so the run card sits 20 above it.
    @State private var composerHeight: CGFloat = 0

    var body: some View {
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(screenColor.ignoresSafeArea())
                .safeAreaInset(edge: .bottom) {
                    composer
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { composerHeight = $0 }
                }
                .overlay(alignment: .bottom) { runCard }
                .environment(\.primitivePalette, PrimitivePalette(theme: theme))
                .animation(.easeOut(duration: 0.2), value: isWaiting)
                .navigationTitle("OpenUIGen")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { ServerStatusDot(state: health.state) }
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink {
                            ComponentGalleryView(theme: theme, screenColor: screenColor, baseURL: baseURL)
                        } label: {
                            Label("Components", systemImage: "square.grid.2x2")
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink {
                            PasteScreenView(theme: theme, screenColor: screenColor, baseURL: baseURL)
                        } label: {
                            Label("Paste schema", systemImage: "doc.on.clipboard")
                        }
                    }
                    if model.session != nil {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("New", systemImage: "square.and.pencil") {
                                setRunOpen(false)
                                model.reset()
                            }
                            .disabled(model.isBusy)
                        }
                    }
                }
                .task { await health.check() }
        }
        .preferredColorScheme(theme?.appearance == .dark ? .dark : .light)
    }

    @ViewBuilder
    private var content: some View {
        if let session = model.session, session.hasContent || !session.pendingBlocks.isEmpty {
            OpenUISceneView(root: session.root, theme: theme, pending: session.pendingBlocks)
                .primitiveMediaBaseURL(baseURL)
        } else if let session = model.session, model.isBusy {
            GenerationLoader(label: session.activities.last?.title ?? "Starting", startedAt: session.startedAt)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .transition(.opacity)
        } else {
            emptyState
        }
    }

    /// A greeting in the middle of the screen; the suggestions sit with the composer below it.
    private var emptyState: some View {
        VStack(spacing: 8) {
            Text("What do you want to know?")
                .primitiveFont(.title2, weight: .semibold)
            Text("Tables, players, injuries and stats for soccer, the NFL and the NBA.")
                .primitiveFont(.body)
                .foregroundStyle(.secondary)
            if let error = model.errorMessage {
                Text(error)
                    .primitiveFont(.footnote)
                    .foregroundStyle(.red)
                    .padding(.top, 8)
            }
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, PrimitiveMetrics.screenInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var composer: some View {
        PromptComposer(
            text: $model.prompt,
            placeholder: model.session == nil ? "Ask about soccer, NFL or NBA" : "Follow up",
            suggestions: model.session == nil ? PromptSuggestion.starters : [],
            isBusy: model.isBusy,
            showsRun: model.session != nil,
            runOpen: runOpen,
            onSend: { Task { await model.send() } },
            onSuggestion: { suggestion in
                model.prompt = suggestion.text
                Task { await model.send() }
            },
            onRun: { setRunOpen(!runOpen) }
        )
    }

    /// Over the screen, 20 above the composer, fading in and out.
    @ViewBuilder
    private var runCard: some View {
        if runOpen, let session = model.session {
            GenerationStatusView(session: session, saveState: model.saveState) {
                Task { await model.save() }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, composerHeight + 20)
            .transition(.opacity)
        }
    }

    private func setRunOpen(_ open: Bool) {
        withAnimation(.smooth(duration: 0.3)) { runOpen = open }
    }

    /// Sent, and nothing on screen yet.
    private var isWaiting: Bool {
        model.isBusy && model.session?.hasContent != true
    }

    private var screenColor: Color {
        theme?.color("surface.screen").map(Color.init) ?? Color(uiColor: .systemBackground)
    }
}

/// Green when `/health` answered, red when it failed.
private struct ServerStatusDot: View {
    let state: HealthModel.State

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 10, height: 10)
    }

    private var color: Color {
        switch state {
        case .reachable: .green
        case .failed: .red
        case .idle, .loading: .gray
        }
    }
}
