# Native Pipeline CLI — Flow (ViMax) Commands

See [REFERENCE.md](REFERENCE.md) for generation, analysis, and model commands.

---

All `flow` workflow commands share these override flags:

| Flag | Description |
|------|-------------|
| `--llm-model` | Override LLM agent model |
| `--image-model` | Override image generation model |
| `--video-model` | Override video generation model |
| `--output-dir`, `-o` | Output directory |

### Default LLM Model

The default LLM for all ViMax agents is `google/gemini-3-flash-preview` (via OpenRouter). Common alternatives:

| Alias | OpenRouter ID | Notes |
|-------|---------------|-------|
| `gemini-3-flash` | `google/gemini-3-flash-preview` | **Default** — fast, good structured output |
| `gemini-2.5-flash` | `google/gemini-2.5-flash` | Stable, slightly slower |
| `gpt-4o` | `openai/gpt-4o` | High quality, higher cost |
| `claude-3.5-sonnet` | `anthropic/claude-3.5-sonnet` | High quality, higher cost |
| `kimi-k2.5` | `moonshotai/kimi-k2.5` | Cheap but slow (reasoning model, may timeout) |

```bash
# Use default (Gemini 3 Flash)
bun run pipeline flow script --idea "..."

# Override with a specific model
bun run pipeline flow script --idea "..." --llm-model "gpt-4o"
```

## Commands

### `flow idea2video`

Full pipeline: idea -> screenplay -> characters -> portraits -> storyboard -> video.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--idea` | | string | | Story idea (required) |
| `--text` | `-t` | string | | Alias for idea |
| `--duration` | `-d` | string | | Target duration (seconds) |
| `--no-portraits` | | boolean | `false` | Skip portrait generation |
| `--no-references` | | boolean | `false` | Disable character references |
| `--config` | `-c` | string | | YAML config overrides |
| `--project-id` | | string | | Project ID for registry |

### `flow script2video`

Script -> storyboard -> video (from existing script.json).

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--script` | | string | Script JSON path (required) |
| `--input` | `-i` | string | Alias for script |
| `--portraits` | `-p` | string | Portrait registry JSON path |
| `--no-references` | | boolean | Disable character references |

### `flow novel2movie`

Novel text file -> chapter extraction -> screenplay -> video.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--novel` | | string | | Novel text file (required) |
| `--input` | `-i` | string | | Alias |
| `--title` | | string | | Override title |
| `--max-scenes` | | integer | | Cap total scenes |
| `--no-portraits` | | boolean | `false` | Skip portraits |
| `--scripts-only` | | boolean | `false` | Stop after scripts |
| `--storyboard-only` | | boolean | `false` | Stop after storyboard |

### `flow characters`

Extract character descriptions from text.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--text` | `-t` | string | Input text or file path (required) |
| `--input` | `-i` | string | Alias (reads file if path exists) |
| `--llm-model` | | string | LLM override |

Output: `characters.json`

### `flow script`

Generate screenplay from an idea.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--idea` | | string | Story idea (required) |
| `--text` | `-t` | string | Alias |
| `--duration` | `-d` | string | Target duration (seconds) |
| `--llm-model` | | string | LLM override |

Output: `script.json`

### `flow portraits`

Generate character portrait images.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--text` | `-t` | string | | Text or characters.json path (required) |
| `--input` | `-i` | string | | Alias |
| `--max-characters` | | integer | `5` | Max characters |
| `--views` | | string | | Comma-separated: `front,side,back,three_quarter` |
| `--image-model` | | string | | Image model override |
| `--llm-model` | | string | | LLM override (for extraction) |
| `--save-registry` | | boolean | `true` | Save registry.json |
| `--project-id` | | string | `cli-project` | Project ID |

Output: `portraits/` directory + `registry.json`

### `flow storyboard`

Generate storyboard images from a script.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--script` | | string | Script JSON path (required) |
| `--input` | `-i` | string | Alias |
| `--portraits` | `-p` | string | Portrait registry path |
| `--image-model` | | string | Image model override |
| `--style` | | string | Style prefix for prompts |
| `--reference-model` | | string | Reference injection model |
| `--reference-strength` | | float | Reference strength (0.0-1.0) |

### `flow registry-create`

Build portrait registry from existing portrait directory.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--input` | `-i` | string | Portraits directory (required) |
| `--project-id` | | string | Project ID |

Expected structure: `portraits/<CharacterName>/<view>.png`

### `flow registry-show`

Display contents of a portrait registry.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--input` | `-i` | string | Path to registry.json (required) |

### `system models`

List ViMax-relevant models (image, video, image-to-video, image-to-image).

```bash
bun run pipeline system models --json
```
