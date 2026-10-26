import SwiftUI

/// What the host supplies so a primitive tree can act.
///
/// Every tappable primitive names an action string from the DSL (`Button(…, "rate", …)`);
/// the renderer calls `perform` with it. The payload is the current Repeat item when the
/// primitive sits inside one, so the host knows which row was tapped. Local behaviour
/// (toggle, select, expand) never reaches the host.
public struct PrimitiveRenderContext: Sendable {
    var dispatcher: PrimitiveActionDispatcher

    public var perform: @MainActor @Sendable (_ action: String, _ payload: PValue?) -> Void {
        get { dispatcher.perform }
        set { dispatcher = PrimitiveActionDispatcher(perform: newValue) }
    }

    public init(perform: @escaping @MainActor @Sendable (_ action: String, _ payload: PValue?) -> Void = { _, _ in }) {
        dispatcher = PrimitiveActionDispatcher(perform: perform)
    }

    /// Display only: actions do nothing.
    public static let inert = PrimitiveRenderContext()
}

/// An immutable reference gives the environment stable identity instead of a closure value.
final class PrimitiveActionDispatcher: Sendable {
    let perform: @MainActor @Sendable (_ action: String, _ payload: PValue?) -> Void

    init(perform: @escaping @MainActor @Sendable (_ action: String, _ payload: PValue?) -> Void) {
        self.perform = perform
    }

    static let inert = PrimitiveActionDispatcher { _, _ in }
}
