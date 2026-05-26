# Changes And Test Results / 修改内容与测试结果

## Summary / 摘要

English:

This run verified the real Web / Daytona chat-agent path for `qcut gen image` ratio and custom-size generation. The final live test passed with real IMA Router GPT Image 2 calls, five downloaded local images, programmatic dimension validation, and a second natural-language command in the same Codex PTY session.

中文：

本次验证走的是完整真实链路：Web / Daytona chat agent -> Codex PTY -> `qcut gen image` -> IMA Router GPT Image 2。最终 Live 测试通过，并下载了 5 张真实生成图片到本地，用程序读取尺寸验证，同时在同一个 Codex PTY 会话里提交了第二条自然语言输入。

## Code Changes / 代码修改

English:

- Changed GPT Image 2 IMA Router ratio handling in `electron/native-pipeline/execution/step-executors.ts`.
- Replaced unsupported native ratio strings such as `size: "16:9"` with concrete pixel sizes:
  - `16:9` -> `2048x1152`
  - `9:16` -> `1152x2048`
  - `3:4` -> `1536x2048`
  - `4:3` -> `2048x1536`
  - `1:1` -> `1024x1024`
- Kept explicit `--width` / `--height` ahead of ratio mapping, so `--width 2000 --height 1152` still sends `size: "2000x1152"`.
- Updated `electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts` for the pixel-size mapping.
- Added and hardened `scripts/agent-chat-image-ratio-size-e2e.ts`.
- Updated `packages/license-server/wrangler.toml` to boot the tested CLI image:
  - `QCUT_AGENT_ALLOW_DEFAULT_USER = "true"`
  - `QCUT_IMAGE_TAG = "ghcr.io/quriosity-agent/qcut-cli:gen-image-ratio-size-20260526034624"`
- Updated `e2e-testing.md` with the real run result and corrected preflight command.

中文：

- 修改了 `electron/native-pipeline/execution/step-executors.ts` 中 GPT Image 2 走 IMA Router 时的比例处理。
- 不再向 IMA Router 发送类似 `size: "16:9"` 的比例字符串，而是转换成明确像素尺寸：
  - `16:9` -> `2048x1152`
  - `9:16` -> `1152x2048`
  - `3:4` -> `1536x2048`
  - `4:3` -> `2048x1536`
  - `1:1` -> `1024x1024`
- 保留 `--width` / `--height` 的最高优先级，所以 `--width 2000 --height 1152` 仍然发送 `size: "2000x1152"`。
- 更新了 `electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts` 中对应的单元测试。
- 新增并加固了 `scripts/agent-chat-image-ratio-size-e2e.ts`。
- 更新了 `packages/license-server/wrangler.toml`，使 Daytona sandbox 使用最终验证过的 CLI image：
  - `QCUT_AGENT_ALLOW_DEFAULT_USER = "true"`
  - `QCUT_IMAGE_TAG = "ghcr.io/quriosity-agent/qcut-cli:gen-image-ratio-size-20260526034624"`
- 更新 `e2e-testing.md`，记录真实测试结果，并修正 preflight 命令。

## Root Cause / 根因

English:

The first real provider attempt reached IMA Router but failed with `IMA Router submit error 403` when `size` was sent as a ratio string, for example `size: "16:9"`. A diagnostic run in the same Web / Daytona / Codex / CLI path proved the API key and model access were valid by successfully generating a `1024x1024` image. Therefore the failure was payload-specific, not authentication-specific.

中文：

第一次真实 provider 调用已经到达 IMA Router，但当 `size` 被设置为比例字符串（例如 `size: "16:9"`）时返回 `IMA Router submit error 403`。随后在同一条 Web / Daytona / Codex / CLI 路径中跑了诊断测试，成功生成 `1024x1024` 图片，证明 API key 和模型权限是可用的。因此问题是 payload 形态，而不是认证问题。

## Final Live Test / 最终 Live 测试

English:

- Test script: `scripts/agent-chat-image-ratio-size-e2e.ts`
- Chat page: `https://quriosity.com.au/chat-agent.html`
- License server: `https://qcut-license-server.zdhpeter.workers.dev`
- License server deployment: `8aab4d06-35de-4330-997a-b743244e9e15`
- CLI image: `ghcr.io/quriosity-agent/qcut-cli:gen-image-ratio-size-20260526034624`
- GitHub Actions image build: `26431056624`
- Daytona session: `88906ab5-35ad-46e7-b97a-bf3ab4196ad4`
- Remote root: `/tmp/qcut-output/gen-image-ratio-size-e2e-1779769061133`
- Local proof directory: `output/playwright/agent-chat-image-ratio-size-e2e-2026-05-26T04-24-50-222Z`

