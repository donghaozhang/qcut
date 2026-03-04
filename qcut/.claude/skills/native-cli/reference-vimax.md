# Native Pipeline CLI — ViMax Commands

See [REFERENCE.md](REFERENCE.md) for generation, analysis, and model commands.

---

All `vimax:*` commands share these override flags:

| Flag | Description |
|------|-------------|
| `--llm-model` | Override LLM agent model |
| `--image-model` | Override image generation model |
| `--video-model` | Override video generation model |
| `--output-dir`, `-o` | Output directory |

### `vimax:idea2video`

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

### `vimax:script2video`

Script -> storyboard -> video (from existing script.json).

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--script` | | string | Script JSON path (required) |
| `--input` | `-i` | string | Alias for script |
| `--portraits` | `-p` | string | Portrait registry JSON path |
| `--no-references` | | boolean | Disable character references |

### `vimax:novel2movie`

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

### `vimax:extract-characters`

Extract character descriptions from text.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--text` | `-t` | string | Input text or file path (required) |
| `--input` | `-i` | string | Alias (reads file if path exists) |
| `--llm-model` | | string | LLM override |

Output: `characters.json`

### `vimax:generate-script`

Generate screenplay from an idea.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--idea` | | string | Story idea (required) |
| `--text` | `-t` | string | Alias |
| `--duration` | `-d` | string | Target duration (seconds) |
| `--llm-model` | | string | LLM override |

Output: `script.json`

### `vimax:generate-portraits`

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

### `vimax:generate-storyboard`

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

### `vimax:create-registry`

Build portrait registry from existing portrait directory.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--input` | `-i` | string | Portraits directory (required) |
| `--project-id` | | string | Project ID |

Expected structure: `portraits/<CharacterName>/<view>.png`

### `vimax:show-registry`

Display contents of a portrait registry.

| Flag | Short | Type | Description |
|------|-------|------|-------------|
| `--input` | `-i` | string | Path to registry.json (required) |

### `vimax:list-models`

List ViMax-relevant models (image, video, image-to-video, image-to-image).
