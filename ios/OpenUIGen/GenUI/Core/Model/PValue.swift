import Foundation

/// A JSON value in a dataset or an evaluated prop. Numbers are always `Double`, as in the
/// TypeScript tree, so `28` from a program and `28` from exported JSON compare equal.
public enum PValue: Sendable, Equatable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case list([PValue])
    case object([String: PValue])
}

// MARK: Accessors

public extension PValue {
    var stringValue: String? {
        if case let .string(value) = self { value } else { nil }
    }

    var numberValue: Double? {
        if case let .number(value) = self { value } else { nil }
    }

    var boolValue: Bool? {
        if case let .bool(value) = self { value } else { nil }
    }

    var listValue: [PValue]? {
        if case let .list(value) = self { value } else { nil }
    }

    var objectValue: [String: PValue]? {
        if case let .object(value) = self { value } else { nil }
    }

    /// Steps into an object by key; `nil` for anything that is not an object.
    subscript(key: String) -> PValue? {
        objectValue?[key]
    }

    /// Steps into a list by index; `nil` out of range or for anything that is not a list.
    subscript(index: Int) -> PValue? {
        guard let list = listValue, list.indices.contains(index) else { return nil }
        return list[index]
    }

    /// The value as JavaScript's `String(v)` would print it, which is how the backend
    /// flattens theme values: `24` not `24.0`.
    internal var scriptString: String {
        switch self {
        case let .string(value): value
        case let .number(value): JSNumber.format(value)
        case let .bool(value): value ? "true" : "false"
        case .null: "null"
        case let .list(values): values.map(\.scriptString).joined(separator: ",")
        case .object: "[object Object]"
        }
    }
}

// MARK: Codable

extension PValue: Codable {
    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([PValue].self) {
            self = .list(value)
        } else {
            self = try .object(container.decode([String: PValue].self))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .bool(value): try container.encode(value)
        case .null: try container.encodeNil()
        case let .list(values): try container.encode(values)
        case let .object(values): try container.encode(values)
        }
    }
}

/// JavaScript number printing for the integral cases programs and the theme produce.
enum JSNumber {
    static func format(_ value: Double) -> String {
        if value.isNaN { return "NaN" }
        if value.isInfinite { return value < 0 ? "-Infinity" : "Infinity" }
        if value == value.rounded(), abs(value) < 1e21 {
            // `-0` prints as "0" in JavaScript.
            return String(Int64(value))
        }
        return String(value)
    }
}
