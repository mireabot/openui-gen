import SwiftUI

extension EnvironmentValues {
    /// Draws the skeleton as a mask: shimmer shapes opaque white, surfaces and dividers
    /// clear, so the sweep only lights the shapes.
    @Entry var skeletonIsMask = false
    /// Lines hug the trailing edge: the last child of a `between` row, like right-aligned text.
    @Entry var skeletonLinesTrail = false
}

/// One skeleton block: the frames, with a highlight sweeping across their shimmer shapes.
/// Static (no sweep) when the renderer is static or Reduce Motion is on.
struct SkeletonBlockView: View {
    let frame: SkeletonFrame
    @Environment(\.primitiveIsStatic) private var isStatic
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        // Frames always lay out statically: a skeleton rail is not a scroll view, so the
        // mask copy below lines up with it exactly.
        SkeletonFrameView(frame: frame)
            .environment(\.primitiveIsStatic, true)
            .overlay {
                if !isStatic, !reduceMotion {
                    ShimmerSweep()
                        .mask {
                            SkeletonFrameView(frame: frame)
                                .environment(\.primitiveIsStatic, true)
                                .environment(\.skeletonIsMask, true)
                        }
                }
            }
            .accessibilityElement(children: .ignore)
    }
}

/// A soft highlight band that crosses its container left to right, then starts again.
private struct ShimmerSweep: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        GeometryReader { proxy in
            let band = max(proxy.size.width * 0.5, 120)
            let highlight = Color.white.opacity(colorScheme == .dark ? 0.12 : 0.6)
            LinearGradient(colors: [.clear, highlight, .clear], startPoint: .leading, endPoint: .trailing)
                .frame(width: band)
                .phaseAnimator([false, true]) { content, swept in
                    content.offset(x: swept ? proxy.size.width : -band)
                } animation: { swept in
                    // Across in 1.3 s; back to the start without animating.
                    swept ? .linear(duration: 1.3) : nil
                }
        }
        .allowsHitTesting(false)
    }
}

/// One frame, recursively. Containers lay out like their primitives; shapes shimmer.
struct SkeletonFrameView: View {
    let frame: SkeletonFrame

    var body: some View {
        switch frame {
        case let .stack(axis, gap, align, justify, children, paddingX, paddingY):
            SkeletonStack(axis: axis, gap: gap, align: align, justify: justify, children: children)
                .padding(.horizontal, paddingX ?? 0)
                .padding(.vertical, paddingY ?? 0)
        case let .grid(columns, gap, children, rowGap):
            ColumnsLayout(columns: columns, spacing: gap, rowSpacing: rowGap.map { CGFloat($0) }) {
                SkeletonChildren(frames: children, fill: true)
            }
        case let .rail(gap, width, children):
            RailContainer(gap: gap) {
                SkeletonChildren(frames: children, fill: false, width: width)
            }
        case let .repeat(layout, count, gap, columns, width, divided, item):
            SkeletonRepeat(
                layout: layout,
                count: count,
                gap: gap,
                columns: columns,
                width: width,
                divided: divided,
                item: item
            )
        case let .box(box):
            SkeletonBox(box: box)
        case let .line(height, width):
            SkeletonLine(height: height, fraction: width)
        case let .circle(size):
            SkeletonShape(radius: .pill).frame(width: size, height: size)
        case .divider:
            SkeletonDivider()
        case let .spacer(size):
            SkeletonSpacer(size: size)
        }
    }
}

/// Children of a container. Skeleton frames are fixed once received and never reorder,
/// so the position is a stable identity here.
private struct SkeletonChildren: View {
    let frames: [SkeletonFrame]
    /// Stretch across the width (grid cells, vertical stacks) or keep the ideal width (rails).
    let fill: Bool
    /// A fixed item width (rails of fixed-width cards) instead.
    var width: Double?

    var body: some View {
        ForEach(frames.indices, id: \.self) { index in
            if let width {
                SkeletonFrameView(frame: frames[index]).frame(width: width, alignment: .topLeading)
            } else if fill {
                SkeletonFrameView(frame: frames[index]).frame(maxWidth: .infinity, alignment: .topLeading)
            } else {
                SkeletonFrameView(frame: frames[index]).fixedSize(horizontal: true, vertical: false)
            }
        }
    }
}

// MARK: Containers

/// Lays out like `StackPrimitive`: vertical stretches children, horizontal centres them,
/// `between` puts flexible spacers between children.
private struct SkeletonStack: View {
    let axis: SkeletonFrame.Axis
    let gap: Double
    let align: String?
    let justify: String?
    let children: [SkeletonFrame]

    var body: some View {
        if axis == .horizontal {
            horizontal.environment(\.primitiveStackAxis, .horizontal)
        } else {
            vertical.environment(\.primitiveStackAxis, .vertical)
        }
    }

    private var vertical: some View {
        let alignment: HorizontalAlignment = switch align {
        case "center": .center
        case "end": .trailing
        default: .leading
        }
        return VStack(alignment: alignment, spacing: gap) {
            ForEach(children.indices, id: \.self) { index in
                SkeletonFrameView(frame: children[index])
                    .frame(maxWidth: .infinity, alignment: Alignment(horizontal: alignment, vertical: .center))
            }
        }
    }

    private var horizontal: some View {
        let between = justify == "between"
        let alignment: VerticalAlignment = switch align {
        case "start": .top
        case "end": .bottom
        default: .center
        }
        let trailing: Alignment? = switch justify {
        case "center": .center
        case "end": .trailing
        default: nil
        }
        return HStack(alignment: alignment, spacing: between ? 0 : gap) {
            // The same order as `StackPrimitive`: spacers are siblings, so text can still wrap.
            ForEach(children.indices, id: \.self) { index in
                if between, index > 0 { Spacer(minLength: gap) }
                SkeletonFrameView(frame: children[index])
                    .environment(\.skeletonLinesTrail, between && index > 0 && index == children.count - 1)
            }
        }
        .frame(maxWidth: trailing == nil ? nil : .infinity, alignment: trailing ?? .leading)
    }
}

