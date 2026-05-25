---
name: qcut-mcp-preview-test
description: Switch QCut's center Preview Panel between normal video preview and MCP app mode, validate iframe rendering, and debug MCP HTML delivery through IPC and HTTP endpoints. Use when asked to test, demo, or troubleshoot MCP app preview behavior, the "MCP Media App" toggle, `mcp:app-html` events, `/api/claude/mcp/app`, or to craft prompts for Claude that modify the MCP media app UI safely.
allowed-tools: Bash(curl *), Read, Grep
---

# QCut MCP Preview Test

## Architecture

QCut's preview panel supports two rendering modes: **Video Preview** (default) and **MCP App** (interactive iframe). The MCP system has two independent input paths:

```
┌─────────────────────────────────────────────────┐
│  Preview Panel (preview-panel.tsx)               │
│                                                  │
│  Mode 1: Video Preview (default)                 │
│    → Canvas-based video playback                 │
│                                                  │
│  Mode 2: MCP App (iframe srcDoc)                 │
│    ├─ Local: built-in PersonaPlex template        │
│    │   toggled by "MCP Media App" button         │
│    │   state: localMcpActive = true              │
│    │                                              │
│    └─ External: HTML from Claude MCP tools        │
│       received via IPC mcp:app-html event        │
│       state: activeHtml + toolName set           │
└─────────────────────────────────────────────────┘

Data Flow (External MCP):
  Claude Code → HTTP POST /api/claude/mcp/app
    → claude-http-shared-routes.ts forwards via IPC
    → preview-panel.tsx receives via onAppHtml()
    → useMcpAppStore.setMcpApp({html, toolName})
    → <iframe srcDoc={activeHtml}>

Data Flow (Local Template):
  User clicks "MCP Media App" button
    → useMcpAppStore.setLocalMcpActive(true)
    → preview-panel.tsx calls buildMcpMediaAppHtml()
    → Renders MCP_MEDIA_APP_TEMPLATE from preview-panel/mcp-media-app.ts
```

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/components/editor/preview-panel.tsx` | Preview panel with MCP toggle and iframe rendering |
| `apps/web/src/components/editor/preview-panel/mcp-media-app.ts` | PersonaPlex template (`MCP_MEDIA_APP_TEMPLATE`) and HTML builder |
| `apps/web/src/stores/mcp-app-store.ts` | Zustand store: `activeHtml`, `toolName`, `localMcpActive` |
| `electron/claude/http/claude-http-shared-routes.ts` | HTTP endpoint `POST /api/claude/mcp/app` → IPC forward |
| `electron/mcp/qcut-mcp-server.ts` | MCP tools: `configure-media`, `show-export-settings`, `preview-project-stats` |
| `electron/mcp/apps/*.html` | HTML templates for each MCP tool |
| `apps/web/src/types/electron.d.ts` | Type: `window.electronAPI.mcp.onAppHtml()` |

## Store State (mcp-app-store.ts)

```typescript
interface McpAppState {
  activeHtml: string | null     // External MCP app HTML (from Claude tools)
  toolName: string | null       // External tool name (shown in toolbar)
  localMcpActive: boolean       // Built-in PersonaPlex template toggle
}

// Actions:
setMcpApp(html, toolName)       // External app received → disables localMcpActive
clearMcpApp()                   // Return to video preview
setLocalMcpActive(active)       // Toggle built-in template
```

## When To Use This Skill

Use when the user asks to:
- Test or debug MCP app rendering in the preview panel
- Switch between video preview and MCP app mode
- Modify the built-in PersonaPlex template UI
- Send custom HTML to the preview panel via HTTP
- Troubleshoot why external MCP tools aren't rendering
- Add new controls or change behavior of the MCP media app

## Quick Workflow

### 1. Toggle via UI
- Open a project in QCut editor
- Click `MCP Media App` in the preview toolbar → shows PersonaPlex template
- Click `Video Preview` or `Return to Preview` to switch back

### 2. Test HTTP Trigger (External MCP)
Send HTML directly to the preview panel:

```bash
curl -X POST http://127.0.0.1:8765/api/claude/mcp/app \
  -H "Content-Type: application/json" \
  -d '{"toolName":"manual-test","html":"<html><body><h1>MCP Manual Test</h1></body></html>"}'
```

Expected: preview switches to iframe, toolbar shows `MCP App: manual-test`.

### 3. Test MCP Server Tools
If Claude has the QCut MCP server registered:
```bash
claude mcp list  # Verify 'qcut' is listed
```
Then ask Claude to call: `configure-media`, `show-export-settings`, or `preview-project-stats`.

## How To Modify The MCP App Template

### Rules
- **Target file**: `apps/web/src/components/editor/preview-panel/mcp-media-app.ts`
- **Template variable**: `MCP_MEDIA_APP_TEMPLATE` (PersonaPlex speech-to-speech UI)
- **Do NOT change**: toggle button behavior in `preview-panel.tsx`, `clearMcpApp()` logic, IPC listener
- **Keep intact**: `PATCH /api/claude/project/{projectId}/settings` endpoint usage
- **Keep intact**: `try/catch` error handling in inline scripts
- **Verify after changes**: `cd apps/web && bunx tsc --noEmit`

### Example Prompts

**Visual redesign:**
```text
In preview-panel/mcp-media-app.ts, redesign MCP_MEDIA_APP_TEMPLATE layout:
- Two-column on desktop, single-column on mobile
- Add card backgrounds for each control group
- Keep all existing controls and API payload keys unchanged
- Preserve try/catch around interactions
Run: cd apps/web && bunx tsc --noEmit
```

**Add new control:**
```text
In preview-panel/mcp-media-app.ts, extend MCP_MEDIA_APP_TEMPLATE with a "Background Type" select (color|blur).
On Apply, include backgroundType in PATCH payload to /api/claude/project/{projectId}/settings.
Keep current controls and behavior unchanged.
Run type check: cd apps/web && bunx tsc --noEmit
```

**Behavior tweak:**
```text
Update MCP media app behavior in preview-panel/mcp-media-app.ts:
- Disable Apply button while request is in flight
- Show success/error status messages
- Keep endpoint and payload schema unchanged
Run: cd apps/web && bunx tsc --noEmit
```

## Debugging Checklist

### Preview doesn't switch to MCP mode
1. Check `useMcpAppStore` state in DevTools: `__ZUSTAND_STORES__` or React DevTools
2. Verify `window.electronAPI?.mcp?.onAppHtml` exists (preload exposed)
3. Check console for IPC errors

### External MCP app doesn't render
1. Verify QCut MCP server registered: `claude mcp list`
2. Test HTTP endpoint directly with curl (see above)
3. Check `electron/claude/http/claude-http-shared-routes.ts` route at `POST /api/claude/mcp/app`
4. Check that `win.webContents.send("mcp:app-html", ...)` is called

### Local template renders but iframe is blank
1. Check `MCP_MEDIA_APP_TEMPLATE` is valid HTML
2. Look for CSP (Content Security Policy) errors in console
3. Verify `srcDoc` attribute is set on iframe

### DevTools Debug Snippet
```javascript
// Attach listener to see incoming MCP payloads
try {
  window.electronAPI?.mcp?.onAppHtml?.((payload) => {
    console.log("mcp payload received:", payload);
  });
  console.log("mcp listener attached");
} catch (error) {
  console.error("failed to attach mcp listener:", error);
}
```

## Verification Commands

```bash
# Type check frontend
cd apps/web && bunx tsc --noEmit

# Type check electron
cd electron && bunx tsc --noEmit

# Run HTTP server tests
bunx vitest run electron/claude/__tests__/claude-http-server.test.ts --reporter=dot
```
