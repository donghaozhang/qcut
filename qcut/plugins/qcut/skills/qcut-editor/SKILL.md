---
name: qcut-editor
description: Control a running QCut desktop editor from Codex. Use to open projects, inspect or modify media and timeline state, play or seek, transcribe footage, add stickers, run AI generation, capture screenshots, diagnose errors, and export finished video.
---

# QCut Editor Control

Use QCut's `editor:*` commands through the plugin runner. Resolve
`<plugin-root>` as the directory two levels above this `SKILL.md` file.

## First-use setup

Always inspect the machine before the first editor operation in a task:

```bash
node <plugin-root>/scripts/qcut-setup.mjs status
```

If `app.installed` is false:

1. Show the user `latest.version`, `latest.asset.name`, size, and the clickable
   `latest.asset.url`. Use `latest.pageUrl` only when no compatible asset exists.
2. Confirm before opening or downloading the installer.
3. After confirmation, open only the verified official URL:

```bash
node <plugin-root>/scripts/qcut-setup.mjs open-download --confirm
```

4. Let the user complete the operating-system installer. Never use a third-party
   mirror, bypass Gatekeeper or SmartScreen, or silently execute a downloaded
   installer.
5. Rerun `status` and require `app.installed: true` before editor automation.

An available update does not block editing. Report it and install it only when
the user asks or the installed build lacks a required command. See
[installing-qcut.md](references/installing-qcut.md) for platform steps.

If `nextAction` is `configure-cli`, QCut is present but its packaged CLI cannot
be resolved. Use an existing `qcut`/`qcut-pipeline` on `PATH` or ask the user to
set `QCUT_CLI_PATH`; do not fall back to blind UI automation.

## Open the Media page

Use the setup helper instead of clicking through the Agent or landing page:

```bash
node <plugin-root>/scripts/qcut-setup.mjs open-media --project-id <project-id>
```

The command activates QCut, opens the project, enters the editor shell, switches
to Media, and verifies both the active project and panel from editor state.

- For `qcut:project_selection_required`, show the returned project names and ask
  the user which one to open. Then rerun with its ID.
- For `qcut:project_creation_required`, ask for a project name, create it with
  `editor:project:create --name <name> --open --wait-ready --json`, then use the
  returned project ID.
- Do not choose arbitrarily when multiple projects exist.

For E2E verification, capture a screenshot only after `verified: true`:

```bash
node <plugin-root>/scripts/qcut-runner.mjs editor:screenshot:capture --json
```

## Connect

Confirm both the CLI and desktop editor are available:

```bash
node <plugin-root>/scripts/qcut-runner.mjs doctor --require-editor
```

If the editor is unavailable but QCut is installed, launch it with
`qcut-setup.mjs launch` and retry. Do not start a different local web
application and treat it as QCut.

When more than one QCut build is running, select the target once instead of
retrying the default port:

```bash
qcut instances list --json
qcut instances use --port 8878 --json
```

The selection persists for later commands and named sessions. An explicit
`--port` still overrides it.

## State-first workflow

1. Use `qcut-setup.mjs open-media` to enter the requested project.
2. Export project and timeline state before changing anything.
3. Use dedicated commands where available.
4. Verify state after every mutation.
5. Use screenshot or accessibility snapshots for user-visible confirmation.

```bash
node <plugin-root>/scripts/qcut-runner.mjs editor:navigator:projects --json
node <plugin-root>/scripts/qcut-runner.mjs editor:navigator:open --project-id <id> --json
node <plugin-root>/scripts/qcut-runner.mjs editor:project:info --project-id <id> --json
node <plugin-root>/scripts/qcut-runner.mjs editor:timeline:export --project-id <id> --json
```

See [editor-workflows.md](references/editor-workflows.md) for editing and export
sequences.

## Visible Agent pointer

Use stable semantic targets before taking a snapshot. They avoid stale refs and
viewport-specific coordinates:

```bash
qcut editor pointer wait-for --target panel.text --json
qcut editor pointer click --target panel.text --json
qcut editor pointer hover --target export.button --speed 1.5 --json
qcut editor pointer drag --from timeline.playhead --to-time 12 --speed 1.5 --json
```

Known targets include `panel.media`, `panel.audio`, `panel.text`,
`panel.stickers`, `panel.effects`, `panel.transitions`, `panel.captions`,
`panel.filters`, `panel.adjustments`, `panel.templates`, `export.button`,
`export.start`, `timeline.playhead`, `timeline.toolbar`, `timeline.zoom-in`,
`timeline.zoom-out`, `timeline.play`, `timeline.pause`, `preview.canvas`, and
`media.import`. Use
`testid:<data-testid>` for an explicit app test ID.

Before recording or capturing a visual result, wait for a frame rather than
only waiting for the project API:

```bash
qcut editor pointer wait-for --target preview.frame-ready --timeout-ms 15000 --json
```

`preview.frame-ready` verifies editor initialization, the active project,
native-composition loading state, active video identity, media-ready state,
dimensions, and at least one frame presented by the video element. It does not
use a black-pixel heuristic because black footage is valid.

Panel navigation clicks and semantic playhead seeks are low risk under the
default action policy. Raw clicks and real drags remain confirmation-tier
actions.

When no semantic target exists, capture a fresh interactive snapshot first;
`@ref` values belong to the latest snapshot and should not be reused after
substantial UI changes.

```bash
node <plugin-root>/scripts/qcut-runner.mjs editor:snapshot --interactive --depth 24 --json
node <plugin-root>/scripts/qcut-runner.mjs editor:pointer:move --ref @e12 --json
node <plugin-root>/scripts/qcut-runner.mjs editor:pointer:hover --ref @e12 --json
node <plugin-root>/scripts/qcut-runner.mjs editor:pointer:click --ref @e12 --force --json
node <plugin-root>/scripts/qcut-runner.mjs editor:pointer:drag --from-ref @e12 --to-ref @e27 --force --json
node <plugin-root>/scripts/qcut-runner.mjs editor:pointer:scroll --ref @e27 --delta-y 400 --json
node <plugin-root>/scripts/qcut-runner.mjs editor:pointer:hide --json
```

Pointer actions use background input by default. QCut can remain visible while
another application keeps keyboard focus, so the user can watch the Agent
cursor without losing control of their active window. Successful results report
`inputMode: "background"`, `input: "cdp-dispatch-mouse-event"`, and whether the
QCut window was focused when the action completed.

Use `--foreground` only when the user explicitly wants QCut activated or a
control requires Electron's native `sendInputEvent()` path:

```bash
node <plugin-root>/scripts/qcut-runner.mjs editor:pointer:click --ref @e12 --foreground --force --json
```

Background mode fails without focusing QCut when DevTools or another debugger
already owns the renderer's CDP connection. Close that debugger or explicitly
retry with `--foreground`; never silently change modes. The desktop app displays
the Agent cursor, operation status, click ripple, and drag trail in either mode.
The CLI also requires the running editor to advertise `state.pointer` version
`1.1.0` or newer for background actions. This safety check remains active with
`--no-capability-check`. Update a build that does not advertise `state.pointer`;
an editor advertising version `1.0.0` may use `--foreground` after confirming
that focus may move.
Use coordinates only when a snapshot ref cannot represent the target, and keep
them inside the current editor viewport. Click, double-click, right-click, and
drag are confirmation-tier actions; use `--force` only after the requested
action and target are clear.

## Adjust a video speed curve

Prefer exported timeline state for inspection and verification. QCut supports
None, Custom, Montage, Hero moment, Bullet time, Jump cut, Flash in, and Flash
out in the selected video clip's Speed panel. Rates are clamped from `0.1x` to
`10x`; curve edits update `speedKeyframes` and the exported
`timelineDuration`. The exported `duration` remains the trimmed source duration.

When the user wants to watch the edit, keep their current app focused and use
the background Agent pointer:

1. Export the timeline and record the selected element's `duration`,
   `timelineDuration`, and `speedKeyframes`.
