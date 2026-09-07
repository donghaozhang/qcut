# Compose, Labs, Transitions, and Jianying Draft Interop

Flag-level reference for the command groups added to the CLI after the
original skill was written: `compose`, `filter-lab`, `effect-lab`, `text-lab`,
`sticker-lab`, `transition`, and `draft`, plus the related `editor` commands.

Read `qcut <group> --help --json` and `qcut <group> <action> --help --json`
before running anything here; the tables below list required flags and the
most useful options, not every flag.

## What each group needs

| Group | Needs a running QCut editor | Needs local caches | Platform notes |
| --- | --- | --- | --- |
| `compose snapshot / apply / project --target editor` | Yes | No | — |
| `compose plan / validate / render / project` (bundle) | No | Filter Lab cards, stickers, sounds referenced by the manifest | — |
| `filter-lab` | No | Locally cached Jianying filter metadata and LUTs | `render-independent` is macOS only, up to 1080p |
| `effect-lab` | No | Local Effect Lab runtime, bridge, and cache | Run `effect-lab doctor` first |
| `text-lab` | No | QCut's private flower-text cache and native text runtime | — |
| `sticker-lab` | No | Private local sticker reference batches (`--root` or `QCUT_STICKER_LAB_ROOT`) | — |
| `transition` | No | Local Jianying Professional app and QCut bridge | Run `transition doctor` first |
| `draft inspect / plan / verify-roundtrip` | No | A local Jianying Professional draft folder | Read-only |
| `draft import / commit / export`, `editor interop *` | Yes | Same draft folder | Writes are gated, see below |
| `edit deflicker` | No | Verified offline Jianying runtime cache | — |

Private caches, Jianying binaries, LUTs, textures, and reference batches are
never committed to the repository and are never uploaded by these commands.

## `compose` — timeline composition

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `compose snapshot` | — | `--project-id`, `--analysis-type`, `--output` | Capture a ComposeSnapshot of the running editor's active timeline |
| `compose plan` | — | `--snapshot`, `--job-id`, `--intent`, `--provider`, `--output` | Plan a ComposePatch from a snapshot with a local or cloud provider |
| `compose validate` | — | `--config` (manifest mode) or `--snapshot --patch` (patch mode), `--output` | Resolve local resources for a manifest, or check a patch against its snapshot |
| `compose apply` | `--snapshot --patch` | `--project-id` | Validate a ComposePatch and apply it to the running editor atomically |
| `compose render` | — | `--config`, `--output`, `--dry-run`, `--force`, `--snapshot --patch`, `--target`, `--verify-frames` | Render a multi-clip edit with Filter Lab cards, crossfades, stickers, and sound effects |
| `compose project` | `--config` | `--project-dir`, `--target editor`, `--name`, `--project-id`, `--force`, `--no-verify` | Package a portable compose bundle, or build an editable QCut project through the running editor |

Patch workflow against the running editor:

```bash
qcut compose snapshot --output snapshot.json --json
qcut compose plan --snapshot snapshot.json --provider local --output patch.json --json
qcut compose validate --snapshot snapshot.json --patch patch.json --json
qcut compose apply --snapshot snapshot.json --patch patch.json --json
```

Manifest workflow without an editor:

```bash
qcut compose validate --config edit.qcut-compose.json --json
qcut compose render --config edit.qcut-compose.json --output final.mp4 --json
qcut compose project --config edit.qcut-compose.json --project-dir ./qcut-compose-project --json
```

`compose project --target editor` creates or opens a project in the running
editor, applies the manifest, and re-opens the project to verify what was
persisted. Element `duration` in a manifest is the source duration; the visible
length is `duration - trimStart - trimEnd`.

