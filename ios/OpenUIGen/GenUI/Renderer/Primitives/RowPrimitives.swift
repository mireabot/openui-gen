import SwiftUI

/// `Row(title, subtitle?, leading?, trailing?, action?)`: list padding from the `Row`
/// spec (12 vertical, 12 gap, 44 minimum), title and subtitle inks from the spec.
struct RowPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveContext) private var context
    @Environment(\.primitiveScope) private var scope

    var body: some View {
        if let action = props.string("action") {
            Button {
                ActionTrigger(context: context, scope: scope)(action)
            } label: {
                content.contentShape(.rect)
            }
            .buttonStyle(PressStyle(scale: 0.98))
        } else {
            content
        }
    }

    private func spec(_ path: String) -> PValue? {
        palette.theme?.spec("Row", path)
    }

    private var content: some View {
        HStack(spacing: spec("size.gap")?.numberValue.map { CGFloat($0) } ?? PrimitiveMetrics.labelGap) {
            PrimitiveChildren(ids: props.childReferences("leading"))
            VStack(alignment: .leading, spacing: 0) {
                Text(props.string("title") ?? "")
                    .primitiveFont(
                        PrimitiveTypeRole(token: spec("title.role")?.stringValue),
                        weight: Font.Weight(token: spec("title.weight")?.stringValue)
                    )
                    .foregroundStyle(palette.color(token: spec("title.ink")?.stringValue ?? "ink.primary"))
                if let subtitle = props.string("subtitle") {
                    Text(subtitle)
                        .primitiveFont(PrimitiveTypeRole(token: spec("subtitle.role")?.stringValue ?? "footnote"))
                        .foregroundStyle(palette.color(token: spec("subtitle.ink")?.stringValue ?? "ink.tertiary"))
                }
            }
            .lineLimit(2)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            // The title keeps its room, so a long trailing value wraps instead of crushing it.
            .layoutPriority(1)
            PrimitiveChildren(ids: props.childReferences("trailing"))
                .foregroundStyle(palette.color(token: spec("trailing.ink")?.stringValue ?? "ink.secondary"))
        }
        .padding(.vertical, spec("size.paddingY")?.numberValue.map { CGFloat($0) } ?? PrimitiveMetrics.labelGap)
        .frame(minHeight: spec("size.minHeight")?.numberValue.map { CGFloat($0) } ?? PrimitiveMetrics.controlHeight)
        .accessibilityElement(children: .combine)
    }
}

/// `KeyValue(label, value, action?)`: a read-only fact; with an action the value links.
struct KeyValuePrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveContext) private var context
    @Environment(\.primitiveScope) private var scope

    var body: some View {
        let action = props.string("action")
        HStack(spacing: PrimitiveMetrics.labelGap) {
            Text(props.string("label") ?? "")
                .primitiveFont(.body)
                .foregroundStyle(palette.color(token: "ink.secondary"))
            Spacer(minLength: 0)
            if let action {
                Button(props.string("value") ?? "") {
                    ActionTrigger(context: context, scope: scope)(action)
                }
                .buttonStyle(PressStyle())
                .primitiveFont(.body, weight: .medium)
                .foregroundStyle(palette.color(token: "ink.brand"))
            } else {
                Text(props.string("value") ?? "")
                    .primitiveFont(.body, weight: .medium)
                    .foregroundStyle(palette.color(token: "ink.primary"))
            }
        }
        .multilineTextAlignment(.trailing)
        .padding(.vertical, PrimitiveMetrics.labelGap)
        .frame(minHeight: PrimitiveMetrics.controlHeight)
    }
}
