import Foundation

/// Resolves `@path` references against the app's data document.
///
/// Paths are dotted keys with `[i]` indices: `open.name`, `buckets[1].label`. A path that
/// starts with `.` (`@.field` in the DSL) reads the current Repeat item. Each Repeat a
/// renderer descends into adds a frame with `entering(_:at:)`, so nested Repeats work and an
/// inner Repeat may itself iterate an item field (`Repeat(@.people, ...)`).
///
///     let scope = DataScope(data: document.data)
///     let day = scope.entering("days", at: 2)
///     day.resolve(".date")    // the third day's date
public struct DataScope: Sendable, Equatable {
    /// One Repeat level: the list path as written, the item index, and the item itself.
    public struct Frame: Sendable, Equatable {
        public let path: String
        public let index: Int
        public let item: PValue?
    }

    public let data: PValue
    /// Outermost first; the last frame is the current item.
    public let frames: [Frame]

    public init(data: PValue, frames: [Frame] = []) {
        self.data = data
        self.frames = frames
    }

    /// The current Repeat item, or `nil` outside a Repeat.
    public var item: PValue? {
        frames.last?.item
    }

    /// A scope for item `index` of the list at `path` (resolved in this scope).
    public func entering(_ path: String, at index: Int) -> DataScope {
        let item = resolve(path)?[index]
        return DataScope(data: data, frames: frames + [Frame(path: path, index: index, item: item)])
    }

    /// The number of items in the list at `path`; `0` when it is missing or not a list.
    public func count(of path: String) -> Int {
        resolve(path)?.listValue?.count ?? 0
    }

    /// Resolve a relative binding to its absolute document path before editing it.
    public func absolutePath(_ path: String) -> String {
        guard path.hasPrefix(".") else { return path }
        var prefix = ""
        for frame in frames {
            let absolute = frame.path.hasPrefix(".") ? prefix + frame.path : frame.path
            prefix = "\(absolute)[\(frame.index)]"
        }
        return prefix + (path == "." ? "" : path)
    }

    /// A local replacement, preserving Repeat frames against the new document.
    public func overriding(_ path: String, with replacement: PValue) -> DataScope {
        guard let steps = Self.steps(absolutePath(path)) else { return self }
        func replace(_ value: PValue, _ remaining: ArraySlice<Step>) -> PValue {
            guard let first = remaining.first else { return replacement }
            switch (first, value) {
            case let (.key(key), .object(object)):
                var updated = object
                updated[key] = replace(object[key] ?? .null, remaining.dropFirst())
                return .object(updated)
            case let (.index(index), .list(list)) where list.indices.contains(index):
                var updated = list
                updated[index] = replace(list[index], remaining.dropFirst())
                return .list(updated)
            default: return value
            }
        }
        var updated = DataScope(data: replace(data, steps[...]))
        for frame in frames {
            updated = updated.entering(frame.path, at: frame.index)
        }
        return updated
    }

    /// The value at `path`, or `nil` when any step is missing.
    public func resolve(_ path: String) -> PValue? {
        guard var steps = Self.steps(path) else { return nil }
        var current: PValue? = if path.hasPrefix(".") {
            item
        } else {
            data
        }
        while let step = steps.first, let value = current {
            steps.removeFirst()
            switch step {
            case let .key(key): current = value[key]
            case let .index(index): current = value[index]
            }
        }
        return current
    }

    /// `.data(path)` resolved; lists and objects resolved deeply (missing members become
    /// `.null`); any other value unchanged.
    public func resolve(_ value: PValue) -> PValue? {
        switch value {
        case let .data(path):
            resolve(path)
        case let .list(values):
            .list(values.map { resolve($0) ?? .null })
        case let .object(values):
            .object(values.mapValues { resolve($0) ?? .null })
        default:
            value
        }
    }

    // MARK: Paths

    enum Step: Equatable {
        case key(String)
        case index(Int)
    }

    /// `buckets[1].label` → key, index, key; `nil` for a malformed index.
    static func steps(_ path: String) -> [Step]? {
        var steps: [Step] = []
        var key = ""
        var chars = path.makeIterator()
        func flush() {
            if !key.isEmpty { steps.append(.key(key)) }
            key = ""
        }
        while let character = chars.next() {
            switch character {
            case ".":
                flush()
            case "[":
                flush()
                var digits = ""
                while let digit = chars.next(), digit != "]" { digits.append(digit) }
                guard let index = Int(digits) else { return nil }
                steps.append(.index(index))
            default:
                key.append(character)
            }
        }
        flush()
        return steps
    }
}
