# Daytona Sandbox Large File Split Record

Date: 2026-05-19
Branch: `cli-image-v7`

## Result

Implemented. The active Daytona sandbox worker, API route, website chat script, and their focused test files are now below 800 lines.

## Split Summary

| Area | Before | After | Status |
| --- | ---: | ---: | --- |
| `packages/agent-worker/src/run-on-daytona.ts` | 1089 | 244 | Split into `packages/agent-worker/src/daytona/*`. |
| `packages/agent-worker/src/run-on-daytona.test.ts` | 1200 | Removed | Split into four focused tests plus `run-on-daytona.test-utils.ts`. |
| `packages/license-server/src/routes/agent.ts` | 1857 | 156 | Split into `packages/license-server/src/routes/agent-parts/*`. |
| `packages/license-server/src/routes/agent.test.ts` | 1298 | Removed | Split into route-group tests plus `agent.test-utils.ts`. |
| `packages/nexusai-website/js/agent-chat.js` | 2329 | 35 | Replaced with a browser/CommonJS loader for split script parts. |
| `packages/nexusai-website/js/agent-chat.test.js` | 1036 | Removed | Split into API, download, prompt, and shared test utility files. |

## New Structure

Worker modules:

| File | Responsibility |
| --- | --- |
| `packages/agent-worker/src/daytona/constants.ts` | Daytona image/resource defaults and timing constants. |
| `packages/agent-worker/src/daytona/types.ts` | Daytona dependency and sandbox interfaces. |
| `packages/agent-worker/src/daytona/events.ts` | Agent event insertion helpers. |
| `packages/agent-worker/src/daytona/command.ts` | QCut/Codex command construction and shell quoting. |
| `packages/agent-worker/src/daytona/env.ts` | Agent secret loading and sandbox environment construction. |
| `packages/agent-worker/src/daytona/remote-files.ts` | Remote reads, archive download, and extraction. |
| `packages/agent-worker/src/daytona/sessions.ts` | Sandbox reuse, session lifecycle, and cleanup. |
| `packages/agent-worker/src/daytona/streaming.ts` | Stream cursors, event parsing, and duplicate filtering. |

License-server route modules:

| File | Responsibility |
| --- | --- |
| `packages/license-server/src/routes/agent-parts/constants.ts` | Shared route constants. |
| `packages/license-server/src/routes/agent-parts/validation.ts` | Command, file path, and filename validation. |
| `packages/license-server/src/routes/agent-parts/serializers.ts` | Job/session/artifact/file response serialization. |
| `packages/license-server/src/routes/agent-parts/data-access.ts` | Shared DB lookup helpers. |
| `packages/license-server/src/routes/agent-parts/auth.ts` | Agent auth and default user resolution. |
| `packages/license-server/src/routes/agent-parts/sessions.ts` | Session create/reuse/end routes. |
| `packages/license-server/src/routes/agent-parts/daytona.ts` | Daytona SDK client and terminal sandbox creation. |
| `packages/license-server/src/routes/agent-parts/terminal.ts` | PTY token and relay response routes. |
| `packages/license-server/src/routes/agent-parts/jobs.ts` | Agent job submission routes. |
| `packages/license-server/src/routes/agent-parts/files.ts` | Sandbox file browsing, upload, and download routes. |

Website script parts:

| File | Lines | Responsibility |
| --- | ---: | --- |
| `packages/nexusai-website/js/agent-chat/01-runtime-api.js` | 797 | Runtime constants, prompt helpers, API wrappers, and exported `AgentChatAPI`. |
| `packages/nexusai-website/js/agent-chat/02-ui-files.js` | 765 | Message/artifact rendering, sandbox file browser, uploads, and downloads. |
| `packages/nexusai-website/js/agent-chat/03-terminal-job.js` | 630 | Terminal websocket, Codex input, job polling, and live status handling. |
| `packages/nexusai-website/js/agent-chat/04-bootstrap.js` | 125 | Page initialization and event binding. |

Test files:

| File | Lines |
| --- | ---: |
| `packages/agent-worker/src/run-on-daytona.command.test.ts` | 148 |
| `packages/agent-worker/src/run-on-daytona.ephemeral.test.ts` | 387 |
| `packages/agent-worker/src/run-on-daytona.sessions.test.ts` | 324 |
| `packages/agent-worker/src/run-on-daytona.cleanup.test.ts` | 227 |
| `packages/license-server/src/routes/agent.validation.test.ts` | 105 |
| `packages/license-server/src/routes/agent.sessions.test.ts` | 95 |
| `packages/license-server/src/routes/agent.terminal-token.test.ts` | 155 |
| `packages/license-server/src/routes/agent.files.test.ts` | 561 |
| `packages/license-server/src/routes/agent.artifacts.test.ts` | 85 |
| `packages/license-server/src/routes/agent.jobs.test.ts` | 163 |
| `packages/nexusai-website/js/agent-chat.api.test.js` | 424 |
| `packages/nexusai-website/js/agent-chat.download.test.js` | 368 |
| `packages/nexusai-website/js/agent-chat.prompt.test.js` | 250 |

## Verification

Passed:

- `cd packages/agent-worker && bun run test` — 46 tests.
- `cd packages/license-server && bun run test` — 129 tests.
- `node --test packages/nexusai-website/js/agent-chat.*.test.js` — 33 tests.
- `npx @biomejs/biome check packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/daytona packages/agent-worker/src/run-on-daytona*.test.ts packages/license-server/src/routes/agent.ts packages/license-server/src/routes/agent-parts packages/license-server/src/routes/agent*.test.ts packages/nexusai-website/js/agent-chat.js packages/nexusai-website/js/agent-chat*.test.js packages/nexusai-website/js/agent-chat.test-utils.js`
- `cd packages/agent-worker && bunx tsc --noEmit`

Line audit:

- `rg -l "Daytona|daytona|sandbox|Sandbox|agent-chat|qcut-output|qcut-input" packages docs/task/daytona-supabase-agent | xargs wc -l | awk '$1 > 800'` returned no active Daytona sandbox files over 800 lines. (The `rg -l` list is piped to `wc -l`, then `awk` filters for files whose line count exceeds the 800-line threshold.)

Known verification note:

- `cd packages/license-server && bunx tsc --noEmit` still fails before source checking with `TS2688: Cannot find type definition file for 'sharp'`. This is an existing package type resolution issue, not introduced by the Daytona split.

## Behavior Notes

- The website keeps the existing `chat-agent.html` script path. `agent-chat.js` now synchronously loads the four script parts in the browser, and in CommonJS tests it concatenates the same parts into the current module.
- A new loader test verifies browser script injection for the split frontend files.
- Splitting `agent.test.ts` exposed a hidden test-order dependency in the terminal-token tests. The affected test now creates its own `db.insert` mock fixture.

## Exclusions

The audit intentionally excludes generated/reference code under `docs/task/provider-expansion/openclaw-files/` and the large CLI registry at `electron/native-pipeline/cli/command-registry.ts`. Those files may mention sandbox-related text, but they are not the active Daytona web, API, or worker implementation.
