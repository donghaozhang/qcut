# CLI `--help --json` Structured Help Output Plan

**Date**: 2026-03-04
**Branch**: `json`
**Status**: DONE

## 3-Level Progressive Help System (Token-Efficient for Agents)

### Level 1: Root Overview (~200 tokens)
```bash
qcut --help --json
```
```json
{"status":"ok","data":{"version":"2026.3.4","commands":["generate-image","create-video","editor:media:list",...],
"categories":{"generation":["generate-image","create-video","generate-avatar","upscale-image","generate-grid"],
"editor":["editor:media:list","editor:timeline:export","editor:project:list","editor:timeline:info"],
"vimax":["vimax:idea2video","vimax:script2video","vimax:novel2movie"],
"pipeline":["run-pipeline","pipeline:status","transcribe","analyze-video"]}}}
```

### Level 2: Command Detail (~300 tokens)
```bash
qcut generate-image --help --json
```
```json
{"status":"ok","data":{"command":"generate-image","description":"Generate an image from text",
"required":[{"name":"text","short":"t","type":"string"}],
"optional":[{"name":"model","short":"m","type":"string","default":"flux-1-dev"},{"name":"seed","type":"number"},{"name":"aspect-ratio","type":"string","default":"16:9"}],
"examples":["qcut generate-image -t 'sunset over ocean' -m kling"]}}
```

### Level 3: Parameter Detail (rare, for enum/complex params)
```bash
qcut generate-image --help model --json
```
```json
{"status":"ok","data":{"name":"model","type":"string","enum":["flux-1-dev","kling-2.6-pro","recraft-v4","ideogram-3","dall-e-3"],
"default":"flux-1-dev","description":"AI model to use for image generation"}}
```

### Design Principles
- **Minimize tokens**: Agent gets just enough info at each level
- **Progressive disclosure**: L1 for discovery, L2 for usage, L3 for edge cases
- **Categories**: Group related commands for Agent navigation
- **Enum values**: For model/format params so Agent knows valid options without trial-and-error

---

## 1. Goal

When a user runs `qcut-pipeline --help --json` or `qcut-pipeline <command> --help --json`, return structured JSON describing available commands, flags, and usage — instead of the current plaintext help.

This enables programmatic CLI discovery: tools, IDE extensions, and AI agents can introspect the CLI surface without parsing human-readable text.

---

## 2. Design

### 2.1 Root Help: `qcut-pipeline --help --json`

```json
{
  "status": "ok",
  "data": {
    "version": "1.0.0",
    "description": "AI content generation CLI",
    "categories": [
      {
        "name": "generation",
        "label": "Generation Commands",
        "commands": ["generate-image", "create-video", "generate-avatar", "generate-grid", "upscale-image", "transfer-motion", "generate-remotion"]
      },
      {
        "name": "pipeline",
        "label": "Pipeline Commands",
        "commands": ["run-pipeline", "pipeline:status"]
      },
      {
        "name": "analysis",
        "label": "Analysis Commands",
        "commands": ["analyze-video", "query-video", "transcribe"]
      },
      {
        "name": "models",
        "label": "Model Listing",
        "commands": ["list-models", "list-avatar-models", "list-video-models", "list-motion-models", "list-speech-models", "estimate-cost"]
      },
      {
        "name": "keys",
        "label": "API Key Management",
        "commands": ["setup", "set-key", "get-key", "delete-key", "check-keys"]
      },
      {
        "name": "project",
        "label": "Project Setup",
        "commands": ["init-project", "organize-project", "structure-info", "create-examples"]
      },
      {
        "name": "moyin",
        "label": "Moyin Commands",
        "commands": ["moyin:parse-script"]
      },
      {
        "name": "vimax",
        "label": "ViMax Commands",
        "commands": ["vimax:idea2video", "vimax:script2video", "vimax:novel2movie", "vimax:extract-characters", "vimax:generate-script", "vimax:generate-storyboard", "vimax:generate-portraits", "vimax:create-registry", "vimax:show-registry", "vimax:list-models"]
      },
      {
        "name": "editor",
        "label": "Editor Commands",
        "commands": ["editor:health", "editor:media:*", "editor:project:*", "editor:timeline:*", "editor:editing:*", "editor:analyze:*", "editor:transcribe:*", "editor:generate:*", "editor:export:*", "editor:diagnostics:analyze", "editor:mcp:forward-html", "editor:navigator:*", "editor:screen-recording:*", "editor:remotion:*", "editor:ui:switch-panel", "editor:moyin:*", "editor:screenshot:capture"]
      }
    ],
    "commands": [
      {
        "name": "generate-image",
        "description": "Generate an image from text",
        "category": "generation"
      }
    ],
    "globalFlags": [
      { "name": "--output-dir", "short": "-o", "type": "string", "default": "./output", "description": "Output directory" },
      { "name": "--model", "short": "-m", "type": "string", "description": "Model key (e.g. kling_2_6_pro, flux_dev)" },
      { "name": "--json", "type": "boolean", "default": false, "description": "Output results as JSON" },
      { "name": "--quiet", "short": "-q", "type": "boolean", "default": false, "description": "Suppress progress output" },
      { "name": "--verbose", "short": "-v", "type": "boolean", "default": false, "description": "Verbose output" },
      { "name": "--help", "short": "-h", "type": "boolean", "description": "Show help" },
      { "name": "--version", "type": "boolean", "description": "Show version" },
      { "name": "--session", "type": "boolean", "default": false, "description": "Session mode: read commands from stdin" },
      { "name": "--skip-health", "type": "boolean", "default": false, "description": "Skip editor health check" },
      { "name": "--no-capability-check", "type": "boolean", "default": false, "description": "Skip per-request capability warnings" },
      { "name": "--host", "type": "string", "description": "Editor API host (default: 127.0.0.1)" },
      { "name": "--port", "type": "string", "description": "Editor API port (default: 8765)" },
      { "name": "--token", "type": "string", "description": "Editor API auth token" }
    ]
  }
}
```

