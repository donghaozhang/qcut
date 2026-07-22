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
