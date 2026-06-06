# WZRD 需要新建的文件

## 目录建议

建议在 WZRD repo 中新增这些区域：

```text
/Users/peter/Desktop/code/wzrdagentstudio
  packages/
    wzrd-agent-relay/
  supabase/
    functions/
      _shared/daytona-agent/
      agent-session/
      agent-pty-token/
      agent-files/
    migrations/
  src/
    components/daytona-agent/
    hooks/daytona-agent/
    pages/
    services/
```

## Supabase Migration

### `supabase/migrations/YYYYMMDDHHMMSS_create_daytona_agent_runtime.sql`

Purpose:

- Store Daytona runtime sessions separately from existing logical `wzrd_agent_sessions`.
- Track sandbox id, status, relay metadata, project binding, and audit events.

Sections:

1. `daytona_agent_sessions` table
   - `id`
   - `user_id`
   - `project_id`
   - `sandbox_id`
   - `daytona_workspace_id` if used
   - `status`: `creating`, `ready`, `active`, `stopped`, `failed`
   - `input_dir`: default `/tmp/wzrd-input`
   - `output_dir`: default `/tmp/wzrd-output`
   - `metadata` JSONB
   - `created_at`, `updated_at`, `last_active_at`
2. `daytona_agent_events` table
   - `id`
   - `session_id`
   - `user_id`
   - `event_type`
   - `metadata` JSONB
   - `created_at`
3. RLS policies
   - authenticated users can select their own sessions/events
   - authenticated users can insert/update only own sessions
   - service role handles relay/audit writes
4. Indexes
   - `(user_id, project_id, updated_at desc)`
   - `(sandbox_id)`
   - `(session_id, created_at desc)`
5. Trigger
   - update `updated_at`

## Supabase Shared Modules

### `supabase/functions/_shared/daytona-agent/constants.ts`

Purpose:

- Centralize env names, defaults, paths, token settings.

Sections:

1. Env var names
   - `DAYTONA_API_KEY`
   - `DAYTONA_API_URL` if needed
   - `DAYTONA_AGENT_IMAGE`
   - `DAYTONA_RELAY_JWT_SECRET`
   - `DAYTONA_RELAY_URL`
2. Sandbox defaults
   - input dir `/tmp/wzrd-input`
   - output dir `/tmp/wzrd-output`
   - workspace dir, for example `/workspace/wzrdagentstudio`
3. Token defaults
   - issuer
   - audience
   - expiration seconds
4. Status constants
   - allowed session statuses
   - allowed event types

### `supabase/functions/_shared/daytona-agent/types.ts`

Purpose:

- Keep request/response/session types out of route files.

Sections:

1. `DaytonaAgentSession`
2. `CreateSessionRequest`
3. `CreateSessionResponse`
4. `PtyTokenRequest`
5. `PtyTokenResponse`
6. `AgentFileEntry`
7. `AgentFileListResponse`

### `supabase/functions/_shared/daytona-agent/validation.ts`

Purpose:

- Validate payloads and keep route handlers small.

Sections:

1. `parseCreateSessionRequest`
2. `parsePtyTokenRequest`
3. `parseFileListRequest`
4. `parseFileUploadRequest`
5. `assertSafeSandboxPath`
6. `assertProjectAccess`

Notes:

- Keep validation strict.
- Reject path traversal.
- Reject empty file names and oversized uploads.

### `supabase/functions/_shared/daytona-agent/daytona.ts`

Purpose:

- Wrap Daytona SDK calls.

Sections:

1. `createDaytonaClient`
2. `createSandbox`
3. `getSandbox`
4. `ensureSandboxReady`
5. `stopSandbox`
6. `writeFileToSandbox`
7. `listSandboxFiles`
8. `downloadSandboxFile`

Notes:

- Adapt QCut `agent-parts/daytona.ts`.
- Use WZRD env defaults and image name.
- Keep retries focused and testable.

### `supabase/functions/_shared/daytona-agent/sessions.ts`

Purpose:

- Create/reuse/update runtime sessions.

Sections:

1. `findReusableSession`
2. `createSessionRecord`
3. `markSessionReady`
4. `markSessionFailed`
5. `touchSession`
6. `loadSessionForUser`

Notes:

- Use Supabase admin client for writes.
- Keep project ownership checks explicit.
- Do not mix this with existing `generate-workflow` session logic.