### 2.2 Subcommand Help: `qcut-pipeline generate-image --help --json`

```json
{
  "status": "ok",
  "data": {
    "command": "generate-image",
    "description": "Generate an image from text",
    "category": "generation",
    "usage": "qcut-pipeline generate-image -t \"A cat in space\" [options]",
    "flags": [
      { "name": "--text", "short": "-t", "type": "string", "required": true, "description": "Text prompt for generation" },
      { "name": "--model", "short": "-m", "type": "string", "default": "flux_dev", "description": "Model key" },
      { "name": "--aspect-ratio", "type": "string", "description": "Aspect ratio (e.g. 16:9, 9:16)" },
      { "name": "--resolution", "type": "string", "description": "Resolution (e.g. 1080p, 720p)" },
      { "name": "--negative-prompt", "type": "string", "description": "Negative prompt" },
      { "name": "--count", "type": "number", "description": "Generate N copies in parallel" },
      { "name": "--prompts", "type": "string[]", "description": "Multiple prompts for batch generation (repeatable)" },
      { "name": "--output-dir", "short": "-o", "type": "string", "default": "./output", "description": "Output directory" }
    ],
    "examples": [
      "qcut-pipeline generate-image -t \"A cat in space\"",
      "qcut-pipeline generate-image -t \"Ocean sunset\" -m flux_dev --aspect-ratio 16:9",
      "qcut-pipeline generate-image -t \"Logo design\" --count 4 --json"
    ]
  }
}
```

---

## 3. Command Registry — DONE

Created as three files to stay within the 800-line-per-file limit:
- `electron/native-pipeline/cli/command-registry-types.ts` — shared types (FlagDef, CommandDef, CategoryDef)
- `electron/native-pipeline/cli/command-registry.ts` — global flags, categories, non-editor commands (38), lookup helpers
- `electron/native-pipeline/cli/command-registry-editor.ts` — editor commands (87)

Total: 125 commands registered with full metadata.

### 3.1 Type Definitions

```typescript
export interface FlagDef {
  name: string;          // e.g. "--text"
  short?: string;        // e.g. "-t"
  type: "string" | "boolean" | "number" | "string[]";
  required?: boolean;
  default?: unknown;
  description: string;
}

export interface CommandDef {
  name: string;          // e.g. "generate-image"
  description: string;
  category: string;      // e.g. "generation"
  flags: FlagDef[];      // command-specific flags (global flags are separate)
  examples: string[];
  usage?: string;        // override auto-generated usage line
}

export interface CategoryDef {
  name: string;
  label: string;
  commands: string[];
}
```

### 3.2 Registry Object

```typescript
export const COMMANDS_REGISTRY: Record<string, CommandDef> = { ... };
export const CATEGORIES: CategoryDef[] = [ ... ];
export const GLOBAL_FLAGS: FlagDef[] = [ ... ];
```

