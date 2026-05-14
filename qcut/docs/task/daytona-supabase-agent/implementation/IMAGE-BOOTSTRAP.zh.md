# 启动 qcut-cli 沙箱镜像

"预装 qcut CLI 的镜像"对不同 provider 意味着不同的产物。Docker、Daytona、
E2B 三家都吃同一个 `Dockerfile.cli`，但**各自实体化成不同的产物**。
本文档列三条路 + 每条路的当前进度。

## 当前状态（2026-05-14，第一轮构建之后）

| 产物 | 位置 | 是否构建？ | 是否推送？ |
|------|------|-----------|-----------|
| `qcut-cli:dev`（本地 Docker 镜像） | 本地 Docker daemon | ✅ 已构建、**对生产端到端验证过** | n/a |
| `ghcr.io/quriosity-agent/qcut-cli:vX.Y.Z` | GitHub Container Registry | ❌ 没推（CI 流程就绪） | ❌ |
| E2B 模板 `qcut-cli`（ID `mo0cc1eel03akhsen8e5`） | E2B 构建集群 | ⚠️ **建好了但有 bug** —— `Sandbox.create()` 能用，但 `qcut` 包装脚本的 shebang 被搞坏（`#!/usr/bin/env bashnexec ...`）。需要按现在 `e2b.Dockerfile` 重建。 | n/a（E2B 私有）|

当前能用：
- `bun run build:cli-image` 本地产 `qcut-cli:dev`；agent-worker 用它接生产 Supabase。**端到端测过**（qcutlove 用户、`qcut --version` 任务、exit 0）。

当前不能用 / 还要再来一次：
- `POST /api/sandbox/spawn` 会返 `sandbox_create_failed`（spawn-probe 跑 `qcut system doctor` → 撞 shebang bug → exit 127）。
- 解法：移走 workspace `node_modules` 后重跑 `e2b template create qcut-cli -d e2b.Dockerfile --cpu-count 2 --memory-mb 4096`（见下面 "绕路"）。现在 `e2b.Dockerfile` 已经把下文记的 5 个 bug 全部修了。

## 路径 A —— 本地 Docker（最快，仅开发）

前置：Mac 上装 Docker Desktop（daemon 必须在跑）。

```bash
# 1. 装 Docker Desktop
brew install --cask docker
open -a Docker
# 等鲸鱼图标停止动画

# 2. 构建镜像
cd /Users/peter/Desktop/code/qcut/qcut
bun run build:cli-image

# 3. 看标签
docker images qcut-cli
# qcut-cli  dev  <id>  3 分钟前  ~500MB
```

之后 `agent-worker` 的本地 `docker run` 路径就能端到端跑通你生产 DB
上的真任务。插一个 `qcut system doctor --json --skip-health` 任务，
worker 就能真正产生事件 + 真的成功状态行。

局限：只有你这台机器有这个镜像。license-server CF Worker / E2B /
Daytona Cloud 都看不到。

## 路径 B —— GitHub Container Registry（Daytona 生产用）

CI 工作流 `.github/workflows/cli-image.yml` 在打 `v*` git tag 或手动
触发时构建 + 推送。一旦触发：

```bash
# 选项 1：按 tag 发布
git tag v0.1.0
git push origin v0.1.0
# → ghcr.io/quriosity-agent/qcut-cli:v0.1.0 + :latest

# 选项 2：手动运行
gh workflow run cli-image --field tag=dev-2026-05-14
```

副作用：
- 镜像可从 `ghcr.io/quriosity-agent/qcut-cli:<tag>` 拉取
- 任何有该仓库包读权限的人都能拉
- 私有包：拉取的客户端需要带 `read:packages` 作用域的 GitHub PAT

Daytona 怎么用：`.devcontainer/devcontainer.json` 已经写死了
`ghcr.io/quriosity-agent/qcut-cli:v0`。首次发布成功后改这个 tag 字符串。

## 路径 C —— E2B 模板（`/api/sandbox/spawn` 路由必需）

E2B **不**从 GHCR 拉 Docker 镜像。它用 `e2b` CLI 从 Dockerfile 构建
自己的模板产物。这是独立于 Path A/B 的构建步骤；产物是一个**模板 ID**，
形如 `abcd1234efgh5678`。

```bash
# 1. 装 e2b CLI
npm install -g @e2b/cli

# 2. 登录（浏览器流程）
e2b auth login

# 3. 从 Dockerfile 构建模板
cd /Users/peter/Desktop/code/qcut/qcut
e2b template build --dockerfile Dockerfile.cli --name qcut-cli
# → 成功后打印一个模板 ID
```

模板 ID 作为 `QCUT_IMAGE_TAG` 配进 license-server：

