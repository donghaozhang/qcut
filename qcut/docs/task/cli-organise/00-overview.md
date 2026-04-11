# CLI Command Architecture Refactor

- **Branch**: `qcut-cli-oragnise`
- **Source**: [qcut-cli-command-architecture-refactor-like-minimax-en.md](https://github.com/Quriosity-agent/articles/blob/main/2026-04-11/qcut-cli-command-architecture-refactor-like-minimax-en.md)
- **Principle**: Long-term maintainability > short-term speed. Reuse existing logic, don't rewrite handlers.

## Problem

~190 commands with mixed naming (`generate-*`, `create-*`, `vimax:*`, `list-*`), a monolithic 550-line switch statement in `runner.ts`, and a flat 246-field `CLIRunOptions` interface. Adding a new command requires touching 4+ files.

## Target Taxonomy

```
qcut gen     <image|video|avatar|music|grid>
qcut analyze <video|image|query>
qcut audio   <transcribe|translate|tts>
qcut edit    <autoclip|upscale|motion|compose>
qcut flow    <run|idea2video|script2video|novel2movie|script|characters|portraits|storyboard|registry>
qcut system  <auth|quota|config|doctor|quickstart|examples|models|project|publish>
```

## Architecture Change

**Before**: flat commands → `parseCliArgs()` → monolithic switch → handler function
**After**: `<group> <action>` → group router → handler registry map → same handler functions

The handler functions themselves are untouched. Only the routing layer changes.

## Subtasks

| # | Task | Est. | File | Status |
|---|------|------|------|--------|
| 1 | [Handler registry map](01-handler-registry.md) | 15 min | `cli-runner/handler-map.ts`, `runner.ts` | DONE |
| 2 | [Command group router](02-command-groups.md) | 20 min | `cli/command-groups.ts`, `cli.ts` | DONE |
| 3 | [Alias & deprecation system](03-aliases.md) | 15 min | `cli/aliases.ts`, `cli.ts` | DONE |
| 4 | [Flag normalization](04-flag-normalization.md) | 10 min | `cli.ts`, `command-registry.ts` | DEFERRED (no breaking flags yet) |
| 5 | [Update help & categories](05-help-categories.md) | 10 min | `cli-help.ts` | DONE |
| 6 | [Tests](06-tests.md) | 15 min | `electron/__tests__/cli-command-groups.test.ts` | DONE (70 tests) |

## Constraints

- **No handler rewrites**: existing `handleGenerate()`, `mediaHandleAnalyzeVideo()`, etc. stay as-is
- **Backward compatible**: old commands work via aliases with deprecation warnings for 2 minor versions
- **No new dependencies**: pure TypeScript refactor
- **800-line file limit**: split files that exceed this

## Implementation Summary

### Files Created
- `electron/native-pipeline/cli/cli-runner/handler-map.ts` — typed handler registry (replaces 310-line switch)
- `electron/native-pipeline/cli/command-groups.ts` — 6 command groups with resolver
- `electron/native-pipeline/cli/aliases.ts` — deprecation warning system

### Files Modified
- `electron/native-pipeline/cli/cli-runner/runner.ts` — switch → HANDLER_MAP lookup (576→266 lines)
- `electron/native-pipeline/cli/cli.ts` — group resolution + deprecation in parseCliArgs
- `electron/native-pipeline/cli/cli-help.ts` — groups-first help, printGroupHelp()
- `electron/native-pipeline/cli/cli-runner/index.ts` — export HANDLER_MAP
- `electron/__tests__/cli-pipeline.test.ts` — updated help assertion

### Tests
- `electron/__tests__/cli-command-groups.test.ts` — 70 tests (groups, handler map, aliases)
- All 105 tests pass (70 new + 35 existing)
