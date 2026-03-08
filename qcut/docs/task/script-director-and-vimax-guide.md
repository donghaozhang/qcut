# ViMax — AI Video Production Guide

ViMax is QCut's agentic video production pipeline. It turns ideas, scripts, and novels into multi-scene videos with consistent characters.

## Quick Start

```bash
# From an idea (full pipeline)
bun run pipeline vimax:idea2video --idea "A detective in 1920s Paris" -d 120

# From a novel (full pipeline)
bun run pipeline vimax:novel2movie --novel story.txt --max-scenes 20

# From an existing script (skip screenplay step)
bun run pipeline vimax:script2video --script script.json --portraits registry.json
```

## How It Works

### Pipeline Flow

```
Idea / Novel text
  ↓
1. generate-script     → script.json (scenes, shots, prompts)
2. extract-characters  → characters.json (names, appearance, roles)
3. generate-portraits  → portrait images + registry.json
4. generate-storyboard → storyboard images per shot
5. generate videos     → video clips per shot
6. concatenate         → final_movie.mp4
```

Each step can be run independently or as part of a full pipeline.

## Commands

### Full Pipelines

| Command | Input | Output |
|---|---|---|
| `vimax:idea2video` | Text idea + duration | Full video |
| `vimax:novel2movie` | .txt file | Full movie (multi-chapter) |
| `vimax:script2video` | script.json | Full video |

### Individual Steps

| Command | Input | Output |
|---|---|---|
| `vimax:generate-script` | Idea text | `script.json` |
| `vimax:extract-characters` | Text or script.json | `characters.json` |
| `vimax:generate-portraits` | characters.json | Portrait images + `registry.json` |
| `vimax:generate-storyboard` | script.json | Storyboard images |
| `vimax:create-registry` | Existing portrait directory | `registry.json` |
| `vimax:show-registry` | registry.json | Display contents |
| `vimax:list-models` | — | Available models |

## Step-by-Step Walkthrough

### Step 1: Generate Screenplay

```bash
bun run pipeline vimax:generate-script \
  --idea "A survival poker game. Five strangers in a bunker, loser dies." \
  -d 120
```

Output: `output/script.json` — structured screenplay with scenes, shots, camera directions, and image/video prompts.

### Step 2: Extract Characters

```bash
bun run pipeline vimax:extract-characters -t output/script.json
```

Output: `output/characters.json` — character names, appearances, personalities, roles.

### Step 3: Generate Portraits (costs money)

```bash
bun run pipeline vimax:generate-portraits -t output/characters.json
```

Output: `output/portraits/` directory + `registry.json` for character consistency across scenes.

### Step 4: Generate Storyboard (costs money)

```bash
bun run pipeline vimax:generate-storyboard \
  --script output/script.json \
  --portraits output/registry.json
```

Output: Storyboard images for each shot.

### Step 5: Full Video (costs money)

```bash
bun run pipeline vimax:script2video \
  --script output/script.json \
  --portraits output/registry.json
```

Or run everything from step 1:

```bash
bun run pipeline vimax:idea2video \
  --idea "A survival poker game" \
  -d 120
```

## Novel to Movie

### Basic Usage

```bash
bun run pipeline vimax:novel2movie --novel book.txt --max-scenes 20
```

### Partial Runs (save money)

```bash
# Stop after generating scripts (no images/video — LLM cost only)
bun run pipeline vimax:novel2movie --novel book.txt --scripts-only

# Stop after storyboard (no video generation)
bun run pipeline vimax:novel2movie --novel book.txt --storyboard-only
```

### Novel Size Limits

| Size | Behavior |
|---|---|
| < 150K words | Normal processing |
| 150K–500K words | Warning: may be slow, consider `--max-scenes` |
| > 500K words | Auto-split into `split_parts/` files, exits with instructions |

For very large novels, the pipeline splits the text at paragraph boundaries and saves parts to disk. Run each part separately:

```bash
bun run pipeline vimax:novel2movie \
  --novel split_parts/part_01.txt \
  --title "My Novel Part 1"
```

## LLM Model

The default LLM for all ViMax agents is `google/gemini-3-flash-preview` (via OpenRouter).

Override with `--llm-model`:

```bash
bun run pipeline vimax:generate-script \
  --idea "..." \
  --llm-model "gpt-4o"
```

Available aliases:

| Alias | Model | Notes |
|---|---|---|
| `gemini-3-flash` | `google/gemini-3-flash-preview` | Default — fast, good structured output |
| `gemini-2.5-flash` | `google/gemini-2.5-flash` | Stable fallback |
| `gpt-4o` | `openai/gpt-4o` | High quality, higher cost |
| `claude-3.5-sonnet` | `anthropic/claude-3.5-sonnet` | High quality, higher cost |

## API Keys

ViMax uses OpenRouter for LLM and FAL for image/video generation.

```bash
# Check configured keys
bun run pipeline check-keys

# Set keys
bun run pipeline set-key --name OPENROUTER_API_KEY
bun run pipeline set-key --name FAL_KEY
```

Keys are stored in `~/.qcut/.env`.

## Global Flags

All ViMax commands support:

| Flag | Description |
|---|---|
| `--llm-model` | Override LLM model |
| `--image-model` | Override image generation model |
| `--video-model` | Override video generation model |
| `--output-dir`, `-o` | Output directory |
| `--json` | Machine-readable JSON output |
| `--quiet` | Suppress progress logs |

## Output Structure

```
output/
├── script.json           # Screenplay
├── characters.json       # Extracted characters
├── portraits/            # Character portrait images
│   └── registry.json     # Portrait registry
├── storyboard/           # Storyboard images per shot
├── scripts/              # Per-chapter scripts (novel2movie)
│   ├── chapter_001.json
│   └── chapter_002.json
├── videos/               # Generated video clips
├── final_movie.mp4       # Concatenated final video
└── summary.json          # Pipeline run summary
```

## Tips

- Use `--scripts-only` first to preview the screenplay before spending on images/video
- Use `--max-scenes` to control output length and cost
- Provide your own portraits via `vimax:create-registry` to skip portrait generation
- Check `summary.json` for total cost after a run
