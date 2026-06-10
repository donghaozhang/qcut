# Daytona Online Chat Agent Flow

This document summarizes the main online `chat-agent.html` flow from the website to Codex CLI running inside a Daytona sandbox, along with the files involved. In this context, "online chat agent" means the persistent Daytona PTY terminal path, not the queued `/api/agent/jobs` worker path.

## Overview

```text
chat-agent.html
  -> js/agent-chat/*.js
  -> license-server /api/agent/sessions
  -> license-server /api/agent/sessions/:id/pty-token
  -> Daytona sandbox create/reuse
  -> qcut-relay /pty?token=...
  -> Daytona process.createPty()
  -> relay injects startup script and launches Codex
  -> browser xterm.js <-> relay <-> Daytona PTY <-> Codex CLI
  -> /tmp/qcut-input for uploads
  -> /tmp/qcut-output for downloadable outputs
```

The key design is: the page first creates or reuses an `agent_sessions` database row; the real Daytona sandbox is created or reused only when the user clicks Connect; the relay bridges the browser WebSocket to Daytona PTY and starts Codex inside that PTY.

## Frontend Flow

1. The page loads `packages/nexusai-website/chat-agent.html`.
   - The UI includes Connect, Reconnect, Disconnect, New, file upload, token override, and the Sandbox files panel.
   - The page loads `xterm.js`, `@xterm/addon-fit`, `js/agent-chat.js`, and then tries to load the Uppy uploader.

2. `packages/nexusai-website/js/agent-chat.js` loads four browser script parts:
   - `01-runtime-api.js`: API calls, prompt construction, session localStorage, upload and download paths.
   - `02-ui-files.js`: session status, sandbox file list, artifact preview, and download UI.
   - `03-terminal-job.js`: WebSocket terminal connection, reconnect, resize, input/output, and artifact polling.
   - `04-bootstrap.js`: button event binding and `window.AgentChatAPI` export.

3. When the user clicks Connect, `connectAgentTerminal()`:
   - Reads `activeTerminalSessionId` or the localStorage `qcut_agent_session_id`.
   - Calls `createAgentPtyToken({ sessionId })`.
   - If the old session is missing or expired, clears the local session and calls `ensureAgentSession()` to create a fresh one.
   - Opens a WebSocket with the returned `ws_url` and binds xterm input/output to it.

4. When files are uploaded, `uploadSelectedAgentFiles()` first ensures the terminal is connected.
   - Uploads go to the current file-browser path.
   - Without an explicit path, the backend defaults to `/tmp/qcut-input`.
   - The Sandbox files panel is refreshed after upload.

## License Server Flow

The route hub is `packages/license-server/src/routes/agent.ts`:

- `POST /api/agent/sessions`
- `POST /api/agent/sessions/:sessionId/pty-token`
- `GET /api/agent/sessions/:sessionId/files`
- `POST /api/agent/sessions/:sessionId/files`
- `GET /api/agent/sessions/:sessionId/files/download`
- `GET /api/agent/sessions/:sessionId/files/:folder/:filename/download`
- `GET /api/agent/sessions/:sessionId/artifacts/:filename/download`

### Session Creation

`packages/license-server/src/routes/agent-parts/sessions.ts` owns `createOrReuseAgentSession()`:

- Finds an active, unexpired `agent_sessions` row for the current user.
- Returns the existing session if found.
- Otherwise inserts a new session:
  - `provider = "daytona"`
  - `providerSessionId = null`
  - `imageTag = getAgentImageTag()`
  - default TTL is 2 hours

This step only creates the database session. It does not create a Daytona sandbox yet.

### PTY Token and Daytona Sandbox

`packages/license-server/src/routes/agent-parts/terminal.ts` owns `createAgentPtyToken()`:

- Validates `RELAY_SIGNING_SECRET` and `DAYTONA_API_KEY`.
- Loads the active owned `agent_sessions` row.
- Calls `getOrCreateAgentTerminalSandbox()`.
- Updates `agent_sessions.providerSessionId`, `imageTag`, and `lastActiveAt`.
- If the Daytona sandbox is not started yet, returns `202` with `retry_after_ms`; the frontend keeps polling.
- Once the sandbox is ready, inserts an `agent_terminal_ready` event, signs an HS256 relay JWT, and returns:
  - `session`
  - `ws_url`
  - `expires_at`

