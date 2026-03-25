# iOS CLI Automation & Debug Tooling

> Extend the `qcut://` URL scheme to support full editor automation and debug introspection from the command line via `xcrun simctl openurl`.

## Current State (Updated 2026-03-25)

### All Commands Implemented (`QCutViewController.swift`)
| Command | Example | Status |
|---------|---------|--------|
| `qcut://eval?js=<encoded>` | Execute arbitrary JS | Working |
| `qcut://navigate?path=<path>` | Hash navigation | Working |
| `qcut://panel?panel=<name>&subpanel=<name>` | Switch editor panels and inner tabs | Working |
| `qcut://play` | `__playbackStore.getState().play()` | Working |
| `qcut://pause` | `__playbackStore.getState().pause()` | Working |
| `qcut://toggle` | `__playbackStore.getState().toggle()` | Working |
| `qcut://seek?time=<seconds>` | Seek to time | Working |
| `qcut://click?testid=<id>` | Click element by data-testid | Working |
| `qcut://state` | Dump editor state as JSON | Working |
| `qcut://fps` | 3-second FPS benchmark | Working |
| `qcut://console` | Read captured `__qcutLogs` | Working |
| `qcut://screenshot` | Read debug overlay | Working |
| `qcut://export?quality=&format=&filename=` | Trigger video export | Working |
| `qcut://export-status` | Poll export progress | Working |
| `qcut://open-editor` | Navigate to first project (Darwin notification only) | Working |
| `qcut://test-export` | Test share sheet with fake MP4 (Darwin notification only) | Working |
| `qcut://cli.import-and-export` | E2E: import photos + export (Darwin notification only) | Working |

### Exposed Debug State (All 6 Stores)
- `window.__playbackStore` — Zustand playback store (play/pause/seek/speed/volume)
- `window.__mediaPanelStore` — Media panel tab state
- `window.__exportStore` — Export settings and progress
- `window.__timelineStore` — Timeline tracks and elements
- `window.__projectStore` — Active project state
- `window.__editorStore` — Editor UI state
- `window.__mediaStore` — Media library state
- `window.__exportActions` — Export action methods (exposed from export dialog)

### Supporting Infrastructure
- **Console bridge**: `apps/web/src/lib/debug/ios-console-bridge.ts` — auto-captures logs on iPad
- **Subpanel events**: AI and Moyin views listen for `qcut:switch-subpanel` CustomEvent
- **Shell CLI**: `scripts/ipad-cli.sh` — all commands for simulator
- **Export output**: `apps/web/src/lib/export/export-output.ts` — Web Share API + Capacitor + fallback
- **Darwin notifications**: Physical device support via `CFNotificationCenter` (debug builds only)

### Known Limitation
- `ipad-cli.sh` uses `xcrun simctl openurl` which only works with **simulators**
- Physical iPad requires `xcrun devicectl device process launch --payload-url` or Darwin notifications
- Deep links sent at app launch fire before stores are ready (stores are null until editor page loads)

---

## Implementation Plan

### Task 1: Fix & Expand Swift CLI Commands — DONE
**Time:** ~15 min
**Files:**
- `apps/web/ios/App/App/QCutViewController.swift:14-65`

#### Subtasks

**1a. Fix `qcut://play` command**
- Current code clicks `[data-testid="play-button"]` which doesn't exist
- Should use `[data-testid="timeline-play-button"]` or call `window.__playbackStore.getState().toggle()` directly

**1b. Add `qcut://pause` command**
- Call `window.__playbackStore.getState().pause()`

**1c. Add `qcut://seek?time=<seconds>` command**
- Call `window.__playbackStore.getState().seek(parseFloat(time))`

**1d. Add `qcut://panel?panel=<name>&subpanel=<name>` command**
- First-class panel navigation, not just raw `click?testid=...`
- Support main media-panel tabs:
  - `media`
  - `project-folder`
  - `ai`
  - `text2image`
  - `moyin`
  - `word-timeline`
  - `upscale`
  - `video-edit`
  - `text`
  - `stickers`
  - `nano-edit`
  - `pty`
  - `remotion`
- Support properties-panel tabs via the same command:
  - `properties`
  - `export`
  - `settings`
- Support subpanels where the target panel has inner tabs:
  - `panel=ai&subpanel=text|image|avatar|upscale|angles`
  - `panel=moyin&subpanel=overview|characters|scenes|shots|generate`
  - `panel=edit&subpanel=ai-edit|manual-edit` to switch edit subgroup before selecting a tab
  - `panel=video-edit&subpanel=audio-gen|audio-sync|upscale|translate`
