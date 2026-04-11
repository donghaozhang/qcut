# Task 1: Handler Registry Map

Replace the monolithic switch statement in `runner.ts` with a typed handler registry map.

## Why

The 550-line switch in `runner.ts:241-549` is the single biggest scalability bottleneck. Every new command requires adding a case branch, importing the handler, and hoping nothing collides. A registry map is a one-line addition per command and enables dynamic dispatch for the group router (Task 2).

## Relevant Files

| File | Role | Lines |
|------|------|-------|
| `electron/native-pipeline/cli/cli-runner/runner.ts` | Switch dispatch (lines 241-549) | 576 |
| `electron/native-pipeline/cli/cli-runner/types.ts` | CLIRunOptions, CLIResult, ProgressFn | 265 |
| **New**: `electron/native-pipeline/cli/cli-runner/handler-map.ts` | Handler registry | ~150 |

## Implementation

### 1. Define handler signature type

```typescript
// handler-map.ts
import type { CLIRunOptions, CLIResult, ProgressFn } from "./types.js";
import type { PipelineExecutor } from "../../execution/pipeline-executor.js";

export type CommandHandler = (
  options: CLIRunOptions,
  onProgress: ProgressFn,
  executor: PipelineExecutor,
  signal: AbortSignal,
) => Promise<CLIResult>;
```

### 2. Build the handler map

```typescript
// handler-map.ts
export const HANDLER_MAP: Record<string, CommandHandler> = {
  // Generation
  "generate-image": handleGenerate,
  "create-video": handleGenerate,
  "generate-avatar": handleGenerate,
  "generate-grid": wrapSync(handleGenerateGrid),
  "transfer-motion": handleTransferMotion,
  "upscale-image": wrapSync(handleUpscaleImage),
  // ... all ~100 non-editor commands

  // Analysis
  "analyze-video": mediaHandleAnalyzeVideo,
  "query-video": mediaHandleQueryVideo,
  "transcribe": mediaHandleTranscribe,
  // ... etc
};
```

Use a `wrapSync()` helper for handlers that don't need all 4 params:

```typescript
function wrapSync(
  fn: (options: CLIRunOptions) => CLIResult | Promise<CLIResult>,
): CommandHandler {
  return async (options) => fn(options);
}
```

### 3. Replace switch in runner.ts

```typescript
// runner.ts run() method — replace lines 241-549 with:
const handler = HANDLER_MAP[resolvedOptions.command];
if (handler) {
  result = await handler(resolvedOptions, onProgress, this.executor, this.signal);
} else if (resolvedOptions.command.startsWith("editor:")) {
  result = await handleEditorCommand(resolvedOptions, onProgress, this.signal);
} else {
  result = { success: false, error: `Unknown command: ${resolvedOptions.command}` };
}
```

### 4. Move all handler imports to handler-map.ts

Currently `runner.ts` imports from 15+ handler files. Move those imports to `handler-map.ts` so `runner.ts` only imports `HANDLER_MAP`.

## Verification

- `bun run test` — existing tests pass
- `bun run pipeline generate-image -t "test" --help` — still works
- `bun run pipeline --help` — still lists all commands
- Spot-check 3-5 commands across categories (gen, analysis, admin, vimax)

## Risk

Low. This is a mechanical refactor — same functions, same call order, just dispatched via map instead of switch.
