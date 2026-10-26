import SwiftUI

/// A prompt bar over the rendered OpenUI screen, with the pipeline's progress while it streams.
struct AskView: View {
    @Bindable var model: AskModel
    let health: HealthModel
    let baseURL: URL

    private let theme = DesignTheme.bundled(brand: DesignTheme.defaultBrand)
    private let suggestions = [
        "Premier League table this season",
        "How has Chelsea done this season?",
        "LaLiga top scorers",
    ]

    var body: some View {
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(screenColor.ignoresSafeArea())
                .safeAreaInset(edge: .bottom) { promptBar }
                .navigationTitle("OpenUIGen")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { ServerStatusDot(state: health.state) }
                    if model.session != nil {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("New", systemImage: "square.and.pencil") { model.reset() }
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
        if let session = model.session, session.hasContent {
            OpenUISceneView(root: session.root, theme: theme) { session.edit($0, value: $1) }
                .primitiveMediaBaseURL(baseURL)
                .overlay(alignment: .top) {
                    if session.phase == .updating {
                        ActivityList(activities: Array(session.activities.suffix(1)))
                            .padding(.top, 8)
                    }
                }
        } else if let session = model.session, model.isBusy {
            ActivityList(activities: session.activities)
                .padding(PrimitiveMetrics.screenInset)
        } else {
            emptyState
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Ask about football")
                .font(.title2.weight(.semibold))
            Text(baseURL.absoluteString)
                .font(.footnote.monospaced())
                .foregroundStyle(.secondary)
            ForEach(suggestions, id: \.self) { suggestion in
                Button(suggestion) {
                    model.prompt = suggestion
                    Task { await model.send() }
                }
                .buttonStyle(.bordered)
            }
            if let error = model.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
        .padding(PrimitiveMetrics.screenInset)
    }

    private var promptBar: some View {
        HStack(spacing: 12) {
            TextField(model.session == nil ? "Ask about football" : "Follow up", text: $model.prompt)
                .textFieldStyle(.plain)
                .submitLabel(.send)
                .onSubmit { Task { await model.send() } }
            Button {
                Task { await model.send() }
            } label: {
                Image(systemName: model.isBusy ? "hourglass" : "arrow.up.circle.fill")
                    .font(.title2)
            }
            .disabled(model.isBusy || model.prompt.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: PrimitiveMetrics.controlHeight)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: PrimitiveMetrics.controlRadius))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private var screenColor: Color {
        theme?.color("surface.screen").map(Color.init) ?? Color(uiColor: .systemBackground)
    }
}

/// The pipeline steps the server reported, newest last.
private struct ActivityList: View {
    let activities: [DSLActivity]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if activities.isEmpty {
                ProgressView()
            }
            ForEach(Array(activities.enumerated()), id: \.offset) { _, activity in
                HStack(spacing: 10) {
                    if activity.status == .completed {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    } else {
                        ProgressView()
                    }
                    Text(activity.title)
                        .font(.subheadline.weight(.medium))
                }
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: PrimitiveMetrics.controlRadius))
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
