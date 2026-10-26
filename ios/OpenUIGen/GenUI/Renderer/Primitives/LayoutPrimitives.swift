import SwiftUI

// MARK: Stack

/// `Stack(axis, gap, children, align?, justify?, overlap?)`. A vertical stack stretches its
/// children across the width (flex column `stretch`); a horizontal one centres them.
struct StackPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitiveHiddenIDs) private var hidden

    var body: some View {
        let ids = props.childReferences("children").filter { !hidden.contains($0.rawID) }
        if props.string("axis") == "wrap" {
            // Children keep their own width and flow into rows, one gap both ways.
            FlowLayout(spacing: gap) {
                ForEach(ids, id: \.self) { PrimitiveNodeView(id: $0) }
            }
            .environment(\.primitiveStackAxis, .horizontal)
        } else if props.string("axis") == "h" {
            horizontal(ids)
                .environment(\.primitiveStackAxis, .horizontal)
        } else {
            vertical(ids)
                .environment(\.primitiveStackAxis, .vertical)
        }
    }

    private var gap: CGFloat {
        props.cgFloat("gap") ?? 0
    }

    /// Children after the first overlap the previous one by this much.
    private var overlap: CGFloat? {
        props.cgFloat("overlap")
    }

    @ViewBuilder
    private func horizontal(_ ids: [PrimitiveChild]) -> some View {
        let between = props.string("justify") == "between"
        let alignment: VerticalAlignment = switch props.string("align") {
        case "start": .top
        case "end": .bottom
        default: .center
        }
        HStack(alignment: alignment, spacing: overlap.map { -$0 } ?? (between ? 0 : gap)) {
            // `between` puts spacers between the children as siblings, so the HStack sees
            // them as the most flexible items and still lets text wrap.
            ForEach(Self.slots(ids, between: between)) { slot in
                switch slot {
                case let .node(id, index):
                    PrimitiveNodeView(id: id).zIndex(Double(index))
                case .gap:
                    Spacer(minLength: gap)
                }
            }
        }
        .frame(maxWidth: justifyAlignment == nil ? nil : .infinity, alignment: justifyAlignment ?? .leading)
    }

    enum Slot: Identifiable {
        case node(PrimitiveChild, index: Int)
        case gap(before: PrimitiveChild)

        var id: String {
            switch self {
            case let .node(id, _): "node:\(id.rawID)"
            case let .gap(before): "gap:\(before.rawID)"
            }
        }
    }

    static func slots(_ ids: [PrimitiveChild], between: Bool) -> [Slot] {
        ids.enumerated().flatMap { index, id -> [Slot] in
            between && index > 0 ? [.gap(before: id), .node(id, index: index)] : [.node(id, index: index)]
        }
    }

    private var justifyAlignment: Alignment? {
        switch props.string("justify") {
        case "center": .center
        case "end": .trailing
        default: nil
        }
    }

    private func vertical(_ ids: [PrimitiveChild]) -> some View {
        let alignment: HorizontalAlignment = switch props.string("align") {
        case "center": .center
        case "end": .trailing
        default: .leading
        }
        return VStack(alignment: alignment, spacing: overlap.map { -$0 } ?? gap) {
            ForEach(Array(ids.enumerated()), id: \.element) { index, id in
                if props.flag("divided"), index > 0 { Divider().overlay(Color.secondary.opacity(0.2)) }
                PrimitiveNodeView(id: id)
                    .frame(maxWidth: .infinity, alignment: Alignment(horizontal: alignment, vertical: .center))
                    .zIndex(Double(index))
            }
        }
    }
}

// MARK: Grid and Rail

/// `Grid(columns, gap, children)`: equal columns.
struct GridPrimitive: View {
    let props: PrimitiveProps

