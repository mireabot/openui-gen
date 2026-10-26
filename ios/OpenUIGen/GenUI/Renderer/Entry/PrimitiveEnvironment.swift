import SwiftUI

extension EnvironmentValues {
    /// One Calculation owns the input edits supplied to its generic child controls.
    @Entry var primitiveInputEdits: Binding<[String: Double]>? = nil
    /// The tree being drawn; `PrimitiveNodeView` looks its node up here.
    @Entry var primitiveTree = PrimitiveTree()
    /// The app data, entered once per Repeat level so `@.field` reads the current item.
    @Entry var primitiveScope = DataScope(data: .null)
    /// Brand colours in the screen's appearance.
    @Entry var primitivePalette = PrimitivePalette.standard
    /// Host actions through a stable immutable reference.
    @Entry var primitiveContext = PrimitiveActionDispatcher.inert
    /// How far full-bleed children (rails, bleeding dividers, chrome) reach past their
    /// container: the 24 screen inset at the top level, a card's padding inside a card.
    @Entry var primitiveBleed: CGFloat = PrimitiveMetrics.screenInset
    /// Hoisted chrome (a pinned NavBar or Dock) that its stack must not draw again.
    @Entry var primitiveHiddenIDs: Set<String> = []
    /// The axis of the enclosing Stack, so a Spacer knows which way to take space.
    @Entry var primitiveStackAxis: Axis = .vertical
    /// Inside a scrimmed ZStack layer: text and icons switch to white.
    @Entry var primitiveOnMedia = false
    /// Static rendering (snapshots, `ImageRenderer`): no scroll views, which
    /// `ImageRenderer` cannot draw, and no entrance animations.
    @Entry var primitiveIsStatic = false
    /// Named-but-missing nodes draw a pulsing placeholder. Off when a skeleton stands in
    /// for whole blocks instead.
    @Entry var primitiveShowsPending = true
}