---

## 4. Implementation Plan — DONE

### Step 1: Create `command-registry.ts` (~400 lines) — DONE

- Define `FlagDef`, `CommandDef`, `CategoryDef` types
- Define `GLOBAL_FLAGS` array (13 flags)
- Define `CATEGORIES` array (9 categories)
- Define `COMMANDS_REGISTRY` with metadata for all ~131 commands
- Each entry has: name, description, category, flags (with types/defaults), examples

### Step 2: Update `printHelp()` in `cli.ts` (~30 lines) — DONE

- Import `COMMANDS_REGISTRY`, `CATEGORIES`, `GLOBAL_FLAGS` from registry
- Check if `--json` flag is present alongside `--help`
- If `--json`: emit `jsonOk({ version, description, categories, commands, globalFlags })`
- If no `--json`: keep existing plaintext help (could optionally generate from registry)

**Key change in `parseCliArgs()`:**
```typescript
// Current (line 347-349):
if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
}

// New:
if (!command || command === "--help" || command === "-h") {
    const isJson = argv.includes("--json");
    if (isJson) {
        printHelpJson();  // emits structured JSON
    } else {
        printHelp();      // existing plaintext
    }
    process.exit(0);
}
```

### Step 3: Add per-command `--help --json` (~20 lines) — DONE

After parsing the command name but before executing, check if `--help` was passed:

```typescript
// Current (line 520-523):
if (values.help) {
    printHelp();
    process.exit(0);
}

// New:
if (values.help) {
    const isJson = values.json;
    if (isJson) {
        printCommandHelpJson(command);  // emits command-specific JSON
    } else {
        printCommandHelp(command);      // could be per-command or fall back to global
    }
    process.exit(0);
}
```

### Step 4: Helper Functions (~40 lines) — DONE

```typescript
function printHelpJson(): void {
    const commands = Object.values(COMMANDS_REGISTRY).map(cmd => ({
        name: cmd.name,
        description: cmd.description,
        category: cmd.category,
    }));
    jsonOk({ version: VERSION, description: "AI content generation CLI", categories: CATEGORIES, commands, globalFlags: GLOBAL_FLAGS });
}

function printCommandHelpJson(command: string): void {
    const def = COMMANDS_REGISTRY[command];
    if (!def) {
        jsonError(`Unknown command: ${command}`, "help:unknown-command");
        return;
    }
    jsonOk({
        command: def.name,
        description: def.description,
        category: def.category,
        usage: def.usage || `qcut-pipeline ${def.name} [options]`,
        flags: [...def.flags, ...GLOBAL_FLAGS],
        examples: def.examples,
    });
}
```

### Step 5: Replace `COMMANDS` array with registry-derived list (~5 lines) — DONE

```typescript
// Current: const COMMANDS = ["generate-image", "create-video", ...] as const;
// New: derive from registry
export const COMMANDS = Object.keys(COMMANDS_REGISTRY) as readonly string[];
```

This ensures the command list and metadata stay in sync.

---

## 5. Full Command Table

All 131 commands with their specific flags (global flags omitted — they apply to all).

### 5.1 Generation Commands

