# PR 10 —— Agent Session Mode（实现计划）

> **Phase**：3 · **依赖**：PR 03（库表基线）、PR 04（agent worker）、PR 05（Daytona devcontainer） · **工作量**：~650 行（schema + license-server + worker + 网站）

本文件是把 [`10-agent-session-mode.md`](10-agent-session-mode.md) 里那份
**规格说明**（数据模型、API、生产 E2E 结果）落成代码的**实施步骤**。
每个子任务都按 ≤ 20 分钟一段拆好，并写明涉及的具体文件路径。

## 目标

让网站 Chat Agent 的默认模式跑在一个常驻的 Daytona Codex session 上：
同一个浏览器对话复用同一个温热 sandbox，跨多轮对话；sandbox 只会因为
空闲超时、硬 TTL、用户主动「新建会话」三种情况下被回收。

这份计划需要长期守住的几条性质：

- **session id 不是凭证**。license-server 每条路由都从 auth token 重新
  推导出用户，并用 `user_id` 验证归属。光偷到 session id 拿不到任何东西。
- **sandbox 生命周期由 worker 独占**。license-server 只改 DB 行，Daytona
  credential 永远只在 worker 进程里。这样将来换供应商不用动网站。
- **一发即焚的任务保持原样**。没有 `sessionId` 的 job 走旧路径，session
  完全是增量加上来的。
- **artifact 仍按 job 分隔**。每轮只上传 `/tmp/qcut-output`；sandbox 里其
  它路径（包括 `/tmp/qcut-tools`、`/home/qcut`、工作目录）是用户的常驻
  工作区，不动。

## 涉及文件

| 路径 | 动作 | 用途 |
|------|------|------|
| `packages/db/migrations/0006_agent_sessions.sql` | 新 | `agent_sessions` 表 + `agent_jobs.session_id` 外键 + 索引 |
| `packages/db/supabase/migrations/<ts>_agent_sessions.sql` | 新 | 同一份 migration 的 Supabase CLI 版本（线上库用） |
| `packages/db/src/schema.ts` | 改 | `agent_sessions`、`session_id` 列、配套索引的 Drizzle 定义 |
| `packages/license-server/src/routes/agent.ts` | 改 | `POST /api/agent/sessions`、`POST /api/agent/sessions/:id/end`，`POST /api/agent/jobs` 加 `sessionId` |
| `packages/license-server/src/routes/agent.test.ts` | 改 | session 创建/复用/结束 + 带 session 的 job 测试 |
| `packages/agent-worker/src/claim.ts` | 改 | 认领 job 时同时加载 `session_id` 行 |
| `packages/agent-worker/src/run-on-daytona.ts` | 改 | 有 `provider_session_id` 时复用 sandbox；session job 不在 job 结束后删 sandbox |
| `packages/agent-worker/src/main.ts` | 改 | idle / TTL 清理循环 |
| `packages/agent-worker/src/run-on-daytona.test.ts` | 改 | 一发即焚 vs session 两种 sandbox 生命周期 |
| `packages/agent-worker/src/stream-events.test.ts` | 改 | sandbox 复用时 Codex prompt 按 job 注入（防回放旧 prompt） |
| `packages/agent-worker/src/cleanup.ts` | 新（可选） | 把清理逻辑抽函数出来，方便单测 |
| `packages/agent-worker/src/cleanup.test.ts` | 新 | idle / TTL / stopping 三条清理路径 |
| `packages/nexusai-website/chat-agent.html` | 改 | session 状态 UI 块、「新建会话」按钮 |
| `packages/nexusai-website/js/agent-chat.js` | 改 | session 创建、`qcut_agent_session_id` 存取、结束调用 |
| `packages/nexusai-website/js/agent-chat.test.js` | 改 | 网页端 session 生命周期 |

## 子任务

每个子任务都按一次专注开发能干完的大小切分。每条都可以单独提 PR 上线
（如果有 feature flag 就更稳）。

### 子任务 10.1 —— Drizzle schema：`agent_sessions`

