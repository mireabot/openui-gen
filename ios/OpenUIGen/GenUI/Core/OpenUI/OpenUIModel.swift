import Foundation

public struct OpenUIElementID: RawRepresentable, Hashable, Codable, Sendable, CustomStringConvertible {
    public let rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }
    public var description: String { rawValue }
}

public struct OpenUIDataset: Codable, Equatable, Sendable {
    public let tool: String
    public let args: PValue
    public let result: PValue
    public let fields: PValue?
    public let asOf: PValue?
    public let source: PValue?
    public init(
        tool: String = "sports_dataset",
        args: PValue,
        result: PValue,
        fields: PValue? = nil,
        asOf: PValue? = nil,
        source: PValue? = nil
    ) {
        self.tool = tool; self.args = args; self.result = result; self.fields = fields; self.asOf = asOf; self
            .source = source
    }
}

/// A component defined as an OpenUI Lang body over its parameters, as the server sends it
/// (`templates` event) and `sports-components.json` bundles it. A program calls it by name.
public struct OpenUITemplate: Codable, Equatable, Sendable {
    public struct Param: Codable, Equatable, Sendable {
        public let name: String
        /// "data": a data reference. "copy": text, or null for `default`.
        public let role: String
        /// What a copy param holds: "text" (nil) or "boolean".
        public let kind: String?
        /// The body expression used when a copy argument is absent or null.
        public let `default`: String?
        public init(name: String, role: String, kind: String? = nil, default: String? = nil) {
            self.name = name; self.role = role; self.kind = kind; self.default = `default`
        }
    }

    public let name: String
    public let params: [Param]
    public let body: String
    public init(name: String, params: [Param], body: String) {
        self.name = name; self.params = params; self.body = body
    }

    /// The templates bundled with the app, for programs that arrive without their own.
    public static func bundled() -> [Self] {
        struct Index: Decodable { let templates: [OpenUITemplate]? }
        guard let url = Bundle.main.url(forResource: "sports-components", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let index = try? JSONDecoder().decode(Index.self, from: data)
        else { return [] }
        return index.templates ?? []
    }
}

public struct OpenUIArchive: Codable, Sendable {
    public let version: Int
    public let documentID: String
    public let revision: Int
    public let origin: URL
    public let program: String
    public let datasets: [OpenUIDataset]
    /// The templates the program was drawn with; nil uses the bundled set.
    public let templates: [OpenUITemplate]?
    public let theme: String
    public init(
        documentID: String,
        revision: Int,
        origin: URL,
        program: String,
        datasets: [OpenUIDataset],
        templates: [OpenUITemplate]? = nil,
        theme: String = "kino",
        version: Int = 1
    ) {
        self.version = version; self.documentID = documentID; self.revision = revision; self.origin = origin
        self.program = program; self.datasets = datasets; self.templates = templates; self.theme = theme
    }
}

public struct OpenUISemanticElement: Equatable, Sendable {
    public let id: OpenUIElementID
    public let kind: String
    public var properties: [String: PValue]
    public var slots: [String: [OpenUIElementID]]
}

public struct OpenUIScene: Equatable, Sendable {
    public let roots: [OpenUIElementID]
    public let elements: [OpenUIElementID: OpenUISemanticElement]
}

public enum OpenUIError: Error, Equatable, Sendable {
    case syntax(String), unknownPrimitive(String), missingQuery(String), cyclicReference(String), invalidArchive,
         missingDocument, staleRevision, incompleteStream
    /// The server could not answer; its own message, ready to show.
    case server(String)
}

extension OpenUIError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case let .syntax(detail): "OpenUI syntax: \(detail)"
        case let .unknownPrimitive(name): "Unknown OpenUI component \(name)"
        case let .missingQuery(tool): "No data arrived for \(tool)"
        case let .cyclicReference(name): "\(name) refers to itself"
        case .invalidArchive: "The saved answer could not be read"
        case .missingDocument: "There is no answer to update yet"
        case .staleRevision: "The answer changed on the server; ask again"
        case .incompleteStream: "The answer stream ended early"
        case let .server(message): message
        }
    }
}
