import SwiftUI
import Testing
@testable import OpenUIGen

struct PaletteTests {
    static let inks = ["primary", "secondary", "tertiary", "inverse"]
    static let accents = [
        "red",
        "orange",
        "yellow",
        "green",
        "mint",
        "teal",
        "cyan",
        "blue",
        "indigo",
        "purple",
        "pink",
    ]
    static let tones = ["neutral", "good", "warn", "bad"]
    static let surfaces = ["screen", "card", "filled", "grouped", "glass", "control", "brand", "brandSoft"]

    static var palettes: [PrimitivePalette] {
        DesignTheme.brands.flatMap { brand in
            Placement.Appearance.allCases.map { appearance in
                PrimitivePalette(theme: DesignTheme.bundled(brand: brand), appearance: appearance)
            }
        }
    }

    @Test(arguments: palettes)
    func everyTokenTheRendererUsesResolves(palette: PrimitivePalette) throws {
        let label = "\(palette.theme?.brand ?? "?") \(palette.appearance)"
        for ink in Self.inks + ["brand", "brandStrong", "onBrand"] where !Self.inks.contains(ink) {
            #expect(palette.designColor("ink.\(ink)") != nil, "ink.\(ink) in \(label)")
        }
        for accent in Self.accents {
            #expect(palette.value(accent) != nil, "\(accent) in \(label)")
        }
        for tone in Self.tones {
            #expect(palette.designColor("tone.\(tone).fg") != nil, "tone.\(tone).fg in \(label)")
            #expect(palette.designColor("tone.\(tone).bg") != nil, "tone.\(tone).bg in \(label)")
        }
        for surface in Self.surfaces {
            #expect(palette.designColor("surface.\(surface)") != nil, "surface.\(surface) in \(label)")
        }
        #expect(palette.gradient("surface.brandGradient")?.count == 2)
        #expect(palette.designColor("outline.subtle") != nil)
    }

    /// Every token a primitive spec names (fill, ink, border) resolves, and every effect it
    /// names has all its shadow colours.
    @Test(arguments: palettes)
    func everySpecReferenceResolves(palette: PrimitivePalette) throws {
        let theme = try #require(palette.theme)
        var tokens: Set<String> = []
        var effects: Set<String> = []
        func walk(_ value: PValue, key: String) {
            switch value {
            case let .object(members):
                for (name, member) in members {
                    walk(member, key: name)
                }
            case let .string(text)
                where ["fill", "ink", "border"].contains(key) && Self.isToken(text): tokens.insert(text)
            case let .string(text) where key == "effect": effects.insert(text)
            default: break
            }
        }
        for spec in theme.specs.values {
            walk(spec, key: "")
        }
        #expect(!tokens.isEmpty)
        for token in tokens {
            #expect(palette.designColor(token) != nil || palette.gradient(token) != nil, "\(token)")
        }
        for effect in effects {
            #expect(palette.shadows(effect).count == theme.effects[effect]?.count, "\(effect)")
        }
    }

    /// `group.name` tokens; prose such as Number's `"as Text"` and literals are skipped.
    static func isToken(_ text: String) -> Bool {
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        return parts.count >= 2 && parts.allSatisfy { !$0.isEmpty && $0.allSatisfy(\.isLetter) }
    }

    @Test func aLightBrandRenderedDarkKeepsItsBrandColours() throws {
        let purple = try #require(DesignTheme.bundled(brand: "purple"))
        let dark = try #require(DesignTheme.bundled(brand: "dark"))
        let palette = PrimitivePalette(theme: purple, appearance: .dark)
        #expect(palette.colorScheme == .dark)
        #expect(palette.designColor("surface.brand") == purple.color("surface.brand"))
        #expect(palette.designColor("surface.screen") == dark.color("surface.screen"))
        #expect(palette.designColor("ink.primary") == dark.color("ink.primary"))
    }

    @Test func inkRolesMapToThemeInk() throws {
        let palette = PrimitivePalette(theme: DesignTheme.bundled(brand: "purple"))
        #expect(palette.ink("inverse") == palette.color(token: "ink.onBrand"))
        #expect(palette.ink(nil) == palette.color(token: "ink.primary"))
        #expect(palette.ink("indigo") == .indigo)
        #expect(palette.value("#ff0000") == Color(DesignColor(red: 1, green: 0, blue: 0)))
        #expect(palette.value("nonsense") == nil)
    }
}

