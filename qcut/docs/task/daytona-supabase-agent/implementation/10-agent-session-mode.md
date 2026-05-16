# 10 Agent Session Mode

## Goal

Make the website Chat Agent default to a persistent Daytona-backed Codex
session. A user should be able to keep talking to the same sandbox, reuse files
and working state, and only lose the sandbox after an idle timeout, a hard TTL,
or an explicit "new session" action.

This is different from the current job-only model:

- **Current**: every message creates one `agent_jobs` row, one Daytona sandbox,
  one Codex process, then deletes the sandbox after artifacts upload.
- **Target v1**: every browser chat has one `agent_sessions` row and one warm
  Daytona sandbox. Messages still create `agent_jobs` rows, but jobs point to
  the session and reuse the sandbox.

## Scope

This task implements persistent **sandbox/session reuse**, not a long-lived
interactive Codex PTY process. Each turn can still invoke `codex exec`, but it
runs in the same Daytona filesystem and environment. That gives the practical
benefit users asked for first: downloaded files, generated artifacts, temporary
tools, repo state, and working directories survive across turns.

Keeping one Codex process alive is a follow-up because it needs a PTY or daemon
protocol, backpressure, cancellation, and a different message transport.

## Data Model

Add `agent_sessions`:

| Column | Purpose |
| --- | --- |
| `id` | Browser-visible chat session id. |
| `user_id` | Owner. Same user model as `agent_jobs`. |
| `status` | `active`, `stopping`, `ended`, or `error`. |
| `provider` | `daytona` for now. |
| `provider_session_id` | Daytona sandbox id once provisioned. Nullable while waiting for first job claim. |
| `image_tag` | Image used for the sandbox. |
| `started_at` | First session creation time. |
| `last_active_at` | Updated when a job is created and after a job finishes. Idle cleanup uses this. |
| `expires_at` | Hard TTL. |
| `ended_at` | Set when the worker cleans up or user explicitly ends the session. |
| `end_reason` | `idle_timeout`, `ttl`, `user_kill`, or `error`. |
| `runner_id` | Last worker that touched the session. |

Add nullable `agent_jobs.session_id` referencing `agent_sessions.id`.

Session ids are not trusted by themselves. License-server always scopes them by
`user_id`; worker also verifies claimed jobs against the job's stored `user_id`.

## API Shape

### Create/reuse a session

`POST /api/agent/sessions`

Body:

```json
{
  "mode": "codex"
}
```

Behavior:

- Return the newest active session for the user when one exists and is not
  expired.
- Otherwise create a new active session with no `provider_session_id` yet.
- This route is cheap. Daytona is created lazily by the worker on the first job
  that references the session.

### End a session

`POST /api/agent/sessions/:sessionId/end`

Behavior:

- Marks the session `stopping` with `end_reason = 'user_kill'`.
- The worker cleanup loop deletes the Daytona sandbox and marks it `ended`.
- If the worker is down, the next worker process will perform cleanup.

### Create a job in a session

`POST /api/agent/jobs`

Body keeps the existing contract and adds optional `sessionId`:

```json
{
  "command": "codex exec --skip-git-repo-check --json -",
  "args": { "codexPrompt": "..." },
  "sessionId": "..."
}
```

Behavior:

- If `sessionId` is provided, verify it belongs to the user and is active.
- Store it on `agent_jobs.session_id`.
- Update `agent_sessions.last_active_at`.

## Worker Behavior

For a job without `session_id`, keep current one-shot behavior: create sandbox,
run command, upload artifacts, delete sandbox.

For a job with `session_id`:

1. Load the session row.
2. If it has `provider_session_id`, try `daytona.get(...)`.
3. If no sandbox exists or Daytona says it is gone, create a new sandbox and
   update `agent_sessions.provider_session_id`.
4. Run the job in that sandbox.
5. Upload only this job's `/tmp/qcut-output` contents as artifacts.
6. Do **not** delete the sandbox after the job.
7. Update `last_active_at`.

The command wrapper still clears `/tmp/qcut-output` per job, so artifact
boundaries stay clean. Other paths such as `/tmp/qcut-tools`, `/home/qcut`, and
the working directory persist for follow-up turns.

## Idle Cleanup

Worker owns cleanup because it already has Daytona credentials.

Defaults:

- Idle timeout: `20 minutes`
- Hard TTL: `2 hours`
- Cleanup interval: `60 seconds`

Cleanup query:

- active sessions where `last_active_at < now - idle_timeout`
- active sessions where `expires_at < now`
- sessions marked `stopping`

For each match:

1. Set status `stopping`.
2. Try deleting Daytona sandbox when `provider_session_id` exists.
3. Mark `ended`, set `ended_at` and `end_reason`.
4. Record `agent_events` with `job_id = null`, `kind = 'agent_session_ended'`.

## Website Behavior

Chat Agent default Codex mode uses a session:

- Keep `qcut_agent_session_id` in `localStorage`.
- On first Codex send, call `POST /api/agent/sessions`.
- Pass the returned `session.id` in `POST /api/agent/jobs`.
- Show session status in the page.
- Add a "New session" button:
  - calls end route for the old session when possible
  - clears localStorage
  - creates a fresh session on next send

The website surface is intentionally Chat Agent only. Image and video requests
go through Codex in the persistent sandbox; when the worker uploads files from
`/tmp/qcut-output`, they appear in the Artifacts panel.

## Tests

Implemented coverage:

- License-server:
  - creates/reuses active sessions
  - marks an owned session as `stopping`
  - returns `404` when ending another user's session
  - rejects jobs with a missing/inactive session
  - rejects jobs with another user's session id without inserting a row
  - stores `sessionId` on jobs
- Agent worker:
  - one-shot jobs keep the old create/run/delete behavior
  - new session jobs create a persistent sandbox with the session row's
    `image_tag`
  - session jobs reuse `provider_session_id`
  - session jobs replace a missing Daytona sandbox and keep the replacement
    alive
  - session jobs do not delete the sandbox after job finish
  - idle, TTL, user-kill, and missing-sandbox cleanup paths mark sessions
    ended
  - Codex prompt is injected per job so reused sandboxes do not replay an old
    prompt
- Website:
  - creates a session through the license-server route
  - passes `sessionId` into Codex job creation
  - stores and clears `qcut_agent_session_id`
  - posts to the session end route for the "New session" flow
  - keeps the page as a single Chat Agent flow with no direct image-mode
    selector

Verified locally:

```bash
bun --cwd packages/agent-worker test -- run-on-daytona.test.ts claim.test.ts stream-events.test.ts
bun --cwd packages/license-server test -- agent.test.ts
node --test packages/nexusai-website/js/agent-chat.test.js
bunx tsc -p packages/agent-worker/tsconfig.json --noEmit
bunx biome check packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/run-on-daytona.test.ts packages/license-server/src/routes/agent.test.ts
bunx biome check packages/db/src/schema.ts packages/license-server/src/routes/agent.ts packages/license-server/src/routes/agent.test.ts packages/agent-worker/src/claim.ts packages/agent-worker/src/main.ts packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/run-on-daytona.test.ts packages/agent-worker/src/stream-events.test.ts packages/nexusai-website/chat-agent.html
```

Known verification gap:

- `bunx tsc -p packages/license-server/tsconfig.json --noEmit` currently fails
  before checking these changes because the workspace is missing the implicit
  `sharp` type definition.

## Production E2E - 2026-05-15

Deployment and migration:

- Applied the production Supabase schema for `agent_sessions` and
  `agent_jobs.session_id`.
- Redeployed `qcut-license-server` to Cloudflare Workers.
- Verified the temporary migration route was removed after use; the route now
  returns `404`.
- Restarted the production-shaped `qcut-agent-worker` tmux worker from the
  current `qcut-cli-v2` checkout with
  `QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`.
- Verified `https://quriosity.com.au/chat-agent.html` and
  `https://quriosity.com.au/js/agent-chat.js` include the session UI and
  session API client code.

Real session reuse test:

| Step | Evidence |
| --- | --- |
| Create/reuse session | `b6423733-cef4-4a94-b031-c06737d78d3b` |
| First Codex job | `970686e6-19d5-4d91-aded-dc227d01b7ae` succeeded |
| First job behavior | Codex wrote `session-e2e-1778901412` into `/tmp/qcut-tools/session-e2e/marker.txt` |
| First sandbox event | `agent_session_ready.reused=false`, sandbox `2df92162-0f45-4ec6-8a7a-0b7395672f97` |
| Second Codex job | `2f488dd9-ba75-4cec-875f-ce03d6dc54d0` succeeded |
| Second job behavior | Codex read the marker left by the first job and replied `SECOND_OK_SAME_SANDBOX_session-e2e-1778901412` |
| Second sandbox event | `agent_session_ready.reused=true`, same sandbox `2df92162-0f45-4ec6-8a7a-0b7395672f97` |

