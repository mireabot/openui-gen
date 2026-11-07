#if DEBUG
import Foundation

/// Fixed run card states for checking the card by eye, from the debug menu. No request is made.
enum DemoRun: String, CaseIterable, Identifiable {
    case initialActive, followUpActive, followUpDone

    var id: String { rawValue }

    var title: String {
        switch self {
        case .initialActive: "New request · running"
        case .followUpActive: "Follow-up · running"
        case .followUpDone: "Follow-up · done"
        }
    }

    /// The card's values, with the clock started a little before now.
    func summary(now: Date = .now) -> RunSummary {
        switch self {
        case .initialActive:
            RunSummary(
                followUp: nil,
                phase: .loading,
                activities: [
                    DSLActivity(stage: "summarize", status: .completed, detail: "Premier League · q1 espn standings"),
                    DSLActivity(stage: "search", status: .working, detail: "ESPN standings · Premier League", lookups: 1),
                ],
                stageCosts: ["summarize": 0.004],
                startedAt: now.addingTimeInterval(-6),
                finishedAt: nil,
                hasDocument: false
            )
        case .followUpActive:
            RunSummary(
                followUp: Self.followUpPrompt,
                phase: .updating,
                activities: [
                    DSLActivity(stage: "summarize", status: .completed, detail: "q1 kept · q2 kept · q3 added"),
                    DSLActivity(stage: "search", status: .working, detail: "Searching: Chelsea injuries before Saturday", searches: 2, lookups: 1),
                ],
                stageCosts: ["summarize": 0.006, "data": 0.002],
                startedAt: now.addingTimeInterval(-11),
                finishedAt: nil,
                hasDocument: true
            )
        case .followUpDone:
            RunSummary(
                followUp: Self.followUpPrompt,
                phase: .ready,
                activities: [
                    DSLActivity(stage: "summarize", status: .completed, detail: "q1 kept · q2 kept · q3 added"),
                    DSLActivity(stage: "search", status: .completed, detail: "q3 complete", searches: 2, lookups: 1, sourceCount: 5),
                    DSLActivity(stage: "data", status: .completed, detail: "6 fields"),
                    DSLActivity(stage: "compose", status: .completed, detail: "3 parts"),
                ],
                stageCosts: ["summarize": 0.006, "search": 0.010, "data": 0.021, "compose": 0.034],
                startedAt: now.addingTimeInterval(-48),
                finishedAt: now,
                hasDocument: true
            )
        }
    }

    /// Long enough to wrap onto a second line.
    private static let followUpPrompt = "Add Chelsea's injury list and who is a doubt for Saturday's game against Arsenal"
}
#endif
