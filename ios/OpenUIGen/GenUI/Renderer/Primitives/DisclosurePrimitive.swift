import SwiftUI

/// `Disclosure(label, children, open?, subtitle?, trailing?)`: a 44 pt header row whose
/// chevron turns as it expands its content on tap. `open` is only the starting state; the
/// tap state is the device's, like `Section`'s collapse.
struct DisclosurePrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isOpen: Bool
    @State private var contentHeight: CGFloat = 0
    private let curve = Animation.timingCurve(0.23, 1, 0.32, 1, duration: 0.2)

    init(props: PrimitiveProps) {
        self.props = props
        _isOpen = State(initialValue: props.flag("open"))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            VStack(alignment: .leading, spacing: PrimitiveMetrics.labelGap) {
                PrimitiveChildren(ids: props.childReferences("children"))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, PrimitiveMetrics.labelGap)
            .fixedSize(horizontal: false, vertical: true)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
            .frame(height: isOpen ? contentHeight : 0, alignment: .top)
            .clipped()
            .animation(reduceMotion ? nil : curve, value: isOpen)
            .opacity(isOpen ? 1 : 0)
            .animation(curve, value: isOpen)
            .accessibilityHidden(!isOpen)
            .allowsHitTesting(isOpen)
        }
    }

    private var header: some View {
        Button {
            withAnimation(reduceMotion ? nil : curve) { isOpen.toggle() }
        } label: {
            HStack(spacing: PrimitiveMetrics.labelGap) {
                titles
                Spacer(minLength: 0)
                PrimitiveChildren(ids: props.childReferences("trailing"))
                Image(systemName: "chevron.down")
                    .font(.system(size: 14, weight: .semibold))
                    .rotationEffect(.degrees(isOpen ? 0 : -90))
                    .foregroundStyle(palette.color(token: "ink.tertiary"))
            }
            .frame(minHeight: PrimitiveMetrics.controlHeight)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityValue(isOpen ? "Expanded" : "Collapsed")
    }

    private var titles: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(props.string("label") ?? "")
                .primitiveFont(.body, weight: .medium)
                .foregroundStyle(palette.color(token: "ink.primary"))
            if let subtitle = props.string("subtitle") {
                Text(subtitle)
                    .primitiveFont(.footnote)
                    .foregroundStyle(palette.color(token: "ink.secondary"))
            }
        }
        .multilineTextAlignment(.leading)
    }
}