### `supabase/functions/_shared/daytona-agent/relay-token.ts`

Purpose:

- Sign short-lived JWTs consumed by Cloudflare relay.

Sections:

1. `buildRelayClaims`
2. `signRelayToken`
3. `createRelayConnectionPayload`

Claims should include:

- `session_id`
- `sandbox_id`
- `user_id`
- `project_id`
- `workspace_dir`
- `input_dir`
- `output_dir`

### `supabase/functions/_shared/daytona-agent/files.ts`

Purpose:

- File upload/list/download helper logic.

Sections:

1. `listOutputFiles`
2. `uploadInputFile`
3. `downloadOutputFile`
4. `normalizeFileEntry`
5. `resolveSandboxFilePath`

Notes:

- Match QCut's `/tmp/qcut-input` and `/tmp/qcut-output` idea, but use WZRD paths.
- Keep DB file metadata optional for first release.

### `supabase/functions/_shared/daytona-agent/serializers.ts`

Purpose:

- Keep HTTP response objects stable and frontend-friendly.

Sections:

1. `serializeSession`
2. `serializeRelayConnection`
3. `serializeFileEntry`
4. `serializeErrorDetails`

## Supabase Edge Functions

### `supabase/functions/agent-session/index.ts`

Purpose:

- HTTP entry point for creating/reusing/stopping Daytona sessions.

Sections:

1. CORS handling via WZRD `_shared/response.ts`
2. Auth via WZRD `_shared/auth.ts`
3. Request parsing
4. Project access check
5. Reuse or create Daytona sandbox
6. Persist session record
7. Return serialized session

Recommended methods:

- `POST`: create/reuse session
- `GET`: list or get current session
- `PATCH`: stop/update status if needed

### `supabase/functions/agent-pty-token/index.ts`

Purpose:

- Issue short-lived relay WebSocket token.

Sections:

1. CORS and auth
2. Parse `sessionId`
3. Load session for user
4. Ensure sandbox id exists and status is usable
5. Sign relay token
6. Return `{ relayUrl, token, expiresAt }`

### `supabase/functions/agent-files/index.ts`

Purpose:

- Upload user inputs and download/list agent outputs.

Sections:

1. CORS and auth
2. Load session for user
3. Route by method/action
4. Upload to `/tmp/wzrd-input`
5. List `/tmp/wzrd-output`
6. Download selected output file

Recommended methods:

- `GET ?sessionId=...`: list output files
- `POST`: upload file
- `GET ?sessionId=...&path=...&download=1`: download file

## Cloudflare Relay Package

### `packages/wzrd-agent-relay/package.json`

Purpose:

- Isolate relay dependencies and scripts.

Sections:

1. package name
2. `dev`, `deploy`, `test` scripts
3. deps: `@daytona/sdk`, `jose`
4. dev deps: `wrangler`, `vitest`, `@cloudflare/workers-types`

### `packages/wzrd-agent-relay/wrangler.toml`

Purpose:

- Configure Worker, Durable Object, env vars.

Sections:

1. Worker name
2. main entry
3. compatibility date and flags
4. Durable Object binding
5. migrations
6. vars for allowed origins and token issuer/audience

### `packages/wzrd-agent-relay/src/index.ts`

Purpose:

- Worker fetch handler and WebSocket upgrade routing.

Sections:

1. Env interface
2. CORS preflight
3. health endpoint
4. WebSocket route
5. JWT verification
6. Durable Object lookup
7. handoff to PTY session object

### `packages/wzrd-agent-relay/src/pty-session.ts`

Purpose:

- Durable Object that owns one PTY bridge.

Sections:

1. Durable Object state fields
2. WebSocket accept/reconnect logic
3. Daytona sandbox attach
4. startup command builder
5. terminal input/output bridge
6. input acknowledgement handling
7. cleanup and audit events

WZRD startup command should:

- `cd` into WZRD workspace
- create input/output dirs
- show concise session context
- start Codex or the selected WZRD agent CLI
- instruct outputs to land in `/tmp/wzrd-output`

### `packages/wzrd-agent-relay/src/verify-token.ts`

Purpose:

- Verify relay JWT and normalize claims.

Sections:

1. token schema
2. `verifyRelayToken`
3. claim validation
4. expiry/audience/issuer checks

