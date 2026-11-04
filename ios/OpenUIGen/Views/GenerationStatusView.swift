import SwiftUI

/// The run at a glance: its timer, the step it is on and what it has cost, with each step's cost one
/// tap away. Steps stay open until the first part is on screen. A finished screen can be saved.
struct GenerationStatusView: View {
    let session: OpenUISession
    let saveState: AskModel.SaveState
    let onSave: () -> Void

    @State private var expanded: Bool?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                expanded = !showsSteps
            } label: {
                summary
            }
            .buttonStyle(.plain)
            if showsSteps {
                ForEach(session.activities, id: \.stage) { activity in
                    StepRow(activity: activity, cost: session.stageCosts[activity.stage])
                }
            }
            if session.phase == .ready, session.document != nil {
                saveButton
            }
        }
        .padding(12)
        .background(.regularMaterial)
        .clipShape(.rect(cornerRadius: PrimitiveMetrics.controlRadius))
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var summary: some View {
        HStack(spacing: 8) {
            if isRunning {
                ProgressView()
            }
            Text(currentStep)
                .font(.subheadline.weight(.medium))
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(session.totalCost, format: .currency(code: "USD").precision(.fractionLength(3)))
                .font(.footnote)
                .foregroundStyle(.secondary)
            TimelineView(.periodic(from: session.startedAt, by: 1)) { context in
                Text(Self.clock((session.finishedAt ?? context.date).timeIntervalSince(session.startedAt)))
            }
            .font(.footnote.weight(.medium))
            Image(systemName: showsSteps ? "chevron.up" : "chevron.down")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .monospacedDigit()
        .contentShape(.rect)
    }

    @ViewBuilder
    private var saveButton: some View {
        Button(action: onSave) {
            switch saveState {
            case .idle: Label("Save result", systemImage: "square.and.arrow.down")
            case .saving: ProgressView()
            case .saved: Label("Saved", systemImage: "checkmark")
            case .failed: Label("Could not save. Try again", systemImage: "arrow.clockwise")
            }
        }
        .buttonStyle(.bordered)
        .disabled(saveState == .saving || saveState == .saved)
    }

    private var isRunning: Bool {
        session.phase == .loading || session.phase == .updating
    }

    private var showsSteps: Bool {
        expanded ?? !session.hasContent
    }

    private var currentStep: String {
        switch session.phase {
        case .ready: "Done"
        case .idle: "Stopped"
        case .loading, .updating: session.activities.last?.title ?? "Starting"
        }
    }

    private static func clock(_ seconds: TimeInterval) -> String {
        let whole = max(0, Int(seconds))
        return String(format: "%d:%02d", whole / 60, whole % 60)
    }
}

/// One pipeline step: done or working, its search counts or current detail, and its cost.
private struct StepRow: View {
    let activity: DSLActivity
    let cost: Double?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if activity.status == .completed {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            } else {
                ProgressView()
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(activity.title)
                    .font(.footnote.weight(.medium))
                if let line = activity.searchSummary ?? (activity.status == .completed ? nil : activity.detail) {
                    Text(line)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            if let cost {
                Text(cost, format: .currency(code: "USD").precision(.fractionLength(3)))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
    }
}
