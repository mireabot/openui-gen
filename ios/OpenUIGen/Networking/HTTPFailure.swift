import Foundation

/// Why a request to the backend did not produce a successful response.
///
/// Every request goes through `APIClient`, so transport and status handling is written
/// once; each service maps it onto what its screen needs to show.
enum HTTPFailure: Error {
    /// The request never got an answer: offline, wrong host, timeout, TLS.
    case transport(any Error)
    /// The task was cancelled. Kept apart from `transport` because the caller asked
    /// for it and there is nothing to show.
    case cancelled
    /// The server answered with a non-2xx status. The body is kept because the
    /// backend explains its 4xx/5xx responses in JSON.
    case status(Int, body: Data)
    /// The server answered 2xx with a body that is not the expected type.
    case decoding(any Error)
}
