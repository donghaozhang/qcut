# PR 10 — Agent Session Mode (Implementation Plan)

> **Phase**: 3 · **Depends on**: PR 03 (schema baseline), PR 04 (agent worker), PR 05 (Daytona devcontainer) · **Estimated LOC**: ~650 across schema + license-server + worker + website

This file is the step-by-step plan for shipping the persistent agent-session
feature described in [`10-agent-session-mode.md`](10-agent-session-mode.md).
That sibling file is the **spec** (data model, API shape, observed E2E
results). This file is the **how-to-build-it** broken into subtasks, each ≤ 20
minutes of focused work, each citing the file it touches.

## Goal

Make the website Chat Agent default to a persistent Daytona-backed Codex
session: the same browser chat reuses one warm sandbox across many turns; the
sandbox only goes away on idle timeout, hard TTL, or explicit "new session".

Long-term properties we want this plan to preserve:

- **Session ids are not capabilities** — every license-server route re-derives
  the user from the auth token and verifies ownership by `user_id`. Stealing a
  session id leaks nothing.
- **The worker owns sandbox lifecycle.** License-server only mutates DB rows.
  This keeps Daytona credentials in exactly one process and lets us swap
  providers later without touching the website.
- **One-shot jobs keep working unchanged.** A job without `sessionId` follows
  the existing create / run / delete path. Sessions are purely additive.
- **Artifacts stay job-scoped.** Only `/tmp/qcut-output` is uploaded per turn.
  Everything else in the sandbox is the user's persistent workspace.

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `packages/db/migrations/0006_agent_sessions.sql` | new | `agent_sessions` table + `agent_jobs.session_id` FK + indexes |
| `packages/db/supabase/migrations/<ts>_agent_sessions.sql` | new | Same migration in Supabase CLI format for the prod project |
| `packages/db/src/schema.ts` | modify | Drizzle definitions for `agent_sessions`, `session_id` column, supporting indexes |
| `packages/license-server/src/routes/agent.ts` | modify | `POST /api/agent/sessions`, `POST /api/agent/sessions/:id/end`, `sessionId` handling in `POST /api/agent/jobs` |
| `packages/license-server/src/routes/agent.test.ts` | modify | Route tests for create/reuse/end + job-with-session |
| `packages/agent-worker/src/claim.ts` | modify | Load `session_id` row alongside the job |
| `packages/agent-worker/src/run-on-daytona.ts` | modify | Reuse existing sandbox when session has `provider_session_id`; skip delete on session jobs |
| `packages/agent-worker/src/main.ts` | modify | Idle / TTL cleanup loop |
| `packages/agent-worker/src/run-on-daytona.test.ts` | modify | One-shot vs session sandbox lifecycle |
| `packages/agent-worker/src/stream-events.test.ts` | modify | Per-job Codex prompt injection on reused sandbox |
| `packages/agent-worker/src/cleanup.ts` | new (optional) | Extracted cleanup function for unit-testability |
| `packages/agent-worker/src/cleanup.test.ts` | new | Idle/TTL/stopping cleanup paths |
| `packages/nexusai-website/chat-agent.html` | modify | Session UI block, "New session" button |
| `packages/nexusai-website/js/agent-chat.js` | modify | Session creation, `qcut_agent_session_id` storage, end-session call |
| `packages/nexusai-website/js/agent-chat.test.js` | modify | Session lifecycle in the chat client |

## Subtasks

Each subtask is sized to fit one focused session. Mark them done as you land
PR commits — a single PR can ship multiple subtasks, but each subtask is small
enough that it can also stand alone behind a feature flag if needed.

### Subtask 10.1 — Drizzle schema for `agent_sessions`

Touches: `packages/db/src/schema.ts`.

Add an `agent_sessions` table with columns matching the spec — `id`,
`user_id`, `status` (enum `'active' | 'stopping' | 'ended' | 'error'`),
`provider` (default `'daytona'`), `provider_session_id` (nullable),
`image_tag`, `started_at`, `last_active_at`, `expires_at`, `ended_at`,
`end_reason`, `runner_id`.

