# 启动 qcut-cli 沙箱镜像

"预装 qcut CLI 的镜像"对不同 provider 意味着不同的产物。Docker、Daytona、
E2B 三家都吃同一个 `Dockerfile.cli`，但**各自实体化成不同的产物**。
本文档列三条路 + 每条路的当前进度。

## 当前状态（2026-05-15，GHCR + Daytona dogfood 之后）

| 产物                                               | 位置                      | 是否构建？                                                                                                                                                  | 是否推送？                  |
| -------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `qcut-cli:agents-smoke`（本地 Docker 镜像）        | 本地 Docker daemon        | ✅ 按 `linux/amd64` 构建；`qcut-smoke` 验过 qcut、Codex CLI `0.130.0`、Claude Code `2.1.142`                                                                 | n/a                         |
| `qcut-cli:codex-auth-smoke`（本地 Docker 镜像）   | 本地 Docker daemon        | ✅ 按 `linux/amd64` 构建；验证 qcut smoke、`CODEX_AUTH_JSON` 运行时 Codex 登录启动、prompt env 解码                                                           | n/a                         |
| `qcut-cli:youtube-fix`（本地 Docker 镜像）        | 本地 Docker daemon        | ✅ 按 `linux/amd64` 构建；`qcut-smoke` 验过 `yt-dlp` `2026.03.17`、Deno `2.7.4`、Codex、Claude 和 native-cli；真实 YouTube `.mp4` 能写到 `/tmp/qcut-output` | n/a                         |
| `qcut-cli:dev`（本地 Docker 镜像）                 | 本地 Docker daemon        | ✅ 已构建、**对生产端到端验证过**                                                                                                                           | n/a                         |
| `ghcr.io/quriosity-agent/qcut-cli:v0`              | GitHub Container Registry | ✅ workflow run `25902797671` 已重新发布；推后 `qcut-smoke` 验过 qcut、Codex CLI `0.130.0`、Claude Code `2.1.142`、`native-cli` skill、最新 entrypoint            | ✅ public，匿名 pull 已验证 |
| `ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516` | GitHub Container Registry | ✅ workflow run `25949183927` 已发布；digest `sha256:48aa813162bf7a4b20d38ec694ccc0e1ffc9b61dcdc8c9e1447749d77b500923`；推后 smoke、本地 pull smoke、website YouTube E2E 都通过 | ✅ public，匿名 pull 已验证 |
| E2B 模板 `qcut-cli`（ID `<your-e2b-template-id>`） | E2B 构建集群              | ⚠️ **建好了但有 bug** —— `Sandbox.create()` 能用，但 `qcut` 包装脚本的 shebang 被搞坏（`#!/usr/bin/env bashnexec ...`）。需要按现在 `e2b.Dockerfile` 重建。 | n/a（E2B 私有）             |

当前能用：

- `bun run build:cli-image` 本地产 `qcut-cli:dev`；agent-worker 用它接生产 Supabase。**端到端测过**（qcutlove 用户、`qcut --version` 任务、exit 0）。
- `packages/agent-worker` 现在有 typed Daytona runner，使用
  `@daytona/sdk@0.175.0`。它会创建 ephemeral image sandbox，
  通过 `/usr/local/bin/qcut-entrypoint` 跑 qcut 命令，把
  `/tmp/qcut-output` 打包后下载到本地用于 Supabase artifact upload，
  最后删除 sandbox。
- `claim_one_agent_job` 返回的 Supabase snake_case row 会先 normalize
  成 Drizzle 的 `AgentJob` camelCase 形态，再给 worker 使用；这修掉了
  dogfood 里发现的 `agent/undefined/...` artifact path 问题。
- `packages/agent-worker/src/run-on-daytona.test.ts` 在不需要真实
  Daytona 凭证的情况下验证 command 构造、secret env 投影、拒绝危险
  command、artifact fallback、sandbox cleanup。
- `.github/workflows/cli-image.yml` 会构建 `Dockerfile.cli`，跑
  `qcut-smoke`，然后推 `ghcr.io/<owner>/qcut-cli:<tag>` 和
  `:latest`。默认分支 workflow 已修成 lowercase GHCR owner
  （`master` 上 `f80dc47dd`，`phase3-followups` 上 cherry-pick 为
  `ed99a4ac9`）。
