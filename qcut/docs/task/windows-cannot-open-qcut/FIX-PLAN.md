# Fix Plan — Windows "QCut Won't Open" (Priorities 1-3)

Implements fixes 1-3 from [README.md](README.md) in one PR on branch
`docs/windows-cannot-open-qcut`. Fixes 4-5 (second-instance window recreate,
GPU fallback) and A1 (code signing) stay out of scope.

Chinese mirror: [FIX-PLAN.zh-CN.md](FIX-PLAN.zh-CN.md).

## Design: extract decisions into a pure policy module

Both bugs live inside `electron/main.ts` closures, which makes them
untestable directly (importing `main.ts` boots Electron). The fix extracts
the two decisions into a new side-effect-free module so Vitest can cover
them, and `main.ts` consumes it.

New file: `electron/launch-policy.ts`

```ts
type PortBindAction = "retry-next" | "fallback-random" | "reject";

// EACCES added: Windows WinNAT excluded port ranges (Hyper-V/WSL2) report
// EACCES, not EADDRINUSE, when binding inside a reserved range.
export function nextPortAction({ code, port, maxPort }): PortBindAction;

// Packaged builds must never honour an inherited NODE_ENV.
export function resolveRendererTarget({ isPackaged, nodeEnv }):
  { isDev: boolean; url: string };
```

## Change 1 — static-server bind failure no longer kills startup silently

File: `electron/main.ts`

1. `createStaticServer`'s `errorHandler` (~line 477) delegates to
   `nextPortAction`:
   - `EADDRINUSE` **or `EACCES`** below `MAX_PORT` → try next port
     (current behaviour only handled `EADDRINUSE`).
   - at/above `MAX_PORT` → `server.listen(0)` (OS-assigned free port)
     instead of rejecting. `staticServerPort` is read back from
     `server.address()`, and nothing else hardcodes 8080, so the CSP
     `connect-src http://localhost:${staticServerPort}` keeps working.
   - any other error → reject (now surfaced, see change 2).

2. The `app.whenReady().then(async () => {...})` chain for the normal app
   (~line 775) gets a `.catch` that logs and shows
   `dialog.showErrorBox("QCut failed to start", ...)` — converting the
   silent no-window state into a visible, reportable error.

## Change 2 — packaged builds ignore inherited NODE_ENV

File: `electron/main.ts` (~line 605)

```ts
// before
const isDev = process.env.NODE_ENV === "development";
// after
const { isDev, url } = resolveRendererTarget({
  isPackaged: app.isPackaged,
  nodeEnv: process.env.NODE_ENV,
});
```

`isDev` keeps gating DevTools auto-open. Packaged builds now always load
`app://./index.html` regardless of the user's environment.

## Change 3 — renderer failures become observable

File: `electron/main.ts`, inside `createWindow()`:

- `webContents.on("did-fail-load")` — log error code/description/URL; for
  main-frame failures also `dialog.showErrorBox` (this is the white-screen
  case; subframe/resource failures only log).
- `webContents.on("render-process-gone")` — log reason + exitCode.
- `app.on("child-process-gone")` (GPU) — log only; auto-fallback stays
  out of scope (fix 5).

`ERR_ABORTED` (-3) is excluded from the dialog: it fires on benign
navigation aborts.

## Tests

Unit (`electron/__tests__/launch-policy.test.ts`, Vitest):

| Case | Expect |
|------|--------|
| `EADDRINUSE`, port < max | `retry-next` |
| `EACCES`, port < max | `retry-next` |
| `EADDRINUSE`/`EACCES`, port ≥ max | `fallback-random` |
| other code (e.g. `EPERM`), any port | `reject` |
| packaged + `NODE_ENV=development` | `app://./index.html`, `isDev: false` |
| packaged + unset | `app://./index.html` |
| unpackaged + `development` | `http://localhost:5173`, `isDev: true` |
| unpackaged + unset | `app://./index.html`, `isDev: false` |

Manual / integration (not in this PR's CI):

- macOS: `NODE_ENV=development open "…/QCut AI Video Editor.app"` →
  must open normally after the fix (reproduces Bug 2 before it).
- Any OS: occupy ports 8080-8090 with 11 dummy listeners, launch dev app →
  window must still appear (random port).
- Windows VM: `netsh int ipv4 add excludedportrange protocol=tcp
  startport=8080 numberofports=11` (admin), launch → window must appear;
  before the fix this reproduces process-without-window. Clean up with
  `delete excludedportrange`.

Regression gates: `bun run test electron/__tests__/launch-policy.test.ts`,
`npx tsc -p electron/tsconfig.json --noEmit`, biome check on touched files.

## Risks

- `listen(0)` port lands outside 8080-8090: CSP already interpolates the
  actual port; FFmpeg WASM URLs are built from `staticServerPort` via IPC.
  Verified no consumer hardcodes the range.
- Error dialogs on startup could annoy if over-triggered: dialog only on
  whenReady chain failure and main-frame load failure (excluding -3), both
  of which previously meant a dead app anyway.
