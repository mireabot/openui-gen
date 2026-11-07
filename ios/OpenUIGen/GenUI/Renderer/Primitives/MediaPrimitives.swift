import NukeUI
import SwiftUI

/// `Icon(name, size?, ink?)`: an SF Symbol in a square frame of the icon size.
struct IconPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveOnMedia) private var onMedia

    var body: some View {
        SymbolGlyph(name: props.string("name"), size: props.cgFloat("size") ?? 24)
            .foregroundStyle(InkResolver(palette: palette, onMedia: onMedia)(props.string("ink")))
    }
}

/// An SF Symbol sized to the ground-rule icon size. An unknown name draws a circle.
struct SymbolGlyph: View {
    let name: String?
    let size: CGFloat

    var body: some View {
        Image(systemName: name ?? "circle")
            .font(.system(size: size * 0.85, weight: .regular))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// A photo from a URL, or one flat colour: a `#hex` or iOS colour name in the data tints
/// it; anything else is the filled surface. Images fit inside the reserved frame
/// without cropping or changing its dimensions.
struct MediaFill: View {
    let source: String?
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveMediaBaseURL) private var base

    var body: some View {
        if let url = PrimitiveImages.url(source, base: base) {
            LazyImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.15))) { state in
                if let image = state.image {
                    image.resizable().scaledToFit()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    placeholder
                }
            }
            .pipeline(PrimitiveImages.pipeline)
        } else {
            placeholder
        }
    }

    private var placeholder: Color {
        palette.value(source) ?? palette.color(token: "surface.filled")
    }
}

/// `Image(@src, aspect, rounded?, width?, ring?)`.
struct ImagePrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let width = props.cgFloat("width")
        let rounded = props.bool("rounded") ?? true
        let radius = rounded ?
            ((width ?? .infinity) < 56 ? PrimitiveMetrics.smallControlRadius : PrimitiveMetrics.containerRadius) : 0
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        Color.clear
            .aspectRatio(Self.ratio(props.string("aspect")), contentMode: .fit)
            .frame(width: width)
            .frame(maxWidth: width == nil ? .infinity : nil)
            .overlay { MediaFill(source: props.string("src")) }
            .clipShape(shape)
            .background {
                if props.flag("ring") {
                    RoundedRectangle(cornerRadius: radius + 4, style: .continuous)
                        .fill(palette.color(token: "surface.screen"))
                        .padding(-4)
                }
            }
            .accessibilityHidden(true)
    }

    /// `"2-3"` → 2/3; unknown → square.
    static func ratio(_ aspect: String?) -> CGFloat {
        let parts = (aspect ?? "1-1").split(separator: "-").compactMap { Double($0) }
        guard parts.count == 2, parts[1] > 0 else { return 1 }
        return parts[0] / parts[1]
    }
}

