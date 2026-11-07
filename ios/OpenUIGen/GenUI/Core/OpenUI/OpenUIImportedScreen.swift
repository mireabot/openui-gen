import Foundation

/// A generated screen pasted as JSON, shown with no model call: a saved generation, an export, or
/// `{prompt, program, snapshot}` from the runs route. The iOS twin of `parseImportedScreen` in
/// preview/lib/imported-screen.ts.
struct OpenUIImportedScreen: Equatable {
    let program: String
    /// Answers the program's own `Query`, so the compiler finds its data here.
    let dataset: OpenUIDataset
    /// The component templates a saved generation carries; nil draws with the bundled set.
    let templates: [OpenUITemplate]?

    enum Failure: LocalizedError, Equatable {
        case invalidJSON, missingProgram, missingSnapshot, missingQuery

        var errorDescription: String? {
            switch self {
            case .invalidJSON: "This isn't valid JSON."
            case .missingProgram: "This schema has no program."
            case .missingSnapshot: "This schema has no snapshot."
            case .missingQuery: "This program doesn't read a sports dataset."
            }
        }
    }

    init(json: String) throws {
        guard let root = try? JSONDecoder().decode(PValue.self, from: Data(json.utf8)) else {
            throw Failure.invalidJSON
        }
        guard let program = root["program"]?.stringValue,
              !program.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { throw Failure.missingProgram }

        // A saved generation or an export carries `snapshot`; `dataset` or a bare `result` also
        // work for a hand-written schema.
        let result = root["snapshot"]?["result"] ?? root["dataset"]?["result"] ?? root["result"]
        guard let result, result.objectValue != nil else { throw Failure.missingSnapshot }

        // The compiler matches a dataset by its args, so they come from the program. The run in
        // the snapshot could differ, and then the program would find no data.
        guard let run = Self.run(in: program) else { throw Failure.missingQuery }

        self.program = program
        dataset = OpenUIDataset(args: .object(["run": .string(run)]), result: result)
        let saved = (try? JSONEncoder().encode(root["templates"]))
            .flatMap { try? JSONDecoder().decode([OpenUITemplate].self, from: $0) }
        templates = saved?.isEmpty == false ? saved : nil
    }

    private static func run(in program: String) -> String? {
        let query = /Query\(\s*"sports_dataset"\s*,\s*\{\s*run:\s*"([^"]+)"/
        return program.firstMatch(of: query).map { String($0.1) }
    }
}
