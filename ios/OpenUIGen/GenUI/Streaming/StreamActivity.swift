import Foundation

/// A pipeline step for the checklist, with any web sources it cited.
public struct DSLActivity: Decodable, Sendable, Equatable {
    public enum Status: String, Decodable, Sendable { case started, working, completed, retrying }
    public let stage: String
    public let status: Status
    public let detail: String
    public let sources: [WebSource]?

    public init(stage: String, status: Status, detail: String, sources: [WebSource]? = nil) {
        self.stage = stage
        self.status = status
        self.detail = detail
        self.sources = sources
    }
}

public extension DSLActivity {
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
