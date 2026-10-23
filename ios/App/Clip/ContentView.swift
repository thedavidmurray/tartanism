import SwiftUI
import WebKit

/// WKWebView wrapper that loads the Tartanism web app with the shared litter's
/// fragment, so the existing deeplink.js decoder handles breed-from in-web.
struct ClipWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()

        // Allow inline playback so animated loops work without fullscreen
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Minimal JS — turn off overscroll/compositing chrome
        let source = """
        var meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
        document.head.appendChild(meta);
        """
        let script = WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        config.userContentController.addUserScript(script)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.backgroundColor = UIColor(red: 10/255, green: 10/255, blue: 26/255, alpha: 1)
        webView.isOpaque = false
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}

// MARK: - SwiftUI entry

struct ContentView: View {
    /// The invocation URL from the Universal Link (https://tartanism.app/b#g=PAYLOAD).
    /// Falls back to a plain /b if no link was provided (e.g. manual launch).
    let invocationURL: URL?

    @State private var showOverlay = true

    var body: some View {
        ZStack(alignment: .bottom) {
            ClipWebView(url: resolvedURL)
                .ignoresSafeArea()

            // Install banner — appears after a short delay, overlays below the web content
            if showOverlay {
                installBanner
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onAppear {
            // Auto-dismiss the install banner after 15 seconds if user doesn't tap
            DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
                withAnimation(.easeOut(duration: 0.3)) {
                    showOverlay = false
                }
            }
        }
    }

    // MARK: - URL resolution

    private var resolvedURL: URL {
        if let url = invocationURL,
           let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           components.scheme == "https" {
            return url
        }
        // No invocation URL — show the plain app (unlikely in practice)
        return URL(string: "https://tartanism.app/b")!
    }

    // MARK: - Install CTA via SKOverlay

    private var installBanner: some View {
        VStack(spacing: 0) {
            Divider().opacity(0.3)

            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tartanism")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(.primary)
                    Text("Breed infinite generative setts")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Button(action: openAppStore) {
                    Text("Get")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(Color.accentColor, in: Capsule())
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.ultraThinMaterial)
        }
    }

    private func openAppStore() {
        // Open the full app's App Store page so the user can install.
        // Replace placeholder ID with the real App Store ID once submitted.
        let appStoreID = "TARTANISM_APP_STORE_ID"
        let url = URL(string: "https://apps.apple.com/app/id\(appStoreID)")!
        UIApplication.shared.open(url)
    }
}
