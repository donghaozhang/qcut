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

| # | Task | Est. | File |
|---|------|------|------|
| 1 | [Handler registry map](01-handler-registry.md) | 15 min | `cli-runner/handler-map.ts`, `runner.ts` |
| 2 | [Command group router](02-command-groups.md) | 20 min | `command-registry.ts`, `command-registry-types.ts` |
| 3 | [Alias & deprecation system](03-aliases.md) | 15 min | `cli/aliases.ts`, `cli.ts` |
| 4 | [Flag normalization](04-flag-normalization.md) | 10 min | `cli.ts`, `command-registry.ts` |
| 5 | [Update help & categories](05-help-categories.md) | 10 min | `cli-help.ts`, `cli-output-formatters.ts` |
| 6 | [Tests](06-tests.md) | 15 min | `electron/__tests__/cli-*.test.ts` |

## Constraints

- **No handler rewrites**: existing `handleGenerate()`, `mediaHandleAnalyzeVideo()`, etc. stay as-is
- **Backward compatible**: old commands work via aliases with deprecation warnings for 2 minor versions
- **No new dependencies**: pure TypeScript refactor
- **800-line file limit**: split files that exceed this
