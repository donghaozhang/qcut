# IMA Router GPT Image 2 验证

日期：2026-05-19
分支：`Qcut-sandbox-v6`

## 总结

状态：本地实测通过；在发布并固定一个重建过的 CLI 镜像之后，真实的 Codex-in-Daytona E2E 也通过。

实现现在用 `gpt_image_2_ima` 作为 QCut 公开的默认图片 key，并把 `gpt_image_2_gmi` 保留为 legacy alias。两个 key 都通过 IMA Router 文档化的 GPT Image API 路由：

- provider：`imarouter`
- endpoint：`v1/images/generations`
- API model 字段：`gpt-image-2`
- poll endpoint：`GET /v1/images/generations/{task_id}`

注意：下面的实测证据是在 key 重命名前生成的，所以复制的 sidecar JSON 和文件名仍然显示 legacy alias `gpt_image_2_gmi`。endpoint 证据没有变化。

## 真实 Codex-In-Daytona 测试

最终成功的运行：

- license-server agent session：`0b236251-2e6c-4244-81d7-8d4e3de7fe21`
- Daytona sandbox id：`f8bf9ba1-424b-4011-9a69-90f3db151271`
- 部署镜像 tag：`ghcr.io/quriosity-agent/qcut-cli:imarouter-gpt-image-20260519061748`
- license-server 部署版本：`1fdd2cfb-3da7-41de-924a-026eec735b4c`
- 结果：`SUCCESS`
- 耗时：`242s`
- 输出数量：6 张 PNG portrait
- 输出尺寸：每张 PNG 都校验为 `1024x1536`

Codex 在 Daytona sandbox 中执行的成功命令：

```bash
qcut flow portraits \
  --input /tmp/qcut-input/characters-six-ima-codex.json \
  --max-characters 6 \
  --views front \
  --image-model gpt_image_2_ima \
  --concurrency 6 \
  -o /tmp/qcut-output/portraits-ima-codex-concurrency-6 \
  --json 2>&1 | tee /tmp/qcut-output/portraits-ima-codex-concurrency-6/live.log
```

Sandbox 证据文件：

```text
/tmp/qcut-output/codex-real-e2e-done.txt
/tmp/qcut-output/codex-real-e2e-portraits-ima-concurrency-6.md
/tmp/qcut-output/portraits-ima-codex-concurrency-6/png-validation.json
/tmp/qcut-output/portraits-ima-codex-concurrency-6/live.log
```

Preflight 结果：

- `qcut --version`：`1.0.0`
- `qcut system models --json` 包含 `gpt_image_2_ima`：是
- `qcut flow portraits --help --json` 包含 `--concurrency`：是

`live.log` 中的并发证据：所有 6 行 `Generating portraits for` 都出现在任何 `Generated portraits for` 之前：

```text
[portraits] Generating portraits for: Mara Venn
[portraits] Generating portraits for: Jalen Orr
[portraits] Generating portraits for: Sera Quill
[portraits] Generating portraits for: Niko Stray
[portraits] Generating portraits for: Dr. Ilya Morrow
[portraits] Generating portraits for: Tala Reeve
[portraits] Generated portraits for Niko Stray
[portraits] Generated portraits for Jalen Orr
[portraits] Generated portraits for Tala Reeve
[portraits] Generated portraits for Mara Venn
[portraits] Generated portraits for Dr. Ilya Morrow
[portraits] Generated portraits for Sera Quill
```

PNG 校验：

```json
{
  "status": "SUCCESS",
  "expected_png_count": 6,
  "actual_png_count": 6,
  "valid_png_count": 6,
  "errors": []
}
```

输出：

- `/tmp/qcut-output/portraits-ima-codex-concurrency-6/portraits/Dr._Ilya_Morrow/front.png` — 1024x1536
- `/tmp/qcut-output/portraits-ima-codex-concurrency-6/portraits/Jalen_Orr/front.png` — 1024x1536
- `/tmp/qcut-output/portraits-ima-codex-concurrency-6/portraits/Mara_Venn/front.png` — 1024x1536
- `/tmp/qcut-output/portraits-ima-codex-concurrency-6/portraits/Niko_Stray/front.png` — 1024x1536
- `/tmp/qcut-output/portraits-ima-codex-concurrency-6/portraits/Sera_Quill/front.png` — 1024x1536
- `/tmp/qcut-output/portraits-ima-codex-concurrency-6/portraits/Tala_Reeve/front.png` — 1024x1536