Live website test:

| Step | Evidence |
| --- | --- |
| Website URL | `https://quriosity.com.au/chat-agent.html` |
| UI-created Codex job | `ec2e282d-7a3a-4e9a-9a26-6c552601f19d` succeeded |
| UI session | `b6423733-cef4-4a94-b031-c06737d78d3b` |
| UI sandbox event | `agent_session_ready.reused=true`, sandbox `2df92162-0f45-4ec6-8a7a-0b7395672f97` |
| UI Codex response | `WEBSITE_CODEX_SESSION_UI_OK` |

Screenshot:

- `/Users/peter/Desktop/code/qcut/qcut/output/playwright/live-chat-agent-session-e2e.png`

## Additional Verification - 2026-05-15

Implementation follow-up:

- Added the Supabase CLI migration copy at
  `packages/db/supabase/migrations/20260516000000_agent_sessions.sql`.
- Fixed the Daytona worker so a newly created session sandbox uses
  `agent_sessions.image_tag`, not only the worker process default.
- Removed the website image-mode selector so the page only submits persistent
  Codex chat jobs. Image/video outputs are expected to appear through the
  existing Artifacts panel after upload.
- Expanded tests for session ownership, new persistent sandbox creation,
  replacement after Daytona says the previous sandbox is gone, TTL cleanup,
  user-kill cleanup, missing-sandbox cleanup, and website end-session requests.

Focused test run:

```bash
bun --cwd packages/agent-worker test -- run-on-daytona.test.ts claim.test.ts stream-events.test.ts
bun --cwd packages/license-server test -- agent.test.ts
node --test packages/nexusai-website/js/agent-chat.test.js
bunx tsc -p packages/agent-worker/tsconfig.json --noEmit
bunx biome check packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/run-on-daytona.test.ts packages/license-server/src/routes/agent.test.ts
```

Result:

- Agent worker: 27 tests passed.
- License server: 21 tests passed.
- Website chat client: 14 tests passed.
- Agent worker typecheck passed.
- Focused Biome check passed.

Real session reuse smoke against the production license-server and current
local production-shaped worker:

| Step | Evidence |
| --- | --- |
| Run id | `plan-e2e-1778902437060` |
| Session | `b6423733-cef4-4a94-b031-c06737d78d3b` |
| First Codex job | `1f7c80da-5ff7-4201-9ffa-c6d59f1576af` succeeded |
| Second Codex job | `9020e69f-3606-48d1-ab2f-d92ae5da5807` succeeded |
| Sandbox reuse | both jobs used sandbox `2df92162-0f45-4ec6-8a7a-0b7395672f97` |
| Persistence proof | second job read the marker written by the first job and returned `SECOND_PLAN_E2E_SAME_SANDBOX_plan-e2e-1778902437060` from `codex-last-message.md` |
| Artifact evidence | both jobs uploaded `codex-events.jsonl`, `qcut-exit.json`, `qcut-output.tar`, and `codex-last-message.md` |

## Live Website E2E - 2026-05-15

Production fix before the passing run:

- The live license-server was creating new sessions with `image_tag='qcut-cli'`,
  which Daytona could not pull in the cloud and produced create/start
  timeouts.
- Set `QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`
  in `packages/license-server/wrangler.toml` and redeployed the Cloudflare
  Worker.
- Increased the worker Daytona create/start timeout from 120 seconds to 300
  seconds so first-use image pulls have enough headroom.

Focused tests after the fix:

```bash
bun --cwd packages/agent-worker test -- run-on-daytona.test.ts
bunx tsc -p packages/agent-worker/tsconfig.json --noEmit
bun --cwd packages/license-server test -- agent.test.ts
bunx biome check packages/license-server/wrangler.toml packages/license-server/src/routes/agent.ts
```

Live UI run at `https://quriosity.com.au/chat-agent.html`:

| Step | Evidence |
| --- | --- |
| Run id | `ui-e2e-1778904289442` |
| Session | `2676fb3f-daed-45c3-b4c2-9be072ac2992` |
| Sandbox | `8a7b6295-fbbf-4545-a339-ae43fbaccb36` |
| Turn 1 job | `30d42eae-352e-4185-b524-1264918e9a4e` succeeded |
| Turn 1 reply | `TURN1_OK_ui-e2e-1778904289442` |
| Turn 2 job | `811dec1b-43ab-4684-b8af-e49e59c98642` succeeded |
| Turn 2 reply | `TURN2_OK_SAME_CONVERSATION_ui-e2e-1778904289442` |
| Turn 2 continuity proof | job prompt included the first user/assistant turn, and `agent_session_ready.reused=true` with the same sandbox |
| Video job | `f60d3e6e-2b6d-4c48-bb94-61856b76b05c` succeeded |
| Video artifact | `e2e-video-ui-e2e-1778904289442.mp4`, kind `video`, 40,239 bytes |
| Download verification | artifact download endpoint returned `200`, `Content-Type: video/mp4`, `Content-Disposition: attachment; filename="e2e-video-ui-e2e-1778904289442.mp4"`, MP4 `ftyp` signature |

Screenshots:

- Before: `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-e2e-before.png`
- After turn 1: `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-e2e-after-turn1.png`
- After turn 2: `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-e2e-after-turn2.png`
- After video artifacts:
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-e2e-after-video-artifacts.png`

## Live Stdout Streaming Fix - 2026-05-15

Problem found during UI verification:

- The page streamed Daytona/Codex lifecycle events while a job was running, but
  shell stdout from Codex command executions only appeared later inside
  `item.completed.aggregated_output`.
- That made the UI feel idle during long-running commands such as `yt-dlp`,
  `ffmpeg`, and QCut generation jobs.

Implemented fix:

- Added `codex-live-stdout.log` as a Daytona stream source for Codex jobs.
  The worker polls it with the same cursor-based stream loop used for
  `codex-events.jsonl`.
- Updated the Codex sandbox instructions to tell long-running shell commands to
  stream user-visible stdout with:

```bash
tee -a /tmp/qcut-output/codex-live-stdout.log
```

- Added `codex_stdout` events for live stdout rows so the website pending Codex
  message and Events panel can show command progress while the job is still
  `running`.
- Split fallback `aggregated_output` from `codex-events.jsonl` into
  `codex_stdout` rows when no live line was seen, so older/non-tee commands still
  expose their stdout cleanly after Codex emits the completed event.
- Added de-dupe so rows already streamed from `codex-live-stdout.log` are not
  repeated again from final `aggregated_output`.

Focused tests:

```bash
bun --cwd packages/agent-worker test -- stream-events.test.ts run-on-daytona.test.ts
bunx tsc -p packages/agent-worker/tsconfig.json --noEmit
node --test packages/nexusai-website/js/agent-chat.test.js
bunx biome check packages/agent-worker/src/stream-events.ts packages/agent-worker/src/stream-events.test.ts packages/agent-worker/src/run-container.ts packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/run-on-daytona.test.ts
```

Result:

- Agent worker: 27 tests passed.
- Website chat client: 14 tests passed.
- Agent worker typecheck passed.
- Focused Biome check passed.

Live UI verification against `https://quriosity.com.au/chat-agent.html` with the
local production-shaped worker restarted from this branch:

| Step | Evidence |
| --- | --- |
| Running stdout job | `398d42a4-b6c3-4695-b05f-55d541044b37` |
| Runner | `c6146513-2bcd-4182-945f-48ce7421098f` |
| Session reuse | `agent_session_ready.reused=true`, sandbox `af9c00ec-e4c4-41f2-9e84-884114e3d8c8` |
| Running UI proof | page showed `codex_stdout: LIVE_STDOUT_stdout-dedupe-1778908772404_1` while job status was still `running` |
| Completion | job succeeded with exit `0` |
| De-dupe proof | final API response had `eventCount=3` and `uniqueCount=3` for `_1`, `_2`, `_3` stdout rows |
| Artifact proof | uploaded `codex-live-stdout.log`, `stdout-dedupe-stdout-dedupe-1778908772404.txt`, `qcut-output.tar`, `codex-events.jsonl`, `qcut-exit.json`, and `codex-last-message.md` |

