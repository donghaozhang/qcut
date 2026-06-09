# 实施步骤和验证

## Phase 0：确认边界

1. 确认 WZRD 是否要项目级 agent：
   - 全局 route：`/agent`
   - 项目级 route：`/projects/:projectId/agent`
2. 确认 Daytona image 名称：
   - env: `DAYTONA_AGENT_IMAGE`
3. 确认 relay 部署域名：
   - env: `DAYTONA_RELAY_URL`
4. 确认 token secret：
   - Supabase function 和 Cloudflare relay 需要同一个 `DAYTONA_RELAY_JWT_SECRET`

## Phase 1：数据库

1. 新增 `create_daytona_agent_runtime.sql` migration。
2. 建表：
   - `daytona_agent_sessions`
   - `daytona_agent_events`
3. 加 RLS、indexes、updated_at trigger。
4. 本地或 staging 跑 migration。
5. 更新 generated Supabase types if WZRD uses generated DB types.

Validation:

- authenticated user can see own session
- authenticated user cannot see another user's session
- service role can write audit event

## Phase 2：Supabase Shared Modules

Create:

- `supabase/functions/_shared/daytona-agent/constants.ts`
- `supabase/functions/_shared/daytona-agent/types.ts`
- `supabase/functions/_shared/daytona-agent/validation.ts`
- `supabase/functions/_shared/daytona-agent/daytona.ts`
- `supabase/functions/_shared/daytona-agent/sessions.ts`
- `supabase/functions/_shared/daytona-agent/relay-token.ts`
- `supabase/functions/_shared/daytona-agent/files.ts`
- `supabase/functions/_shared/daytona-agent/serializers.ts`

Use QCut references:

- `packages/license-server/src/routes/agent-parts/constants.ts`
- `packages/license-server/src/routes/agent-parts/daytona.ts`
- `packages/license-server/src/routes/agent-parts/sessions.ts`
- `packages/license-server/src/routes/agent-parts/terminal.ts`
- `packages/license-server/src/routes/agent-parts/files.ts`
- `packages/license-server/src/routes/agent-parts/validation.ts`

Validation:

- unit test validation rejects bad project id, bad path, empty file
- relay token test verifies issuer/audience/expiry and required claims
- session helper test covers create/reuse/fail state transitions

## Phase 3：Supabase Edge Functions

Create:

- `supabase/functions/agent-session/index.ts`
- `supabase/functions/agent-pty-token/index.ts`
- `supabase/functions/agent-files/index.ts`

Implementation notes:

- Use existing WZRD `_shared/auth.ts`.
- Use existing WZRD `_shared/response.ts`.
- Keep each function focused; push reusable logic into `_shared/daytona-agent`.
- Keep error responses stable for frontend.

Validation:

- `agent-session` creates session for authenticated user
- `agent-session` reuses a still-valid sandbox session
- `agent-pty-token` refuses another user's session
- `agent-files` rejects path traversal
- `agent-files` lists only output dir files

## Phase 4：Relay Package

Create:

- `packages/wzrd-agent-relay/package.json`
- `packages/wzrd-agent-relay/tsconfig.json`
- `packages/wzrd-agent-relay/vitest.config.ts`
- `packages/wzrd-agent-relay/wrangler.toml`
- `packages/wzrd-agent-relay/src/index.ts`
- `packages/wzrd-agent-relay/src/pty-session.ts`
- `packages/wzrd-agent-relay/src/verify-token.ts`
- `packages/wzrd-agent-relay/src/audit.ts`
- `packages/wzrd-agent-relay/src/verify-token.test.ts`
- `packages/wzrd-agent-relay/src/pty-session.test.ts`

Use QCut references:

- `packages/qcut-relay/src/index.ts`
- `packages/qcut-relay/src/pty-session.ts`
- `packages/qcut-relay/src/verify-token.ts`
- `packages/qcut-relay/src/audit.ts`

WZRD changes:

- rename Worker and Durable Object
- use WZRD token issuer/audience
- use `/tmp/wzrd-input` and `/tmp/wzrd-output`
- start WZRD agent command
- record `daytona_agent_events`

Validation:

- `pnpm --filter wzrd-agent-relay test`
- local `wrangler dev`
- WebSocket health check
- token verification with Supabase-issued token

## Phase 5：WZRD Daytona Image

Create:

- `Dockerfile.daytona-agent`
- `scripts/build-daytona-agent-image.sh` or `.ts`

Image should include:

- WZRD repo checkout or copied app code
- Node/Bun dependencies needed for WZRD tools
- Codex CLI or selected runtime agent CLI
- any media tooling WZRD agent needs
- `/tmp/wzrd-input`
- `/tmp/wzrd-output`

Validation:

- image boots shell
- WZRD workspace exists
- agent command starts
- can write output file to `/tmp/wzrd-output`

## Phase 6：Frontend

Create:

- `src/pages/DaytonaAgentPage.tsx`
- `src/services/daytonaAgentService.ts`
- `src/hooks/daytona-agent/useDaytonaAgentSession.ts`
- `src/hooks/daytona-agent/useDaytonaTerminalSocket.ts`
- `src/hooks/daytona-agent/useDaytonaAgentFiles.ts`
- `src/components/daytona-agent/AgentTerminal.tsx`
- `src/components/daytona-agent/AgentFileBrowser.tsx`
- `src/components/daytona-agent/AgentUploadPanel.tsx`
- `src/components/daytona-agent/AgentSessionStatus.tsx`

Modify:

- `src/lib/routes.ts`
- `src/app/AuthenticatedRoutes.tsx`
- navigation/sidebar component if WZRD should expose the page in nav

Frontend behavior:

1. Create/reuse session.
2. Request relay token.
3. Open xterm WebSocket.
4. Upload files.
5. Refresh output list.
6. Download outputs.
7. Handle disconnect/reconnect.

Validation:

- route renders behind auth
- terminal connects after session is ready
- uploads show progress
- output list refreshes
- buttons include `type`
- icon-only buttons include title/accessible label

## Phase 7：End-to-End Smoke

Minimal e2e:

1. Log in to WZRD.
2. Open Daytona agent route.
3. Create session.
4. Wait for terminal connection.
5. Upload `hello.txt`.
6. Run a command that writes `/tmp/wzrd-output/result.txt`.
7. Refresh output list.
8. Download `result.txt`.
9. Stop session.

Pass criteria:

- no auth leak
- no path traversal
- relay token expires correctly
- reconnect does not create duplicate runaway PTY sessions
- output file download content matches expected

## Recommended Implementation Order

1. DB migration
2. shared validation/session/token helpers
3. `agent-session` and `agent-pty-token`
4. relay package and tests
5. image build
6. frontend service/hooks
7. frontend components/page
8. `agent-files`
9. e2e smoke

This order reduces unknowns: first prove auth/session/token, then prove WebSocket/PTY, then attach UI and file flow.

