import SwiftUI

/// One entry of a primitive's design.json spec: which tokens fill, ink, outline and lift it.
/// `Button` `styles.primary` → `fill: surface.brand, ink: ink.onBrand, effect: component`.
struct PrimitiveLook: Equatable {
    var fill: String?
    var ink: String?
    var border: String?
    var effect: String?

    static let none = PrimitiveLook()

    init(fill: String? = nil, ink: String? = nil, border: String? = nil, effect: String? = nil) {
        self.fill = fill
        self.ink = ink
        self.border = border
        self.effect = effect
    }

    /// Reads `<path>.fill`, `.ink`, `.border` and `.effect` from `primitive`'s spec.
    init(_ palette: PrimitivePalette, _ primitive: String, _ path: String) {
        let spec = palette.theme?.spec(primitive, path)
        fill = spec?["fill"]?.stringValue
        ink = spec?["ink"]?.stringValue
        border = spec?["border"]?.stringValue
        effect = spec?["effect"]?.stringValue
    }
}

extension PrimitivePalette {
    func look(_ primitive: String, _ path: String) -> PrimitiveLook {
        PrimitiveLook(self, primitive, path)
    }

    /// The fill as a shape style: a flat colour, or the brand gradient top to bottom.
    func fillStyle(_ token: String?) -> AnyShapeStyle? {
        guard let token else { return nil }
        if let stops = gradient(token), stops.count > 1 {
            return AnyShapeStyle(LinearGradient(colors: stops, startPoint: .top, endPoint: .bottom))
        }
        return color(token).map { AnyShapeStyle($0) }
    }
}

extension View {
    /// Draws a spec look behind the view in a continuous rounded rectangle: the effect's
    /// outer shadows (one layered copy of the shape per shadow, so they do not compound),
    /// the fill, the inset shadows, then a 1 pt border. Also sets the look's ink as the
    /// foreground style.
    func primitiveSurface(_ look: PrimitiveLook, radius: CGFloat) -> some View {
        modifier(PrimitiveSurfaceModifier(look: look, radius: radius))
    }
}

private struct PrimitiveSurfaceModifier: ViewModifier {
    let look: PrimitiveLook
    let radius: CGFloat
    @Environment(\.primitivePalette) private var palette

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let shadows = palette.shadows(look.effect)
        let fill = palette.fillStyle(look.fill)
        content
            .foregroundStyle(palette.color(look.ink).map(AnyShapeStyle.init) ?? AnyShapeStyle(.foreground))
            .background {
                ZStack {
                    ForEach(Array(shadows.enumerated().filter { !$0.element.layer.inset }), id: \.offset) { _, shadow in
                        shape.fill(fill ?? AnyShapeStyle(Color.clear))
                            .shadow(
                                color: shadow.color,
                                radius: shadow.layer.blur / 2,
                                x: shadow.layer.x,
                                y: shadow.layer.y
                            )
                    }
                    if let fill { shape.fill(fill) }
                    ForEach(Array(shadows.enumerated().filter(\.element.layer.inset)), id: \.offset) { _, shadow in
                        InsetShadow(shape: shape, shadow: shadow)
                    }
                    if let border = palette.color(look.border) {
                        shape.strokeBorder(border, lineWidth: 1)
                    }
                }
            }
    }
}

/// A CSS `inset` shadow: the shape minus a copy offset by the shadow's x/y, blurred and
/// clipped to the shape, which leaves a soft band on the opposite edge.
private struct InsetShadow: View {
    let shape: RoundedRectangle
    let shadow: PrimitiveShadow

    var body: some View {
        shape.fill(shadow.color)
            .overlay {
                shape.offset(x: shadow.layer.x, y: shadow.layer.y).blendMode(.destinationOut)
            }
            .compositingGroup()
            .blur(radius: shadow.layer.blur / 2)
            .clipShape(shape)
            .allowsHitTesting(false)
    }
}