早期失败的 production-image preflight：

Session：

- license-server agent session：`7366021f-d7d6-49b5-b7b0-d820e2ae37f5`
- Daytona sandbox id：`7aec6269-5f86-4e89-9537-142e06e785d4`
- session 观察到的部署镜像：`ghcr.io/quriosity-agent/qcut-cli:latest`

方法：

- 把 E2E prompt 发到持久 Codex PTY session，匹配生产 chat-agent 路径。
- prompt 要求 sandbox 中的 Codex 先做 preflight 检查。
- prompt 明确告诉 Codex：如果缺少 `gpt_image_2_ima` 或 `--concurrency`，不要 fallback 到其他模型。

Sandbox 写入的状态文件：

```text
/tmp/qcut-output/codex-real-e2e-done.txt
```

状态文件内容：

```text
FAILED: preflight failed because qcut system models --json does not list gpt_image_2_ima and qcut flow portraits --help --json does not list --concurrency.
```

Sandbox 写入的证据文件：

```text
/tmp/qcut-output/codex-real-e2e-portraits-ima-concurrency-6.md
```

证据结论：

- `qcut --version`：`1.0.0`
- `gpt_image_2_ima`：未在 `qcut system models --json` 中列出
- `--concurrency`：未在 `qcut flow portraits --help --json` 中列出
- 6 张图片生成：按设计未执行，因为 preflight 失败
- PNG 输出：`0`

失败运行的结论：部署的 Daytona 镜像比这个分支旧。发布 `ghcr.io/quriosity-agent/qcut-cli:latest` 还不够，因为 Daytona 仍然解析的是旧缓存 tag；把 `QCUT_IMAGE_TAG` 固定到不可变的 `imarouter-gpt-image-20260519061748` 镜像 tag 修复了真实的 Codex-in-Daytona 路径。

## 单元和类型检查

通过：

```bash
bun test \
  electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts \
  electron/native-pipeline/infra/__tests__/api-provider-urls.test.ts \
  electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts \
  electron/native-pipeline/vimax/adapters/__tests__/image-adapter-gpt-image.test.ts \
  electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts
```

结果：43 个 pass。

```bash
cd packages/license-server && bun run test -- src/routes/ai-proxy.test.ts
```

结果：28 个 pass。

```bash
bun test \
  apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts \
  apps/web/src/lib/__tests__/credit-costs.test.ts
```

结果：55 个 pass。

```bash
cd electron && bun x tsc --noEmit
```

结果：通过。

```bash
bunx biome check --write \
  electron/native-pipeline/infra/api-caller.ts \
  electron/native-pipeline/infra/api-provider-urls.ts \
  electron/native-pipeline/registry-data/text-to-image.ts \
  electron/native-pipeline/vimax/adapters/image-adapter.ts \
  electron/native-pipeline/execution/step-executors.ts \
  electron/native-pipeline/infra/proxy-client.ts \
  packages/license-server/src/routes/ai-proxy.ts
```

结果：格式化 3 个文件后通过。

```bash
bunx biome check \
  apps/web/src/lib/text2image-models/other-models.ts \
  apps/web/src/lib/text2image-models/index.ts \
  apps/web/src/lib/text2image-models/__tests__/text2image-models.test.ts
```

结果：通过。

## 模型目录检查

被测的运行时路径是 native CLI/flow 路径，但 web text-to-image 目录也已更新，避免模型元数据继续把默认 GPT Image 2 路径描述为 GMI：

- `apps/web/src/lib/text2image-models/other-models.ts`
  - `gpt-image-2-ima` provider 现在是 `OpenAI (via IMA Router)`。
  - endpoint 现在是 `https://api.imarouter.com/v1/images/generations`。
- `apps/web/src/lib/text2image-models/index.ts`
  - routing badge 把 `imarouter.com` 识别为 `IMA Router`。
  - 在 GUI IMA Router 图片客户端存在之前，`gpt-image-2-ima` 仍然不出现在 GUI picker。

## 本地实测 Generate-Image

命令：