extension PrimitivePalette: CustomTestStringConvertible {
    public var testDescription: String {
        "\(theme?.brand ?? "none") \(appearance)"
    }
}

@MainActor
struct ColorCellRenderingTests {
    private let palette = PrimitivePalette.standard

    @Test(arguments: ["12", "24", "32"])
    func fixedCellsKeepTheirSquareSize(_ size: String) throws {
        let image = try render(props: ["size": .string(size)], width: 200)
        #expect(image.width == Int(size))
        #expect(image.height == Int(size))
    }

    @Test func fluidCellUsesTheProposedColumnWidth() throws {
        let image = try render(props: [:], width: 27)
        #expect(image.width == 27)
        #expect(image.height == 27)
    }

    @Test(arguments: ["tone.good.fg", "tone.bad.fg", "outline.control", "surface.filled"])
    func cellDrawsItsPaletteFill(_ token: String) throws {
        let actual = try render(props: ["fill": .string(token), "size": .string("24")], width: 100)
        let expected = try solid(palette.color(token: token))
        #expect(try center(actual) == center(expected), "\(token)")
    }

    @Test func dataColourOverridesTheToken() throws {
        let actual = try render(props: ["color": .string("#6f42c1"), "size": .string("24")], width: 100)
        let expected = try solid(#require(palette.value("#6f42c1")))
        #expect(try center(actual) == center(expected))
    }

    @Test(arguments: ["", "invalid", "#fff"])
    func invalidDataColourFallsBackToTheToken(_ color: String) throws {
        let actual = try render(props: ["color": .string(color), "size": .string("24")], width: 100)
        let expected = try solid(palette.color(token: "surface.brand"))
        #expect(try center(actual) == center(expected))
    }

    private func render(props: [String: PValue], width: CGFloat) throws -> CGImage {
        let node = PNode(
            id: "cell", primitive: "ColorCell",
            props: ["label": .string("Status"), "fill": .string("surface.brand")].merging(props) { _, new in new },
            children: [:], line: 1, itemOf: nil
        )
        let renderer = ImageRenderer(content: ColorCellPrimitive(props: PrimitiveProps(node: node, scope: DataScope(data: .null)))
            .environment(\.primitivePalette, palette))
        renderer.scale = 1
        renderer.proposedSize = ProposedViewSize(width: width, height: nil)
        return try #require(renderer.cgImage)
    }

    private func solid(_ color: Color) throws -> CGImage {
        let renderer = ImageRenderer(content: Rectangle().fill(color).frame(width: 24, height: 24))
        renderer.scale = 1
        return try #require(renderer.cgImage)
    }

    private func center(_ image: CGImage) throws -> [UInt8] {
        let data = try #require(image.dataProvider?.data)
        let pointer = try #require(CFDataGetBytePtr(data))
        let count = image.bitsPerPixel / 8
        let offset = image.height / 2 * image.bytesPerRow + image.width / 2 * count
        return (0 ..< count).map { pointer[offset + $0] }
    }
}

@MainActor
struct BadgeRenderingTests {
    @Test func regularBadgePreservesItsExistingHeight() throws {
        #expect(try render([:]).height == 24)
    }

    @Test func largeBadgeUsesTheHeroProportions() throws {
        let image = try render(["size": .string("large"), "fill": .string("tone.good.fg"), "ink": .string("surface.screen")])
        #expect(image.height == 42)
        #expect(image.width > 70)
    }

    @Test func plainLargeBadgeHasNoPillPadding() throws {
        let image = try render(["size": .string("large"), "fill": .string("none"), "ink": .string("ink.secondary"), "label": .string("—")])
        #expect(image.height == 34)
        #expect(image.width < 40)
    }

    private func render(_ properties: [String: PValue]) throws -> CGImage {
        let node = PNode(
            id: "badge", primitive: "Badge",
            props: ["label": .string("7.21"), "tone": .string("good")].merging(properties) { _, new in new },
            children: [:], line: 1, itemOf: nil
        )
        let renderer = ImageRenderer(content: BadgePrimitive(props: PrimitiveProps(node: node, scope: DataScope(data: .null)))
            .environment(\.primitivePalette, PrimitivePalette.standard))
        renderer.scale = 1
        return try #require(renderer.cgImage)
    }
}
