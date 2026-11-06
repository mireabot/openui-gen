import Foundation

/// A platform-neutral sRGB colour, components in `0...1`. The renderer maps it to `Color`.
public struct DesignColor: Sendable, Equatable, Hashable {
    public let red: Double
    public let green: Double
    public let blue: Double
    public let alpha: Double

    public init(red: Double, green: Double, blue: Double, alpha: Double = 1) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
    }

    /// Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` and `rgb(...)` / `rgba(...)` with
    /// 0-255 channels and a 0-1 alpha. design_system.json uses only hex today.
    public init?(css text: String) {
        let text = text.trimmingCharacters(in: .whitespaces).lowercased()
        if text.hasPrefix("#") {
            self.init(hex: String(text.dropFirst()))
        } else if text.hasPrefix("rgb"), let open = text.firstIndex(of: "("), text.hasSuffix(")") {
            let inner = text[text.index(after: open) ..< text.index(before: text.endIndex)]
            let parts = inner.split(whereSeparator: { $0 == "," || $0 == " " || $0 == "/" }).compactMap { Double($0) }
            guard parts.count == 3 || parts.count == 4 else { return nil }
            self.init(
                red: parts[0] / 255,
                green: parts[1] / 255,
                blue: parts[2] / 255,
                alpha: parts.count == 4 ? parts[3] : 1
            )
        } else {
            return nil
        }
    }

    private init?(hex: String) {
        guard hex.allSatisfy(\.isHexDigit) else { return nil }
        let digits: [Character] = switch hex.count {
        case 3, 4: hex.flatMap { [$0, $0] }
        case 6, 8: Array(hex)
        default: []
        }
        guard !digits.isEmpty else { return nil }
        let bytes = stride(from: 0, to: digits.count, by: 2)
            .compactMap { UInt8(String(digits[$0 ... $0 + 1]), radix: 16) }
        self.init(
            red: Double(bytes[0]) / 255,
            green: Double(bytes[1]) / 255,
            blue: Double(bytes[2]) / 255,
            alpha: bytes.count == 4 ? Double(bytes[3]) / 255 : 1
        )
    }
}
