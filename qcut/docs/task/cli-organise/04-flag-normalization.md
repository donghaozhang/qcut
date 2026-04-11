# Task 4: Flag Normalization

Normalize inconsistent flag names across commands to a consistent vocabulary.

## Why

Currently `--text` and `--prompt` mean the same thing in different commands. `--input` sometimes means a file path, sometimes text. This confuses agents and users switching between commands. Normalizing flags reduces cognitive load without breaking existing scripts (old flags become aliases).

## Relevant Files

| File | Role | Lines |
|------|------|-------|
| `electron/native-pipeline/cli/cli.ts` | `parseCliArgs()` flag definitions (lines 75-295) | 814 |
| `electron/native-pipeline/cli/command-registry.ts` | Per-command flag metadata | 1,409 |
| `electron/native-pipeline/cli/cli-runner/types.ts` | `CLIRunOptions` interface | 265 |

## Normalization Rules

| Canonical Flag | Aliases (kept working) | Meaning |
|----------------|----------------------|---------|
| `--prompt` | `--text`, `-t` | Text prompt for generation |
| `--input` | `-i` | Input file path (not text) |
| `--model` | `-m` | Model identifier |
| `--output-dir` | `-o` | Output directory |
| `--duration` | `-d` | Duration in seconds |
| `--aspect-ratio` | `--ar` | Aspect ratio string |
| `--format` | `--output-format` | Output format (mp4, png, etc.) |

## Implementation

### 1. Add flag alias resolution in parseCliArgs()

After parsing args, normalize aliases to canonical names:

```typescript
// cli.ts — after parseArgs(), before building CLIRunOptions

// Normalize flag aliases
if (parsed.values.text && !parsed.values.prompt) {
  parsed.values.prompt = parsed.values.text;
}
if (parsed.values["output-format"] && !parsed.values.format) {
  parsed.values.format = parsed.values["output-format"];
}
```

### 2. Update CommandDef flags in command-registry.ts

For new group commands, use canonical flag names in `flags[]` and `examples[]`. Keep old flag names in the `parseArgs` config so they still parse correctly.

### 3. Update CLIRunOptions

Add canonical field names alongside existing ones. Existing fields stay for backward compat:

```typescript
// types.ts — add to CLIRunOptions
prompt?: string;  // canonical — maps from text/prompt/input-text
// text?: string; — keep existing, resolved to prompt in parseCliArgs
```

## Verification

- `bun run pipeline gen image --prompt "cat"` — works
- `bun run pipeline gen image --text "cat"` — works (alias)
- `bun run pipeline gen image -t "cat"` — works (short alias)
- Existing scripts using `--text` continue working

## Risk

Low. This is additive alias resolution. Old flags keep working. New canonical names are preferred in docs and help output.
