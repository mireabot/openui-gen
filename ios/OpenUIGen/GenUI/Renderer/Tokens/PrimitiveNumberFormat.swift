import Foundation

/// How `Number(@value, format, …)` prints a value. The model never pre-formats; this does,
/// matching the web renderer's `Intl.NumberFormat` options.
struct PrimitiveNumberFormat: Equatable {
    enum Kind: String, CaseIterable {
        case integer, decimal, percent, currency, duration, distance, energy, mass, count
    }

    var kind: Kind
    var compact = false
    var signed = false
    /// Replaces the format's default unit (` min`, ` km`, ` kcal`, ` g`).
    var suffix: String?
    /// The web renderer formats money in USD; the language has no currency argument yet.
    var currencyCode = "USD"

    init(kind: Kind, compact: Bool = false, signed: Bool = false, suffix: String? = nil) {
        self.kind = kind
        self.compact = compact
        self.signed = signed
        self.suffix = suffix
    }

    /// An unknown format name formats as a decimal.
    init(format: String?, compact: Bool, signed: Bool, suffix: String?) {
        self.init(
            kind: format.flatMap(Kind.init(rawValue:)) ?? .decimal,
            compact: compact,
            signed: signed,
            suffix: suffix
        )
    }

    /// `percent` takes 0–100 (`42` → `42%`), as program percent values do.
    func string(_ value: Double, locale: Locale = .current) -> String {
        guard value.isFinite else { return "—" }
        let magnitude = abs(value)
        return sign(value) + figure(magnitude, locale: locale) + unit
    }

    /// `−` for negatives always; `+` for positives only when signed.
    private func sign(_ value: Double) -> String {
        if value < 0 { return "−" }
        return signed && value > 0 ? "+" : ""
    }

    private func figure(_ value: Double, locale: Locale) -> String {
        let whole = value == value.rounded()
        switch kind {
        case .currency:
            let style = FloatingPointFormatStyle<Double>.Currency(code: currencyCode, locale: locale)
            return compact
                ? value.formatted(style.notation(.compactName).precision(.fractionLength(0 ... 1)))
                : value.formatted(style.precision(.fractionLength(whole ? 0 : 2)))
        case .percent:
            return (value / 100).formatted(.percent.precision(.fractionLength(0 ... 2)).locale(locale))
        case .integer:
            return compact ? compactFigure(value, locale: locale) : value
                .formatted(.number.precision(.fractionLength(0)).locale(locale))
        case .count:
            return compactFigure(value, locale: locale)
        case .decimal, .duration, .distance, .energy, .mass:
            return compact ? compactFigure(value, locale: locale) : value
                .formatted(.number.precision(.fractionLength(0 ... 2)).locale(locale))
        }
    }

    private func compactFigure(_ value: Double, locale: Locale) -> String {
        value.formatted(.number.notation(.compactName).precision(.fractionLength(0 ... 1)).locale(locale))
    }

    private var unit: String {
        if let suffix { return suffix }
        return switch kind {
        case .duration: " min"
        case .distance: " km"
        case .energy: " kcal"
        case .mass: " g"
        default: ""
        }
    }
}
