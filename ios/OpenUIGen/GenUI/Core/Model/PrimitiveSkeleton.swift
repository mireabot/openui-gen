import Foundation

/// Coarse frames of what is about to stream, so the app can draw a shimmer with the real
/// content's shape before the first DSL line arrives. Mirrors the backend's
/// `src/dsl/skeleton.ts`: the `skeleton` SSE event, and the `skeleton` field of each
/// bundled rebuild.
///
/// `blocks[i]` stands in for the tree's i-th top block (`PrimitiveTree.topBlocks`).
public struct PrimitiveSkeleton: Sendable, Equatable, Codable {
    /// Gap between blocks, from the top container.
    public let gap: Double
    /// The screen inset the blocks sit in.
    public let inset: Double
    public let blocks: [SkeletonFrame]

    public init(gap: Double, inset: Double, blocks: [SkeletonFrame]) {
        self.gap = gap
        self.inset = inset
        self.blocks = blocks
    }
}

/// One frame of a skeleton: a layout container, or a shape to shimmer.
public indirect enum SkeletonFrame: Sendable, Equatable {
    public enum Axis: String, Sendable, Codable {
        case vertical = "v"
        case horizontal = "h"
    }

    public enum RepeatLayout: String, Sendable, Codable {
        case stack
        case rail
        case grid
        case wrap
    }

    /// A corner radius in points, or a capsule.
    public enum Radius: Sendable, Equatable {
        case points(Double)
        case pill
    }

    /// A box. With `surface` it is a container drawn on that Card surface (card, filled,
    /// grouped, outlined) with its children inside; without, a shimmer fill.
    public struct Box: Sendable, Equatable {
        public var height: Double?
        public var width: Double?
        /// Width over height.
        public var aspect: Double?
        public var radius: Radius
        public var surface: String?
        public var padding: Double?
        public var children: [SkeletonFrame]

        public init(
            height: Double? = nil,
            width: Double? = nil,
            aspect: Double? = nil,
            radius: Radius,
            surface: String? = nil,
            padding: Double? = nil,
            children: [SkeletonFrame] = []
        ) {
            self.height = height
            self.width = width
            self.aspect = aspect
            self.radius = radius
            self.surface = surface
            self.padding = padding
            self.children = children
        }
    }

    case stack(axis: Axis, gap: Double, align: String?, justify: String?, children: [SkeletonFrame])
    case grid(columns: Int, gap: Double, children: [SkeletonFrame])
    /// `width`: each item's width in points (rails of fixed-width cards), nil for their own width.
    case rail(gap: Double, width: Double? = nil, children: [SkeletonFrame])
    case `repeat`(
        layout: RepeatLayout,
        count: Int,
        gap: Double,
        columns: Int?,
        width: Double? = nil,
        divided: Bool,
        item: SkeletonFrame
    )
    case box(Box)
    /// One text line: `height` is the role's line height, `width` a fraction (0…1) of the
    /// available width.
    case line(height: Double, width: Double)
    case circle(size: Double)
    case divider
    case spacer(size: Double)
}

// MARK: Codable

extension SkeletonFrame.Radius: Codable {
    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let points = try? container.decode(Double.self) {
            self = .points(points)
        } else if try container.decode(String.self) == "pill" {
            self = .pill
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "radius is a number or \"pill\"")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .points(points): try container.encode(points)
        case .pill: try container.encode("pill")
        }
    }
}

