---
name: ipad-cli
description: Build, deploy, and remotely control QCut on a real iPad or simulator. Use when the user asks to install on iPad, test on iPad, take iPad screenshots, run E2E tests on device, or send CLI commands to the iPad app.
argument-hint: [command or task]
disable-model-invocation: true
---

# iPad CLI — Real Device & Simulator Automation

Remote control QCut on a real iPad or iOS Simulator from the command line. Build, deploy, navigate, trigger exports, take screenshots, and run E2E tests — all without touching the device.

## Quick Reference

| Task | Command |
|------|---------|
| Check device | `xcrun xctrace list devices 2>&1 \| grep iPad` |
| Build for device | `xcodebuild -scheme App -destination 'id=<UDID>' -allowProvisioningUpdates build` |
| Install on device | `xcrun devicectl device install app --device <UDID> <path-to-App.app>` |
| Launch app | `xcrun devicectl device process launch --device <UDID> com.qcut.videoeditor` |
| Send command | `xcrun devicectl device notification post --device <UDID> --name <notification>` |
| Screenshot (device) | `pymobiledevice3 developer dvt screenshot /tmp/ipad.png --rsd <HOST> <PORT>` |
| Screenshot (sim) | `xcrun simctl io booted screenshot /tmp/sim.png` |
| Open URL (sim only) | `xcrun simctl openurl booted "qcut://state"` |

## Architecture

```
Mac CLI ──► xcrun devicectl notification post ──► Darwin Notification
                                                        │
                                                        ▼
                                            QCutViewController (Swift)
                                            registerDarwinNotificationBridge()
                                                        │
                                                        ▼
                                            handleDeepLink(url:) ──► webView.evaluateJavaScript()
                                                        │
                                                        ▼
                                            NSLog("[QCut CLI] Result: ...")
```

**Key insight:** `xcrun devicectl` cannot open URLs on real devices (only simulators via `simctl openurl`). The workaround is **Darwin notifications** — the Swift app listens for named notifications and maps them to deep link commands.

## Device vs Simulator

| Capability | Simulator (`simctl`) | Real Device (`devicectl`) |
|-----------|----------------------|--------------------------|
| Open URLs | `simctl openurl booted "qcut://..."` | Not supported |
| Send notifications | Not needed (use openurl) | `devicectl notification post --name ...` |
| Install app | `simctl install booted <app>` | `devicectl device install app --device <UDID> <app>` |
| Launch app | `simctl launch booted <bundle>` | `devicectl device process launch --device <UDID> <bundle>` |
| Screenshot | `simctl io booted screenshot <path>` | Requires pymobiledevice3 tunnel (see below) |
| Read logs | `simctl spawn booted log show ...` | Requires pymobiledevice3 tunnel |
| Browse files | `simctl get_app_container booted <bundle>` | `pymobiledevice3 apps afc <bundle> --rsd ...` |

## Step-by-Step: Full E2E on Real iPad

### 1. Check connection

```bash
xcrun xctrace list devices 2>&1 | grep "iPad.*00008"
```

Look for the UDID (e.g., `00008112-001538520C83601E`). If it shows "Connecting", kill stale processes:

```bash
sudo pkill -9 -f "pymobiledevice3"
sudo killall -9 remoted 2>/dev/null
```

Then unplug and replug the USB cable.

### 2. Build the web app

```bash
cd <PROJECT_ROOT>
bun run build
bunx cap sync ios
```

### 3. Build the iOS app

```bash
cd apps/web/ios/App
xcodebuild -scheme App -destination 'id=<UDID>' -allowProvisioningUpdates build
```

The built `.app` bundle lives at:
```
~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphoneos/App.app
```

### 4. Install and launch

```bash
xcrun devicectl device install app --device <UDID> \
  ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphoneos/App.app

xcrun devicectl device process launch --device <UDID> com.qcut.videoeditor
```

### 5. Send commands via Darwin notifications

