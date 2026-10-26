import Foundation

/// One layer of a CSS-style `box-shadow` stack from design.json's `effects`, e.g.
/// `inset 0 3px 3px 0 {shadow.highlightMed}`. Colours are `{token}` references or literals.
public struct ShadowLayer: Sendable, Equatable, Hashable {
    public enum Paint: Sendable, Equatable, Hashable {
        /// A theme token such as `shadow.low`, resolved per brand with `DesignTheme.color(_:)`.
        case token(String)
        case color(DesignColor)
    }

    public let x: Double
    public let y: Double
    public let blur: Double
    public let spread: Double
    public let paint: Paint
    public let inset: Bool

    public init(x: Double, y: Double, blur: Double, spread: Double, paint: Paint, inset: Bool) {
        self.x = x
        self.y = y
        self.blur = blur
        self.spread = spread
        self.paint = paint
        self.inset = inset
    }

    /// Parses a comma-separated stack. `nil` when any layer is malformed.
    static func stack(_ css: String) -> [ShadowLayer]? {
        var layers: [ShadowLayer] = []
        for part in splitLayers(css) {
            guard let layer = layer(part) else { return nil }
            layers.append(layer)
        }
        return layers.isEmpty ? nil : layers
    }

    /// Splits on commas outside parentheses, so `rgba(0, 0, 0, 0.1)` stays one colour.
    private static func splitLayers(_ css: String) -> [String] {
        var parts: [String] = []
        var current = ""
        var depth = 0
        for character in css {
            if character == "(" { depth += 1 } else if character == ")" { depth -= 1 }
            if character == ",", depth == 0 {
                parts.append(current)
                current = ""
            } else {
                current.append(character)
            }
        }
        parts.append(current)
        return parts.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    /// `[inset] x y [blur [spread]] colour`, lengths in px or unitless.
    private static func layer(_ css: String) -> ShadowLayer? {
        var inset = false
        var lengths: [Double] = []
        var paint: Paint?
        var rest = Substring(css)
        while let word = nextWord(&rest) {
            if word == "inset" {
                inset = true
            } else if word.hasPrefix("{"), word.hasSuffix("}") {
                paint = .token(String(word.dropFirst().dropLast()))
            } else if let length = Double(word.hasSuffix("px") ? String(word.dropLast(2)) : word) {
                lengths.append(length)
            } else if let color = DesignColor(css: word) {
                paint = .color(color)
            } else {
                return nil
            }
        }
        guard let paint, (2 ... 4).contains(lengths.count) else { return nil }
        let padded = lengths + Array(repeating: 0, count: 4 - lengths.count)
        return ShadowLayer(x: padded[0], y: padded[1], blur: padded[2], spread: padded[3], paint: paint, inset: inset)
    }

    /// The next space-separated word, keeping `rgba( ... )` together.
    private static func nextWord(_ source: inout Substring) -> String? {
        source = source.drop { $0 == " " }
        guard !source.isEmpty else { return nil }
        var word = ""
        var depth = 0
        while let character = source.first, depth > 0 || character != " " {
            if character == "(" { depth += 1 } else if character == ")" { depth -= 1 }
            word.append(character)
            source.removeFirst()
        }
        return word
    }
}