/// `Avatar(name, size, @image?, tint?, shape?, @color?, kind?)`: a crest or a player's photo, or the
/// name's initial on a tint.
struct AvatarPrimitive: View {
    let props: PrimitiveProps
    @State private var failedImage: URL?
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveMediaBaseURL) private var base

    /// A photo sits on its club's colour. With no club known it sits on a neutral fill, not a colour that reads as a
    /// club's.
    private func photoDisc(_ tint: Color?) -> Color {
        tint ?? palette.color(token: "surface.filled")
    }

    var body: some View {
        // A player with no photo draws nothing: a monogram for a person is noise. A club keeps its monogram.
        let image = PrimitiveImages.url(props.string("image"), base: base)
        if props.string("kind") != "club", image == nil || failedImage == image {
            EmptyView()
        } else {
            avatar
        }
    }

    @ViewBuilder
    private var avatar: some View {
        let size = props.cgFloat("size") ?? 40
        let radius = props.string("shape") == "rounded" ? PrimitiveMetrics.smallControlRadius : PrimitiveMetrics.pill
        let name = props.string("name") ?? ""
        let monogram = palette.look("Avatar", "monogram")
        // A club colour from the data wins over the tint token; "clear" leaves the theme's disc for
        // the monogram, because a crest has nothing behind it.
        let tint = props.string("color").flatMap { $0.hasPrefix("#") ? palette.value($0) : nil } ?? palette
            .value(props.string("tint"))
        let disc = tint.map(AnyShapeStyle.init) ?? palette.fillStyle(monogram.fill) ?? AnyShapeStyle(Color.gray)
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let face = ZStack {
            Rectangle().fill(disc)
            Text(name.prefix(1).uppercased())
                .font(.system(size: size >= 40 ? 16 : 12, weight: .medium))
                .foregroundStyle(palette.color(monogram.ink) ?? .white)
        }
        .clipShape(shape)
        Group {
            if let url = PrimitiveImages.url(props.string("image"), base: base) {
                // The whole image fits the frame with no inset, so a player's head is never cut off. A
                // photo sits on the disc colour, masked by the shape; a crest has nothing behind it and
                // no mask. The monogram shows until the image loads, and on failure.
                LazyImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.15))) { state in
                    if let image = state.image {
                        if props.string("kind") != "club" {
                            image.resizable().scaledToFit()
                                .frame(width: size, height: size)
                                .background(photoDisc(tint))
                                .clipShape(shape)
                        } else {
                            image.resizable().scaledToFit()
                                .frame(width: size, height: size)
                        }
                    } else {
                        face
                    }
                }
                .pipeline(PrimitiveImages.pipeline)
                .onCompletion { result in
                    if case .failure = result { failedImage = url }
                }
            } else {
                face
            }
        }
        .frame(width: size, height: size)
        .overlay(alignment: .bottomTrailing) {
            if let mark = props.string("mark") { markDisc(mark, avatar: size) }
        }
    }

    /// A filled disc over the bottom-right corner, its glyph in the tone's colour, ringed in the card
    /// surface: the band-aid on an injured player.
    private func markDisc(_ symbol: String, avatar size: CGFloat) -> some View {
        let disc: CGFloat = size >= 56 ? 20 : 16
        return SymbolGlyph(name: symbol, size: 12)
            .foregroundStyle(palette.tone(props.string("markTone")))
            .frame(width: disc, height: disc)
            .background(palette.color(token: "surface.filled"), in: .circle)
            .background(palette.color(token: "surface.card"), in: Circle().inset(by: -2))
            .offset(x: 2, y: 2)
    }
}

/// `IconTile(icon, size, style?)`: a 24 glyph on a radius-12 tile.
struct IconTilePrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let size = props.cgFloat("size") ?? 40
        SymbolGlyph(name: props.string("icon"), size: 24)
            .frame(width: size, height: size)
            .primitiveSurface(
                palette.look("IconTile", "styles.\(props.string("style") ?? "soft")"),
                radius: PrimitiveMetrics.controlRadius
            )
    }
}

/// `AvatarStack(@people, size, max?)`: up to `max` (3) overlapping discs ringed in the
/// screen colour. A person object's `tint` colours its disc.
struct AvatarStackPrimitive: View {
    let props: PrimitiveProps
    @Environment(\.primitivePalette) private var palette

    var body: some View {
        let size = props.cgFloat("size") ?? 20
        let people = Array(props.list("people").prefix(props.int("max") ?? 3))
        let discs = people.enumerated().map { index, person in
            Disc(
                id: person["name"]?.stringValue.map { "\($0)#\(index)" } ?? "#\(index)",
                color: fill(person, index: index),
                initials: (person.stringValue ?? person["name"]?.stringValue ?? "").prefix(2).uppercased(),
                layer: people.count - index
            )
        }
        HStack(spacing: -8) {
            ForEach(discs) { disc in
                Circle()
                    .fill(disc.color)
                    .overlay {
                        Text(disc.initials).font(.system(size: size >= 32 ? 12 : 9, weight: .semibold))
                            .foregroundStyle(palette.ink("inverse"))
                    }
                    .frame(width: size, height: size)
                    .background(Circle().fill(palette.color(token: "surface.screen")).padding(-2))
                    .zIndex(Double(disc.layer))
            }
        }
        .padding(.horizontal, people.isEmpty ? 0 : 2)
        .accessibilityElement()
    }

    /// A person's disc; the list is display-only, so position is part of its identity.
    private struct Disc: Identifiable {
        let id: String
        let color: Color
        let initials: String
        let layer: Int
    }

    private func fill(_ person: PValue, index: Int) -> Color {
        if let tint = palette.value(person["tint"]?.stringValue) { return tint }
        return palette.color(token: index == 0 ? "surface.brand" : "surface.filled")
    }
}
