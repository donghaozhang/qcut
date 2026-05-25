# IMA Router GPT Image 2 Daytona 计划

日期：2026-05-19
分支：`Qcut-sandbox-v6`

## 目标

将 QCut 的 GPT Image 2 模型在 Daytona sandbox 中的图片路径，从旧版 GMI queue slug 迁移到 IMA Router 当前的 OpenAI 兼容图片任务 API，然后通过一个小规模的 sandbox E2E 运行和可下载证据来验证。

目标的用户可见行为：

- 不带 `--model` 的 `qcut generate-image` 仍然默认使用 `gpt_image_2_ima`。
- `qcut flow portraits --image-model gpt_image_2_ima` 使用同一个工作 GPT Image 2 路径。
- `qcut flow storyboard --image-model gpt_image_2_ima` 使用同一个工作 GPT Image 2 路径。
- 生成的图片结果 URL 立即下载到 `/tmp/qcut-output` 或选定的输出目录。

## 已读文档

- 人类文档 URL：<https://doc.imarouter.com/#en/tag/gpt-image/POST/v1/images/generations#gpt-image>
- AI 集成入口：<https://doc.imarouter.com/llms.txt>
- OpenAPI 源：<https://doc.imarouter.com/openapi/en.yaml>
- Model index：<https://doc.imarouter.com/model-index.json>
- Smoke payload：<https://doc.imarouter.com/test-cases.json>

文档要点：

- Base URL 是 `https://api.imarouter.com`。
- 认证用 `Authorization: Bearer YOUR_SECRET_TOKEN`；绝不要把 token 放在 query string 里。
- `#gpt-image` fragment 只是文档分组。真实创建路径是 `POST /v1/images/generations`。
- `gpt-image-2` 是异步的。提交返回 `id` 或 `task_id`；通过 `GET /v1/images/generations/{task_id}` 轮询。
- 终止成功状态包括 `succeeded` 和 `completed`；终止失败状态包括 `failed` 和 `error`。
- 结果 URL 是短时效的，大约 30 天，所以 QCut 应该立即下载并持久化。

## 实现前 QCut 状态

在这个 patch 之前，native flow 把 GPT Image 2 默认路径当作 GMI Cloud queue 模型处理：

| 区域 | 当前值 |
| --- | --- |
| Registry key | `gpt_image_2_gmi` |
| Provider backend | `gmi` |
| Text endpoint | `gpt-image-2-generate` |
| Reference endpoint | `gpt-image-2-edit` |
| Submit shape | `{ model: endpoint, payload }` through GMI queue |

相关文件：

- `electron/native-pipeline/registry-data/text-to-image.ts`
- `electron/native-pipeline/vimax/adapters/image-adapter.ts`
- `electron/native-pipeline/execution/step-executors.ts`
- `electron/native-pipeline/infra/api-caller.ts`
- `electron/native-pipeline/infra/api-provider-urls.ts`
- `packages/license-server/src/routes/ai-proxy.ts`
- `packages/qcut-relay/src/pty-session.ts`

这解释了最近的长延迟和 `504` 重试：被测路径是通过旧的 GMI queue/proxy 路由工作的，还不是文档化的 IMA Router `gpt-image` 路径。

## 目标 API 契约

Text-to-image 创建请求：

```json
{
  "model": "gpt-image-2",
  "prompt": "generate a glossy product hero image for a smartwatch",
  "size": "1024x1024",
  "quality": "high",
  "background": "transparent",
  "output_format": "png"
}
```

Image reference / edit 请求：

```json
{
  "model": "gpt-image-2",
  "prompt": "replace the background with a clean studio backdrop",
  "images": ["https://example.com/input.png"],
  "mask": "https://example.com/mask.png",
  "size": "1536x1024",
  "quality": "high",
  "input_fidelity": "high",
  "moderation": "low",
  "output_compression": 0,
  "output_format": "png"
}
```

OpenAPI 文档支持的透传字段：

- `size`
- `quality`
- `image` / `images`
- `mask`
- `background`
- `input_fidelity`
- `moderation`
- `n`
- `output_compression`
- `output_format`

## 实现计划

### 1. 添加 IMA Router 图片任务 poller

文件：`electron/native-pipeline/infra/api-caller.ts`

当前的 `pollImaRouterTask()` 是视频专用的，轮询 `v1/videos/{task_id}`。新增一个图片专用 poller：

```ts
pollImaRouterImageTask({ taskId, onProgress, signal })
```

它应该：

