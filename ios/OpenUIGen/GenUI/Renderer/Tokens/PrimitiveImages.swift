import Foundation
import Nuke
import SwiftUI

/// Remote images for Image and Avatar, loaded with Nuke.
enum PrimitiveImages {
    /// One pipeline for every primitive: memory cache plus an on-disk data cache, so logos and
    /// photos survive relaunches and a long list doesn't refetch what it already has.
    static let pipeline = ImagePipeline(configuration: .withDataCache(name: "GenUIPrimitives.images"))

    /// An `https`/`http` URL as given, or a server path (`/media/logos/<id>`) resolved against the
    /// server the tree came from. Anything else (a colour placeholder) is no image.
    static func url(_ source: String?, base: URL?) -> URL? {
        guard let source, !source.isEmpty else { return nil }
        if source.hasPrefix("/") {
            guard let base else { return nil }
            return URL(
                string: String(source.dropFirst()),
                relativeTo: base.hasDirectoryPath ? base : base.appending(path: "")
            )?.absoluteURL
        }
        guard let url = URL(string: source), url.scheme == "https" || url.scheme == "http" else { return nil }
        return url
    }
}

extension EnvironmentValues {
    /// The server a tree streamed from, so data that carries server paths (club logos at
    /// `/media/logos/<CODE>`) resolves. Nil leaves those images out (the monogram stays).
    @Entry var primitiveMediaBaseURL: URL?
}

public extension View {
    /// Resolves image paths in the data (`/media/logos/<id>`) against `url`, normally the server
    /// the tree streamed from.
    func primitiveMediaBaseURL(_ url: URL?) -> some View {
        environment(\.primitiveMediaBaseURL, url)
    }
}
