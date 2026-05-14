# PR 02 —— 容器镜像、entrypoint、smoke 脚本

> **Phase**：1 · **依赖**：PR 01（probe 用 `system doctor`） · **工作量**：~120 行

## 目标

一个可复现的 Docker 镜像 `qcut-cli:vX`，无头跑 QCut CLI。镜像里烧进 qcut + FFmpeg + bun；密钥/项目数据在运行时注入。镜像的 `ENTRYPOINT` 从 env vars 物化 `~/.qcut/.env`、再 `exec` 命令（默认 `bash` 交互）。

## 依赖

PR 01 必须在 main——smoke 脚本调 `qcut system doctor --json`。

## 涉及文件

| 路径 | 动作 | 用途 |
|------|------|------|
| `Dockerfile.cli` | 新 | 仓库根的两阶段构建 |
| `electron/native-pipeline/container/entrypoint.sh` | 新 | 从 env 物化 `~/.qcut/.env`，再 exec CMD |
| `electron/native-pipeline/container/smoke.sh` | 新 | 镜像内 smoke（verification 文档 Layer 1） |
| `.dockerignore` | 新/改 | 排除 node_modules、dist、screenshots 等 |
| `scripts/build-cli-image.ts` | 新 | `docker buildx build` 的薄封装 |

## 实现

### Step 1 —— Dockerfile

`Dockerfile.cli`（仓库根）：

```dockerfile
# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM oven/bun:1.3.10-debian AS builder
WORKDIR /build

COPY package.json bun.lock turbo.json ./
COPY apps apps
COPY packages packages
COPY electron electron
COPY scripts scripts
COPY tsconfig.json ./

RUN bun install --frozen-lockfile
RUN bun run build

# ---------- runtime ----------
FROM oven/bun:1.3.10-debian
ARG QCUT_VERSION=dev
ENV QCUT_VERSION=${QCUT_VERSION}

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash -u 1000 qcut
USER qcut
WORKDIR /home/qcut

COPY --from=builder --chown=qcut:qcut /build/dist /home/qcut/qcut/dist
COPY --from=builder --chown=qcut:qcut /build/node_modules /home/qcut/qcut/node_modules
COPY --from=builder --chown=qcut:qcut /build/package.json /home/qcut/qcut/package.json
COPY --from=builder --chown=qcut:qcut /build/electron /home/qcut/qcut/electron

COPY --chown=qcut:qcut --chmod=0755 \
     electron/native-pipeline/container/entrypoint.sh /usr/local/bin/qcut-entrypoint
COPY --chown=qcut:qcut --chmod=0755 \
     electron/native-pipeline/container/smoke.sh /usr/local/bin/qcut-smoke

RUN ln -s /home/qcut/qcut/dist/electron/native-pipeline/cli/cli.js /home/qcut/.local/bin/qcut || true
ENV PATH="/home/qcut/.local/bin:${PATH}"

ENTRYPOINT ["/usr/local/bin/qcut-entrypoint"]
CMD ["bash"]
```

要点：
- 两阶段把最终镜像压到 ~500 MB。
- 最终用户非 root（`qcut`, uid 1000），`~/.qcut/.env` 0600 直接顺。
- `QCUT_VERSION` 构建期烧进去，被 `system doctor` 读。

### Step 2 —— Entrypoint

`electron/native-pipeline/container/entrypoint.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

ENV_DIR="${HOME}/.qcut"
ENV_FILE="${ENV_DIR}/.env"

mkdir -p "${ENV_DIR}"
chmod 0700 "${ENV_DIR}"

ALLOWED_KEYS=(
  VITE_FAL_API_KEY GEMINI_API_KEY OPENROUTER_API_KEY ANTHROPIC_API_KEY
  ELEVENLABS_API_KEY FREESOUND_API_KEY OPENAI_API_KEY GMI_API_KEY
)

: > "${ENV_FILE}"
for key in "${ALLOWED_KEYS[@]}"; do
  value="${!key:-}"
  if [[ -n "${value}" ]]; then
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
done
chmod 0600 "${ENV_FILE}"

exec "$@"
```

允许列表（不是黑名单）——以后加 key 一改这一处。

### Step 3 —— Smoke 脚本

`electron/native-pipeline/container/smoke.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

bun --version
ffmpeg -version | head -n 1
which qcut

output="$(qcut system doctor --json --skip-health || true)"
echo "${output}" | jq -e '.checks | length > 0' >/dev/null
echo "${output}" | jq -e '.bun_version' >/dev/null
echo "✓ doctor envelope shape ok"
```

构建期不会有 key，所以**故意接受** `env_file_keys` 这一行 fail——只校信封形状。真 key 检查在 spawn-probe（PR 07）时跑。

### Step 4 —— `.dockerignore`

```
node_modules
.next
dist
out
.git
*.log
.env
.env.*
**/screenshots
**/test-results
**/playwright-report
docs
```

已有的话**合并**，别覆盖。

### Step 5 —— 构建脚本

`scripts/build-cli-image.ts`：

```ts
#!/usr/bin/env bun
import { $ } from "bun";

const version = process.env.QCUT_VERSION ?? "dev";
const tag = `qcut-cli:${version}`;

await $`docker buildx build \
  --file Dockerfile.cli \
  --platform linux/amd64 \
  --tag ${tag} \
  --build-arg QCUT_VERSION=${version} \
  --load .`;

await $`docker run --rm ${tag} qcut-smoke`;
console.log(`✓ ${tag} built + smoked`);
```

挂到 `package.json`：

```json
"scripts": { "build:cli-image": "bun run scripts/build-cli-image.ts" }
```

## 测试

`scripts/build-cli-image.test.ts`（轻量校验脚本本身）：

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("build-cli-image", () => {
  it("references Dockerfile.cli and a version-tag", () => {
    const src = readFileSync("scripts/build-cli-image.ts", "utf8");
    expect(src).toMatch(/Dockerfile\.cli/);
    expect(src).toMatch(/qcut-cli:/);
  });
});
```

## 验证（手工）

```bash
bun run build:cli-image

docker run --rm -it -e GEMINI_API_KEY=demo qcut-cli:dev
# 进容器后：
$ ls -la ~/.qcut/.env       # -rw------- ...
$ cat ~/.qcut/.env          # GEMINI_API_KEY=demo
$ qcut system doctor --json --skip-health | jq .status   # "ok"
```

## 不在本 PR 范围

- 推 registry。本地验证完之后 CI 单独搞。
- Daytona 特有配置（`devcontainer.json`）——PR 05。
- mitmproxy 旁车、暖池、snapshot cache——全 Phase 3。
- 多 arch（`linux/arm64`）。Phase 1 用 amd64 够；等 Apple Silicon dev host 进 Daytona 再说。

## 相关文档

- [`../core-plan/container-setup.md`](../core-plan/container-setup.md) —— 完整背景（资源 sizing、5 个 gotcha）
- [`../core-plan/secrets-supabase.md`](../core-plan/secrets-supabase.md) —— entrypoint 实现的密钥契约
- [`01-system-doctor.md`](01-system-doctor.md) —— smoke 调的命令
