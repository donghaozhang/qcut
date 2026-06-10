# Copy / Adapt Map

## Conclusion

QCut's Daytona agent files fall into four groups:

1. **Relay Worker**: best copied into a new package and adapted.
2. **License Server agent parts**: should be ported into Supabase Edge Function `_shared` modules.
3. **Static frontend chat agent**: use as a behavior reference only.
4. **DB migration**: use the runtime concepts, but create WZRD-specific tables.

## Files That Can Mostly Be Copied

These files come from QCut's relay package. Create a WZRD relay package, copy them, then adjust WZRD names and env config.

| QCut source | WZRD target | What changes |
| --- | --- | --- |
| `<QCUT_ROOT>/packages/qcut-relay/package.json` | `<WZRD_ROOT>/packages/wzrd-agent-relay/package.json` | Package name, scripts, test names. |
| `<QCUT_ROOT>/packages/qcut-relay/tsconfig.json` | `<WZRD_ROOT>/packages/wzrd-agent-relay/tsconfig.json` | Usually minor or no changes. |
| `<QCUT_ROOT>/packages/qcut-relay/vitest.config.ts` | `<WZRD_ROOT>/packages/wzrd-agent-relay/vitest.config.ts` | Usually minor or no changes. |
| `<QCUT_ROOT>/packages/qcut-relay/src/verify-token.ts` | `<WZRD_ROOT>/packages/wzrd-agent-relay/src/verify-token.ts` | Keep the shape. Adjust claim names only if needed. |
| `<QCUT_ROOT>/packages/qcut-relay/src/verify-token.test.ts` | `<WZRD_ROOT>/packages/wzrd-agent-relay/src/verify-token.test.ts` | Update issuer/audience/env names. |

## Files To Copy And Adapt

| QCut source | WZRD target | Required changes |
| --- | --- | --- |
| `<QCUT_ROOT>/packages/qcut-relay/wrangler.toml` | `<WZRD_ROOT>/packages/wzrd-agent-relay/wrangler.toml` | Worker name, routes, Durable Object class/binding names, env vars. |
| `<QCUT_ROOT>/packages/qcut-relay/src/index.ts` | `<WZRD_ROOT>/packages/wzrd-agent-relay/src/index.ts` | CORS origins, route names, env interface, token payload shape. |
| `<QCUT_ROOT>/packages/qcut-relay/src/pty-session.ts` | `<WZRD_ROOT>/packages/wzrd-agent-relay/src/pty-session.ts` | Startup command, working directory, input/output dirs, WZRD agent instructions. |
| `<QCUT_ROOT>/packages/qcut-relay/src/audit.ts` | `<WZRD_ROOT>/packages/wzrd-agent-relay/src/audit.ts` | Audit table/function names, event types, metadata keys. |
| `<QCUT_ROOT>/packages/qcut-relay/src/pty-session.test.ts` | `<WZRD_ROOT>/packages/wzrd-agent-relay/src/pty-session.test.ts` | Expected WZRD command and ack behavior. |

## Logic References, Not Direct Copies

QCut `license-server` is a Hono/Cloudflare Worker server. WZRD uses Supabase Edge Functions, so these files should be ported into function modules instead of copied directly.

| QCut source | Port into WZRD | Why not direct copy |
| --- | --- | --- |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent.ts` | `supabase/functions/agent-session/index.ts`, `agent-pty-token/index.ts`, `agent-files/index.ts` | QCut route is a Hono route; WZRD edge functions use `Deno.serve`. |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent-parts/auth.ts` | Reuse `<WZRD_ROOT>/supabase/functions/_shared/auth.ts` | WZRD already has Supabase JWT auth helpers. |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent-parts/constants.ts` | `supabase/functions/_shared/daytona-agent/constants.ts` | Needs WZRD image, relay URL, sandbox dirs, project context. |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent-parts/daytona.ts` | `supabase/functions/_shared/daytona-agent/daytona.ts` | Keep Daytona SDK logic, change env loading and image defaults. |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent-parts/sessions.ts` | `supabase/functions/_shared/daytona-agent/sessions.ts` | Change DB client from QCut data access to Supabase admin client. |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent-parts/terminal.ts` | `supabase/functions/_shared/daytona-agent/relay-token.ts` | Keep signed token idea, adapt issuer/audience/claims. |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent-parts/files.ts` | `supabase/functions/_shared/daytona-agent/files.ts` | Keep list/upload/download behavior, change dirs and response shape. |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent-parts/serializers.ts` | `supabase/functions/_shared/daytona-agent/serializers.ts` | Change fields to WZRD schema. |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent-parts/validation.ts` | `supabase/functions/_shared/daytona-agent/validation.ts` | Change accepted payload shape and project ownership checks. |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent-parts/data-access.ts` | Do not copy as one file | WZRD should use Supabase client calls near shared session/file modules. |
| `<QCUT_ROOT>/packages/license-server/src/routes/agent-parts/jobs.ts` | Optional only | The online terminal flow does not need queued jobs at first. |

## Frontend Behavior Reference

Use these QCut files to understand behavior, then split it into React hooks and components.

| QCut source | WZRD React equivalent |
| --- | --- |
| `<QCUT_ROOT>/packages/nexusai-website/chat-agent.html` | `src/pages/DaytonaAgentPage.tsx` |
| `<QCUT_ROOT>/packages/nexusai-website/js/agent-chat/01-runtime-api.js` | `src/services/daytonaAgentService.ts` |
| `<QCUT_ROOT>/packages/nexusai-website/js/agent-chat/02-ui-files.js` | `src/hooks/daytona-agent/useDaytonaAgentFiles.ts`, `src/components/daytona-agent/AgentFileBrowser.tsx` |
| `<QCUT_ROOT>/packages/nexusai-website/js/agent-chat/03-terminal-job.js` | `src/hooks/daytona-agent/useDaytonaTerminalSocket.ts`, `src/components/daytona-agent/AgentTerminal.tsx` |
| `<QCUT_ROOT>/packages/nexusai-website/js/agent-chat/04-bootstrap.js` | `src/pages/DaytonaAgentPage.tsx`, route loader/state initialization |

## DB Migration Reference

| QCut source | WZRD target | Notes |
| --- | --- | --- |
| `<QCUT_ROOT>/packages/db/supabase/migrations/20260516000000_agent_sessions.sql` | `supabase/migrations/YYYYMMDDHHMMSS_create_daytona_agent_runtime.sql` | Keep runtime concepts, rename tables/columns for WZRD. |

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