Indexes (long-term cost control — the cleanup loop runs every 60s):

- `agent_sessions_user_status_last_active_idx` on `(user_id, status, last_active_at desc)`
- `agent_sessions_expires_active_idx` on `(expires_at)` with `status = 'active'` predicate

Add nullable FK `agent_jobs.session_id → agent_sessions.id` with `on delete
set null`. Add `agent_jobs_session_created_idx` on `(session_id, created_at
desc)` so the per-session job feed stays cheap.

Run `bunx drizzle-kit generate` from `packages/db/` to refresh the metadata
snapshot.

### Subtask 10.2 — SQL migration

Touches: `packages/db/migrations/0006_agent_sessions.sql`,
`packages/db/supabase/migrations/<ts>_agent_sessions.sql`.

Write the migration by hand instead of relying purely on `drizzle-kit push`,
because the same SQL ships to two paths:

1. Local Drizzle migrations (used by tests + local Postgres).
2. Supabase CLI migrations (applied via
   `SUPABASE_ACCESS_TOKEN=… supabase db push` from `packages/db/`).

Make the migration **idempotent and forward-only**: `create table if not
exists`, `alter table … add column if not exists`, `create index if not
exists`. Sessions cannot be dropped safely once the column exists in prod, so
there is no down migration.

### Subtask 10.3 — Session routes in license-server

Touches: `packages/license-server/src/routes/agent.ts`.

Add two new routes and extend one:

- `POST /api/agent/sessions` — body `{ mode: "codex" }`. Inside a transaction:
  pick the newest `active` session for the authenticated user where
  `expires_at > now`; if none, insert a new one with `status='active'`,
  `started_at=now`, `last_active_at=now`, `expires_at=now + 2h`. Return the
  row.
- `POST /api/agent/sessions/:sessionId/end` — load session, verify
  `user_id == authedUser.id`, set `status='stopping'`,
  `end_reason='user_kill'`. Worker performs the actual sandbox delete.
- `POST /api/agent/jobs` — accept optional `sessionId`. When present: in a
  transaction, verify the session belongs to the user and is `active`; bump
  `last_active_at`; store `session_id` on the inserted job. Return `404` /
  `409` on missing / inactive session instead of silently dropping.

Long-term note: **never trust `sessionId` alone**. The transaction must always
re-check `user_id`. This is the property unit tests in Subtask 10.4 will
encode.

### Subtask 10.4 — License-server route tests

Touches: `packages/license-server/src/routes/agent.test.ts`.

Cases to add:

- `POST /api/agent/sessions` returns the same row on a second call within the
  TTL window (reuse).
- `POST /api/agent/sessions` issues a new row after the previous one expires.
- `POST /api/agent/sessions/:id/end` for a session owned by another user
  returns 404 (not 403 — do not leak existence).
- `POST /api/agent/jobs` with `sessionId` from a different user returns 404
  and does **not** insert a job row.
- `POST /api/agent/jobs` with a valid `sessionId` bumps `last_active_at` and
  stores `session_id` on the new job.

Run: `bun --cwd packages/license-server test -- agent.test.ts`.

### Subtask 10.5 — Worker claim loads session context

Touches: `packages/agent-worker/src/claim.ts`.

When a job claim succeeds, also fetch the linked `agent_sessions` row (single
join or follow-up `select` — whichever the existing claim path prefers).
Return a `{ job, session | null }` shape so downstream code does not need to
re-query. Keep the no-session path identical to today.

Also verify the session is still `active` at claim time. If a session went to
`stopping` between job enqueue and claim, fail the job up-front with
`session_inactive` rather than starting a sandbox we'll throw away.

### Subtask 10.6 — Worker sandbox reuse

Touches: `packages/agent-worker/src/run-on-daytona.ts`.

Branching on `session` presence:

