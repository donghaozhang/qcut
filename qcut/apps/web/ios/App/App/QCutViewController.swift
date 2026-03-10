import UIKit
import WebKit
import Capacitor

class QCutViewController: CAPBridgeViewController {
    override func webViewConfiguration(for config: InstanceConfiguration) -> WKWebViewConfiguration {
        let webConfig = super.webViewConfiguration(for: config)
        // Allow video playback without requiring a user gesture each time
        webConfig.mediaTypesRequiringUserActionForPlayback = []
        webConfig.allowsInlineMediaPlayback = true
        return webConfig
    }
}
