# Task 3: Alias & Deprecation System

Add backward-compatible aliases so old commands emit deprecation warnings while routing to the same handlers.

## Why

Scripts and muscle memory depend on old command names. A hard break loses trust. Aliases with warnings let users migrate at their own pace while keeping the codebase moving toward the new taxonomy.

## Relevant Files

| File | Role | Lines |
|------|------|-------|
| `electron/native-pipeline/cli/cli.ts` | Command name resolution (line ~55) | 814 |
| `electron/native-pipeline/cli/cli-runner/runner.ts` | Command execution | 576 |
| **New**: `electron/native-pipeline/cli/aliases.ts` | Alias map + deprecation logic | ~80 |

## Implementation

### 1. Define alias map

```typescript
// aliases.ts

/**
 * Maps old command names to their canonical new group form.
 * Used for deprecation warnings — the internal command name stays the same.
 */
export const COMMAND_ALIASES: Record<string, { canonical: string; suggestion: string }> = {
  "generate-image":         { canonical: "generate-image",         suggestion: "gen image" },
  "create-video":           { canonical: "create-video",           suggestion: "gen video" },
  "generate-avatar":        { canonical: "generate-avatar",        suggestion: "gen avatar" },
  "generate-grid":          { canonical: "generate-grid",          suggestion: "gen grid" },
  "analyze-video":          { canonical: "analyze-video",          suggestion: "analyze video" },
  "query-video":            { canonical: "query-video",            suggestion: "analyze query" },
  "transcribe":             { canonical: "transcribe",             suggestion: "audio transcribe" },
  "translate-video":        { canonical: "translate-video",        suggestion: "audio translate" },
  "generate-speech":        { canonical: "generate-speech",        suggestion: "audio tts" },
  "autoclip":               { canonical: "autoclip",               suggestion: "edit autoclip" },
  "upscale-image":          { canonical: "upscale-image",          suggestion: "edit upscale" },
  "transfer-motion":        { canonical: "transfer-motion",        suggestion: "edit motion" },
  "run-pipeline":           { canonical: "run-pipeline",           suggestion: "flow run" },
  "vimax:idea2video":       { canonical: "vimax:idea2video",       suggestion: "flow idea2video" },
  "vimax:script2video":     { canonical: "vimax:script2video",     suggestion: "flow script2video" },
  "vimax:novel2movie":      { canonical: "vimax:novel2movie",      suggestion: "flow novel2movie" },
  "vimax:generate-script":  { canonical: "vimax:generate-script",  suggestion: "flow script" },
  "vimax:extract-characters": { canonical: "vimax:extract-characters", suggestion: "flow characters" },
  "vimax:generate-portraits": { canonical: "vimax:generate-portraits", suggestion: "flow portraits" },
  "vimax:generate-storyboard": { canonical: "vimax:generate-storyboard", suggestion: "flow storyboard" },
  "list-models":            { canonical: "list-models",            suggestion: "system models" },
  "list-video-models":      { canonical: "list-video-models",      suggestion: "system models --type video" },
  "list-avatar-models":     { canonical: "list-avatar-models",     suggestion: "system models --type avatar" },
  "setup":                  { canonical: "setup",                  suggestion: "system setup" },
  "set-key":                { canonical: "set-key",                suggestion: "system set-key" },
  "check-keys":             { canonical: "check-keys",             suggestion: "system check-keys" },
  "init-project":           { canonical: "init-project",           suggestion: "system project-init" },
  "organize-project":       { canonical: "organize-project",       suggestion: "system project-organize" },
  "estimate-cost":          { canonical: "estimate-cost",          suggestion: "system cost" },
};
```

### 2. Deprecation warning function

```typescript
// aliases.ts

/**
 * Emits a deprecation warning to stderr if the command was invoked via an old flat name.
 * Only warns when the command was NOT resolved through the group router.
 */
export function warnIfDeprecated(commandName: string, wasGroupResolved: boolean): void {
  if (wasGroupResolved) return;

  const alias = COMMAND_ALIASES[commandName];
  if (!alias) return;

  console.error(
    `\x1b[33m⚠ DEPRECATED:\x1b[0m "${commandName}" → use "qcut ${alias.suggestion}" instead. ` +
    `Legacy commands will be removed in v2.0.`
  );
}
```

### 3. Integrate into cli.ts

After command resolution, before execution:

```typescript
// cli.ts — in parseCliArgs() or main(), after resolving commandName
const wasGroupResolved = groupResult !== null;
warnIfDeprecated(commandName, wasGroupResolved);
```

### 4. Suppress warnings in JSON mode

```typescript
export function warnIfDeprecated(commandName: string, wasGroupResolved: boolean, quiet = false): void {
  if (wasGroupResolved || quiet) return;
  // ... warning logic
}
```

Pass `options.json || options.quiet` as the `quiet` param to keep machine-readable output clean.

## Deprecation Timeline

| Version | Behavior |
|---------|----------|
| Current (v1.x) | Old commands work with stderr warning |
| v2.0 | Old commands require `QCUT_ENABLE_LEGACY=1` env var |
| v3.0 | Old commands removed entirely |

## Verification

- `bun run pipeline generate-image -t "test" --help` → shows warning + works
- `bun run pipeline gen image -t "test" --help` → no warning + works
- `bun run pipeline generate-image -t "test" --json 2>/dev/null` → no warning in stdout
- `bun run pipeline vimax:idea2video --help` → shows warning suggesting `flow idea2video`

## Risk

Low. Warnings go to stderr only. No behavior changes. Purely additive.
