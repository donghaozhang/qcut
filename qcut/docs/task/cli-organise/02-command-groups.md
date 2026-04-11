# Task 2: Command Group Router

Add hierarchical `<group> <action>` command parsing alongside the existing flat commands.

## Why

Resource-first grouping (`gen image` vs `generate-image`) improves discoverability for humans and predictability for AI agents. The group router translates `gen image` → `generate-image` internally, so all existing handlers work unchanged.

## Relevant Files

| File | Role | Lines |
|------|------|-------|
| `electron/native-pipeline/cli/cli.ts` | `parseCliArgs()` — argv parsing (lines 50-657) | 814 |
| `electron/native-pipeline/cli/command-registry.ts` | `COMMANDS_REGISTRY`, `CATEGORIES` | 1,409 |
| `electron/native-pipeline/cli/command-registry-types.ts` | `CommandDef`, `CategoryDef` | 34 |
| **New**: `electron/native-pipeline/cli/command-groups.ts` | Group definitions + resolver | ~120 |

## Implementation

### 1. Define command groups

```typescript
// command-groups.ts

export interface CommandGroup {
  name: string;          // "gen"
  label: string;         // "Generation"
  description: string;   // "Generate images, videos, avatars, music"
  actions: Record<string, string>; // action → internal command name
}

export const COMMAND_GROUPS: CommandGroup[] = [
  {
    name: "gen",
    label: "Generation",
    description: "Generate images, videos, avatars, music, and grids",
    actions: {
      image: "generate-image",
      video: "create-video",
      avatar: "generate-avatar",
      music: "generate-speech",   // TTS/music shares speech handler
      grid: "generate-grid",
    },
  },
  {
    name: "analyze",
    label: "Analysis",
    description: "Analyze video, image, or query media content",
    actions: {
      video: "analyze-video",
      image: "analyze-video",     // same handler, --mode flag distinguishes
      query: "query-video",
    },
  },
  {
    name: "audio",
    label: "Audio & Language",
    description: "Transcribe, translate, and synthesize speech",
    actions: {
      transcribe: "transcribe",
      translate: "translate-video",
      tts: "generate-speech",
    },
  },
  {
    name: "edit",
    label: "Editing & Production",
    description: "Autoclip, upscale, motion transfer, and compositing",
    actions: {
      autoclip: "autoclip",
      upscale: "upscale-image",
      motion: "transfer-motion",
      compose: "stamp-image",
    },
  },
  {
    name: "flow",
    label: "Workflows & Orchestration",
    description: "ViMax pipelines, YAML workflows, script/character generation",
    actions: {
      run: "run-pipeline",
      idea2video: "vimax:idea2video",
      script2video: "vimax:script2video",
      novel2movie: "vimax:novel2movie",
      script: "vimax:generate-script",
      characters: "vimax:extract-characters",
      portraits: "vimax:generate-portraits",
      storyboard: "vimax:generate-storyboard",
      "registry-create": "vimax:create-registry",
      "registry-show": "vimax:show-registry",
    },
  },
  {
    name: "system",
    label: "System & Configuration",
    description: "Auth, keys, models, project setup, and diagnostics",
    actions: {
      login: "login",
      signup: "signup",
      logout: "logout",
      setup: "setup",
      "set-key": "set-key",
      "check-keys": "check-keys",
      models: "list-models",
      "models-video": "list-video-models",
      "models-avatar": "list-avatar-models",
      "project-init": "init-project",
      "project-organize": "organize-project",
      "project-info": "structure-info",
      examples: "create-examples",
      cost: "estimate-cost",
    },
  },
];
```

### 2. Add group resolver function

```typescript
// command-groups.ts

/**
 * Resolves `["gen", "image"]` → "generate-image"
 * Returns null if argv doesn't match any group pattern.
 */
export function resolveCommandGroup(argv: string[]): {
  command: string;
  remainingArgs: string[];
} | null {
  if (argv.length < 2) return null;

  const [groupName, actionName, ...rest] = argv;
  const group = COMMAND_GROUPS.find((g) => g.name === groupName);
  if (!group) return null;

  const command = group.actions[actionName];
  if (!command) return null;

  return { command, remainingArgs: rest };
}
```

### 3. Integrate into cli.ts parseCliArgs()

At the top of `parseCliArgs()` (around line 55), before existing command lookup:

```typescript
// Try group resolution first: "gen image" → "generate-image"
const groupResult = resolveCommandGroup(positionals);
if (groupResult) {
  commandName = groupResult.command;
  positionals = groupResult.remainingArgs;
} else {
  commandName = positionals[0];
}
```

This way `qcut gen image -t "cat"` and `qcut generate-image -t "cat"` both resolve to the same internal command and handler.

### 4. Update CATEGORIES for help display

Add new category entries in `command-registry.ts` that reference the group taxonomy for `--help` output, while keeping existing categories for backward compat.

## Verification

- `bun run pipeline gen image -t "test" --help` — shows generate-image help
- `bun run pipeline flow idea2video --idea "test" --help` — shows vimax:idea2video help
- `bun run pipeline system models --json` — lists models
- `bun run pipeline generate-image -t "test" --help` — still works (flat command)
- `bun run pipeline --help` — shows both group and flat command listings

## Risk

Medium-low. The resolver is additive — it runs before existing parsing, falling through to flat commands if no group matches. No existing behavior changes.
