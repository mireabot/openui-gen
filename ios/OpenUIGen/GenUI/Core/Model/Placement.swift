import Foundation

/// Where a generation goes: the root line's top-level ids and how they are placed.
public struct Placement: Sendable, Equatable, Hashable, Codable {
    public enum Where: String, Sendable, Codable, CaseIterable {
        case screen
        case after
        case before
        case top
        case bottom
        case fragment
    }

    /// Screen mode: a full page, or a sheet over the zoomed-back page.
    public enum Presentation: String, Sendable, Codable, CaseIterable {
        case page
        case sheet
    }

    /// Screen mode: the dark theme's neutrals with the brand's colours, or light.
    public enum Appearance: String, Sendable, Codable, CaseIterable {
        case light
        case dark
    }

    public let children: [String]
    public let `where`: Where
    /// The host node id for `after` / `before` inserts.
    public let anchor: String?
    /// Screen mode only.
    public let presentation: Presentation?
    /// Screen mode only.
    public let appearance: Appearance?

    public init(
        children: [String],
        where: Where,
        anchor: String? = nil,
        presentation: Presentation? = nil,
        appearance: Appearance? = nil
    ) {
        self.children = children
        self.where = `where`
        self.anchor = anchor
        self.presentation = presentation
        self.appearance = appearance
    }
}
