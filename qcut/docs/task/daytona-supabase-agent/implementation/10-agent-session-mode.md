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

Image-generation mode can stay one-shot for now. It does not need persistent
Codex context.

## Tests

Implemented coverage:

- License-server:
  - creates/reuses active sessions
  - marks an owned session as `stopping`
  - rejects jobs with a missing/inactive session
  - stores `sessionId` on jobs
- Agent worker:
  - one-shot jobs keep the old create/run/delete behavior
  - session jobs reuse `provider_session_id`
  - session jobs do not delete the sandbox after job finish
  - idle cleanup deletes sandbox and marks session ended
  - Codex prompt is injected per job so reused sandboxes do not replay an old
    prompt
- Website:
  - creates a session through the license-server route
  - passes `sessionId` into Codex job creation
  - stores and clears `qcut_agent_session_id`

Verified locally:

```bash
bun --cwd packages/agent-worker test -- run-on-daytona.test.ts stream-events.test.ts
bun --cwd packages/license-server test -- agent.test.ts
node --test packages/nexusai-website/js/agent-chat.test.js
bunx tsc -p packages/agent-worker/tsconfig.json --noEmit
bunx biome check packages/db/src/schema.ts packages/license-server/src/routes/agent.ts packages/license-server/src/routes/agent.test.ts packages/agent-worker/src/claim.ts packages/agent-worker/src/main.ts packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/run-on-daytona.test.ts packages/agent-worker/src/stream-events.test.ts packages/nexusai-website/chat-agent.html
```

Known verification gap:

- `bunx tsc -p packages/license-server/tsconfig.json --noEmit` currently fails
  before checking these changes because the workspace is missing the implicit
  `sharp` type definition.

## Follow-ups

- Persistent Codex PTY/daemon process inside the same sandbox.
- Session artifact browser that can show prior job artifacts within a chat.
- User-visible "session will expire soon" countdown.
- Per-session credit policy if idle warm sandboxes become costly.
- Apply `packages/db/migrations/0006_agent_sessions.sql` to production
  Supabase before deploying the license-server/worker session routes.
