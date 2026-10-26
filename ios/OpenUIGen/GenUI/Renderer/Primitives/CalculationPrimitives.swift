import SwiftUI

/// A transparent scope; only input edits are state. All outputs are derived together.
struct CalculationPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitiveScope) private var scope
    @State private var edits: [String: Double] = [:]

    var body: some View {
        let path = props.dataPath("values").map(scope.absolutePath) ?? ""
        let initial = props.value("values")?.objectValue ?? [:]
        let values = initial.merging(edits.reduce(into: [String: PValue]()) { result, edit in
            let prefix = path + "."
            guard edit.key.hasPrefix(prefix) else { return }
            let key = String(edit.key.dropFirst(prefix.count))
            if ["quantity", "months", "annualRate"].contains(key) { result[key] = .number(edit.value) }
        }) { _, edit in edit }
        VStack(alignment: .leading, spacing: 24) {
            PrimitiveChildren(ids: props.childReferences("children"))
        }
        .environment(
            \.primitiveScope,
            scope.overriding(
                path,
                with: .object(GrowthCalculation.evaluate(values, model: props.string("model") ?? "compound-growth"))
            )
        )
        .environment(\.primitiveInputEdits, $edits)
    }
}

/// Intrinsic-width icon/text tags or selectable alternative rows; no domain content.
struct ChoiceTagsPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveScope) private var scope
    @Environment(\.primitiveInputEdits) private var edits
    @Environment(\.primitiveIsStatic) private var isStatic
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var local: Double?

    private struct Option: Identifiable {
        let value: Double
        let label: String
        let icon: String
        let detail: String?
        let trailing: String?
        var id: Double { value }
    }

    private var options: [Option] {
        props.list("options").compactMap { raw in
            guard let value = raw["value"]?.numberValue, value.isFinite,
                  let label = raw["label"]?.stringValue else { return nil }
            return Option(
                value: value,
                label: label,
                icon: raw["icon"]?.stringValue ?? "circle",
                detail: raw["detail"]?.stringValue,
                trailing: raw["trailing"]?.stringValue
            )
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(props.string("label") ?? "Selection")
                .primitiveFont(.footnote)
                .foregroundStyle(palette.ink("secondary"))
            if props.string("style") == "rows" {
                VStack(spacing: 8) { ForEach(options) { option in choice(option, row: true) } }
            } else {
                // Tags overflow edge to edge like any rail: the inset rides on the items, not the scroller.
                RailContainer(gap: 8) { ForEach(options) { option in choice(option, row: false) } }
            }
        }
    }

    private func choice(_ option: Option, row: Bool) -> some View {
        let selected = (
            edits == nil && !props.hasInput("value") ? local ?? props.number("value") : props
                .number("value")
        ) == option.value
        return Button {
            select(option.value)
        } label: {
            HStack(spacing: 8) {
                SymbolGlyph(name: option.icon, size: row ? 16 : 20)
                VStack(alignment: .leading, spacing: 4) {
                    Text(option.label).primitiveFont(row ? .footnote : .body, weight: row ? .medium : .semibold)
                        .lineLimit(1)
                    if row, let detail = option.detail, !detail.isEmpty {
                        Text(detail).primitiveFont(.footnote).foregroundStyle(palette.ink("secondary"))
                            .contentTransition(reduceMotion || isStatic ? .identity : .numericText())
                            .animation(
                                reduceMotion || isStatic ? nil : .timingCurve(0.77, 0, 0.175, 1, duration: 0.2),
                                value: option.detail
                            )
                    }
                }
                if row {
                    Spacer(minLength: 8)
                    Text(option.trailing ?? "").primitiveFont(.footnote, weight: .medium).monospacedDigit()
                        .contentTransition(reduceMotion || isStatic ? .identity : .numericText())
                        .animation(
                            reduceMotion || isStatic ? nil : .timingCurve(0.77, 0, 0.175, 1, duration: 0.2),
                            value: option.trailing
                        )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, row ? 12 : 0)
            .frame(minHeight: 44)
            .modifier(ChoiceLook(selected: selected, row: row, palette: palette))
            .fixedSize(horizontal: !row, vertical: true)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .onKeyPress(keys: [.return, KeyEquivalent(" ")]) { _ in
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) { select(option.value) }
            return .handled
        }
    }

    private func select(_ value: Double) {
        if props.edit("value", value: value) { return }
        if let edits, let binding = props.dataPath("value") { edits.wrappedValue[scope.absolutePath(binding)] = value }
        else { local = value }
    }
}