- `Dockerfile.cli` 现在会安装固定版本 agent CLI：Codex CLI
  `0.130.0` 和 Claude Code `2.1.142`。本地 `linux/amd64`
  `qcut-cli:agents-smoke` 镜像已经证明这两个 binary 能在 Daytona
  使用的同架构里启动。
- `Dockerfile.cli` 现在也会安装固定版本 YouTube 工具：`yt-dlp`
  `2026.03.17`、Deno `2.7.4`，并写入 `/etc/yt-dlp.conf` 的
  `--remote-components ejs:github`。这样 Codex 在 Daytona 里可以直接用
  `yt-dlp`，不会把 Python 工具临时装进 `/tmp/qcut-output`。
- `electron/native-pipeline/container/entrypoint.sh` 现在会在运行时启动
  Codex 登录。`CODEX_AUTH_JSON` 会先用 `jq` 校验，再写到权限 `0600`
  的 `~/.codex/auth.json`，不会进入 `~/.qcut/.env`。如果 Codex 任务
  没有 auth JSON，会设置 `QCUT_BOOTSTRAP_CODEX=1`，entrypoint 才会
  尝试用 `OPENAI_API_KEY` 生成 Codex auth。
- website 的 Chat Agent 页现在可提交 qcut 图片任务，也可提交 Codex chat
  任务。Codex prompt 不拼进 shell command：它走 `args.codexPrompt` →
  `QCUT_CODEX_PROMPT_B64` → stdin → `codex exec --skip-git-repo-check --json -`。
- 本机 `~/.qcut/.env` 现在已有 Daytona/Supabase dogfood 所需环境变量名。
  `scripts/daytona-worker-dogfood.ts` 会先自动读取这个文件，再检查必需环境变量。
- Supabase 项目 `kbrtxitvavpuimuihppz` 已通过
  `supabase secrets set` 设置 `DAYTONA_API_KEY` 项目 secret。
- Supabase Storage 已创建私有 `artifacts` bucket，用于
  `agent_artifacts` 上传。

已验证的 provider 实跑：

- GHCR workflow run `25902797671` 重新发布了：
  - `ghcr.io/quriosity-agent/qcut-cli:v0`
  - `ghcr.io/quriosity-agent/qcut-cli:latest`
  - digest
    `sha256:2b9b8c7aa80bc2e5db874f04ccca302bbce0693a7d90274fe2b8645049fdbb7b`
- GHCR package 已改成 public。匿名 Docker pull
  `ghcr.io/quriosity-agent/qcut-cli:v0` 成功，workflow 对推上去的镜像
  跑 `qcut-smoke` 也通过，其中包括
  `.claude/skills/native-cli/SKILL.md` 检查。
- Daytona dogfood 已对着推上去的 GHCR 镜像跑通：
  - job `dogfood-cc1078a0-2966-4afc-8444-08d514b76dca`
  - runner `adb353a8-269f-4f80-9987-4a71f98f599a`
  - status `succeeded`，exit code `0`
  - artifact row `234936d9-3e87-4ca9-ba68-cff42299726b`，kind `log`，
    storage path
    `agent/79bf60b02770d2cc510da53e471590f4/dogfood-cc1078a0-2966-4afc-8444-08d514b76dca/qcut-output.tar`，
    bytes `10240`
- 本地固定版本 agent CLI smoke 已通过：
  - image `qcut-cli:agents-smoke`
  - platform `linux/amd64`
  - `codex --version` → `codex-cli 0.130.0`
  - `claude --version` → `2.1.142 (Claude Code)`
- 本地 Codex auth bootstrap smoke 已通过：
  - image `qcut-cli:codex-auth-smoke`
  - fake `CODEX_AUTH_JSON` 能写入 `~/.codex/auth.json`
  - auth 文件权限验证为 `0600`
  - `QCUT_CODEX_PROMPT_B64` 能在镜像内解码，不经过 shell 插值