```bash
bun run pipeline generate-image \
  --text "a matte black cube on a clean white background" \
  --aspect-ratio 1:1 \
  --output-dir /tmp/qcut-output/imarouter-local-smoke \
  --json
```

结果：通过。

CLI 结果：

```json
{
  "status": "ok",
  "data": {
    "command": "generate-image",
    "endpoint": "v1/images/generations",
    "outputPath": "/tmp/qcut-output/imarouter-local-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779166807507.png",
    "cost": 0.042,
    "duration": 231.357
  }
}
```

Sidecar 证据：

```json
{
  "model": "gpt_image_2_gmi",
  "endpoint": "v1/images/generations",
  "output": {
    "path": "/tmp/qcut-output/imarouter-local-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779166807507.png",
    "video_url": "https://zhubite-imagent-bot.oss-us-east-1.aliyuncs.com/aiagent/aigc_temp/20260519/1efb7b6a47704b3ec7fa0283124eed60_1779166803081071626_1779166803080804388_0.png"
  }
}
```

文件检查：

```text
/tmp/qcut-output/imarouter-local-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779166807507.png: PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced
```

## 本地实测 Flow Portraits

命令：

```bash
bun run pipeline flow portraits \
  --input /tmp/qcut-input/imarouter-characters.json \
  --max-characters 2 \
  --views front \
  --image-model gpt_image_2_gmi \
  -o /tmp/qcut-output/imarouter-flow-smoke/portraits \
  --json
```

结果：通过。

CLI 结果：

```json
{
  "status": "ok",
  "data": {
    "command": "vimax:generate-portraits",
    "cost": 0.084,
    "duration": 217.99,
    "data": {
      "characters": 2,
      "portraits_generated": 2,
      "registry_path": "/tmp/qcut-output/imarouter-flow-smoke/portraits/portraits/registry.json"
    }
  }
}
```

文件检查：

```text
/tmp/qcut-output/imarouter-flow-smoke/portraits/portraits/Mira_Chen/front.png: PNG image data, 1024 x 1536, 8-bit/color RGB, non-interlaced
/tmp/qcut-output/imarouter-flow-smoke/portraits/portraits/Jon_Vale/front.png:  PNG image data, 1024 x 1536, 8-bit/color RGB, non-interlaced
```

Registry：

```json
{
  "project_id": "cli-project",
  "portraits": {
    "Mira Chen": {
      "character_name": "Mira Chen",
      "description": "",
      "front_view": "/tmp/qcut-output/imarouter-flow-smoke/portraits/portraits/Mira_Chen/front.png"
    },
    "Jon Vale": {
      "character_name": "Jon Vale",
      "description": "",
      "front_view": "/tmp/qcut-output/imarouter-flow-smoke/portraits/portraits/Jon_Vale/front.png"
    }
  }
}
```

## 本地实测 Flow Storyboard

命令：

```bash
bun run pipeline flow storyboard \
  --script /tmp/qcut-input/imarouter-script.json \
  --style "clean cinematic storyboard frame, consistent character design" \
  --image-model gpt_image_2_gmi \
  -o /tmp/qcut-output/imarouter-storyboard-smoke/storyboard \
  --json
```

结果：通过。

CLI 结果：

```json
{
  "status": "ok",
  "data": {
    "command": "vimax:generate-storyboard",
    "outputPath": "/tmp/qcut-output/imarouter-storyboard-smoke/storyboard",
    "cost": 0.042,
    "duration": 125.101,
    "data": {
      "title": "Neon Repair",
      "images": 1,
      "total_cost": 0.042
    }
  }
}
```

文件检查：

```text
/tmp/qcut-output/imarouter-storyboard-smoke/storyboard/Neon_Repair/scene_001_medium_Workshop_Light.png: PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
```

## E2E 证据包

Verifier 输出目录：

```text
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z
```

证据包复制了生成的图片、两张 portrait、一张 storyboard 图片、sidecar JSON、portrait registry、文件检查和一个机器可读的验证 summary。

验证 summary：

```json
{
  "status": "passed",
  "evidenceDir": "output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z",
  "checks": {
    "defaultModel": true,
    "endpoint": true,
    "generatedPath": "/tmp/qcut-output/imarouter-local-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779166807507.png",
    "portraitCount": 2,
    "storyboardCopied": true
  }
}
```