涉及：`packages/db/src/schema.ts`。

按规格加 `agent_sessions` 表：`id`、`user_id`、`status`（枚举
`'active' | 'stopping' | 'ended' | 'error'`）、`provider`（默认 `'daytona'`）、
`provider_session_id`（可空）、`image_tag`、`started_at`、`last_active_at`、
`expires_at`、`ended_at`、`end_reason`、`runner_id`。

索引（清理循环每 60s 跑一次，长期开销要扛住）：

- `agent_sessions_user_status_last_active_idx`：`(user_id, status, last_active_at desc)`
- `agent_sessions_expires_active_idx`：`(expires_at)`，带 `status = 'active'` 谓词

`agent_jobs.session_id` 加上可空外键 → `agent_sessions.id`，`on delete set
null`。再加 `agent_jobs_session_created_idx` on `(session_id, created_at
desc)`，per-session 的 job feed 才便宜。

在 `packages/db/` 下跑 `bunx drizzle-kit generate` 刷一下 metadata 快照。

### 子任务 10.2 —— SQL migration

涉及：`packages/db/migrations/0006_agent_sessions.sql`、
`packages/db/supabase/migrations/<ts>_agent_sessions.sql`。

不要纯靠 `drizzle-kit push`，因为同一份 SQL 要出两条路径：

1. 本地 Drizzle migration（测试 + 本地 Postgres）。
2. Supabase CLI migration（`SUPABASE_ACCESS_TOKEN=… supabase db push` 从
   `packages/db/` 跑出去）。

migration 要**幂等、单向**：`create table if not exists`、
`alter table … add column if not exists`、`create index if not exists`。
线上已经有这列之后不能安全下线，所以不写 down migration。

### 子任务 10.3 —— license-server 的 session 路由

涉及：`packages/license-server/src/routes/agent.ts`。

加两条新路由，扩一条旧路由：

- `POST /api/agent/sessions`：body `{ mode: "codex" }`。事务里：取当前
  用户最新的 `active` 且 `expires_at > now` 的 session；没有就插一条新
  行，`status='active'`、`started_at=now`、`last_active_at=now`、
  `expires_at=now + 2h`。返回这一行。
- `POST /api/agent/sessions/:sessionId/end`：取 session、校 `user_id ==
  authedUser.id`，置 `status='stopping'`、`end_reason='user_kill'`。
  真正的 sandbox 删除由 worker 完成。
- `POST /api/agent/jobs`：接受可选 `sessionId`。给了就在事务里校验归属
  + `active`、把 `last_active_at` 拍到 now、把 `session_id` 存到 job 上。
  找不到 / 不 active 时返回 `404` / `409`，不要静默丢。

长期注意：**永远不要单凭 `sessionId` 信任**。事务里必须重新校 `user_id`。
这条性质 10.4 的单测会编码下来。

### 子任务 10.4 —— license-server 路由测试

涉及：`packages/license-server/src/routes/agent.test.ts`。

要补的用例：

- `POST /api/agent/sessions` 在 TTL 窗口内第二次调用返回同一行（复用）。
- 上一条过期之后再调返回新行。
- `POST /api/agent/sessions/:id/end` 对别人家的 session 返 404（不是 403
  ——不暴露存在性）。
- `POST /api/agent/jobs` 带别人家的 `sessionId` 返 404，并且**不**插入
  job 行。
- 合法 `sessionId` 会拍新 `last_active_at`，且 job 行落了 `session_id`。

运行：`bun --cwd packages/license-server test -- agent.test.ts`。

### 子任务 10.5 —— worker 认领时一起加载 session

涉及：`packages/agent-worker/src/claim.ts`。

认领成功后顺便取一次 `agent_sessions` 行（看现有 claim 代码选 join 还是
跟一发 select）。返回 `{ job, session | null }` 结构，下游不再补查。
没 session 的路径保持完全一致。

另外认领瞬间再校一次 session 是不是还 `active`。如果中间被人翻成
`stopping`，直接把 job 失败掉（`session_inactive`），别浪费一个 sandbox。