- 本地 YouTube 镜像 smoke 已通过：
  - image `qcut-cli:youtube-fix`
  - platform `linux/amd64`
  - `qcut-smoke` 验过 `yt-dlp`、Deno、Codex、Claude 和 native-cli
  - `yt-dlp` 已把 `https://www.youtube.com/watch?v=jNQXAC9IVRw`
    下载成 `/tmp/qcut-output/youtube-test.mp4`（312 KB）
  - 之前的 `BaW_jenozKc` probe 现在应视为无效，因为 YouTube 对这个 ID
    本身就返回 `Video unavailable`，跟 QCut 无关
- GHCR YouTube 镜像发布已通过：
  - workflow run `25949183927`
  - image `ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`
  - digest `sha256:48aa813162bf7a4b20d38ec694ccc0e1ffc9b61dcdc8c9e1447749d77b500923`
  - CI 里的 pushed-image smoke 通过，本地 pull + `qcut-smoke` 也通过
- Website Chat Agent YouTube E2E 已通过：
  - job `3b19b2cd-cb17-4576-add0-89ba9aca2e4e`
  - runner `aca4aa3b-941b-41cd-9ca9-fb28235c16ac`
  - status `succeeded`，exit code `0`
  - artifacts 包含可下载的 `youtube-e2e.mp4`（464.8 KB）、
    `youtube-e2e-summary.json`、`qcut-output.tar`、`codex-last-message.md`
    和 `codex-events.jsonl`
  - Playwright 点击 MP4 Download 按钮后保存了
    `.playwright-cli/youtube-e2e.mp4`

当前还需要外部 provider 工作：

- GHCR / Daytona：合并后决定是把已验证镜像重发成 `v0` / `latest`，还是
  继续使用上面的 digest pin。
- E2B：如果要刷新浏览器沙箱模板，移走 workspace `node_modules`
  后重跑 `e2b template create qcut-cli -d e2b.Dockerfile
--cpu-count 2 --memory-mb 4096`（见下面 "绕路"）。现在
  `e2b.Dockerfile` 已包含 parser / USER / shebang 修复。

## 下一个子任务

GHCR/Daytona 镜像路径已经证明能跑，GHCR `v0` 现在也已经带 Codex auth
bootstrap；YouTube-capable 镜像也已经通过 live Chat Agent 页面验证。

1. 合并 `qcut-cli-v2`，然后决定把这个 digest 发布成 `v0` / `latest`，
   还是继续使用 digest pin。
2. 实现 sandbox spawn 失败时退 credit。
3. 设计并迁移 `agent_secrets.value` 加密。
4. 把 wzrdagentstudio `/sandbox` 的 localStorage token 占位换成真的
   QCut 登录流。

## 路径 A —— 本地 Docker（最快，仅开发）

前置：Mac 上装 Docker Desktop（daemon 必须在跑）。

```bash
# 1. 装 Docker Desktop
brew install --cask docker
open -a Docker
# 等鲸鱼图标停止动画

# 2. 构建镜像
cd /path/to/qcut/repo
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
`ghcr.io/quriosity-agent/qcut-cli:v0`。只有 CLI 镜像本身变化时才需要换 tag。

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
cd /path/to/qcut/repo
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

| 路径        | 首次构建时间                  | 持续成本               | 适用场景                                        |
| ----------- | ----------------------------- | ---------------------- | ----------------------------------------------- |
| 本地 Docker | ~3 分钟一次 + daemon 内存     | $0（你的笔记本）       | Worker 对接生产 DB 开发                         |
| GHCR        | ~3 分钟 CI 跑一次             | 公开仓库免费；私有付费 | Daytona Cloud 工作区、worker 的 Daytona swap-in |
| E2B 模板    | ~5 分钟一次 + 首次 spawn ~3 s | 按秒计费               | 浏览器沙箱路径（PR 12）                         |

## 建议

1. **现在**：merge/deploy dogfood 验证过的 worker 修复
   （`claim_one_agent_job` normalize + Daytona output dir）。
2. **CLI 镜像需要刷新时**：只有 `Dockerfile.cli` 或 CLI runtime 代码变了
   才重跑 Path B。
3. **浏览器沙箱镜像需要刷新时**：只有 E2B template 需要吃到
   Dockerfile 或 CLI 变更时才重建 Path C。

参见：[`ACTUAL.zh.md`](ACTUAL.zh.md)、[`02-container-image.zh.md`](02-container-image.zh.md)。
