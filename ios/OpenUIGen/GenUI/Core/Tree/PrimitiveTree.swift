import Foundation

/// The tree a renderer draws, built up one `TreeEvent` at a time from either source: the
/// server's streamed events or `DSLTreeBuilder` over raw DSL.
///
/// A node named by a parent (or the root) before its own line arrives is pending; the
/// renderer shows a placeholder for it until `apply` brings the node.
public struct PrimitiveTree: Sendable, Equatable {
    public private(set) var placement: Placement?
    /// Node ids in arrival order.
    public private(set) var order: [String] = []
    public private(set) var issues: [TreeIssue] = []
    public private(set) var needs: [DataNeed] = []
    private var nodes: [String: PNode] = [:]
    /// Every id the root or a node names as a child.
    private var referenced: Set<String> = []

    public init() {}

    public init(events: some Sequence<TreeEvent>) {
        self.init()
        apply(contentsOf: events)
    }

    public mutating func apply(_ event: TreeEvent) {
        switch event {
        case let .root(placement):
            self.placement = placement
            referenced.formUnion(placement.children)
        case let .nodes(nodes, needs, _):
            for node in nodes where self.nodes[node.id] == nil {
                self.nodes[node.id] = node
                order.append(node.id)
                referenced.formUnion(node.children.values.joined())
            }
            self.needs += needs
        case let .issue(issue):
            issues.append(issue)
        }
    }

    public mutating func apply(contentsOf events: some Sequence<TreeEvent>) {
        for event in events {
            apply(event)
        }
    }

    /// The terminal SSE event repeats streamed metadata and adds end-of-tree issues.
    public mutating func reconcile(needs: [DataNeed], issues: [TreeIssue]) {
        for need in needs where !self.needs.contains(need) {
            self.needs.append(need)
        }
        for issue in issues where !self.issues.contains(issue) {
            self.issues.append(issue)
        }
    }

    public func node(_ id: String) -> PNode? {
        nodes[id]
    }

    /// Named by the root or a parent, but not defined yet.
    public func isPending(_ id: String) -> Bool {
        referenced.contains(id) && nodes[id] == nil
    }

    /// All ids still pending, sorted.
    public var pendingIDs: [String] {
        referenced.filter { nodes[$0] == nil }.sorted()
    }

    /// Nodes in arrival order.
    public var allNodes: [PNode] {
        order.compactMap { nodes[$0] }
    }

    /// The top-level ids the placement puts on screen.
    public var rootIDs: [String] {
        placement?.children ?? []
    }
}