- **No session**: existing path — create sandbox, run, upload, delete.
- **With session**:
  1. If `session.provider_session_id` is set, call `daytona.get(id)`. If it
     returns a usable sandbox, reuse it. If Daytona says it's gone, fall
     through to step 2.
  2. Create a new sandbox with the session's `image_tag`. `UPDATE
     agent_sessions SET provider_session_id = …, runner_id = $worker WHERE
     id = $session_id AND provider_session_id IS NULL` — the conditional
     write is what makes concurrent workers safe.
  3. Inside the sandbox, clear `/tmp/qcut-output` before the command so
     artifact uploads stay per-turn. Do **not** clear `/tmp/qcut-tools`,
     `/home/qcut`, or the working directory.
  4. Run `codex exec --skip-git-repo-check --json -` with the per-job prompt
     piped on stdin. The prompt must come from the current job — never reuse
     the previous job's prompt (see Subtask 10.10's test).
  5. Upload `/tmp/qcut-output` artifacts.
  6. **Skip the delete**. Update `last_active_at = now` on the session.
  7. Emit an `agent_events` row with
     `kind='agent_session_ready'`, payload `{ reused: boolean,
     provider_session_id }`.

### Subtask 10.7 — Cleanup loop

Touches: `packages/agent-worker/src/main.ts`, optionally extract to
`packages/agent-worker/src/cleanup.ts` so it can be unit-tested without
spinning up the full worker loop.

Every 60s:

1. `SELECT id, provider_session_id, status FROM agent_sessions
   WHERE status = 'active' AND (last_active_at < now - interval '20 minutes'
   OR expires_at < now)
   OR status = 'stopping'
   LIMIT 50 FOR UPDATE SKIP LOCKED`.
2. For each row: set `status='stopping'` (no-op if already), then
   `daytona.delete(provider_session_id)` (best-effort; ignore 404).
3. `UPDATE agent_sessions SET status='ended', ended_at=now,
   end_reason=$reason WHERE id=$id`.
4. Insert an `agent_events` row, `job_id=null`,
   `kind='agent_session_ended'`, payload `{ reason }`.

`FOR UPDATE SKIP LOCKED` is the long-term piece — it lets us run multiple
workers without two of them fighting over the same cleanup row.

### Subtask 10.8 — Worker tests: one-shot vs session

Touches: `packages/agent-worker/src/run-on-daytona.test.ts`.

Mock the Daytona client. Assert:

- One-shot job (no `session_id`): `create` + `delete` both called exactly
  once.
- Session job, no `provider_session_id` yet: `create` called once, `delete`
  not called, `agent_sessions.provider_session_id` is set after the call.
- Session job, `provider_session_id` already set and Daytona returns the
  sandbox: `create` not called, `delete` not called.
- Session job, `provider_session_id` set but Daytona returns "gone":
  `create` called once, `delete` not called, `provider_session_id` is
  updated.

### Subtask 10.9 — Worker tests: cleanup paths

Touches: `packages/agent-worker/src/cleanup.test.ts` (new).

Cases:

- `active` session with `last_active_at` older than idle timeout → ends with
  `idle_timeout`.
- `active` session with `expires_at < now` → ends with `ttl`.
- `stopping` session → ends with `user_kill`.
- Daytona delete returns 404 → session still transitions to `ended` (no stuck
  rows).

### Subtask 10.10 — Stream-events test: per-job prompt isolation

Touches: `packages/agent-worker/src/stream-events.test.ts`.

This is the regression test for the most likely future bug: when a sandbox is
reused, the Codex process must be invoked with **this job's** prompt, not the
previous job's. Drive two synthetic jobs in the same session through the
streamer and assert each Codex stdin contains exactly the current job's
prompt.

### Subtask 10.11 — Website session client

Touches: `packages/nexusai-website/js/agent-chat.js`.

- On first Codex send (no `qcut_agent_session_id` in `localStorage`):
  `POST /api/agent/sessions` → store `session.id`.
- Always pass `sessionId` in `POST /api/agent/jobs`.
- On `agent_session_ended` SSE event with `reason !== 'user_kill'`, clear
  `localStorage` and surface a toast — the next send will reopen a fresh
  session.

Keep image-gen mode untouched: it remains one-shot.

### Subtask 10.12 — Website "New session" UI

Touches: `packages/nexusai-website/chat-agent.html`,
`packages/nexusai-website/js/agent-chat.js`.

Add a header button that:

1. Calls `POST /api/agent/sessions/<id>/end` (fire-and-forget; ignore 4xx).
2. Removes `qcut_agent_session_id` from `localStorage`.
3. Resets the in-page chat transcript.

Visible session indicator: short `session.id.slice(0,8)` chip + idle countdown
derived from `last_active_at + 20min` so the user can see why their context
might be about to drop.

### Subtask 10.13 — Website chat-client tests

Touches: `packages/nexusai-website/js/agent-chat.test.js`.

Cases:

- First `send()` calls the sessions route and stores the id.
- Second `send()` reuses the stored id and does **not** re-create.
- Clicking "New session" calls the end route and clears storage.
- `agent_session_ended` with `reason='idle_timeout'` clears storage and the
  next `send()` creates a new session.

Run: `node --test packages/nexusai-website/js/agent-chat.test.js`.

### Subtask 10.14 — Verification matrix

Run the same battery the production E2E in
[`10-agent-session-mode.md`](10-agent-session-mode.md) ran:

```bash
bun --cwd packages/agent-worker test -- run-on-daytona.test.ts stream-events.test.ts cleanup.test.ts
bun --cwd packages/license-server test -- agent.test.ts
node --test packages/nexusai-website/js/agent-chat.test.js
bunx tsc -p packages/agent-worker/tsconfig.json --noEmit
bunx biome check \
  packages/db/src/schema.ts \
  packages/license-server/src/routes/agent.ts \
  packages/license-server/src/routes/agent.test.ts \
  packages/agent-worker/src/claim.ts \
  packages/agent-worker/src/main.ts \
  packages/agent-worker/src/run-on-daytona.ts \
  packages/agent-worker/src/run-on-daytona.test.ts \
  packages/agent-worker/src/stream-events.test.ts \
  packages/nexusai-website/chat-agent.html
