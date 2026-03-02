# Preview Panel 3-Way Toggle: Video / MCP App / Agent

## Overview

Add a 3-way mode switcher to the center preview panel so users can toggle between:

1. **Video Preview** — current canvas-based video playback (default)
2. **MCP App** — sandboxed iframe rendering MCP HTML apps (existing)
3. **Agent** — embedded PTY terminal for watching AI agents work in real-time

Currently the preview panel only switches between Video and MCP via `useMcpAppStore`. This task extends it to a proper 3-mode system with a visible toggle control in the preview header.

---

## Architecture

### Current State

```
preview-panel.tsx renders:
  if (activeHtml)  → MCP iframe mode
  else             → Video canvas mode

State: useMcpAppStore { activeHtml, toolName, localMcpActive }
```

### Target State

```
preview-panel.tsx renders:
  previewMode === "mcp"   → MCP iframe mode
  previewMode === "agent"  → Embedded PTY terminal
  previewMode === "video"  → Video canvas mode (default)

State: usePreviewModeStore { previewMode, setPreviewMode }
       useMcpAppStore      { activeHtml, toolName, localMcpActive } (unchanged)
```

The preview mode store is separate from the MCP store. External MCP apps can still push HTML via IPC — when they do, `previewMode` auto-switches to `"mcp"`. When the user returns to preview, it goes back to `"video"`.

---

## Subtasks

### Subtask 1: Create Preview Mode Store (~5 min)

**Files:**
- `apps/web/src/stores/preview-mode-store.ts` (new)

Create a Zustand store that manages the active preview mode:

```ts
type PreviewMode = "video" | "mcp" | "agent";

interface PreviewModeState {
  previewMode: PreviewMode;
  setPreviewMode: (mode: PreviewMode) => void;
}
```

Design decisions:
- No persistence needed (resets to `"video"` on reload — safe default)
- When MCP IPC pushes HTML, the preview-panel component should auto-switch to `"mcp"` mode
- Keep `useMcpAppStore` unchanged — it stores MCP HTML/toolName, the new store only tracks which view is active

---

### Subtask 2: Create Embedded Agent View Component (~15 min)

**Files:**
- `apps/web/src/components/editor/preview-panel/preview-agent-view.tsx` (new)

Create a lightweight wrapper that embeds the PTY terminal in the preview panel area. This component:

- Reuses `TerminalEmulator` from `apps/web/src/components/editor/media-panel/views/pty-terminal/terminal-emulator.tsx`
- Reuses `usePtyTerminalStore` from `apps/web/src/stores/pty-terminal-store.ts`
- Shows a minimal header: provider label, connection status dot, Start/Stop button
- Auto-connects when mode switches to `"agent"` (call `ensureAutoConnected()`)
- Does NOT duplicate the full `PtyTerminalView` toolbar (model selector, skill badge, etc.) — those stay in the media panel's Agents tab for full configuration
- Shows an idle placeholder with "Start Agent" button when disconnected

**Reference components:**
- `apps/web/src/components/editor/media-panel/views/pty-terminal/pty-terminal-view.tsx` — full PTY view (model selector, provider, skill badge)
- `apps/web/src/components/editor/media-panel/views/pty-terminal/terminal-emulator.tsx` — xterm.js wrapper (the core rendering component)
- `apps/web/src/stores/pty-terminal-store.ts` — session state, connect/disconnect, provider selection

Key consideration: The PTY terminal is already used in the media panel. Both the media panel tab and this preview agent view should share the **same PTY session** via the shared `usePtyTerminalStore`. Only one xterm.js instance can attach to the PTY data stream at a time — the preview agent view should take precedence when active (agent mode), and the media panel terminal should render when agent mode is off. Handle this by conditionally mounting `<TerminalEmulator>` only in whichever panel is active.

---

### Subtask 3: Add 3-Way Toggle to Preview Header (~10 min)

**Files:**
- `apps/web/src/components/editor/preview-panel.tsx` (modify)
- `apps/web/src/components/ui/toggle-group.tsx` (existing, reuse)