| Command | Flags | Type | Required | Default | Description |
|---------|-------|------|----------|---------|-------------|
| **generate-image** | | | | | Generate an image from text |
| | `--text` / `-t` | string | yes | | Text prompt |
| | `--model` / `-m` | string | | flux_dev | Model key |
| | `--aspect-ratio` | string | | | Aspect ratio (16:9, 9:16) |
| | `--resolution` | string | | | Resolution (1080p, 720p) |
| | `--negative-prompt` | string | | | Negative prompt |
| | `--count` | number | | | Generate N copies in parallel |
| | `--prompts` | string[] | | | Multiple prompts (repeatable) |
| | `--image-url` | string | | | Reference image URL |
| **create-video** | | | | | Create a video from text or image |
| | `--text` / `-t` | string | yes | | Text prompt |
| | `--model` / `-m` | string | | kling_2_6_pro | Model key |
| | `--duration` / `-d` | string | | | Duration (e.g. "5s") |
| | `--aspect-ratio` | string | | | Aspect ratio |
| | `--resolution` | string | | | Resolution |
| | `--image-url` | string | | | Input image URL (img2vid) |
| | `--negative-prompt` | string | | | Negative prompt |
| | `--count` | number | | | Generate N copies |
| | `--prompts` | string[] | | | Multiple prompts |
| **generate-avatar** | | | | | Generate a talking avatar video |
| | `--text` / `-t` | string | yes | | Script/speech text |
| | `--model` / `-m` | string | | | Model key |
| | `--image-url` | string | | | Avatar face image |
| | `--audio-url` | string | | | Audio URL for lip sync |
| | `--voice-id` | string | | | ElevenLabs voice ID |
| | `--duration` / `-d` | string | | | Duration |
| | `--reference-images` | string[] | | | Reference images (repeatable) |
| **generate-grid** | | | | | Generate an image grid |
| | `--text` / `-t` | string | yes | | Text prompt for grid images |
| | `--model` / `-m` | string | | flux_dev | Model key |
| | `--layout` | string | | 2x2 | Grid layout (2x2, 3x3, 2x3, 3x2, 1x2, 2x1) |
| | `--count` | number | | | Override grid count |
| | `--grid-upscale` | number | | | Upscale factor for grid |
| **upscale-image** | | | | | Upscale an image |
| | `--image` | string | yes* | | Input image path |
| | `--image-url` | string | yes* | | Input image URL (*one of image/image-url/input required) |
| | `--input` / `-i` | string | yes* | | Input image |
| | `--model` / `-m` | string | | topaz | Model key |
| | `--upscale` | string | | | Upscale factor |
| | `--grid-upscale` | number | | | Grid upscale value |
| **transfer-motion** | | | | | Transfer motion from video to image |
| | `--image-url` | string | yes | | Source image URL |
| | `--video-url` | string | yes | | Motion source video URL |
| | `--model` / `-m` | string | | kling_motion_control | Model key |
| | `--text` / `-t` | string | | | Prompt text |
| | `--prompt` | string | | | Prompt text (alias) |
| | `--orientation` | string | | | Orientation setting |
| | `--no-sound` | boolean | | false | Disable sound |
| **generate-remotion** | | | | | Generate a Remotion component from prompt |
| | `--text` / `-t` | string | yes | | Component description |
| | `--export` | boolean | | false | Export after generate |
| | `--export-format` | string | | | Export format |
| | `--fps` | number | | | Frames per second |
| | `--width` | number | | | Width in pixels |
| | `--height` | number | | | Height in pixels |

### 5.2 Pipeline Commands

| Command | Flags | Type | Required | Default | Description |
|---------|-------|------|----------|---------|-------------|
| **run-pipeline** | | | | | Run a multi-step YAML pipeline |
| | `--config` / `-c` | string | yes | | Path to YAML pipeline config |
| | `--input` / `-i` | string | | | Pipeline input text or file |
| | `--text` / `-t` | string | | | Pipeline input text (alias) |
| | `--prompt-file` | string | | | Read prompt from file |
| | `--save-intermediates` | boolean | | false | Save intermediate outputs |
| | `--parallel` | boolean | | false | Enable parallel execution |
| | `--max-workers` | number | | 8 | Max concurrent workers |
| | `--no-confirm` | boolean | | false | Skip confirmation prompt |
| | `--stream` | boolean | | false | Stream progress to stderr |
| **pipeline:status** | | | | | Get pipeline job status |
| | `--job-id` | string | yes | | Pipeline job ID |

### 5.3 Analysis Commands

| Command | Flags | Type | Required | Default | Description |
|---------|-------|------|----------|---------|-------------|
| **analyze-video** | | | | | Analyze a video with AI vision |
| | `--input` / `-i` | string | yes | | Video path or URL |
| | `--model` / `-m` | string | | fal_video_qa | Model key |
| | `--analysis-type` | string | | | Type: timeline, summary, description, transcript |
| | `--output-format` / `-f` | string | | | Output format |
| **query-video** | | | | | Query a video with custom prompt |
| | `--input` / `-i` | string | yes | | Video path or URL |
| | `--prompt` | string | | | Custom query prompt |
| | `--model` / `-m` | string | | | Model key |
| **transcribe** | | | | | Transcribe audio to text |
| | `--input` / `-i` | string | yes | | Audio path or URL |
| | `--model` / `-m` | string | | | Model key |
| | `--language` | string | | | Language code |
| | `--no-diarize` | boolean | | false | Disable speaker diarization |
| | `--no-tag-events` | boolean | | false | Don't tag timestamps |
| | `--keyterms` | string[] | | | Key terms (repeatable) |
| | `--srt` | boolean | | false | Generate SRT subtitle |
| | `--srt-max-words` | number | | | Max words per SRT line |
| | `--srt-max-duration` | number | | | Max duration per SRT line |
| | `--raw-json` | boolean | | false | Output raw JSON |

