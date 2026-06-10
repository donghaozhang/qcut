# Recommended Subtask Split

## Conclusion

Split the WZRD Daytona agent port into **10 subtasks**.

Why:

- The online Daytona agent crosses frontend, Supabase Edge Functions, Cloudflare Relay, Daytona image, DB, file flow, tests, and deployment.
- One or two large tasks would be hard to review and test.
- More than twelve tasks would make the interfaces too fragmented.
- Ten subtasks gives each part a clear deliverable and verification boundary.

## Subtask 1: Scope And Environment

Goal:

- Decide whether the WZRD agent is global or project-scoped.
- Confirm Daytona image, relay URL, JWT secret, and allowed origins.

Deliverables:

- route decision: `/agent` or `/projects/:projectId/agent`
- env list
- deployment target list

Done when:

- all later files can reference the same env names and route decision.

## Subtask 2: Daytona Runtime DB Schema

Goal:

- Add Daytona runtime session and audit event tables.
- Keep them separate from the existing `wzrd_agent_sessions` table.

Deliverables:

- `supabase/migrations/YYYYMMDDHHMMSS_create_daytona_agent_runtime.sql`
- `daytona_agent_sessions`
- `daytona_agent_events`
- RLS policies
- indexes
- updated_at trigger

Done when:

- authenticated users can access only their own runtime sessions.
- service role can write audit events.

## Subtask 3: Supabase Shared Modules

Goal:

- Port QCut `agent-parts` logic into WZRD `_shared/daytona-agent` modules.

Deliverables:

- `constants.ts`
- `types.ts`
- `validation.ts`
- `daytona.ts`
- `sessions.ts`
- `relay-token.ts`
- `files.ts`
- `serializers.ts`

Done when:

- validation, session reuse, and relay token logic have unit tests.
- route handlers do not contain bulky business logic.

## Subtask 4: Supabase Edge Functions

Goal:

- Provide authenticated HTTP APIs for the frontend.

Deliverables:

- `supabase/functions/agent-session/index.ts`
- `supabase/functions/agent-pty-token/index.ts`
- `supabase/functions/agent-files/index.ts`

Done when:

- session create/reuse works.
- relay token creation works.
- file upload/list/download works.
- all functions reuse WZRD `_shared/auth.ts` and `_shared/response.ts`.

## Subtask 5: Cloudflare Relay Worker

Goal:

- Port QCut relay into a WZRD relay package.

Deliverables:

- `packages/wzrd-agent-relay/package.json`
- `wrangler.toml`
- `src/index.ts`
- `src/pty-session.ts`
- `src/verify-token.ts`
- `src/audit.ts`
- relay tests

Done when:

- relay verifies tokens issued by the Supabase function.
- WebSocket attaches to Daytona sandbox PTY.
- reconnect and input acknowledgement behavior are stable.

## Subtask 6: WZRD Daytona Container Image

Goal:

- Build a WZRD-specific Daytona sandbox image.

Deliverables:

- `Dockerfile.daytona-agent`
- `scripts/build-daytona-agent-image.sh` or `.ts`
- image build/push instructions

Done when:

- image contains the WZRD workspace.
- agent command starts.
- `/tmp/wzrd-input` and `/tmp/wzrd-output` are readable and writable.

## Subtask 7: Frontend Service And Hooks

Goal:

- Encapsulate API, WebSocket, and file behavior in typed services and hooks.

Deliverables:

- `src/services/daytonaAgentService.ts`
- `src/hooks/daytona-agent/useDaytonaAgentSession.ts`
- `src/hooks/daytona-agent/useDaytonaTerminalSocket.ts`
- `src/hooks/daytona-agent/useDaytonaAgentFiles.ts`

Done when:

- hooks can be tested independently.
- page components do not manually assemble Supabase function requests.
- WebSocket lifecycle has dispose and reconnect behavior.

## Subtask 8: Frontend Page And Components

Goal:

- Add a usable Daytona agent page to WZRD.

Deliverables:

- `src/pages/DaytonaAgentPage.tsx`
- `src/components/daytona-agent/AgentTerminal.tsx`
- `AgentFileBrowser.tsx`
- `AgentUploadPanel.tsx`
- `AgentSessionStatus.tsx`
- route/nav updates

Done when:

- authenticated route renders.
- terminal, upload, and output list are usable.
- buttons have `type`; icon-only buttons have title/accessible labels.

## Subtask 9: Integration Smoke

Goal:

- Verify the main path from WZRD UI to Daytona sandbox.

Deliverables:

- one manual smoke checklist
- one automated Playwright smoke if feasible

Smoke flow:

1. log in
2. open agent route
3. create session
4. connect terminal
5. upload `hello.txt`
6. run a command that writes `/tmp/wzrd-output/result.txt`
7. refresh output list
8. download result
9. stop session

Done when:

- main path works without obvious auth, path traversal, or reconnect issues.

## Subtask 10: Production Readiness

Goal:

- Finish reliability, observability, and security checks before launch.

Deliverables:

- env checklist
- deploy checklist
- audit event checks
- timeout/cleanup policy
- rate limit or session limit policy
- error logging policy

Done when:

- staging deployment works.
- relay, Supabase functions, and Daytona image versions are recorded.
- failed sessions can be cleaned up or marked failed.

## Why Not Fewer

Fewer than seven subtasks would mix Supabase API, relay, frontend, and image work together, making review and testing too heavy.

## Why Not More

More than twelve subtasks would split a single interface chain too finely. For example, separating `agent-session` route work from session helper work would likely create avoidable interface churn.

## Recommended Order

1. Scope/env
2. DB schema
3. shared modules
4. edge functions
5. relay worker
6. Daytona image
7. frontend service/hooks
8. frontend page/components
9. integration smoke
10. production readiness

