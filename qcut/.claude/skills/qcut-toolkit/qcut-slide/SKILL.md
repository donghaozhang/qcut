---
name: qcut-slide
description: CLI-first slide deck generator for QCut. Analyzes markdown or text content, creates a slide outline, generates per-slide image prompts, renders slide images through its own local fal-backed renderer, and merges the results into PPTX or PDF. Ships with its own local slide references instead of depending on baoyu-slide-deck references. Use when the user wants a real command-line slide workflow rather than an interactive slash-skill flow.
---

# QCut Slide

CLI-first slide deck generation.

## Usage

```bash
export QCUT_SLIDE_ROOT="/Users/peter/Desktop/code/qcut/qcut/.claude/skills/qcut-toolkit/qcut-slide"

npx -y bun "$QCUT_SLIDE_ROOT/scripts/main.ts" article.md
npx -y bun "$QCUT_SLIDE_ROOT/scripts/main.ts" article.md --style blueprint --audience executives --slides 10
npx -y bun "$QCUT_SLIDE_ROOT/scripts/main.ts" article.md --outline-only
npx -y bun "$QCUT_SLIDE_ROOT/scripts/main.ts" article.md --prompts-only
npx -y bun "$QCUT_SLIDE_ROOT/scripts/main.ts" slide-deck/my-topic --images-only
npx -y bun "$QCUT_SLIDE_ROOT/scripts/main.ts" slide-deck/my-topic --regenerate 2,5
```

## Modes

| Mode | Behavior |
|---|---|
| default | Analyze, build outline, write prompts, try image generation if configured, merge if images exist |
| `--outline-only` | Stop after `outline.md` |
| `--prompts-only` | Stop after prompt files |
| `--images-only` | Read existing `prompts/` and generate images only |
| `--regenerate 2,5` | Regenerate selected slides only |

## Output

```text
slide-deck/{topic-slug}/
├── source-{slug}.{ext}
├── analysis.md
├── outline.md
├── prompts/
├── 01-slide-cover.png
├── 02-slide-*.png
├── {topic-slug}.pptx
└── {topic-slug}.pdf
```

## Notes

- Style and prompt references live locally in `qcut-slide/references/`.
- Image generation uses the local `qcut-slide/scripts/image-gen.ts` renderer.
- If image generation cannot run, the command still produces `analysis.md`, `outline.md`, and prompt files.
