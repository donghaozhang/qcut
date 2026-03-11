# Baoyu Skills CLI Guide

`baoyu` currently contains **15 skills** under `.claude/skills/qcut-toolkit/baoyu`.

This file focuses on **CLI usage only**.

## Skill Count

| Skill | CLI Status |
|---|---|
| `baoyu-article-illustrator` | Slash-skill only |
| `baoyu-comic` | Partial CLI helpers |
| `baoyu-compress-image` | Direct Bun CLI |
| `baoyu-cover-image` | Slash-skill only |
| `baoyu-danger-gemini-web` | Direct Bun CLI |
| `baoyu-danger-x-to-markdown` | Direct Bun CLI |
| `baoyu-format-markdown` | Direct Bun CLI |
| `baoyu-image-gen` | Direct Bun CLI |
| `baoyu-infographic` | Slash-skill only |
| `baoyu-markdown-to-html` | Direct Bun CLI |
| `baoyu-post-to-wechat` | Direct Bun CLI |
| `baoyu-post-to-x` | Direct Bun CLI |
| `baoyu-slide-deck` | Partial CLI helpers |
| `baoyu-url-to-markdown` | Direct Bun CLI |
| `baoyu-xhs-images` | Slash-skill only |

## Base Path

```bash
BAOYU_ROOT=".claude/skills/qcut-toolkit/baoyu"
```

## Direct Bun CLI Skills

### `baoyu-compress-image`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-compress-image/scripts/main.ts" image.png
npx -y bun "$BAOYU_ROOT/baoyu-compress-image/scripts/main.ts" ./images -r -q 75
npx -y bun "$BAOYU_ROOT/baoyu-compress-image/scripts/main.ts" image.png --json
```

### `baoyu-danger-gemini-web`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-danger-gemini-web/scripts/main.ts" "Your prompt"
npx -y bun "$BAOYU_ROOT/baoyu-danger-gemini-web/scripts/main.ts" --prompt "A cute cat" --image cat.png
npx -y bun "$BAOYU_ROOT/baoyu-danger-gemini-web/scripts/main.ts" --prompt "Describe this" --reference image.png
npx -y bun "$BAOYU_ROOT/baoyu-danger-gemini-web/scripts/main.ts" "Hello" --json
```

### `baoyu-danger-x-to-markdown`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-danger-x-to-markdown/scripts/main.ts" "https://x.com/user/status/123"
npx -y bun "$BAOYU_ROOT/baoyu-danger-x-to-markdown/scripts/main.ts" "https://x.com/user/status/123" -o output.md
npx -y bun "$BAOYU_ROOT/baoyu-danger-x-to-markdown/scripts/main.ts" "https://x.com/user/status/123" --download-media
```

### `baoyu-format-markdown`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-format-markdown/scripts/main.ts" article.md
npx -y bun "$BAOYU_ROOT/baoyu-format-markdown/scripts/main.ts" article.md --quotes
npx -y bun "$BAOYU_ROOT/baoyu-format-markdown/scripts/main.ts" article.md --no-spacing --no-emphasis
```

### `baoyu-image-gen`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-image-gen/scripts/main.ts" --prompt "A cat" --image out.png
npx -y bun "$BAOYU_ROOT/baoyu-image-gen/scripts/main.ts" --prompt "A landscape" --image out.png --ar 16:9
npx -y bun "$BAOYU_ROOT/baoyu-image-gen/scripts/main.ts" --prompt "Make it blue" --image out.png --ref source.png
npx -y bun "$BAOYU_ROOT/baoyu-image-gen/scripts/main.ts" --prompt "A cat" --image out.png --provider fal --model fal-ai/flux/schnell
```

### `baoyu-markdown-to-html`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-markdown-to-html/scripts/main.ts" article.md
npx -y bun "$BAOYU_ROOT/baoyu-markdown-to-html/scripts/main.ts" article.md --theme grace
npx -y bun "$BAOYU_ROOT/baoyu-markdown-to-html/scripts/main.ts" article.md --theme modern --color red
```

### `baoyu-post-to-wechat`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-post-to-wechat/scripts/check-permissions.ts"
npx -y bun "$BAOYU_ROOT/baoyu-post-to-wechat/scripts/wechat-browser.ts" --markdown article.md --images ./images/
npx -y bun "$BAOYU_ROOT/baoyu-post-to-wechat/scripts/wechat-api.ts" article.md --theme modern
npx -y bun "$BAOYU_ROOT/baoyu-post-to-wechat/scripts/wechat-article.ts" --markdown article.md --theme grace
```

### `baoyu-post-to-x`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-post-to-x/scripts/check-paste-permissions.ts"
npx -y bun "$BAOYU_ROOT/baoyu-post-to-x/scripts/x-browser.ts" "Hello!" --image ./photo.png
npx -y bun "$BAOYU_ROOT/baoyu-post-to-x/scripts/x-video.ts" "Check this out!" --video ./clip.mp4
npx -y bun "$BAOYU_ROOT/baoyu-post-to-x/scripts/x-quote.ts" "https://x.com/user/status/123" "Great insight!"
npx -y bun "$BAOYU_ROOT/baoyu-post-to-x/scripts/x-article.ts" article.md --cover ./cover.jpg
```

### `baoyu-url-to-markdown`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-url-to-markdown/scripts/main.ts" "https://example.com"
npx -y bun "$BAOYU_ROOT/baoyu-url-to-markdown/scripts/main.ts" "https://example.com" --wait
npx -y bun "$BAOYU_ROOT/baoyu-url-to-markdown/scripts/main.ts" "https://example.com" -o output.md
```

## Partial CLI Helper Skills

These skills do not expose a full end-to-end `main.ts`, but they do ship helper scripts you can run directly.

### `baoyu-comic`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-comic/scripts/merge-to-pdf.ts" ./comic-output
```

Image generation inside this skill delegates to `baoyu-image-gen`.

### `baoyu-slide-deck`

```bash
npx -y bun "$BAOYU_ROOT/baoyu-slide-deck/scripts/merge-to-pptx.ts" ./slide-deck-output
npx -y bun "$BAOYU_ROOT/baoyu-slide-deck/scripts/merge-to-pdf.ts" ./slide-deck-output
```

## Slash-Skill Only

These skills are documented as interactive slash-style skills in their `SKILL.md` files and do **not** currently ship a direct standalone Bun CLI entrypoint in this bundle:

- `baoyu-article-illustrator`
- `baoyu-cover-image`
- `baoyu-infographic`
- `baoyu-xhs-images`

They are still useful, but they are workflow/prompt skills rather than single-file CLI tools.

## Common Requirements

- `bun` installed
- `npx` available
- Some skills require Chrome or Chromium
- Some skills require API keys such as `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `REPLICATE_API_TOKEN`, or `FAL_KEY`
- Some skills check project or user preferences in `.baoyu-skills/<skill>/EXTEND.md`

## Fastest Way To Explore

```bash
find "$BAOYU_ROOT" -maxdepth 2 -name SKILL.md | sort
find "$BAOYU_ROOT" -path '*/scripts/*' -maxdepth 3 -type f | sort
```
