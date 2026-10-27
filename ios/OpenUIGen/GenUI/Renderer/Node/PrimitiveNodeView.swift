import SwiftUI

/// Draws one node of the tree in the environment by id.
///
/// A node that is named but has not streamed in yet draws a shimmering placeholder; when
/// it arrives it fades in. An id the tree does not know draws nothing.
public struct PrimitiveNodeView: View {
    let id: String
    private let handle: OpenUIElementHandle?
    private let onEdit: (OpenUIEditAddress, Double) -> Void
    @Environment(\.primitiveTree) private var tree
    @Environment(\.primitiveHiddenIDs) private var hidden
    @Environment(\.openUIEditAction) private var editAction
    @Environment(\.primitiveShowsPending) private var showsPending

    public init(id: String) {
        self.id = id
        handle = nil
        onEdit = { _, _ in }
    }

    init(id child: PrimitiveChild, onEdit: @escaping (OpenUIEditAddress, Double) -> Void = { _, _ in }) {
        id = child.rawID
        if case let .openUI(value) = child { handle = value } else { handle = nil }
        self.onEdit = onEdit
    }

    public var body: some View {
        // One container keeps identity stable, so the placeholder → node swap transitions.
        ZStack {
            if let handle {
                OpenUIElementView(handle: handle, onEdit: editAction.perform)
            } else if hidden.contains(id) {
                EmptyView()
            } else if let node = tree.node(id) {
                PrimitiveSwitch(node: node)
                    .transition(.opacity)
            } else if showsPending, tree.isPending(id) {
                PendingPlaceholder()
                    .transition(.opacity)
            }
        }
    }
}

/// The one switch over the catalog. Each case is a small view in its category file.
struct PrimitiveSwitch: View {
    let node: PNode
    @Environment(\.primitiveScope) private var scope

    var body: some View {
        let props = PrimitiveProps(node: node, scope: scope)
        PrimitiveVisual(kind: node.primitive, props: props)
    }
}

/// Shared visual dispatch for static documents and retained OpenUI elements.
struct PrimitiveVisual: View {
    let kind: String
    let props: PrimitiveProps

    var body: some View {
        switch kind {
        case "Calculation":
            if props.isPrepared {
                VStack(alignment: .leading, spacing: 24) { PrimitiveChildren(ids: props.childReferences("children")) }
            } else {
                CalculationPrimitive(props: props).id(props.value("values"))
            }
        case "Slider": SliderPrimitive(props: props)
        case "ChoiceTags": ChoiceTagsPrimitive(props: props)
        // layout
        case "Stack": StackPrimitive(props: props)
        case "Grid": GridPrimitive(props: props)
        case "Rail": RailPrimitive(props: props)
        case "Card": CardPrimitive(props: props)
        case "Section": SectionPrimitive(props: props)
        case "Divider": DividerPrimitive(props: props)
        case "Spacer": SpacerPrimitive(props: props)
        case "Repeat": RepeatPrimitive(props: props)
        case "ZStack": ZStackPrimitive(props: props)
        case "Show": ShowPrimitive(props: props)
        case "Disclosure": DisclosurePrimitive(props: props)
        // text
        case "Text": TextPrimitive(props: props)
        case "Number": NumberPrimitive(props: props)
        // media
        case "Icon": IconPrimitive(props: props)
        case "Image": ImagePrimitive(props: props)
        case "Avatar": AvatarPrimitive(props: props)
        case "IconTile": IconTilePrimitive(props: props)
        case "AvatarStack": AvatarStackPrimitive(props: props)
        // controls
        case "Button": ButtonPrimitive(props: props)
        case "IconButton": IconButtonPrimitive(props: props)
        case "Pill": PillPrimitive(props: props)
        case "Badge": BadgePrimitive(props: props)
        case "Chip": ChipPrimitive(props: props)
        case "SegmentedControl": SegmentedControlPrimitive(props: props)
        case "Toggle": TogglePrimitive(props: props)
        case "Stepper": StepperPrimitive(props: props)
        // data
        case "ColorCell": ColorCellPrimitive(props: props)
        case "Progress": ProgressPrimitive(props: props)
        case "Bars": BarsPrimitive(props: props)
        case "ShareBar": ShareBarPrimitive(props: props)
        case "SplitBar": SplitBarPrimitive(props: props)
        case "Change": ChangePrimitive(props: props)
        case "Sparkline": PriceLinePrimitive(props: props, compact: true)
        case "PriceChart": PriceLinePrimitive(props: props, compact: false)
        case "Rating": RatingPrimitive(props: props)
        case "Note": NotePrimitive(props: props)
        // rows
        case "Row": RowPrimitive(props: props)
        case "KeyValue": KeyValuePrimitive(props: props)
        // chrome
        case "NavBar": NavBarPrimitive(props: props)
        case "Dock": DockPrimitive(props: props)
        default: UnknownPrimitive(name: kind)
        }
    }
}

/// A child list in order, each through `PrimitiveNodeView` so pending ids show placeholders.
struct PrimitiveChildren: View {
    let ids: [PrimitiveChild]

    init(ids: [String]) { self.ids = ids.map(PrimitiveChild.legacy) }
    init(ids: [PrimitiveChild]) { self.ids = ids }

    var body: some View {
        ForEach(ids, id: \.self) { PrimitiveNodeView(id: $0) }
    }
}

/// Where a node will be: a control-height rounded rectangle that pulses.
struct PendingPlaceholder: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveIsStatic) private var isStatic

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: PrimitiveMetrics.controlRadius, style: .continuous)
            .fill(palette.color(token: "surface.control"))
            .frame(maxWidth: .infinity, minHeight: PrimitiveMetrics.controlHeight)
        if isStatic || reduceMotion {
            shape
        } else {
            shape.phaseAnimator([1.0, 0.45]) { content, opacity in
                content.opacity(opacity)
            } animation: { _ in
                .easeInOut(duration: 0.8)
            }
        }
    }
}

/// Nothing in release; a red outline naming the primitive in debug builds.
struct UnknownPrimitive: View {
    let name: String

    var body: some View {
        #if DEBUG
            Text(verbatim: "Unknown primitive \(name)")
                .primitiveFont(.footnote)
                .foregroundStyle(.red)
                .padding(8)
                .overlay {
                    RoundedRectangle(cornerRadius: PrimitiveMetrics.smallControlRadius)
                        .strokeBorder(.red, style: StrokeStyle(lineWidth: 1, dash: [4]))
                }
        #else
            EmptyView()
        #endif
    }
}
