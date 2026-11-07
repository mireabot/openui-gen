import SwiftUI

/// The ground rules as points: sizes, spacing, type and radii. These win over the design
/// theme (GENUI-PLAN §2): the theme only decides colour, surfaces, outlines and effects.
enum PrimitiveMetrics {
    /// The screen's top and bottom padding. It has no horizontal padding: blocks carry `blockInset`.
    static let screenInset: CGFloat = 24
    /// Each top-level block's horizontal inset, and the bleed full-bleed children reach across.
    static let blockInset: CGFloat = 16
    static let sectionGap: CGFloat = 28
    static let labelGap: CGFloat = 12
    static let containerPadding: CGFloat = 16
    static let controlHeight: CGFloat = 44
    static let containerRadius: CGFloat = 24
    static let controlRadius: CGFloat = 12
    static let smallControlRadius: CGFloat = 8
    static let innerRadius: CGFloat = 4
    /// Larger than any control, so `RoundedRectangle` clamps it to a capsule or a circle.
    static let pill: CGFloat = 1000
    /// Vertical padding inside rails so rings and shadows are not clipped.
    static let railVerticalPadding: CGFloat = 4
}

/// A type role from the ground rules: SF Pro at a fixed size and line height.
struct PrimitiveTypeRole: Equatable {
    /// The role's token name (`footnote`, `body`, ...): a theme may set its own size for it.
    let name: String
    let size: CGFloat
    let lineHeight: CGFloat

    static let footnote = Self(name: "footnote", size: 14, lineHeight: 18)
    static let body = Self(name: "body", size: 16, lineHeight: 20)
    static let headline = Self(name: "headline", size: 18, lineHeight: 22)
    static let title3 = Self(name: "title3", size: 20, lineHeight: 25)
    static let title2 = Self(name: "title2", size: 22, lineHeight: 28)
    static let display = Self(name: "display", size: 24, lineHeight: 28)
    static let title1 = Self(name: "title1", size: 28, lineHeight: 34)

    /// An unknown or missing role falls back to body, as on the web.
    init(token: String?) {
        self = switch token {
        case "footnote": .footnote
        case "headline": .headline
        case "title3": .title3
        case "title2": .title2
        case "display": .display
        case "title1": .title1
        default: .body
        }
    }

    private init(name: String, size: CGFloat, lineHeight: CGFloat) {
        self.name = name
        self.size = size
        self.lineHeight = lineHeight
    }

    /// The role as a theme sets it (the default theme's `type.body.size` = `15px`, `type.body.line` = `22px`);
    /// the ground-rule size is the fallback, as with the web's `--ds-type-<role>-size`.
    func themed(_ theme: DesignTheme?) -> PrimitiveTypeRole {
        let points = { (key: String) in
            theme?.tokens["type.\(name).\(key)"].flatMap { Double($0.replacingOccurrences(of: "px", with: "")) }
                .map { CGFloat($0) }
        }
        return PrimitiveTypeRole(name: name, size: points("size") ?? size, lineHeight: points("line") ?? lineHeight)
    }

    /// The extra space between lines that brings SF Pro's natural leading (about 1.2× the
    /// size) to the role's line height.
    var lineSpacing: CGFloat {
        max(0, lineHeight - (size * 1.2).rounded())
    }
}

extension Font.Weight {
    /// `regular`, `medium` or `semibold`; anything else is regular.
    init(token: String?) {
        self = switch token {
        case "medium": .medium
        case "semibold": .semibold
        default: .regular
        }
    }
}

extension View {
    /// SF Pro in a type role and weight, with the role's line height (the theme's own size
    /// for the role when it sets one).
    func primitiveFont(_ role: PrimitiveTypeRole, weight: Font.Weight = .regular) -> some View {
        modifier(PrimitiveFont(role: role, weight: weight))
    }
}

private struct PrimitiveFont: ViewModifier {
    let role: PrimitiveTypeRole
    let weight: Font.Weight
    @Environment(\.primitivePalette) private var palette

    func body(content: Content) -> some View {
        let role = role.themed(palette.theme)
        content.font(.system(size: role.size, weight: weight)).lineSpacing(role.lineSpacing)
    }
}
