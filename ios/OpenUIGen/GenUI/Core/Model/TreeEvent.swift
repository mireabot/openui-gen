import Foundation

/// One step of a streamed tree, from the server's SSE stream or from `DSLTreeBuilder`.
public enum TreeEvent: Sendable, Equatable {
    /// The root line: where the generation goes.
    case root(Placement)
    /// One finished statement: its node plus inline child nodes, the data they read, and
    /// the parent that named the statement (`"root"` for top-level ids, `nil` when unnamed).
    case nodes([PNode], needs: [DataNeed], parent: String?)
    case issue(TreeIssue)

    public enum DecodeError: Error, Equatable {
        case unknownEvent(String)
    }

    private struct RootPayload: Decodable {
        let placement: Placement
    }

    private struct NodesPayload: Decodable {
        let nodes: [PNode]
        let needs: [DataNeed]
        let parent: String?
    }

    private struct IssuePayload: Decodable {
        let issue: TreeIssue
    }

    /// Decodes one SSE message: the event name (`root`, `nodes`, `issue`) and its JSON data,
    /// `{placement}`, `{nodes, needs, parent}` or `{issue}`.
    public static func decode(
        event: String,
        data: Data,
        decoder: JSONDecoder = JSONDecoder()
    ) throws -> TreeEvent {
        switch event {
        case "root":
            return try .root(decoder.decode(RootPayload.self, from: data).placement)
        case "nodes":
            let payload = try decoder.decode(NodesPayload.self, from: data)
            return .nodes(payload.nodes, needs: payload.needs, parent: payload.parent)
        case "issue":
            return try .issue(decoder.decode(IssuePayload.self, from: data).issue)
        default:
            throw DecodeError.unknownEvent(event)
        }
    }
}