2. Capture an interactive snapshot and resolve the Speed tab.
3. Click Speed, then Curve speed, then the requested preset by fresh snapshot
   refs.
4. Capture another snapshot and drag one interior curve handle only when the
   user asked for a custom adjustment.
5. Export the timeline again and verify source `duration` is unchanged, then
   compare keyframe count, changed frame or rate, and resulting
   `timelineDuration`.
6. Capture a screenshot with the curve and selected preset visible.

For repeatable automation without a visible demonstration, export the selected
element schema and use `editor:timeline:update-element` with only a verified
`speedKeyframes` field. Never invent keyframe fields; preserve IDs and easing
values from QCut's exported schema. Verify `timelineDuration` after the update.

## Record a repeatable demo

Use a plan to prepare the project and timeline, run semantic pointer actions,
record the window, export the result, and verify frames and audio:

```bash
qcut editor demo run \
  --plan promo.json \
  --record demo.mp4 \
  --speed 1.5 \
  --skip-idle \
  --json
```

Prefer a version 2 plan for repeatable recording:

```json
{
  "version": 2,
  "projectId": "<project-id>",
  "timeline": "@timeline.json",
  "capture": {
    "actions": "@actions.json",
    "record": "demo.mp4",
    "prewarm": true,
    "startTime": 0,
    "prerollMs": 700,
    "postrollMs": 700,
    "durationToleranceMs": 250,
    "verifyDuration": true,
    "verifyResolution": true,
    "minimumWidth": 1920,
    "minimumHeight": 1080
  },
  "export": {
    "outputPath": "promo-final.mp4",
    "verifyFrames": [1, 5],
    "requireAudio": true
  }
}
```

Relative `@timeline` and `@actions` references resolve from the plan file.
Before capture, QCut preloads every referenced panel, restores the opening
panel, hides the Agent pointer, seeks to `startTime`, and waits for a newly
presented preview frame. Recording start returns only after the first non-empty
video chunk is persisted. The runner adds pre-roll and post-roll, writes a
version 2 pointer event track aligned to the MediaRecorder start, probes the
final file duration with ffprobe, and fails if the tail is shorter than the
capture lifecycle beyond `durationToleranceMs`.

Demo capture uses a resolution-aware bitrate profile: 14 Mbps at 1080p,
24 Mbps at 1440p, and 40 Mbps at 4K before constant-quality MP4 conversion.
Resolution verification defaults to 1920x1080 for version 2 demo recordings,
so a low-resolution window capture fails explicitly instead of producing an
upscaled file with little real detail. Lower the minimum only when the user
explicitly accepts a lower-resolution deliverable.

Top-level `actions` and `record` remain supported for older plans. Pass
`--event-track` to choose the sidecar path, or let the runner place it beside
the recording.

## Editing rules

- Prefer setup and `editor:*` CLI commands for installation checks, launch,
  navigation, project state, media, timeline, and export. Use UI snapshot
  controls and the visible pointer only when no semantic command exists.
- Prefer `editor:timeline:split`, `move`, `trim`, and dedicated sticker or
  export commands over raw JSON patches.
- `editor:timeline:apply` opens the target project and waits for its media and
  timeline services before applying an atomic manifest.
- Before using `add-element` or `update-element`, export the timeline and reuse
  the exact schema already present in that project. Do not invent element
  fields.
- Effects, transitions, filters, text, audio properties, and playback speed do
  not yet all have dedicated semantic CLI commands. Curve speed is exposed
  through verified timeline schemas and accessibility snapshot controls. Say
  when another requested edit is not safely exposed.
- Use transaction or undo support for multi-step edits when available.
- Never delete a project, media item, track, or timeline element without user
  confirmation.
- Never use `--force` to bypass QCut's action policy unless the user explicitly
  approved that exact operation.

## Verification

After edits, export timeline state again and compare the affected element. For
visual changes, capture a QCut screenshot. For final delivery, wait for the
export job to complete and verify the output file exists and is non-empty.