/// A stepped range on the system SwiftUI `Slider`, tinted with the brand fill; digits roll.
struct SliderPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveScope) private var scope
    @Environment(\.primitiveInputEdits) private var edits
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var local: Double?

    private var minimum: Double { props.number("min") ?? 0 }
    private var maximum: Double { props.number("max") ?? 100 }
    private var step: Double { props.number("step") ?? 1 }
    private var current: Double? {
        edits == nil && !props.hasInput("value") ? local ?? props.number("value") : props.number("value")
    }

    private var enabled: Bool { minimum.isFinite && maximum.isFinite && maximum > minimum && step.isFinite && step > 0 }
    private var label: String { props.string("label") ?? "Amount" }
    private var unit: String { props.string("unit") ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(label).primitiveFont(.body, weight: .medium)
                Spacer(minLength: 8)
                Text(current.map { "\(PrimitiveNumberFormat(kind: .decimal).string($0)) \(unit)" } ?? "—")
                    .primitiveFont(.title2, weight: .medium).monospacedDigit()
                    .contentTransition(reduceMotion ? .identity : .numericText(value: current ?? 0))
                    .animation(reduceMotion ? nil : .timingCurve(0.77, 0, 0.175, 1, duration: 0.2), value: current)
            }
            // The system slider: native thumb, haptics, VoiceOver and keyboard adjustment.
            Slider(
                value: Binding(get: { current ?? minimum }, set: { update($0) }),
                in: enabled ? minimum ... maximum : 0 ... 1,
                step: enabled ? step : 1
            )
            .tint(palette.color(token: "surface.brand"))
            .disabled(!enabled)
            .frame(minHeight: 44)
            .accessibilityValue(
                current
                    .map { "\(PrimitiveNumberFormat(kind: .decimal).string($0)) \(unit)" } ?? "Unavailable"
            )
            HStack {
                Text("\(PrimitiveNumberFormat(kind: .decimal).string(minimum)) \(unit)")
                Spacer()
                Text("\(PrimitiveNumberFormat(kind: .decimal).string(maximum)) \(unit)")
            }
            .primitiveFont(.footnote).foregroundStyle(palette.ink("secondary"))
        }
        .foregroundStyle(palette.ink("primary"))
        .opacity(enabled ? 1 : 0.5)
    }

    private func update(_ value: Double) {
        guard enabled, value.isFinite else { return }
        let next = min(maximum, max(minimum, minimum + ((value - minimum) / step).rounded() * step))
        if props.edit("value", value: next) { return }
        if let edits, let binding = props.dataPath("value") { edits.wrappedValue[scope.absolutePath(binding)] = next }
        else { local = next }
    }
}

/// A choice's look. Tags follow Kino's outlined Secondary button: selected is the bright
/// (primary ink, strong 1.5 border), unselected the subtle (dim ink, subtle border), both on
/// no fill. Rows keep a filled surface with the selection ring.
private struct ChoiceLook: ViewModifier {
    let selected: Bool
    let row: Bool
    let palette: PrimitivePalette

    func body(content: Content) -> some View {
        if row {
            content
                .foregroundStyle(palette.ink(selected ? "primary" : "secondary"))
                .background(palette.color(token: selected ? "outline.strong" : "surface.filled"))
                .clipShape(.rect(cornerRadius: 8))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(
                            palette.color(token: selected ? "outline.strong" : "outline.subtle"),
                            lineWidth: 1
                        )
                }
        } else {
            content
                .foregroundStyle(selected ? palette.ink("primary") : palette.color(token: "outline.control"))
                .contentShape(.capsule)
                .overlay {
                    Capsule().strokeBorder(
                        palette.color(token: selected ? "outline.control" : "outline.subtle"),
                        lineWidth: 1.5
                    )
                }
        }
    }
}
