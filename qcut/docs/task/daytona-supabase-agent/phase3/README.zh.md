# Phase 3 —— 在已上线 Phase 2 沙箱基础上的收尾项

Phase 2 已经在 `v2026.05.14.1` 上线（PR #300，master `3d83aa396`

- `6902a9fbb`）。浏览器沙箱 spawn → relay → E2B PTY 真实跑通、
  credit 真扣。

下面 4 项是当时刻意推迟的，每一项都能独立成 PR，按影响面排序。

| #   | 项目                                    | 为什么推迟                                                                                     | 状态      |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 1   | `agent_secrets.value` 加密（pgsodium）  | v0 存明文；key-rotation 的运维流程当时没想清楚                                                 | 未启动    |
| 2   | spawn 失败时退款 credit                 | `deductCreditsForUser` 有反操作，但还没接进 `sandbox_create_failed` / `sandbox_unhealthy` 路径 | 未启动    |
| 3   | wzrdagentstudio `/sandbox` 接 QCut 登录 | 今天用 `localStorage.qcut_auth_token` 占位；要换成真的 Better Auth 流程                        | 未启动    |
| 4   | `qcut-cli` 镜像推 GHCR                  | 需要第一次真实镜像发布、public pull 验证、Daytona dogfood 证据                                 | ✅ 已验证 |

## 1. pgsodium 加密 `agent_secrets`

**目标**：别再把 FAL / Gemini / OpenAI 等 provider 密钥以明文形式
存在 `agent_secrets.value` 里。今天 DB 一旦被读穿，凭证立刻可用。

要想清楚的事：

- pgsodium 密钥管理：服务端密钥怎么管、谁能轮换、轮换的时候在跑
  的容器怎么办。
- 数据迁移：把现存行原地转加密（`qcutlove@qcut.app` 现在就有一条
  Gemini key）。一个事务搞完还是分阶段。
- 读路径：`packages/license-server/src/routes/sandbox.ts` 现在
  132–139 行 `SELECT key, value` 直接塞 envs。需要在服务端先解
  密再传给 `Sandbox.create()`。
- agent-worker 写路径：今天是管理员直接 insert。要么搞一个
  license-server 的 `POST /api/agent-secrets`，进库前加密；要么
  写个 SQL function 包住 encrypt 调用。

验证：迁移后开一个沙箱，容器里 `qcut system doctor --json
--skip-health` 还能返跟现在一样的 `keys_configured: 1`。

## 2. spawn 失败时退款 credit

**目标**：现在 spawn 在 `Sandbox.create()` **之前**就扣 5 credit。
如果 create 或 doctor 探活失败（今天返 `sandbox_create_failed`
或 `sandbox_unhealthy`），用户就是少了 5 credit 还没拿到沙箱。
`sandbox.ts:159` 上有条 `// TODO: refund credits here`。

要做的事：

- `packages/license-server/src/services/credit-service.ts` 里
  `deductCreditsForUser` 已经存在；需要它的反操作
  `refundCreditsForUser`（或者直接以负数调 deduct，看服务的不变
  量怎么定义）。
- `sandbox.ts` 里两条失败路径都接上：
  - `sandbox_create_failed`（约 149-162 行）
  - `sandbox_unhealthy`（约 184-197 行）
  - `persist_failed`（约 223-232 行）
  - `jwt_sign_failed`（约 241-250 行）
- 同时往 `agent_events` 落一条 `kind: "credit_refunded"` 做审计。

验证：故意制造 probe 失败（删 E2B 模板，或者用一个不存在的
`QCUT_IMAGE_TAG`），调 `/api/sandbox/spawn`，然后 `/api/license`
看 credit 余额没变。

## 3. wzrdagentstudio `/sandbox` 接 QCut 登录

**目标**：现在 wzrdagentstudio 的 `/sandbox` 用
`localStorage.qcut_auth_token` 占位。换成真的 Better Auth 流程，
未登录就跳 QCut 登录页，登录后 token 自动挂上。

要做的事：

- 找 wzrdagentstudio（或本仓 apps/web）里已经在用的 Better Auth
  客户端，搬过来。
