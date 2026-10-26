import Foundation

/// Stable, typed stand-ins for every `@path` a generation reads, so a tree renders before
/// the app has a data layer. The web preview's `dummy()` does the same from path names;
/// this one also uses each need's `PropType`.
///
/// Repeat item fields (`@.company.name` in a Repeat over `@earnings.week`) land on every
/// item of that list, nested Repeats included.
public enum SampleData {
    /// Items per sample list.
    public static let listCount = 4

    public static func document(for needs: [DataNeed]) -> PValue {
        let repeats = Dictionary(
            needs.filter { $0.prop == "items" }.map { ($0.node, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        // Item fields first: they create the lists as lists of objects, which the list
        // needs themselves then leave alone.
        let ordered = needs.filter { $0.itemOf != nil } + needs.filter { $0.itemOf == nil }
        var root = PValue.object([:])
        for need in ordered {
            guard let segments = path(of: need, repeats: repeats, depth: 0) else { continue }
            root = set(root, segments[...], index: 0) { index in
                sample(need.type, key: segments.lastKey ?? need.path, index: index)
            }
        }
        return root
    }

    fileprivate enum Segment: Equatable {
        case key(String)
        case each
    }

    private static func path(of need: DataNeed, repeats: [String: DataNeed], depth: Int) -> [Segment]? {
        // `[i]` paths only appear in hand-written data; nothing to generate for them.
        guard depth < 8, !need.path.contains("[") else { return nil }
        let keys = need.path.split(separator: ".").map { Segment.key(String($0)) }
        guard let repeatID = need.itemOf else { return keys }
        guard let list = repeats[repeatID],
              let prefix = path(of: list, repeats: repeats, depth: depth + 1) else { return nil }
        return prefix + [.each] + keys
    }

    /// Writes `make(itemIndex)` at `path`, creating objects and lists on the way. An
    /// existing value at the end is kept, so a list filled with item fields stays.
    private static func set(
        _ value: PValue,
        _ path: ArraySlice<Segment>,
        index: Int,
        make: (Int) -> PValue
    ) -> PValue {
        guard let head = path.first else { return value == .null ? make(index) : value }
        let rest = path.dropFirst()
        switch head {
        case let .key(key):
            var object = value.objectValue ?? [:]
            object[key] = set(object[key] ?? .null, rest, index: index, make: make)
            return .object(object)
        case .each:
            let items = value.listValue ?? Array(repeating: .object([:]), count: listCount)
            return .list(items.enumerated().map { set($1, rest, index: $0, make: make) })
        }
    }

    private static func sample(_ type: PropType, key: String, index: Int) -> PValue {
        let seed = stableHash("\(key)#\(index)")
        switch type {
        case .text, .status:
            return .string(text(for: key.lowercased(), seed: seed, index: index))
        case let .number(format):
            return .number(number(format: format, key: key.lowercased(), seed: seed))
        case .boolean:
            return .bool(index == 0)
        case .date:
            return .string("2026-10-\(12 + index % 7)")
        case let .enum(values):
            return values.first.map(PValue.string) ?? .null
        case .color:
            return .string(tints[seed % tints.count])
        case .icon:
            return .string("star")
        case .image:
            // Not a URL: the renderer draws its flat placeholder colour.
            return .string(tints[seed % tints.count])
        case .action:
            return .string("open")
        case let .object(fields):
            return .object(Dictionary(
                fields.map { ($0.name, sample($0.type, key: $0.name, index: index)) },
                uniquingKeysWith: { first, _ in first }
            ))
        case let .list(of, min, _):
            let count = Swift.max(min ?? 0, listCount)
            return .list((0 ..< count).map { sample(of, key: key, index: $0) })
        case .token, .node, .nodes:
            return .null
        }
    }

    private static let words = [
        "Apple",
        "Nvidia",
        "Morning run",
        "Protein",
        "Groceries",
        "Blue Bottle",
        "Sleep",
        "Rent",
    ]
    private static let tickers = ["AAPL", "NVDA", "MSFT", "TSLA"]
    private static let tints = ["blue", "green", "orange", "indigo", "pink", "teal", "purple", "red"]

    private static func text(for key: String, seed: Int, index: Int) -> String {
        if key.contains("ticker") || key.contains("symbol") { return tickers[index % tickers.count] }
        if key
            .contains("time")
        { return "\(7 + seed % 10):\(seed % 2 == 0 ? "00" : "30") \(seed % 3 == 0 ? "PM" : "AM")"
        }
        if key.hasSuffix("day") || key.contains("date") { return ["Mon 12", "Tue 13", "Wed 14", "Thu 15"][index % 4] }
        if key.contains("tone") || key.contains("status") { return ["good", "warn", "bad", "neutral"][seed % 4] }
        if key.contains("label") { return ["Jun", "Jul", "Aug", "Sep"][index % 4] }
        return words[(seed + index) % words.count]
    }

    private static func number(format: String, key: String, seed: Int) -> Double {
        switch format {
        case "percent": Double(10 + seed % 81)
        case "integer", "count": Double(1 + seed % 40)
        case "duration": Double(600 + seed % 6000)
        default: (Double(100 + seed % 9000) / (key.contains("eps") ? 100 : 10)).rounded(toPlaces: 2)
        }
    }

    /// FNV-1a, so the same path gives the same sample on every run and device.
    private static func stableHash(_ text: String) -> Int {
        var hash: UInt32 = 2_166_136_261
        for byte in text.utf8 {
            hash = (hash ^ UInt32(byte)) &* 16_777_619
        }
        return Int(hash)
    }
}

private extension [SampleData.Segment] {
    var lastKey: String? {
        for segment in reversed() {
            if case let .key(key) = segment { return key }
        }
        return nil
    }
}

private extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let scale = pow(10, Double(places))
        return (self * scale).rounded() / scale
    }
}
