import Foundation

/// A pipeline step for the checklist, with any web sources it cited.
public struct DSLActivity: Decodable, Sendable, Equatable {
    public enum Status: String, Decodable, Sendable { case started, working, completed, retrying }
    public let stage: String
    public let status: Status
    public let detail: String
    public let sources: [WebSource]?
    /// The search step: Parallel web searches and ESPN lookups in this run, and every source read.
    public let searches: Int?
    public let lookups: Int?
    public let sourceCount: Int?

    public init(
        stage: String,
        status: Status,
        detail: String,
        sources: [WebSource]? = nil,
        searches: Int? = nil,
        lookups: Int? = nil,
        sourceCount: Int? = nil
    ) {
        self.stage = stage
        self.status = status
        self.detail = detail
        self.sources = sources
        self.searches = searches
        self.lookups = lookups
        self.sourceCount = sourceCount
    }
}

public extension DSLActivity {
    /// "3 Parallel searches · 2 ESPN lookups · 8 sources: skysports.com, opta.com".
    var searchSummary: String? {
        var parts: [String] = []
        if let searches, searches > 0 { parts.append("\(searches) Parallel \(searches == 1 ? "search" : "searches")") }
        if let lookups, lookups > 0 { parts.append("\(lookups) ESPN \(lookups == 1 ? "lookup" : "lookups")") }
        if let sourceCount, sourceCount > 0 {
            let hosts = Array(NSOrderedSet(array: (sources ?? []).compactMap { URL(string: $0.url)?.host() }))
                .prefix(3).compactMap { $0 as? String }
            let list = hosts.isEmpty ? "" : ": \(hosts.joined(separator: ", "))"
            parts.append("\(sourceCount) \(sourceCount == 1 ? "source" : "sources")\(list)")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// The checklist title for this step's stage; an unknown stage shows its own name.
    var title: String {
        switch stage {
        case "summarize": "Understand request"
        case "search": "Search web"
        case "data": "Prepare data"
        case "retrieve": "Find references"
        case "decide": "Choose layout"
        case "compose": "Compose screen"
        case "write": "Write layout"
        case "validate": "Validate contract"
        default: stage
        }
    }
}
