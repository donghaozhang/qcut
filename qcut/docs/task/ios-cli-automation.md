# iOS CLI Automation & Debug Tooling

> Extend the `qcut://` URL scheme to support full editor automation and debug introspection from the command line via `xcrun simctl openurl`.

## Current State

### Existing Commands (`QCutViewController.swift`)
| Command | Example | Status |
|---------|---------|--------|
| `qcut://eval?js=<encoded>` | Execute arbitrary JS | Working |
| `qcut://navigate?path=<path>` | Hash navigation | Working |
| `qcut://panel?panel=<name>&subpanel=<name>` | Switch editor panels and inner tabs | Missing |
| `qcut://play` | Click play button via `data-testid` | Broken (wrong testid) |
| `qcut://screenshot` | Read debug overlay | Partial |
| `qcut://console` | Read `__qcutLogs` | Requires manual setup |

### Exposed Debug State
- `window.__playbackStore` — Zustand playback store (play/pause/seek/speed/volume)
- No other stores currently exposed

---

## Implementation Plan

### Task 1: Fix & Expand Swift CLI Commands
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

### Task 2: Expose Editor Stores for Debug
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

### Task 3: Console Log Capture
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

### Task 4: Shell Helper Script
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

### Task 5: Panel & Subpanel Reference
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

## Priority Order
1. **Task 1** (Swift commands) — Highest impact, enables everything else
2. **Task 4** (Shell script) — Quality of life, makes CLI usable
3. **Task 2** (Expose stores) — Required for stable panel/subpanel switching
4. **Task 3** (Console bridge + subpanel events) — Auto-captures logs and drives inner tabs
5. **Task 5** (Reference) — Documents supported targets
