# Chat Agent sandbox 文件预览

日期：2026-05-20
分支：`cli-image-v7`

## 目标

让 Daytona sandbox 文件浏览器变成一个轻量的 artifact 浏览器，而不仅仅是下载列表。用户应该能在下载前预览生成的图片和常见文本 artifact。

## 范围

- 图片预览：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`。
- 文本预览：`.md`、`.markdown`、`.json`、`.txt`、`.log`、`.csv`、`.yaml`、`.yml`。
- 目录跳转和现有下载行为必须保持可用。
- 除非现有 sandbox download 路由不支持预览，否则不新增 server 路由。

## 实现计划

1. 复用已有的认证 sandbox 下载路径来获取预览。
2. 在 Chat Agent 运行时新增文件类型检测辅助。
3. 在 sandbox grid 中为可预览的图片显示缩略图。
4. 新增模态预览界面：
   - bitmap 文件用 image modal；
   - Markdown、JSON 和纯文本用 text modal；
   - JSON 解析成功时美化格式；
   - 文件过大或不可预览时有清晰的 fallback。
5. 在右键菜单为可预览文件加 `Preview`。
6. 新增聚焦的 Node 测试，覆盖路径复用、预览类型识别、JSON 格式化和大文本限制。
7. 跑网站测试。
8. 跑一次真实的 Daytona web E2E：创建图片和文本/JSON artifact，预览它们，并确认下载仍然可用。

## 备注

server 已经把 sandbox 文件分类为 `image`、`json` 或 `log`，并通过以下路径暴露完整文件系统下载：

```text
/api/agent/sessions/:sessionId/files/download?path=/tmp/qcut-output/file
```

预览应使用该路由，而不是新增一个平行的 read 路由，这样认证和路径校验仍集中处理。

## 实现

改动 `packages/nexusai-website`：

- `js/agent-chat/01-runtime-api.js`
  - 新增共享的 artifact 下载请求构造；
  - 新增对图片、JSON 和文本类文件的预览类型识别；
  - 新增文本预览大小限制和 JSON 美化格式；
  - 通过下载用的同一个认证 blob 请求加载预览。
  - 新增基于 blob 的独立预览 tab，用于 image/text artifact，这样 new-tab 预览不会依赖裸下载 URL 携带认证。
- `js/agent-chat/02-ui-files.js`
  - image tile 在文件可预览时显示缩略图；
  - 点击可预览文件会打开 modal，而不是无反应；
  - 文件右键菜单包括 `Preview`、`Open preview in new tab`、`Download to local`、`Copy path` 和 `Copy filename`；
  - 文件夹右键菜单包括 `Open folder`、`Download folder to local`、`Copy path` 和 `Copy folder name`；
  - image、JSON、markdown 和 raw text 预览渲染在 modal 中。
- `chat-agent.html`
  - 新增预览 modal、缩略图和 context-menu 分隔符样式。
- `js/agent-chat.download.test.js`
  - 新增覆盖：预览路由、kind 识别、JSON 格式化、大文本拦截、copy path 解析、转义后的独立预览 HTML、new-tab 预览 blob 路由。

## 验证

本地聚焦测试：

```bash
node --test \
  packages/nexusai-website/js/agent-chat.download.test.js \
  packages/nexusai-website/js/agent-chat.api.test.js \
  packages/nexusai-website/js/agent-chat.prompt.test.js
```

结果：43 个测试通过。

真实 Daytona web E2E：

- URL：`https://quriosity.com.au/chat-agent.html?preview-e2e=1779243490186`
- 被测前端：本地 `chat-agent.html` 和本地 `js/agent-chat/*` 路由到生产域名。
- 被测后端：生产 license server 和真实 Daytona Codex 终端。
- 输出目录：`output/playwright/sandbox-file-preview-e2e-2026-05-20T02-18-10-186Z`

通过步骤：

1. 用本地预览 UI 加载生产域名。
2. 连接到真实 Daytona Codex 终端。
3. 在 `/tmp/qcut-output` 下创建 `.md`、`.json` 和 `.png` artifact。
4. 打开 markdown 预览 modal。
5. 打开 JSON 预览 modal，并校验美化后的 JSON 文本。
6. 打开图片预览 modal；小图渲染在可见的 checker/preview surface 上。
7. 下载 JSON artifact 并校验文件中标记仍存在。

真实 Daytona context-menu E2E：

- URL：`https://quriosity.com.au/chat-agent.html?context-menu-e2e=1779243923761`
- 被测前端：本地 `chat-agent.html` 和本地 `js/agent-chat/*` 路由到生产域名。
- 被测后端：生产 license server 和真实 Daytona Codex 终端。
- 输出目录：`output/playwright/sandbox-context-menu-e2e-2026-05-20T02-25-23-761Z`

通过步骤：

1. 用本地 context-menu UI 加载生产域名。
2. 连接到真实 Daytona Codex 终端。
3. 在 `/tmp/qcut-output` 下创建 `.md`、`.json` 和文件夹 artifact。
4. 右键文件，校验 `Preview`、`Open preview in new tab`、`Download to local`、`Copy path` 和 `Copy filename`。
5. 使用 `Copy path` 并校验剪贴板/状态里包含 `/tmp/qcut-output/...`。
6. 使用 `Open preview in new tab` 并校验新 tab 包含 artifact 标记。
7. 通过 context-menu `Download to local` 下载并校验下载的 JSON 标记。
8. 右键文件夹，校验 `Open folder`、`Download folder to local`、`Copy path` 和 `Copy folder name`。

后续确认 E2E：

- URL：`https://quriosity.com.au/chat-agent.html?context-menu-confirm=1779244302846`
- 输出目录：`output/playwright/sandbox-context-menu-confirm-2026-05-20T02-31-42-846Z`
- 发现：早先一次截图复查显示，等待 artifact fetch 之后再打开预览 tab，可能被浏览器拦截弹窗。当前实现改成用户点击时先预先打开一个空白 tab，等预览 blob 准备好后再导航过去。

已确认的截图：

- 文件 context menu：`04-right-click-file-shows-full-file-action-menu.png`
- 文本文件 modal 预览：`text-file-preview-modal.png`
- Copy path 状态：`06-copy-path-action-writes-sandbox-path.png`
- New-tab 文本预览：`new-tab-text-preview.png`
- 从 context menu 下载：`08-download-to-local-from-context-menu.png`
- 文件夹 context menu：`09-right-click-folder-shows-folder-action-menu.png`

通过步骤：

1. 用本地 context-menu UI 加载生产域名。
2. 连接到真实 Daytona Codex 终端。
3. 在 `/tmp/qcut-output` 下创建 `.md`、`.json` 和文件夹 artifact。
4. 校验完整的文件 action menu。
5. 在 modal 预览中打开一个文本文件。
6. 复制 sandbox 路径并校验剪贴板/状态文本。
7. 在另一个页面打开文本预览，没有触发 popup blocker 失败。
8. 通过 context menu 下载 JSON 并校验标记。
9. 校验文件夹 action menu。
