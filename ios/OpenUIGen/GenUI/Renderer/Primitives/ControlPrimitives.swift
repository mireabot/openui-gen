import SwiftUI

/// The `press` behaviour: a slight scale-down while pressed.
struct PressStyle: ButtonStyle {
    var scale: CGFloat = 0.97

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
    }
}

/// Calls the host with a primitive's action.
struct ActionTrigger {
    let context: PrimitiveActionDispatcher

    @MainActor
    func callAsFunction(_ action: String?) {
        guard let action, !action.isEmpty else { return }
        context.perform(action)
    }
}

extension View {
    /// Disabled controls dim to the spec's 0.4.
    func primitiveDisabled(_ disabled: Bool) -> some View {
        self.disabled(disabled).opacity(disabled ? 0.4 : 1)
    }
}

// MARK: Button and IconButton

/// `Button(label, action, style, icon?, wide?, disabled?, iconTrailing?)`: 44 tall.
struct ButtonPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveContext) private var context

    var body: some View {
        let style = props.string("style") ?? "primary"
        let wide = props.flag("wide")
        Button {
            ActionTrigger(context: context)(props.string("action"))
        } label: {
            let icon = props.string("icon")
            let trailing = props.flag("iconTrailing")
            HStack(spacing: 4) {
                if let icon, !trailing { SymbolGlyph(name: icon, size: 16) }
                Text(props.string("label") ?? "")
                    .primitiveFont(.body, weight: .medium)
                    .lineLimit(1)
                    .fixedSize(horizontal: !wide, vertical: false)
                    .padding(.horizontal, 4)
                if let icon, trailing { SymbolGlyph(name: icon, size: 16) }
            }
            .padding(.horizontal, style == "text" ? 4 : PrimitiveMetrics.containerPadding - 4)
            .frame(maxWidth: wide ? .infinity : nil, minHeight: PrimitiveMetrics.controlHeight)
            .primitiveSurface(palette.look("Button", "styles.\(style)"), radius: PrimitiveMetrics.controlRadius)
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .primitiveDisabled(props.flag("disabled"))
    }
}

/// `IconButton(icon, label, action, style?, disabled?)`: a 44 round target, 24 glyph.
struct IconButtonPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveContext) private var context

    var body: some View {
        Button {
            ActionTrigger(context: context)(props.string("action"))
        } label: {
            SymbolGlyph(name: props.string("icon"), size: 24)
                .frame(width: PrimitiveMetrics.controlHeight, height: PrimitiveMetrics.controlHeight)
                .primitiveSurface(
                    palette.look("IconButton", "styles.\(props.string("style") ?? "plain")"),
                    radius: PrimitiveMetrics.pill
                )
                .contentShape(.circle)
        }
        .buttonStyle(PressStyle(scale: 0.95))
        .primitiveDisabled(props.flag("disabled"))
    }
}

// MARK: Pill, Badge, Chip

/// `Pill(label, value?, dot?)`: a static two-part pill, 28 tall.
struct PillPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let dot = palette.value(props.string("dot"))
        HStack(spacing: 8) {
            if let dot { Circle().fill(dot).frame(width: 12, height: 12) }
            Text(props.string("label") ?? "")
                .primitiveFont(.footnote)
                .foregroundStyle(palette.color(token: "ink.secondary"))
            if let value = props.string("value") {
                Text(value)
                    .primitiveFont(.footnote, weight: .medium)
                    .monospacedDigit()
                    .foregroundStyle(palette.color(token: "ink.primary"))
            }
        }
        .lineLimit(1)
        .padding(.leading, dot == nil ? 12 : 8)
        .padding(.trailing, 12)
        .frame(height: 28)
        .primitiveSurface(palette.look("Pill", "style"), radius: PrimitiveMetrics.pill)
        .fixedSize()
    }
}

/// `Badge(label, tone, icon?)`: a static status label, 24 tall, radius 4.
struct BadgePrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let large = props.string("size") == "large"
        let small = props.string("size") == "small"
        let plain = props.string("fill") == "none"
        let label = props.string("label") ?? ""
        HStack(spacing: 4) {
            if let icon = props.string("icon") { SymbolGlyph(name: icon, size: 16) }
            // An icon-only badge (InjuryReport's band-aid) has no text after its glyph, as on the web.
            if label.isEmpty, props.string("icon") != nil {
                EmptyView()
            } else if small {
                Text(props.string("label") ?? "")
                    .font(.system(size: 11, weight: .semibold))
                    .monospacedDigit()
                    .lineLimit(1)
            } else {
                Text(props.string("label") ?? "")
                    .primitiveFont(large ? .title1 : .footnote, weight: large ? .semibold : .medium)
                    .monospacedDigit()
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, plain ? 0 : large ? 12 : small ? 4 : 8)
        .padding(.vertical, plain ? 0 : large ? 4 : 0)
        .frame(height: large ? nil : small ? 16 : 24)
        .primitiveSurface(look, radius: large ? 8 : PrimitiveMetrics.innerRadius)
        .fixedSize()
    }

    private var look: PrimitiveLook {
        var result = palette.look("Badge", "tones.\(props.string("tone") ?? "neutral")")
        if let fill = props.string("fill") { result.fill = fill == "none" ? nil : fill }
        if let ink = props.string("ink") { result.ink = ink }
        return result
    }
}

