import SwiftUI

/// Draws a `Screen` placement: the root children in a scroll view on the theme's screen
/// surface, 24 from the edges and 28 apart. The placement picks page or sheet presentation
/// and light or dark appearance. A NavBar that opens the page and a Dock that ends it are
/// pinned as chrome, so content scrolls under them.
///
/// A fragment (no root line) or an insert drawn here shows its top nodes the same way.
/// While streaming without a skeleton, missing nodes draw placeholders that fade into the
/// node. With a `skeleton`, whole top blocks shimmer in the skeleton's frames until each
/// block is complete (see `SkeletonBlocks`); pass `isStreaming: false` once the stream ends.
///
///     PrimitiveTreeView(tree: tree, data: document.data, theme: .bundled(brand: "purple"))
public struct PrimitiveTreeView: View {
    let tree: PrimitiveTree
    let data: PValue
    let theme: DesignTheme?
    let context: PrimitiveRenderContext
    let skeleton: PrimitiveSkeleton?
    let isStreaming: Bool
    /// No scroll views or entrance animations, for `ImageRenderer`.
    let isStatic: Bool

    public init(
        tree: PrimitiveTree,
        data: PValue,
        theme: DesignTheme?,
        context: PrimitiveRenderContext = .inert,
        skeleton: PrimitiveSkeleton? = nil,
        isStreaming: Bool = false
    ) {
        self.init(
            tree: tree,
            data: data,
            theme: theme,
            context: context,
            skeleton: skeleton,
            isStreaming: isStreaming,
            isStatic: false
        )
    }

    init(
        tree: PrimitiveTree,
        data: PValue,
        theme: DesignTheme?,
        context: PrimitiveRenderContext = .inert,
        skeleton: PrimitiveSkeleton? = nil,
        isStreaming: Bool = false,
        isStatic: Bool
    ) {
        self.tree = tree
        self.data = data
        self.theme = theme
        self.context = context
        self.skeleton = skeleton
        self.isStreaming = isStreaming
        self.isStatic = isStatic
    }

    public var body: some View {
        let palette = PrimitivePalette(theme: theme, appearance: tree.placement?.appearance)
        var chrome = PrimitiveChrome(tree: tree)
        // With a skeleton, chrome is pinned only once complete; until then it is a block.
        if skeleton != nil { chrome.keepComplete(in: tree) }
        return presentation(palette: palette, chrome: chrome)
            .environment(\.primitiveHiddenIDs, chrome.hidden)
            .environment(\.colorScheme, palette.colorScheme)
            .modifier(PrimitiveRoot(
                tree: tree,
                data: data,
                palette: palette,
                context: context,
                showsPending: skeleton == nil,
                isStatic: isStatic
            ))
    }

    @ViewBuilder
    private func presentation(palette: PrimitivePalette, chrome: PrimitiveChrome) -> some View {
        if tree.placement?.presentation == .sheet {
            SheetFrame(palette: palette) { page(palette: palette, chrome: chrome) }
        } else {
            page(palette: palette, chrome: chrome)
                .background(palette.color(token: "surface.screen").ignoresSafeArea())
        }
    }

    @ViewBuilder
    private func page(palette _: PrimitivePalette, chrome: PrimitiveChrome) -> some View {
        let content = blocks
            .padding(.horizontal, PrimitiveMetrics.screenInset)
            .padding(.top, chrome.topGap)
            .padding(.bottom, PrimitiveMetrics.screenInset)
        if isStatic {
            // Ideal heights, as a scroll view gives: a renderer that re-proposes the measured
            // height would otherwise let the stack squeeze wrapping text to one line.
            VStack(spacing: 0) {
                ChromeBar(ids: chrome.top)
                content
                ChromeBar(ids: chrome.bottom)
            }
            .fixedSize(horizontal: false, vertical: true)
        } else {
            ScrollView { content }
                .scrollIndicators(.hidden)
                .safeAreaBar(edge: .top, spacing: 0) { ChromeBar(ids: chrome.top) }
                .safeAreaBar(edge: .bottom, spacing: 0) { ChromeBar(ids: chrome.bottom) }
        }
    }

    @ViewBuilder
    private var blocks: some View {
        if let skeleton {
            SkeletonBlocks(skeleton: skeleton, isStreaming: isStreaming, fallbackIDs: topIDs)
        } else {
            PrimitiveBlocks(ids: topIDs)
        }
    }

    /// The placement's children; for a fragment without a root line, the first node.
    private var topIDs: [String] {
        tree.topLevelIDs
    }
}

/// Draws the root children of an `Insert` placement as a column, for the host to place next
/// to `placement.anchor` (after / before) or at the top / bottom of its screen. The host
/// owns the 24 screen inset and the background; this keeps the 28 gap between blocks.
/// A `skeleton` works as in `PrimitiveTreeView`.
public struct PrimitiveInsertView: View {
    let tree: PrimitiveTree
    let data: PValue
    let theme: DesignTheme?
    let context: PrimitiveRenderContext
    let skeleton: PrimitiveSkeleton?
    let isStreaming: Bool

    public init(
        tree: PrimitiveTree,
        data: PValue,
        theme: DesignTheme?,
        context: PrimitiveRenderContext = .inert,
        skeleton: PrimitiveSkeleton? = nil,
        isStreaming: Bool = false
    ) {
        self.tree = tree
        self.data = data
        self.theme = theme
        self.context = context
        self.skeleton = skeleton
        self.isStreaming = isStreaming
    }

