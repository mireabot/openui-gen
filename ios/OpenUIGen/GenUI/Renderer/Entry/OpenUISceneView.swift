import SwiftUI

/// A retained scene. Root observation covers membership only; each visual reads its own
/// properties, and each container reads only its own stable child-slot handles.
public struct OpenUISceneView: View {
    private let root: OpenUIRootHandle
    private let theme: DesignTheme?
    private let scrolls: Bool
    private let pending: [SkeletonFrame]

    public init(
        root: OpenUIRootHandle,
        theme: DesignTheme? = .bundled(brand: "purple"),
        scrolls: Bool = true,
        pending: [SkeletonFrame] = []
    ) {
        self.root = root
        self.theme = theme
        self.scrolls = scrolls
        self.pending = pending
    }

    public var body: some View {
        let palette = PrimitivePalette(theme: theme)
        Group {
            if scrolls {
                ScrollView { content }
                    .scrollIndicators(.hidden)
                    .scrollDismissesKeyboard(.interactively)
            } else {
                content
            }
        }
        // No fill of its own: the host's surface shows through, as in the Ask tray.
        .environment(\.primitivePalette, palette)
        .environment(\.colorScheme, palette.colorScheme)
    }

    private var content: some View {
        // The screen has no horizontal padding: each block carries its own 16 inset, and that inset is
        // the bleed, so a rail (or a bleeding divider) reaches the screen edge and keeps the 16 as its
        // row's content margins.
        VStack(alignment: .leading, spacing: PrimitiveMetrics.sectionGap) {
            ForEach(blocks, id: \.id) { handle in
                OpenUIElementView(handle: handle)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, PrimitiveMetrics.blockInset)
                    .transition(.opacity)
            }
            ForEach(Array(pending.enumerated()), id: \.offset) { _, frame in
                SkeletonBlockView(frame: frame)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, PrimitiveMetrics.blockInset)
                    .transition(.opacity)
            }
        }
        .environment(\.primitiveBleed, PrimitiveMetrics.blockInset)
        .animation(.smooth(duration: 0.25), value: pending.count)
        .padding(.vertical, PrimitiveMetrics.screenInset)
    }

    /// The top-level blocks. `Screen` is the program's root, not a visual: this view is the screen,
    /// so its children lay out here with the screen inset and the gap between blocks.
    private var blocks: [OpenUIElementHandle] {
        root.children.flatMap { handle in
            handle.kind == "Screen" ? handle.slots["children"]?.children ?? [] : [handle]
        }
    }
}

struct OpenUIElementView: View {
    let handle: OpenUIElementHandle

    var body: some View {
        PrimitiveVisual(kind: handle.kind, props: PrimitiveProps(handle: handle))
    }
}

/// A child carries its retained handle directly, compared by object identity. No registry lookup
/// runs during body evaluation.
struct PrimitiveChild: Hashable {
    let handle: OpenUIElementHandle

    var rawID: String {
        handle.id.rawValue
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.handle === rhs.handle
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(ObjectIdentifier(handle))
    }
}
