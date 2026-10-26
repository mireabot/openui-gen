import Foundation

/// A problem with one statement (or the generation as a whole). Issues never stop the
/// stream: the bad line is dropped and the rest of the tree keeps arriving.
public struct TreeIssue: Sendable, Equatable, Hashable, Codable {
    public enum Code: String, Sendable, Codable, CaseIterable {
        /// The line is not a statement.
        case parse
        /// The first line is not the mode's root, or there are no statements.
        case badRoot = "bad-root"
        /// An interface insert names a node that is not on the host screen.
        case unknownAnchor = "unknown-anchor"
        /// The statement parses but breaks the catalog's rules.
        case invalid
        /// The id was already defined (or already failed); the first one stands.
        case duplicateID = "duplicate-id"
        /// A parent named this id but no line defined it.
        case missingNode = "missing-node"
        /// Defined, but nothing places it.
        case orphan
        /// The statement names a child that already has a parent.
        case reused
    }

    public let code: Code
    /// The statement id, when known.
    public let statement: String?
    public let line: Int?
    public let message: String

    public init(code: Code, statement: String?, line: Int?, message: String) {
        self.code = code
        self.statement = statement
        self.line = line
        self.message = message
    }
}