extension SkeletonFrame: Codable {
    private enum Key: String, CodingKey {
        case kind, axis, gap, align, justify, children, columns, layout, count, divided, item
        case height, width, aspect, radius, surface, padding, size
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: Key.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "stack":
            self = try .stack(
                axis: container.decode(Axis.self, forKey: .axis),
                gap: container.decode(Double.self, forKey: .gap),
                align: container.decodeIfPresent(String.self, forKey: .align),
                justify: container.decodeIfPresent(String.self, forKey: .justify),
                children: container.decode([Self].self, forKey: .children)
            )
        case "grid":
            self = try .grid(
                columns: container.decode(Int.self, forKey: .columns),
                gap: container.decode(Double.self, forKey: .gap),
                children: container.decode([Self].self, forKey: .children)
            )
        case "rail":
            self = try .rail(
                gap: container.decode(Double.self, forKey: .gap),
                width: container.decodeIfPresent(Double.self, forKey: .width),
                children: container.decode([Self].self, forKey: .children)
            )
        case "repeat":
            self = try .repeat(
                layout: container.decode(RepeatLayout.self, forKey: .layout),
                count: container.decode(Int.self, forKey: .count),
                gap: container.decode(Double.self, forKey: .gap),
                columns: container.decodeIfPresent(Int.self, forKey: .columns),
                width: container.decodeIfPresent(Double.self, forKey: .width),
                divided: container.decodeIfPresent(Bool.self, forKey: .divided) ?? false,
                item: container.decode(Self.self, forKey: .item)
            )
        default:
            self = try Self.shape(kind: kind, from: container)
        }
    }

    private static func shape(kind: String, from container: KeyedDecodingContainer<Key>) throws -> Self {
        switch kind {
        case "box":
            return try .box(Box(
                height: container.decodeIfPresent(Double.self, forKey: .height),
                width: container.decodeIfPresent(Double.self, forKey: .width),
                aspect: container.decodeIfPresent(Double.self, forKey: .aspect),
                radius: container.decode(Radius.self, forKey: .radius),
                surface: container.decodeIfPresent(String.self, forKey: .surface),
                padding: container.decodeIfPresent(Double.self, forKey: .padding),
                children: container.decodeIfPresent([Self].self, forKey: .children) ?? []
            ))
        case "line":
            return try .line(
                height: container.decode(Double.self, forKey: .height),
                width: container.decode(Double.self, forKey: .width)
            )
        case "circle":
            return try .circle(size: container.decode(Double.self, forKey: .size))
        case "divider":
            return .divider
        case "spacer":
            return try .spacer(size: container.decode(Double.self, forKey: .size))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .kind,
                in: container,
                debugDescription: "Unknown skeleton frame kind \(kind)"
            )
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: Key.self)
        switch self {
        case let .stack(axis, gap, align, justify, children):
            try container.encode("stack", forKey: .kind)
            try container.encode(axis, forKey: .axis)
            try container.encode(gap, forKey: .gap)
            try container.encodeIfPresent(align, forKey: .align)
            try container.encodeIfPresent(justify, forKey: .justify)
            try container.encode(children, forKey: .children)
        case let .grid(columns, gap, children):
            try container.encode("grid", forKey: .kind)
            try container.encode(columns, forKey: .columns)
            try container.encode(gap, forKey: .gap)
            try container.encode(children, forKey: .children)
        case let .rail(gap, width, children):
            try container.encode("rail", forKey: .kind)
            try container.encode(gap, forKey: .gap)
            try container.encodeIfPresent(width, forKey: .width)
            try container.encode(children, forKey: .children)
        case let .repeat(layout, count, gap, columns, width, divided, item):
            try container.encode("repeat", forKey: .kind)
            try container.encode(layout, forKey: .layout)
            try container.encode(count, forKey: .count)
            try container.encode(gap, forKey: .gap)
            try container.encodeIfPresent(columns, forKey: .columns)
            try container.encodeIfPresent(width, forKey: .width)
            if divided { try container.encode(true, forKey: .divided) }
            try container.encode(item, forKey: .item)
        default:
            try encodeShape(into: &container)
        }
    }

    private func encodeShape(into container: inout KeyedEncodingContainer<Key>) throws {
        switch self {
        case let .box(box):
            try container.encode("box", forKey: .kind)
            try container.encodeIfPresent(box.height, forKey: .height)
            try container.encodeIfPresent(box.width, forKey: .width)
            try container.encodeIfPresent(box.aspect, forKey: .aspect)
            try container.encode(box.radius, forKey: .radius)
            try container.encodeIfPresent(box.surface, forKey: .surface)
            try container.encodeIfPresent(box.padding, forKey: .padding)
            if !box.children.isEmpty { try container.encode(box.children, forKey: .children) }
        case let .line(height, width):
            try container.encode("line", forKey: .kind)
            try container.encode(height, forKey: .height)
            try container.encode(width, forKey: .width)
        case let .circle(size):
            try container.encode("circle", forKey: .kind)
            try container.encode(size, forKey: .size)
        case .divider:
            try container.encode("divider", forKey: .kind)
        case let .spacer(size):
            try container.encode("spacer", forKey: .kind)
            try container.encode(size, forKey: .size)
        case .stack, .grid, .rail, .repeat:
            preconditionFailure("containers are encoded by encode(to:)")
        }
    }
}
