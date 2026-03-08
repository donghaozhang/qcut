---
name: qcut-shot
description: CLI-first shot planning skill for QCut. Analyzes a script, article, or idea; builds a deterministic shot list; writes per-shot image prompts; and can render shot frames through its own local fal-backed renderer. Use when the user wants scene shots, storyboard frames, or a shot plan from the terminal.
---

# QCut Shot

CLI-first shot planning and frame generation.

## Usage

```bash
export QCUT_SHOT_ROOT="/Users/peter/Desktop/code/qcut/qcut/.claude/skills/qcut-toolkit/qcut-shot"

npx -y bun "$QCUT_SHOT_ROOT/scripts/main.ts" story.md
npx -y bun "$QCUT_SHOT_ROOT/scripts/main.ts" story.md --style cinematic --shots 8
npx -y bun "$QCUT_SHOT_ROOT/scripts/main.ts" story.md --style custom --framing macro --movement slider --lighting bright --mood polished
npx -y bun "$QCUT_SHOT_ROOT/scripts/main.ts" story.md --prompts-only
npx -y bun "$QCUT_SHOT_ROOT/scripts/main.ts" shot-plan/my-story --images-only
npx -y bun "$QCUT_SHOT_ROOT/scripts/main.ts" shot-plan/my-story --regenerate 2,5
```

## Options

| Option | Description |
|---|---|
| `--style <name>` | Preset style or `custom` |
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
| `--dry-run` | Skip rendering work |

## Output

```text
shot-plan/{topic-slug}/
├── source-{slug}.{ext}
├── analysis.md
├── shots.md
├── shots.json
├── prompts/
│   └── 01-shot-opening.md
├── 01-shot-opening.png
└── ...
```

## Notes

- References live in `qcut-shot/references/`.
- Image rendering uses the local `qcut-shot/scripts/image-gen.ts` renderer.
- If rendering cannot run, the command still produces `analysis.md`, `shots.md`, `shots.json`, and prompt files.
