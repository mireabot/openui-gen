import SwiftUI

@main
struct OpenUIGenApp: App {
    private let baseURL = APIConfiguration.baseURL
    @State private var ask: AskModel
    @State private var health: HealthModel

    init() {
        let client = APIClient(baseURL: baseURL)
        _ask = State(initialValue: AskModel(service: OpenUIStreamService(baseURL: baseURL)))
        _health = State(initialValue: HealthModel(service: HealthService(client: client)))
    }

    var body: some Scene {
        WindowGroup {
            AskView(model: ask, health: health, baseURL: baseURL)
        }
    }
}
