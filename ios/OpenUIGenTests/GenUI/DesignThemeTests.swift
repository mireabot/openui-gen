import Foundation
import SwiftUI
import Testing
@testable import OpenUIGen

struct DesignThemeTests {
    /// Catches the Kino merge in `DesignFile.bundled` dropping a file or the default brand.
    @Test
    func bundlesKinoAsTheDefaultAlongsideTheAtomizeBrands() {
        #expect(DesignTheme.brands == ["dark", "kino", "orange", "pink", "purple"])
        #expect(DesignTheme.defaultBrand == "kino")
        #expect(DesignTheme.bundled(brand: "teal") == nil)
    }

    @Test(arguments: DesignTheme.brands)
    func everyBrandDecodesWithParsableColours(brand: String) throws {
        let theme = try #require(DesignTheme.bundled(brand: brand))
        #expect(theme.brand == brand)
        // `type.<role>.size|line` are a theme's own type sizes (Kino), not colours.
        for (token, value) in theme.tokens where token != "appearance" && !token.hasPrefix("type.") {
            #expect(theme.color(token) != nil, "\(brand): \(token) = \(value)")
        }
        #expect(theme.gradient("surface.brandGradient")?.count == 2)
        #expect(theme.blur == 24)
        for effect in theme.effects.keys {
            let shadows = try #require(theme.shadows(effect))
            #expect(shadows.count == theme.effects[effect]?.count, "\(brand): \(effect) has an unresolved colour")
        }
    }

    @Test
    func everyBrandHasTheSameTokenKeys() throws {
        // Colour tokens only: a theme may add its own type sizes (`type.*`, Kino).
        let keys = try DesignTheme.brands
            .map { try Set(#require(DesignTheme.bundled(brand: $0)).tokens.keys.filter { !$0.hasPrefix("type.") }) }
        #expect(Set(keys).count == 1)
    }

    @Test
    func parsesColourFormats() {
        #expect(DesignColor(css: "#fff") == DesignColor(red: 1, green: 1, blue: 1))
        #expect(DesignColor(css: "#6f61ff1f") == DesignColor(red: 111 / 255, green: 97 / 255, blue: 1, alpha: 31 / 255))
        #expect(DesignColor(css: "rgba(255, 0, 0, 0.5)") == DesignColor(red: 1, green: 0, blue: 0, alpha: 0.5))
        #expect(DesignColor(css: "#12345") == nil)
        #expect(DesignColor(css: "red") == nil)
    }

    @Test
    func resolvesLightAndDarkAppearance() throws {
        #expect(try #require(DesignTheme.bundled(brand: "purple")).appearance == .light)
        let pink = try #require(DesignTheme.bundled(brand: "pink"))
        #expect(pink.appearance == .dark)
        // Radix gray 12 (#eeeeee): dark ink is off-white, not pure white.
        #expect(pink.color("ink.primary") == DesignColor(red: 238 / 255, green: 238 / 255, blue: 238 / 255))
    }

    @Test
    func parsesShadowStacks() throws {
        let theme = try #require(DesignTheme.bundled(brand: "purple"))
        let component = try #require(theme.effects["component"])
        #expect(component == [
            ShadowLayer(x: 0, y: 3, blur: 3, spread: 0, paint: .token("shadow.highlightMed"), inset: true),
            ShadowLayer(x: 0, y: 1, blur: 1, spread: -0.5, paint: .token("shadow.base"), inset: false),
        ])
        #expect(theme.effects["e5"]?.count == 5)
        #expect(theme.shadows("pressed")?.first?.color == theme.color("surface.brandSoft"))
    }

    @Test
    func looksUpPrimitiveSpecs() throws {
        let theme = try #require(DesignTheme.bundled(brand: "purple"))
        #expect(theme.spec("Button", "styles.primary.fill") == .string("surface.brand"))
        #expect(theme.spec("Button", "size.height") == .number(44))
        #expect(theme.spec("Button", "styles.text.border") == .null)
        #expect(theme.spec("Button", "styles.missing") == nil)
        #expect(theme.spec("Card")?.objectValue?["surfaces"] != nil)
    }
}


@MainActor
struct SkeletonLayoutTests {
    @Test func layoutInsetsAndRowSpacingSurviveTheWireFormat() throws {
        let json = #"""
        {
          "kind": "stack",
          "axis": "v",
          "gap": 0,
          "paddingX": 16,
          "paddingY": 12,
          "children": [
            {
              "kind": "grid",
              "columns": 2,
              "gap": 16,
              "rowGap": 24,
              "children": [
                {
                  "kind": "line",
                  "height": 20,
                  "width": 1
                },
                {
                  "kind": "line",
                  "height": 20,
                  "width": 1
                },
                {
                  "kind": "line",
                  "height": 20,
                  "width": 1
                }
              ]
            }
          ]
        }
        """#
        let frame = try JSONDecoder().decode(SkeletonFrame.self, from: Data(json.utf8))
        let encoded = try JSONEncoder().encode(frame)
        #expect(try JSONDecoder().decode(SkeletonFrame.self, from: encoded) == frame)
        let output = try JSONDecoder().decode(PValue.self, from: encoded)
        #expect(output["paddingX"] == .number(16))
        #expect(output["paddingY"] == .number(12))
        #expect(output["children"]?.listValue?.first?["rowGap"] == .number(24))
        let image = try render(frame)
        #expect(image.width == 200)
        #expect(image.height == 88)
    }

    @Test func olderFramesKeepUnpaddedEqualGapLayout() throws {
        let json = #"""
        {
          "kind": "stack",
          "axis": "v",
          "gap": 0,
          "children": [
            {
              "kind": "grid",
              "columns": 2,
              "gap": 16,
              "children": [
                {
                  "kind": "line",
                  "height": 20,
                  "width": 1
                },
                {
                  "kind": "line",
                  "height": 20,
                  "width": 1
                },
                {
                  "kind": "line",
                  "height": 20,
                  "width": 1
                }
              ]
            }
          ]
        }
        """#
        let frame = try JSONDecoder().decode(SkeletonFrame.self, from: Data(json.utf8))
        let image = try render(frame)
        #expect(image.width == 200)
        #expect(image.height == 56)
    }

    private func render(_ frame: SkeletonFrame) throws -> CGImage {
        let renderer = ImageRenderer(content: SkeletonFrameView(frame: frame))
        renderer.scale = 1
        renderer.proposedSize = ProposedViewSize(width: 200, height: nil)
        return try #require(renderer.cgImage)
    }
}