- Implementation shape:
  - switch properties tabs through `window.__exportStore`
  - switch media-panel tabs through `window.__mediaPanelStore`
  - dispatch a generic event for inner views, for example:
```typescript
window.dispatchEvent(
  new CustomEvent("qcut:switch-subpanel", {
    detail: { panel, subpanel },
  })
);
```
- Each view with inner tabs listens for its own panel:
  - AI view updates `aiActiveTab`
  - Moyin updates structure tab
  - Video edit view updates active mode

**1e. Add `qcut://state` command — dump editor state**
- Return JSON with: playback state, track count, element count, current route, duration
- Reads from exposed stores on `window`, including active panel/subpanel state

**1f. Add `qcut://click?testid=<id>` command**
- Generic button click: `document.querySelector('[data-testid="<id>"]')?.click()`
- Keep as escape hatch for one-off controls
- Panel switching should use `qcut://panel`, not raw testids

**1g. Add `qcut://fps` command — built-in FPS benchmark**
- Run 3-second rAF loop, report FPS via NSLog
- No need to manually encode JS each time

---

### Task 2: Expose Editor Stores for Debug — DONE
**Time:** ~10 min
**Files:**
- `apps/web/src/components/editor/media-panel/store.ts` — expose `window.__mediaPanelStore`
- `apps/web/src/stores/export-store.ts` — expose `window.__exportStore`
- `apps/web/src/stores/timeline/timeline-store.ts` — expose `window.__timelineStore`
- `apps/web/src/stores/project-store.ts` — expose `window.__projectStore`
- `apps/web/src/stores/editor/editor-store.ts` — expose `window.__editorStore`
- `apps/web/src/stores/media/media-store.ts` — expose `window.__mediaStore`

#### Pattern (same as playback-store)
```typescript
// At bottom of each store file
(window as any).__mediaPanelStore = useMediaPanelStore;
(window as any).__exportStore = useExportStore;
```

#### Available via CLI
```bash
xcrun simctl openurl booted "qcut://eval?js=JSON.stringify(window.__timelineStore.getState().tracks.length)"
```

#### Why this matters
- `qcut://panel` needs store-level control for durable panel switching
- Using stores is more stable than DOM click automation for tab state

---

### Task 3: Console Log Capture — DONE
**Time:** ~10 min
**Files:**
- `apps/web/src/lib/debug/ios-console-bridge.ts` (new)
- `apps/web/src/routes/editor.$project_id.lazy.tsx` — import bridge
- `apps/web/src/components/editor/media-panel/views/ai/index.tsx` — listen for `qcut:switch-subpanel`
- `apps/web/src/components/editor/media-panel/views/moyin/structure-panel.tsx` — listen for `qcut:switch-subpanel`
- `apps/web/src/components/editor/media-panel/views/video-edit*.tsx` — listen for `qcut:switch-subpanel`

#### Implementation
```typescript
// ios-console-bridge.ts
if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
  const logs: string[] = [];
  const MAX = 200;
  const orig = { log: console.log, warn: console.warn, error: console.error };

  for (const level of ["log", "warn", "error"] as const) {
    console[level] = (...args: any[]) => {
      logs.push(`[${level}] ${args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")}`);
      if (logs.length > MAX) logs.shift();
      orig[level](...args);
    };
  }
  (window as any).__qcutLogs = logs;
}
```

This makes `qcut://console` work automatically on iPad.

It also provides a single event channel for panel-specific inner tab switching:
```typescript
window.addEventListener("qcut:switch-subpanel", (event) => {
  if (!(event instanceof CustomEvent)) return;
  const { panel, subpanel } = event.detail ?? {};
  if (panel !== "ai" || typeof subpanel !== "string") return;
  useMediaPanelStore.getState().setAiActiveTab(subpanel as AIActiveTab);
});
```

---

### Task 4: Shell Helper Script — DONE
**Time:** ~10 min
**Files:**
- `scripts/ipad-cli.sh` (new)

