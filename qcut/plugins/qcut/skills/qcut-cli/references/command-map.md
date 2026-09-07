# QCut CLI Command Map

## Command groups

| Group | Use it for | Examples |
| --- | --- | --- |
| `gen` | Images, videos, speech, music, voice conversion and cloning, avatars, Remotion | `gen image`, `gen video`, `gen tts`, `gen music` |
| `analyze` | Transcription, media analysis and review, scene indexing, translation, consistency checks, queries | `analyze transcribe`, `analyze video`, `analyze index` |
| `edit` | AutoClip, upscale, motion transfer, cutout, portrait presets, subtitles, audio cleanup, deflicker, sticker and sound search, edit planning | `edit autoclip`, `edit upscale-video`, `edit portrait-filter` |
| `compose` | Snapshot, plan, validate, apply, render, and package multi-resource edits from a manifest | `compose validate`, `compose render`, `compose project` |
| `filter-lab` | Browse, render, stack, and verify locally cached filters; `render-independent` uses QCut's own Metal renderer | `filter-lab catalog-independent`, `filter-lab render` |
| `effect-lab`, `text-lab`, `sticker-lab`, `transition` | Local labs for cached video effects, flower text and text animations, sticker references, and Jianying-runtime transitions | `effect-lab search`, `text-lab render`, `transition doctor` |
| `draft` | Guarded Jianying Professional draft inspect, import, verify, and export | `draft inspect`, `draft import` |
| `flow` | YAML and ViMax production workflows | `flow run`, `flow script2video` |
| `instances` | List running QCut editors and pick the CLI target | `instances list`, `instances use --port <port>` |
| `system` | Update, models, auth status, keys, setup, project utilities, diagnostics | `system update --check`, `system models`, `system doctor` |
| `editor` | Control a running editor (`editor <area> <action>`); use the qcut-editor skill | `editor timeline export`, `editor track list` |

Labs and `draft` commands read caches or drafts that already exist on the
user's machine. `editor`, `compose snapshot/apply`, and `draft import/export`
need the desktop app running; everything else works without it.

Use structured help at every level:

```bash
qcut --help --json
qcut gen image --help --json
qcut gen image --help model --json
```

## Reliable workflows

### Transcribe, then AutoClip

```bash
qcut analyze transcribe -i input.mp4 --srt --json
qcut edit autoclip -i input.mp4 -s input.srt --dry-run --json
qcut edit autoclip -i input.mp4 -s input.srt --json
```

Review the dry-run selection before cutting.

### Generate an image with an explicit frame shape

```bash
qcut gen image -t "..." --ratio 1:1 --json
qcut gen image -t "..." --ratio 9:16 --json
qcut gen image -t "..." --ratio 16:9 --json
qcut gen image -t "..." --width 2000 --height 1152 --json
```

Do not pass a model unless the user requests one or the default is unsupported.

### Discover capabilities before generation

```bash
qcut system doctor --json
qcut system models --json
qcut gen video --help --json
```

### Render a compose manifest without opening the editor

```bash
qcut compose validate --config edit.qcut-compose.json --json
qcut compose render --config edit.qcut-compose.json --output final.mp4 --dry-run --json
qcut compose render --config edit.qcut-compose.json --output final.mp4 --json
```

Validate first; the dry run reports which filter cards, stickers, and sounds
resolved locally before anything is rendered.

### Output handling

Use an explicit output directory when the user cares where files land. Verify
the output file rather than treating a successful job response as proof that a
download completed.