### 5.4 Model & Cost Commands

| Command | Flags | Type | Required | Default | Description |
|---------|-------|------|----------|---------|-------------|
| **list-models** | | | | | List available AI models |
| | `--category` | string | | | Filter by category |
| **list-avatar-models** | | | | | List avatar models (alias for list-models --category avatar) |
| **list-video-models** | | | | | List video models |
| **list-motion-models** | | | | | List motion transfer models |
| **list-speech-models** | | | | | List speech/TTS models |
| **estimate-cost** | | | | | Estimate generation cost |
| | `--model` / `-m` | string | | | Model key |
| | `--text` / `-t` | string | | | Text prompt |
| | `--duration` / `-d` | string | | | Duration |
| | `--count` | number | | | Number of items |

### 5.5 API Key Management

| Command | Flags | Type | Required | Default | Description |
|---------|-------|------|----------|---------|-------------|
| **setup** | | | | | Create API key template file |
| | *(no specific flags)* | | | | |
| **set-key** | | | | | Set an API key |
| | `--name` | string | yes | | Key name (e.g. FAL_KEY) |
| | `--value` | string | | | Key value (prompted if omitted) |
| **get-key** | | | | | Get an API key (masked) |
| | `--name` | string | yes | | Key name |
| | `--reveal` | boolean | | false | Show unmasked value |
| **delete-key** | | | | | Delete a stored API key |
| | `--name` | string | yes | | Key name |
| **check-keys** | | | | | Check configured API keys |
| | *(no specific flags)* | | | | |

### 5.6 Project Setup

| Command | Flags | Type | Required | Default | Description |
|---------|-------|------|----------|---------|-------------|
| **init-project** | | | | | Initialize project directory structure |
| | `--directory` | string | | . | Project directory |
| **organize-project** | | | | | Organize media files into categories |
| | `--directory` | string | | . | Project directory |
| | `--dry-run` | boolean | | false | Preview without moving files |
| | `--recursive` | boolean | | false | Recurse into subdirectories |
| **structure-info** | | | | | Show project structure and file counts |
| | `--directory` | string | | . | Project directory |
| | `--include-output` | boolean | | false | Include output directory |
| **create-examples** | | | | | Create example pipeline configs |
| | *(no specific flags beyond --output-dir)* | | | | |

### 5.7 Moyin Commands

| Command | Flags | Type | Required | Default | Description |
|---------|-------|------|----------|---------|-------------|
| **moyin:parse-script** | | | | | Parse screenplay into structured data |
| | `--script` | string | yes* | | Script file path |
| | `--input` / `-i` | string | yes* | | Script file or stdin (*one required) |
| | `--text` / `-t` | string | yes* | | Inline script text |
| | `--model` / `-m` | string | | | LLM model |
| | `--llm-model` | string | | | LLM model (alias) |
| | `--language` | string | | | Language hint |
| | `--max-scenes` | number | | | Max scenes to parse |
| | `--stream` | boolean | | false | Enable streaming output |

### 5.8 ViMax Commands