#### Script
```bash
#!/bin/bash
# Usage: ./scripts/ipad-cli.sh <command> [args]
# Examples:
#   ./scripts/ipad-cli.sh play
#   ./scripts/ipad-cli.sh pause
#   ./scripts/ipad-cli.sh seek 5.0
#   ./scripts/ipad-cli.sh panel media
#   ./scripts/ipad-cli.sh panel ai image
#   ./scripts/ipad-cli.sh panel moyin shots
#   ./scripts/ipad-cli.sh panel properties export
#   ./scripts/ipad-cli.sh click timeline-play-button
#   ./scripts/ipad-cli.sh state
#   ./scripts/ipad-cli.sh fps
#   ./scripts/ipad-cli.sh eval "1+1"
#   ./scripts/ipad-cli.sh navigate /editor/my-project
#   ./scripts/ipad-cli.sh console
#   ./scripts/ipad-cli.sh logs    (tail simulator logs)

CMD=$1; shift
case "$CMD" in
  play|pause|state|fps|console|screenshot)
    xcrun simctl openurl booted "qcut://$CMD"
    ;;
  seek)
    xcrun simctl openurl booted "qcut://seek?time=$1"
    ;;
  panel)
    PANEL=$1
    SUBPANEL=$2
    URL="qcut://panel?panel=$PANEL"
    if [ -n "$SUBPANEL" ]; then
      URL="$URL&subpanel=$SUBPANEL"
    fi
    xcrun simctl openurl booted "$URL"
    ;;
  click)
    xcrun simctl openurl booted "qcut://click?testid=$1"
    ;;
  navigate)
    xcrun simctl openurl booted "qcut://navigate?path=$1"
    ;;
  eval)
    ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$1")
    xcrun simctl openurl booted "qcut://eval?js=$ENCODED"
    ;;
  logs)
    xcrun simctl spawn booted log show --predicate 'process == "App"' --last ${1:-30}s --style compact | grep "QCut CLI"
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Commands: play, pause, seek <time>, panel <panel> [subpanel], click <testid>, state, fps, eval <js>, navigate <path>, console, logs [seconds]"
    ;;
esac

# Always show recent logs after command
sleep 1
xcrun simctl spawn booted log show --predicate 'process == "App"' --last 3s --style compact 2>&1 | grep "QCut CLI" | tail -5
```

---

### Task 5: Panel & Subpanel Reference — DONE (docs)
**Time:** ~5 min

Primary `qcut://panel?panel=<name>&subpanel=<name>` targets:

| Panel | Subpanel(s) | Notes |
|------|-------------|-------|
| `media` | — | Library tab |
| `project-folder` | — | Project sync tab |
| `ai` | `text`, `image`, `avatar`, `upscale`, `angles` | AI Video panel + inner mode |
| `text2image` | — | AI Images tab |
| `moyin` | `overview`, `characters`, `scenes`, `shots`, `generate` | Director workflow |
| `video-edit` | `audio-gen`, `audio-sync`, `upscale`, `translate` | Audio/video edit modes |
| `word-timeline` | — | Smart Speech tab |
| `upscale` | — | Video Upscale top-level panel |
| `text` | — | Text tools |
| `stickers` | — | Stickers tools |
| `nano-edit` | — | Skills panel |
| `pty` | — | Terminal panel |
| `remotion` | — | Remotion panel |
| `properties` | — | Properties side panel tab |
| `export` | — | Export side panel tab |
| `settings` | — | API keys/settings side panel tab |
| `edit` | `ai-edit`, `manual-edit` | Switch edit subgroup before picking a specific tab |

Fallback `data-testid` values available for `qcut://click?testid=<id>`:

| Button | testid | Purpose |
|--------|--------|---------|
| Play/Pause | `timeline-play-button` / `timeline-pause-button` | Toggle playback |
| Split | `split-clip-button` | Split at playhead |
| Zoom In | `zoom-in-button` | Timeline zoom |
| Zoom Out | `zoom-out-button` | Timeline zoom |
| Import Media | `import-media-button` | File import dialog |
| Screenshot | `screenshot-button` | Canvas capture |
| Export All | `export-all-button` | Export dialog |
| Add Markdown | `add-markdown-button` | Add markdown element |
| Media Tab | `media-panel-tab` | Switch to media panel |
| Text Tab | `text-panel-tab` | Switch to text panel |
| AI Tab | `ai-panel-tab` | Switch to AI panel |
| Properties | `panel-tab-properties` | Properties panel |
| Export | `panel-tab-export` | Export panel |
| Settings | `panel-tab-settings` | Settings panel |

---

## Testing