- Wzrd 的 `/sandbox` 路由：先看 session，没有就跳
  `https://qcut.app/sign-in?continue=…`。
- spawn-client：去掉 `localStorage` 占位，从 Better Auth 客户端
  读 session token。

验证：开一个无痕窗口的 `/sandbox`，确认跳转、登录、回到
`/sandbox`、spawn 成功、relay 挂上。

## 4. `qcut-cli` 镜像推 GHCR

**目标**：agent-worker 的 Daytona 路径指着
`ghcr.io/quriosity-agent/qcut-cli:v0`。`.github/workflows/cli-image.yml`
必须能 build、smoke、publish，并产出 Daytona 不带私有 GHCR token 也能拉的镜像。

`b536d61b2` 已完成：

- 新增 `.github/workflows/cli-image.yml`：构建 `Dockerfile.cli`、
  跑 `qcut-smoke`、推 `ghcr.io/<owner>/qcut-cli:<tag>` 和 `:latest`。
- 给 `packages/agent-worker` 加 `@daytona/sdk`。
- 把原先近似的 Daytona runner 换成当前 SDK 形态：
  `daytona.create({ image, envVars, resources, ephemeral })`、
  `sandbox.process.executeSessionCommand(...)`、
  `sandbox.fs.downloadFile(...)`、`daytona.delete(...)`。
- 加了测试覆盖 command 构造、secret env 投影、危险 command 拒绝、
  artifact fallback event、sandbox cleanup。
- 本地验证通过：
  - `bun --cwd packages/agent-worker test`
  - `bunx tsc --noEmit -p packages/agent-worker/tsconfig.json`
  - `bunx @biomejs/biome check ...`

GHCR/Daytona 验证这轮已完成：

- 修了默认分支 workflow 的 GHCR owner 大小写问题（`master` 上
  `f80dc47dd`；本分支 cherry-pick 为 `ed99a4ac9`），保证 Docker tag
  全小写。
- 跑了 workflow run `25893277360`，`tag=v0`；它构建
  `Dockerfile.cli`、跑 `qcut-smoke`、推 `:v0` + `:latest`。
- 发布 digest：
  `sha256:b1b35894c4c9b77fc79522ed209d610cfd2f3816479056f8aa61d6a8bcce2356`。
- GHCR package 已改 public，然后验证了匿名
  `docker pull --platform linux/amd64 ghcr.io/quriosity-agent/qcut-cli:v0`
  和本地 `docker run ... qcut-smoke`。
- 修正本地 dogfood env：`SUPABASE_SERVICE_ROLE_KEY` 现在确实是
  `service_role` JWT，不再是 anon key。
- 创建了 Supabase Storage 私有 bucket `artifacts`。
- 修了 dogfood 暴露出来的 worker 问题：
  - Supabase RPC 的 snake_case row 先 normalize，再用 `job.userId`
  - Daytona 里改用 `/tmp/qcut-output`，因为非 root 镜像用户不能创建 `/output`
- `bun run dogfood:daytona-worker` 已成功：
  - job `dogfood-cc1078a0-2966-4afc-8444-08d514b76dca`
  - runner `adb353a8-269f-4f80-9987-4a71f98f599a`
  - status `succeeded`，exit code `0`
  - artifact `234936d9-3e87-4ca9-ba68-cff42299726b`

这个 item 的下一个子任务：merge/deploy worker 修复。除非 CLI runtime 代码变了，
否则继续用 `QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:v0`。

## 推荐做的顺序

1. **先部署 #4 的 worker 修复**：镜像路径已验证；row normalize 和
   Daytona output dir 修复需要跟 worker 代码一起落地。
2. **#2（credit 退款）**：最小、所有改动都在 `sandbox.ts` 和
   `credit-service.ts` 之内，一个 PR 就能下。
3. **#1（pgsodium）**：要做迁移、要想清楚密钥管理；做砸了爆炸半径
   最大。
4. **#3（QCut 登录）**：要动 wzrdagentstudio，跨仓库，可能要跟那
   边的负责人对一下。
