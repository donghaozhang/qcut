# QCut Editor CLI — Tracks, Elements, Stickers, Search, and Input Helpers

Editor commands that were added after the original editor reference files.
All of them need a running QCut editor and accept `--project-id` (defaulting
to the active project where noted). Use either spelling:

```bash
qcut editor track list --project-id <id> --json      # group syntax
qcut editor:track:list --project-id <id> --json      # legacy colon form
```

Confirm flags with `qcut editor <area> <action> --help --json`.

## Tracks

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor track list` | — | `--project-id` | List timeline tracks in visual order |
| `editor track create` | `--type` | `--project-id`, `--name`, `--index` | Create a track (`media`, `text`, `audio`, `sticker`, …) |
| `editor track update` | `--track-id` | `--project-id`, `--name`, `--index` | Rename or move a track |
| `editor track move` | `--track-id --index` | `--project-id` | Move a track to an exact visual index |
| `editor track delete` | `--track-id` | `--project-id`, `--force`, `--ripple` | Delete a track; `--force` for non-empty tracks |

```bash
qcut editor track list --project-id <id> --json
qcut editor track create --type text --name "Captions" --project-id <id> --json
qcut editor track delete --track-id <track-id> --force --project-id <id> --json
```

## Element patch and timeline manifests

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor element patch` | `--element-id --set` | `--project-id` | Patch any timeline element fields (`--set '{"opacity":0.5}'` or `--set @patch.json`) |
| `editor timeline apply` | `--manifest` | `--project-id`, `--replace`, `--atomic`, `--verify` | Apply a complete timeline manifest atomically |

```bash
qcut editor element patch --element-id <id> --set '{"name":"Intro"}' --project-id <id> --json
qcut editor timeline apply --manifest @timeline.json --replace --atomic --verify --project-id <id> --json
```

`timeline apply --replace` overwrites the whole timeline. Export the current
timeline first (`editor timeline export`) so the change can be reverted.

## Stickers

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor sticker search` | `--query` | `--collection`, `--limit` | Search the Iconify sticker catalog |
| `editor sticker add` | `--project-id --end-time` | `--sticker-id`, `--provider`, `--batch-id`, `--root`, `--source`, `--x`, `--y`, `--start-time`, `--width`, `--height`, `--rotation`, `--opacity` | Add a sticker at a position and time |
| `editor sticker update` | `--project-id --element-id` | `--source`, `--sticker-id`, `--x`, `--y`, `--start-time`, `--end-time`, `--width`, `--height`, `--rotation`, `--opacity` | Update position, size, time, or image |
| `editor sticker remove` | `--project-id --element-id` | — | Remove a sticker |
| `editor sticker list` | `--project-id` | — | List all stickers on the timeline |

```bash
qcut editor sticker search --query detective --limit 12 --json
qcut editor sticker add --project-id <id> --sticker-id fluent-emoji:fire --x 860 --y 440 --start-time 2 --end-time 5 --width 200 --json
qcut editor sticker list --project-id <id> --json
```

`--sticker-id` takes an Iconify id such as `fluent-emoji:fire`. `--source`
takes a local image path. Sticker Lab references use `--provider`,
`--batch-id`, and `--root` (see
[reference-labs-compose.md](../references/reference-labs-compose.md#sticker-lab--private-sticker-reference-batches)).
The standalone `edit sticker-overlay` command renders stickers into a video
file without an editor.

## Transcript search

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor search query` | `--project-id --query` | `--case-sensitive`, `--whole-word`, `--max-results`, `--media-id` | Search transcriptions by text |
| `editor search status` | `--project-id` | — | List transcription status for all media in a project |
| `editor search index` | `--project-id` | `--media-id` | Trigger transcription for untranscribed media |

```bash
qcut editor search status --project-id <id> --json
qcut editor search index --project-id <id> --json
qcut editor search query --project-id <id> --query "hello world" --json
```

## Audio and caption export

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor export audio` | `--project-id` | `--poll`, `--filename`, `--bitrate`, `--sample-rate` | Export the timeline audio mix as MP3 |
| `editor export captions` | `--project-id` | `--filename`, `--format` | Export timeline captions as a sidecar file |

Video export is `editor export start`; see
[editor-output.md](editor-output.md).

## Project and transition helpers

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor project reveal` | — | `--project-id` | Reveal the project folder in the OS file manager |
| `editor transition-lab list` | — | — | List distributable QCut shader transition recipes |
| `editor transition-lab apply` | `--preset --track-id --from-element-id --to-element-id` | `--project-id`, `--duration` | Apply a recipe between adjacent clips |
| `editor analyze beats` | `--project-id --media-id` | `--threshold` | Detect audio beats and BPM |

