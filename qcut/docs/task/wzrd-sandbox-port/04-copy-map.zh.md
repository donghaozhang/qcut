# 复制映射

本文回答 WZRD 移植时“哪些文件可以复制？”。

## 轻量改造后可复制

这些文件是很好的源材料，接近可复用。

| QCut 文件 | 为什么复制 | 必要改动 |
|---|---|---|
| `Dockerfile.cli` | 预构建 media + Codex + QCut CLI 镜像的最佳来源。 | 重命名镜像，pin 目标 Codex/QCut 版本，更新 copied skill path，调整 provider key 文档。 |
| `e2b.Dockerfile` | 只有保留 E2B template 目标时才有用。 | 保留 single-stage parser workaround；如果 WZRD 标准化到 Daytona，就移除。 |
| `electron/native-pipeline/container/entrypoint.sh` | 处理 env-file materialization 和 Codex auth bootstrap。 | 替换 allow-listed keys；确认 home/workdir paths；保留 `0600` env file 行为。 |
| `electron/native-pipeline/container/smoke.sh` | 很好的镜像健康检查。 | 把 skill path 和 commands 改为 WZRD/QCut image 期望。 |
| `packages/agent-worker/src/daytona/command.ts` | safe command building、Codex prompt env、output archive、stream descriptors 的强参考。 | 重命名 constants、commands 和 prompt 文案。 |
| `packages/agent-worker/src/daytona/env.ts` | 简洁的 secret-to-env materialization。 | 从 WZRD secret storage 拉取，并使用 WZRD session role 命名。 |
| `packages/agent-worker/src/daytona/sessions.ts` | 可复用的 create/reuse/cleanup session lifecycle。 | 指向 WZRD tables 和 auth ids。 |
| `packages/agent-worker/src/daytona/remote-files.ts` | archive download/extract 很有用。 | 只需要少量路径命名改动。 |
| `packages/agent-worker/src/daytona/streaming.ts` | 适合把远程 output files polling 到 event rows。 | 把 event kinds 映射到 WZRD event schema。 |
| `packages/license-server/src/routes/agent-parts/validation.ts` | 很好的 path、filename、command、upload validation。 | 把 Hono `Context` parsing 改成 Supabase Edge request parsing。 |
| `packages/license-server/src/routes/agent-parts/files.ts` | 很好的 session file browser 和 upload/download 行为。 | 替换 Hono response、Daytona wrapper imports 和表名。 |
| `packages/qcut-relay/src/verify-token.ts` | 小型 HS256 verifier，不依赖重型库。 | 保留 claim 名或加入 WZRD-specific claims。 |
| `packages/qcut-relay/src/pty-session.ts` | live browser terminal 到 Daytona PTY 的最佳参考。 | 重写 instructions、cwd、paths 和 DB audit table names。 |

## 复制概念，不直接复制文件

这些值得学习，但直接复制会和 WZRD stack 打架。

| QCut 文件 | 保留思路 | 为什么不直接复制 |
|---|---|---|
| `packages/license-server/src/routes/agent.ts` | sessions/jobs/files 的 route shape。 | 它是 Cloudflare 上的 Hono；WZRD 使用 Supabase Edge Functions。 |
| `packages/license-server/src/routes/agent-parts/jobs.ts` | job creation、validation、detail response。 | 使用 Drizzle、Cloudflare env 和 QCut serializers。 |
| `packages/license-server/src/routes/agent-parts/sessions.ts` | create-or-reuse active session 行为。 | 表名和 auth model 不同。 |
| `packages/license-server/src/routes/agent-parts/terminal.ts` | 短期 PTY token 行为。 | 只有加入 relay 时才需要；backend framework 不同。 |
| `packages/db/src/schema.ts` | 表结构和 indexes。 | WZRD 应创建自己的 migration；不要整体复制 generated schema。 |
| `packages/db/migrations/0004_agent_sandbox_tables.sql` | 初始表关系和 claim function。 | 应为 WZRD 命名和 auth rules 重新生成 migration。 |
| `packages/db/migrations/0006_agent_sessions.sql` | persistent session table 和 jobs 上的 session_id。 | 同上。 |
| `packages/license-server/src/routes/sandbox.ts` | credit cap、spawn probe、token minting。 | 这是旧 E2B 链路，并混合了 license-server concern。 |

## 不要复制

这些要么是 QCut-specific，要么容易产生 drift。

- `bun.lock`、package workspace metadata、root package scripts，除非目标 worker 也变成 QCut 风格的 Bun workspace。
- `packages/db/src/schema.ts` 作为 WZRD authoritative schema file。
- 没有重新审视 WZRD secret policy 前，不要复制 QCut 的 `agent_secrets` plaintext storage 模型。
- QCut release docs。
- `packages/nexusai-website` 下的 QCut website UI 文件，除非明确要复制视觉行为。
- `qagent.yaml` 和 Agent Orchestrator configs；它们属于开发编排，不是 sandbox runtime。

## WZRD 最小复制集

无头 v1：

1. `Dockerfile.cli`
2. `electron/native-pipeline/container/entrypoint.sh`
3. `electron/native-pipeline/container/smoke.sh`
4. `packages/agent-worker/src/run-on-daytona.ts`
5. `packages/agent-worker/src/daytona/*`
6. `packages/agent-worker/src/upload-artifacts.ts`
7. `packages/license-server/src/routes/agent-parts/validation.ts` 中的 validation helpers

交互式 terminal v2，再加：

1. `packages/qcut-relay/src/index.ts`
2. `packages/qcut-relay/src/pty-session.ts`
3. `packages/qcut-relay/src/verify-token.ts`
4. `packages/qcut-relay/src/audit.ts`
5. `packages/license-server/src/routes/agent-parts/terminal.ts` 中的 terminal-token 行为

## WZRD 路径和命名替换

建议替换：

| QCut | WZRD |
|---|---|
| `/home/qcut/qcut` | `/home/wzrd/qcut` 或 `/workspace/qcut` |
| `/tmp/qcut-input` | 如果仍运行 QCut CLI 可保留；如果抽象化则用 `/tmp/wzrd-input` |
| `/tmp/qcut-output` | 如果仍运行 QCut CLI 可保留；如果 wrapper 做映射则用 `/tmp/wzrd-output` |
| `/tmp/qcut-tools` | 保留或改为 `/tmp/wzrd-tools` |
| `agent_sessions` | `qcut_agent_sessions` |
| `agent_jobs` | `qcut_agent_jobs` |
| `agent_events` | `qcut_agent_events` |
| `agent_artifacts` | `qcut_agent_artifacts` |
| `QCUT_IMAGE_TAG` | `WZRD_QCUT_IMAGE_TAG` |
| `QCUT_SESSION_ROLE` | `WZRD_AGENT_SESSION_ROLE` |

如果 sandbox 的主命令仍是 QCut CLI，保留 `/tmp/qcut-*` 路径更实际。用户可见的 API 仍然可以称它们为 WZRD agent files。