### 子任务 10.6 —— worker sandbox 复用

涉及：`packages/agent-worker/src/run-on-daytona.ts`。

按 `session` 是否存在分叉：

- **无 session**：维持现状——建、跑、上传、删。
- **有 session**：
  1. 若 `session.provider_session_id` 已存，先 `daytona.get(id)`；活的
     就复用，Daytona 说没了就掉到第 2 步。
  2. 用 `session.image_tag` 建新 sandbox。`UPDATE agent_sessions SET
     provider_session_id = …, runner_id = $worker WHERE id = $session_id
     AND provider_session_id IS NULL` —— 条件写是多 worker 安全的关键。
  3. 进 sandbox 后先清 `/tmp/qcut-output`（artifact 才保持按 job 隔
     离）。**不要**清 `/tmp/qcut-tools`、`/home/qcut`、工作目录。
  4. 跑 `codex exec --skip-git-repo-check --json -`，stdin 注入**当前
     job** 的 prompt——绝不能复用上一轮的（10.10 的测试会守住）。
  5. 上传 `/tmp/qcut-output` artifact。
  6. **跳过删除**。`UPDATE agent_sessions SET last_active_at = now`。
  7. 写一行 `agent_events`，`kind='agent_session_ready'`，payload
     `{ reused: boolean, provider_session_id }`。

### 子任务 10.7 —— 清理循环

涉及：`packages/agent-worker/src/main.ts`，可选抽到
`packages/agent-worker/src/cleanup.ts`，单测才不用把整套 worker 拉起来。

每 60s：

1. `SELECT id, provider_session_id, status FROM agent_sessions
   WHERE status = 'active' AND (last_active_at < now - interval '20 minutes'
   OR expires_at < now)
   OR status = 'stopping'
   LIMIT 50 FOR UPDATE SKIP LOCKED`。
2. 每一行：置 `status='stopping'`（已经是就 no-op），然后
   `daytona.delete(provider_session_id)`（best-effort，404 忽略）。
3. `UPDATE agent_sessions SET status='ended', ended_at=now,
   end_reason=$reason WHERE id=$id`。
4. 写一行 `agent_events`，`job_id=null`，`kind='agent_session_ended'`，
   payload `{ reason }`。

`FOR UPDATE SKIP LOCKED` 是长期性的那点 —— 多 worker 不会争同一行。

### 子任务 10.8 —— worker 测试：一发即焚 vs session

涉及：`packages/agent-worker/src/run-on-daytona.test.ts`。

mock Daytona client，断言：

- 一发即焚（无 `session_id`）：`create` + `delete` 各调一次。
- session job 且 `provider_session_id` 还没有：`create` 调一次，`delete`
  不调，调用结束后 `provider_session_id` 已落库。
- session job 且 `provider_session_id` 已存、Daytona 返活的 sandbox：
  `create` 不调，`delete` 不调。
- session job 且 `provider_session_id` 已存、Daytona 返「没了」：
  `create` 调一次，`delete` 不调，`provider_session_id` 被更新。

### 子任务 10.9 —— worker 测试：清理路径

涉及：`packages/agent-worker/src/cleanup.test.ts`（新）。

用例：

- `active` + `last_active_at` 早于 idle 阈值 → 标 `idle_timeout`。
- `active` + `expires_at < now` → 标 `ttl`。
- `stopping` → 标 `user_kill`。
- Daytona delete 返 404 → session 仍能进 `ended`（不会卡住）。

### 子任务 10.10 —— stream-events 测试：每 job 独立 prompt

涉及：`packages/agent-worker/src/stream-events.test.ts`。

这是「最可能将来踩坑」的回归测试：sandbox 复用时，Codex 进程要拿**这次
的** prompt，不是上次的。构造同一个 session 上的两个合成 job 走 streamer，
断言两次进 Codex stdin 的内容都正好是各自的当前 prompt。

### 子任务 10.11 —— 网页端 session 客户端

