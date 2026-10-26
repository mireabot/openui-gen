import Foundation

/// A self-contained rebuild exported by the backend's `npm run ios:export`: the DSL source,
/// the tree the backend parsed from it, sample data, and the brand theme as flat tokens.
///
/// The `dsl` + `tree` pair is what the parity tests hold `DSLTreeBuilder` to.
public struct PrimitiveDocument: Sendable, Equatable, Codable, Identifiable {
    /// The backend's parsed tree (`TreeResult` without the statement count).
    public struct Tree: Sendable, Equatable, Codable {
        public let placement: Placement?
        public let nodes: [PNode]
        public let needs: [DataNeed]?
        public let issues: [TreeIssue]?

        public init(placement: Placement?, nodes: [PNode], needs: [DataNeed] = [], issues: [TreeIssue] = []) {
            self.placement = placement
            self.nodes = nodes
            self.needs = needs
            self.issues = issues
        }
    }

    /// `<exploration>/<variation>`, e.g. `earnings-calendar/e12`.
    public let key: String
    public let brand: String
    public let dsl: String
    public let tree: Tree
    public let data: PValue
    /// Nil for earlier exports/local sample data; "mock" for a generated server dataset.
    public let dataSource: String?
    public let sources: [WebSource]?
    public let searchedAt: String?
    public let theme: [String: String]
    /// Coarse frames of the tree's top blocks, as the `skeleton` SSE event would carry them.
    public let skeleton: PrimitiveSkeleton?

    public var id: String { key }

    /// A completed generation, including server-tree streams that carry no DSL source.
    public init(
        key: String,
        brand: String,
        dsl: String = "",
        tree: PrimitiveTree,
        data: PValue,
        theme: [String: String],
        skeleton: PrimitiveSkeleton? = nil,
        dataSource: String? = nil,
        sources: [WebSource]? = nil,
        searchedAt: String? = nil
    ) {
        self.key = key
        self.brand = brand
        self.dsl = dsl
        self.tree = Tree(placement: tree.placement, nodes: tree.allNodes, needs: tree.needs, issues: tree.issues)
        self.data = data
        self.dataSource = dataSource
        self.sources = sources
        self.searchedAt = searchedAt
        self.theme = theme
        self.skeleton = skeleton
    }

    /// An exported tree as it is (catalog variants, fixtures), without re-applying events.
    public init(
        key: String,
        brand: String,
        dsl: String,
        exported tree: Tree,
        data: PValue,
        theme: [String: String],
        skeleton: PrimitiveSkeleton?
    ) {
        self.key = key
        self.brand = brand
        self.dsl = dsl
        self.tree = tree
        self.data = data
        self.theme = theme
        self.skeleton = skeleton
        dataSource = nil
        sources = nil
        searchedAt = nil
    }

    public init(data: Data) throws {
        self = try JSONDecoder().decode(Self.self, from: data)
    }

    /// The bundled theme for this document's brand.
    public var designTheme: DesignTheme? {
        DesignTheme.bundled(brand: brand)?.restoring(tokens: theme)
    }

    /// A data scope over the sample data.
    public var dataScope: DataScope {
        DataScope(data: data)
    }

    /// The tree as the events that would have streamed it: the root, then one `nodes`
    /// event per node (inline children are not regrouped), then any issues.
    public var events: [TreeEvent] {
        var events: [TreeEvent] = []
        if let placement = tree.placement { events.append(.root(placement)) }
        events += tree.nodes.map { .nodes([$0], needs: [], parent: nil) }
        if let needs = tree.needs, !needs.isEmpty { events.append(.nodes([], needs: needs, parent: nil)) }
        events += (tree.issues ?? []).map(TreeEvent.issue)
        return events
    }
}

public extension PrimitiveTree {
    /// The document's exported tree, fully applied.
    init(document: PrimitiveDocument) {
        self.init(events: document.events)
    }
}
