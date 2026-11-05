import SwiftUI

/// Colour lookup for one brand in one appearance.
///
/// A light brand drawn on a `Screen(…, "dark")` root takes the dark theme's neutrals and
/// keeps its own brand colours, like the web's `themeVars`. Values a program or the data
/// carry (`#hex`, an iOS accent name, a `group.token`) resolve through `value(_:)`.
struct PrimitivePalette: Sendable, Equatable {
    /// Tokens a dark screen keeps from the brand; everything else comes from the dark theme.
    static let brandKeys: Set<String> = [
        "ink.brand", "ink.onBrand", "surface.brand", "surface.brandSoft", "surface.brandGradient",
    ]

    /// The default brand in its own appearance. Used as the environment default.
    static let standard = PrimitivePalette(theme: DesignTheme.bundled(brand: DesignTheme.defaultBrand))

    let theme: DesignTheme?
    let appearance: ScreenAppearance
    /// The dark theme, when a light brand renders dark.
    private let neutrals: DesignTheme?

    init(theme: DesignTheme?, appearance: ScreenAppearance? = nil) {
        self.theme = theme
        let resolved = appearance ?? theme?.appearance ?? .light
        self.appearance = resolved
        neutrals = resolved == .dark && theme?.appearance != .dark ? DesignTheme.bundled(brand: "dark") : nil
    }

    var colorScheme: ColorScheme {
        appearance == .dark ? .dark : .light
    }

    /// The theme a token reads from: the brand, or the dark neutrals for non-brand tokens.
    private func source(for token: String) -> DesignTheme? {
        if let neutrals, !Self.brandKeys.contains(token) { return neutrals }
        return theme
    }

    // MARK: Tokens

    /// A theme token (`ink.primary`, `tone.good.bg`) or a literal (`#ffffff`).
    func designColor(_ token: String) -> DesignColor? {
        if token.hasPrefix("#") || token.hasPrefix("rgb") { return DesignColor(css: token) }
        return source(for: token)?.color(token)
    }

    func color(_ token: String?) -> Color? {
        token.flatMap(designColor).map(Color.init)
    }

    /// A token known to exist; falls back to clear so a missing token never crashes.
    func color(token: String) -> Color {
        color(token) ?? .clear
    }

    func gradient(_ token: String) -> [Color]? {
        source(for: token)?.gradient(token)?.map(Color.init)
    }

    /// An effect's shadow layers with colours from this palette.
    func shadows(_ effect: String?) -> [PrimitiveShadow] {
        guard let effect, let layers = theme?.effects[effect] else { return [] }
        return layers.compactMap { layer in
            let resolved: DesignColor? = switch layer.paint {
            case let .token(token): designColor(token)
            case let .color(literal): literal
            }
            return resolved.map { PrimitiveShadow(layer: layer, color: Color($0)) }
        }
    }

    /// A value from the program or the data: `#hex`, a theme token with a dot, or an iOS
    /// accent name (`indigo`). `nil` for anything else.
    func value(_ value: String?) -> Color? {
        guard let value else { return nil }
        if value.hasPrefix("#") { return color(value) }
        if value.contains(".") { return color(value) }
        return Self.accent(value)
    }

    /// Text and icon ink: the four roles map to theme ink, accents to iOS system colours.
    func ink(_ value: String?) -> Color {
        switch value ?? "primary" {
        case "primary": color(token: "ink.primary")
        case "secondary": color(token: "ink.secondary")
        case "tertiary": color(token: "ink.tertiary")
        case "inverse": color(token: "ink.onBrand")
        case let other: self.value(other) ?? color(token: "ink.primary")
        }
    }

    /// `good`/`warn`/`bad`/`neutral` foreground.
    func tone(_ tone: String?) -> Color {
        color(token: "tone.\(tone ?? "neutral").fg")
    }

    static func accent(_ name: String) -> Color? {
        accents[name]
    }

    /// The language's accent ink names (plus brown and gray) as iOS system colours.
    private static let accents: [String: Color] = [
        "red": .red, "orange": .orange, "yellow": .yellow, "green": .green, "mint": .mint,
        "teal": .teal, "cyan": .cyan, "blue": .blue, "indigo": .indigo, "purple": .purple,
        "pink": .pink, "brown": .brown, "gray": .gray, "grey": .gray,
    ]
}

/// One shadow layer ready to draw.
struct PrimitiveShadow: Equatable {
    let layer: ShadowLayer
    let color: Color
}

extension Color {
    init(_ color: DesignColor) {
        self.init(.sRGB, red: color.red, green: color.green, blue: color.blue, opacity: color.alpha)
    }
}
