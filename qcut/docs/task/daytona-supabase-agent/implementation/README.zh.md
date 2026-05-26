# 实现计划

> 📌 **先读 [`ACTUAL.zh.md`](ACTUAL.zh.md)。** 下面几份 spec 在实现过程
> 中被取代或重构了（Drizzle 替代 Supabase 成 schema 权威；`user_id`
> 替换 `workspace_id`；spawn 搬到 license-server 的 Hono 路由）。
> ACTUAL.zh.md 是按 commit 记录的实际落地日志，附生产环境验证证据。
>
> 🐳 **然后读 [`IMAGE-BOOTSTRAP.zh.md`](IMAGE-BOOTSTRAP.zh.md)。** 今天
> qcut-cli 镜像在任何地方都不存在（本地 Docker、GHCR、E2B 都没有）。
> 三条路径（本地 / GHCR / E2B 模板）从 PR spec 里独立出来，因为每家
> provider 都需要自己的构建步骤。
>
> 🧭 **如果要理解当前 website Chat Agent 的真实运行流程，读
> [`11-chat-agent-runtime-flow.zh.md`](11-chat-agent-runtime-flow.zh.md)。**
> 它解释 Connect 如何创建/复用 Daytona session、接上 PTY relay、自动启动
> Codex、把 prompt 送进 persistent Codex TUI，以及 `/tmp/qcut-output`
> artifacts 如何出现在网页里。
>
> 🧪 **如果要看可重复验证，读
> [`12-agent-chat-e2e-cli.zh.md`](12-agent-chat-e2e-cli.zh.md) 和
> [`13-qcut-cli-command-survey.zh.md`](13-qcut-cli-command-survey.zh.md)。**
> 这两份记录 Chat Agent E2E 命令和 QCut CLI 命令族 smoke matrix。
>
> 🔑 **如果要看下一步 key 管理 CLI 改进，读
> [`14-qcut-system-keys-plan.zh.md`](14-qcut-system-keys-plan.zh.md)。**
> 它定义了建议新增的 `qcut system keys` 命令、JSON 契约、脱敏规则和
> Chat Agent preflight 流程。

九份 PR 级别的任务规约，每一份都能直接喂给 `/implementit`。每个文件明确说：要做什么、文件放哪、加哪些测试、跑什么验证算"完工"。

背景资料（为什么、schema 这些）在兄弟文件夹里：

- [`../core-plan/`](../core-plan/) —— 架构、容器、密钥
- [`../web-sandbox/`](../web-sandbox/) —— 浏览器沙箱

这些实现规约**引用**那些材料，不重复推导。

## 两阶段计划

### Phase 1 —— 无头 agent 路径

目标：agent 插一行 → 容器跑 `qcut` → 产物落 Supabase Storage。

| # | 规约 | 依赖 | 工作量 |
|---|------|------|--------|
| 01 | [`01-system-doctor.md`](01-system-doctor.md) —— `qcut system doctor --json --skip-health` | 无 | ~80 行 |
| 02 | [`02-container-image.md`](02-container-image.md) —— Dockerfile + entrypoint + smoke script | 01 | ~120 行 |
| 03 | [`03-supabase-schema.md`](03-supabase-schema.md) —— `agent_*` 四张表 + RLS | 无（和 01/02 并行） | ~150 行 |
| 04 | [`04-agent-worker.md`](04-agent-worker.md) —— Worker：claim → spawn qcut → 转发事件 → 更新行 | 02、03 | ~280 行 |
| 05 | [`05-daytona-devcontainer.md`](05-daytona-devcontainer.md) —— `.devcontainer/` + 首次 dogfood pipeline | 02 | ~60 行 |

Phase 1 落地后，你能在本地 `psql INSERT` 一行 job、看着本地 worker 把它消化掉。

### Phase 2 —— 浏览器沙箱（wzrdagentstudio 终端）

目标：人点 "qcut shell" → xterm.js 接到 E2B 的 PTY 上。

| # | 规约 | 依赖 | 工作量 |
|---|------|------|--------|
| 06 | [`06-sandbox-sessions-schema.md`](06-sandbox-sessions-schema.md) —— `sandbox_sessions` 表 + RLS | 03 | ~80 行 |
| 07 | [`07-spawn-edge-function.md`](07-spawn-edge-function.md) —— `/sandbox-spawn` Edge Function | 01、02、03、06 | ~150 行 |
| 08 | [`08-relay-worker.md`](08-relay-worker.md) —— Cloudflare Worker + Durable Object 做 PTY 中继 | 07 | ~250 行 |
| 09 | [`09-wzrd-terminal-ui.md`](09-wzrd-terminal-ui.md) —— wzrdagentstudio React 路由 + xterm.js | 07、08 | ~220 行 |

Phase 2 各 PR 在**依赖已合入 main 之后**可乱序，但 06 → 07 → 08 → 09 最易增量演示。

## 规约统一格式

每份 PR 规约都按这个骨架来：

1. **目标** —— 这个 PR merge 之后能 demo 什么（一句话）。
2. **依赖** —— 必须先合入的前序规约。
3. **涉及文件** —— 路径表 + 一行说明。
4. **实现** —— 按顺序写的具体代码片段。
5. **测试** —— 测试文件 + 命令 + 期望输出。
6. **验证** —— 端到端手工 smoke 命令。
7. **不在本 PR 范围** —— 显式 *不* 做的事（推迟到后续规约）。

`/implementit <spec.md>` 应当能凭这一份完成实现，无需外部上下文。

## 全局约定

- 所有 CLI 调用都用 `bun`（不用 `npm` / `yarn`）。
- 数据库 migration 走 `packages/db/supabase/migrations/<时间戳>_<名字>.sql`。
- Edge Function 走 `packages/db/supabase/functions/<name>/index.ts`。
- 新 worker 代码走 `packages/agent-worker/`（新包）。
- 所有 TS 引用都用 `.js` 扩展名（项目"TS 编译后跑"惯例）。
- 测试放源码旁边 `*.test.ts`（项目默认 Vitest）。
- 不加新 env var，除非 [`../core-plan/secrets-supabase.md`](../core-plan/secrets-supabase.md) 表里有一行。

## 这份计划**不**覆盖

- mitmproxy 凭证注入（Phase 3）
- 暖池 / 预热容器（Phase 3，等延迟要求逼上来）
- 多租户防火墙策略（Phase 3+）
- `qcut editor:*` / `record*` / `edit:remotion`（设计上超范围——它们要 Electron 渲染进程）

## 相关文档

- [`../README.md`](../README.md) —— 总索引
- [`../core-plan/architecture.md`](../core-plan/architecture.md) —— 退出码契约（每个规约都引）
- [`../core-plan/secrets-supabase.md`](../core-plan/secrets-supabase.md) —— Worker 复用的 `agent_secrets` 加载器
- [`12-agent-chat-e2e-cli.zh.md`](12-agent-chat-e2e-cli.zh.md) —— Chat Agent E2E 测试命令
- [`13-qcut-cli-command-survey.zh.md`](13-qcut-cli-command-survey.zh.md) —— QCut CLI smoke-test matrix
- [`14-qcut-system-keys-plan.zh.md`](14-qcut-system-keys-plan.zh.md) —— 建议新增的 `qcut system keys` 命令
