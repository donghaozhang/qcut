# Windows: QCut Won't Open — Potential Bug Investigation

Investigation of the report "user on Windows cannot open QCut". There is no
single root cause; this document maps every launch-critical code path in the
packaged Windows build and lists the concrete ways each one can fail, ordered
by how the failure presents to the user.

Sister docs: [windows-code-signing](../windows-code-signing/) (SmartScreen),
Chinese mirror: [README.zh-CN.md](README.zh-CN.md).

## Launch pipeline (packaged build)

```
double-click exe
  → SmartScreen / antivirus gate                     (stage A)
  → Electron main process starts (main.ts)
  → single-instance lock                             (main.ts:679)
  → app.whenReady().then(async () => {               (main.ts:775)
      createStaticServer()  ← await, can reject      (main.ts:791)
      createWindow()                                 (main.ts:793)
        loadURL: NODE_ENV check → app://./index.html (main.ts:605-613)
      register 25+ IPC handlers (individually try/caught)
    })                       ← NO .catch on this chain
```

A failure at any stage before `createWindow()` means **no window ever
appears** while a `QCut AI Video Editor.exe` process may keep running in Task
Manager — which users describe exactly as "QCut does not open".

## Stage A — blocked before Electron runs

### A1. SmartScreen "Unknown publisher" (known, tracked in #289)

The installer is unsigned — signing is explicitly disabled in
[package.json](../../../package.json) (`win.forceCodeSigning: false`,
`verifyUpdateCodeSignature: false`, `signAndEditExecutable: false`) and in the
release workflow. Defender SmartScreen shows "Windows protected your PC" with
no obvious Run button; non-technical users stop there and report "it won't
open". **Most likely real-world cause for fresh installs.**
Fix path: certificate purchase + signing rollout, see
[windows-code-signing](../windows-code-signing/).

### A2. Antivirus quarantine of unsigned binaries

The install ships unsigned `QCut AI Video Editor.exe` plus bundled native
binaries (ffmpeg/ffprobe, AICP). AV products routinely quarantine unsigned
Electron apps or strip individual binaries after install. Depending on what
was removed the app either never starts or starts with a broken renderer
(missing asar content → white screen). Same long-term fix as A1; short-term:
ask affected users to check the AV quarantine log.

## Stage B — process starts, no window appears

### B1. Static server bind failure aborts startup before the window exists

[main.ts:791](../../../electron/main.ts) awaits `createStaticServer()`
**before** `createWindow()` (line 793), and the surrounding
`app.whenReady().then(...)` chain has **no `.catch`**. The retry loop in
`createStaticServer` ([main.ts:472-499](../../../electron/main.ts)) only
handles `EADDRINUSE` and only up to port 8090; any other error rejects.

On Windows this is a real hazard: Hyper-V / WSL2 (WinNAT) reserves dynamic
**excluded port ranges** that frequently cover 8080-8090. Binding inside an
excluded range fails with **`EACCES`, not `EADDRINUSE`** — so the retry loop
never runs, the promise rejects, the rejection is swallowed as an unhandled
rejection, and `createWindow()` is never called. The process sits in Task
Manager with no window. Users can check with:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

**Suggested fix (highest code-fix priority):**
1. Add `.catch` to the whenReady chain that shows a `dialog.showErrorBox`
   instead of dying silently.
2. Treat `EACCES` like `EADDRINUSE` in the retry loop, and after 8090 fall
   back to `server.listen(0)` (random free port) — the port is already
   propagated via `staticServerPort`, nothing hardcodes 8080.
3. Consider creating the window before the static server (the server only
   feeds FFmpeg WASM later).

### B2. Stale single-instance lock / zombie process

[main.ts:679-704](../../../electron/main.ts): if `requestSingleInstanceLock()`
fails the new process calls `app.quit()` **silently**. Normally the running
instance gets a `second-instance` event and focuses itself — but if a previous
QCut process is hung (e.g. stuck in the B1 state above, or a leftover
headless/recorder-adjacent process), it holds the lock, has no window to
focus, and every new double-click exits instantly with no visible effect.
Remedy for users: kill `QCut AI Video Editor.exe` in Task Manager.
Code hardening: when the lock is lost, log it; in the `second-instance`
handler, recreate the window when `mainWindow` is null instead of doing
nothing.

### B3. GPU process crash loop (no fallback configured)

