# PR 09 — wzrdagentstudio terminal UI

> **Phase**: 2 · **Depends on**: PR 07, PR 08 · **Estimated LOC**: ~220

## Goal

A new route in wzrdagentstudio that opens a live `qcut` terminal in the browser. The user clicks a dashboard card, the React component calls `/sandbox-spawn`, receives a `ws_url`, attaches xterm.js to the WebSocket, and the user types `qcut …` while output streams back.

This is the consumer surface for all PRs 06–08.

## Depends on

- PR 07 — the spawn endpoint exists and returns `ws_url`.
- PR 08 — the relay is reachable and pipes PTY bytes.

> **Repo**: `/Users/peter/Desktop/code/wzrdagentstudio/` (separate from `/Users/peter/Desktop/code/qcut/qcut/`). All paths below are in **wzrdagentstudio**.

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `src/features/qcut-sandbox/routes/SandboxRoute.tsx` | new | Route component (`/sandbox/:workspaceId`) |
| `src/features/qcut-sandbox/components/TerminalView.tsx` | new | xterm.js mount + WS pipe |
| `src/features/qcut-sandbox/components/SessionHeader.tsx` | new | TTL countdown + stop button |
| `src/features/qcut-sandbox/components/ResourceClassPicker.tsx` | new | standard / large select |
| `src/features/qcut-sandbox/hooks/useSpawnSandbox.ts` | new | Calls `/sandbox-spawn` |
| `src/features/qcut-sandbox/hooks/useSandboxSocket.ts` | new | WS attach + reconnect/idle UX |
| `src/features/qcut-sandbox/api/sandbox-client.ts` | new | Typed fetch wrapper |
| `src/integrations/supabase/functions.ts` | modify | Register `sandbox-spawn` function name |
| `package.json` | modify | Add `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` |
| `src/router.tsx` (or equivalent) | modify | Mount the new route |

## Implementation

### Step 1 — Spawn API hook

`src/features/qcut-sandbox/api/sandbox-client.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";

export interface SpawnResponse {
  session_id: string;
  ws_url: string;
  expires_at: string;
}

export async function spawnSandbox(workspace_id: string, resource_class: "standard" | "large" = "standard"): Promise<SpawnResponse> {
  const { data, error } = await supabase.functions.invoke<SpawnResponse>("sandbox-spawn", {
    body: { workspace_id, resource_class },
  });
  if (error) throw error;
  if (!data) throw new Error("empty_response");
  return data;
}
```

`src/features/qcut-sandbox/hooks/useSpawnSandbox.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { spawnSandbox, type SpawnResponse } from "../api/sandbox-client";

export function useSpawnSandbox() {
  return useMutation<SpawnResponse, Error, { workspace_id: string; resource_class?: "standard" | "large" }>({
    mutationFn: ({ workspace_id, resource_class }) => spawnSandbox(workspace_id, resource_class),
  });
}
```

### Step 2 — Terminal component

`src/features/qcut-sandbox/components/TerminalView.tsx`:

```tsx
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

interface Props {
  wsUrl: string;
  onExit: (reason: string) => void;
}

export function TerminalView({ wsUrl, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 13,
      theme: { background: "#0b0d10" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.addEventListener("message", (e) => {
      term.write(new Uint8Array(e.data as ArrayBuffer));
    });
    ws.addEventListener("close", (e) => onExit(e.reason || "disconnect"));
    ws.addEventListener("error", () => onExit("error"));

    const inputDisposable = term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(d);
    });

    const sendResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ kind: "resize", cols: term.cols, rows: term.rows }));
      }
    };
    const resizeObs = new ResizeObserver(sendResize);
    resizeObs.observe(containerRef.current);

    return () => {
      resizeObs.disconnect();
      inputDisposable.dispose();
      try { ws.close(); } catch { /* ignore */ }
      term.dispose();
    };
  }, [wsUrl, onExit]);

  return <div ref={containerRef} className="h-full w-full bg-[#0b0d10] p-2 rounded-md" />;
}
```

### Step 3 — Header

`src/features/qcut-sandbox/components/SessionHeader.tsx`:

```tsx
import { useEffect, useState } from "react";

interface Props {
  sessionId: string;
  expiresAt: string;
  onStop: () => void;
}

export function SessionHeader({ sessionId, expiresAt, onStop }: Props) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");
  return (
    <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
      <span className="font-mono text-muted-foreground">session {sessionId.slice(0, 8)} · TTL {m}:{s}</span>
      <button
        className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700"
        onClick={onStop}
      >
        Stop
      </button>
    </div>
  );
}
```

### Step 4 — Route

`src/features/qcut-sandbox/routes/SandboxRoute.tsx`:

```tsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { TerminalView } from "../components/TerminalView";
import { SessionHeader } from "../components/SessionHeader";
import { ResourceClassPicker } from "../components/ResourceClassPicker";
import { useSpawnSandbox } from "../hooks/useSpawnSandbox";

export function SandboxRoute() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const spawn = useSpawnSandbox();
  const [exitReason, setExitReason] = useState<string | null>(null);
  const [resourceClass, setResourceClass] = useState<"standard" | "large">("standard");

  if (!workspaceId) return <div className="p-4 text-red-500">no workspace</div>;

  if (!spawn.data || exitReason) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8">
        {exitReason ? <p className="text-amber-600">session ended: {exitReason}</p> : null}
        <ResourceClassPicker value={resourceClass} onChange={setResourceClass} />
        <button
          className="rounded bg-orange-500 px-4 py-2 text-white"
          disabled={spawn.isPending}
          onClick={() => {
            setExitReason(null);
            spawn.mutate({ workspace_id: workspaceId, resource_class: resourceClass });
          }}
        >
          {spawn.isPending ? "Spawning…" : "Open qcut shell"}
        </button>
        {spawn.error ? <p className="text-red-500">{spawn.error.message}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SessionHeader
        sessionId={spawn.data.session_id}
        expiresAt={spawn.data.expires_at}
        onStop={() => setExitReason("user_kill")}
      />
      <div className="flex-1">
        <TerminalView wsUrl={spawn.data.ws_url} onExit={setExitReason} />
      </div>
    </div>
  );
}
```

### Step 5 — Resource picker

`src/features/qcut-sandbox/components/ResourceClassPicker.tsx`:

```tsx
interface Props {
  value: "standard" | "large";
  onChange: (v: "standard" | "large") => void;
}
export function ResourceClassPicker({ value, onChange }: Props) {
  return (
    <select
      className="rounded border px-3 py-1"
      value={value}
      onChange={(e) => onChange(e.target.value as "standard" | "large")}
    >
      <option value="standard">standard (2 vCPU · 4 GB)</option>
      <option value="large">large (4 vCPU · 8 GB)</option>
    </select>
  );
}
```

### Step 6 — Router mount

In `src/router.tsx` (path varies per project — find the file that defines top-level routes), add:

```tsx
import { SandboxRoute } from "@/features/qcut-sandbox/routes/SandboxRoute";

// ...inside the routes array, under the auth-protected branch:
{ path: "/sandbox/:workspaceId", element: <RequireAuth><SandboxRoute /></RequireAuth> }
```

### Step 7 — package.json deps

```json
{
  "dependencies": {
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0"
  }
}
```

Run `bun install`.

### Step 8 — Dashboard entry

Add a "qcut Shell" card / sidebar item in the existing dashboard component that navigates to `/sandbox/<current workspace id>`. Guard it by the workspace-level feature flag `qcut_sandbox_enabled` if such a flag system exists; if not, ship unflagged.

## Tests

`src/features/qcut-sandbox/components/TerminalView.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TerminalView } from "./TerminalView";

vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: vi.fn(),
    onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    dispose: vi.fn(),
    cols: 80, rows: 24,
  })),
}));

describe("TerminalView", () => {
  it("opens a WS to the given url on mount", () => {
    const wsMock = vi.fn();
    vi.stubGlobal("WebSocket", wsMock);
    render(<TerminalView wsUrl="wss://example/pty?token=t" onExit={() => {}} />);
    expect(wsMock).toHaveBeenCalledWith("wss://example/pty?token=t");
  });
});
```

Run: `bun --cwd /Users/peter/Desktop/code/wzrdagentstudio test`.

## Verification (manual)

```bash
cd /Users/peter/Desktop/code/wzrdagentstudio
bun install
bun dev

# Browser: log in, navigate to /sandbox/<workspace-id>
# Click "Open qcut shell"
# Confirm: motd appears, you can type `qcut --help`, see output
# Click "Stop" — terminal closes, session row in DB is `ended/user_kill`
```

Watch the browser console for any unhandled WS errors. If the terminal stalls with no output but the spawn POST returned 200, suspect the relay (PR 08), not the UI.

## Out of scope for this PR

- Reconnect-within-30 s grace UX. v0: dropped session = user clicks "Open qcut shell" again.
- Session history view (list of past `sandbox_sessions` for the user). Can be added easily; not in scope.
- File upload into the sandbox via drag-and-drop. Phase 3.
- Per-user theme. Use the default xterm.js theme + project's tailwind tokens.
- Mobile layout. Terminal on phone is a misfeature — desktop only.

## See also

- [`../web-sandbox/integration.md`](../web-sandbox/integration.md) — file-layout rationale + variant code
- [`07-spawn-edge-function.md`](07-spawn-edge-function.md) — backend this hits
- [`08-relay-worker.md`](08-relay-worker.md) — WS partner this opens
