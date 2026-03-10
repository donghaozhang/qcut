import UIKit
import WebKit
import Capacitor

class QCutViewController: CAPBridgeViewController {
    override func webViewConfiguration(for config: InstanceConfiguration) -> WKWebViewConfiguration {
        let webConfig = super.webViewConfiguration(for: config)
        webConfig.mediaTypesRequiringUserActionForPlayback = []
        webConfig.allowsInlineMediaPlayback = true
        return webConfig
    }

    /// Handle qcut:// URL commands by evaluating JS in the webview
    func handleDeepLink(url: URL) {
        guard url.scheme == "qcut", let host = url.host else { return }

        switch host {
        case "eval":
            // qcut://eval?js=<encoded-js>
            if let js = url.queryValue(for: "js") {
                webView?.evaluateJavaScript(js) { result, error in
                    if let error = error {
                        NSLog("[QCut CLI] JS error: \(error)")
                    }
                    if let result = result {
                        NSLog("[QCut CLI] Result: \(result)")
                    }
                }
            }
        case "navigate":
            // qcut://navigate?path=<path>
            if let path = url.queryValue(for: "path") {
                let js = "window.location.hash = '\(path.replacingOccurrences(of: "'", with: "\\'"))';"
                webView?.evaluateJavaScript(js, completionHandler: nil)
            }
        case "screenshot":
            // qcut://screenshot — capture console state
            let js = """
            (function() {
                var el = document.getElementById('playback-debug-overlay');
                return el ? el.textContent : 'no debug overlay';
            })()
            """
            webView?.evaluateJavaScript(js) { result, error in
                NSLog("[QCut CLI] Debug overlay: \(result ?? "nil")")
            }
        case "play":
            webView?.evaluateJavaScript("document.querySelector('[data-testid=\"play-button\"]')?.click() || 'no play button'") { result, error in
                NSLog("[QCut CLI] Play: \(result ?? "nil")")
            }
        case "console":
            // qcut://console — dump recent console logs
            let js = """
            (function() {
                if (!window.__qcutLogs) return 'No logs captured. Run qcut://eval?js=... to enable.';
                return window.__qcutLogs.slice(-20).join('\\n');
            })()
            """
            webView?.evaluateJavaScript(js) { result, error in
                NSLog("[QCut CLI] Console: \(result ?? "nil")")
            }
        default:
            NSLog("[QCut CLI] Unknown command: \(host)")
        }
    }
}

private extension URL {
    func queryValue(for key: String) -> String? {
        URLComponents(url: self, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == key })?
            .value
    }
}