### Manual Test Flow
```bash
# 1. Build & deploy
cd apps/web && bun run build && bunx cap sync ios
cd ios/App && xcodebuild -scheme App -destination 'platform=iOS Simulator,id=<device-id>' build
xcrun simctl install booted <path-to-app>
xcrun simctl launch booted com.qcut.videoeditor

# 2. Navigate to editor
./scripts/ipad-cli.sh navigate /editor/test-project

# 3. Test playback
./scripts/ipad-cli.sh play
./scripts/ipad-cli.sh fps
./scripts/ipad-cli.sh pause

# 4. Test panel switching
./scripts/ipad-cli.sh panel ai text
./scripts/ipad-cli.sh panel ai image
./scripts/ipad-cli.sh panel moyin scenes
./scripts/ipad-cli.sh panel properties export

# 5. Test button clicks
./scripts/ipad-cli.sh click split-clip-button
./scripts/ipad-cli.sh click zoom-in-button

# 6. Debug state
./scripts/ipad-cli.sh state
./scripts/ipad-cli.sh console
```

### Unit Tests
- `apps/web/src/lib/debug/__tests__/ios-console-bridge.test.ts` — verify log capture
- No unit tests needed for Swift CLI (tested via integration)

---

## Architecture

```
xcrun simctl openurl booted "qcut://..."
        │
        ▼
AppDelegate.swift ──► QCutViewController.handleDeepLink(url:)
        │
        ▼
  switch url.host:
    eval      → webView.evaluateJavaScript(js)
    panel     → set store-backed panel state, then dispatch qcut:switch-subpanel
    click     → webView.evaluateJavaScript("querySelector('[data-testid=...]').click()")
    play      → webView.evaluateJavaScript("window.__playbackStore.getState().toggle()")
    state     → webView.evaluateJavaScript("JSON.stringify({...})")
    fps       → webView.evaluateJavaScript("<rAF benchmark>")
        │
        ▼
  NSLog("[QCut CLI] Result: ...")
        │
        ▼
  xcrun simctl spawn booted log show --predicate 'process == "App"'
```

---

### Task 6: CLI Export Command — DONE
**Time:** ~30 min
**Depends on:** Task 1 (Swift commands), Task 2 (exposed stores)

#### Goal
Trigger a full video export from the CLI via `qcut://export` and poll progress via `qcut://export-status`. Uses the new **muxer engine** (mediabunny WebCodecs H.264) which runs entirely in-browser — no FFmpeg or Electron required.

#### Export Engine Context
- **Engine:** `ExportEngineMuxer` → mediabunny → browser WebCodecs H.264 hardware encoding
- **Factory auto-selection:** If `capabilities.hasWebCodecs` → selects `muxer` engine (iPad Safari qualifies)
- **Output:** MP4 blob → auto-download via `URL.createObjectURL()`
- **Pipeline:** `useExportProgress.handleExport()` → `ExportEngineFactory.createEngine()` → `ExportEngineMuxer.export()` → Blob → download

#### Subtasks

**6a. Add `qcut://export` deep link command (Swift)**
**File:** `apps/web/ios/App/App/QCutViewController.swift`

Add a new case to `handleDeepLink`:
```swift
case "export":
    // qcut://export?quality=720p&format=mp4&filename=my-video
    let quality = url.queryValue(for: "quality") ?? "720p"
    let format = url.queryValue(for: "format") ?? "mp4"
    let filename = url.queryValue(for: "filename") ?? "export"
    runJS("""
    (function() {
        if (!window.__exportStore) return 'no export store';
        if (!window.__timelineStore) return 'no timeline store';
        var ex = window.__exportStore.getState();
        if (ex.progress.isExporting) return 'already exporting';
        ex.updateSettings({
            quality: '\(quality)',
            format: '\(format)',
            filename: '\(filename)',
            width: \(quality == "1080p" ? "1920" : quality == "720p" ? "1280" : "854"),
            height: \(quality == "1080p" ? "1080" : quality == "720p" ? "720" : "480")
        });
        // Dispatch event for the export dialog to pick up
        window.dispatchEvent(new CustomEvent('qcut:cli-export', {
            detail: { quality: '\(quality)', format: '\(format)', filename: '\(filename)', engineType: 'muxer' }
        }));
        return 'export triggered: \(quality) \(format) \(filename)';
    })()
    """)
```

**6b. Add `qcut://export-status` deep link command (Swift)**
**File:** `apps/web/ios/App/App/QCutViewController.swift`

```swift
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
            encodingSpeed: p.encodingSpeed || null
        });
    })()
    """)
```

