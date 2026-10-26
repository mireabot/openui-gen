import Foundation

/// The type of one primitive argument, mirroring `PropType` in the backend's `src/dsl/props.ts`.
///
/// The set of kinds is closed: decoding an unknown `kind` throws, so a catalog from a newer
/// backend fails loudly instead of silently accepting arguments this mapper cannot check.
public indirect enum PropType: Sendable, Equatable, Hashable {
    case text
    case number(format: String)
    case boolean
    case date(precision: String)
    case `enum`(values: [String])
    case status
    case color
    case icon
    case image
    case action
    case object(fields: [PropDefinition])
    case list(of: PropType, min: Int?, max: Int?)
    /// A design token from the catalog's `tokens` table, e.g. `space`, `ink`.
    case token(String)
    /// One child node. `item`: a Repeat template, where `@.field` reads the item.
    case node(accepts: [String]?, item: Bool)
    /// Ordered children.
    case nodes(accepts: [String]?, min: Int?, max: Int?)

    public var kind: String {
        switch self {
        case .text: "text"
        case .number: "number"
        case .boolean: "boolean"
        case .date: "date"
        case .enum: "enum"
        case .status: "status"
        case .color: "color"
        case .icon: "icon"
        case .image: "image"
        case .action: "action"
        case .object: "object"
        case .list: "list"
        case .token: "token"
        case .node: "node"
        case .nodes: "nodes"
        }
    }

    /// `node` or `nodes`: the argument holds child ids, not a prop.
    public var isNode: Bool {
        switch self {
        case .node, .nodes: true
        default: false
        }
    }

    /// The child primitives a `node` / `nodes` argument accepts; `nil` when any is allowed.
    public var accepts: [String]? {
        switch self {
        case let .node(accepts, _), let .nodes(accepts, _, _): accepts
        default: nil
        }
    }
}

extension PropType: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, format, precision, values, fields, of, min, max, token, accepts, item
    }

    private static let simpleKinds: [String: PropType] = [
        "text": .text, "boolean": .boolean, "status": .status, "color": .color,
        "icon": .icon, "image": .image, "action": .action,
    ]

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        if let primitive = Self.simpleKinds[kind] {
            self = primitive
            return
        }
        switch kind {
        case "number": self = try .number(format: container.decode(String.self, forKey: .format))
        case "date": self = try .date(precision: container.decode(String.self, forKey: .precision))
        case "enum": self = try .enum(values: container.decode([String].self, forKey: .values))
        case "object": self = try .object(fields: container.decode([PropDefinition].self, forKey: .fields))
        case "list":
            self = try .list(
                of: container.decode(PropType.self, forKey: .of),
                min: container.decodeIfPresent(Int.self, forKey: .min),
                max: container.decodeIfPresent(Int.self, forKey: .max)
            )
        case "token": self = try .token(container.decode(String.self, forKey: .token))
        case "node":
            self = try .node(
                accepts: container.decodeIfPresent([String].self, forKey: .accepts),
                item: container.decodeIfPresent(Bool.self, forKey: .item) ?? false
            )
        case "nodes":
            self = try .nodes(
                accepts: container.decodeIfPresent([String].self, forKey: .accepts),
                min: container.decodeIfPresent(Int.self, forKey: .min),
                max: container.decodeIfPresent(Int.self, forKey: .max)
            )
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .kind,
                in: container,
                debugDescription: "Unknown prop kind \(kind)."
            )
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        switch self {
        case .text, .boolean, .status, .color, .icon, .image, .action:
            break
        case let .number(format): try container.encode(format, forKey: .format)
        case let .date(precision): try container.encode(precision, forKey: .precision)
        case let .enum(values): try container.encode(values, forKey: .values)
        case let .object(fields): try container.encode(fields, forKey: .fields)
        case let .list(of, min, max):
            try container.encode(of, forKey: .of)
            try container.encodeIfPresent(min, forKey: .min)
            try container.encodeIfPresent(max, forKey: .max)
        case let .token(token): try container.encode(token, forKey: .token)
        case let .node(accepts, item):
            try container.encodeIfPresent(accepts, forKey: .accepts)
            if item { try container.encode(true, forKey: .item) }
        case let .nodes(accepts, min, max):
            try container.encodeIfPresent(accepts, forKey: .accepts)
            try container.encodeIfPresent(min, forKey: .min)
            try container.encodeIfPresent(max, forKey: .max)
        }
    }
}
