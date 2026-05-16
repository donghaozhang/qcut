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

## Follow-ups

- Persistent Codex PTY/daemon process inside the same sandbox.
- Session artifact browser that can show prior job artifacts within a chat.
- User-visible "session will expire soon" countdown.
- Per-session credit policy if idle warm sandboxes become costly.
- Add a normal migration-runner path so production schema changes do not need a
  one-off Cloudflare route when the Supabase CLI lacks the DB password.
