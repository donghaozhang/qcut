# QCut Editor Workflows

All examples assume QCut is running. Add `--json` to every command.

## Discover and open a project

```bash
qcut editor:navigator:projects --json
node <plugin-root>/scripts/qcut-setup.mjs open-media --project-id <project-id>
qcut editor:media:list --project-id <project-id> --json
qcut editor:timeline:export --project-id <project-id> --json
```

`open-media` verifies `editor.activePanel.group` and the active project ID. Do
not treat navigation response codes alone as proof that the visible editor is
ready.

## Import media and place it on the timeline

```bash
qcut editor:media:import --project-id <project-id> --source /absolute/input.mp4 --json
qcut editor:media:list --project-id <project-id> --json
qcut editor:timeline:add-clip --project-id <project-id> --media-id <media-id> --json
qcut editor:timeline:export --project-id <project-id> --json
```

## Split and trim

```bash
qcut editor:timeline:split --project-id <project-id> --element-id <element-id> --split-time 10 --json
qcut editor:timeline:trim --project-id <project-id> --element-id <element-id> --start-time 2 --end-time 8 --json
qcut editor:timeline:export --project-id <project-id> --json
```

## Inspect before a raw element update

```bash
qcut editor:timeline:export --project-id <project-id> --json
qcut editor:timeline:update-element --project-id <project-id> --element-id <element-id> --data @verified-changes.json --json
qcut editor:timeline:export --project-id <project-id> --json
```

Only include fields confirmed by the exported element schema.

## Export

```bash
qcut editor:export:recommend --project-id <project-id> --target youtube --json
qcut editor:export:start --project-id <project-id> --preset youtube --poll --json
```

Verify the completed job's output path on disk.

## Diagnose a failed command

```bash
qcut editor:health --json
qcut editor:errors --since 30s --json
qcut editor:console --level error --since 30s --json
```

Do not clear diagnostics until the failure is understood.

## Operate a visible UI control

Capture a fresh snapshot whenever navigation or a previous click may have
changed the visible DOM. Prefer refs to coordinates because refs resolve to the
visible center of the current element.

```bash
qcut editor:snapshot --interactive --depth 24 --json
qcut editor:pointer:hover --ref @e12 --json
qcut editor:pointer:click --ref @e12 --force --json
qcut editor:snapshot --interactive --depth 24 --json
```

Additional real-input actions:

```bash
qcut editor:pointer:double-click --ref @e12 --force --json
qcut editor:pointer:right-click --ref @e12 --force --json
qcut editor:pointer:drag --from-ref @e12 --to-ref @e27 --force --json
qcut editor:pointer:drag --from-x 400 --from-y 700 --to-x 700 --to-y 700 --force --json
qcut editor:pointer:scroll --delta-y 400 --json
qcut editor:pointer:hide --json
```

These actions use the non-activating background input mode by default. Verify
`inputMode`, `input`, and `windowFocused` in each result when preserving the
user's active application matters. Add `--foreground` only for an intentional
foreground action:

```bash
qcut editor:pointer:click --ref @e12 --foreground --force --json
```

Background mode does not fall back to foreground input. If DevTools or another
debugger is attached, close it or explicitly choose `--foreground` after
confirming that focus can move to QCut.

Background actions require the running editor to advertise `state.pointer`
version `1.1.0` or newer. The CLI enforces this even with
`--no-capability-check`. Update a build that does not advertise the capability;
an editor advertising version `1.0.0` may intentionally use `--foreground`
after confirming the focus change is acceptable.

After click or drag, verify the resulting editor or timeline state rather than
treating a successful input event as proof of the intended edit. Use
`editor:undo` to restore an E2E drag fixture after verification.
