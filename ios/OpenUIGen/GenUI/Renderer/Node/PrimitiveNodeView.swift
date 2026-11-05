import SwiftUI

/// Draws one retained child element.
struct PrimitiveNodeView: View {
    let child: PrimitiveChild

    init(id child: PrimitiveChild) {
        self.child = child
    }

    var body: some View {
        OpenUIElementView(handle: child.handle)
    }
}

/// The one switch over the catalog. Each case is a small view in its category file.
struct PrimitiveVisual: View {
    let kind: String
    let props: PrimitiveProps

    var body: some View {
        switch kind {
        // layout
        case "Stack": StackPrimitive(props: props)
        case "Grid": GridPrimitive(props: props)
        case "Rail": RailPrimitive(props: props)
        case "Card": CardPrimitive(props: props)
        case "Section": SectionPrimitive(props: props)
        case "Divider": DividerPrimitive(props: props)
        case "Spacer": SpacerPrimitive(props: props)
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
        case "StepTimeline": StepTimelinePrimitive(props: props)
        case "YearTimeline": YearTimelinePrimitive(props: props)
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

/// A child list in order.
struct PrimitiveChildren: View {
    let ids: [PrimitiveChild]

    var body: some View {
        ForEach(ids, id: \.self) { PrimitiveNodeView(id: $0) }
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