- 调用 `GET /v1/images/generations/{task_id}`
- 接受 `succeeded` 和 `completed` 为成功
- 接受 `failed` 和 `error` 为失败
- 从 `data.url`、`url`、或者现有的 `extractOutputUrl()` fallback 读取输出 URL
- 在 `data` 下暴露 `amount_usd`、`usage` 和原始 response
- 保持 30 分钟上限，除非在实测后选择更短的图片专属超时

### 2. 让 `callModelApi()` 知道如何提交 IMA Router 图片任务

文件：`electron/native-pipeline/infra/api-caller.ts`

现在 `provider === "imarouter"` 假定都是视频，永远轮询 `v1/videos/{task_id}`。增加一个基于 endpoint 的小型路由决定：

- 如果 endpoint 是 `v1/images/generations`，用新的 image poller
- 如果 endpoint 是 `v1/videos`，保留现有 video poller
- 保留 proxy-first 行为和本地 key fallback

避免 endpoint 名称的字符串散落在代码库里，提取常量：

```ts
const IMAROUTER_IMAGE_GENERATIONS_PATH = "v1/images/generations";
const IMAROUTER_VIDEO_GENERATIONS_PATH = "v1/videos";
```

### 3. 将 GPT Image 2 注册为 IMA Router 后端，同时保留对外 key

文件：`electron/native-pipeline/registry-data/text-to-image.ts`

保持用户可见的 QCut key 稳定：

```ts
key: "gpt_image_2_ima"
```

改动 transport 字段：

```ts
provider: "OpenAI (via IMA Router)"
endpoint: "v1/images/generations"
providerBackend: "imarouter"
defaults: {
  model: "gpt-image-2",
  size: "1024x1024",
  quality: "medium",
  output_format: "png",
  n: 1
}
```

实现后更新：主 key 已重命名为 `gpt_image_2_ima`，`gpt_image_2_gmi` 作为 legacy alias 仍然可用，使旧命令继续工作。

### 4. 更新 flow image adapter 路由

文件：`electron/native-pipeline/vimax/adapters/image-adapter.ts`

实现前的映射：

- `gpt_image_2_gmi` -> `gpt-image-2-generate`
- reference `gpt_image_2_gmi` -> `gpt-image-2-edit`

目标映射：

- `gpt_image_2_ima` -> `v1/images/generations`
- reference `gpt_image_2_ima` -> `v1/images/generations`
- provider 应改为 `imarouter`
- payload 顶层应包含 `model: "gpt-image-2"`
- reference 生成应使用 `images: [url]`，而不是 `image: [url]`
- 当未来调用方提供 mask 时，应支持传递 `mask`

adapter 已经会在 edit 调用前上传本地 reference。保留该行为，因为 IMA Router 的 `image` / `images` 需要公网 URL。

### 5. 更新 step executor 的 reference 处理

文件：`electron/native-pipeline/execution/step-executors.ts`

对 `gpt_image_2_ima` 带 reference 图片的情况：

- 不再切换到合成的 `gpt-image-2-edit` endpoint
- 保留 endpoint `v1/images/generations`
- 设置 `payload.images = refs.urls`
- 移除 legacy 的 `payload.image_urls` 和 `payload.reference_images`
- 设置 `payload.model = "gpt-image-2"`

对纯文本的情况：

- 设置 `payload.model = "gpt-image-2"`
- 把 aspect ratio 映射成 `size`，和 GMI GPT Image 2 现在的做法一样

### 6. License-server proxy 支持

文件：

- `packages/license-server/src/routes/ai-proxy.ts`
- 现有 GMI / IMA Router 附近的 proxy 测试

验证 proxy 接受：

```json
{
  "provider": "imarouter",
  "endpoint": "https://api.imarouter.com/v1/images/generations",
  "method": "POST",
  "body": {
    "model": "gpt-image-2",
    "prompt": "..."
  }
}
```

如果 proxy 目前仅特判 IMA Router 视频轮询，那里也要加上图片 create/status 处理。Credit estimate 仍按 QCut model key（`gpt_image_2_ima`）作为 key，保持计费稳定。

### 7. 更新文档和 skills

实现后需要检查的文件：

- `.claude/skills/native-cli/SKILL.md`
- `resources/default-skills/native-cli/SKILL.md`
- `packages/nexusai-website/js/agent-chat.js`
- `packages/nexusai-website/cli/partials/gen.html`
- `packages/nexusai-website/cli/partials/flow.html`

除非 QCut key 被重命名，不要改变对外的默认命令指引。重要措辞仍然是：

```text
Default image model: gpt_image_2_ima
Do not pass --model/-m unless the user explicitly asks for a specific image model.
```

## 测试

需要新增或更新的单元测试：

