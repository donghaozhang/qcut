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

    #if DEBUG
    /// Pending deep link URL written by notification handler, executed on main thread
    private static var pendingDeepLinkURL: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        registerDarwinNotificationBridge()
    }

    /// Register Darwin notification listeners so `devicectl notification post` can trigger deep link commands on a real device.
    /// Usage: write URL to app group defaults, then post notification.
    /// Shortcut notifications for common commands (no UserDefaults needed):
    ///   - com.qcut.cli.state  → qcut://state
    ///   - com.qcut.cli.play   → qcut://play
    ///   - com.qcut.cli.pause  → qcut://pause
    ///   - com.qcut.cli.export-status → qcut://export-status
    ///   - com.qcut.cli.eval   → runs JS from __qcutEvalJS global
    private func registerDarwinNotificationBridge() {
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()

        // Generic eval: set window.__qcutEvalJS from a previous eval, then post this notification
        let commands: [String] = [
            "com.qcut.cli.state",
            "com.qcut.cli.play",
            "com.qcut.cli.pause",
            "com.qcut.cli.export-status",
            "com.qcut.cli.console",
            "com.qcut.cli.fps",
            "com.qcut.cli.open-editor",
            "com.qcut.test-export",
        ]

        for name in commands {
            CFNotificationCenterAddObserver(center, observer, { (_, observer, notifName, _, _) in
                guard let observer = observer else { return }
                let name = notifName?.rawValue as String? ?? ""
                let vc = Unmanaged<QCutViewController>.fromOpaque(observer).takeUnretainedValue()
                DispatchQueue.main.async {
                    vc.handleNotification(name: name)
                }
            }, name as CFString, nil, .deliverImmediately)
        }
    }

    private func handleNotification(name: String) {
        let urlMapping: [String: String] = [
            "com.qcut.cli.state": "qcut://state",
            "com.qcut.cli.play": "qcut://play",
            "com.qcut.cli.pause": "qcut://pause",
            "com.qcut.cli.export-status": "qcut://export-status",
            "com.qcut.cli.console": "qcut://console",
            "com.qcut.cli.fps": "qcut://fps",
        ]

        if let urlStr = urlMapping[name], let url = URL(string: urlStr) {
            handleDeepLink(url: url)
        } else if name == "com.qcut.cli.open-editor" {
            openFirstProject()
        } else if name == "com.qcut.test-export" {
            runShareSheetTest()
        }
    }

    /// Navigate to the projects page, find the first project, and open it in the editor
    private func openFirstProject() {
        runJS("""
        (function() {
            // Navigate to projects page first
            window.location.hash = '#/projects';
            return 'navigated to projects';
        })()
        """)
        // Wait for projects page to load, then click the first project
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.runJS("""
            (function() {
                // Try to find and click the first project card/link
                var link = document.querySelector('a[href*="/editor/"]');
                if (link) {
                    link.click();
                    return 'opened project: ' + link.href;
                }
                // Try project cards with data-testid
                var card = document.querySelector('[data-testid*="project"]');
                if (card) {
                    card.click();
                    return 'clicked project card';
                }
                // List all links for debugging
                var links = Array.from(document.querySelectorAll('a')).map(function(a) { return a.href; });
                return 'no project found. links: ' + JSON.stringify(links.slice(0, 10));
            })()
            """)
        }
    }

    /// Test the share sheet with a fake MP4 blob to verify export output behavior
    private func runShareSheetTest() {
        runJS("""
        (function() {
            var b = new Blob(['test video data for share sheet'], {type: 'video/mp4'});
            var f = new File([b], 'test-export.mp4', {type: 'video/mp4'});
            var result = {canShare: typeof navigator.canShare, hasShare: typeof navigator.share};
            if (navigator.canShare && navigator.canShare({files: [f]})) {
                result.canShareFiles = true;
                navigator.share({files: [f], title: 'test-export.mp4'})
                    .then(function() { console.log('[QCut Export Test] share completed'); })
                    .catch(function(e) { console.log('[QCut Export Test] share dismissed/failed: ' + e.message); });
                result.action = 'share sheet opened';
            } else {
                result.canShareFiles = false;
                result.action = 'canShare not available';
            }
            return JSON.stringify(result);
        })()
        """)
    }
    #endif

    /// Handle qcut:// URL commands by evaluating JS in the webview (debug builds only)
    func handleDeepLink(url: URL) {
        #if !DEBUG
        NSLog("[QCut CLI] Deep link commands are only available in debug builds")
        return
        #else
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
                    panelView: ex?.panelView || null,
                    export: ex ? { isExporting: ex.progress.isExporting, progress: ex.progress.progress, status: ex.progress.status, settings: { quality: ex.settings.quality, format: ex.settings.format } } : null
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

        // ── Export ──────────────────────────────────────────────────
        case "export":
            // qcut://export?quality=720p&format=mp4&filename=my-video
            let quality = url.queryValue(for: "quality") ?? "720p"
            let format = url.queryValue(for: "format") ?? "mp4"
            let filename = url.queryValue(for: "filename") ?? "export"
            guard
                let payloadData = try? JSONSerialization.data(withJSONObject: [
                    "quality": quality,
                    "format": format,
                    "filename": filename,
                ]),
                let payloadJSON = String(data: payloadData, encoding: .utf8)
            else {
                NSLog("[QCut CLI] export: failed to encode arguments")
                return
            }
            runJS("""
            (function() {
                if (!window.__exportActions) return 'no export actions (open editor first)';
                var p = window.__exportStore?.getState().progress;
                if (p && p.isExporting) return 'already exporting';
                var settings = \(payloadJSON);
                window.__exportActions.export(settings).then(function() { return 'export complete'; })
                  .catch(function(e) { console.error('[CLI Export] failed:', e); });
                return 'export started: ' + settings.quality + ' ' + settings.format;
            })()
            """)

        // ── Export status ───────────────────────────────────────────
        case "export-status":
            runJS("""
            (function() {
                if (!window.__exportStore) return 'no export store';
                var p = window.__exportStore.getState().progress;
                return JSON.stringify({
                    isExporting: p.isExporting,
                    progress: p.progress,
                    status: p.status,
                    currentFrame: p.currentFrame,
                    totalFrames: p.totalFrames,
                    estimatedTimeRemaining: p.estimatedTimeRemaining,
                    encodingSpeed: p.encodingSpeed ?? null
                });
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
        #endif
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