```bash
cd packages/license-server
wrangler secret put QCUT_IMAGE_TAG
# 粘模板 ID
wrangler secret put E2B_API_KEY
# 粘你的 E2B API key
wrangler secret put RELAY_SIGNING_SECRET
# 用 openssl rand -hex 32 生成
wrangler secret put RELAY_HOST
# 比如 relay.qcut.app
wrangler deploy
```

之后线上 license-server 的 `POST /api/sandbox/spawn` 就能起真 E2B 沙箱、
跑 doctor 探针、签 HS256 中继 token、返
`{ session_id, ws_url, expires_at }`。

## E2B 对 Dockerfile 的兼容性注意（踩坑实录）

E2B 用**自家 Dockerfile 解析器**，不是 Docker 的。好几样在标准
Docker 里能用的东西在它这边失败或行为不同。2026-05-14 在 E2B CLI 1.6+
上验证：

- ❌ **不支持多阶段构建**。`FROM ... AS builder` 立即报错
  "Multi-stage Dockerfiles are not supported"。E2B 专用 `e2b.Dockerfile`
  保持单阶段；GHCR/Daytona/本地 Docker 继续用多阶段的 `Dockerfile.cli`。
- ❌ **多参数 `COPY a b c ./` 静默丢掉除第一个外的所有参数**。每个
  source 拆一行 COPY：
  ```
  COPY package.json ./
  COPY bun.lock ./
  COPY turbo.json ./
  ```
- ❌ **`printf '%s\n' '...' '...'` 把 `\n` 误写为字面的 `n`**。换成
  多个 `echo`：
  ```
  RUN echo '#!/usr/bin/env bash' > /usr/local/bin/qcut \
   && echo 'exec bun /opt/.../cli.ts "$@"' >> /usr/local/bin/qcut
  ```
- ❌ **`USER <name>` 会让 `Sandbox.commands.run` 跑出 "fork/exec
  /bin/sh: permission denied"**。E2B 的 command runner 用它内部的
  `user` 用户起进程；覆盖 USER 就挂。**别加 USER**；把文件放
  `/opt/...` 和 `/usr/local/bin/...`，任何用户都能读。
- ❌ **不尊重 `.dockerignore`**。带 bun 工作区 symlink 的 `node_modules`
  会被上传，然后 `COPY apps apps` 报 "failed to extract files"。绕路：
  跑 `e2b template create` 前把 workspace `node_modules` 挪走，跑完
  再挪回：
  ```
  mkdir -p /tmp/qcut-nm && i=0
  for d in apps/web/node_modules packages/*/node_modules; do
    if [ -d "$d" ]; then i=$((i+1)); mv "$d" /tmp/qcut-nm/nm-$i;
       echo "$d=/tmp/qcut-nm/nm-$i" >> /tmp/qcut-nm-map.txt; fi
  done
  # 这里跑 e2b template create
  while IFS='=' read -r o d; do mv "$d" "$o"; done < /tmp/qcut-nm-map.txt
  ```
- ⚠️ **重活在 4 GiB 内存下 OOM**。`apps/web` Vite 构建（`tsc + vite
  build`）被 SIGKILL。CLI 不需要 web bundle —— 跑
  `bun install --frozen-lockfile --ignore-scripts`、**跳过**
  `bun run build`。CLI 包装脚本直接 `bun electron/.../cli.ts` 跑 TS 源码。
- ⚠️ **UID 1000 和 1001 被 E2B base 占了**。别用 `useradd -u` 钉
  UID。（其实根本别加 user —— 见上面 USER 那一条。）
- ✅ `--cpu-count 2 --memory-mb 4096` 对纯 `bun install` 的构建够。
  ~90 秒搞定。

## 各路径的成本

| 路径 | 首次构建时间 | 持续成本 | 适用场景 |
|------|-------------|---------|---------|
| 本地 Docker | ~3 分钟一次 + daemon 内存 | $0（你的笔记本） | Worker 对接生产 DB 开发 |
| GHCR | ~3 分钟 CI 跑一次 | 公开仓库免费；私有付费 | Daytona Cloud 工作区、worker 的 Daytona swap-in |
| E2B 模板 | ~5 分钟一次 + 首次 spawn ~3 s | 按秒计费 | 浏览器沙箱路径（PR 12） |

## 建议

1. **今天 / 现在**：跑 Path A，让 worker 能对接你的生产 DB 端到端。
   Docker Desktop 起来后大约 5 分钟。
2. **本周内**：用 `gh workflow run` 跑一次 Path B，让 Daytona devcontainer +
   dogfood 脚本对所有人都能用。
3. **浏览器沙箱真上线前**：Path C。在这之前 `/api/sandbox/spawn` 会扣
   credits 后返 502 `sandbox_create_failed`。

参见：[`ACTUAL.zh.md`](ACTUAL.zh.md)、[`02-container-image.zh.md`](02-container-image.zh.md)。
