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

| Commit                                 | 内容                                                                                                                                                                                       | 对应 spec                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `90ce05709`                            | `qcut system doctor --json --skip-health`                                                                                                                                                  | PR 01 ✅ 不变                                              |
| `fbae951f6`                            | Dockerfile + entrypoint + smoke + `build:cli-image`                                                                                                                                        | PR 02 ✅ 不变                                              |
| `2add844f2`                            | （后被取代）agent\_\* 的 Supabase migration                                                                                                                                                | PR 03 ❌ 被 `f4d4cd1` 取代                                 |
| `7f5f5b728` → `b9458750c`（rebase 后） | （后被重构）agent-worker 用 `workspace_id`                                                                                                                                                 | PR 04 ⚠️ 被 `665d05f19` 重构                               |
| `9719bf874`                            | Daytona devcontainer + dogfood + worker swap-in                                                                                                                                            | PR 05 ✅ 不变                                              |
| `2a8e16589`                            | （后被取代）sandbox_sessions 的 Supabase migration                                                                                                                                         | PR 06 ❌ 被 `f4d4cd1` 取代                                 |
| `79f2c8734`                            | （后被取代）Deno Edge Function `/sandbox-spawn`                                                                                                                                            | PR 07 ❌ 被本次 PR 取代                                    |
| `170924319`                            | `@qcut/relay` Cloudflare Worker（DO + token 校验）                                                                                                                                         | PR 08 ✅ 结构不变；本次 PR 改了列名                        |
| `f3caa17`（wzrdagentstudio）           | xterm.js 终端调 Supabase Functions                                                                                                                                                         | PR 09 ⚠️ 本次 PR 改了端点                                  |
| `f4d4cd1`                              | **PR 10** —— schema 对齐：Drizzle 为源，`user_id` 替换 `workspace_id`，migration `0004_agent_sandbox_tables.sql`                                                                           | 取代 03+06                                                 |
| `665d05f19`                            | **PR 11** —— agent-worker 源码改 `userId`，所有 INSERT 显式带 `created_at`                                                                                                                 | 更新 04                                                    |
| 本次 PR                                | **PR 12** —— Phase 2 对齐：sandbox-spawn 搬到 `packages/license-server/src/routes/sandbox.ts` 的 Hono 路由，接 Better Auth + 扣费；relay 审计列改名；wzrdagentstudio 前端打 license-server | 取代 07；更新 08+09                                        |
| `b536d61b2`                            | **Phase 3 follow-up** —— GHCR 镜像 workflow、当前 `@daytona/sdk` worker 路径、Daytona runner 测试、镜像启动文档                                                                            | 完成 PR 05 Daytona swap-in 的代码部分；provider 验证仍待做 |

## 生产环境实测

下面这些都在 `kbrtxitvavpuimuihppz` 项目（ap-southeast-2）+ qcutlove
用户 `79bf60b02770d2cc510da53e471590f4` 上跑过：

| 检查                                                                       | 结果                                                                               |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 通过 Management API 应用 migration 0004                                    | 5 张表 + RPC + 13 个索引建好；`pg_tables`/`pg_indexes` 查询确认                    |
| Realtime publication 加上 `agent_jobs`、`agent_events`、`sandbox_sessions` | `pg_publication_tables` 确认                                                       |
| `claim_one_agent_job` RPC smoke                                            | INSERT → claim → 标 succeeded → 清理 全过                                          |
| Worker 对生产实跑                                                          | claim 到真行、runner_id 落 DB、状态走到 `failed`（本机没 docker daemon，符合预期） |
| license-server `/api/license`                                              | 返 `1000.3` 余额、plan `free`、reset `2026-06-11`                                  |

## 还没做的（依赖外部凭证 / 服务）

## `b536d61b2` 之后已经完成的事

1. **GHCR 发布 workflow 已有。** `.github/workflows/cli-image.yml`
   会构建 `Dockerfile.cli`、跑 `qcut-smoke`，然后推
   `ghcr.io/<owner>/qcut-cli:<tag>` 和 `:latest`。
2. **Daytona worker 已接当前 SDK。**
   `packages/agent-worker/src/run-on-daytona.ts` 现在使用
   `@daytona/sdk`（`daytona.create`、session command、sandbox
   filesystem download、`daytona.delete`），不再是旧的
   `sandboxes.create/exec/downloadDir` 近似写法。
3. **Daytona command/env 行为有测试。**
   `packages/agent-worker/src/run-on-daytona.test.ts` 覆盖
   entrypoint 包装、secret 注入、拒绝 shell metacharacter、
   sandbox 删除、artifact 下载、artifact fallback event。
4. **agent-worker 包可独立 type-check。**
   `packages/agent-worker/tsconfig.json` 把 ambient types 限到 Bun，
   避免根目录无关 type stub 漏进来。

## 还没做的（依赖外部凭证 / 服务）

1. **跑一次 GHCR workflow**，用 `tag=v0` 或选定 release tag，然后
   在带 token 的环境里确认
   `docker pull ghcr.io/quriosity-agent/qcut-cli:<tag>` 成功。
2. **真实 dogfood Daytona worker 路径**：设置 `DAYTONA_API_KEY` 和
   `QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:<tag>`，插入真实
   `agent_jobs` 行，确认 Daytona 能拉镜像、跑
   `qcut system doctor --json --skip-health`、下载 `/output`、并把
   job 标为 succeeded。
3. **设 / 确认 license-server 密钥**（`wrangler secret put`）：
   `E2B_API_KEY`、`RELAY_SIGNING_SECRET`、`RELAY_HOST`、`QCUT_IMAGE_TAG`。
4. **部署 / 确认 `@qcut/relay`**：`packages/qcut-relay` 下
   `wrangler deploy`。
5. **轮换泄露的 Supabase PAT**（`sbp_b303...`）——GitHub secret
   scanner 已看到。去 supabase.com/dashboard/account/tokens 新建一个。
6. **wzrdagentstudio 接 QCut 登录**。SandboxPage 当前读
   `localStorage.qcut_auth_token` 作为 v0 暂存——换成真正的 QCut
   sign-in 组件。
7. **spawn 失败时退费**。PR 12 的 `routes/sandbox.ts` 先扣费，但
   E2B 失败后没退。
8. **docker 不在时 stderr 抓不到**。PR 11 worker 退出码会落 DB，
   但 `error` 列在 execa 起不来时是 null。

## 怎么读各 spec

- **01、02、05** —— 准确，无 banner。
- **03、06、07** —— 已被取代；banner 指向本文件。
- **04、08、09** —— 原地更新；banner 说明改了什么。

总索引看 [`../README.zh.md`](../README.zh.md)。