```bash
# Navigate to editor (opens first project)
xcrun devicectl device notification post --device <UDID> --name com.qcut.cli.open-editor

# Get editor state
xcrun devicectl device notification post --device <UDID> --name com.qcut.cli.state

# Playback
xcrun devicectl device notification post --device <UDID> --name com.qcut.cli.play
xcrun devicectl device notification post --device <UDID> --name com.qcut.cli.pause

# FPS benchmark
xcrun devicectl device notification post --device <UDID> --name com.qcut.cli.fps

# Console logs
xcrun devicectl device notification post --device <UDID> --name com.qcut.cli.console

# Export status
xcrun devicectl device notification post --device <UDID> --name com.qcut.cli.export-status

# Test share sheet (fake MP4 blob)
xcrun devicectl device notification post --device <UDID> --name com.qcut.test-export
```

### 6. Take screenshots (requires tunnel)

```bash
# Start tunnel (needs sudo, runs in background)
sudo pymobiledevice3 remote start-tunnel --udid <UDID> --script-mode > /tmp/tunnel_out.txt 2>&1 &
sleep 8
cat /tmp/tunnel_out.txt
# Output: <HOST> <PORT>  (e.g., fd0c:7d3f:3356::1 60660)

# Take screenshot
pymobiledevice3 developer dvt screenshot /tmp/ipad-screenshot.png --rsd <HOST> <PORT>

# View it
open /tmp/ipad-screenshot.png
# Or read it inline (Claude can view images)
```

### 7. Clean up tunnel

```bash
sudo pkill -f "pymobiledevice3"
```

## Available Darwin Notifications

These are registered in `QCutViewController.registerDarwinNotificationBridge()`:

| Notification Name | Maps To | Description |
|-------------------|---------|-------------|
| `com.qcut.cli.state` | `qcut://state` | Dump editor state (playback, tracks, project, panels, export) |
| `com.qcut.cli.play` | `qcut://play` | Start playback |
| `com.qcut.cli.pause` | `qcut://pause` | Pause playback |
| `com.qcut.cli.fps` | `qcut://fps` | Run 3-second FPS benchmark |
| `com.qcut.cli.console` | `qcut://console` | Read captured console logs |
| `com.qcut.cli.export-status` | `qcut://export-status` | Poll export progress |
| `com.qcut.cli.open-editor` | (custom) | Navigate to projects, auto-open first project |
| `com.qcut.test-export` | (custom) | Trigger share sheet with test MP4 blob |

## Deep Link Commands (Simulator only via `simctl openurl`)

| Command | URL | Description |
|---------|-----|-------------|
| Eval JS | `qcut://eval?js=<encoded>` | Execute arbitrary JavaScript |
| Navigate | `qcut://navigate?path=<path>` | Hash navigation |
| Play | `qcut://play` | Start playback |
| Pause | `qcut://pause` | Pause playback |
| Seek | `qcut://seek?time=<seconds>` | Seek to time |
| Panel | `qcut://panel?panel=<name>&subpanel=<name>` | Switch editor panels |
| Click | `qcut://click?testid=<id>` | Click element by data-testid |
| State | `qcut://state` | Dump editor state JSON |
| FPS | `qcut://fps` | 3-second FPS benchmark |
| Console | `qcut://console` | Read captured logs |
| Export | `qcut://export?quality=720p&format=mp4&filename=my-video` | Trigger export |
| Export Status | `qcut://export-status` | Poll export progress |

## Simulator Workflow

For simulator-only testing (faster iteration, no device needed):

