import Foundation

public struct OpenUIElementID: RawRepresentable, Hashable, Codable, Sendable, CustomStringConvertible {
    public let rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }
    public var description: String { rawValue }
}

public enum OpenUIPathStep: Hashable, Codable, Sendable { case field(String), index(Int) }
public struct OpenUISourceAddress: Hashable, Codable, Sendable {
    public let query: String
    public var path: [OpenUIPathStep]
    public init(query: String, path: [OpenUIPathStep] = []) { self.query = query; self.path = path }
}

public struct OpenUIEditAddress: Hashable, Codable, Sendable {
    public let element: OpenUIElementID
    public let source: OpenUISourceAddress
    public let input: String
    public init(element: OpenUIElementID, source: OpenUISourceAddress, input: String) {
        self.element = element; self.source = source; self.input = input
    }
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

public struct OpenUIArchive: Codable, Sendable {
    public let version: Int
    public let documentID: String
    public let revision: Int
    public let origin: URL
    public let program: String
    public let datasets: [OpenUIDataset]
    public let theme: String
    public init(
        documentID: String,
        revision: Int,
        origin: URL,
        program: String,
        datasets: [OpenUIDataset],
        theme: String = "kino",
        version: Int = 1
    ) {
        self.version = version; self.documentID = documentID; self.revision = revision; self.origin = origin
        self.program = program; self.datasets = datasets; self.theme = theme
    }
}

public struct OpenUISemanticElement: Equatable, Sendable {
    public let id: OpenUIElementID
    public let kind: String
    public var properties: [String: PValue]
    public var bindings: [String: OpenUIEditAddress]
    public var sources: [String: OpenUISourceAddress]
    public var slots: [String: [OpenUIElementID]]
}

public struct OpenUIScene: Equatable, Sendable {
    public let roots: [OpenUIElementID]
    public let elements: [OpenUIElementID: OpenUISemanticElement]
    public let reads: [OpenUISourceAddress: Set<OpenUIElementID>]
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
