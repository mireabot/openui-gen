import Foundation

/// One positional argument of a primitive, or one field of an `object` prop.
public struct PropDefinition: Sendable, Equatable, Hashable, Codable {
    /// Who writes the value.
    public enum Source: String, Sendable, Codable {
        /// The model writes a literal (or may bind `@path`).
        case copy
        /// Bound from app data; the model must write `@path`.
        case data
    }

    public let name: String
    public let type: PropType
    /// Trailing optional arguments may be left out or written as `null`.
    public let optional: Bool
    public let source: Source
    public let note: String?

    public init(name: String, type: PropType, optional: Bool, source: Source, note: String? = nil) {
        self.name = name
        self.type = type
        self.optional = optional
        self.source = source
        self.note = note
    }
}
