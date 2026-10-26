import Foundation

/// Finds SSE event boundaries in raw bytes. `URLSession.AsyncBytes.lines` drops
/// empty lines, which are the delimiters between events, so it cannot frame SSE.
struct ScreenEventFramer {
    private var pending = Data()

    mutating func accept(_ byte: UInt8) throws -> (name: String, data: Data)? {
        pending.append(byte)
        guard pending.count <= 1_000_000 else { throw URLError(.dataLengthExceedsMaximum) }
        guard pending.suffix(2).elementsEqual([10, 10])
            || pending.suffix(4).elementsEqual([13, 10, 13, 10])
        else { return nil }

        defer { pending.removeAll(keepingCapacity: true) }
        guard let text = String(data: pending, encoding: .utf8) else {
            throw URLError(.cannotParseResponse)
        }
        var name = ""
        var dataLines: [String] = []
        for rawLine in text.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.hasPrefix("event:") {
                name = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
            }
        }
        guard !name.isEmpty else { return nil }
        return (name, Data(dataLines.joined(separator: "\n").utf8))
    }
}
