import Foundation

/// A source actually returned by the server's web research, retained in History.
public struct WebSource: Codable, Sendable, Equatable, Hashable, Identifiable {
    public let title: String
    public let url: String
    public var id: String { url }

    public init(title: String, url: String) {
        self.title = title
        self.url = url
    }
}