- `electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts`
  - 提交图片任务到 `/v1/images/generations`
  - 轮询 `/v1/images/generations/{task_id}`
  - 抽取 `data.url`
  - 处理 `succeeded`、`completed`、`failed` 和 `error`
- `electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts`
  - `gpt_image_2_ima` 有 `providerBackend: "imarouter"`
  - endpoint 为 `v1/images/generations`
  - defaults 包含 `model: "gpt-image-2"`
- `electron/native-pipeline/vimax/adapters/__tests__/image-adapter-gpt-image.test.ts`
  - text 生成调用 provider `imarouter`
  - endpoint 为 `v1/images/generations`
  - payload 使用 `model: "gpt-image-2"`
  - reference 生成使用 `images: [...]`
- `electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts`
  - reference 图片仍走 `/v1/images/generations`
  - 对 IMA Router 不再保留 `gpt-image-2-edit` endpoint

建议命令：

```bash
bun test \
  electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts \
  electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts \
  electron/native-pipeline/vimax/adapters/__tests__/image-adapter-gpt-image.test.ts \
  electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts

cd electron && bun x tsc --noEmit
```

## Daytona E2E 验证

最多生成 5 到 6 张图。

### A. 单张默认图片 smoke

```bash
qcut generate-image \
  --prompt "a matte black cube on a clean white background" \
  -o /tmp/qcut-output/imarouter-gpt-image-smoke \
  --json
```

预期：

- 没有传 `--model`
- 输出 sidecar 写 `model: gpt_image_2_ima`
- transport 证据说 provider 为 `imarouter`
- 生成文件是合法 PNG 或 JPEG

### B. Flow portraits smoke

```bash
qcut flow characters \
  --novel /tmp/qcut-input/novel.txt \
  --llm-model gemini-3.1-flash-lite \
  -o /tmp/qcut-output/imarouter-flow \
  --json

qcut flow portraits \
  --input /tmp/qcut-output/imarouter-flow/characters.json \
  --max-characters 3 \
  --views front \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/imarouter-flow/portraits \
  --json
```

预期：

- 最多 3 张 portrait 图
- `registry.json` 列出所有 portrait 路径
- 所有图片都是合法文件
- 生成 artifact 在 sandbox 文件浏览器中可见且可下载

### C. Flow storyboard smoke

```bash
qcut flow storyboard \
  --script /tmp/qcut-input/script.json \
  --portraits /tmp/qcut-output/imarouter-flow/portraits/portraits/registry.json \
  --style "cinematic editorial storyboard, consistent characters" \
  --image-model gpt_image_2_ima \
  -o /tmp/qcut-output/imarouter-flow/storyboard \
  --json
```

预期：

- 把 script 限制为 2 到 3 个 scene 做这个 smoke
- 总生成图片数保持在 6 张以下
- storyboard 图片是合法文件
- 下载的证据包含命令日志、result JSON、registry JSON 和文件

## 需要记录的证据

Daytona run 之后，在这份计划旁边添加一个结果文档：

```text
docs/task/daytona-supabase-agent/implementation/20-imarouter-gpt-image-e2e.md
```

包含：

- 生产或本地 build 标识
- 完整命令输入
- 生成输出目录
- IMA Router 返回的 task ID（密钥已脱敏）
- 下载文件列表
- 证明 PNG/JPEG 合法的 `file` 输出
- sandbox 文件浏览器显示输出目录的截图
- 失败和重试，尤其是 `429`、`5xx` 或 task status 为 `failed`

## 风险

- 旧脚本可能仍然使用 `gpt_image_2_gmi`；保留这个 key 作为 legacy alias，直到用户迁移到 `gpt_image_2_ima`。
- IMA Router 结果 URL 会过期。任何只保存远端 URL 而没下载的代码路径，后续会变得不稳定。
- Image reference 输入必须是公网 URL 或先上传。本地文件需要现有的上传步骤。
- 当前 proxy 可能偏向视频。Native 本地路径和 license-server proxy 路径都需要测试，让 Daytona 行为与生产一致。

## 完成标准

- 单元测试覆盖图片 submit、poll、success、failure 和 reference-image payload 形状。
- `qcut generate-image` 默认路径通过 IMA Router 产生真实图片。
- `qcut flow portraits --image-model gpt_image_2_ima` 通过 IMA Router 生成 3 张或更少 portrait 图片。
- `qcut flow storyboard --image-model gpt_image_2_ima` 通过 IMA Router 生成小规模 storyboard。
- Daytona 文件浏览器可以下载单张图片以及整个文件夹。
- 后续 E2E 结果 md 记录成功/失败证据。
