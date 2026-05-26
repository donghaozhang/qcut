# CLI 镜像构建耗时、relay 部署命令、sandbox 启动命令

## 1. 构建 `qcut-cli` 镜像大概要多久？

取决于在哪儿构、buildx 缓存热不热、构几个架构。

### 实测耗时（单架构 `linux/amd64`）

| 在哪儿构 | 缓存 | 墙上时间 | 说明 |
| --- | --- | --- | --- |
| GitHub Actions（`.github/workflows/cli-image.yml`） | 热（GHA cache） | **11–16 分钟** | 最近 5 次：11m44s、14m9s、14m48s、16m16s、16m21s。workflow 里其实构了**两次**——一次 `--load` 跑 smoke、一次 `--push` 推 GHCR——所以差不多是两次完整 build 加一次 `docker run qcut-smoke`。 |
| 本地 `bun run build:cli-image` | 冷（buildx 缓存空） | M 系列 Mac 上约 5–10 分钟 | 分了层，`bun install` 即便缓存空也只跑一次。这次跑完之后 buildx 缓存就热了。 |
| 本地 `bun run build:cli-image` | 热 | 约 30 秒 – 2 分钟 | 只重建 `COPY` 源变了的那几层；apt + npm + deno 安装那几层走缓存。 |

仓库里的 `IMAGE-BOOTSTRAP.md` 写"约 3 min 一次"，是早期镜像更轻时
的估计——现在 runtime 阶段还要拉 Codex、Claude Code、Deno、yt-dlp，
真正冷构在本地差不多是 5–10 分钟。

### 哪些步骤拖时间

- `bun install --frozen-lockfile`（Dockerfile.cli:26）—— 几百 MB 的
  node_modules，大头是 Playwright / Remotion / FFmpeg bindings。
- `bun run build`（Dockerfile.cli:27）—— 整个 monorepo 的 TypeScript
  编译。
- `apt-get install` 装 ffmpeg + python + node + npm
  （Dockerfile.cli:40-52）—— 自己就一坨。
- `npm install -g @openai/codex` + `@anthropic-ai/claude-code`，以及
  下 `deno` 压缩包（Dockerfile.cli:53-67）。

### 哪些操作能让它快

- buildx 分层缓存 —— 只有输入变了的那层、以及之后的层会重建。改一
  个 TS 文件只会失效"COPY 源码"这层和后面，apt / npm / deno 那几层
  仍然命中缓存。
- 单架构 —— 默认就是 `linux/amd64`；要加 `linux/arm64` 时间大致翻
  倍，因为 buildx 是在 QEMU 下并发构两份。

### 怎么构

```bash
# 本地、单架构，构完顺带跑 smoke：
bun run build:cli-image                          # → qcut-cli:dev

# 指定版本：
QCUT_VERSION=v0.3.2 bun run build:cli-image      # → qcut-cli:v0.3.2

# 推镜像：别在本地推 —— CI 才是 source of truth。
# 手动触发 CI：
gh workflow run cli-image.yml -f tag=dev-2026-05-26
# 或者打一个 `v*` 开头的 git tag，workflow 自动触发。
```

`scripts/build-cli-image.ts` 故意不让本地多架构 ——
`docker buildx --load` 没法表达 manifest list，多架构发布交给 CI。

---

## 2. 推一份新 relay、以及启动 sandbox 各要哪些命令？

这是两件事。Relay 是 `packages/qcut-relay` 这个 Cloudflare Worker；
启动 sandbox 是去打 license-server 的接口，而 license-server 是
**另一个** Worker，在 `packages/license-server`。

### a. 推一份新 relay

```bash
# 从仓库根目录进 relay 包：
cd packages/qcut-relay

# 推之前先验一下：
bun run test                                    # 单元测试
bunx wrangler deploy --dry-run --outdir=/tmp/q  # 打包但不发布

# 首次部署才需要 —— Worker 运行时从环境读这些 secret：
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put RELAY_SIGNING_SECRET   # 必须和 license-server 那侧一致
bunx wrangler secret put E2B_API_KEY
bunx wrangler secret put DAYTONA_API_KEY        # agent session 要用

# 真正"推"的命令：
bun run deploy                                  # = wrangler deploy

# 部署完顺手看实时日志（可选）：
bunx wrangler tail
```

`bun run deploy` 实际就是 `wrangler deploy`，它读
`packages/qcut-relay/wrangler.toml` 里的 Worker 名（`qcut-relay`）、
Durable Object 绑定（`PTY` → class `PtySession`）和 sqlite-DO
migration。新账号首次部署时它还会顺便把 Durable Object 类创建出来。

重新部署不会强制踢掉已经接上的 PTY session —— CF Workers 是热重载，
DO 跨版本存活。但 swap 之后任何 DO 重新进 `fetch` 都会跑新代码，
所以如果改动**破坏了消息协议**，已经接着的标签页还是有可能中途断。

#### 同样套路推 license-server

```bash
cd packages/license-server
bun run test
bun run deploy                                  # = wrangler deploy
```

`/api/sandbox/spawn` 接口住在 license-server 这边。所以端到端改完
spawn 流程通常是：构镜像（没动就跳过）→ 改了 `qcut-relay` 就推 relay
→ 改了 `sandbox.ts` 或者它依赖的就推 license-server。

### b. 启动 sandbox

今天**没有一线的 `qcut sandbox spawn` CLI 命令**——这个接口本来就是
给浏览器调的。从终端起 sandbox 有三种办法：

**方案 1 —— 直接 HTTP 打线上 license-server（和浏览器干的事最接近）：**

```bash
# 先拿一个 session token。最简单的办法是去网站登录，然后从浏览器
# 把 better-auth 的 cookie 或者 bearer token 复制出来。CLI 也有：
qcut system login                               # 交互登录，存 token

# 然后调 spawn。license-server 地址是：
#   https://qcut-license-server.zdhpeter.workers.dev
curl -sS -X POST \
  https://qcut-license-server.zdhpeter.workers.dev/api/sandbox/spawn \
  -H "Authorization: Bearer ${QCUT_SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"resource_class":"standard"}'
# → { "session_id":"...", "ws_url":"wss://relay.qcut.app/pty?token=...",
#     "expires_at":"..." }
```

要把返回的 `ws_url` 真正接上，可以用 `websocat`：

```bash
websocat "$(echo "$SPAWN_JSON" | jq -r .ws_url)"
```

**方案 2 —— dogfood 脚本（走的是 Daytona、不是 E2B，但流程形状一致）：**

```bash
# 用已发布的 qcut-cli 镜像开真 Daytona 沙箱，跑一次真的
# qcut flow idea2video，把产物拷回来。
QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:v0 \
  bun run scripts/daytona-dogfood.ts

# 生产形状的 agent-worker 路径：真往 agent_jobs 插一行，起 worker，
# 等终态。
bun run scripts/daytona-worker-dogfood.ts
```

这两个脚本**都不走** `/api/sandbox/spawn`——它们直接撬 relay /
worker 在 Daytona 侧的代码。

**方案 3 —— 网站（不算 CLI，但完整性起见也列上）：**

登录后打开 `https://wzrdagentstudio.<环境>/sandbox`。页面在 JS 里
做的事就是方案 1 的等价物，然后把 xterm.js 终端挂到返回的 `ws_url`
上。今天**只有这条路**能跑通完整的 浏览器 → spawn → relay → PTY
链路。