Replace the current "MCP Media App" / "Video Preview" / "Return to Preview" buttons with a unified 3-way `ToggleGroup`:

```
[ Video | MCP | Agent ]
```

Located in the preview panel header bar (top-right of the preview area).

Changes to `preview-panel.tsx`:
1. Import `usePreviewModeStore`
2. Replace the `if (activeHtml)` branching with `switch (previewMode)`
3. Replace scatter of toggle/return buttons with a single `ToggleGroup`
4. When external MCP HTML arrives via IPC `onAppHtml`, auto-set `previewMode` to `"mcp"`
5. "Return to Preview" becomes simply `setPreviewMode("video")`
6. The `toggleMcpMediaApp` function sets mode to `"mcp"` or `"video"`

Rendering logic:

```tsx
switch (previewMode) {
  case "mcp":
    return <McpIframeView ... />;
  case "agent":
    return <PreviewAgentView />;
  default:
    return <VideoPreview ... />;
}
```

---

### Subtask 4: Handle PTY Session Sharing Between Panels (~10 min)

**Files:**
- `apps/web/src/components/editor/preview-panel/preview-agent-view.tsx` (from Subtask 2)
- `apps/web/src/components/editor/media-panel/views/pty-terminal/pty-terminal-view.tsx` (modify)
- `apps/web/src/stores/pty-terminal-store.ts` (minor — may need a `mountedIn` field)

Only one xterm.js instance should bind to the PTY data IPC at a time. Strategy:

- Add a `terminalMountedIn: "media-panel" | "preview-panel" | null` field to `usePtyTerminalStore`
- `TerminalEmulator` sets this on mount, clears on unmount
- If the terminal is already mounted elsewhere, show a "Terminal is active in [other panel]" message instead of a second xterm instance
- When `previewMode` is `"agent"`, the preview panel takes priority — the media panel terminal shows the message
- When `previewMode` is not `"agent"`, media panel operates normally

---

### Subtask 5: Tests (~10 min)

**Files:**
- `apps/web/src/stores/__tests__/preview-mode-store.test.ts` (new)
- `apps/web/src/components/editor/preview-panel/__tests__/preview-agent-view.test.tsx` (new)

**Store tests:**
- Default mode is `"video"`
- `setPreviewMode("agent")` switches correctly
- `setPreviewMode("mcp")` switches correctly
- Switching back to `"video"` works

**Component tests:**
- `PreviewAgentView` renders idle state when PTY disconnected
- Shows terminal emulator when connected
- Start button calls `connect()`

---

## File Summary

| File | Action | Subtask |
|------|--------|---------|
| `apps/web/src/stores/preview-mode-store.ts` | New | 1 |
| `apps/web/src/components/editor/preview-panel/preview-agent-view.tsx` | New | 2 |
| `apps/web/src/components/editor/preview-panel.tsx` | Modify | 3 |
| `apps/web/src/stores/pty-terminal-store.ts` | Modify (add `terminalMountedIn`) | 4 |
| `apps/web/src/components/editor/media-panel/views/pty-terminal/pty-terminal-view.tsx` | Modify (respect `terminalMountedIn`) | 4 |
| `apps/web/src/stores/mcp-app-store.ts` | No change | — |
| `apps/web/src/stores/__tests__/preview-mode-store.test.ts` | New | 5 |
| `apps/web/src/components/editor/preview-panel/__tests__/preview-agent-view.test.tsx` | New | 5 |

## Estimated Time

~50 minutes total across 5 subtasks.

## Verification

1. `bun run build` — no type/build errors
2. `bun run test` — store and component tests pass
3. Visual: toggle between all 3 modes in the preview panel
4. Agent mode: PTY connects and shows terminal output
5. MCP mode: external MCP apps still work via IPC auto-switch
6. When agent mode is active, media panel terminal shows "active in preview" message
7. When agent mode is off, media panel terminal works normally
