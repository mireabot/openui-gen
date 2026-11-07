import SwiftUI

/// The prompt box: starter suggestions above a growing text field and its send button.
///
/// Adapted from SwiftUX's Assistant Prompt Box (`InputWithActionSuggestions`). Focus swaps the
/// suggestions between a scrolling row and a stack above the field through one `AnyLayout`, so the
/// chips move between the two arrangements instead of being rebuilt. The source's mode toggles are
/// left out: this app has no modes. The composer never sends by itself; it reports through `onSend`
/// and `onSuggestion`, and the caller decides.
struct PromptComposer: View {
    // MARK: Inputs

    @Binding var text: String
    var placeholder = "Ask about soccer, NFL or NBA"
    var suggestions: [PromptSuggestion] = []
    var isBusy = false
    /// A follow-up shows the run button beside the field; `runOpen` marks it while its card is up.
    var showsRun = false
    var runOpen = false

    // MARK: Actions

    var onSend: () -> Void = {}
    var onSuggestion: (PromptSuggestion) -> Void = { _ in }
    var onRun: () -> Void = {}

    /// One line of the field, and the run button's diameter, so the two sit level.
    static let fieldHeight: CGFloat = 52

    // MARK: State

    @FocusState private var focused: Bool
    /// Follows focus through an animation, so the layout swap animates while focus itself stays instant.
    @State private var stacked = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !suggestions.isEmpty {
                suggestionList
                    .transition(.opacity)
            }
            // One glass container, so the field and the run button read as one piece of glass.
            GlassEffectContainer(spacing: 12) {
                HStack(alignment: .bottom, spacing: 12) {
                    field
                    if showsRun {
                        runButton
                            .transition(.opacity)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .onChange(of: focused) { _, isFocused in
            withAnimation(reduceMotion ? nil : .bouncy) { stacked = isFocused }
        }
    }

    // MARK: Pieces

    private var suggestionList: some View {
        let layout = stacked
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(spacing: 8))
        return ScrollView(.horizontal) {
            layout {
                ForEach(suggestions) { suggestion in
                    Button {
                        focused = false
                        onSuggestion(suggestion)
                    } label: {
                        chip(suggestion)
                    }
                    .buttonStyle(ChipPressStyle(reduceMotion: reduceMotion))
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .scrollDisabled(stacked)
        // The row runs edge to edge; its chips keep the composer's inset.
        .padding(.horizontal, -16)
    }

    private func chip(_ suggestion: PromptSuggestion) -> some View {
        HStack(spacing: 8) {
            if let league = suggestion.league {
                MediaFill(source: league.logo.absoluteString)
                    .frame(width: 20, height: 20)
            }
            Text(suggestion.text)
                .primitiveFont(.footnote, weight: .medium)
                .lineLimit(1)
        }
        .foregroundStyle(palette.color(token: "ink.primary"))
        .padding(.horizontal, 12)
        .frame(height: 36)
        .background(palette.color(token: "surface.filled"), in: .capsule)
    }

    private var field: some View {
        HStack(alignment: .bottom, spacing: 12) {
            TextField(placeholder, text: $text, axis: .vertical)
                .lineLimit(1 ... 5)
                .primitiveFont(.body)
                .focused($focused)
                .submitLabel(.send)
                .padding(.vertical, 8)
                // A vertical field takes Return as a newline; here Return sends, as it did before.
                .onChange(of: text) { _, value in
                    guard value.contains("\n") else { return }
                    text = value.replacingOccurrences(of: "\n", with: "")
                    send()
                }
            sendButton
        }
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .padding(.vertical, 8)
        .frame(minHeight: Self.fieldHeight)
        .glassEffect(.regular, in: .rect(cornerRadius: PrimitiveMetrics.containerRadius))
    }

    /// Opens the run's steps, cost and save. Brand ink while the card is up.
    private var runButton: some View {
        Button(action: onRun) {
            Image(systemName: "dollarsign")
                .font(.body.weight(.semibold))
                .foregroundStyle(palette.color(token: runOpen ? "ink.brand" : "ink.primary"))
                .frame(width: Self.fieldHeight, height: Self.fieldHeight)
                .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .circle)
    }

    private var sendButton: some View {
        Button(action: send) {
            Image(systemName: "arrow.up")
                .font(.body.weight(.semibold))
        }
        .buttonStyle(SendStyle(isActive: canSend, palette: palette))
        .disabled(!canSend)
    }

    // MARK: Derived

    private var canSend: Bool {
        !isBusy && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func send() {
        guard canSend else { return }
        focused = false
        onSend()
    }
}

// MARK: - Button styles

/// The round send button: filled in primary ink when there is something to send, quiet otherwise.
private struct SendStyle: ButtonStyle {
    let isActive: Bool
    let palette: PrimitivePalette

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(palette.color(token: isActive ? "surface.screen" : "ink.tertiary"))
            .frame(width: 36, height: 36)
            .background(palette.color(token: isActive ? "ink.primary" : "surface.filled"), in: .circle)
            .opacity(configuration.isPressed ? 0.7 : 1)
            .animation(.snappy, value: isActive)
    }
}

/// Press feedback for a chip: a slight scale, or a dim under Reduce Motion.
private struct ChipPressStyle: ButtonStyle {
    let reduceMotion: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .opacity(configuration.isPressed && reduceMotion ? 0.7 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
    }
}

#Preview {
    @Previewable @State var text = ""
    PromptComposer(text: $text, suggestions: PromptSuggestion.starters)
        .frame(maxHeight: .infinity, alignment: .bottom)
}
