# Native Pipeline CLI — Source File Map

Quick-reference for locating CLI components by responsibility.

## Core

| Component | File |
|-----------|------|
| CLI entry point | `electron/native-pipeline/cli/cli.ts` |
| Command router | `electron/native-pipeline/cli/cli-runner/runner.ts` |
| Programmatic run/runChain | `electron/native-pipeline/cli/cli-runner/run.ts` |
| CLI types + generateCommandId | `electron/native-pipeline/cli/cli-runner/types.ts` |
| Command registry (core) | `electron/native-pipeline/cli/command-registry.ts` |
| Command registry (editor) | `electron/native-pipeline/cli/command-registry-editor.ts` |
| Command registry (extra) | `electron/native-pipeline/cli/command-registry-editor-extra.ts` |
| Command registry types | `electron/native-pipeline/cli/command-registry-types.ts` |

## Output & Errors

| Component | File |
|-----------|------|
| JSON output helpers | `electron/native-pipeline/cli/json-output.ts` |
| CLI output (ANSI, hints) | `electron/native-pipeline/cli/cli-output.ts` |
| Error hierarchy + hints | `electron/native-pipeline/output/errors.ts` |
| Debug event stream | `electron/native-pipeline/infra/debug-stream.ts` |
| Pipeline stream emitter | `electron/native-pipeline/infra/stream-emitter.ts` |

## Command Handlers

| Component | File |
|-----------|------|
| Editor dispatch | `electron/native-pipeline/cli/cli-handlers-editor.ts` |
| Admin handlers | `electron/native-pipeline/cli/cli-handlers-admin.ts` |
| Media handlers | `electron/native-pipeline/cli/cli-handlers-media.ts` |
| ViMax handlers | `electron/native-pipeline/cli/vimax-cli-handlers.ts` |
| Remotion handler | `electron/native-pipeline/cli/cli-handlers-remotion.ts` |
| Moyin handler | `electron/native-pipeline/cli/cli-handlers-moyin.ts` |
| YouTube handler | `electron/native-pipeline/cli/cli-handlers-youtube.ts` |
| Snapshot handler | `electron/native-pipeline/cli/cli-handlers-snapshot.ts` |
| Console handler | `electron/native-pipeline/cli/cli-handlers-console.ts` |
| Diff handler | `electron/native-pipeline/cli/cli-handlers-diff.ts` |
| Session handler | `electron/native-pipeline/cli/cli-handlers-session.ts` |

## State & Policy

| Component | File |
|-----------|------|
| Session persistence | `electron/native-pipeline/cli/session-state.ts` |
| Action policy | `electron/native-pipeline/cli/action-policy.ts` |
| Key manager | `electron/native-pipeline/key-manager.ts` |

## Project Data

| Component | File |
|-----------|------|
| project.json types | `electron/native-pipeline/cli/project-json-types.ts` |
| project.json builder | `electron/native-pipeline/cli/project-json-builder.ts` |

## Auth & Licensing

| Component | File |
|-----------|------|
| Auth routes (HTTP) | `electron/claude/http/claude-http-server.ts` |
| Auth routes (utility) | `electron/utility/utility-http-server.ts` |
| Auth bridge | `electron/utility/utility-bridge.ts` |
| License handler | `electron/license-handler.ts` |