## Script Director (Moyin) and novel parsing

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor moyin set-script` | — | `--text`, `--script` | Push script text to the director panel |
| `editor moyin parse` | — | `--model` | Trigger the Parse Script button |
| `editor moyin status` | — | — | Get pipeline progress |
| `editor moyin export` | — | `--output` | Export Script Director data as JSON |
| `editor moyin generate` | — | `--idea`, `--genre`, `--target-duration` | Generate a script from an idea |
| `editor novel parse` | `--input` | `--output`, `--language`, `--max-clips` | Parse novel text into a structured screenplay |

The standalone `moyin:parse-script` command parses a screenplay file without an
editor.

## Demo runs, keyboard, and UI waits

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor demo run` | `--plan` | `--record`, `--recording-quality`, `--event-track`, `--preroll-ms`, `--postroll-ms`, `--speed`, `--skip-idle`, `--project-id`, `--timeout-ms` | Prepare, record, export, and verify an editor demo from one plan |
| `editor keyboard press` | `--keys` | `--interval-ms`, `--foreground` | Press a comma-separated key or shortcut sequence |
| `editor keyboard type` | `--text` | `--interval-ms`, `--foreground` | Type text into the focused editor control |
| `editor ui wait` | — | `--ref`, `--text`, `--value`, `--timeout-ms`, `--interval-ms` | Wait until visible UI state matches a ref, text, or value |
| `editor ui context-menu` | `--element-id` | `--verbose` | Dispatch a right-click context menu on a timeline element (debug) |
| `editor screen-recording diagnose` | — | — | Diagnose recording permission and capture sources |

```bash
qcut editor demo run --plan promo.json --record demo.mp4 --speed 1.5 --skip-idle --json
qcut editor keyboard press --keys "cmd+s" --json
qcut editor ui wait --text "Auto-saved" --timeout-ms 5000 --json
```

## Pointer automation

Pointer commands drive a visible Agent pointer with real Electron input events.
Targets come from accessibility snapshots (`editor snapshot`, see
[editor-agent.md](editor-agent.md)) as `--ref @e12`, from semantic
`--target` names, or from `--x/--y` and `--normalized-x/--normalized-y`
coordinates. Clicks and drags are policy-gated; pass `--force` to bypass the
confirmation when the action policy allows it.

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor pointer move` | — | `--target`, `--ref`, `--x`, `--y`, `--wait-for`, `--speed`, `--foreground` | Move the pointer without activating QCut |
| `editor pointer hover` | — | same as `move` | Move and settle long enough to trigger hover UI |
| `editor pointer click` | — | same as `move` | Click with real mouseDown and mouseUp events |
| `editor pointer double-click` | — | same as `move` | Double-click |
| `editor pointer right-click` | — | same as `move` | Open a context menu with a real right-click |
| `editor pointer drag` | — | `--from-ref/--to-ref`, `--from-x/--from-y/--to-x/--to-y`, `--to-time`, `--to-index`, `--via`, `--hold-ms`, `--duration-ms`, `--steps`, `--verify`, `--dnd auto\|html5\|mouse` | Drag between refs or coordinates; HTML5 drag sources are intercepted and dropped |
| `editor pointer scroll` | — | `--delta-x`, `--delta-y`, plus targeting flags | Scroll at the pointer, a ref, or a coordinate |
| `editor pointer wait-for` | — | `--target`, `--text`, `--timeout-ms`, `--interval-ms` | Wait for a semantic target or visible text |
| `editor pointer hide` | — | — | Hide the Agent pointer overlay |
| `editor pointer sequence` | `--actions` | `--record`, `--recording-quality`, `--event-track`, `--speed`, `--skip-idle`, `--foreground` | Run pointer, keyboard, wait, and snapshot actions from one JSON file |

```bash
qcut editor snapshot --interactive --json
qcut editor pointer click --ref @e12 --force --json
qcut editor pointer drag --from-ref @e12 --to-ref @e27 --force --json
qcut editor pointer drag --from testid:media-item --to testid:timeline-track --dnd html5 --force --json
qcut editor pointer sequence --actions @demo-actions.json --record demo.mp4 --json
```

### HTML5 drag-and-drop

Media, text, effect, transition, and sound panel items are HTML5 drag sources,
and the timeline tracks only accept drops through `dataTransfer`. A plain
mouse drag cannot place them. In background mode `pointer drag` enables CDP
drag interception before pressing: when the page starts a drag, the pointer
captures its payload and replays it as `dragEnter` → `dragOver` → `drop` at
the destination, then releases the button.

- `--dnd auto` (default): intercept when the page starts a drag, otherwise
  finish as a mouse drag. Timeline clips still move with mouse events.
- `--dnd html5`: require an intercepted drag; fails with 409 when the source
  is not draggable. Needs `state.pointer` 1.2.0 and background input.
- `--dnd mouse`: never intercept (the pre-1.2.0 behavior).

The result carries `dnd: { mode, intercepted, backend, mimeTypes, fileCount,
dragOperationsMask }`; `mimeTypes` lists what the page put in the drag, for
example `application/x-media-item`. Verify the timeline afterwards with
`editor timeline export`, since a completed drop is not proof of the intended
edit.