    var body: some View {
        ColumnsLayout(columns: props.int("columns") ?? 2, spacing: props.cgFloat("gap") ?? 0) {
            ForEach(props.childReferences("children"), id: \.self) { id in
                PrimitiveNodeView(id: id)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
    }
}

/// `Rail(gap, children, width?)`: a horizontal scroll row; 12 apart (the standard) when the gap is
/// missing; each item `width` wide when given (170 is the standard).
struct RailPrimitive: View {
    let props: PrimitiveProps

    var body: some View {
        let width = props.cgFloat("width")
        RailContainer(gap: props.cgFloat("gap") ?? 12) {
            ForEach(props.childReferences("children"), id: \.self) { id in
                if let width, width > 0 {
                    PrimitiveNodeView(id: id).environment(\.primitiveStackAxis, .vertical)
                        .fixedSize(horizontal: false, vertical: true).frame(width: width)
                } else {
                    PrimitiveNodeView(id: id).fixedSize(horizontal: true, vertical: false)
                }
            }
        }
    }
}

/// Full-bleed horizontal scroller: it reaches past its container by the bleed and has no
/// padding of its own. The bleed comes back as scroll content margins, so the first and last
/// items sit at the inset and every item snaps to it. Plus 4 pt vertically so shadows are not
/// clipped.
///
/// Items keep their ideal width: a stack re-proposing its own ideal width can come out a
/// fraction of a point short and truncate the last label.
struct RailContainer<Content: View>: View {
    let gap: CGFloat
    @ViewBuilder let content: Content
    @Environment(\.primitiveBleed) private var bleed
    @Environment(\.primitiveIsStatic) private var isStatic
    /// The rail's full-bleed width, for items sized in columns (`RailColumnWidth`).
    @State private var width: CGFloat = 0

    var body: some View {
        // The gap is the HStack's spacing; items keep their own (or column) widths.
        let row = HStack(alignment: .top, spacing: gap) { content }
            .padding(.vertical, PrimitiveMetrics.railVerticalPadding)
            .environment(\.primitiveStackAxis, .horizontal)
            .environment(\.primitiveRailWidth, width)
        Group {
            if isStatic {
                LeadingOverflowLayout { row.padding(.horizontal, bleed) }
                    .clipped()
            } else {
                ScrollView(.horizontal) { row.scrollTargetLayout() }
                    .contentMargins(.horizontal, bleed, for: .scrollContent)
                    .scrollTargetBehavior(.viewAligned)
                    .scrollIndicators(.hidden)
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .padding(.horizontal, -bleed)
    }
}

extension EnvironmentValues {
    /// The enclosing rail's full-bleed width; 0 until measured or outside a rail.
    @Entry var primitiveRailWidth: CGFloat = 0
}

// MARK: Card

/// `Card(children, surface?, radius?, padding?, selected?)`.
struct CardPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let padding = props.cgFloat("padding") ?? PrimitiveMetrics.containerPadding
        VStack(alignment: .leading, spacing: PrimitiveMetrics.containerPadding) {
            ForEach(props.childReferences("children"), id: \.self) { id in
                PrimitiveNodeView(id: id)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .environment(\.primitiveBleed, padding)
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .primitiveSurface(look, radius: radius)
    }

    private var radius: CGFloat {
        props.string("radius") == "control" ? PrimitiveMetrics.controlRadius : PrimitiveMetrics.containerRadius
    }

    private var look: PrimitiveLook {
        var look = palette.look("Card", "surfaces.\(props.string("surface") ?? "card")")
        if props.flag("selected") {
            let selected = palette.look("Card", "selected")
            look.border = selected.border ?? "surface.brand"
            look.effect = selected.effect
        }
        return look
    }
}

// MARK: Divider and Spacer

/// `Divider(inset?, bleed?)`: a 1 pt hairline.
struct DividerPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveBleed) private var bleed

    var body: some View {
        Rectangle()
            .fill(palette.color(token: palette.theme?.spec("Divider", "fill")?.stringValue ?? "outline.subtle"))
            .frame(height: 1)
            .padding(.leading, props.flag("inset") ? 56 : 0)
            .padding(.horizontal, props.flag("bleed") ? -bleed : 0)
            .accessibilityHidden(true)
    }
}

/// `Spacer(size)`: fixed space along the enclosing stack's axis.
struct SpacerPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitiveStackAxis) private var axis

    var body: some View {
        let size = props.cgFloat("size") ?? 0
        Color.clear
            .frame(width: axis == .horizontal ? size : 0, height: axis == .vertical ? size : 0)
            .accessibilityHidden(true)
    }
}

// MARK: ZStack and Show

/// `ZStack(children, alignment, inset?, scrim?)`: the first child is the base and sizes
/// the stack; the others layer over it at the alignment, `inset` from its edges.
struct ZStackPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let ids = props.childReferences("children")
        let alignment = Self.alignment(props.string("alignment"))
        let scrim = props.flag("scrim")
        ZStack {
            if let base = ids.first { PrimitiveNodeView(id: base) }
        }
        .overlay {
            if scrim {
                LinearGradient(
                    stops: [.init(color: .clear, location: 0.35), .init(color: scrimColor, location: 1)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .clipShape(.rect(cornerRadius: PrimitiveMetrics.containerRadius, style: .continuous))
                .allowsHitTesting(false)
            }
        }
        .overlay(alignment: alignment) {
            ZStack(alignment: alignment) {
                PrimitiveChildren(ids: Array(ids.dropFirst()))
            }
            .padding(props.cgFloat("inset") ?? 0)
            .environment(\.primitiveOnMedia, scrim)
        }
    }

    private var scrimColor: Color {
        palette.color(palette.theme?.spec("ZStack", "scrim.fill")?.stringValue) ?? .black.opacity(0.55)
    }

    static func alignment(_ token: String?) -> Alignment {
        switch token {
        case "top-leading": .topLeading
        case "top": .top
        case "top-trailing": .topTrailing
        case "leading": .leading
        case "trailing": .trailing
        case "bottom-leading": .bottomLeading
        case "bottom": .bottom
        case "bottom-trailing": .bottomTrailing
        default: .center
        }
    }
}

/// `Show(when, child)`: the child only while `when` is true.
struct ShowPrimitive: View {
    let props: PrimitiveProps

    var body: some View {
        if props.flag("when") {
            PrimitiveChildren(ids: props.childReferences("child"))
        }
    }
}
