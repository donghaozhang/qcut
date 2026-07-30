---
name: qcut-shot
description: CLI-first shot planning skill for QCut. Analyzes a script, article, or idea; builds a deterministic shot list; writes per-shot image prompts; and can render shot frames through its own local fal-backed renderer. Use when the user wants scene shots, storyboard frames, or a shot plan from the terminal.
---

# QCut Shot

CLI-first shot planning and frame generation.

## Usage

```bash
export QCUT_SHOT_ROOT="/Users/peter/Desktop/code/qcut/qcut/.claude/skills/qcut-toolkit/qcut-shot"

npx -y bun@1.3.10 "$QCUT_SHOT_ROOT/scripts/main.ts" story.md
npx -y bun@1.3.10 "$QCUT_SHOT_ROOT/scripts/main.ts" story.md --style cinematic --shots 8
npx -y bun@1.3.10 "$QCUT_SHOT_ROOT/scripts/main.ts" story.md --medium live-action --format film
npx -y bun@1.3.10 "$QCUT_SHOT_ROOT/scripts/main.ts" story.md --medium animation --format short-film --style custom --framing macro --movement slider --lighting bright --mood polished
npx -y bun@1.3.10 "$QCUT_SHOT_ROOT/scripts/main.ts" story.md --style custom --framing macro --movement slider --lighting bright --mood polished
npx -y bun@1.3.10 "$QCUT_SHOT_ROOT/scripts/main.ts" story.md --prompts-only
npx -y bun@1.3.10 "$QCUT_SHOT_ROOT/scripts/main.ts" promo.md --promo --shots 8
npx -y bun@1.3.10 "$QCUT_SHOT_ROOT/scripts/main.ts" promo.md --promo --shot-duration 2.8 \
  --promo-presets entrance:laser-etch,loop:wave,exit:typewriter-out
npx -y bun@1.3.10 "$QCUT_SHOT_ROOT/scripts/main.ts" shot-plan/my-story --images-only
npx -y bun@1.3.10 "$QCUT_SHOT_ROOT/scripts/main.ts" shot-plan/my-story --regenerate 2,5
```

## Options

| Option | Description |
|---|---|
| `--style <name>` | Preset style or `custom` |
| `--medium <name>` | `live-action`, `animation`, `hybrid`, `cgi` |
| `--format <name>` | `film`, `tv-series`, `documentary`, `variety`, `short-film`, `short-video` |
| `--framing <name>` | `wide`, `medium`, `close`, `macro`, `overhead` |
| `--movement <name>` | `locked-off`, `handheld`, `dolly`, `slider`, `crane`, `dynamic` |
| `--lighting <name>` | `natural`, `bright`, `dramatic`, `low-key`, `neon`, `soft` |
| `--mood <name>` | `grounded`, `warm`, `tense`, `moody`, `polished`, `heightened` |
| `--shots <number>` | Target shot count |
| `--lang <code>` | Output language |
| `--prompts-only` | Stop after writing prompts |
| `--images-only` | Render images from an existing shot plan |
| `--regenerate 2,5` | Re-render selected shots |
| `--provider <name>` | Currently `fal` only |
| `--model <id>` | Override the fal model |
| `--output-dir <path>` | Write artifacts to a specific directory |
| `--project-id <id>` | Save into QCut project folder |
| `--dry-run` | Skip rendering work |
| `--promo` | Also write QCut timeline, pointer actions, and demo-run plans |
| `--shot-duration <seconds>` | Per-shot promo duration, 1–30 seconds (default `3`) |
| `--promo-presets <phase:id,...>` | Cycle explicit entrance/exit/loop text presets across shots |

## Output

Default save location (priority order):

1. `--output-dir <path>` — explicit override
2. `--project-id <id>` — `~/Documents/QCut/Projects/<id>/shot-plan/{slug}/`
3. No flags — `~/Documents/QCut/shot-plan/{slug}/`

```text
shot-plan/{topic-slug}/
├── source-{slug}.{ext}
├── analysis.md
├── shots.md
├── shots.json
├── shots.csv
├── manifest.csv
├── prompts/
│   └── 01-shot-opening.md
├── 01-shot-opening.png
├── promo-timeline.json
├── promo-actions.json
├── promo-demo.json
└── ...
```

`--promo` writes timeline, pointer-action, and demo-run plans alongside the shot
artifacts. It does not launch QCut, export video, or record the editor. After the
shot images exist and QCut is running, execute the generated demo plan:

```bash
bun run pipeline editor:demo:run \
  --plan shot-plan/my-story/promo-demo.json \
  --recording-quality 1440p \
  --json
```

This follow-up applies the timeline, records the editor workflow, and exports the
final title reel.

The timeline manifest uses declarative `textAnimationPreset` requests. QCut
resolves them through its bundled preset catalog, so the skill does not copy or
freeze animation implementation details.

## Promo Voiceover

When a promo needs narration, render the final voice with ByteDance Seed Audio:

```bash
bun run pipeline gen tts \
  -m seed_audio \
  -t "(用自然、自信、克制的产品宣传片语气，节奏明快，避免播音腔)<旁白正文>" \
  --audio-format mp3 \
  --sample-rate 48000 \
  --multilingual \
  -o shot-plan/my-story/audio
```

Quality rules:

- Generate one continuous narrator track when possible. Multiple independent
  Seed Audio calls can select different speakers.
- Direct emotion and pace in the copy's language. Shorten copy before pushing
  `--speed` beyond `1.15`.
- Verify the rendered duration against the picture edit and inspect the final
  mixed file for clipping, silence, and intelligibility over music.
- macOS `say`, Windows SAPI, `espeak`, and similar system voices are timing
  placeholders only. They must never appear in the delivered promo.
- If Seed Audio is unavailable, stop with an actionable error and preserve the
  last valid deliverable. Never silently fall back to system TTS.

## Notes

- References live in `qcut-shot/references/`.
- Image rendering uses the local `qcut-shot/scripts/image-gen.ts` renderer.
- If rendering cannot run, the command still produces `analysis.md`, `shots.md`, `shots.json`, and prompt files.