Screenshot:

- Running stdout stream:
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-e2e-live-stdout-dedupe-running.png`

## PTY Terminal Mode - 2026-05-15

Problem found after live stdout streaming:

- `codex exec --json` only emits the real assistant message at
  `item.completed`; it does not expose token-by-token assistant deltas.
- The previous web UI could show worker events and shell stdout, but it was not
  the same experience as a real terminal. The user could not type into a fixed
  sandbox shell.

Implemented fix:

- Added a Daytona-backed PTY path to `packages/qcut-relay`. The relay now
  accepts signed tokens for `agent_sessions`, connects to the session's Daytona
  sandbox, creates a PTY, and bridges browser input/output over WebSocket.
- Added `POST /api/agent/sessions/:sessionId/pty-token` in the license-server.
  This creates or reuses the Daytona sandbox, injects saved `agent_secrets`, and
  signs a short-lived relay token with `session_kind="agent"`.
- Added terminal artifact endpoints:
  - `GET /api/agent/sessions/:sessionId/artifacts`
  - `GET /api/agent/sessions/:sessionId/artifacts/:filename/download`
- Updated `chat-agent.html` to use xterm.js as the primary interface. The Send
  button now writes a
  `codex exec --dangerously-bypass-approvals-and-sandbox` command into the live
  PTY, so the user sees real shell/Codex output in the terminal without Codex
  stopping for permission prompts inside the already isolated Daytona sandbox.
- Fixed CORS for local website E2E by allowlisting `http://localhost:4177` and
  `http://127.0.0.1:4177`.
- Fixed relay stdin handling: non-resize string WebSocket messages are terminal
  input, not malformed control packets.

Deployment:

- Deployed `qcut-license-server` to Cloudflare Workers after adding the PTY
  token and terminal artifact routes.
- Deployed `qcut-relay` to Cloudflare Workers after adding Daytona PTY support.
- Set shared `RELAY_SIGNING_SECRET` on both Workers.
- Set `DAYTONA_API_KEY` on both Workers.

Focused tests:

```bash
node --test packages/nexusai-website/js/agent-chat.test.js
bun --cwd packages/license-server test -- src/routes/agent.test.ts src/services/payment-config.test.ts
bun --cwd packages/qcut-relay test
bun --cwd packages/agent-worker test
bunx tsc -p packages/qcut-relay/tsconfig.json --noEmit
```

Result:

- Website chat client: 18 tests passed.
- License server focused tests: 31 tests passed.
- QCut relay: 9 tests passed.
- Agent worker: 46 tests passed.
- QCut relay typecheck passed.
- License-server repo typecheck still has the existing unrelated
  `Cannot find type definition file for 'sharp'` issue.

Live/local E2E against deployed Workers and local website:

| Step | Evidence |
| --- | --- |
| Session | `13a3b39a-d9fe-420a-bec3-f7dc9eb00a6d` |
| Daytona sandbox | `9c50d534-8190-4e14-a30d-2a8350638252` |
| PTY proof | Browser terminal accepted keyboard input and printed `direct-pty-ok` |
| Codex proof | Send button ran real `codex exec` inside the PTY |
| QCut CLI proof | Codex ran `qcut --help \| head -12` and output `qcut-pipeline v1.0.0 — AI content generation CLI` |
| Artifact proof | `/tmp/qcut-output/terminal-e2e.txt` appeared in the web Artifacts panel with a Download button |

Screenshots:

- Connected PTY:
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-pty-connected.png`
- Direct keyboard PTY:
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-pty-keyboard-direct.png`
- Terminal artifact refresh:
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-pty-artifact-refresh-confirmed.png`
- Send button starts real Codex in PTY:
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-send-codex-command-visible.png`
- Codex result plus downloadable artifacts:
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-send-codex-artifact-visible.png`
- Production page after website push:
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-production-pty-artifacts.png`

Follow-up permission fix:

- Updated both website PTY Send and agent-worker Codex jobs to start Codex with
  `--dangerously-bypass-approvals-and-sandbox`. This avoids hanging on approval
  prompts while the process is already running inside a disposable Daytona
  sandbox.

Default connection follow-up:

- The website now auto-connects the Daytona PTY after Chat Agent page
  initialization. Users no longer need to click Connect before sending a Codex
  prompt.
