import SwiftUI

/// `NavBar(title?, leading?, trailing?, style?)`: 44 tall, a back or close button, the
/// title centred, up to two trailing IconButtons. Leading taps perform `back` / `close`.
struct NavBarPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveContext) private var context
    @Environment(\.primitiveScope) private var scope

    var body: some View {
        HStack(spacing: 0) {
            leading
            Spacer(minLength: 0)
            PrimitiveChildren(ids: props.childReferences("trailing"))
        }
        .frame(height: PrimitiveMetrics.controlHeight)
        .overlay {
            if let title = props.string("title") {
                Text(title)
                    .primitiveFont(.headline, weight: .semibold)
                    .foregroundStyle(palette.color(token: "ink.primary"))
                    .lineLimit(1)
                    .padding(.horizontal, PrimitiveMetrics.controlHeight * 2)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .foregroundStyle(palette.color(token: "ink.primary"))
    }

    @ViewBuilder
    private var leading: some View {
        let kind = props.string("leading") ?? "back"
        if kind != "none" {
            Button {
                ActionTrigger(context: context, scope: scope)(kind == "close" ? "close" : "back")
            } label: {
                SymbolGlyph(name: kind == "close" ? "xmark" : "chevron.left", size: 24)
                    .frame(width: PrimitiveMetrics.controlHeight, height: PrimitiveMetrics.controlHeight)
                    .primitiveSurface(
                        palette.look("NavBar", "styles.\(props.string("style") ?? "plain")"),
                        radius: PrimitiveMetrics.pill
                    )
                    .contentShape(.circle)
            }
            .buttonStyle(PressStyle(scale: 0.95))
        }
    }
}

/// `Dock(children)`: the bottom bar that keeps the main action in reach, on the screen
/// surface with the spec's elevation. Pinned by `PrimitiveTreeView` when it ends the page.
struct DockPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveBleed) private var bleed

    var body: some View {
        VStack(spacing: PrimitiveMetrics.labelGap) {
            ForEach(props.childReferences("children"), id: \.self) { id in
                DockRow(id: id)
            }
        }
        .padding(.top, PrimitiveMetrics.labelGap)
        .padding(.bottom, 8)
        .overlay(alignment: .top) {
            // No shadow: a hairline separates the dock from content scrolling under it.
            Rectangle().fill(palette.color(token: "outline.subtle")).frame(height: 1)
        }
        .background {
            let spec = palette.theme?.spec("Dock")
            Color.clear
                .primitiveSurface(
                    PrimitiveLook(
                        fill: spec?["fill"]?.stringValue ?? "surface.screen",
                        effect: spec?["effect"]?.stringValue
                    ),
                    radius: 0
                )
                .ignoresSafeArea(edges: .bottom)
        }
        .padding(.horizontal, -bleed)
    }
}

/// One dock row at the screen inset. A row wider than the screen (four labelled buttons)
/// scrolls sideways edge to edge instead of squeezing its buttons until labels break.
private struct DockRow: View {
    let id: PrimitiveChild
    @Environment(\.primitiveBleed) private var bleed
    @Environment(\.primitiveIsStatic) private var isStatic

    var body: some View {
        let row = PrimitiveNodeView(id: id)
            .padding(.horizontal, bleed)
            .environment(\.primitiveStackAxis, .horizontal)
        ViewThatFits(in: .horizontal) {
            PrimitiveNodeView(id: id)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, bleed)
            if isStatic {
                LeadingOverflowLayout { row }.clipped()
            } else {
                ScrollView(.horizontal) { row }.scrollIndicators(.hidden)
            }
        }
    }
}