### `packages/wzrd-agent-relay/src/audit.ts`

Purpose:

- Record relay lifecycle events.

Sections:

1. audit event type constants
2. `writeAuditEvent`
3. metadata sanitizer
4. failure handling

### Relay Tests

Create:

- `packages/wzrd-agent-relay/src/verify-token.test.ts`
- `packages/wzrd-agent-relay/src/pty-session.test.ts`

Test:

- valid/expired/bad audience token
- connect flow creates expected PTY command
- input ack behavior
- output forwarding
- cleanup on socket close

## Frontend Files

### `src/pages/DaytonaAgentPage.tsx`

Purpose:

- Page-level composition for WZRD Daytona agent.

Sections:

1. project/session context
2. session creation UI state
3. terminal panel
4. upload panel
5. output file panel
6. error/loading states

### `src/components/daytona-agent/AgentTerminal.tsx`

Purpose:

- xterm wrapper.

Sections:

1. terminal mount
2. fit addon
3. web links addon
4. incoming output renderer
5. outgoing input handler
6. reconnect status

### `src/components/daytona-agent/AgentFileBrowser.tsx`

Purpose:

- Show downloadable agent outputs.

Sections:

1. file list
2. refresh action
3. download action
4. empty/loading/error states

### `src/components/daytona-agent/AgentUploadPanel.tsx`

Purpose:

- Upload source files into sandbox input dir.

Sections:

1. file picker
2. upload queue
3. upload progress
4. completed/failed states

### `src/components/daytona-agent/AgentSessionStatus.tsx`

Purpose:

- Display current sandbox/session state.

Sections:

1. status badge
2. sandbox id display
3. last active time
4. stop/restart buttons

### `src/hooks/daytona-agent/useDaytonaAgentSession.ts`

Purpose:

- Own session lifecycle in React.

Sections:

1. create/reuse session
2. refresh session
3. stop session
4. expose state machine

### `src/hooks/daytona-agent/useDaytonaTerminalSocket.ts`

Purpose:

- Own relay WebSocket lifecycle.

Sections:

1. token fetch
2. socket connect
3. reconnect
4. send terminal input
5. receive terminal output
6. dispose

### `src/hooks/daytona-agent/useDaytonaAgentFiles.ts`

Purpose:

- Own upload/list/download behavior.

Sections:

1. list files
2. upload files
3. download file
4. loading/error state

### `src/services/daytonaAgentService.ts`

Purpose:

- Thin typed wrapper around Supabase function calls.

Sections:

1. `createAgentSession`
2. `getPtyToken`
3. `listAgentFiles`
4. `uploadAgentFile`
5. `downloadAgentFile`

## Routing Changes

### `src/lib/routes.ts`

Add a route constant:

```ts
export const ROUTES = {
  // existing routes
  daytonaAgent: '/agent',
};
```

### `src/app/AuthenticatedRoutes.tsx`

Add an authenticated route for `DaytonaAgentPage`.

If project-level context matters, use a route like:

```text
/projects/:projectId/agent
```

## Container / Image Files

### `Dockerfile.daytona-agent`

Purpose:

- Build the WZRD sandbox image.

Sections:

1. base image
2. Node/Bun/system deps
3. WZRD repo checkout or copy
4. install dependencies
5. install Codex or selected CLI
6. setup `/tmp/wzrd-input` and `/tmp/wzrd-output`
7. default shell

### `scripts/build-daytona-agent-image.sh` or `.ts`

Purpose:

- Build and push the WZRD Daytona image.

Sections:

1. image name/env loading
2. build command
3. push command
4. smoke command

## Test Files

Add tests near the implementation:

- `src/hooks/daytona-agent/useDaytonaAgentSession.test.tsx`
- `src/hooks/daytona-agent/useDaytonaTerminalSocket.test.tsx`
- `src/components/daytona-agent/AgentTerminal.test.tsx`
- `supabase/functions/_shared/daytona-agent/validation.test.ts`
- `supabase/functions/_shared/daytona-agent/relay-token.test.ts`
- `packages/wzrd-agent-relay/src/verify-token.test.ts`
- `packages/wzrd-agent-relay/src/pty-session.test.ts`

Minimum e2e smoke:

- open agent page
- create session
- connect terminal
- upload small file
- run a simple command through terminal
- verify output file appears
- download output file

