import SwiftUI

extension EnvironmentValues {
    /// Brand colours in the screen's appearance.
    @Entry var primitivePalette = PrimitivePalette.standard
    /// Host actions through a stable immutable reference. Inert until a host wires one in.
    @Entry var primitiveContext = PrimitiveActionDispatcher.inert
    /// How far full-bleed children (rails, bleeding dividers, chrome) reach past their
    /// container: the 24 screen inset at the top level, a card's padding inside a card.
    @Entry var primitiveBleed: CGFloat = PrimitiveMetrics.screenInset
    /// The axis of the enclosing Stack, so a Spacer knows which way to take space.
    @Entry var primitiveStackAxis: Axis = .vertical
    /// Inside a scrimmed ZStack layer: text and icons switch to white.
    @Entry var primitiveOnMedia = false
    /// Static rendering (snapshots, `ImageRenderer`): no scroll views, which
    /// `ImageRenderer` cannot draw, and no entrance animations.
    @Entry var primitiveIsStatic = false
}

/// Where a tappable primitive sends its action string. An immutable reference gives the environment
/// stable identity instead of a closure value. Set `primitiveContext` to wire actions to a host.
final class PrimitiveActionDispatcher: Sendable {
    let perform: @MainActor @Sendable (_ action: String) -> Void

    init(perform: @escaping @MainActor @Sendable (_ action: String) -> Void) {
        self.perform = perform
    }

    static let inert = PrimitiveActionDispatcher { _ in }
}