There is **no** `--disable-gpu` fallback, no `child-process-gone` /
`render-process-gone` handler anywhere in `electron/` (verified by grep). On
machines with broken GPU drivers (common on older Intel iGPUs / remote
desktop), Chromium's GPU process can crash-loop, leaving either no window or a
frozen black window. Diagnosis: launch with
`"QCut AI Video Editor.exe" --disable-gpu`; if that works, it's this.
Code hardening: listen for `app.on("child-process-gone")` with
`type === "GPU"` and relaunch with `app.disableHardwareAcceleration()`.

## Stage C — window opens but stays white/blank

### C1. `NODE_ENV=development` leakage in packaged builds (concrete bug)

[main.ts:605-613](../../../electron/main.ts):

```ts
const isDev = process.env.NODE_ENV === "development";
if (isDev) {
    mainWindow.loadURL("http://localhost:5173");   // dev server — not running on user machines
} else {
    mainWindow.loadURL("app://./index.html");
}
```

The decision is based on the **inherited environment**, not on
`app.isPackaged`. A user machine with `NODE_ENV=development` set globally
(developers, machines with certain dev tooling installed) makes the packaged
app try to load `http://localhost:5173`, which refuses the connection → the
window opens permanently blank. There is no `did-fail-load` handler, so the
failure is silent.

**Suggested fix (one line):** `const isDev = !app.isPackaged &&
process.env.NODE_ENV === "development";` — and add a `did-fail-load` listener
that logs and shows an error page.

### C2. Renderer assets or preload missing/stripped

Packaged renderer files are served from inside the asar via the `app://`
protocol ([app-protocol-handler.ts:28](../../../electron/app-protocol-handler.ts)
maps to `app.getAppPath()/apps/web/dist`), and the preload is
`dist/electron/preload.js` ([main.ts:575](../../../electron/main.ts)). If a
build ships incomplete, or AV strips files from the install dir, `index.html`
or the preload 404s → white screen (renderer never boots, or boots without
`window.electronAPI` and crashes early). No `did-fail-load` handler exists to
surface this. Mitigation: the same `did-fail-load` logging as C1; release
builds already verify ffmpeg/aicp presence (`verify:packaged-*`) — a similar
post-package check could assert `apps/web/dist/index.html` exists in the asar.

### C3. Corrupted Chromium profile in `%APPDATA%`

User data lives in `%APPDATA%\QCut AI Video Editor` (electron-log writes
`logs\main.log` there too). A corrupted GPU cache / IndexedDB (project storage
uses IndexedDB as a fallback tier) can white-screen the renderer at boot.
User remedy: rename the folder and relaunch. Worth documenting in a user-facing
FAQ before shipping any code changes.

## Triage guide (what to ask an affected user)

| Step | Command / action | What it tells you |
|------|------------------|-------------------|
| 1 | Screenshot of what happens after double-click | SmartScreen (A1) vs nothing (B) vs white window (C) |
| 2 | Task Manager → is `QCut AI Video Editor.exe` running? | B1/B3 (running, no window) vs A (not running) |
| 3 | Send `%APPDATA%\QCut AI Video Editor\logs\main.log` | static-server / handler errors land here |
| 4 | Run from terminal with `--enable-logging` | renderer/network errors visible |
| 5 | `netsh interface ipv4 show excludedportrange protocol=tcp` | B1 (8080-8090 inside an excluded range) |
| 6 | Try `--disable-gpu` | B3 confirmation |
| 7 | `echo %NODE_ENV%` | C1 confirmation |
| 8 | Rename `%APPDATA%\QCut AI Video Editor`, relaunch | C3 confirmation |
| 9 | AV quarantine history | A2 confirmation |

## Proposed fix priority

1. **B1** — `.catch` + error dialog on the whenReady chain; `EACCES` retry +
   `listen(0)` fallback. Small, removes an entire silent-failure class.
2. **C1** — gate dev-server load on `!app.isPackaged`. One line.
3. **C1/C2** — add `did-fail-load` + `render-process-gone` logging with an
   error page. Makes every renderer failure diagnosable from `main.log`.
4. **B2** — focus/recreate window on `second-instance` when `mainWindow` is
   null; log lock loss.
5. **B3** — GPU crash fallback to software rendering.
6. **A1** — code signing (tracked separately in
   [windows-code-signing](../windows-code-signing/), blocked on certificate
   purchase).

## Status

- [x] Launch-path audit of `electron/main.ts` / `app-protocol-handler.ts`
- [ ] Reproduce B1 on a Windows VM with an excluded-port range covering 8080-8090
- [ ] Implement fixes 1-3 (single PR)
- [ ] Implement fixes 4-5
- [ ] User-facing FAQ entry (SmartScreen, AV, profile reset)