文件检查：

```text
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z/generate-image.png: PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z/portrait-jon.png:   PNG image data, 1024 x 1536, 8-bit/color RGB, non-interlaced
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z/portrait-mira.png:  PNG image data, 1024 x 1536, 8-bit/color RGB, non-interlaced
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z/storyboard.png:     PNG image data, 1536 x 1024, 8-bit/color RGB, non-interlaced
```

## 容器 E2E

这一轮还从当前分支构建了 CLI 容器镜像，并用 sandbox 中预期的挂载输出目录行为跑了 clean-container smoke。

构建命令：

```bash
docker buildx build \
  --file Dockerfile.cli \
  --platform linux/amd64 \
  --tag qcut-cli:imarouter-e2e \
  --build-arg QCUT_VERSION=imarouter-e2e \
  --load .
```

结果：通过。

运行命令：

```bash
docker run --rm \
  --env-file ~/.qcut/.env \
  -v /tmp/qcut-docker-e2e:/tmp/qcut-output \
  qcut-cli:imarouter-e2e \
  bash -lc 'qcut generate-image --text "a matte black cube on a clean white background" --aspect-ratio 1:1 --output-dir /tmp/qcut-output/imarouter-docker-smoke --json'
```

结果：生成通过。容器镜像不包含 `file` 工具，所以图片类型检查是从宿主对挂载的输出文件夹运行的。

CLI 结果：

```json
{
  "status": "ok",
  "data": {
    "command": "generate-image",
    "endpoint": "v1/images/generations",
    "outputPath": "/tmp/qcut-output/imarouter-docker-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779168151741.png",
    "cost": 0.042,
    "duration": 101.83
  }
}
```

Sidecar 证据：

```json
{
  "model": "gpt_image_2_gmi",
  "endpoint": "v1/images/generations",
  "output": {
    "path": "/tmp/qcut-output/imarouter-docker-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779168151741.png",
    "video_url": "https://zhubite-imagent-bot.oss-us-east-1.aliyuncs.com/aiagent/aigc_temp/20260519/3ac2d1114a4982e614e6a73c1a4e9e8b_1779168147657614614_1779168147657367351_0.png"
  }
}
```

文件检查：

```text
/tmp/qcut-docker-e2e/imarouter-docker-smoke/gpt_image_2_gmi_a-matte-black-cube-on-a-clean-white-background_1779168151741.png: PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced
```

可下载证据已复制到：

```text
output/imarouter-gpt-image-e2e-2026-05-19T05-13-44Z/docker-smoke
```

## Daytona 状态

这一轮没有从本机跑真实 Daytona 云端。

观察到的阻塞和限制：

```text
daytona CLI: missing from PATH
~/.qcut/.env: available for local/container runs
branch-built cloud image: not deployed from this pass
```

而且，有意义的 Daytona 验证需要一个从这个分支构建的 CLI 镜像。在 build/push/deploy 之前测试当前生产 sandbox 镜像，只能验证旧镜像，而不是这次实现。

## 后续 Daytona 命令

从这个分支构建并部署 CLI 镜像之后，在 sandbox 中运行：

```bash
set -eu
rm -rf /tmp/qcut-output/imarouter-e2e
mkdir -p /tmp/qcut-output/imarouter-e2e
qcut generate-image \
  --text "a matte black cube on a clean white background" \
  --aspect-ratio 1:1 \
  --output-dir /tmp/qcut-output/imarouter-e2e \
  --json | tee /tmp/qcut-output/imarouter-e2e/result.json
find /tmp/qcut-output/imarouter-e2e -maxdepth 1 -type f -print | sort > /tmp/qcut-output/imarouter-e2e/files.txt
file /tmp/qcut-output/imarouter-e2e/* > /tmp/qcut-output/imarouter-e2e/file-check.txt
```

预期：

- sidecar JSON 在新默认运行中包含 `"model": "gpt_image_2_ima"`，或在 legacy alias 运行中包含 `"model": "gpt_image_2_gmi"`。
- sidecar JSON 包含 `"endpoint": "v1/images/generations"`
- 生成图片是合法 PNG 或 JPEG
- 文件夹下载包含 result JSON、sidecar JSON、文件检查和生成图片
