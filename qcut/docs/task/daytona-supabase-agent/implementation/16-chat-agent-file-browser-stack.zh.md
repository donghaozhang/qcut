# Chat Agent 文件浏览器技术栈

日期：2026-05-17

## 目标

把 Chat Agent 的文件体验升级到我们想要的长期架构：

- 自研 sandbox File Browser，处理 Daytona session/path 这些业务逻辑。
- 用 Uppy 做文件选择、队列 UI、拖拽上传和上传状态。
- 后续如果目录很深，再加 TreeView。

## 决策

现在不直接替换成通用 React file manager。QCut website 目前是静态 HTML/JavaScript 页面，而且文件浏览器和下面这些东西强绑定：

- 当前 Daytona session id
- 完整 sandbox path
- QCut 默认输出目录 `/tmp/qcut-output`
- Codex 能看到的上传目录
- license-server 的 auth 和下载接口

现在直接引入完整 React file manager，会先带来构建链和运行时复杂度。更稳的做法是继续保留自研 File Browser，只把上传选择和队列体验交给 Uppy。

## 本次实现

已完成：

1. 通过 Uppy 官方 browser CDN module 增加了 Dashboard：
   - CSS: `https://releases.transloadit.com/uppy/v5.2.1/uppy.min.css`
   - JS module: `https://releases.transloadit.com/uppy/v5.2.1/uppy.min.mjs`
2. Uppy 加载失败时，继续保留原生 file input 作为 fallback。
3. Upload 按钮会优先上传 Uppy 队列里的文件。
4. 继续复用现有 multipart sandbox upload API。
5. 增加了上传开始、进度、完成、错误时的状态显示。
6. 给文件行增加稳定的 `data-path`、`data-kind` 和 action `aria-label`，后续 E2E 可以按具体文件夹/文件点击，不再依赖重复的 `Open` 按钮。

实现文件：

- `packages/nexusai-website/chat-agent.html`
- `packages/nexusai-website/js/agent-chat.js`
- `packages/nexusai-website/js/agent-chat.test.js`

## 暂缓

1. 大目录树用的 TreeView sidebar。
2. 创建文件夹、重命名、删除、移动。
3. 图片、音频、视频预览。
4. 真正 resumable upload。Uppy 后续可以支持，但当前 license-server 还是普通 multipart upload endpoint。

## 验证计划

已通过：

- `node --check packages/nexusai-website/js/agent-chat.js`
- `node --test packages/nexusai-website/js/agent-chat.test.js`
  - 28 个测试通过。
- 本地浏览器验证：`http://127.0.0.1:4174/chat-agent.html`
  - Uppy Dashboard 正常渲染。
  - Uppy 初始化后，原生 fallback input 被隐藏。
  - Upload 按钮仍在 Uppy 外部，继续走 QCut sandbox upload flow。

证据：

- `output/playwright/chat-agent-file-browser-stack/01-uppy-dashboard-local.png`

生产发布前还需要：

1. 推送 website 和 root repo 变更。
2. 打开线上 `chat-agent.html`。
3. 确认 Uppy 面板在线上正常渲染。
4. 上传 proof text file 到当前 sandbox 目录。
5. 确认文件出现在浏览器里，并且可以按完整路径下载。
