import SwiftUI

/// Ink for text and icons: the palette's ink, or white over a scrimmed photo.
struct InkResolver {
    let palette: PrimitivePalette
    let onMedia: Bool

    func callAsFunction(_ token: String?) -> Color {
        guard onMedia else { return palette.ink(token) }
        return switch token ?? "primary" {
        case "primary", "inverse": .white
        case "secondary": .white.opacity(0.8)
        case "tertiary": .white.opacity(0.6)
        case let other: palette.ink(other)
        }
    }
}

/// `Text(content, role, weight?, ink?, lines?, align?, tone?, reserve?, @color?)`.
struct TextPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveOnMedia) private var onMedia

    var body: some View {
        let lines = props.int("lines").flatMap { $0 > 0 ? $0 : nil }
        let alignment = props.string("align")
        // No data, no line: an empty detail or caption takes no space.
        if props.string("content") != "" {
            // Unpublished facts arrive as null and read as a dash.
            Text(props.string("content") ?? "—")
                .primitiveFont(
                    PrimitiveTypeRole(token: props.string("role")),
                    weight: Font.Weight(token: props.string("weight"))
                )
                .foregroundStyle(
                    dataColor ?? props.string("tone")
                        .map { palette.tone($0) } ?? InkResolver(palette: palette, onMedia: onMedia)(props.string("ink"))
                )
                .modifier(LineLimit(lines: lines, reserve: props.flag("reserve")))
                .truncationMode(.tail)
                .multilineTextAlignment(alignment == "center" ? .center : alignment == "end" ? .trailing : .leading)
                // Its own height, up to `lines`: a stack can't squeeze wrapping text to one line.
                .fixedSize(horizontal: false, vertical: true)
                .frame(
                    maxWidth: alignment == "center" || alignment == "end" ? .infinity : nil,
                    alignment: alignment == "center" ? .center : alignment == "end" ? .trailing : .leading
                )
        }
    }

    /// A colour from the data, which wins over tone and ink; empty means none.
    private var dataColor: Color? {
        props.string("color").flatMap { $0.hasPrefix("#") ? palette.value($0) : nil }
    }
}

/// `lines` caps the text; with `reserve` it also keeps that many lines' height when shorter, so
/// cards in a set match (a one-line title takes the height of two).
private struct LineLimit: ViewModifier {
    let lines: Int?
    let reserve: Bool

    func body(content: Content) -> some View {
        if let lines {
            content.lineLimit(lines, reservesSpace: reserve)
        } else {
            content.lineLimit(nil)
        }
    }
}

/// `Number(@value, format, role, weight?, ink?, roll?, signed?, compact?, suffix?)`.
/// Tabular figures; `roll` animates digit changes.
struct NumberPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveOnMedia) private var onMedia
    @Environment(\.locale) private var locale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.primitiveIsStatic) private var isStatic

    var body: some View {
        let value = props.number("value")
        let format = PrimitiveNumberFormat(
            format: props.string("format"),
            compact: props.flag("compact"),
            signed: props.flag("signed"),
            suffix: props.string("suffix")
        )
        let text = Text(value.map { format.string($0, locale: locale) } ?? "—")
            .primitiveFont(
                PrimitiveTypeRole(token: props.string("role")),
                weight: Font.Weight(token: props.string("weight"))
            )
            .monospacedDigit()
            .foregroundStyle(InkResolver(palette: palette, onMedia: onMedia)(props.string("ink")))
            .lineLimit(1)
        if props.flag("roll"), !reduceMotion, !isStatic {
            text
                .contentTransition(.numericText(value: value ?? 0))
                .animation(.timingCurve(0.77, 0, 0.175, 1, duration: 0.2), value: value)
        } else {
            text
        }
    }
}

/// `Change(@value, @percent, style?, role?)`: a signed price move with its percent
/// (−1.20 · −0.52%), toned by its sign. `pill` (default) and `percent` lead with an arrow.
struct ChangePrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let value = props.number("value")
        let percent = props.number("percent")
        let tone = (value ?? 0) >= 0 ? "good" : "bad"
        let role = PrimitiveTypeRole(token: props.string("role") ?? "footnote")
        let arrow = SymbolGlyph(name: (value ?? 0) >= 0 ? "arrow.up.right" : "arrow.down.right", size: 16)
        Group {
            switch props.string("style") {
            case "text":
                Text(label(value, percent))
            case "percent":
                HStack(spacing: 4) {
                    SymbolGlyph(
                        name: (value ?? 0) >= 0 ? "arrow.up.right" : "arrow.down.right",
                        size: role == .footnote ? 16 : 24
                    )
                    Text(percent.map { "\(Self.fixed(abs($0)))%" } ?? "—")
                }
            default:
                HStack(spacing: 4) {
                    arrow
                    Text(label(value, percent))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(palette.color(token: "tone.\(tone).bg"), in: .capsule)
            }
        }
        .primitiveFont(role, weight: .medium)
        .monospacedDigit()
        .foregroundStyle(palette.tone(tone))
        .lineLimit(1)
        .fixedSize()
    }

    private func label(_ value: Double?, _ percent: Double?) -> String {
        guard let value else { return "—" }
        let pct = percent.map { " · \(Self.sign($0))\(Self.fixed(abs($0)))%" } ?? ""
        return "\(Self.sign(value))\(Self.fixed(abs(value)))\(pct)"
    }

    private static func sign(_ value: Double) -> String { value > 0 ? "+" : value < 0 ? "−" : "" }
    private static func fixed(_ value: Double) -> String { value
        .formatted(.number.precision(.fractionLength(2)).grouping(.never))
    }
}
