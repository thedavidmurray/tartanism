import SwiftUI

/// App Clip entry point.
///
/// Receives the Universal Link invocation via NSUserActivity, strips
/// the `#g=` fragment, and hands it to `ContentView` which loads the
/// web app in a WKWebView.  The existing deeplink.js parses the
/// fragment and renders the shared litter — zero changes needed in the
/// web bundle.
@main
struct TartanismClip: App {
    @State private var invocationURL: URL?

    var body: some Scene {
        WindowGroup {
            ContentView(invocationURL: invocationURL)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    guard let url = activity.webpageURL else { return }
                    // Capacitor uses the fragment (#g=...) for deep-link routing.
                    // We pass it through verbatim — deeplink.js does the rest.
                    invocationURL = url
                }
        }
    }
}

// MARK: - iOS 14+ URL handler fallback

/// For direct URL opens (e.g. from iMessage tap), the `onOpenURL` modifier
/// on the scene handles the incoming URL.
extension TartanismClip {
    func handleURL(_ url: URL) {
        invocationURL = url
    }
}
