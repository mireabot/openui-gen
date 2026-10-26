import Foundation

/// The pinned emitted subset of OpenUI Lang, deliberately independent of the retired DSL.
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
        let token = try take(); var value: OpenUIExpression
        if token == "[" {
            var values: [OpenUIExpression] = []
            if !peek("]") {
                repeat {
                    try values.append(expression()); if !peek(",") { break }; offset += 1
                } while !peek("]")
            }
            try expect("]"); value = .array(values)
        } else if token == "{" {
            var values: [String: OpenUIExpression] = [:]
            if !peek("}") { repeat {
                let key = try take(); try expect(":")
                try values[Self.string(key) ?? key] = try expression()
                if !peek(",") { break }; offset += 1
            } while !peek("}") }
            try expect("}"); value = .object(values)
        } else if token.hasPrefix("\"") { value = try .literal(.string(Self.string(token)!))
        } else if token == "null" { value = .literal(.null)
        } else if token == "true" || token == "false" { value = .literal(.bool(token == "true"))
        } else if let number = Double(token) { value = .literal(.number(number))
        } else if peek("(") {
            offset += 1; var args: [OpenUIExpression] = []
            if !peek(")") {
                repeat {
                    try args.append(expression()); if !peek(",") { break }; offset += 1
                } while !peek(")")
            }
            try expect(")"); value = .call(token.hasPrefix("@") ? String(token.dropFirst()) : token, args)
        } else { value = .reference(token) }
        while offset < tokens.count {
            if peek(".") { offset += 1; value = try .member(value, take()) }
            else if peek("[") {
                offset += 1; guard let index = try Int(take()),
                                   index >= 0 else { throw OpenUIError.syntax("Index must be a nonnegative integer") }
                try expect("]"); value = .index(value, index)
            } else { break }
        }
        return value
    }

    private static func string(_ token: String) throws -> String? {
        guard token.hasPrefix("\"") else { return nil }
        return try JSONDecoder().decode(String.self, from: Data(token.utf8))
    }

    private static func lex(_ source: String, allowIncomplete: Bool) throws -> [String] {
        let chars = Array(source); var i = 0; var result: [String] = []
        while i < chars.count {
            let c = chars[i]
            if c.isWhitespace { i += 1; continue }
            if c == "/", i + 1 < chars.count,
               chars[i + 1] == "/" { while i < chars.count, chars[i] != "\n" { i += 1 }; continue }
            if "=;(),[]{}:.".contains(c) { result.append(String(c)); i += 1; continue }
            let start = i
            if c == "\"" {
                i += 1; var escaped = false, closed = false
                while i < chars.count {
                    let next = chars[i]; i += 1
                    if next == "\"", !escaped { closed = true; break }
                    if next == "\\", !escaped { escaped = true } else { escaped = false }
                }
                if !closed { if allowIncomplete { break }; throw OpenUIError.syntax("Unterminated string") }
            } else if c.isNumber || c == "-" {
                i += 1; while i < chars.count, chars[i].isNumber || ".eE+-".contains(chars[i]) { i += 1 }
            } else {
                i += 1; while i < chars.count, chars[i].isLetter || chars[i].isNumber || chars[i] == "_" { i += 1 }
            }
            result.append(String(chars[start ..< i]))
        }
        return result
    }
}
