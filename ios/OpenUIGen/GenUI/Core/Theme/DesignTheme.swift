import Foundation

/// The dark theme's neutrals with the brand's colours, or light.
public enum ScreenAppearance: String, Sendable, Codable, CaseIterable {
    case light
    case dark
}

/// One brand of the Atomize design language from the bundled `design.json`: flat colour
/// tokens, shadow stacks and the per-primitive anatomy specs.
///
/// Ground rules decide sizes, spacing, type and radii; this decides colour, surfaces,
/// outlines, elevation and blur. Tokens are flattened exactly like the backend's
/// `ios-export` (`ink.primary` → `#0a0c11`, arrays → their first value, plus `appearance`),
/// so `tokens` equals a rebuild document's `theme`.
public struct DesignTheme: Sendable, Equatable {
    public let brand: String
    /// `light` or `dark`.
    public let appearance: ScreenAppearance
    /// Flat tokens, including the `appearance` key.
    public let tokens: [String: String]
    /// Effect name → layers (`component`, `e2`, `pressed`, ...), with `{token}` colours unresolved.
    public let effects: [String: [ShadowLayer]]
    /// The one backdrop blur radius (`effects.blur`).
    public let blur: Double?
    /// Per-primitive specs, raw (`Button` → `{size, styles, states}`), shared by all brands.
    public let specs: [String: PValue]
    /// Gradient tokens, unflattened (`surface.brandGradient` → two colours).
    private let gradients: [String: [String]]

    /// Brands in design.json, sorted.
    public static var brands: [String] {
        DesignFile.bundled.themes.keys.sorted()
    }

    /// The brand design.json names as default.
    public static var defaultBrand: String {
        DesignFile.bundled.defaultTheme
    }

    /// The bundled theme for `brand`; `nil` for an unknown brand.
    public static func bundled(brand: String) -> DesignTheme? {
        try? DesignTheme(file: DesignFile.bundled, brand: brand)
    }

    /// Restores saved flat colours while retaining the bundled anatomy and effect definitions.
    public func restoring(tokens saved: [String: String]) -> DesignTheme {
        DesignTheme(base: self, saved: saved)
    }

    private init(base: DesignTheme, saved: [String: String]) {
        brand = base.brand
        tokens = base.tokens.merging(saved) { _, saved in saved }
        appearance = tokens["appearance"].flatMap(ScreenAppearance.init(rawValue:)) ?? base.appearance
        effects = base.effects
        blur = base.blur
        specs = base.specs
        gradients = base.gradients
    }

    /// Decodes `brand` from a design.json payload.
    public init(data: Data, brand: String) throws {
        try self.init(file: JSONDecoder().decode(DesignFile.self, from: data), brand: brand)
    }

    init(file: DesignFile, brand: String) throws {
        guard let theme = file.themes[brand] else { throw DesignFile.Error.unknownBrand(brand) }
        var tokens: [String: String] = [:]
        var gradients: [String: [String]] = [:]
        Self.walk(theme, prefix: "", tokens: &tokens, gradients: &gradients)
        self.brand = brand
        appearance = tokens["appearance"].flatMap(ScreenAppearance.init(rawValue:)) ?? .light
        self.tokens = tokens
        self.gradients = gradients
        specs = file.primitives

        var effects: [String: [ShadowLayer]] = [:]
        var blur: Double?
        for (name, value) in file.effects {
            switch value {
            case let .number(radius):
                blur = radius
            case let .string(css):
                guard let layers = ShadowLayer.stack(css) else { throw DesignFile.Error.badEffect(name, css) }
                effects[name] = layers
            default:
                throw DesignFile.Error.badEffect(name, value.scriptString)
            }
        }
        self.effects = effects
        self.blur = blur
    }

    /// `ios-export`'s `walk`: nested keys joined with dots, arrays → their first element.
    private static func walk(
        _ object: [String: PValue],
        prefix: String,
        tokens: inout [String: String],
        gradients: inout [String: [String]]
    ) {
        for (key, value) in object {
            if key == "appearance" {
                tokens["appearance"] = value.scriptString
            } else if case let .list(items) = value {
                tokens[prefix + key] = items.first?.scriptString ?? "undefined"
                gradients[prefix + key] = items.map(\.scriptString)
            } else if case let .object(child) = value {
                walk(child, prefix: "\(prefix)\(key).", tokens: &tokens, gradients: &gradients)
            } else {
                tokens[prefix + key] = value.scriptString
            }
        }
    }

    // MARK: Lookup

    /// The colour for a token (`ink.primary`, `tone.good.bg`) or a literal (`#ffffff`).
    public func color(_ token: String) -> DesignColor? {
        DesignColor(css: tokens[token] ?? token)
    }

    /// All stops of a gradient token, e.g. `surface.brandGradient`.
    public func gradient(_ token: String) -> [DesignColor]? {
        guard let stops = gradients[token] else { return nil }
        let colors = stops.compactMap(DesignColor.init(css:))
        return colors.count == stops.count ? colors : nil
    }

    /// An effect's layers with each `{token}` resolved to this brand's colour.
    public func shadows(_ effect: String) -> [ResolvedShadow]? {
        effects[effect]?.compactMap { layer in
            let resolved: DesignColor? = switch layer.paint {
            case let .token(token): color(token)
            case let .color(literal): literal
            }
            return resolved.map { ResolvedShadow(layer: layer, color: $0) }
        }
    }

    /// A value inside a primitive's spec by dotted path: `spec("Button", "styles.primary.fill")`.
    /// An empty path returns the whole spec.
    public func spec(_ primitive: String, _ path: String = "") -> PValue? {
        guard var value = specs[primitive] else { return nil }
        for key in path.split(separator: ".") {
            guard let next = value[String(key)] else { return nil }
            value = next
        }
        return value
    }
}

/// A shadow layer with its colour resolved for one brand.
public struct ResolvedShadow: Sendable, Equatable, Hashable {
    public let layer: ShadowLayer
    public let color: DesignColor
}

/// The design.json payload. Only what the renderer reads is decoded.
struct DesignFile: Sendable, Decodable {
    enum Error: Swift.Error, Equatable {
        case unknownBrand(String)
        case badEffect(String, String)
    }

    let version: Int
    let defaultTheme: String
    let themes: [String: [String: PValue]]
    let effects: [String: PValue]
    let primitives: [String: PValue]

    /// `design/atomize/design.json` with `design/kino/theme.json`'s themes added and Kino made
    /// the default, as the preview does in `preview/lib/primitives/design.ts`.
    static let bundled: DesignFile = {
        do {
            let design = try JSONDecoder().decode(DesignFile.self, from: BundledResource.data(named: "design"))
            let kino = try JSONDecoder().decode(ThemeFile.self, from: BundledResource.data(named: "theme"))
            return DesignFile(
                version: design.version,
                defaultTheme: "kino",
                themes: kino.themes.merging(design.themes) { _, design in design },
                effects: design.effects,
                primitives: design.primitives
            )
        } catch {
            fatalError("GenUI: bundled design.json or theme.json does not decode: \(error)")
        }
    }()
}

/// `design/kino/theme.json`: themes only.
private struct ThemeFile: Decodable {
    let themes: [String: [String: PValue]]
}
