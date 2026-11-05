import SwiftUI

// MARK: Section

/// `Section(title, children, subtitle?, trailing?, footnote?, collapsible?, sticky?)`.
struct SectionPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveBleed) private var bleed
    @Environment(\.primitiveIsStatic) private var isStatic
    @State private var isOpen = true
    @State private var sectionHeight: CGFloat = 0
    @State private var headerHeight: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: PrimitiveMetrics.labelGap) {
            stickyHeader
            if isOpen {
                ForEach(props.childReferences("children"), id: \.self) { id in
                    PrimitiveNodeView(id: id)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if let footnote = props.string("footnote") {
                Text(footnote)
                    .primitiveFont(.footnote)
                    .foregroundStyle(palette.color(token: "ink.tertiary"))
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { sectionHeight = $0 }
    }

    @ViewBuilder
    private var stickyHeader: some View {
        if props.flag("sticky"), !isStatic {
            let limit = max(0, sectionHeight - headerHeight)
            header
                .padding(.vertical, 8)
                .padding(.horizontal, bleed)
                .background(palette.color(token: "surface.screen"))
                .padding(.horizontal, -bleed)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { headerHeight = $0 }
                // Pinned while its section scrolls under the top edge, then pushed off by the
                // section's end.
                .visualEffect { content, proxy in
                    content.offset(y: min(max(0, -proxy.frame(in: .scrollView).minY), limit))
                }
                .zIndex(1)
        } else {
            header
        }
    }

    private var header: some View {
        HStack(spacing: PrimitiveMetrics.labelGap) {
            Button {
                withAnimation(.snappy) { isOpen.toggle() }
            } label: {
                HStack(spacing: 8) {
                    titles
                    if props.flag("collapsible") {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 14, weight: .semibold))
                            .rotationEffect(.degrees(isOpen ? 0 : -90))
                            .foregroundStyle(palette.color(token: "ink.tertiary"))
                    }
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(!props.flag("collapsible"))
            Spacer(minLength: 0)
            PrimitiveChildren(ids: props.childReferences("trailing"))
        }
    }

    private var titles: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(props.string("title") ?? "")
                .primitiveFont(.headline, weight: .semibold)
                .foregroundStyle(palette.color(token: "ink.primary"))
            if let subtitle = props.string("subtitle") {
                Text(subtitle)
                    .primitiveFont(.footnote)
                    .foregroundStyle(palette.color(token: "ink.tertiary"))
            }
        }
        .multilineTextAlignment(.leading)
    }
}

/// A rail item's width: `width` points (170 is the standard), else `columns` visible across the
/// width with a peek of the next one, else the item's own width.
private struct RailColumnWidth: ViewModifier {
    let width: CGFloat?
    let columns: Double?
    let gap: CGFloat
    let bleed: CGFloat
    @Environment(\.primitiveRailWidth) private var railWidth

    func body(content: Content) -> some View {
        if let width, width > 0 {
            // A card in a rail lays out vertically inside (a chart fills it).
            content.environment(\.primitiveStackAxis, .vertical)
                .fixedSize(horizontal: false, vertical: true).frame(width: width)
        } else if let columns, columns > 0, railWidth > 0 {
            // An explicit width, so the rail's HStack spacing stays the gap between items.
            content.environment(\.primitiveStackAxis, .vertical).fixedSize(horizontal: false, vertical: true)
                .frame(width: max(0, (railWidth - 2 * bleed - gap * columns) / (columns + 0.3)))
        } else {
            content.fixedSize(horizontal: true, vertical: false)
        }
    }
}

/// The `stagger-in` behaviour: items fade and rise in one after another.
private struct StaggerIn: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let index: Int
    @Environment(\.primitiveIsStatic) private var isStatic
    @State private var isVisible = false

    func body(content: Content) -> some View {
        let shown = isStatic || reduceMotion || isVisible
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 8)
            .onAppear {
                guard !isVisible, !isStatic, !reduceMotion else { return }
                withAnimation(.smooth(duration: 0.35).delay(Double(min(index, 12)) * 0.04)) { isVisible = true }
            }
    }
}
