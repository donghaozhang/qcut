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
  `editor:project:create --new-name <name> --json`, list projects again, and open
  the returned project ID.
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

Use the pointer commands when a visible UI interaction is required and no
semantic editor command covers it. Capture a fresh interactive snapshot first;
`@ref` values belong to the latest editor snapshot and should not be reused
after substantial UI changes.

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
Use coordinates only when a snapshot ref cannot represent the target, and keep
them inside the current editor viewport. Click, double-click, right-click, and
drag are confirmation-tier actions; use `--force` only after the requested
action and target are clear.

## Editing rules

- Prefer setup and `editor:*` CLI commands for installation checks, launch,
  navigation, project state, media, timeline, and export. Use UI snapshot
  controls and the visible pointer only when no semantic command exists.
- Prefer `editor:timeline:split`, `move`, `trim`, and dedicated sticker or
  export commands over raw JSON patches.
- Before using `add-element` or `update-element`, export the timeline and reuse
  the exact schema already present in that project. Do not invent element
  fields.
- Effects, transitions, filters, text, audio properties, and playback speed do
  not yet all have dedicated semantic CLI commands. Use verified timeline
  schemas or accessibility snapshot controls, and say when a requested edit is
  not safely exposed.
- Use transaction or undo support for multi-step edits when available.
- Never delete a project, media item, track, or timeline element without user
  confirmation.
- Never use `--force` to bypass QCut's action policy unless the user explicitly
  approved that exact operation.

## Verification

After edits, export timeline state again and compare the affected element. For
visual changes, capture a QCut screenshot. For final delivery, wait for the
export job to complete and verify the output file exists and is non-empty.