**6c. Add `qcut:cli-export` event listener (TypeScript)**
**File:** `apps/web/src/hooks/export/use-export-progress.ts` (or a new `apps/web/src/lib/debug/cli-export-bridge.ts`)

Listen for the CLI export event and trigger the same flow as the export dialog button:
```typescript
// In the editor route or export dialog component
useEffect(() => {
  const handler = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const { quality, format, filename, engineType } = event.detail ?? {};
    // Get canvas from the preview panel ref
    const canvas = document.querySelector("canvas[data-export-canvas]") as HTMLCanvasElement;
    if (!canvas) {
      console.error("[CLI Export] No canvas found");
      return;
    }
    const timelineStore = useTimelineStore.getState();
    const duration = timelineStore.duration;
    handleExport(canvas, duration, {
      quality, format, filename, engineType,
      resolution: { width: canvas.width, height: canvas.height },
      includeAudio: true,
      audioCodec: "aac",
      audioBitrate: 128,
    });
  };
  window.addEventListener("qcut:cli-export", handler);
  return () => window.removeEventListener("qcut:cli-export", handler);
}, [handleExport]);
```

**Key challenge:** The `handleExport` function from `useExportProgress` needs a canvas reference. Options:
1. Tag the preview canvas with `data-export-canvas` attribute and query it from the event handler
2. Expose `handleExport` on `window.__exportActions` for direct CLI invocation
3. Use the existing export dialog flow by opening it + auto-clicking

**Recommended approach:** Option 2 — expose `handleExport` as `window.__exportActions.export(settings)`. This avoids DOM queries and dialog UI dependencies.

```typescript
// In use-export-progress.ts, after hook init:
(window as any).__exportActions = {
  export: async (settings: { quality: string; format: string; filename: string }) => {
    const canvas = canvasRef.current?.getCanvas();
    if (!canvas) throw new Error("No canvas available");
    return handleExport(canvas, timelineDuration, {
      ...settings,
      engineType: "muxer",
      resolution: { width: canvas.width, height: canvas.height },
      includeAudio: true,
      audioCodec: "aac",
      audioBitrate: 128,
    });
  }
};
```

Then the Swift command simplifies to:
```swift
case "export":
    let quality = url.queryValue(for: "quality") ?? "720p"
    let format = url.queryValue(for: "format") ?? "mp4"
    let filename = url.queryValue(for: "filename") ?? "export"
    runJS("""
    (function() {
        if (!window.__exportActions) return 'no export actions (open editor first)';
        var p = window.__exportStore?.getState().progress;
        if (p && p.isExporting) return 'already exporting';
        window.__exportActions.export({
            quality: '\(quality)', format: '\(format)', filename: '\(filename)'
        }).then(function() { return 'export complete'; })
          .catch(function(e) { return 'export failed: ' + e.message; });
        return 'export started: \(quality) \(format)';
    })()
    """)
```

**6d. Add shell helper commands**
**File:** `scripts/ipad-cli.sh`

```bash
  export)
    QUALITY=${1:-720p}
    FORMAT=${2:-mp4}
    FILENAME=${3:-export}
    xcrun simctl openurl booted "qcut://export?quality=$QUALITY&format=$FORMAT&filename=$FILENAME"
    ;;
  export-status)
    xcrun simctl openurl booted "qcut://export-status"
    ;;
  export-wait)
    # Poll export progress until complete
    QUALITY=${1:-720p}
    FORMAT=${2:-mp4}
    FILENAME=${3:-export}
    xcrun simctl openurl booted "qcut://export?quality=$QUALITY&format=$FORMAT&filename=$FILENAME"
    echo "Export started, polling progress..."
    while true; do
      sleep 2
      xcrun simctl openurl booted "qcut://export-status"
      sleep 1
      STATUS=$(xcrun simctl spawn booted log show --predicate 'process == "App"' --last 3s --style compact 2>&1 | grep "QCut CLI" | tail -1)
      echo "$STATUS"
      if echo "$STATUS" | grep -q '"isExporting":false'; then
        echo "Export complete!"
        break
      fi
    done
    ;;
```

**6e. Update `state` dump to include export progress**
**File:** `apps/web/ios/App/App/QCutViewController.swift` — update the `state` case

Add export progress to the existing state JSON:
```swift
// Add to the state dump JS:
export: ex ? {
    panelView: ex.panelView,
    isExporting: ex.progress.isExporting,
    progress: ex.progress.progress,
    status: ex.progress.status,
    settings: { quality: ex.settings.quality, format: ex.settings.format }
} : null,
```