`packages/license-server/src/routes/agent-parts/daytona.ts` wraps Daytona SDK usage:

- If the session already has `providerSessionId`, tries `daytona.get()` first.
- If reuse fails, records `agent_terminal_sandbox_replaced` and creates a replacement sandbox.
- Sandbox creation uses `Image.base(imageTag).dockerfile`.
- User secrets from `agent_secrets` are injected into the sandbox environment, along with `QCUT_SESSION_ROLE=agent`.
- Sandbox resources are CPU 2, memory 4, and auto stop after 120 minutes.

## Relay / PTY Flow

`packages/qcut-relay/src/index.ts` is the Cloudflare Worker entry:

- Accepts only `/pty?token=...`.
- Peeks `session_id` from the token payload only to route to the Durable Object.
- The Durable Object performs the real token verification.

`packages/qcut-relay/src/pty-session.ts` is the core bridge:

1. Validates the WebSocket upgrade.
2. Verifies the JWT with `RELAY_SIGNING_SECRET`.
3. Queries Supabase `agent_sessions` via `fetchSession()`.
4. Requires an active session with `provider_session_id`.
5. Prevents multiple simultaneous browser attachments for the same session.
6. For the Daytona provider:
   - `new Daytona({ apiKey })`
   - `daytona.get(provider_session_id)`
   - `sandbox.process.createPty({ id, cols, rows, cwd, onData })`
7. Sends PTY output to the browser over WebSocket.
8. Writes browser input to the PTY and sends `pty_input_ack` / `pty_input_error` / `pty_input_timeout` control messages.
9. On close, kills the PTY; an agent session is not automatically ended on normal detach, but `pty_detached` is recorded.

### Codex Startup Script

`buildCodexStartupCommand()` injects the startup script into the Daytona PTY:

- Runs `/usr/local/bin/qcut-entrypoint /bin/true`.
- Changes directory to `/home/qcut/qcut`.
- Creates:
  - `/tmp/qcut-input`
  - `/tmp/qcut-output`
  - `/tmp/qcut-tools`
- Sets `CODEX_HOME` to a session-scoped directory.
- Sets `QCUT_OUTPUT_DIR=/tmp/qcut-output`.
- Creates `qcut` / `qcut-pipeline` wrappers so default output goes to `/tmp/qcut-output`.
- Ensures Codex CLI is available.
- Appends QCut Website Chat Agent instructions to `/home/qcut/qcut/AGENTS.md`.
- If the relay has `OPENAI_API_KEY`, runs `codex login --with-api-key`.
- Starts:

```text
codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen -C /home/qcut/qcut
```

The Codex instructions tell the agent to:

- Use the QCut native CLI for QCut work.
- Treat uploaded files as available under `/tmp/qcut-input`.
- Write final outputs under `/tmp/qcut-output`.
- Put temporary tools, caches, and package installs under `/tmp/qcut-tools` or `/tmp`.
- Avoid external image or video tools when the QCut CLI can handle the task.

## Upload, Browse, and Download

`packages/license-server/src/routes/agent-parts/files.ts` handles session file APIs:

- `listAgentSessionFiles()`:
  - Without query `path`, lists `/tmp/qcut-input` and `/tmp/qcut-output`.
  - With query `path`, lists that sandbox path.
- `uploadAgentSessionFiles()`:
  - Requires the session to have `providerSessionId`.
  - Defaults uploads to `/tmp/qcut-input`.
  - Uploads to the query `path` when provided.
  - Enforces a 25 MB per-file limit.
  - Validates the whole batch before writing, so one invalid later file cannot leave earlier files persisted with a failed response.
- `downloadAgentSessionFilesystemPath()`:
  - Downloads an arbitrary sandbox file path.
  - Directory downloads first create a `tar.gz` inside the sandbox, then download it.
- `downloadAgentSessionFile()`:
  - Downloads a file from the input/output virtual folders.