```bash
# Boot simulator
xcrun simctl boot "33281421-8240-4977-B61A-27769DF02D04"  # iPad Pro 13-inch
open -a Simulator

# Build for simulator (needs separate build)
xcodebuild -scheme App -destination 'platform=iOS Simulator,id=<SIM-UDID>' build

# Install and launch
xcrun simctl install booted <path-to-Debug-iphonesimulator/App.app>
xcrun simctl launch booted com.qcut.videoeditor

# Send commands directly via URL
xcrun simctl openurl booted "qcut://state"
xcrun simctl openurl booted "qcut://play"
xcrun simctl openurl booted "qcut://panel?panel=ai&subpanel=image"

# Eval arbitrary JS
ENCODED=$(python3 << 'PYEOF'
import urllib.parse
js = 'JSON.stringify({url: location.href, stores: Object.keys(window).filter(k => k.startsWith("__"))})'
print(urllib.parse.quote(js))
PYEOF
)
xcrun simctl openurl booted "qcut://eval?js=$ENCODED"

# Read logs (results appear as NSLog "[QCut CLI] Result: ...")
sleep 2
xcrun simctl spawn booted log show --last 5s --style compact 2>&1 | grep "QCut CLI"

# Screenshot
xcrun simctl io booted screenshot /tmp/sim-screenshot.png
```

## Export Flow on iPad

The export uses `navigator.share()` which opens the iOS share sheet:

```
ExportEngineMuxer.export() → Blob
        │
        ▼
saveExportedVideo(blob, filename)
        │
        ├── navigator.share({files: [File]})  ← Primary (opens share sheet)
        │   └── User taps "Save to Files" / "Save Video" / AirDrop / etc.
        │
        ├── Capacitor Filesystem (fallback)   ← Saves to Files > On My iPad > QCut/
        │
        └── <a download> click (last resort)  ← Browser download
```

Share sheet options on real iPad:
- **Save to Files** — save to Files app (pick folder)
- **AirDrop** — send to nearby device
- **Copy** — copy to clipboard
- **Save Video** — save to Photos (only for real video blobs, not test data)
- **Messages**, **Notes**, etc.

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/ios/App/App/QCutViewController.swift` | Deep link handler + Darwin notification bridge |
| `apps/web/ios/App/App/AppDelegate.swift` | Routes `qcut://` URLs to QCutViewController |
| `apps/web/src/lib/export/export-output.ts` | Platform-aware export save (share sheet / Capacitor / download) |
| `apps/web/src/hooks/export/use-export-progress.ts` | Export orchestration, calls `saveExportedVideo()` |
| `scripts/ipad-cli.sh` | Shell helper for simulator commands |

## Troubleshooting

### Device stuck in "Connecting"
```bash
sudo pkill -9 -f "pymobiledevice3"
sudo killall -9 remoted 2>/dev/null
# Then unplug and replug USB cable
```

### pymobiledevice3 tunnel won't start
- Needs `sudo` (creates network interface)
- iPad must trust the computer — look for "Trust This Computer?" dialog
- If stuck on "Waiting user pairing consent", unplug/replug and tap Trust

### Build fails with "device is busy"
Kill any pymobiledevice3 tunnels first, then unplug/replug.

### Deep links not working on real device
`devicectl` cannot open URLs — use Darwin notifications instead:
```bash
# Wrong (only works on simulator):
xcrun simctl openurl booted "qcut://state"

# Right (works on real device):
xcrun devicectl device notification post --device <UDID> --name com.qcut.cli.state
```

### No "Save Video" in share sheet
Only appears for real video files with valid video data. Test blobs show Copy/Save to Files/More.

## Adding New Notifications

To add a new remotely-triggerable command:

1. Add the notification name to the `commands` array in `QCutViewController.registerDarwinNotificationBridge()`
2. Add the mapping in `handleNotification(name:)` — either map to an existing deep link URL or add custom logic
3. Rebuild and deploy to the device

Example — adding a `com.qcut.cli.export` notification:
```swift
// In commands array:
"com.qcut.cli.export",

// In handleNotification:
} else if name == "com.qcut.cli.export" {
    if let url = URL(string: "qcut://export?quality=720p&format=mp4&filename=export") {
        handleDeepLink(url: url)
    }
}
```

## Dependencies

| Tool | Install | Purpose |
|------|---------|---------|
| Xcode | App Store | Build iOS app |
| Bun | `brew install oven-sh/bun/bun` | Build web app |
| pymobiledevice3 | `pipx install pymobiledevice3` | Screenshots, filesystem, tunnel on real device |
| Capacitor | `bun add @capacitor/cli` (already in project) | Web → iOS bridge |