#### Download Handling on iPad

The muxer engine produces an MP4 blob and triggers download via `URL.createObjectURL()` + `<a download>` click. On iPad Safari:
- The file opens in a new tab or triggers the native share sheet
- For programmatic file saving, consider using the `share()` API or Capacitor Filesystem plugin
- For CLI testing, the export completing successfully is the primary success metric — the blob existing in memory confirms the pipeline works

#### Test Flow
```bash
# 1. Navigate to editor with content
./scripts/ipad-cli.sh navigate /editor/test-project

# 2. Trigger export
./scripts/ipad-cli.sh export 720p mp4 test-video

# 3. Poll progress
./scripts/ipad-cli.sh export-status
./scripts/ipad-cli.sh export-status
# Repeat until isExporting: false

# 4. Or use the blocking wait command
./scripts/ipad-cli.sh export-wait 720p mp4 test-video
```

---

### Task 7: Export Output to Files App (iPad) — DONE
**Time:** ~15 min
**Depends on:** Task 6

#### Goal
After muxer export produces an MP4 blob, save it to the iPad Files app instead of relying on `<a download>` (which may not work reliably on iOS Safari).

#### Implementation
**File:** `apps/web/src/lib/export/export-output.ts` (already created in this branch)

Use the Web Share API or Capacitor Filesystem plugin:
```typescript
async function saveExportedVideo(blob: Blob, filename: string): Promise<void> {
  // Try Web Share API first (iOS 15+)
  if (navigator.canShare?.({ files: [new File([blob], filename, { type: "video/mp4" })] })) {
    await navigator.share({ files: [new File([blob], filename, { type: "video/mp4" })] });
    return;
  }
  // Fallback: Capacitor Filesystem (if available)
  if (window.Capacitor?.Plugins?.Filesystem) {
    const base64 = await blobToBase64(blob);
    await window.Capacitor.Plugins.Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: "DOCUMENTS",
    });
    return;
  }
  // Last resort: <a download> click
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```

Wire into `useExportProgress.handleExport()` to replace the current download logic when on iPad.

---

## Architecture (Updated)

```
xcrun simctl openurl booted "qcut://..."
        │
        ▼
AppDelegate.swift ──► QCutViewController.handleDeepLink(url:)
        │
        ▼
  switch url.host:
    eval          → webView.evaluateJavaScript(js)
    panel         → set store-backed panel state, then dispatch qcut:switch-subpanel
    click         → webView.evaluateJavaScript("querySelector('[data-testid=...]').click()")
    play          → webView.evaluateJavaScript("window.__playbackStore.getState().toggle()")
    state         → webView.evaluateJavaScript("JSON.stringify({...})")
    fps           → webView.evaluateJavaScript("<rAF benchmark>")
    export        → window.__exportActions.export({quality, format, filename})
    export-status → window.__exportStore.getState().progress → JSON
        │
        ▼
  NSLog("[QCut CLI] Result: ...")
        │
        ▼
  xcrun simctl spawn booted log show --predicate 'process == "App"'

Export Pipeline (iPad):
  qcut://export ──► __exportActions.export()
        │
        ▼
  useExportProgress.handleExport()
        │
        ▼
  ExportEngineFactory.createEngine(engineType: "muxer")
        │
        ▼
  ExportEngineMuxer.export(progressCallback)
        ├── mediabunny: CanvasSource → H.264 WebCodecs
        ├── mediabunny: AudioBufferSource → AAC
        └── mediabunny: Mp4OutputFormat → Blob
        │
        ▼
  saveExportedVideo(blob, filename) → Files App / Share Sheet
```

## Priority Order (All Complete)
1. **Task 1** (Swift commands) — DONE
2. **Task 4** (Shell script) — DONE
3. **Task 2** (Expose stores) — DONE
4. **Task 3** (Console bridge + subpanel events) — DONE
5. **Task 5** (Reference) — DONE (docs)
6. **Task 6** (CLI Export) — DONE
7. **Task 7** (Export to Files App) — DONE

## Remaining Work
- **Physical device CLI**: `ipad-cli.sh` only supports simulator. Need a `ipad-device-cli.sh` that uses `xcrun devicectl` for physical iPad testing.
- **open-editor deep link**: Currently only available as Darwin notification, not as `qcut://open-editor` URL. Add to `handleDeepLink` switch.
