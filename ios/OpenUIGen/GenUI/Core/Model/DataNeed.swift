import Foundation

/// One `@path` the tree reads, so the host can fetch exactly the data it binds.
public struct DataNeed: Sendable, Equatable, Hashable, Codable {
    /// The path after `@`. Starts with `.` for a Repeat item field.
    public let path: String
    /// The node whose prop reads it.
    public let node: String
    /// The prop path inside the node, e.g. `value`, `series[0].label`.
    public let prop: String
    public let type: PropType
    /// For `@.field` inside a Repeat template: the Repeat whose items carry the field.
    public let itemOf: String?

    public init(path: String, node: String, prop: String, type: PropType, itemOf: String?) {
        self.path = path
        self.node = node
        self.prop = prop
        self.type = type
        self.itemOf = itemOf
    }
}