涉及：`packages/nexusai-website/js/agent-chat.js`。

- 第一次 Codex 发送（`localStorage` 没 `qcut_agent_session_id`）：
  `POST /api/agent/sessions` → 存 `session.id`。
- 每次 `POST /api/agent/jobs` 都带 `sessionId`。
- 收到 `agent_session_ended` SSE，`reason !== 'user_kill'` 时清
  `localStorage`、弹个 toast 提示「下条消息会开新会话」。

图生模式不动，继续一发即焚。

### 子任务 10.12 —— 「新建会话」UI

涉及：`packages/nexusai-website/chat-agent.html`、
`packages/nexusai-website/js/agent-chat.js`。

header 上加按钮：

1. 调 `POST /api/agent/sessions/<id>/end`（发完不等结果，4xx 忽略）。
2. 删 `qcut_agent_session_id`。
3. 清空页面对话记录。

session 状态指示：`session.id.slice(0,8)` 短码 + 一个由 `last_active_at +
20min` 算出来的倒计时，让用户能看见上下文什么时候会丢。

### 子任务 10.13 —— 网页端测试

涉及：`packages/nexusai-website/js/agent-chat.test.js`。

用例：

- 第一次 `send()` 调 sessions 路由、把 id 落到 localStorage。
- 第二次 `send()` 复用已有 id，**不**再调 sessions 路由。
- 点「新建会话」调 end 路由、清 localStorage。
- 收到 `agent_session_ended` 且 `reason='idle_timeout'`：清 localStorage，
  下次 `send()` 会新建。

运行：`node --test packages/nexusai-website/js/agent-chat.test.js`。

### 子任务 10.14 —— 验证矩阵

把 [`10-agent-session-mode.md`](10-agent-session-mode.md) 那次生产 E2E
跑过的命令全跑一遍：

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

手动 E2E（先 `supabase db push`、再用当前 `QCUT_IMAGE_TAG` 重启 worker）：

1. 浏览器登录后 `POST /api/agent/sessions`，记下 `session.id`。
2. 让 Codex 写一个 `marker.txt` 到 `/tmp/qcut-tools/`。
3. 再发一条让 Codex 读 `marker.txt`，得能读到上一轮的值。
4. 两条 `agent_session_ready` 事件：第一条 `reused=false`、第二条
   `reused=true`，`provider_session_id` 相同。
5. 点「新建会话」→ 看到 `agent_session_ended` 且 `reason='user_kill'`，
   下条消息会出新的 `provider_session_id`。

## 长期注意点

- **Cloudflare Worker 跑 migration**。2026-05-15 那次上线临时挂的 migration
  路由不能再回来。正经的 Supabase CLI 路径放在
  [`10-agent-session-mode.md`](10-agent-session-mode.md) 的 follow-up 里跟。
- **成本上限**。idle 中的 sandbox 即使没人打字也烧钱。默认值（idle 20 min、
  TTL 2 h）刻意调紧。将来要做「让会话更久」必须配上 per-user 额度策略，
  不要全局放宽默认。
- **provider 抽象**。`provider='daytona'` 这一列是有意留的。将来加新供应
  商靠扩枚举 + worker dispatch，不要把 Daytona 调用换成内联实现。
- **Codex PTY 续作**。规格里明说 PTY/daemon 是另一个 PR。不要把半成品 PTY
  逻辑塞进这一份；它需要自己的传输 + backpressure 设计。

## 参见

- [`10-agent-session-mode.md`](10-agent-session-mode.md) —— 本计划对应的
  规格 + 生产 E2E 结果
- [`06-sandbox-sessions-schema.md`](06-sandbox-sessions-schema.md) —— 早期
  的 session schema 工作
- [`04-agent-worker.md`](04-agent-worker.md) —— session 分支基于的 worker
  基线
- [`09-wzrd-terminal-ui.md`](09-wzrd-terminal-ui.md) —— UI 形态参考（不同
  消费端，本计划**不**沿用）
