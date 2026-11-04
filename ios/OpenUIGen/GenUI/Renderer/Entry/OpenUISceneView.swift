import SwiftUI

/// A retained scene. Root observation covers membership only; each visual reads its own
/// properties, and each container reads only its own stable child-slot handles.
public struct OpenUISceneView: View {
    private let root: OpenUIRootHandle
    private let theme: DesignTheme?
    private let scrolls: Bool
    private let pending: [SkeletonFrame]
    private let editAction: OpenUIEditAction

    public init(
        root: OpenUIRootHandle,
        theme: DesignTheme? = .bundled(brand: "purple"),
        scrolls: Bool = true,
        pending: [SkeletonFrame] = [],
        onEdit: @escaping (OpenUIEditAddress, Double) -> Void = { _, _ in }
    ) {
        self.root = root
        self.theme = theme
        self.scrolls = scrolls
        self.pending = pending
        editAction = OpenUIEditAction(perform: onEdit)
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
        .environment(\.openUIEditAction, editAction)
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: PrimitiveMetrics.sectionGap) {
            ForEach(blocks, id: \.id) { handle in
                OpenUIElementView(handle: handle, onEdit: editAction.perform)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity)
            }
            ForEach(Array(pending.enumerated()), id: \.offset) { _, frame in
                SkeletonBlockView(frame: frame)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity)
            }
        }
        .animation(.smooth(duration: 0.25), value: pending.count)
        .padding(PrimitiveMetrics.screenInset)
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
    let onEdit: (OpenUIEditAddress, Double) -> Void

    var body: some View {
        PrimitiveVisual(kind: handle.kind, props: PrimitiveProps(handle: handle, onEdit: onEdit))
    }
}

/// A child carries its retained handle directly. No registry lookup runs during body evaluation.
enum PrimitiveChild: Hashable {
    case legacy(String)
    case openUI(OpenUIElementHandle)

    var rawID: String {
        switch self {
        case let .legacy(id): id
        case let .openUI(handle): handle.id.rawValue
        }
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        switch (lhs, rhs) {
        case let (.legacy(left), .legacy(right)): left == right
        case let (.openUI(left), .openUI(right)): left === right
        default: false
        }
    }

    func hash(into hasher: inout Hasher) {
        switch self {
        case let .legacy(id): hasher.combine(0); hasher.combine(id)
        case let .openUI(handle): hasher.combine(1); hasher.combine(ObjectIdentifier(handle))
        }
    }
}

/// Immutable interaction routing shared through the scene; contains no observable scene state.
struct OpenUIEditAction {
    let perform: (OpenUIEditAddress, Double) -> Void
    static var inert: OpenUIEditAction { .init { _, _ in } }
}

extension EnvironmentValues {
    @Entry var openUIEditAction = OpenUIEditAction.inert
}