```

Manual E2E (after `supabase db push` and worker restart with the current
`QCUT_IMAGE_TAG`):

1. `POST /api/agent/sessions` from a logged-in browser → record `session.id`.
2. Send a Codex job that writes `marker.txt` under `/tmp/qcut-tools/`.
3. Send a second Codex job that reads `marker.txt` — it must succeed and
   return the same value.
4. Confirm two `agent_session_ready` events: first `reused=false`, second
   `reused=true`, with the same `provider_session_id`.
5. Click "New session" → confirm the `agent_session_ended` event with
   `reason='user_kill'`, then re-send and confirm a new
   `provider_session_id`.

## Long-term considerations

- **Migrations on Cloudflare Workers.** The temporary migration route used in
  the 2026-05-15 deployment must not come back. Track the proper Supabase CLI
  path in the follow-up list of [`10-agent-session-mode.md`](10-agent-session-mode.md).
- **Cost ceiling.** Idle sandboxes cost money even when no one types. Defaults
  (20 min idle, 2 h TTL) are intentionally tight. Any future "keep warm
  longer" feature must come with a per-user credit policy — do not raise the
  defaults globally.
- **Provider abstraction.** `provider='daytona'` is a column on purpose. New
  providers should be added by extending the enum + a worker dispatch, not by
  replacing Daytona inline.
- **Codex PTY follow-up.** The spec explicitly calls out PTY/daemon as a
  separate PR. Do not sneak partial PTY work into this one; it needs its own
  transport and backpressure design.

## See also

- [`10-agent-session-mode.md`](10-agent-session-mode.md) — spec + production
  E2E results this plan derives from
- [`06-sandbox-sessions-schema.md`](06-sandbox-sessions-schema.md) — earlier
  session-schema work this builds on
- [`04-agent-worker.md`](04-agent-worker.md) — worker baseline behavior the
  session branch is added to
- [`09-wzrd-terminal-ui.md`](09-wzrd-terminal-ui.md) — UI shape this plan
  intentionally does **not** adopt (different surface, different consumer)