中文：

- 测试脚本：`scripts/agent-chat-image-ratio-size-e2e.ts`
- Chat 页面：`https://quriosity.com.au/chat-agent.html`
- License server：`https://qcut-license-server.zdhpeter.workers.dev`
- License server 部署版本：`8aab4d06-35de-4330-997a-b743244e9e15`
- CLI image：`ghcr.io/quriosity-agent/qcut-cli:gen-image-ratio-size-20260526034624`
- GitHub Actions image build：`26431056624`
- Daytona session：`88906ab5-35ad-46e7-b97a-bf3ab4196ad4`
- 远端输出目录：`/tmp/qcut-output/gen-image-ratio-size-e2e-1779769061133`
- 本地 proof 目录：`output/playwright/agent-chat-image-ratio-size-e2e-2026-05-26T04-24-50-222Z`

## Dimension Results / 尺寸结果

| Case / 用例 | Input / 输入 | Expected / 预期 | Actual / 实际 | Result / 结果 |
| --- | --- | ---: | ---: | --- |
| `aspect-16-9` | `--aspect-ratio 16:9` | `2048x1152` | `2048x1152` | Pass / 通过 |
| `ratio-9-16` | `--ratio 9:16` | `1152x2048` | `1152x2048` | Pass / 通过 |
| `aspect-3-4` | `--aspect-ratio 3:4` | `1536x2048` | `1536x2048` | Pass / 通过 |
| `aspect-4-3` | `--aspect-ratio 4:3` | `2048x1536` | `2048x1536` | Pass / 通过 |
| `custom-2000x1152` | `--width 2000 --height 1152` | `2000x1152` | `2000x1152` | Pass / 通过 |

## Proof Artifacts / 证明文件

English:

- Result JSON: `output/playwright/agent-chat-image-ratio-size-e2e-2026-05-26T04-24-50-222Z/result.json`
- Final screenshot: `output/playwright/agent-chat-image-ratio-size-e2e-2026-05-26T04-24-50-222Z/07-final-proof.png`
- Dimension validation: `output/playwright/agent-chat-image-ratio-size-e2e-2026-05-26T04-24-50-222Z/dimension-validation.json`
- Downloaded PNG files are in the same proof directory and start with `downloaded-`.
- Second input proof:
  - `second-input-ok.txt`: `SECOND_INPUT_OK 2026-05-26T04:25:07+00:00`
  - `qcut-version-after-second-input.txt`: `1.0.0`

中文：

- 结果 JSON：`output/playwright/agent-chat-image-ratio-size-e2e-2026-05-26T04-24-50-222Z/result.json`
- 最终截图：`output/playwright/agent-chat-image-ratio-size-e2e-2026-05-26T04-24-50-222Z/07-final-proof.png`
- 尺寸验证文件：`output/playwright/agent-chat-image-ratio-size-e2e-2026-05-26T04-24-50-222Z/dimension-validation.json`
- 下载到本地的 PNG 文件也在同一个 proof 目录，文件名以 `downloaded-` 开头。
- 第二次输入证明：
  - `second-input-ok.txt`: `SECOND_INPUT_OK 2026-05-26T04:25:07+00:00`
  - `qcut-version-after-second-input.txt`: `1.0.0`

## Automated Checks / 自动化检查

English:

Focused unit and integration checks passed:

```bash
bun test \
  electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts \
  electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-image-size.test.ts \
  electron/native-pipeline/cli/__tests__/cli-parse-kling.test.ts \
  electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts \
  electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts
```

Result: `43 pass, 0 fail`.

中文：

以下 focused 单元与集成检查通过：

```bash
bun test \
  electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts \
  electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-image-size.test.ts \
  electron/native-pipeline/cli/__tests__/cli-parse-kling.test.ts \
  electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts \
  electron/native-pipeline/infra/__tests__/api-caller-imarouter.test.ts
```

结果：`43 pass, 0 fail`。