- Local browser verification saved
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-autoconnect-local.png`
  and confirmed the terminal reached `connected` on page load.

Default Codex follow-up:

- The relay now boots the PTY directly into interactive Codex instead of
  leaving the user at a plain shell prompt.
- Startup runs `qcut-entrypoint` first so saved QCut/Codex auth is materialized,
  marks `/home/qcut/qcut` as a trusted Codex project, writes QCut Chat Agent
  defaults into sandbox `AGENTS.md`, then starts an idle interactive Codex TUI:
- Relay temporarily disables PTY input echo during bootstrap so the setup script
  does not pollute the user's terminal scrollback.

```bash
codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen -C /home/qcut/qcut ...
```

- The sandbox `AGENTS.md` section tells Codex it is QCut's website Chat Agent,
  points it at `/home/qcut/qcut/.claude/skills/native-cli/SKILL.md`, and
  repeats the `/tmp/qcut-output` artifact rule. This avoids burning the first
  interactive turn on setup instructions.
- The website Send button now sends bracketed paste plus carriage return into
  that persistent Codex session rather than spawning `codex exec` for every
  message. Artifact polling still watches `/tmp/qcut-output`.
- Production E2E confirmed the flow by sending a Codex prompt that created
  `/tmp/qcut-output/direct-1778919565593.txt`; the deployed Artifacts API listed
  it and the download endpoint returned matching content.
- Artifact listing now uses Daytona `fs.listFiles()` first and falls back to a
  `sh -lc` process namespace listing when `/tmp/qcut-output` is not visible via
  the FS API.

## Terminal Artifact Download Fix - 2026-05-16

Problem found in production:

- Downloading artifacts from the PTY session route failed with
  `"Buffer" is not supported: Module "buffer" is not available in the
  "serverless" runtime`.
- The root cause was Daytona SDK `sandbox.fs.downloadFile()` converting the
  multipart response through Node `Buffer`, which Cloudflare Workers do not
  provide.

Implemented fix:

- Added `packages/license-server/src/services/daytona-download.ts` to call
  Daytona's lower-level `downloadFiles` API with `responseType: "arraybuffer"`.
- Parses the multipart response with `Uint8Array`, `TextEncoder`, and
  `TextDecoder` only; no Node `Buffer` or `require("buffer")` is used.
- Updated the PTY terminal artifact route to return the parsed binary bytes
  with `Content-Length`, `Content-Type`, and attachment disposition.
- Added dedicated service tests for multipart file extraction, multipart error
  parts, and raw non-multipart fallback.

Verification:

```bash
bun --cwd packages/license-server test src/routes/agent.test.ts src/services/daytona-download.test.ts
node --test packages/nexusai-website/js/agent-chat.test.js
bunx tsc --noEmit --strict --moduleResolution bundler --module ESNext --target ES2022 --typeRoots /tmp/qcut-empty-types packages/license-server/src/services/daytona-download.ts
```

Result:

- License-server focused tests: 27 passed.
- Website chat client tests: 18 passed.
- Focused service typecheck passed.
- Full license-server typecheck is still blocked by existing unrelated
  workspace issues: missing implicit `sharp` types and duplicate Drizzle
  versions.

Production E2E after deploying `qcut-license-server` and `qcut-relay`:

| Step | Evidence |
| --- | --- |
| Session | `c4b059cc-d8c2-480d-8c8a-0dd07950b45d` |
| Daytona sandbox | `960e6ecc-a2ea-4e00-9f9a-70c283ece3c9` |
| Relay/PTY | WebSocket opened against deployed `qcut-relay` |
| Artifact created | `/tmp/qcut-output/download-check.txt` |
| Artifact list | returned `download-check.txt` |
| Download route | returned `qcut artifact download ok` from the deployed license-server |

## Follow-ups

- Decide whether to keep `codex exec` per Send or graduate to a long-lived
  interactive Codex process inside the PTY.
- For very large terminal artifacts, consider streaming or uploading through
  object storage instead of buffering the Daytona multipart response in the
  Worker.
- User-visible "session will expire soon" countdown.
- Per-session credit policy if idle warm sandboxes become costly.
- Add a normal migration-runner path so production schema changes do not need a
  one-off Cloudflare route when the Supabase CLI lacks the DB password.
