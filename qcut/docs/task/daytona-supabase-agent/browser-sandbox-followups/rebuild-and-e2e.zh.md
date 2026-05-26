# 镜像什么时候要重新构建，以及 E2E 测试在哪里

## 1. 本地改了什么代码需要重新构建 `qcut-cli` 镜像？

镜像由 `Dockerfile.cli` 构建，入口是 `bun run build:cli-image`
（实际跑 `scripts/build-cli-image.ts`）。

builder 阶段会把这些源码路径 `COPY` 进容器（Dockerfile.cli:16-23），
跑 `bun install --frozen-lockfile` + `bun run build`；runtime 阶段
再把编译产物 `dist/`、`node_modules/`、整个 `electron/` 树、嵌入的
skill 以及两个 shell 脚本拷进来（Dockerfile.cli:84-96）。**凡是被
拷进镜像的东西都是"烤死的"——本地改了，不重新构建镜像，容器里看不到。**

### 下列任何一项变更都必须重建镜像

1. **被构建拉进镜像的源码** —— `apps/`、`packages/`、`electron/`、
   `scripts/`、`tsconfig.json`（Dockerfile.cli:19-23）。
2. **依赖** —— `package.json` 或 `bun.lock`（Dockerfile.cli:16、26）。
   只要重跑 `bun install --frozen-lockfile` 后 `node_modules/` 会变，
   就要重建。
3. **嵌入的 CLI skill** —— `.claude/skills/native-cli/`
   （Dockerfile.cli:88）。容器里跑 Codex/Claude 时会读这个目录。
4. **容器 shell 包装脚本** ——
   `electron/native-pipeline/container/entrypoint.sh` 和 `smoke.sh`
   （Dockerfile.cli:91-96）。它们最后变成
   `/usr/local/bin/qcut-entrypoint` 和 `/usr/local/bin/qcut-smoke`。
5. **写死的工具版本** —— Dockerfile 顶上的 ARG：
   `CODEX_CLI_VERSION`、`CLAUDE_CODE_VERSION`、`DENO_VERSION`、
   `YT_DLP_VERSION`（Dockerfile.cli:32-35）。要把沙箱里的
   Codex/Claude/Deno/yt-dlp 升级就改这里然后重建。
6. **base image 或系统包** —— `oven/bun:1.3.10-debian` tag、
   `apt-get install` 那一串（Dockerfile.cli:30、40-52）。
7. **Dockerfile 本身。**

### 下列变更**不**需要重建镜像

- **纯文档** —— `docs/`、`*.md`、本文件夹。
- **跑在容器外的服务端代码** ——
  `packages/license-server/`、`packages/qcut-relay/`，以及任何 CLI
  不 import 的其它 package。这些是分别部署到 Cloudflare Workers 的，
  不进镜像。
- **CLI 用不到的 renderer 代码**。技术上它们会随 `COPY apps/` 一起
  进镜像，但没人在容器里用——只有出于"洁癖"才会想重建。

### 经验法则

只要改的是**容器里用户会跑的东西**（`qcut` CLI、entrypoint、嵌入的
skill、写死的工具版本）→ 重建。如果只是改沙箱周边的网站 /
license-server / relay → 单独部署，跟镜像无关。

### 怎么重建

```bash
bun run build:cli-image                       # 默认 tag：qcut-cli:dev
QCUT_VERSION=v0.3.2 bun run build:cli-image   # 指定版本 tag
PLATFORMS=linux/amd64,linux/arm64 bun run build:cli-image
```

然后推到 GHCR（生产用的 tag 是
`ghcr.io/quriosity-agent/qcut-cli:v0`，E2B 和 Daytona 都拉这个）。

---

## 2. E2E 测试文件和流程在哪里？

按"真实度"从低到高分四档：

### a. Relay 单元测试 —— `packages/qcut-relay/src/`

- `verify-token.test.ts` —— HS256 验签的正/反路径。
- `pty-session.test.ts` —— `parsePtyClientControlMessage`、
  `buildDaytonaPtyId`、`buildCodexStartupCommand` 这些纯函数。
  不接真 PTY。

通过 `bun run test` 跑。覆盖 relay 侧的逻辑，但**不**碰真沙箱。

### b. License-server 路由测试 —— `packages/license-server/src/routes/`

- `agent.terminal-token.test.ts`
- `agent.files.test.ts`
- `agent.validation.test.ts`
- `agent.jobs.test.ts`、`agent.sessions.test.ts`、`agent.artifacts.test.ts`
- `auth.test.ts`、`admin.test.ts`、`ai-proxy.test.ts`

在进程内挂起 Hono app，断响应。**Spawn 接口本身（`sandbox.ts`）
没有专门的测试文件**——只在下面的 dogfood 脚本里被间接覆盖。

### c. Agent-worker 集成测试 —— `packages/agent-worker/src/`

- `run-on-daytona.ephemeral.test.ts`
- `run-on-daytona.sessions.test.ts`
- `run-on-daytona.cleanup.test.ts`
- `run-on-daytona.command.test.ts`
- `run-on-daytona.entrypoint.test.ts`

agent-worker 半边流程里最接近"真集成"的一档——在 Daytona SDK
那一层打桩。

### d. 端到端 dogfood 脚本 —— `scripts/`

**真正打到生产服务的 E2E 都在这里。**

1. **`scripts/daytona-dogfood.ts`** —— 用已发布的 `qcut-cli`
   镜像开真 Daytona 沙箱，跑 `qcut system doctor` 和
   `qcut flow idea2video`，拷贝产物回本地，删沙箱。前置：装好
   `daytona` CLI、`daytona login` 过。
2. **`scripts/daytona-worker-dogfood.ts`** —— 真的往
   `agent_jobs` 插一行，起 worker 对接真 Daytona + Supabase，
   等终态，打出 job 和产物证据。生产形状路径。
3. **`scripts/agent-chat-e2e.ts`** —— Playwright 打线上的
   `quriosity.com.au/chat-agent.html` 页面，把网站 chat agent
   走完一整个 session。注意它走的是"agent" session 类型——和
   "sandbox" 共用同一条 spawn → relay → PTY 链路。
4. **`scripts/agent-chat-image-ratio-size-e2e.ts`** —— 同上，
   专门覆盖图片宽高比 / 尺寸流程。
5. **`scripts/run-e2e-record.ts`、`collect-e2e-videos.ts`、
   `combine-e2e-videos.ts`、`e2e-virtual-display.ts`** —— Electron
   录屏 E2E 流水线，跟沙箱流程无关。

### e. Playwright（`bun run test:e2e`）—— `apps/web/src/test/e2e/`

编辑器功能 E2E（timeline、export、recording、project workflow、
视觉回归）。**全部不涉及浏览器沙箱 spawn 链路**。是在 Electron
里跑，不是打网站沙箱。

### 一个值得知道的空白

**"sandbox" session-kind 的端到端流程目前没有自动化测试** ——
也就是本文件夹 `README.zh.md` 里描述的那条 wzrdagentstudio
`/sandbox` 页面 → license-server spawn → relay → E2B PTY 链路。
今天靠手工验证。最接近的自动化覆盖是 `agent-chat-e2e.ts`，但它
走的是同一套 relay 代码的另一种 session 类型（**agent**）。

如果之后要把 sandbox 链路的自动化补上，把脚手架或计划放到本
文件夹下是最合适的。
