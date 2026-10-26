import SwiftUI

/// A node's props resolved through the current data scope.
struct PrimitiveProps {
    private let node: PNode?
    let scope: DataScope
    private let prepared: [String: PValue]?
    private let slots: [String: OpenUISlotHandle]
    private let bindings: [String: OpenUIEditAddress]
    private let onEdit: (OpenUIEditAddress, Double) -> Void

    init(node: PNode, scope: DataScope) {
        self.node = node
        self.scope = scope
        prepared = nil
        slots = [:]
        bindings = [:]
        onEdit = { _, _ in }
    }

    @MainActor init(handle: OpenUIElementHandle, onEdit: @escaping (OpenUIEditAddress, Double) -> Void) {
        node = nil
        scope = DataScope(data: .null)
        prepared = handle.properties
        slots = handle.slots
        bindings = handle.bindings
        self.onEdit = onEdit
    }

    var isPrepared: Bool { prepared != nil }
    func hasInput(_ key: String) -> Bool { bindings[key] != nil }
    func edit(_ key: String, value: Double) -> Bool {
        guard let address = bindings[key] else { return false }
        onEdit(address, value)
        return true
    }

    @MainActor func childReferences(_ arg: String) -> [PrimitiveChild] {
        if isPrepared { return slots[arg]?.children.map(PrimitiveChild.openUI) ?? [] }
        return children(arg).map(PrimitiveChild.legacy)
    }

    /// The resolved value; `nil` when the prop is absent, `null`, or its data is missing.
    func value(_ key: String) -> PValue? {
        if let prepared { return prepared[key].flatMap { $0 == .null ? nil : $0 } }
        guard let raw = node?.props[key], let resolved = scope.resolve(raw), resolved != .null else { return nil }
        return resolved
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

    /// Child ids of a node argument (`children`, `template`, `trailing`).
    func children(_ arg: String) -> [String] {
        node?.children[arg] ?? []
    }

    /// The `@path` a data prop reads, unresolved (Repeat iterates it by path).
    func dataPath(_ key: String) -> String? {
        node?.props[key]?.dataPath
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