/// `count` copies of the item in its layout.
private struct SkeletonRepeat: View {
    let layout: SkeletonFrame.RepeatLayout
    let count: Int
    let gap: Double
    let columns: Int?
    let width: Double?
    let divided: Bool
    let item: SkeletonFrame

    var body: some View {
        let items = Array(repeating: item, count: max(0, count))
        switch layout {
        case .stack:
            VStack(alignment: .leading, spacing: gap) {
                ForEach(items.indices, id: \.self) { index in
                    VStack(alignment: .leading, spacing: gap) {
                        if divided, index > 0 { SkeletonDivider() }
                        SkeletonFrameView(frame: item).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        case .rail:
            RailContainer(gap: gap) { SkeletonChildren(frames: items, fill: false, width: width) }
        case .grid:
            ColumnsLayout(columns: columns ?? 2, spacing: gap) { SkeletonChildren(frames: items, fill: true) }
        case .wrap:
            FlowLayout(spacing: gap) { SkeletonChildren(frames: items, fill: false) }
        }
    }
}

// MARK: Shapes

/// A box on a Card surface (drawn exactly as `CardPrimitive` draws it), or a shimmer shape.
private struct SkeletonBox: View {
    let box: SkeletonFrame.Box
    @Environment(\.primitivePalette) private var palette
    @Environment(\.skeletonIsMask) private var isMask

    var body: some View {
        if let surface = box.surface {
            container(surface: surface)
        } else {
            shape
        }
    }

    private func container(surface: String) -> some View {
        let padding = box.padding ?? PrimitiveMetrics.containerPadding
        let look = isMask ? PrimitiveLook.none : palette.look("Card", "surfaces.\(surface)")
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(box.children.indices, id: \.self) { index in
                SkeletonFrameView(frame: box.children[index]).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .environment(\.primitiveBleed, padding)
        .padding(padding)
        .frame(width: box.width.map { CGFloat($0) })
        .frame(
            maxWidth: box.width == nil ? .infinity : nil,
            minHeight: box.height.map { CGFloat($0) },
            alignment: .topLeading
        )
        .primitiveSurface(look, radius: SkeletonShape.points(box.radius))
    }

    @ViewBuilder
    private var shape: some View {
        if let aspect = box.aspect {
            // An image: as wide as offered (or `width`), as tall as the aspect makes it.
            SkeletonShape(radius: box.radius)
                .aspectRatio(aspect, contentMode: .fit)
                .frame(width: box.width.map { CGFloat($0) })
                .frame(idealWidth: Self.idealWidth)
        } else if let width = box.width {
            SkeletonShape(radius: box.radius).frame(width: width, height: box.height ?? width)
        } else {
            SkeletonShape(radius: box.radius)
                .frame(minWidth: 0, idealWidth: Self.idealWidth, maxWidth: .infinity)
                .frame(height: box.height ?? PrimitiveMetrics.controlHeight)
        }
    }

    /// Width offered to a stretchy box that is asked for its ideal size (in a rail).
    static let idealWidth: CGFloat = 160
}

/// A rounded shape in the theme's neutral fill, white in the shimmer mask.
struct SkeletonShape: View {
    let radius: SkeletonFrame.Radius
    @Environment(\.primitivePalette) private var palette
    @Environment(\.skeletonIsMask) private var isMask

    var body: some View {
        RoundedRectangle(cornerRadius: Self.points(radius), style: .continuous)
            .fill(isMask ? Color.white : palette.color(token: "surface.skeleton"))
    }

    static func points(_ radius: SkeletonFrame.Radius) -> CGFloat {
        switch radius {
        case let .points(points): points
        case .pill: PrimitiveMetrics.pill
        }
    }
}

/// A text line: a bar 60 % of the line height, centred in it, `fraction` of the width.
private struct SkeletonLine: View {
    let height: Double
    let fraction: Double
    @Environment(\.skeletonLinesTrail) private var trails

    var body: some View {
        FractionWidthLayout(fraction: fraction, height: height, trails: trails) {
            SkeletonShape(radius: .pill)
        }
    }
}

/// Takes the offered width and places its one subview at `fraction` of it, 60 % of the
/// line height tall and centred vertically, at the leading or trailing edge. Asked for its
/// ideal size, it is 240 wide.
private struct FractionWidthLayout: Layout {
    let fraction: Double
    let height: Double
    let trails: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews _: Subviews, cache _: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? 240
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        let size = ProposedViewSize(width: bounds.width * min(1, max(0, fraction)), height: height * 0.6)
        let point = CGPoint(x: trails ? bounds.maxX : bounds.minX, y: bounds.midY)
        subviews.first?.place(at: point, anchor: trails ? .trailing : .leading, proposal: size)
    }
}

private struct SkeletonDivider: View {
    @Environment(\.primitivePalette) private var palette
    @Environment(\.skeletonIsMask) private var isMask

    var body: some View {
        Rectangle()
            .fill(isMask ? Color.clear : palette.color(token: "outline.subtle"))
            .frame(height: 1)
    }
}

/// Fixed space along the enclosing stack's axis, like `SpacerPrimitive`.
private struct SkeletonSpacer: View {
    let size: Double
    @Environment(\.primitiveStackAxis) private var axis

    var body: some View {
        Color.clear.frame(width: axis == .horizontal ? size : 0, height: axis == .vertical ? size : 0)
    }
}