    public var body: some View {
        Group {
            if let skeleton {
                SkeletonBlocks(skeleton: skeleton, isStreaming: isStreaming, fallbackIDs: tree.topLevelIDs)
            } else {
                PrimitiveBlocks(ids: tree.topLevelIDs)
            }
        }
        .modifier(PrimitiveRoot(
            tree: tree,
            data: data,
            palette: PrimitivePalette(theme: theme),
            context: context,
            showsPending: skeleton == nil,
            isStatic: false
        ))
    }
}

extension PrimitiveTree {
    /// The placement's children; for a fragment without a root line, the first node.
    var topLevelIDs: [String] {
        if !rootIDs.isEmpty { return rootIDs }
        return allNodes.first.map { [$0.id] } ?? []
    }
}

// MARK: Pieces

/// Puts the tree, data, palette and context in the environment, and animates arrivals.
private struct PrimitiveRoot: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let tree: PrimitiveTree
    let data: PValue
    let palette: PrimitivePalette
    let context: PrimitiveRenderContext
    let showsPending: Bool
    let isStatic: Bool

    func body(content: Content) -> some View {
        content
            .environment(\.primitiveTree, tree)
            .environment(\.primitiveShowsPending, showsPending)
            .environment(\.primitiveScope, DataScope(data: data))
            .environment(\.primitivePalette, palette)
            .environment(\.primitiveContext, context.dispatcher)
            .environment(\.primitiveIsStatic, isStatic)
            .animation(isStatic || reduceMotion ? nil : .easeOut(duration: 0.25), value: tree.order.count)
    }
}

/// Top-level blocks, 28 apart, each across the full width.
private struct PrimitiveBlocks: View {
    let ids: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: PrimitiveMetrics.sectionGap) {
            ForEach(ids, id: \.self) { id in
                PrimitiveNodeView(id: id)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

/// Pinned chrome: the hoisted nodes, drawn here and hidden in their stack.
private struct ChromeBar: View {
    let ids: [String]

    var body: some View {
        if !ids.isEmpty {
            VStack(spacing: 0) {
                ForEach(ids, id: \.self) { id in
                    PrimitiveNodeView(id: id)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, PrimitiveMetrics.screenInset)
            .environment(\.primitiveHiddenIDs, [])
        }
    }
}

/// Sheet presentation: a black backdrop, a sliver of the zoomed-back page, then the sheet
/// with rounded top corners.
private struct SheetFrame<Content: View>: View {
    let palette: PrimitivePalette
    @ViewBuilder let content: Content

    var body: some View {
        let top = UnevenRoundedRectangle(
            topLeadingRadius: PrimitiveMetrics.containerRadius,
            topTrailingRadius: PrimitiveMetrics.containerRadius,
            style: .continuous
        )
        VStack(spacing: 0) {
            top.fill(palette.color(token: "surface.filled"))
                .frame(height: 16)
                .padding(.horizontal, 16)
                .padding(.top, 8)
            content
                .background(palette.color(token: "surface.screen"))
                .clipShape(top)
                .padding(.top, -8)
        }
        .background(Color.black.ignoresSafeArea())
    }
}

/// Which top-level nodes become pinned chrome. Under the page (the single root Stack, or
/// the root itself): the leading run of NavBar / Spacer nodes (or vertical Stacks of only
/// those) when it holds a NavBar, and the trailing run of Dock nodes likewise.
struct PrimitiveChrome: Equatable {
    var top: [String] = []
    var bottom: [String] = []
    /// The page's gap, kept between the pinned NavBar and the first block.
    var topGap: CGFloat = 0

    var hidden: Set<String> {
        Set(top + bottom)
    }

    /// Unpins a run that is not complete yet, so it stays a skeleton block in the page.
    mutating func keepComplete(in tree: PrimitiveTree) {
        if !top.allSatisfy(tree.isComplete) {
            top = []
            topGap = 0
        }
        if !bottom.allSatisfy(tree.isComplete) { bottom = [] }
    }

    init(tree: PrimitiveTree) {
        guard tree.placement?.where == .screen else { return }
        var blocks = tree.rootIDs
        var gap = PrimitiveMetrics.sectionGap
        let page = blocks.count == 1 ? tree.node(blocks[0]) : nil
        if let page, page.primitive == "Stack", page.props["axis"] != .string("h") {
            blocks = page.children["children"] ?? []
            gap = page.props["gap"]?.numberValue.map { CGFloat($0) } ?? 0
        }
        top = Self.run(blocks, bar: "NavBar", in: tree)
        bottom = Array(Self.run(blocks.reversed(), bar: "Dock", in: tree).reversed())
        if !top.isEmpty { topGap = gap }
    }

    /// The run of chrome-only blocks from the start of `blocks`, trimmed of trailing
    /// spacers; empty unless it contains `bar`.
    private static func run(_ blocks: [String], bar: String, in tree: PrimitiveTree) -> [String] {
        var run = Array(blocks.prefix { isChrome($0, bar: bar, in: tree) })
        while let last = run.last, tree.node(last)?.primitive == "Spacer" { run.removeLast() }
        return run.contains { contains($0, bar: bar, in: tree) } ? run : []
    }

    private static func isChrome(_ id: String, bar: String, in tree: PrimitiveTree) -> Bool {
        guard let node = tree.node(id) else { return false }
        switch node.primitive {
        case bar, "Spacer": return true
        case "Stack" where node.props["axis"] != .string("h"):
            return (node.children["children"] ?? []).allSatisfy { isChrome($0, bar: bar, in: tree) }
        default: return false
        }
    }

    private static func contains(_ id: String, bar: String, in tree: PrimitiveTree) -> Bool {
        guard let node = tree.node(id) else { return false }
        return node.primitive == bar || node.childIDs.contains { contains($0, bar: bar, in: tree) }
    }
}