| Command | Flags | Type | Required | Default | Description |
|---------|-------|------|----------|---------|-------------|
| **vimax:idea2video** | | | | | Generate video from an idea |
| | `--idea` | string | yes | | The idea/concept |
| | `--title` | string | | | Project title |
| | `--max-scenes` | number | | | Max scenes |
| | `--scripts-only` | boolean | | false | Generate scripts only |
| | `--storyboard-only` | boolean | | false | Stop after storyboard |
| | `--no-portraits` | boolean | | false | Skip portrait generation |
| | `--llm-model` | string | | | LLM model |
| | `--image-model` | string | | | Image generation model |
| | `--video-model` | string | | | Video generation model |
| | `--no-references` | boolean | | false | Skip reference images |
| **vimax:script2video** | | | | | Generate video from a script |
| | `--script` | string | yes | | Script file path |
| | `--title` | string | | | Project title |
| | `--storyboard-only` | boolean | | false | Stop after storyboard |
| | `--no-portraits` | boolean | | false | Skip portrait generation |
| | `--image-model` | string | | | Image generation model |
| | `--video-model` | string | | | Video generation model |
| | `--no-references` | boolean | | false | Skip reference images |
| **vimax:novel2movie** | | | | | Generate movie from a novel |
| | `--novel` | string | yes | | Novel file path |
| | `--title` | string | | | Project title |
| | `--max-scenes` | number | | | Max scenes |
| | `--scripts-only` | boolean | | false | Generate scripts only |
| | `--no-portraits` | boolean | | false | Skip portrait generation |
| | `--llm-model` | string | | | LLM model |
| | `--image-model` | string | | | Image generation model |
| | `--video-model` | string | | | Video generation model |
| **vimax:extract-characters** | | | | | Extract characters from text |
| | `--text` / `-t` | string | yes | | Text to extract from |
| **vimax:generate-script** | | | | | Generate screenplay from idea |
| | `--idea` | string | yes | | The idea/concept |
| | `--title` | string | | | Project title |
| | `--max-scenes` | number | | | Max scenes |
| | `--llm-model` | string | | | LLM model |
| **vimax:generate-storyboard** | | | | | Generate storyboard from script |
| | `--script` | string | yes | | Script file path |
| | `--image-model` | string | | | Image generation model |
| **vimax:generate-portraits** | | | | | Generate character portraits |
| | `--portraits` / `-p` | string | yes | | Character JSON |
| | `--max-characters` | number | | | Max characters to generate |
| | `--image-model` | string | | | Image generation model |
| | `--style` | string | | | Art style |
| | `--reference-model` | string | | | Reference model |
| | `--reference-strength` | number | | | Reference strength (0-1) |
| | `--views` | string | | | Portrait views to generate |
| | `--save-registry` | boolean | | true | Save portrait registry |
| **vimax:create-registry** | | | | | Create portrait registry from files |
| | `--directory` | string | yes | | Directory with portrait images |
| | `--save-registry` | boolean | | true | Save registry file |
| **vimax:show-registry** | | | | | Display registry contents |
| | `--project-id` | string | | | Project ID or directory |
| **vimax:list-models** | | | | | List ViMax-specific models |
| | *(no specific flags)* | | | | |

### 5.9 Editor Commands

