import Foundation

/// Where the backend lives.
///
/// The value comes from the build: `API_BASE_URL` in `Secrets.xcconfig`, surfaced as
/// `APIBaseURL` in Info.plist.
enum APIConfiguration {
    /// Used when Info.plist carries no usable `APIBaseURL`, which is what a fresh clone
    /// without `Secrets.xcconfig` gets. Matches the backend's default port.
    static let fallbackURL = URL(string: "http://127.0.0.1:8080")!

    static var baseURL: URL {
        bundledURL() ?? fallbackURL
    }

    /// Accepts an absolute `http` or `https` URL with a host, after trimming spaces and
    /// a trailing slash. An unset build setting expands to an empty string and gives nil.
    static func validatedURL(from text: String) -> URL? {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasSuffix("/") {
            trimmed.removeLast()
        }
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = url.host(), !host.isEmpty
        else { return nil }
        return url
    }

    static func bundledURL(in bundle: Bundle = .main) -> URL? {
        (bundle.object(forInfoDictionaryKey: "APIBaseURL") as? String).flatMap(validatedURL(from:))
    }
}
