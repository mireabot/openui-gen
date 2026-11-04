import NukeUI
import SwiftUI

/// A club from the leading edge: crest, name (then a green dollar on a loan), the player's dates and
/// location, then a stats row only when there are stats. Parts with no data take no space. The card fills
/// the height it is offered, so a row of cards can share one height with the stats on the bottom edge.
struct ClubCardView: View {
    let club: ClubStop
    @Environment(\.primitivePalette) private var palette

    private static let padding: CGFloat = 20

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ClubCrest(club: club)
            nameLine
                .font(.system(size: 17, weight: .semibold))
                .lineSpacing(2)
                .foregroundStyle(palette.ink("primary"))
                .padding(.top, 16)
            Text(club.dates)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(palette.ink("primary"))
                .padding(.top, 4)
            if let location = club.location, !location.isEmpty {
                Text(location)
                    .font(.system(size: 13))
                    .foregroundStyle(palette.ink("secondary"))
                    .padding(.top, 4)
            }
            if !club.shownStats.isEmpty {
                Spacer(minLength: 16)
                statsRow
            }
        }
        .padding(Self.padding)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            palette.color(token: "surface.card"),
            in: .rect(cornerRadius: PrimitiveMetrics.containerRadius, style: .continuous)
        )
    }

    /// The icon sits inside the text after a no-break space, so it stays on the line of the name's last word.
    private var nameLine: Text {
        guard club.loan else { return Text(club.name) }
        let dollar = Text(Image(systemName: "dollarsign"))
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(palette.tone("good"))
        return Text("\(club.name)\u{00A0}\(dollar)")
    }

    private var statsRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            Rectangle()
                .fill(palette.color(token: "outline.subtle"))
                .frame(height: 1)
            HStack(alignment: .top, spacing: 16) {
                ForEach(club.shownStats, id: \.label) { stat in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(stat.value)
                            .font(.system(size: 15, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(palette.ink("primary"))
                        Text(stat.label)
                            .font(.system(size: 13))
                            .foregroundStyle(palette.ink("secondary"))
                    }
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

/// The whole crest fits the frame, with no fill and no clipping. The monogram shows while it loads,
/// when it fails, and when the club has no crest.
private struct ClubCrest: View {
    let club: ClubStop
    @Environment(\.primitivePalette) private var palette
    @Environment(\.primitiveMediaBaseURL) private var base

    private static let size: CGFloat = 56

    var body: some View {
        Group {
            if let url = PrimitiveImages.url(club.logo, base: base) {
                LazyImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.15))) { state in
                    if let image = state.image {
                        image.resizable().scaledToFit()
                    } else {
                        monogram
                    }
                }
                .pipeline(PrimitiveImages.pipeline)
            } else {
                monogram
            }
        }
        .frame(width: Self.size, height: Self.size)
    }

    private var monogram: some View {
        Text(club.name.prefix(1))
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(palette.ink("inverse"))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(palette.value(club.color) ?? palette.color(token: "surface.filled"), in: .circle)
    }
}
