import SwiftUI

/// What the run card shows: a live session's state, or fixed demo values (`DemoRun`).
struct RunSummary {
    /// The prompt, when the run edits a screen; nil for a new screen.
    var followUp: String?
    var phase: OpenUISession.Phase
    var activities: [DSLActivity]
    var stageCosts: [String: Double]
    var startedAt: Date
    var finishedAt: Date?
    /// A finished run with a document can be saved.
    var hasDocument: Bool

    var totalCost: Double { stageCosts.values.reduce(0, +) }
}

extension RunSummary {
    @MainActor init(session: OpenUISession, followUp: String?) {
        self.init(
            followUp: followUp,
            phase: session.phase,
            activities: session.activities,
            stageCosts: session.stageCosts,
            startedAt: session.startedAt,
            finishedAt: session.finishedAt,
            hasDocument: session.document != nil
        )
    }
}

/// The run, opened from the composer's `$` button: a follow-up's prompt first, then how many steps and
/// whether it is still going, its time and cost, then one row per step, a spinner while it works and a
/// check when done, with its cost. A finished screen ends with a row that saves it.
struct GenerationStatusView: View {
    let run: RunSummary
    let saveState: AskModel.SaveState
    let onSave: () -> Void

    @Environment(\.primitivePalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let followUp = run.followUp {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Follow up")
                        .primitiveFont(.footnote)
                        .foregroundStyle(.secondary)
                    Text(followUp)
                        .primitiveFont(.body, weight: .medium)
                        .multilineTextAlignment(.leading)
                }
            }
            header
            ForEach(run.activities, id: \.stage) { activity in
                StepRow(activity: activity, cost: run.stageCosts[activity.stage])
            }
            if run.phase == .ready, run.hasDocument {
                saveRow
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.color(token: "surface.card"), in: .rect(cornerRadius: PrimitiveMetrics.containerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: PrimitiveMetrics.containerRadius)
                .strokeBorder(palette.color(token: "outline.control"), lineWidth: 0.5)
        }
        .shadow(color: .black.opacity(0.35), radius: 24, y: 8)
    }

    // MARK: Pieces

    /// "4 steps running", then the time and the cost so far.
    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("\(run.activities.count) \(run.activities.count == 1 ? "step" : "steps")")
                .primitiveFont(.headline, weight: .semibold)
            Text(state)
                .primitiveFont(.headline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            TimelineView(.periodic(from: run.startedAt, by: 1)) { context in
                Text(Self.clock((run.finishedAt ?? context.date).timeIntervalSince(run.startedAt)))
            }
            .primitiveFont(.footnote)
            .foregroundStyle(.secondary)
            Text(run.totalCost, format: .currency(code: "USD").precision(.fractionLength(3)))
                .primitiveFont(.footnote, weight: .medium)
        }
        .monospacedDigit()
    }

    /// The screen itself, done: a check, what can happen to it, and the save pill.
    private var saveRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.body)
                .foregroundStyle(palette.color(token: "ink.brand"))
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text("Screen")
                    .primitiveFont(.body, weight: .medium)
                Text(saveDetail)
                    .primitiveFont(.footnote)
                    .foregroundStyle(palette.color(token: saveState == .failed ? "tone.bad" : "ink.brand"))
            }
            Spacer(minLength: 12)
            Button(action: onSave) {
                Group {
                    if saveState == .saving {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(saveLabel)
                    }
                }
                .primitiveFont(.footnote, weight: .semibold)
                .foregroundStyle(palette.color(token: "surface.screen"))
                .padding(.horizontal, 14)
                .frame(height: 32)
                .background(palette.color(token: "ink.primary"), in: .capsule)
            }
            .buttonStyle(.plain)
            .disabled(saveState == .saving || saveState == .saved)
            .opacity(saveState == .saved ? 0.5 : 1)
        }
    }

    // MARK: Derived

    private var state: String {
        switch run.phase {
        case .ready: "done"
        case .idle: "stopped"
        case .loading, .updating: "running"
        }
    }

    private var saveDetail: String {
        switch saveState {
        case .idle, .saving: "Ready to save"
        case .saved: "Saved"
        case .failed: "Could not save"
        }
    }

    private var saveLabel: String {
        switch saveState {
        case .idle, .saving: "Save"
        case .saved: "Saved"
        case .failed: "Try again"
        }
    }

    private static func clock(_ seconds: TimeInterval) -> String {
        let whole = max(0, Int(seconds))
        return String(format: "%d:%02d", whole / 60, whole % 60)
    }
}

/// One pipeline step: a spinner while it works or a check when done, its name, its search counts or
/// current detail, and its cost.
private struct StepRow: View {
    let activity: DSLActivity
    let cost: Double?

    @Environment(\.primitivePalette) private var palette

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Group {
                if activity.status == .completed {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.body)
                        .foregroundStyle(palette.color(token: "ink.brand"))
                } else {
                    ProgressView().controlSize(.small)
                }
            }
            .frame(width: 20, height: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(activity.title)
                    .primitiveFont(.body, weight: .medium)
                if let line = activity.searchSummary ?? (activity.status == .completed ? nil : activity.detail) {
                    Text(line)
                        .primitiveFont(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 12)
            if let cost {
                Text(cost, format: .currency(code: "USD").precision(.fractionLength(3)))
                    .primitiveFont(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
    }
}
