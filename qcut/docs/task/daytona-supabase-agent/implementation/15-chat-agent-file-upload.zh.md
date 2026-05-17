# Chat Agent 文件上传和虚拟目录

日期：2026-05-17

## 目标

让 `https://quriosity.com.au/chat-agent.html` 支持用户上传图片和文件到 Daytona sandbox，让 Codex 可以直接读取这些文件，并且在网页里显示一个虚拟文件夹，用户可以从里面下载上传文件和生成结果。

## 已实现

- 在 `packages/nexusai-website/chat-agent.html` 增加了上传控件。
- 在 `packages/nexusai-website/js/agent-chat.js` 增加了 multipart 上传逻辑。
- 增加了第一版虚拟 sandbox 文件浏览器，合并显示两个目录：
  - `/tmp/qcut-input`：用户上传的文件和图片。
  - `/tmp/qcut-output`：Codex 或 QCut CLI 生成的文件。
- 已升级成完整的当前 sandbox filesystem 浏览器：
  - UI 从 `/` 开始。
  - 用户可以点击文件夹进入。
  - 用户可以回到 root，也可以返回上一级目录。
  - 上传文件会进入当前选中的 sandbox 目录。
  - 文件可以按完整 sandbox path 下载。
- 前端下载逻辑现在支持下载上传文件和生成文件。
- 更新了网站端 Codex agent prompt，让 Codex 知道用户上传文件在 `/tmp/qcut-input`。
- 更新了 relay 启动提示，让持久 Codex session 也知道上传目录。
- Daytona PTY 启动时现在会创建 `/tmp/qcut-input`、`/tmp/qcut-output`、`/tmp/qcut-tools`。
- 更新了 QCut CLI 默认输出策略：website sandbox 里 `QCUT_OUTPUT_DIR=/tmp/qcut-output` 会成为默认输出目录；普通桌面用户没有设置这个环境变量时仍然回落到 `~/Documents/QCut/exports`。
- license-server 增加了三个 API：
  - `GET /api/agent/sessions/:sessionId/files`
  - `POST /api/agent/sessions/:sessionId/files`
  - `GET /api/agent/sessions/:sessionId/files/download?path=/absolute/sandbox/path`
  - `GET /api/agent/sessions/:sessionId/files/:folder/:filename/download`
- `GET /files` 和 `POST /files` 现在支持 `?path=/absolute/sandbox/folder`。
- 旧的 input/output 下载接口继续保留，避免破坏兼容性。
- 新增 path normalization：允许绝对路径，但拒绝 `..`、反斜杠和空字节，避免路径穿越。
- 修复了 multipart 解析，改成 `parseBody({ all: true })`；第一次真实 E2E 发现默认解析只保留同名 form field 的最后一个文件。
- 已部署 Workers：
  - `qcut-license-server` version `b831fc20-e03e-4a12-b28c-809cd7f56a2c`
  - `qcut-relay` version `e490005e-c4a4-4c3d-88e0-3a31b7da6f55`
- 已部署完整 sandbox filesystem 更新：
  - `qcut-license-server` version `cc854321-af0d-4b79-8243-1c573ed8151b`
  - `nexusai-website/master` commit `b76d0d6`
- 已推送 website commit `c2f5cf3` 到 `nexusai-website/master`。

## 验证

已通过：

- `node --test packages/nexusai-website/js/agent-chat.test.js`
  - 26 个测试通过。
- 在 `packages/license-server` 执行 `bun run test`
  - 124 个测试通过。
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
- 完整 sandbox filesystem 部署后，打开了 `https://quriosity.com.au/chat-agent.html?fs-v=8f15127b`。
- 已连接持久 Daytona Codex terminal，并确认页面显示：
  - session `6829578c-1100-40f6-8c33-f9be3adc8a32`
  - terminal status 是 `connected`
  - Codex 在 `~/qcut` 目录运行，并且是 YOLO permission 模式
- 确认文件浏览器能列出真实 sandbox 根目录 `/`，包括 `/bin`、`/home`、`/tmp`、`/usr`、`/var` 和 `/.dockerenv`。
- 确认 UI 目录跳转可用：从页面进入了 `/sys`。
- 确认生产 API 可以浏览 `/tmp`，返回了 `/tmp/qcut-input`、`/tmp/qcut-output` 和 `/tmp/qcut-tools`。
- 确认生产环境 full-path 上传和下载可用：
  - 通过 `POST /files?path=/tmp/qcut-input` 上传了 `qcut-full-fs-proof.txt`。
  - 通过 `GET /files/download?path=/tmp/qcut-input/qcut-full-fs-proof.txt` 下载了它。
  - 下载文本和 `qcut full sandbox fs proof 2026-05-17` 一致。

证据文件：

- `output/playwright/chat-agent-upload/01-uploaded-files.png`
- `output/playwright/chat-agent-upload/02-codex-output-artifact.png`
- `output/playwright/chat-agent-upload/downloaded-qcut-upload-proof.txt`
- `output/playwright/chat-agent-upload/downloaded-upload-e2e-proof.txt`
- `output/playwright/chat-agent-full-fs/01-root-filesystem.png`
- `output/playwright/chat-agent-full-fs/04-tmp-filesystem.png`（这张截图展示的是打开 `/sys` 后的目录跳转结果；文件名沿用了探索测试时的名字）

## 下一步子任务

1. 给大文件上传加进度显示。
2. 如果要让它更像轻量文件管理器，可以继续加创建文件夹和删除文件。
3. 给图片加缩略图预览，给音频/视频加播放控件。
4. 给文件行加更明确的 data attribute 或唯一按钮 label，方便之后 Playwright 直接按文件夹名点击，不依赖重复的 `Open` 按钮。
