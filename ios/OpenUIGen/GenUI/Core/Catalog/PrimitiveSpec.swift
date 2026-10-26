import Foundation

/// One primitive from `primitives.json`: its positional arguments and the documentation
/// the renderer is ported from.
public struct PrimitiveSpec: Sendable, Equatable, Hashable, Codable {
    public let name: String
    /// `layout`, `text`, `media`, `control`, `data`, `row` or `chrome`.
    public let category: String
    public let intent: String
    /// Positional order is API: the DSL's argument `i` is `args[i]`.
    public let args: [PropDefinition]
    /// Local behaviours the renderer owns: `roll`, `press`, `select`, `scroll`, ...
    public let behaviors: [String]
    /// Ground rules the renderer applies; documentation, not props.
    public let rules: [String]
    /// `proposed` or `released`.
    public let status: String
    /// The DSL signature line, e.g. `Spacer(size: space)`.
    public let signature: String?

    /// The `node` / `nodes` arguments, in positional order.
    public var nodeArgs: [PropDefinition] {
        args.filter(\.type.isNode)
    }

    /// The arguments that become props, in positional order.
    public var propArgs: [PropDefinition] {
        args.filter { !$0.type.isNode }
    }

    public func arg(named name: String) -> PropDefinition? {
        args.first { $0.name == name }
    }

    /// The primitives a node argument accepts; `nil` when it accepts any primitive or the
    /// argument is not a node argument.
    public func acceptedChildren(of argName: String) -> [String]? {
        arg(named: argName)?.type.accepts
    }

    /// Child ids in the catalog's argument order.
    public func orderedChildIDs(of node: PNode) -> [String] {
        nodeArgs.flatMap { node.children[$0.name] ?? [] }
    }
}
