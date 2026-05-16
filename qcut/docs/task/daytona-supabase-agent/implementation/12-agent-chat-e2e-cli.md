# Agent Chat E2E Test CLI

## Decision

The Chat Agent browser-to-Daytona verification is a repository test command,
not a product `qcut` CLI command.

The product CLI lives under `electron/native-pipeline/cli` and is meant for
end-user generation, editor control, and system commands. The Chat Agent E2E
test validates a deployed web/runtime chain:

```text
QCut website -> license-server -> qcut-relay -> Daytona PTY -> Codex CLI -> artifacts
```

Keeping this as a repo test command avoids exposing internal deployment checks
as user-facing CLI surface while still giving release work one repeatable entry
point.

## Commands

```bash
bun run test:agent:e2e
bun run test:agent:e2e:prod
```

Both currently default to:

```text
https://quriosity.com.au/chat-agent.html
```

Useful direct options:

```bash
bun scripts/agent-chat-e2e.ts \
  --url https://quriosity.com.au/chat-agent.html \
  --out-dir output/playwright/agent-chat-e2e-manual

bun scripts/agent-chat-e2e.ts \
  --url https://quriosity.com.au/chat-agent.html \
  --inject-local-agent-chat-js
```

`--inject-local-agent-chat-js` keeps the production page origin, API, CORS,
relay, Daytona, and Codex path, but serves the local
`packages/nexusai-website/js/agent-chat.js`. Use it when validating frontend
fixes before GitHub Pages/CDN has picked up the pushed file.

## Coverage

The smoke test performs these steps:

| Step | Assertion |
| --- | --- |
| Initial load | Terminal status is `disconnected`; Codex has not started. |
| No-click wait | Page remains disconnected after the configured wait. |
| Connect | Button opens a real Daytona PTY and Codex becomes ready. |
| Turn 1 | A prompt reaches the persistent Codex process. |
| Turn 2 | Codex creates a file under `/tmp/qcut-output`. |
| Artifact list | The file appears in the web Artifacts panel. |
| Artifact download | The Download button produces a browser download, and direct fetch confirms file contents. |
| Disconnect | Terminal state resets to the disconnected placeholder. |
| Reconnect | The same page can connect back to Codex. |

Every run writes:

```text
output/playwright/agent-chat-e2e-*/01-initial-load.png
output/playwright/agent-chat-e2e-*/02-no-click-still-disconnected.png
output/playwright/agent-chat-e2e-*/03-connect-codex-ready.png
output/playwright/agent-chat-e2e-*/04-turn-one.png
output/playwright/agent-chat-e2e-*/05-artifact-visible.png
output/playwright/agent-chat-e2e-*/06-artifact-download.png
output/playwright/agent-chat-e2e-*/07-disconnected-clean.png
output/playwright/agent-chat-e2e-*/08-reconnect-codex-ready.png
output/playwright/agent-chat-e2e-*/result.json
```

## What This Does Not Test By Default

The default smoke test intentionally does not download YouTube videos or run
large media generation jobs. Those flows are slower and depend on third-party
network behavior, so they should be release/nightly checks rather than every
manual smoke run.

The default artifact is a small text file. This still proves the important
session artifact path:

```text
Codex writes /tmp/qcut-output/file -> license-server lists it -> website renders it -> user downloads it
```

## Relationship To Existing CLI E2E

Existing `bun run test:cli-e2e` covers the installed `qcut` command talking to
the local editor bridge. This new command covers the website-hosted agent path.

They are sibling verification layers:

| Command | Scope |
| --- | --- |
| `bun run test:cli-e2e` | Local product CLI and editor HTTP bridge. |
| `bun run test:agent:e2e` | Deployed Chat Agent web page, relay, Daytona, Codex, artifacts. |

## Verification - 2026-05-16

Implemented:

- Added `scripts/agent-chat-e2e.ts`.
- Added `test:agent:e2e` and `test:agent:e2e:prod` in `package.json`.
- Fixed the Chat Agent status chip so persistent terminal sends do not leave the
  page stuck at `running`; Disconnect now returns the chip to `idle`.

Checks:

```bash
bun scripts/agent-chat-e2e.ts --help
bunx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node scripts/agent-chat-e2e.ts
node --test packages/nexusai-website/js/agent-chat.test.js
git diff --check
git -C packages/nexusai-website diff --check
```

Live E2E used production origin with local `agent-chat.js` injection:

```bash
bun scripts/agent-chat-e2e.ts \
  --url https://quriosity.com.au/chat-agent.html \
  --inject-local-agent-chat-js \
  --out-dir output/playwright/agent-chat-e2e-cli-injected-1778963356
```

This keeps the real production license-server, relay, Daytona, Codex, and
artifact download path while validating the new frontend logic before CDN/GitHub
Pages propagation.

Result:

```text
output/playwright/agent-chat-e2e-cli-injected-1778963356/result.json
status: passed
```

Evidence:

| Screenshot | Result |
| --- | --- |
| `01-initial-load.png` | Initial page is disconnected. |
| `02-no-click-still-disconnected.png` | Still disconnected after 8 seconds. |
| `03-connect-codex-ready.png` | Connect opens Daytona PTY with Codex ready. |
| `04-turn-one.png` | First prompt reaches the persistent Codex session. |
| `05-artifact-visible.png` | Codex writes `agent-e2e-1778963356804.txt`; artifact appears in the panel. |
| `06-artifact-download.png` | Download button works and fetched content matches expected text. |
| `07-disconnected-clean.png` | Disconnect clears stale Codex terminal output and status returns to `idle`. |
| `08-reconnect-codex-ready.png` | Reconnect opens Codex again. |