## `filter-lab` — cached filters and parity

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `filter-lab list` | — | — | List locally cached Jianying LUTs with titles and panel categories when available |
| `filter-lab catalog` | — | `--sample`, `--seed`, `--stratify` | Dump every filter card the local metadata caches know about, with capability tags and verification status |
| `filter-lab render` (alias `apply`) | `--resource-id --input` | `--output`, `--filter-version`, `--filter-intensity`, `--duration`, `--fps`, `--dry-run`, `--force` | Apply a Filter Lab card to an image or video with the editor's LUT, native portrait, or multi-pass renderer |
| `filter-lab catalog-independent` | — | — | List cached filters supported by QCut's own Metal renderer |
| `filter-lab render-independent` | `--resource-id --input --output` | `--filter-version`, `--filter-intensity`, `--duration`, `--fps`, `--dry-run`, `--force` | Render supported LUTs and multi-pass graphs with QCut's Metal host, without Jianying libraries |
| `filter-lab pipeline` | `--input` | `--filter-step <resourceId>:<intensity>` (2–16, repeatable), `--output`, `--dry-run`, `--force` | Apply an ordered stack of cards with one decode and one encode; FFmpeg and native backends may be mixed |
| `filter-lab compare` | — | `--lut-id`, `--resource-id`, `--limit`, `--sample` | Rank QCut filter presets by how closely they match one cached LUT |
| `filter-lab match` | — | `--worst`, `--sample` | Score every cached LUT against the QCut library and report the widest gaps |
| `filter-lab verify` | — | `--resource-id`, `--filter-version`, `--reference-kind`, `--reference-frame`, `--candidate-frame`, mask and video variants | Measure rendered parity from lossless PNGs |
| `filter-lab verify-batch` | — | `--manifest` | Verify every entry of a JSON manifest and accumulate run history |
| `filter-lab coverage` | — | `--stratify`, `--reference-kind`, `--details` | Join the verification store with the catalog into a verified/close/unverified report |

```bash
qcut filter-lab list --json
qcut filter-lab render --resource-id 7524288987129810214 -i portrait.jpg --output filtered.png --json
qcut filter-lab render-independent --resource-id 7160594413847203085 -i source.png --output fog-qcut.png --json
qcut filter-lab pipeline --filter-step 7524288987129810214:70 --filter-step 7392898023505792319:35 -i portrait.jpg --output layered.png --json
qcut filter-lab coverage --json
```

Intensity is `0`–`100`. `render` reports the backend it used; a card that the
independent renderer does not support fails closed instead of silently falling
back to a different backend.

## `effect-lab` — local video effects

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `effect-lab list` | — | `--query`, `--panel`, `--category`, `--installed-only`, `--supported-only`, `--limit` | List effects available to the local Effect Lab |
| `effect-lab search` | `--query` | `--panel`, `--category`, `--installed-only`, `--supported-only`, `--limit` | Search by title, ID, or category |
| `effect-lab doctor` | — | — | Check the local runtime, bridge, and cache |
| `effect-lab render` | `--effect --input` | `--output`, `--start-time`, `--duration`, `--fps`, `--width`, `--height`, `--adjust` | Render one effect onto a video |

```bash
qcut effect-lab doctor --json
qcut effect-lab list --supported-only --limit 20 --json
qcut effect-lab render --effect "胶片框" --input input.mp4 --output output.mp4
```

## `text-lab` — flower text and text animations

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `text-lab list` | — | `--query`, `--limit` | List renderable flower-text styles in QCut's private cache |
| `text-lab animations` | — | `--query`, `--limit`, `--slot entrance\|exit\|loop` | List renderable entrance, exit, and loop text animations |
| `text-lab render` | `--style --text` | `--entrance-animation`, `--exit-animation`, `--loop-animation`, `--output`, `--duration`, `--fps`, `--width`, `--height`, `--font-size` | Render one cached style through the native text runtime |

```bash
qcut text-lab list --limit 20 --json
qcut text-lab animations --slot loop --limit 20 --json
qcut text-lab render --style "<resource-id>/<package-hash>" --text "QCut 花字" --output flower.webm
```

## `sticker-lab` — private sticker reference batches

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `sticker-lab catalogs` | — | `--root`, `--batch-id`, `--query`, `--offset`, `--limit` | List reference batches |
| `sticker-lab categories` | — | `--root`, `--batch-id`, `--category`, `--query`, `--offset`, `--limit` | List categories inside a batch |
| `sticker-lab items` | — | `--root`, `--batch-id`, `--category`, `--query`, `--offset`, `--limit` | List items inside a batch |
| `sticker-lab search` | `--query` | `--root`, `--batch-id`, `--category`, `--offset`, `--limit` | Search across the references |

```bash
qcut sticker-lab catalogs --root "$QCUT_STICKER_LAB_ROOT" --json
qcut sticker-lab items --batch-id <batch-id> --limit 20 --json
```

To place a Sticker Lab item on a timeline use `editor sticker add` with
`--provider`, `--batch-id`, and `--root`; the public Iconify catalog is searched
with `edit sticker-search` or `editor sticker search` instead. See
[editor-tracks-stickers-search.md](../editor/editor-tracks-stickers-search.md).

