# Copy / Adapt Map

## 结论

QCut Daytona agent 分成四类文件：

1. **Relay Worker**：最适合 copy 后改名改配置。
2. **License Server agent parts**：不能直接 copy 到 WZRD，需要迁移成 Supabase Edge Function `_shared` 模块。
3. **Frontend static chat agent**：只作为行为参考，不直接 copy。
4. **DB migration**：结构可参考，但要改成 WZRD runtime session 表。

## 可以基本 Copy 的文件

这些文件来自 QCut relay package，建议新建 WZRD relay package 后复制过去，再做 WZRD 命名和 env 调整。

| QCut source | WZRD target | What changes |
| --- | --- | --- |
| `/Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay/package.json` | `/Users/peter/Desktop/code/wzrdagentstudio/packages/wzrd-agent-relay/package.json` | package name, scripts, test names. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay/tsconfig.json` | `/Users/peter/Desktop/code/wzrdagentstudio/packages/wzrd-agent-relay/tsconfig.json` | Usually minor or no changes. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay/vitest.config.ts` | `/Users/peter/Desktop/code/wzrdagentstudio/packages/wzrd-agent-relay/vitest.config.ts` | Usually minor or no changes. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay/src/verify-token.ts` | `/Users/peter/Desktop/code/wzrdagentstudio/packages/wzrd-agent-relay/src/verify-token.ts` | Keep the shape. Adjust claim names only if needed. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay/src/verify-token.test.ts` | `/Users/peter/Desktop/code/wzrdagentstudio/packages/wzrd-agent-relay/src/verify-token.test.ts` | Update issuer/audience/env names. |

## Copy 后必须 Adapt 的文件

| QCut source | WZRD target | Required changes |
| --- | --- | --- |
| `/Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay/wrangler.toml` | `/Users/peter/Desktop/code/wzrdagentstudio/packages/wzrd-agent-relay/wrangler.toml` | Worker name, routes, Durable Object class/binding names, env vars. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay/src/index.ts` | `/Users/peter/Desktop/code/wzrdagentstudio/packages/wzrd-agent-relay/src/index.ts` | CORS origins, route names, env interface, token payload shape. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay/src/pty-session.ts` | `/Users/peter/Desktop/code/wzrdagentstudio/packages/wzrd-agent-relay/src/pty-session.ts` | Startup command, working directory, input/output dirs, WZRD agent instructions. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay/src/audit.ts` | `/Users/peter/Desktop/code/wzrdagentstudio/packages/wzrd-agent-relay/src/audit.ts` | Audit table/function names, event types, metadata keys. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/qcut-relay/src/pty-session.test.ts` | `/Users/peter/Desktop/code/wzrdagentstudio/packages/wzrd-agent-relay/src/pty-session.test.ts` | Expected WZRD command and ack behavior. |

## 作为逻辑参考、不要直接 Copy 的文件

QCut `license-server` 是 Hono/Cloudflare Worker server。WZRD 使用 Supabase Edge Functions，所以这些文件应迁移为 Supabase function shared modules。

| QCut source | Port into WZRD | Why not direct copy |
| --- | --- | --- |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent.ts` | `supabase/functions/agent-session/index.ts`, `agent-pty-token/index.ts`, `agent-files/index.ts` | QCut route 是 Hono route；WZRD edge function 是 Deno `Deno.serve`. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent-parts/auth.ts` | Reuse `/Users/peter/Desktop/code/wzrdagentstudio/supabase/functions/_shared/auth.ts` | WZRD already has Supabase JWT auth helpers. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent-parts/constants.ts` | `supabase/functions/_shared/daytona-agent/constants.ts` | Need WZRD image, relay URL, sandbox dirs, project context. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent-parts/daytona.ts` | `supabase/functions/_shared/daytona-agent/daytona.ts` | Keep Daytona SDK logic, change env loading and image defaults. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent-parts/sessions.ts` | `supabase/functions/_shared/daytona-agent/sessions.ts` | Change DB client from QCut data access to Supabase admin client. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent-parts/terminal.ts` | `supabase/functions/_shared/daytona-agent/relay-token.ts` | Keep signed token idea, adapt issuer/audience/claims. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent-parts/files.ts` | `supabase/functions/_shared/daytona-agent/files.ts` | Keep list/upload/download behavior, change dirs and response shape. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent-parts/serializers.ts` | `supabase/functions/_shared/daytona-agent/serializers.ts` | Change fields to WZRD schema. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent-parts/validation.ts` | `supabase/functions/_shared/daytona-agent/validation.ts` | Change accepted payload shape and project ownership checks. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent-parts/data-access.ts` | Do not copy as one file | WZRD should use Supabase client calls near shared session/file modules. |
| `/Users/peter/Desktop/code/qcut/qcut/packages/license-server/src/routes/agent-parts/jobs.ts` | Optional only | Online terminal flow does not need queued jobs at first. |

## Frontend Behavior Reference

Use these QCut files to understand behavior and split it into React hooks/components.

| QCut source | WZRD React equivalent |
| --- | --- |
| `/Users/peter/Desktop/code/qcut/qcut/packages/nexusai-website/chat-agent.html` | `src/pages/DaytonaAgentPage.tsx` |
| `/Users/peter/Desktop/code/qcut/qcut/packages/nexusai-website/js/agent-chat/01-runtime-api.js` | `src/services/daytonaAgentService.ts` |
| `/Users/peter/Desktop/code/qcut/qcut/packages/nexusai-website/js/agent-chat/02-ui-files.js` | `src/hooks/daytona-agent/useDaytonaAgentFiles.ts`, `src/components/daytona-agent/AgentFileBrowser.tsx` |
| `/Users/peter/Desktop/code/qcut/qcut/packages/nexusai-website/js/agent-chat/03-terminal-job.js` | `src/hooks/daytona-agent/useDaytonaTerminalSocket.ts`, `src/components/daytona-agent/AgentTerminal.tsx` |
| `/Users/peter/Desktop/code/qcut/qcut/packages/nexusai-website/js/agent-chat/04-bootstrap.js` | `src/pages/DaytonaAgentPage.tsx`, route loader/state initialization |

## DB Migration Reference

| QCut source | WZRD target | Notes |
| --- | --- | --- |
| `/Users/peter/Desktop/code/qcut/qcut/packages/db/supabase/migrations/20260516000000_agent_sessions.sql` | `supabase/migrations/YYYYMMDDHHMMSS_create_daytona_agent_runtime.sql` | Keep runtime concepts, rename tables/columns for WZRD. |

Recommended WZRD tables:

- `daytona_agent_sessions`
- `daytona_agent_events`
- optional `daytona_agent_files` if file metadata needs DB tracking

Do not reuse the existing WZRD `wzrd_agent_sessions` table unless the session is only a logical workflow generation record. Daytona runtime state should stay separate.

## Do Not Copy Directly

| QCut item | Reason |
| --- | --- |
| QCut `DEFAULT_DAYTONA_IMAGE` | WZRD needs its own repository, dependencies, CLI, and startup context. |
| QCut `CODEX_AGENT_INSTRUCTIONS` | Rewrite for WZRD project graph, media generation, editor/export concepts. |
| QCut static CSS/HTML | WZRD already has React UI conventions. |
| QCut Hono route wrappers | WZRD uses Supabase Edge Functions. |
| QCut agent-worker package | Online PTY chat does not require background queued jobs initially. |

