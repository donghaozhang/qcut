# Chat Agent 文件上传和虚拟目录

日期：2026-05-17

## 目标

让 `https://quriosity.com.au/chat-agent.html` 支持用户上传图片和文件到 Daytona sandbox，让 Codex 可以直接读取这些文件，并且在网页里显示一个虚拟文件夹，用户可以从里面下载上传文件和生成结果。

## 已实现

- 在 `packages/nexusai-website/chat-agent.html` 增加了上传控件。
- 在 `packages/nexusai-website/js/agent-chat.js` 增加了 multipart 上传逻辑。
- 增加了一个虚拟 sandbox 文件浏览器，合并显示两个目录：
  - `/tmp/qcut-input`：用户上传的文件和图片。
  - `/tmp/qcut-output`：Codex 或 QCut CLI 生成的文件。
- 前端下载逻辑现在支持下载上传文件和生成文件。
- 更新了网站端 Codex agent prompt，让 Codex 知道用户上传文件在 `/tmp/qcut-input`。
- 更新了 relay 启动提示，让持久 Codex session 也知道上传目录。
- Daytona PTY 启动时现在会创建 `/tmp/qcut-input`、`/tmp/qcut-output`、`/tmp/qcut-tools`。
- license-server 增加了三个 API：
  - `GET /api/agent/sessions/:sessionId/files`
  - `POST /api/agent/sessions/:sessionId/files`
  - `GET /api/agent/sessions/:sessionId/files/:folder/:filename/download`
- 修复了 multipart 解析，改成 `parseBody({ all: true })`；第一次真实 E2E 发现默认解析只保留同名 form field 的最后一个文件。
- 已部署 Workers：
  - `qcut-license-server` version `b831fc20-e03e-4a12-b28c-809cd7f56a2c`
  - `qcut-relay` version `e490005e-c4a4-4c3d-88e0-3a31b7da6f55`
- 已推送 website commit `c2f5cf3` 到 `nexusai-website/master`。

## 验证

已通过：

- `node --test packages/nexusai-website/js/agent-chat.test.js`
  - 23 个测试通过。
- 在 `packages/license-server` 执行 `bun run test`
  - 120 个测试通过。
- 在 `packages/qcut-relay` 执行 `bun run test`
  - 10 个测试通过。
- `bunx @biomejs/biome check --write packages/license-server/src/routes/agent.ts packages/license-server/src/routes/agent.test.ts packages/qcut-relay/src/pty-session.ts`

有噪音或阻塞：

- `bunx tsc -p packages/license-server/tsconfig.json --noEmit` 目前仍然会被已有的 `sharp` 类型缺失问题挡住。
- 单独对 `agent.ts` 跑 `tsc` 也不干净，因为会拉出重复 Drizzle 版本和一批无关 declaration error。

真实线上 E2E 已通过，测试地址是 `https://quriosity.com.au/chat-agent.html`：

- 上传了 `qcut-upload-proof.txt` 和 `qcut-upload-blue.png`。
- 确认两个文件都出现在虚拟目录里：
  - `/tmp/qcut-input/qcut-upload-proof.txt`
  - `/tmp/qcut-input/qcut-upload-blue.png`
- 从网页下载 `qcut-upload-proof.txt`，并确认下载内容和上传文本一致。
- 通过网页终端给 Codex 发 prompt，让它列出 `/tmp/qcut-input`，读取 `qcut-upload-proof.txt`，并写入 `/tmp/qcut-output/upload-e2e-proof.txt`。
- 确认 `/tmp/qcut-output/upload-e2e-proof.txt` 出现在同一个虚拟目录里。
- 从网页下载 `upload-e2e-proof.txt`，并确认内容包含：
  - 两个上传文件名
  - `qcut-upload-proof.txt` 的文本内容

证据文件：

- `output/playwright/chat-agent-upload/01-uploaded-files.png`
- `output/playwright/chat-agent-upload/02-codex-output-artifact.png`
- `output/playwright/chat-agent-upload/downloaded-qcut-upload-proof.txt`
- `output/playwright/chat-agent-upload/downloaded-upload-e2e-proof.txt`

## 下一步子任务

1. 给大文件上传加进度显示。
2. 如果后面要上传项目目录，再考虑 nested folder 支持。
3. 给图片加缩略图预览，给音频/视频加播放控件。
4. 给虚拟目录增加删除 stale 文件的操作。
