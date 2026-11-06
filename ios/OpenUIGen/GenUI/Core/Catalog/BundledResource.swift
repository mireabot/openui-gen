import Foundation

/// Reads the JSON files bundled with the app (`design_system.json`, `primitives.json`).
enum BundledResource {
    static func url(named name: String) -> URL? {
        Bundle.main.url(forResource: name, withExtension: "json")
    }

    static func data(named name: String) throws -> Data {
        guard let url = url(named: name) else { throw CocoaError(.fileNoSuchFile) }
        return try Data(contentsOf: url)
    }
}
