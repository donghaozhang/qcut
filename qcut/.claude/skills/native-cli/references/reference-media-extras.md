# Media, Analysis, and System Commands Added After the Original Reference

Flag-level reference for the `gen`, `analyze`, `edit`, `flow`, `system`, and
`instances` actions that [REFERENCE.md](REFERENCE.md),
[reference-pipelines.md](reference-pipelines.md), and
[reference-vimax.md](reference-vimax.md) do not cover, plus the flat commands
that have no group route.

Always confirm flags with `qcut <group> <action> --help --json`; only required
flags and the most useful options are listed here.

## `gen` — audio and voice

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `gen music` | `--text` | `--lyrics`, `--instrumental`, `--model`, `--provider`, `--sample-rate`, `--bitrate`, `--audio-format` | Generate music from a text prompt with optional lyrics |
| `gen tts` | `--text` | `--model`, `--provider`, `--voice`, `--audio-url`, `--stability`, `--language-code`, `--speed`, `--volume`, `--pitch`, `--audio-format`, `--sample-rate`, `--multilingual` | Generate speech or cinematic audio from text |
| `gen voice-convert` | `--input` | `--audio-url` | Convert speech to a different voice (Chatterbox S2S) |
| `gen voice-clone` | `--input` | `--text` | Clone a voice from reference audio (Qwen3) |
| `gen remotion` | `--text` | `--export`, `--export-format`, `--fps`, `--width`, `--height` | Generate a Remotion component from a prompt; the editor-side variant is in [editor-ai.md](../editor/editor-ai.md#remotion-generation-command) |

```bash
qcut gen music -t "Upbeat pop, warm female vocal, 104 BPM"
qcut gen tts -t "Hello world!" --json
qcut gen voice-convert -i source.wav --json
qcut gen voice-clone -i reference.mp3 --json
```

## Kling elements (flat commands)

Reusable character or object elements for Kling V3 Omni video generation.
These have no group route; call them as flat commands.

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `create-element` | `--name --description` | `--frontal-image`, `--refer-images`, `--refer-video`, `--tag-list` | Create a reusable element |
| `list-elements` | — | — | List stored elements |
| `delete-element` | `--element-id` | — | Delete a stored element by ID or name |
| `generate-grid` | `--text` | `--model`, `--layout 2x2\|3x3\|…`, `--count`, `--grid-upscale` | Generate an image grid in one call |

```bash
qcut create-element --name "Detective" --description "Female detective in trench coat" --frontal-image front.jpg --refer-images side.jpg
qcut list-elements --json
qcut generate-grid -t "Seasons of a tree" --layout 2x2
```

## `analyze` — indexing, inspection, consistency, and query

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `analyze index` | `--dir` | `--fps`, `--scene-threshold`, `--candidate-duration`, `--model`, `--no-ai`, `--no-recursive`, `-o` | Build a reusable scene, motion, focus, and quality index over a media folder |
| `analyze inspect` | `--index --source --start --end` | `--narration`, `--transcript` | Render a local timeline view with frames, ruler, waveform, words, and scene boundaries |
| `analyze consistency` | `--ref --input` | `--model`, `--language`, `--fps`, `--scene-detect`, `--batch-size`, `--min-severity`, `--max-tokens` | Detect character consistency issues in a video against reference images |
| `analyze image-consistency` | `--ref` | `--candidate`, `--dir`, `--rule`, `--rules-file`, `--model`, `--language`, `--min-severity` | Check candidate images against reference images and an optional rule |
| `analyze query` | `--input` | `--prompt`, `--text`, `--model` | Query a video with a custom prompt (keep/cut segments) |

```bash
qcut analyze index --dir ./downloads -o ./analysis
qcut analyze inspect --index ./analysis/index.json --source clip.mp4 --start 2 --end 9
qcut analyze consistency --ref ref.jpg -i scene.mp4 --json
qcut analyze image-consistency --ref ref.png --candidate gen.png --json
```

`analyze video` takes `--input/-i`. The `--video-url` spelling seen in older
notes is accepted by the handler but is not a declared flag, so structured help
will not list it.

## `edit` — planning, cleanup, portrait, subtitles, stickers, sound

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `edit plan` | `--index --script --duration` | `--narration`, `--transcript`, `--language`, `--transition-duration`, `--no-timeline-views` | Align narration beats to indexed ranges and write an EDL plus a QCut manifest |
| `edit verify` | `--edl --video` | `--cut-window` | Check rendered cuts for flashes, visual jumps, motion reversals, audio spikes, and title risks |
| `edit clean-audio` | `--input` | `--srt-file`, `--output`, `--model`, `--remove-fillers` / `--no-remove-fillers`, `--remove-silences` / `--no-remove-silences`, `--silence-threshold`, `--keep-padding`, `--dry-run` | Remove filler words, stutters, and silences |
| `edit person-cutout` (alias `background-replace`) | `--input` | `--background`, `--background-fit`, `--cutout-output`, `--output`, `--portrait-filter`, `--filter-intensity`, `--beauty`, `--force` | Remove a person's video background and optionally composite a still background |
| `edit portrait-filter` (alias `beautify`) | — | `--input`, `--output`, `--preset`, `--filter-intensity`, `--beauty`, `--list-presets`, `--force` | Apply QCut portrait color presets and local skin smoothing |
| `edit subtitle` | `--input` | `--preset`, `--style`, `--output` | Style an SRT/VTT and write an ASS file |
| `edit subtitle-export` | `--input` | `--srt-file`, `--preset`, `--style`, `--resolution`, `--output` | Burn styled subtitles into a video |
| `edit upscale-video` | — | `--video` / `--video-url` / `--input`, `--model`, `--upscale`, `--target-fps`, `--output-format` | Upscale a video with FAL Topaz Video Upscale |
| `edit stamp` | `--input` | `--text`, `--image-url`, `--data`, `--duration` | Add a logo and/or text overlay to an image |
| `edit sound-search` | `--query` | `--source`, `--limit`, `--manifest`, `--manifest-url`, `--download-dir` | Search Freesound and the Sound Effects Lab catalog |
| `edit sticker-search` | `--query` | `--collection`, `--limit` | Search the public Iconify sticker catalog |
| `edit sticker-overlay` | `--input --plan` | `--output`, `--save-intermediates`, `--force` | Render timed stickers and optional sound effects from a JSON plan |
| `edit deflicker` | `--input` | `--output`, `--strength`, `--force` | Deflicker with the offline Jianying runtime cache; see [reference-labs-compose.md](reference-labs-compose.md#edit-deflicker) |

```bash
qcut edit portrait-filter --list-presets --json
qcut edit person-cutout -i talking-head.mp4 --background studio.png -o ./output
qcut edit clean-audio -i interview.mp4 --dry-run --json
qcut edit subtitle-export -i video.mp4 --srt-file subs.srt --preset bold
qcut edit sound-search --query whoosh --limit 10 --json
qcut edit sticker-overlay -i video.mp4 --plan stickers.json --output video-stickers.mp4
```

## `flow` — ViMax stages not covered in reference-vimax.md

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `flow novel2script` | `--novel` | `--project`, `--title`, `--max-scenes`, `--chunk-size`, `--overlap`, `--llm-model` | Segment a novel into shot-level Script JSON chunks (stage 3 of the decomposed novel2movie workflow) |
| `flow novel2video` | `--project` | `--max-shots`, `--duration`, `--resolution`, `--aspect-ratio`, `--concurrency`, `--force`, `--cost-gate`, `--model`, `--style-anchor`, `--style-prompt` | Generate per-shot videos from a project's scripts and portraits (stage 4) |
| `flow lint-scripts` | `--project` | `--auto-fix` | Report shots whose description mentions catalogued characters missing from `characters[]` |
| `vimax:list-models` (flat) | — | — | List ViMax-specific models |

```bash
qcut flow novel2script --novel story.md --project my-story
qcut flow lint-scripts --project my-story
qcut flow novel2video --project my-story --max-shots 5 --cost-gate
```

## Phota and Replicate (flat commands)

| Command | Required | Key options | What it does |
| --- | --- | --- | --- |
| `phota:edit` | `--text --input` | `--profile`, `--resolution`, `--aspect-ratio`, `--count`, `--format` | Edit an image with Phota from a prompt and optional identity profile |
| `phota:enhance` | `--input` | `--profile`, `--count`, `--format` | Enhance image quality with Phota |
| `phota:profile` | `--input` | — | Create a Phota identity profile from a ZIP of reference images |
| `replicate` | `--source` | `--directory`, `--video-model`, `--image-model`, `--llm-model`, `--max-workers` | Replicate a video end to end: analyze, generate, assemble |
| `replicate:analyze` | `--source` | `--llm-model` | Analyze a video and extract a VideoRecipe |
| `replicate:generate` | `--input` | `--directory`, `--video-model`, `--image-model`, `--max-workers` | Generate video from a VideoRecipe JSON file |

```bash
qcut phota:edit -i photo.jpg -t "Make the background a sunset"
qcut replicate:analyze --source input.mp4 --json
qcut replicate:generate --input recipe.json
```

## `system` — update, diagnostics, and keys

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `system update` (also `qcut update`) | — | `--check`, `--yes`, `--no-launch` | Check, download, verify, and install the latest official QCut app |
| `system doctor` | — | — | Report environment health (bun, ffmpeg, `.env`, keys) as JSON; use `--skip-health` when no editor is running |
| `system keys` | — | `--configured`, `--missing`, `--category` | Show configured and missing API keys |
| `system sync-keys` | — | `--pull` (default), `--push`, `--force` | Sync API keys with the cloud vault; requires login |
| `system login` | `--email` | `--password` | Log in to QCut with email and password |
| `system signup` | `--email --name` | `--password` | Create a new QCut account |
| `system logout` | — | — | Log out and clear the stored session token |

```bash
qcut update --check --json
qcut system doctor --json --skip-health
qcut system keys --missing --json
```

`update` quits a running editor before installing. Ask before running it with
`--yes`, and never reveal key values in logs or prompts.

## `instances` — choosing the editor the CLI talks to

| Action | Required | Key options | What it does |
| --- | --- | --- | --- |
| `instances list` | — | — | List running QCut editor instances |
| `instances use` | `--port` | `--host`, `--force` | Select the instance used by future CLI commands |

```bash
qcut instances list --json
qcut instances use --port 8878 --json
```

The global `--host`, `--port`, and `--token` flags override the selected
instance for a single command.

## Flat commands without a group route

`generate-grid`, `record`, `record-daemon`, `create-element`, `list-elements`,
`delete-element`, `moyin:parse-script`, `youtube:upload`, `phota:edit`,
`phota:enhance`, `phota:profile`, `vimax:list-models`, `replicate`,
`replicate:analyze`, `replicate:generate`.

Every other command is reachable as `qcut <group> <action>`; the flat name
still works as the legacy form.
