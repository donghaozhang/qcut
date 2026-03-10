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

        // ── Eval ─────────────────────────────────────────────────
        case "eval":
            // qcut://eval?js=<encoded-js>
            if let js = url.queryValue(for: "js") {
                runJS(js)
            }

        // ── Navigate ─────────────────────────────────────────────
        case "navigate":
            // qcut://navigate?path=<path>
            if let path = url.queryValue(for: "path") {
                let escaped = path.replacingOccurrences(of: "'", with: "\\'")
                runJS("window.location.hash = '\(escaped)';")
            }

        // ── Play / Pause / Toggle ────────────────────────────────
        case "play":
            runJS("window.__playbackStore ? (window.__playbackStore.getState().play(), 'playing') : 'no store'")
        case "pause":
            runJS("window.__playbackStore ? (window.__playbackStore.getState().pause(), 'paused') : 'no store'")
        case "toggle":
            runJS("window.__playbackStore ? (window.__playbackStore.getState().toggle(), 'toggled') : 'no store'")

        // ── Seek ─────────────────────────────────────────────────
        case "seek":
            // qcut://seek?time=<seconds>
            if let timeStr = url.queryValue(for: "time") {
                runJS("window.__playbackStore ? (window.__playbackStore.getState().seek(\(timeStr)), 'seeked to \(timeStr)') : 'no store'")
            }

        // ── Panel switching ──────────────────────────────────────
        case "panel":
            // qcut://panel?panel=<name>&subpanel=<name>
            handlePanelSwitch(url: url)

        // ── Click by testid ──────────────────────────────────────
        case "click":
            // qcut://click?testid=<id>
            if let testid = url.queryValue(for: "testid") {
                let escaped = testid.replacingOccurrences(of: "'", with: "\\'")
                runJS("""
                (function() {
                    var el = document.querySelector('[data-testid="\(escaped)"]');
                    if (el) { el.click(); return 'clicked: \(escaped)'; }
                    return 'not found: \(escaped)';
                })()
                """)
            }

        // ── State dump ───────────────────────────────────────────
        case "state":
            runJS("""
            (function() {
                var pb = window.__playbackStore?.getState();
                var tl = window.__timelineStore?.getState();
                var pj = window.__projectStore?.getState();
                var mp = window.__mediaPanelStore?.getState();
                var ex = window.__exportStore?.getState();
                return JSON.stringify({
                    route: window.location.hash,
                    playback: pb ? { isPlaying: pb.isPlaying, currentTime: pb.currentTime, duration: pb.duration, speed: pb.speed } : null,
                    tracks: tl ? tl.tracks.length : null,
                    elements: tl ? tl.tracks.reduce(function(s,t){ return s + t.elements.length; }, 0) : null,
                    project: pj?.activeProject ? { id: pj.activeProject.id, name: pj.activeProject.name, fps: pj.activeProject.fps } : null,
                    panel: mp ? { activeTab: mp.activeTab, aiActiveTab: mp.aiActiveTab } : null,
                    panelView: ex?.panelView || null
                }, null, 2);
            })()
            """)

        // ── FPS benchmark ────────────────────────────────────────
        case "fps":
            runJS("""
            (function() {
                var f = 0, t = performance.now();
                function c() {
                    f++;
                    if (performance.now() - t < 3000) requestAnimationFrame(c);
                    else {
                        var e = (performance.now() - t) / 1000;
                        window.__fpsResult = Math.round(f/e) + ' FPS (' + f + ' frames/' + e.toFixed(1) + 's)';
                    }
                }
                var s = window.__playbackStore?.getState();
                if (s) s.play();
                requestAnimationFrame(c);
                return 'FPS test started (3s)...';
            })()
            """)

        // ── Console logs ─────────────────────────────────────────
        case "console":
            runJS("""
            (function() {
                if (!window.__qcutLogs) return 'No logs captured yet.';
                return window.__qcutLogs.slice(-30).join('\\n');
            })()
            """)

        // ── Screenshot / debug overlay ───────────────────────────
        case "screenshot":
            runJS("""
            (function() {
                var el = document.getElementById('playback-debug-overlay');
                return el ? el.textContent : 'no debug overlay';
            })()
            """)

        default:
            NSLog("[QCut CLI] Unknown command: \(host)")
        }
    }

    // MARK: - Panel switching

    private func handlePanelSwitch(url: URL) {
        guard let panel = url.queryValue(for: "panel") else {
            NSLog("[QCut CLI] panel: missing ?panel= parameter")
            return
        }
        let subpanel = url.queryValue(for: "subpanel")
        let escaped = panel.replacingOccurrences(of: "'", with: "\\'")
        let subEscaped = subpanel?.replacingOccurrences(of: "'", with: "\\'")

        // Properties-side tabs (properties, export, settings)
        let propertiesTabs = ["properties", "export", "settings"]
        if propertiesTabs.contains(panel) {
            runJS("window.__exportStore ? (window.__exportStore.getState().setPanelView('\(escaped)'), 'panel: \(escaped)') : 'no export store'")
            return
        }

        // Media-panel tabs
        runJS("window.__mediaPanelStore ? (window.__mediaPanelStore.getState().setActiveTab('\(escaped)'), 'panel: \(escaped)') : 'no media panel store'")

        // Subpanel switching via CustomEvent
        if let sub = subEscaped {
            runJS("""
            window.dispatchEvent(new CustomEvent('qcut:switch-subpanel', {
                detail: { panel: '\(escaped)', subpanel: '\(sub)' }
            }));
            '\(escaped)/\(sub)'
            """)
        }
    }

    // MARK: - JS execution helper

    private func runJS(_ js: String) {
        webView?.evaluateJavaScript(js) { result, error in
            if let error = error {
                NSLog("[QCut CLI] JS error: \(error)")
            }
            if let result = result {
                NSLog("[QCut CLI] Result: \(result)")
            }
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
