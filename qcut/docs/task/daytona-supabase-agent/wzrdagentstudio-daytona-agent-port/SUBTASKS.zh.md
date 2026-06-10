# 建议拆成多少个 Subtask

## 结论

建议拆成 **10 个 subtask**。

原因：

- Daytona online agent 涉及前端、Supabase Edge Functions、Cloudflare Relay、Daytona image、DB、文件流、测试和部署，不能压成一两个大任务。
- 但也不建议拆太碎，否则每个任务之间的接口反而难对齐。
- 10 个 subtask 可以让每个任务都有清晰交付物和测试边界。

## Subtask 1：确认范围和环境变量

Goal:

- 确认 WZRD 里 agent 是全局页面还是项目级页面。
- 确认 Daytona image、relay URL、JWT secret、allowed origins。

Deliverables:

- route decision: `/agent` or `/projects/:projectId/agent`
- env list
- deployment target list

Done when:

- 所有后续文件都能引用同一套 env name 和 route decision。

## Subtask 2：新增 Daytona Runtime DB Schema

Goal:

- 新建 Daytona runtime session 和 audit event 表。
- 保持和现有 `wzrd_agent_sessions` 分离。

Deliverables:

- `supabase/migrations/YYYYMMDDHHMMSS_create_daytona_agent_runtime.sql`
- `daytona_agent_sessions`
- `daytona_agent_events`
- RLS policies
- indexes
- updated_at trigger

Done when:

- authenticated user 只能访问自己的 runtime session。
- service role 可以写 audit event。

## Subtask 3：Supabase Shared Modules

Goal:

- 把 QCut `agent-parts` 的核心逻辑迁移为 WZRD `_shared/daytona-agent` 模块。

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

- validation、session reuse、relay token 都有单元测试。
- route handler 不包含大量业务逻辑。

## Subtask 4：Supabase Edge Functions

Goal:

- 提供前端调用的 authenticated HTTP API。

Deliverables:

- `supabase/functions/agent-session/index.ts`
- `supabase/functions/agent-pty-token/index.ts`
- `supabase/functions/agent-files/index.ts`

Done when:

- 能 create/reuse session。
- 能拿到 relay token。
- 能 upload/list/download files。
- 所有接口都复用 WZRD `_shared/auth.ts` 和 `_shared/response.ts`。

## Subtask 5：Cloudflare Relay Worker

Goal:

- 把 QCut relay port 成 WZRD relay。

Deliverables:

- `packages/wzrd-agent-relay/package.json`
- `wrangler.toml`
- `src/index.ts`
- `src/pty-session.ts`
- `src/verify-token.ts`
- `src/audit.ts`
- relay tests

Done when:

- relay 能验证 Supabase function 签发的 token。
- WebSocket 能 attach 到 Daytona sandbox PTY。
- reconnect 和 input ack 行为稳定。

## Subtask 6：WZRD Daytona Container Image

Goal:

- 构建 WZRD 专用 Daytona sandbox image。

Deliverables:

- `Dockerfile.daytona-agent`
- `scripts/build-daytona-agent-image.sh` or `.ts`
- image build/push instructions

Done when:

- image 内有 WZRD workspace。
- agent command 能启动。
- `/tmp/wzrd-input` 和 `/tmp/wzrd-output` 可读写。

## Subtask 7：Frontend Service 和 Hooks

Goal:

- 把 API/WebSocket/file behavior 封装成 typed service 和 hooks。

Deliverables:

- `src/services/daytonaAgentService.ts`
- `src/hooks/daytona-agent/useDaytonaAgentSession.ts`
- `src/hooks/daytona-agent/useDaytonaTerminalSocket.ts`
- `src/hooks/daytona-agent/useDaytonaAgentFiles.ts`

Done when:

- hooks 可以独立测试。
- 页面组件不直接拼 Supabase function request。
- WebSocket lifecycle 有 dispose/reconnect。

## Subtask 8：Frontend Page 和 Components

Goal:

- 在 WZRD 中增加可用的 Daytona agent 页面。

Deliverables:

- `src/pages/DaytonaAgentPage.tsx`
- `src/components/daytona-agent/AgentTerminal.tsx`
- `AgentFileBrowser.tsx`
- `AgentUploadPanel.tsx`
- `AgentSessionStatus.tsx`
- route/nav updates

Done when:

- authenticated route 能进入。
- terminal、upload、output list 都在页面中可用。
- button 有 `type`，icon-only button 有 title/accessible label。

## Subtask 9：Integration Smoke

Goal:

- 验证从 WZRD UI 到 Daytona sandbox 的主流程。

Deliverables:

- one manual smoke checklist
- one automated Playwright smoke if feasible

Smoke flow:

1. log in
2. open agent route
3. create session
4. connect terminal
5. upload `hello.txt`
6. run command that writes `/tmp/wzrd-output/result.txt`
7. refresh output list
8. download result
9. stop session

Done when:

- 主流程跑通，且没有 auth/path traversal/reconnect 明显问题。

## Subtask 10：Production Readiness

Goal:

- 补齐上线前的可靠性、观测和安全检查。

Deliverables:

- env checklist
- deploy checklist
- audit event checks
- timeout/cleanup policy
- rate limit or session limit policy
- error logging policy

Done when:

- staging deployment 可用。
- relay、Supabase functions、Daytona image 版本都有记录。
- 失败 session 能清理或标记 failed。

## 为什么不是更少

少于 7 个 subtask 会把 Supabase API、relay、frontend、image 混在一起，review 和测试会变重。

## 为什么不是更多

超过 12 个 subtask 会把同一条接口链切得太碎，比如 `agent-session` route 和 session helper 分开做，容易造成接口反复返工。

## 推荐执行顺序

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

