# 容器配置

如何在 Daytona 里构建和运行 QCut CLI agent 镜像。

## 运行时依赖

| 依赖             | 用途                                                                  |
|------------------|----------------------------------------------------------------------|
| Bun ≥ 1.3.10     | 与仓库 `packageManager` 一致；跑编译后的 CLI                         |
| Node 20+         | `bin` shebang 是 `node`；Bun 也能跑，Node 最稳                       |
| ffmpeg + ffprobe | `edit autoclip`、`analyze translate`、`gen video` 后处理需要         |
| CA 证书          | FAL / Gemini / OpenRouter 全部走 HTTPS                              |
| `~/.qcut/` 目录  | 权限 `0700`，由容器用户拥有；放 `.env`                              |

**不需要**：Electron、Chromium、X 服务器、GPU、`node-pty`、sharp 的 native 二进制（除非用 `gen image --grid`）。

## Dockerfile

```dockerfile
FROM oven/bun:1.3.10-debian AS builder

WORKDIR /qcut

# 跳过 postinstall（会装 Electron / 打 pty 补丁），ffmpeg 手动装。
ENV npm_config_ignore_scripts=true
COPY package.json bun.lock turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY electron/package.json electron/package.json
COPY packages packages
RUN bun install --frozen-lockfile

# 只构 CLI 目标（用 turbo filter）。
COPY . .
RUN bun run build:electron

# ── 运行时阶段 ─────────────────────────────────────────────────
FROM oven/bun:1.3.10-debian

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates curl tini && \
    rm -rf /var/lib/apt/lists/*

# 非 root 用户，方便 Daytona 卷挂载。
RUN useradd -m -u 1000 qcut && \
    mkdir -p /home/qcut/.qcut && \
    chown -R qcut:qcut /home/qcut && \
    chmod 700 /home/qcut/.qcut

WORKDIR /qcut
COPY --from=builder --chown=qcut:qcut /qcut/dist ./dist
COPY --from=builder --chown=qcut:qcut /qcut/node_modules ./node_modules
COPY --from=builder --chown=qcut:qcut /qcut/package.json ./

USER qcut
ENV PATH="/qcut/node_modules/.bin:${PATH}"

# 入口脚本：先从 Supabase 拉密钥，再 exec CLI / worker 循环。
COPY --chown=qcut:qcut infra/daytona/entrypoint.ts /qcut/entrypoint.ts

ENTRYPOINT ["/usr/bin/tini","--","bun","run","/qcut/entrypoint.ts"]
```

镜像大小目标：~400 MB（Bun + Debian slim + ffmpeg + node_modules）。如果 `node_modules` 太大，复制前先把 Electron / Playwright / Remotion 剪掉。

## Daytona devcontainer.json

用于交互式调试的 workspace：

```jsonc
{
  "name": "qcut-agent",
  "image": "ghcr.io/quriosity-agent/qcut-agent:latest",
  "containerEnv": {
    "SUPABASE_URL":  "${localEnv:SUPABASE_URL}",
    "SUPABASE_SERVICE_KEY": "${localEnv:SUPABASE_SERVICE_KEY}",
    "WORKSPACE_ID":  "${localEnv:WORKSPACE_ID}"
  },
  "mounts": [
    "source=qcut-output,target=/output,type=volume"
  ],
  "remoteUser": "qcut",
  "postCreateCommand": "qcut system check-keys --json"
}
```

## 构建命令

```bash
# 本地构建
docker build -t qcut-agent:dev -f infra/daytona/Dockerfile .

# 烟雾测试：列模型，全程不碰 editor
docker run --rm \
  -e SUPABASE_URL=$SUPABASE_URL \
  -e SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY \
  -e WORKSPACE_ID=$WORKSPACE_ID \
  qcut-agent:dev system models --json

# 跑一条端到端 YAML 流水线
docker run --rm \
  -e SUPABASE_URL=$SUPABASE_URL \
  -e SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY \
  -e WORKSPACE_ID=$WORKSPACE_ID \
  -v $(pwd)/output:/output \
  -v $(pwd)/pipelines:/pipelines:ro \
  qcut-agent:dev flow run \
    -c /pipelines/idea-to-clip.yaml \
    --input "A detective in 1920s Paris" \
    --skip-health --no-confirm \
    --stream --json \
    -o /output
```

## 资源 sizing

| 任务类型                            | CPU      | 内存   | 临时盘         | 墙钟时间    |
|-------------------------------------|----------|--------|----------------|-------------|
| `gen image`（单张）                  | 0.5 vCPU | 512 MB | 50 MB          | 10–30 秒    |
| `gen video`（5 秒，1080p）           | 1 vCPU   | 1 GB   | 200 MB         | 60–180 秒   |
| `analyze transcribe`（1 小时音频）   | 1 vCPU   | 1 GB   | 500 MB         | 120–300 秒  |
| `flow idea2video`（完整流水线）       | 2 vCPU   | 2 GB   | 2 GB           | 5–15 分钟   |
| `edit autoclip`（2 小时视频）         | 2 vCPU   | 2 GB   | 4 GB           | 10–30 分钟  |

吃 ffmpeg 的阶段（autoclip 切片、translate 音频包装）需要更多 CPU；AI 阶段主要在等远端 API。

## 已知坑

1. **`postinstall` 会跑 `setup-ffmpeg.ts` + `patch-node-pty.ts`**——`node-pty` 补丁在服务端容器没用。用 `npm_config_ignore_scripts=true` 跳过，靠 apt 装系统 `ffmpeg`。构建后 `which ffmpeg` 验证。
2. **`~/.qcut/.env` 必须是 `0600`**——CLI 的密钥加载器会检查；如果你的 entrypoint 写成 world-readable，`system check-keys` 会拒绝加载。
3. **CLI 默认带 editor 健康探测**——不加 `--skip-health`，每条命令都会先连 `127.0.0.1:<port>` 等 ~2 秒。永远加上（或者在 entrypoint 里设环境变量默认值）。
4. **`gen image --grid` 需要 `sharp`**——sharp 预编译需要 glibc；Alpine base 会炸。用 Debian，或者 `sharp` 安装时加 `--platform=linuxmusl`。
5. **Daytona 会快照 `/home`**——`.env` 放 `/home/qcut/.qcut/` 跨重启持久化，dev 友好但 prod 隔离不好。生产里按任务起容器，挂 `/run/qcut`（tmpfs），并把 `XDG_CONFIG_HOME` 指过去。

## Open questions

- 是否构 arm64 多架构镜像（Daytona 池更便宜）？Bun 有 arm64 镜像；ffmpeg arm64 没问题；只有 sharp 风险大。
- 镜像仓库：GHCR / Daytona 自家 registry / Fly.io machines registry？