All editor commands share these common flags:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--project-id` | string | | Project ID (required for most) |
| `--host` | string | 127.0.0.1 | Editor API host |
| `--port` | string | 8765 | Editor API port |
| `--token` | string | | API auth token |
| `--skip-health` | boolean | false | Skip editor health check |
| `--no-capability-check` | boolean | false | Skip capability warnings |
| `--timeout` | number | | Job timeout in seconds |

#### Editor: Health

| Command | Extra Flags | Description |
|---------|-------------|-------------|
| **editor:health** | *(none beyond common)* | Check editor connectivity |

#### Editor: Media (10 commands)

| Command | Extra Flags | Description |
|---------|-------------|-------------|
| **editor:media:list** | `--project-id` (req) | List media files |
| **editor:media:info** | `--project-id` (req), `--media-id` (req) | Get media info |
| **editor:media:import** | `--project-id` (req), `--source` (req), `--add-to-timeline` | Import local file |
| **editor:media:import-url** | `--project-id` (req), `--url` (req), `--filename` | Import from URL |
| **editor:media:batch-import** | `--project-id` (req), `--items` OR `--sources` | Batch import (max 20) |
| **editor:media:extract-frame** | `--project-id` (req), `--media-id` (req), `--start-time` (req), `--output-format` | Extract frame |
| **editor:media:rename** | `--project-id` (req), `--media-id` (req), `--new-name` (req) | Rename media |
| **editor:media:delete** | `--project-id` (req), `--media-id` (req) | Delete media |

#### Editor: Project (11 commands)

| Command | Extra Flags | Description |
|---------|-------------|-------------|
| **editor:project:settings** | `--project-id` (req) | Get project settings |
| **editor:project:update-settings** | `--project-id` (req), `--data` (req) | Update settings |
| **editor:project:stats** | `--project-id` (req) | Get project statistics |
| **editor:project:summary** | `--project-id` (req) | Get markdown summary |
| **editor:project:report** | `--project-id` (req) | Generate pipeline report |
| **editor:project:create** | `--new-name` (req) | Create project |
| **editor:project:delete** | `--project-id` (req) | Delete project |
| **editor:project:rename** | `--project-id` (req), `--new-name` (req) | Rename project |
| **editor:project:duplicate** | `--project-id` (req) | Duplicate project |
| **editor:project:list** | *(none)* | List all projects |
| **editor:project:info** | `--project-id` (req) | Get project info |

#### Editor: Timeline (18 commands)

| Command | Extra Flags | Description |
|---------|-------------|-------------|
| **editor:timeline:export** | `--project-id` (req), `--output-format`, `--mode` | Export timeline |
| **editor:timeline:import** | `--project-id` (req), `--data` (req), `--replace`, `--output-format` | Import timeline |
| **editor:timeline:add-element** | `--project-id` (req), `--data` (req) | Add element |
| **editor:timeline:batch-add** | `--project-id` (req), `--elements` (req) | Batch add (max 50) |
| **editor:timeline:update-element** | `--project-id` (req), `--element-id` (req), `--data` (req) | Update element |
| **editor:timeline:batch-update** | `--project-id` (req), `--updates` (req) | Batch update |
| **editor:timeline:delete-element** | `--project-id` (req), `--element-id` (req) | Delete element |
| **editor:timeline:batch-delete** | `--project-id` (req), `--cuts` (req) | Batch delete |
| **editor:timeline:split** | `--project-id` (req), `--element-id` (req), `--split-time` (req) | Split element |
| **editor:timeline:move** | `--project-id` (req), `--element-id` (req), `--time` (req), `--to-track`, `--ripple`, `--cross-track-ripple` | Move element |
| **editor:timeline:arrange** | `--project-id` (req), `--mode` (req) | Arrange elements |
| **editor:timeline:select** | `--project-id` (req), `--element-id` (req) | Select element |
| **editor:timeline:get-selection** | `--project-id` (req) | Get selection |
| **editor:timeline:clear-selection** | `--project-id` (req) | Clear selection |
| **editor:timeline:play** | `--project-id` (req) | Play |
| **editor:timeline:pause** | `--project-id` (req) | Pause |
| **editor:timeline:toggle-play** | `--project-id` (req) | Toggle play/pause |
| **editor:timeline:seek** | `--project-id` (req), `--time` (req) | Seek to time |
| **editor:timeline:info** | `--project-id` (req) | Get timeline state |
| **editor:timeline:add-clip** | `--project-id` (req), `--media-id` (req) | Add media clip |
| **editor:timeline:trim** | `--project-id` (req), `--element-id` (req), `--start-time` (req), `--end-time` (req) | Trim element |

#### Editor: Editing (7 commands)

| Command | Extra Flags | Description |
|---------|-------------|-------------|
| **editor:editing:batch-cuts** | `--project-id` (req), `--cuts` (req) | Batch cut operations |
| **editor:editing:delete-range** | `--project-id` (req), `--start-time` (req), `--end-time` (req) | Delete time range |
| **editor:editing:auto-edit** | `--project-id` (req), `--remove-fillers`, `--remove-silences`, `--threshold`, `--poll` | Auto-edit |
| **editor:editing:auto-edit-status** | `--project-id` (req), `--job-id` (req) | Check auto-edit status |
| **editor:editing:auto-edit-list** | `--project-id` (req) | List auto-edit jobs |
| **editor:editing:suggest-cuts** | `--project-id` (req), `--threshold`, `--prompt`, `--poll` | AI suggest cuts |
| **editor:editing:suggest-status** | `--project-id` (req), `--job-id` (req) | Check suggest status |

#### Editor: Analysis (5 commands)

| Command | Extra Flags | Description |
|---------|-------------|-------------|
| **editor:analyze:video** | `--project-id` (req), `--source` (req), `--analysis-type`, `--model`, `--output-format` | Analyze video |
| **editor:analyze:models** | *(none)* | List analysis models |
| **editor:analyze:scenes** | `--project-id` (req), `--media-id` (req), `--threshold`, `--model` | Detect scenes |
| **editor:analyze:frames** | `--project-id` (req), `--media-id` (req), `--timestamps`, `--gap`, `--prompt` | Analyze frames |
| **editor:analyze:fillers** | `--project-id` (req), `--media-id`, `--data` | Detect fillers |

#### Editor: Transcription (5 commands)

| Command | Extra Flags | Description |
|---------|-------------|-------------|
| **editor:transcribe:run** | `--project-id` (req), `--media-id` (req), `--model`, `--language` | Sync transcribe |
| **editor:transcribe:start** | `--project-id` (req), `--media-id` (req), `--model`, `--poll` | Async transcribe |
| **editor:transcribe:status** | `--project-id` (req), `--job-id` (req) | Job status |
| **editor:transcribe:list-jobs** | `--project-id` (req) | List jobs |
| **editor:transcribe:cancel** | `--project-id` (req), `--job-id` (req) | Cancel job |

#### Editor: Generation (6 commands)

| Command | Extra Flags | Description |
|---------|-------------|-------------|
| **editor:generate:start** | `--project-id` (req), `--data`, `--poll`, `--poll-interval` | Start generation |
| **editor:generate:status** | `--project-id` (req), `--job-id` (req) | Job status |
| **editor:generate:list-jobs** | `--project-id` (req) | List jobs |
| **editor:generate:cancel** | `--project-id` (req), `--job-id` (req) | Cancel job |
| **editor:generate:models** | *(none)* | List generation models |
| **editor:generate:estimate-cost** | `--model`, `--text` | Estimate cost |

#### Editor: Export (5 commands)

| Command | Extra Flags | Description |
|---------|-------------|-------------|
| **editor:export:presets** | `--project-id` (req) | List presets |
| **editor:export:recommend** | `--project-id` (req), `--target` | Recommend settings |
| **editor:export:start** | `--project-id` (req), `--preset`, `--poll`, `--filename`, `--export-format` OR `--format` | Start export |
| **editor:export:status** | `--project-id` (req), `--job-id` (req) | Export status |
| **editor:export:list-jobs** | `--project-id` (req) | List export jobs |

#### Editor: Misc (11 commands)

| Command | Extra Flags | Description |
|---------|-------------|-------------|
| **editor:diagnostics:analyze** | `--project-id` (req), `--message` (req), `--stack` | Analyze error |
| **editor:mcp:forward-html** | `--html` (req) | Forward HTML to MCP preview |
| **editor:navigator:projects** | *(none)* | List saved projects |
| **editor:navigator:open** | `--project-id` (req) | Open project |
| **editor:screen-recording:sources** | *(none)* | List capture sources |
| **editor:screen-recording:start** | `--source-id`, `--filename`, `--force` | Start recording |
| **editor:screen-recording:stop** | `--discard` | Stop recording |
| **editor:screen-recording:force-stop** | *(none)* | Force-stop recording |
| **editor:screen-recording:status** | *(none)* | Get recording status |
| **editor:ui:switch-panel** | `--panel` (req), `--tab` | Switch editor panel |
| **editor:moyin:set-script** | `--text` OR `--script` (req) | Push script to panel |
| **editor:moyin:parse** | *(none)* | Trigger parse button |
| **editor:moyin:status** | *(none)* | Get pipeline progress |
| **editor:screenshot:capture** | `--filename` | Take screenshot |
| **editor:remotion:list** | `--project-id` (req) | List Remotion elements |
| **editor:remotion:inspect** | `--project-id` (req), `--element-id` (req) | Inspect element |
| **editor:remotion:update-props** | `--project-id` (req), `--element-id` (req), `--data` (req) | Update props |
| **editor:remotion:export** | `--project-id` (req), `--preset`, `--filename` | Export with Remotion |

---

## 6. Effort Estimate

| Component | Est. Lines | Complexity |
|-----------|-----------|------------|
| `command-registry.ts` — types + registry data | ~400 | Low (data entry) |
| `cli.ts` — hook into `--help --json` | ~50 | Low |
| `printHelpJson()` + `printCommandHelpJson()` | ~40 | Low |
| Replace `COMMANDS` array with registry-derived | ~5 | Low |
| Unit tests for help JSON output | ~60 | Low |
| **Total** | **~555** | **Low risk** |

The registry file will be the largest piece (~400 lines), but it's purely declarative data — no logic, no risk of introducing bugs.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Registry drifts from actual parseArgs | Derive `COMMANDS` array from registry keys; CI test that registry keys match |
| New commands added without registry entry | TypeScript — registry key type derived from COMMANDS tuple ensures compile-time check |
| Registry file > 800 lines | Split into `command-registry-editor.ts` for the ~80 editor commands if needed |

---

## 8. Non-Goals (Out of Scope)

- Replacing the plaintext `--help` output (keep as-is)
- Per-command `--help` (text mode) — currently falls back to global help; could be added later
- Shell completions generation from registry (future use)
- OpenAPI/JSON Schema generation (future use)