/// `Chip(label, action?, selected?, icon?)`: a 32 pill with a 44 tap target; tapping
/// toggles its selection locally and calls the action.
struct ChipPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveContext) private var context
    @State private var isSelected: Bool?

    var body: some View {
        let selected = isSelected ?? props.flag("selected")
        Button {
            isSelected = !selected
            ActionTrigger(context: context)(props.string("action"))
        } label: {
            HStack(spacing: 6) {
                if let icon = props.string("icon") { SymbolGlyph(name: icon, size: 16) }
                Text(props.string("label") ?? "")
                    .primitiveFont(.footnote, weight: .medium)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .frame(height: 32)
            .primitiveSurface(
                palette.look("Chip", "styles.\(selected ? "selected" : "unselected")"),
                radius: PrimitiveMetrics.pill
            )
            .frame(minHeight: PrimitiveMetrics.controlHeight)
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
        .fixedSize()
    }
}

// MARK: SegmentedControl

/// `SegmentedControl(options, selected?)`: a pill track, 44 tall; selection is local.
struct SegmentedControlPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @State private var selection: Int?
    @Namespace private var thumb

    var body: some View {
        let options = props.list("options").compactMap(PrimitiveProps.text)
        let selected = min(max(0, selection ?? props.int("selected") ?? 0), max(0, options.count - 1))
        VStack(alignment: .leading, spacing: 16) {
            if props.flag("contentFirst") { panel(selected: selected) }
            track(options: options, selected: selected)
            if !props.flag("contentFirst") { panel(selected: selected) }
        }
    }

    private func track(options: [String], selected: Int) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.element) { index, option in
                Button {
                    withAnimation(.snappy) { selection = index }
                } label: {
                    segment(option, isSelected: index == selected)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(index == selected ? .isSelected : [])
            }
        }
        .padding(4)
        .frame(height: PrimitiveMetrics.controlHeight)
        .background(
            Capsule()
                .fill(
                    palette
                        .color(
                            token: palette.theme?.spec("SegmentedControl", "track.fill")?
                                .stringValue ?? "surface.control"
                        )
                )
        )
    }

    @ViewBuilder
    private func panel(selected: Int) -> some View {
        let ids = props.childReferences("panels")
        if ids.indices.contains(selected) {
            PrimitiveNodeView(id: ids[selected]).id(selected)
        }
    }

    private func segment(_ option: String, isSelected: Bool) -> some View {
        Text(option)
            .primitiveFont(.body, weight: .medium)
            .lineLimit(1)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .foregroundStyle(palette.color(palette.look("SegmentedControl", "item.unselected").ink) ?? .secondary)
            .background {
                if isSelected {
                    Color.clear
                        .primitiveSurface(
                            palette.look("SegmentedControl", "item.selected"),
                            radius: PrimitiveMetrics.pill
                        )
                        .matchedGeometryEffect(id: "thumb", in: thumb)
                }
            }
            .overlay {
                if isSelected {
                    Text(option)
                        .primitiveFont(.body, weight: .medium)
                        .lineLimit(1)
                        .foregroundStyle(palette.color(palette.look("SegmentedControl", "item.selected").ink) ?? .white)
                }
            }
            .contentShape(.rect)
    }
}

// MARK: Toggle and Stepper

/// `Toggle(label, on?, caption?, disabled?)`: a 52×32 switch drawn from the spec, so it
/// carries the brand fill on every platform.
struct TogglePrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @State private var isOn: Bool?

    var body: some View {
        let on = isOn ?? props.flag("on")
        Button {
            withAnimation(.snappy) { isOn = !on }
        } label: {
            HStack(spacing: PrimitiveMetrics.labelGap) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(props.string("label") ?? "")
                        .primitiveFont(.body)
                        .foregroundStyle(palette.color(token: "ink.primary"))
                    if let caption = props.string("caption") {
                        Text(caption)
                            .primitiveFont(.footnote)
                            .foregroundStyle(palette.color(token: "ink.secondary"))
                    }
                }
                .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                track(on: on)
            }
            .frame(minHeight: PrimitiveMetrics.controlHeight)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityValue(on ? "On" : "Off")
        .accessibilityAddTraits(.isToggle)
        .primitiveDisabled(props.flag("disabled"))
    }

    private func track(on: Bool) -> some View {
        Capsule()
            .fill(
                palette
                    .color(
                        token: palette.theme?.spec("Toggle", on ? "on.fill" : "off.fill")?
                            .stringValue ?? "surface.control"
                    )
            )
            .frame(width: 52, height: 32)
            .overlay(alignment: on ? .trailing : .leading) {
                Color.clear
                    .frame(width: 28, height: 28)
                    .primitiveSurface(palette.look("Toggle", "knob"), radius: PrimitiveMetrics.pill)
                    .padding(2)
            }
    }
}

/// `Stepper(@value, unit?, step?)`: minus and plus on 44 round buttons; the value is local.
struct StepperPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @State private var value: Double?

    var body: some View {
        let current = value ?? props.number("value") ?? 0
        let step = props.number("step") ?? 1
        HStack(spacing: PrimitiveMetrics.labelGap) {
            stepButton("minus", label: "Decrease") { value = current - step }
            Text(PrimitiveNumberFormat(kind: .decimal).string(current) + (props.string("unit").map { " \($0)" } ?? ""))
                .primitiveFont(.headline, weight: .medium)
                .monospacedDigit()
                .foregroundStyle(palette.color(token: "ink.primary"))
                .contentTransition(.numericText(value: current))
                .animation(.snappy, value: current)
            stepButton("plus", label: "Increase") { value = current + step }
        }
    }

    private func stepButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            SymbolGlyph(name: icon, size: 16)
                .frame(width: PrimitiveMetrics.controlHeight, height: PrimitiveMetrics.controlHeight)
                .background(Circle().fill(palette.color(token: "surface.control")))
                .foregroundStyle(palette.color(token: "ink.primary"))
        }
        .buttonStyle(PressStyle(scale: 0.95))
    }
}
