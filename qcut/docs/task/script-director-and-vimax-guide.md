# Script Director & ViMax — AI Video Production Guide

QCut has two ways to produce AI videos from scripts and novels:

1. **Script Director** — editor panel commands (requires QCut running)
2. **ViMax** — standalone CLI pipeline (no editor needed)

---

## Script Director (Editor Panel)

The Script Director panel in the QCut editor has three tabs: **Import**, **Create**, and **Novel**. All commands require QCut to be running.

### Ensure QCut is Running

```bash
bun run pipeline editor:health --status-only --json || echo "NOT_RUNNING"

# If not running:
bun run build && bun run electron &
sleep 5
```

### Create Tab — Generate Script from Idea

Generate a screenplay from a text description, with genre and duration controls.

```bash
bun run pipeline editor:moyin:generate \
  --idea "A survival poker game. Five strangers in a bunker, loser dies." \
  --genre drama \
  --target-duration 60s
```

| Flag | Description |
|---|---|
| `--idea`, `-i` | Description or idea for the script |
| `--genre` | Genre hint (e.g. drama, comedy, thriller, horror) |
| `--target-duration` | Target duration (e.g. 30s, 1m, 2m) |

### Import Tab — Import Existing Script

Push a script file or text into the director panel, then trigger parsing.

```bash
# From a file
bun run pipeline editor:moyin:set-script --script screenplay.txt

# From inline text
bun run pipeline editor:moyin:set-script -t "Scene 1: A dark room..."

# Trigger the Parse Script button
bun run pipeline editor:moyin:parse
```

| Flag | Description |
|---|---|
| `--script` | Script file path |
| `--text`, `-t` | Inline script text |

### Novel Tab — Parse Novel into Screenplay

Parse a novel text file into a structured screenplay for the editor.

```bash
bun run pipeline editor:novel:parse \
  --input novel.txt \
  --output screenplay.json \
  --language auto
```

| Flag | Description | Default |
|---|---|---|
| `--input` | Path to novel text file (required) | — |
| `--output` | Output JSON path (default: stdout) | stdout |
| `--language` | Language hint: `zh`, `en`, `auto` | `auto` |
| `--max-clips` | Maximum clips to generate | — |
| `--json` | JSON output format | — |

### Pipeline Status

```bash
bun run pipeline editor:moyin:status
```

### Switch to Script Director Panel

```bash
bun run pipeline editor:ui:switch-panel --panel moyin
# Inner tabs: overview, characters, scenes, shots, generate
bun run pipeline editor:ui:switch-panel --panel moyin --tab scenes
```

### Export Script Director Data

Export the current Script Director state (characters, scenes, episodes, shots) to a JSON file.

```bash
# Export to default file (moyin-export.json)
bun run pipeline editor:moyin:export --json

# Export to a specific path
bun run pipeline editor:moyin:export -o output/my-export.json --json
```

| Flag | Description | Default |
|---|---|---|
| `--output`, `-o` | Output file path | `moyin-export.json` |
| `--json` | JSON output format | — |

### All Script Director CLI Commands

| Command | Description |
|---|---|
| `editor:moyin:generate` | Generate script from idea (Create tab) |
| `editor:moyin:set-script` | Push script text to director panel (Import tab) |
| `editor:moyin:parse` | Trigger Parse Script button |
| `editor:moyin:status` | Get pipeline progress |
| `editor:moyin:export` | Export full script data to JSON file |
| `editor:novel:parse` | Parse novel into structured screenplay (Novel tab) |
| `editor:ui:switch-panel --panel moyin` | Open Script Director panel |

---

## ViMax (Standalone CLI)

ViMax is the standalone video production pipeline. It runs without the editor and produces video files directly.

### Quick Start

```bash
# From an idea (full pipeline)
bun run pipeline vimax:idea2video --idea "A detective in 1920s Paris" -d 120

# From a novel (full pipeline)
bun run pipeline vimax:novel2movie --novel story.txt --max-scenes 20

# From an existing script (skip screenplay step)
bun run pipeline vimax:script2video --script script.json --portraits registry.json
```

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

### All ViMax Commands

#### Full Pipelines

| Command | Input | Output |
|---|---|---|
| `vimax:idea2video` | Text idea + duration | Full video |
| `vimax:novel2movie` | .txt file | Full movie (multi-chapter) |
| `vimax:script2video` | script.json | Full video |

#### Individual Steps

| Command | Input | Output |
|---|---|---|
| `vimax:generate-script` | Idea text | `script.json` |
| `vimax:extract-characters` | Text or script.json | `characters.json` |
| `vimax:generate-portraits` | characters.json | Portrait images + `registry.json` |
| `vimax:generate-storyboard` | script.json | Storyboard images |
| `vimax:create-registry` | Existing portrait directory | `registry.json` |
| `vimax:show-registry` | registry.json | Display contents |
| `vimax:list-models` | — | Available models |

### Step-by-Step Walkthrough

#### Step 1: Generate Screenplay

```bash
bun run pipeline vimax:generate-script \
  --idea "A survival poker game. Five strangers in a bunker, loser dies." \
  -d 120
```

Output: `output/script.json` — structured screenplay with scenes, shots, camera directions, and image/video prompts.

#### Step 2: Extract Characters

```bash
bun run pipeline vimax:extract-characters -t output/script.json
```

Output: `output/characters.json` — character names, appearances, personalities, roles.

#### Step 3: Generate Portraits (costs money)

```bash
bun run pipeline vimax:generate-portraits -t output/characters.json
```

Output: `output/portraits/` directory + `registry.json` for character consistency across scenes.

#### Step 4: Generate Storyboard (costs money)

```bash
bun run pipeline vimax:generate-storyboard \
  --script output/script.json \
  --portraits output/registry.json
```

Output: Storyboard images for each shot.

#### Step 5: Full Video (costs money)

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

### Novel to Movie

#### Basic Usage

```bash
bun run pipeline vimax:novel2movie --novel book.txt --max-scenes 20
```

#### Partial Runs (save money)

```bash
# Stop after generating scripts (no images/video — LLM cost only)
bun run pipeline vimax:novel2movie --novel book.txt --scripts-only

# Stop after storyboard (no video generation)
bun run pipeline vimax:novel2movie --novel book.txt --storyboard-only
```

#### Novel Size Limits

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

---

## Script Director vs ViMax

| | Script Director | ViMax |
|---|---|---|
| **Requires editor** | Yes | No |
| **Character consistency** | Via editor state | Via portrait registry |
| **Output** | Loads into editor timeline | Files on disk |
| **Novel support** | `editor:novel:parse` | `vimax:novel2movie` |
| **Script generation** | `editor:moyin:generate` | `vimax:generate-script` |
| **Best for** | Interactive editing workflow | Batch/headless production |

---

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
- Use Script Director for interactive editing, ViMax for batch/headless runs
