# 启动 qcut-cli 沙箱镜像

"预装 qcut CLI 的镜像"对不同 provider 意味着不同的产物。Docker、Daytona、
E2B 三家都吃同一个 `Dockerfile.cli`，但**各自实体化成不同的产物**。
本文档列三条路 + 每条路的当前进度。

## 当前状态（2026-05-14）

| 产物 | 位置 | 是否构建？ | 是否推送？ |
|------|------|-----------|-----------|
| `qcut-cli:dev`（本地 Docker 镜像） | 你机器的 Docker daemon | ❌ 从未构建 | n/a |
| `ghcr.io/quriosity-agent/qcut-cli:vX.Y.Z` | GitHub Container Registry | ❌ 从未推送（CI 工作流已就绪，见下） | ❌ |
| E2B 模板 `qcut-cli` | E2B 的构建集群 | ❌ 从未构建 | ❌ |

所以今天，下列任何操作都会失败：
- `bun run scripts/daytona-dogfood.ts` → "镜像找不到"
- `bun packages/agent-worker/src/main.ts`（带真任务） → "镜像找不到"
- `POST /api/sandbox/spawn`（license-server）→ `sandbox_create_failed` 502

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

## E2B 对 Dockerfile 的兼容性注意

E2B 模板构建器接受标准 Dockerfile，但有几个约束（对当前 `Dockerfile.cli`
已检查）：

- ✅ 多阶段构建 —— 行
- ✅ 非 root USER —— 行；entrypoint 脚本会 chown
- ✅ 任意 base 镜像 —— `oven/bun:1.3.10-debian` 没问题
- ⚠️ `ENTRYPOINT` 会被尊重，但用户终端期望是 bash；当前 Dockerfile
  `CMD ["bash"]` 正是这个意思
- ⚠️ E2B 可能不保留 `qcut-entrypoint` 作 entrypoint —— 它会注入自己的
  bootstrap。验证：拉起模板后查 `~/.qcut/.env` 是否物化了。如果没有，
  spawn 路由要在用户连之前先 `qcut-entrypoint /bin/true` 把 env file
  搭起来。

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
