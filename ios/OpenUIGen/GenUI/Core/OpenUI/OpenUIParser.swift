import Foundation

/// The pinned emitted subset of OpenUI Lang, used by the app compiler.
public indirect enum OpenUIExpression: Equatable, Sendable {
    case literal(PValue), reference(String), member(OpenUIExpression, String), index(OpenUIExpression, Int)
    case call(String, [OpenUIExpression]), array([OpenUIExpression]), object([String: OpenUIExpression])
}

public struct OpenUIProgram: Equatable, Sendable {
    public let statements: [String: OpenUIExpression]
    public let order: [String]
}

public struct OpenUIParser {
    private var tokens: [String] = []
    private var offset = 0
    public init() {}
    public mutating func parse(_ source: String, allowIncomplete: Bool = false) throws -> OpenUIProgram {
        tokens = try Self.lex(source, allowIncomplete: allowIncomplete); offset = 0
        var statements: [String: OpenUIExpression] = [:], order: [String] = []
        while offset < tokens.count {
            do {
                let name = try take(); try expect("="); let value = try expression()
                // Statements end at a newline, which the lexer drops, or at an optional `;`.
                if peek(";") { offset += 1 }
                if statements[name] == nil { order.append(name) }
                statements[name] = value
            } catch {
                if allowIncomplete { break }; throw error
            }
        }
        return .init(statements: statements, order: order)
    }

    private mutating func take() throws -> String {
        guard offset < tokens.count else { throw OpenUIError.syntax("Unexpected end") }
        defer { offset += 1 }; return tokens[offset]
    }

    private mutating func expect(_ value: String) throws {
        guard try take() == value else { throw OpenUIError.syntax("Expected \(value)") }
    }

    private func peek(_ value: String) -> Bool { offset < tokens.count && tokens[offset] == value }
    private mutating func expression() throws -> OpenUIExpression {
        try postfix(primary(take()))
    }

    private mutating func primary(_ token: String) throws -> OpenUIExpression {
        switch token {
        case "[": return try .array(list(until: "]"))
        case "{": return try object()
        case "null": return .literal(.null)
        case "true", "false": return .literal(.bool(token == "true"))
        default: break
        }
        if token.hasPrefix("\"") { return try .literal(.string(Self.string(token)!)) }
        if let number = Double(token) { return .literal(.number(number)) }
        guard peek("(") else { return .reference(token) }
        offset += 1
        return try .call(token.hasPrefix("@") ? String(token.dropFirst()) : token, list(until: ")"))
    }

    /// Comma-separated expressions up to `close`, which it consumes.
    private mutating func list(until close: String) throws -> [OpenUIExpression] {
        var values: [OpenUIExpression] = []
        if !peek(close) {
            repeat {
                try values.append(expression()); if !peek(",") { break }; offset += 1
            } while !peek(close)
        }
        try expect(close)
        return values
    }

    private mutating func object() throws -> OpenUIExpression {
        var values: [String: OpenUIExpression] = [:]
        if !peek("}") {
            repeat {
                let key = try take(); try expect(":")
                try values[Self.string(key) ?? key] = try expression()
                if !peek(",") { break }; offset += 1
            } while !peek("}")
        }
        try expect("}")
        return .object(values)
    }

    /// `.field` and `[index]` after an expression.
    private mutating func postfix(_ base: OpenUIExpression) throws -> OpenUIExpression {
        var value = base
        while true {
            if peek(".") {
                offset += 1; value = try .member(value, take())
            } else if peek("[") {
                offset += 1
                guard let index = try Int(take()),
                      index >= 0 else { throw OpenUIError.syntax("Index must be a nonnegative integer") }
                try expect("]"); value = .index(value, index)
            } else {
                return value
            }
        }
    }

    private static func string(_ token: String) throws -> String? {
        guard token.hasPrefix("\"") else { return nil }
        return try JSONDecoder().decode(String.self, from: Data(token.utf8))
    }

    private static func lex(_ source: String, allowIncomplete: Bool) throws -> [String] {
        let chars = Array(source); var index = 0; var result: [String] = []
        while index < chars.count {
            let char = chars[index]
            if char.isWhitespace { index += 1; continue }
            if char == "/", index + 1 < chars.count, chars[index + 1] == "/" {
                while index < chars.count, chars[index] != "\n" { index += 1 }
                continue
            }
            if "=;(),[]{}:.".contains(char) { result.append(String(char)); index += 1; continue }
            let start = index
            guard try scan(chars, from: &index, allowIncomplete: allowIncomplete) else { break }
            result.append(String(chars[start ..< index]))
        }
        return result
    }

    /// Moves past one string, number or word. False for a string the stream has not finished yet.
    private static func scan(_ chars: [Character], from index: inout Int, allowIncomplete: Bool) throws -> Bool {
        let first = chars[index]; index += 1
        if first == "\"" {
            var escaped = false
            while index < chars.count {
                let next = chars[index]; index += 1
                if next == "\"", !escaped { return true }
                escaped = next == "\\" && !escaped
            }
            if allowIncomplete { return false }
            throw OpenUIError.syntax("Unterminated string")
        }
        let continues: (Character) -> Bool = first.isNumber || first == "-"
            ? { $0.isNumber || ".eE+-".contains($0) }
            : { $0.isLetter || $0.isNumber || $0 == "_" }
        while index < chars.count, continues(chars[index]) {
            index += 1
        }
        return true
    }
}
