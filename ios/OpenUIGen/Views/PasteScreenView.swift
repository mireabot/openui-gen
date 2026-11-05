import SwiftUI

/// Paste a generated schema and see its screen, with no server and no model. There is no prompt bar
/// and no status panel here, so a pasted screen has no follow-ups and no Save.
struct PasteScreenView: View {
    let theme: DesignTheme?
    let screenColor: Color
    let baseURL: URL

    @State private var model = PasteScreenModel()

    var body: some View {
        Group {
            switch model.state {
            case let .editing(failure):
                editor(failure: failure)
            case let .rendered(session):
                OpenUISceneView(root: session.root, theme: theme)
                    .primitiveMediaBaseURL(baseURL)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(screenColor.ignoresSafeArea())
        .navigationTitle("Paste schema")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if case .rendered = model.state {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit", systemImage: "pencil") { model.edit() }
                }
            }
        }
    }

    private func editor(failure: String?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            TextEditor(text: $model.text)
                .font(.footnote.monospaced())
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(.regularMaterial)
                .clipShape(.rect(cornerRadius: PrimitiveMetrics.controlRadius))
                .overlay(alignment: .topLeading) {
                    if model.text.isEmpty {
                        Text("Paste a schema here")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(16)
                            .allowsHitTesting(false)
                    }
                }
            if let failure {
                Text(failure)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            HStack {
                // PasteButton reads the clipboard without the system's paste prompt.
                PasteButton(payloadType: String.self) { strings in
                    guard let pasted = strings.first else { return }
                    model.text = pasted
                }
                Spacer()
                Button("Render") { model.render(baseURL: baseURL) }
                    .buttonStyle(.borderedProminent)
                    .disabled(!model.canRender)
            }
        }
        .padding(PrimitiveMetrics.screenInset)
    }
}