## `transition` and `editor transition-lab`

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `transition list` | — | — | List Transition Lab presets backed by the local Jianying runtime |
| `transition doctor` | — | — | Check the local Jianying app, QCut bridge, and transition packages |
| `transition render` | `--preset --input-a --input-b` | `--output`, `--duration`, `--fps`, `--width`, `--height` | Join two videos with a preset through the local runtime |
| `editor transition-lab list` | — | — | List distributable QCut shader transition recipes |
| `editor transition-lab apply` | `--preset --track-id --from-element-id --to-element-id` | `--project-id`, `--duration` | Apply a recipe between two adjacent clips in the running editor |

```bash
qcut transition doctor --json
qcut transition render --preset jianying-local-traverse-3 --input-a a.mp4 --input-b b.mp4 --output joined.mp4
qcut editor transition-lab apply --preset lab-page-curl --track-id track-1 --from-element-id clip-a --to-element-id clip-b --json
```

`editor transition-lab` recipes ship with QCut; `transition` presets only work
on a machine with Jianying Professional installed.

## `draft` — Jianying Professional draft interop

`draft` is a shortcut group over `editor jianying-import *` and
`editor interop jianying-export`. Both spellings resolve to the same commands.

| Action | Internal command | Required | Key options | What it does |
| --- | --- | --- | --- | --- |
| `draft inspect` | `editor jianying-import inspect` | `--draft` | `--format` | Read-only inspection: profile, counts, capabilities, issues |
| `draft plan` | `editor jianying-import plan` | `--draft` | `--format` | Build an expiring, single-use import plan; writes nothing |
| `draft import` | `editor jianying-import import` | `--draft` | `--format`, `--accept-warning <fingerprint>` | Plan, validate, and queue a draft for QCut desktop |
| `draft commit` | `editor jianying-import commit` | `--plan-token` | `--accept-warning` | Freeze a planned import and queue it in the validated desktop inbox |
| `draft verify-roundtrip` | `editor jianying-import verify-roundtrip` | `--draft` | `--format` | Verify the active plaintext subdraft's no-op projection byte-for-byte |
| `draft export` | `editor interop jianying-export` | `--project-id` | `--format` | Write supported edits from a persisted QCut project into a registered Jianying project |

Related `editor interop` commands:

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor interop import-snapshot` | `--project-id --bundle-digest` | `--output` | Capture trusted persisted QCut state for a completed import |
| `editor interop writeback` | `--project-id` | — | Write supported QCut timing edits back to an exact imported draft |
| `editor interop writeback-recover` | `--recovery-token` | — | Recover an interrupted same-profile writeback |

```bash
qcut draft inspect --draft "~/Movies/JianyingPro Drafts/my-draft" --json
qcut draft import --format jianying --draft "~/Movies/JianyingPro Drafts/my-draft" --json
qcut draft verify-roundtrip --format jianying --draft "~/Movies/JianyingPro Drafts/my-draft" --json
```

Import is fail-closed: unknown or unverified structures are kept as raw
evidence and reported as `opaque`, `downgrade`, or `blocked` rather than
silently dropped. A warning must be accepted explicitly with its fingerprint.
`verify-roundtrip` does not prove that Jianying can save and reopen the result.

## `editor jianying-transition` — local transition research (read-only)

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `editor jianying-transition categories` | — | `--cache-root`, `--database` | Read transition categories from local cache metadata |
| `editor jianying-transition inventory` | — | `--cache-root`, `--database` | Summarize transitions in local cache metadata |
| `editor jianying-transition inspect` | `--title` | `--cache-root`, `--database`, `--project-root`, `--draft` | Join catalog, draft ownership, package metadata, and renderer signals |
| `editor jianying-transition scan-drafts` | — | `--project-root`, `--draft` | Scan plaintext drafts for transition ownership |
| `editor jianying-transition classify-package` | — | `--path`, `--resource-id`, `--metadata-md5`, … | Classify one package without copying its assets |
| `editor jianying-transition parity-report` | — | `--title`, `--manifest`, `--formula`, `--ffmpeg-path`, … | Compare five-stop captures and report parity metrics |

These do not require a running editor and never copy Jianying assets.

## `edit deflicker`

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `edit deflicker` | `--input` | `--output`, `--strength`, `--force` | Deflicker a local video with a verified, offline Jianying runtime cache |

```bash
qcut edit deflicker -i source.mp4 --strength 70 --output source-deflicker.mp4
```

Output is written atomically; pass `--force` to replace an existing file.
