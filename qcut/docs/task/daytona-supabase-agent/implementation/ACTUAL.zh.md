# 实际落地的样子

这份文件记录原 PR 规约（01-09）和**真正打进生产 QCut 后端**的差距。
先读这份再看具体 spec——那些 spec 还描述原计划，文件顶部有 banner
指向这里。

## 一句话

PR 03/06/07/09 原 spec 假设 Supabase Auth + `workspace_id` 概念。
QCut 真实架构是：**Better Auth 跑在 license-server Cloudflare
Worker 上**、schema 是 **Drizzle 管 Hyperdrive 后面的 Postgres**
（就是 Supabase 项目 `kbrtxitvavpuimuihppz` 那个 Postgres）、
**严格按用户走**——没有 workspace。重构把 sandbox/agent 路径合并到
这套架构里。

## 提交日志

| Commit | 内容 | 对应 spec |
|--------|------|-----------|
| `90ce05709` | `qcut system doctor --json --skip-health` | PR 01 ✅ 不变 |
| `fbae951f6` | Dockerfile + entrypoint + smoke + `build:cli-image` | PR 02 ✅ 不变 |
| `2add844f2` | （后被取代）agent_* 的 Supabase migration | PR 03 ❌ 被 `f4d4cd1` 取代 |
| `7f5f5b728` → `b9458750c`（rebase 后） | （后被重构）agent-worker 用 `workspace_id` | PR 04 ⚠️ 被 `665d05f19` 重构 |
| `9719bf874` | Daytona devcontainer + dogfood + worker swap-in | PR 05 ✅ 不变 |
| `2a8e16589` | （后被取代）sandbox_sessions 的 Supabase migration | PR 06 ❌ 被 `f4d4cd1` 取代 |
| `79f2c8734` | （后被取代）Deno Edge Function `/sandbox-spawn` | PR 07 ❌ 被本次 PR 取代 |
| `170924319` | `@qcut/relay` Cloudflare Worker（DO + token 校验） | PR 08 ✅ 结构不变；本次 PR 改了列名 |
| `f3caa17`（wzrdagentstudio） | xterm.js 终端调 Supabase Functions | PR 09 ⚠️ 本次 PR 改了端点 |
| `f4d4cd1` | **PR 10** —— schema 对齐：Drizzle 为源，`user_id` 替换 `workspace_id`，migration `0004_agent_sandbox_tables.sql` | 取代 03+06 |
| `665d05f19` | **PR 11** —— agent-worker 源码改 `userId`，所有 INSERT 显式带 `created_at` | 更新 04 |
| 本次 PR | **PR 12** —— Phase 2 对齐：sandbox-spawn 搬到 `packages/license-server/src/routes/sandbox.ts` 的 Hono 路由，接 Better Auth + 扣费；relay 审计列改名；wzrdagentstudio 前端打 license-server | 取代 07；更新 08+09 |

## 生产环境实测

下面这些都在 `kbrtxitvavpuimuihppz` 项目（ap-southeast-2）+ qcutlove
用户 `79bf60b02770d2cc510da53e471590f4` 上跑过：

| 检查 | 结果 |
|------|------|
| 通过 Management API 应用 migration 0004 | 5 张表 + RPC + 13 个索引建好；`pg_tables`/`pg_indexes` 查询确认 |
| Realtime publication 加上 `agent_jobs`、`agent_events`、`sandbox_sessions` | `pg_publication_tables` 确认 |
| `claim_one_agent_job` RPC smoke | INSERT → claim → 标 succeeded → 清理 全过 |
| Worker 对生产实跑 | claim 到真行、runner_id 落 DB、状态走到 `failed`（本机没 docker daemon，符合预期） |
| license-server `/api/license` | 返 `1000.3` 余额、plan `free`、reset `2026-06-11` |

## 还没做的（依赖外部凭证 / 服务）

1. **构建 + push** `qcut-cli:v0` 到 E2B/Daytona 能拉的 registry。是 CI 步骤，这里没做。
2. **设 license-server 密钥**（`wrangler secret put`）：`E2B_API_KEY`、`RELAY_SIGNING_SECRET`、`RELAY_HOST`、`QCUT_IMAGE_TAG`。
3. **部署 `@qcut/relay`**：`packages/qcut-relay` 下 `wrangler deploy`。
4. **轮换泄露的 Supabase PAT**（`sbp_b303...`）——GitHub secret scanner 已看到。去 supabase.com/dashboard/account/tokens 新建一个。
5. **wzrdagentstudio 接 QCut 登录**。SandboxPage 当前读 `localStorage.qcut_auth_token` 作为 v0 暂存——换成真正的 QCut sign-in 组件。
6. **spawn 失败时退费**。PR 12 的 `routes/sandbox.ts` 先扣费，但 E2B 失败后没退。小 follow-up。
7. **docker 不在时 stderr 抓不到**。PR 11 worker 退出码会落 DB，但 `error` 列在 execa 起不来时是 null。Follow-up。

## 怎么读各 spec

- **01、02、05** —— 准确，无 banner。
- **03、06、07** —— 已被取代；banner 指向本文件。
- **04、08、09** —— 原地更新；banner 说明改了什么。

总索引看 [`../README.zh.md`](../README.zh.md)。
