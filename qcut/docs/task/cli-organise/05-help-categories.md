# Task 5: Update Help & Categories

Restructure the `--help` output to show the new group taxonomy as the primary interface.

## Why

Help output is the first thing a user or agent sees. If `--help` still shows flat commands as primary, the refactor is invisible. Show groups first, flat commands in a "legacy" section.

## Relevant Files

| File | Role | Lines |
|------|------|-------|
| `electron/native-pipeline/cli/cli-help.ts` | Help text generation | ~100 |
| `electron/native-pipeline/cli/cli-output-formatters.ts` | Output formatting utilities | ~150 |
| `electron/native-pipeline/cli/command-registry.ts` | `CATEGORIES` definition (lines 75-189) | 1,409 |
| `electron/native-pipeline/cli/command-groups.ts` | New group definitions (Task 2) | ~120 |

## Implementation

### 1. Update top-level help output

When user runs `qcut --help`, show:

```
QCut Pipeline CLI

USAGE:
  qcut <group> <action> [options]
  qcut <command> [options]          (legacy, see --help-legacy)

GROUPS:
  gen       Generate images, videos, avatars, music, and grids
  analyze   Analyze video, image, or query media content
  audio     Transcribe, translate, and synthesize speech
  edit      Autoclip, upscale, motion transfer, and compositing
  flow      ViMax pipelines, YAML workflows, script/character generation
  system    Auth, keys, models, project setup, and diagnostics

Run "qcut <group> --help" for group details.
Run "qcut --help-legacy" for flat command list.

GLOBAL OPTIONS:
  --json        JSON output
  --quiet       Suppress progress output
  --verbose     Verbose logging
  --output-dir  Output directory
  --help        Show help
  --version     Show version
```

### 2. Add group-level help

When user runs `qcut gen --help`:

```
QCut Generation Commands

USAGE:
  qcut gen <action> [options]

ACTIONS:
  image    Generate an image from text prompt
  video    Generate a video from text or image
  avatar   Generate an avatar video
  music    Generate music or sound
  grid     Generate an image comparison grid

Run "qcut gen <action> --help" for action details.
```

### 3. Keep legacy help available

`qcut --help-legacy` shows the current flat command list grouped by the existing `CATEGORIES`. This ensures nothing is lost during transition.

### 4. Generate group help from COMMAND_GROUPS

```typescript
// cli-help.ts

import { COMMAND_GROUPS } from "./command-groups.js";
import { getCommand } from "./command-registry.js";

export function printGroupHelp(groupName: string): void {
  const group = COMMAND_GROUPS.find((g) => g.name === groupName);
  if (!group) return;

  console.log(`\nQCut ${group.label} Commands\n`);
  console.log(`USAGE:\n  qcut ${group.name} <action> [options]\n`);
  console.log("ACTIONS:");

  for (const [action, internalCmd] of Object.entries(group.actions)) {
    const cmd = getCommand(internalCmd);
    const desc = cmd?.description ?? "";
    console.log(`  ${action.padEnd(16)} ${desc}`);
  }

  console.log(`\nRun "qcut ${group.name} <action> --help" for action details.\n`);
}
```

## Verification

- `bun run pipeline --help` — shows groups as primary
- `bun run pipeline gen --help` — shows gen actions
- `bun run pipeline gen image --help` — shows generate-image flags/examples
- `bun run pipeline --help-legacy` — shows old flat command list
- `bun run pipeline system --help` — shows system actions

## Risk

Low. Help output is purely cosmetic. No execution logic changes.