- `downloadAgentSessionArtifact()`:
  - Downloads a terminal artifact from `/tmp/qcut-output`.

`packages/license-server/src/services/daytona-download.ts` wraps Daytona downloads:

- Uses the lower-level `sandbox.fs.apiClient.downloadFiles()`.
- Forces `responseType: "arraybuffer"`.
- Handles raw byte and multipart responses.
- Throws the multipart `error` part when Daytona returns one.

## Database Tables

Relevant tables in `packages/db/src/schema.ts`:

- `agent_sessions`: the main persistent Daytona session table for online chat agent.
  - `providerSessionId` maps to the Daytona sandbox id.
  - `imageTag` records the image used for sandbox creation.
  - `expiresAt` controls TTL.
- `agent_events`: terminal ready, sandbox replacement, PTY attach/detach, IO audit, and related events.
- `agent_jobs`: queued job table; the online PTY path does not primarily depend on it.
- `agent_artifacts`: queued job artifacts uploaded to Supabase Storage; the online PTY path mainly downloads directly from Daytona filesystem.

## Difference From Queued Agent Jobs

The repository also has a queued Daytona job path:

```text
POST /api/agent/jobs
  -> agent_jobs queued
  -> packages/agent-worker
  -> runOnDaytona()
  -> execute qcut/codex exec
  -> upload agent_artifacts
```

That path involves:

- `packages/license-server/src/routes/agent-parts/jobs.ts`
- `packages/agent-worker/src/run-on-daytona.ts`
- `packages/agent-worker/src/daytona/*`

It shares some database tables, image configuration, and Daytona setup with the online chat agent, but it is not the primary interactive path entered by clicking Connect on `chat-agent.html`.

## Key File Index

| Area | File | Responsibility |
| --- | --- | --- |
| Page | `packages/nexusai-website/chat-agent.html` | Chat Agent UI and xterm/Uppy loading |
| Frontend bundle | `packages/nexusai-website/js/agent-chat.js` | Loads the four agent-chat parts |
| Frontend API | `packages/nexusai-website/js/agent-chat/01-runtime-api.js` | REST API, prompt, session, file API |
| Frontend file UI | `packages/nexusai-website/js/agent-chat/02-ui-files.js` | File list, preview, download, upload UI |
| Frontend terminal | `packages/nexusai-website/js/agent-chat/03-terminal-job.js` | WebSocket connection, xterm IO, reconnect, polling |
| Frontend bootstrap | `packages/nexusai-website/js/agent-chat/04-bootstrap.js` | DOM event binding and API export |
| API route hub | `packages/license-server/src/routes/agent.ts` | `/api/agent/*` route definitions |
| Auth | `packages/license-server/src/routes/agent-parts/auth.ts` | Agent auth and default-user fallback |
| Session | `packages/license-server/src/routes/agent-parts/sessions.ts` | Create, reuse, and end `agent_sessions` |
| Terminal | `packages/license-server/src/routes/agent-parts/terminal.ts` | Create Daytona sandbox and sign relay token |
| Daytona | `packages/license-server/src/routes/agent-parts/daytona.ts` | Daytona SDK wrapper and secret env injection |
| Files | `packages/license-server/src/routes/agent-parts/files.ts` | Upload, list, and download sandbox files |
| Download | `packages/license-server/src/services/daytona-download.ts` | Daytona multipart/bytes download handling |
| Relay entry | `packages/qcut-relay/src/index.ts` | `/pty` Worker entry and Durable Object routing |
| Relay PTY | `packages/qcut-relay/src/pty-session.ts` | WebSocket <-> Daytona PTY bridge and Codex startup |
| Relay token | `packages/qcut-relay/src/verify-token.ts` | HS256 token verification |
| Relay audit | `packages/qcut-relay/src/audit.ts` | Supabase REST session lookup and event writes |
| DB schema | `packages/db/src/schema.ts` | `agent_sessions`, `agent_events`, `agent_jobs`, `agent_artifacts` |
| Migration | `packages/db/supabase/migrations/20260516000000_agent_sessions.sql` | `agent_sessions` and `agent_jobs.session_id` |

