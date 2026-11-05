import SwiftUI

/// One retained element's evaluated properties and child slots.
struct PrimitiveProps {
    private let properties: [String: PValue]
    private let slots: [String: OpenUISlotHandle]

    @MainActor init(handle: OpenUIElementHandle) {
        properties = handle.properties
        slots = handle.slots
    }

    @MainActor func childReferences(_ arg: String) -> [PrimitiveChild] {
        slots[arg]?.children.map(PrimitiveChild.init) ?? []
    }

    /// The evaluated value; `nil` when the prop is absent or `null`.
    func value(_ key: String) -> PValue? {
        properties[key].flatMap { $0 == .null ? nil : $0 }
    }

    /// Strings as they are; numbers and booleans printed (`24`, not `24.0`).
    func string(_ key: String) -> String? {
        value(key).flatMap(Self.text)
    }

    /// Numbers, and numeric strings (`"2"` for Grid columns).
    func number(_ key: String) -> Double? {
        switch value(key) {
        case let .number(number): number
        case let .string(text): Double(text)
        default: nil
        }
    }

    func cgFloat(_ key: String) -> CGFloat? {
        number(key).map { CGFloat($0) }
    }

    func int(_ key: String) -> Int? {
        number(key).map { Int($0) }
    }

    func bool(_ key: String) -> Bool? {
        switch value(key) {
        case let .bool(flag): flag
        case let .number(number): number != 0
        case let .string(text): !text.isEmpty
        default: nil
        }
    }

    func flag(_ key: String) -> Bool {
        bool(key) ?? false
    }

    func list(_ key: String) -> [PValue] {
        value(key)?.listValue ?? []
    }

    static func text(_ value: PValue) -> String? {
        switch value {
        case let .string(text): text
        case let .number(number) where number == number.rounded() && abs(number) < 1e15:
            String(Int64(number))
        case let .number(number):
            String(number)
        case let .bool(flag): flag ? "true" : "false"
        default: nil
        }
    }
}
