import Foundation

/// One primitive in the tree: a validated DSL call with its props and child ids.
///
/// Inline calls inside a statement become nodes too, with derived ids:
/// `<parent>.<arg>` for a `node` argument and `<parent>.<arg>.<i>` for a `nodes` list.
public struct PNode: Sendable, Equatable, Hashable, Codable {
    public let id: String
    /// The catalog name, e.g. `Stack`, `Row`, `Repeat`.
    public let primitive: String
    /// Non-node arguments by name. Omitted optionals are absent, not `.null`.
    public let props: [String: PValue]
    /// Child ids per `node` / `nodes` argument, in order.
    public let children: [String: [String]]
    /// 1-based line of the statement in the model output.
    public let line: Int
    /// Set on nodes inside a Repeat template: the Repeat's id.
    public let itemOf: String?

    public init(
        id: String,
        primitive: String,
        props: [String: PValue],
        children: [String: [String]],
        line: Int,
        itemOf: String?
    ) {
        self.id = id
        self.primitive = primitive
        self.props = props
        self.children = children
        self.line = line
        self.itemOf = itemOf
    }

    /// Every child id this node names, across all of its node arguments. Arguments are
    /// taken in name order; for the catalog's positional order use
    /// `PrimitiveCatalog.nodeArgs(of:)` and `children[arg]`.
    public var childIDs: [String] {
        children.keys.sorted().flatMap { children[$0] ?? [] }
    }
}
