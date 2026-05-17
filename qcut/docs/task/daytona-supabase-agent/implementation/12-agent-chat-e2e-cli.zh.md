# Agent Chat E2E 测试 CLI

## 决策

Chat Agent 的浏览器到 Daytona 验证应该是仓库里的测试命令，不应该放进
用户可见的 `qcut` 产品 CLI。

`qcut` 产品 CLI 在 `electron/native-pipeline/cli`，主要给用户做生成、
编辑器控制和系统命令。Chat Agent E2E 测的是线上部署链路：

```text
QCut website -> license-server -> qcut-relay -> Daytona PTY -> Codex CLI -> artifacts
```

所以它现在作为 repo test command 存在，既能重复验证发版链路，又不会污染
用户命令面。

## 命令

```bash
bun run test:agent:e2e
bun run test:agent:e2e:prod
```

目前默认目标都是：

```text
https://quriosity.com.au/chat-agent.html
```

也可以直接跑：

```bash
bun scripts/agent-chat-e2e.ts \
  --url https://quriosity.com.au/chat-agent.html \
  --out-dir output/playwright/agent-chat-e2e-manual

bun scripts/agent-chat-e2e.ts \
  --url https://quriosity.com.au/chat-agent.html \
  --inject-local-agent-chat-js
```

`--inject-local-agent-chat-js` 会保留生产页面 origin、API、CORS、relay、
Daytona 和 Codex 链路，但把 `js/agent-chat.js` 替换成本地文件。这个适合
验证刚修好的前端逻辑，尤其是 GitHub Pages/CDN 还没同步最新 JS 的时候。

## 覆盖范围

默认 smoke test 会验证：

| 步骤 | 断言 |
| --- | --- |
| 初始加载 | Terminal 是 `disconnected`，Codex 没有自动启动。 |
| 不点击等待 | 等待一段时间后仍然没有自动连接。 |
| Connect | 点击按钮后进入真实 Daytona PTY，Codex ready。 |
| 第一轮对话 | Prompt 能进入同一个持久 Codex 进程。 |
| 第二轮对话 | Codex 在 `/tmp/qcut-output` 写出文件。 |
| Artifact 列表 | 文件出现在网页右侧 Artifacts 面板。 |
| Artifact 下载 | Download 按钮触发浏览器下载，并且直接 fetch 校验内容。 |
| Disconnect | Terminal 回到 disconnected placeholder。 |
| Reconnect | 同一个页面可以重新进入 Codex。 |

每次运行会写出截图和结果：

```text
output/playwright/agent-chat-e2e-*/01-initial-load.png
output/playwright/agent-chat-e2e-*/02-no-click-still-disconnected.png
output/playwright/agent-chat-e2e-*/03-connect-codex-ready.png
output/playwright/agent-chat-e2e-*/04-turn-one.png
output/playwright/agent-chat-e2e-*/05-artifact-visible.png
output/playwright/agent-chat-e2e-*/06-artifact-download.png
output/playwright/agent-chat-e2e-*/07-disconnected-clean.png
output/playwright/agent-chat-e2e-*/08-reconnect-codex-ready.png
output/playwright/agent-chat-e2e-*/result.json
```

## 默认不测什么

默认 smoke test 不下载 YouTube，也不跑大型图片/视频生成。那些更慢，而且受
第三方网络影响，应该做成 release/nightly 或手动长测。

默认 artifact 是一个小文本文件，但它已经能证明核心链路：

```text
Codex 写 /tmp/qcut-output/file -> license-server 列出文件 -> website 展示 -> 用户下载
```

## 和现有 CLI E2E 的关系

已有的 `bun run test:cli-e2e` 测本地 `qcut` 命令和 editor HTTP bridge。
新的 `bun run test:agent:e2e` 测网站上的 Agent Chat 链路。

它们是并列的两层验证：

| 命令 | 范围 |
| --- | --- |
| `bun run test:cli-e2e` | 本地产品 CLI 和 editor HTTP bridge。 |
| `bun run test:agent:e2e` | 线上 Chat Agent 页面、relay、Daytona、Codex、artifacts。 |

## 验证 - 2026-05-16

已实现：

- 新增 `scripts/agent-chat-e2e.ts`。
- 在 `package.json` 新增 `test:agent:e2e` 和 `test:agent:e2e:prod`。
- 顺手修了 Chat Agent 状态 chip：persistent terminal 发送 prompt 后不会一直
  卡在 `running`；Disconnect 后状态回到 `idle`。

检查命令：

```bash
bun scripts/agent-chat-e2e.ts --help
bunx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --types node scripts/agent-chat-e2e.ts
node --test packages/nexusai-website/js/agent-chat.test.js
git diff --check
git -C packages/nexusai-website diff --check
```

真实 E2E 使用生产 origin + 本地 `agent-chat.js` 注入：

```bash
bun scripts/agent-chat-e2e.ts \
  --url https://quriosity.com.au/chat-agent.html \
  --inject-local-agent-chat-js \
  --out-dir output/playwright/agent-chat-e2e-cli-injected-1778963356
```

这样 license-server、relay、Daytona、Codex、artifact download 都是真线上链路，
只把前端 JS 换成刚修改的本地版本，适合在 GitHub Pages/CDN 同步前验证修复。

结果：

```text
output/playwright/agent-chat-e2e-cli-injected-1778963356/result.json
status: passed
```

截图证据：

| 截图 | 结果 |
| --- | --- |
| `01-initial-load.png` | 初始页面 disconnected。 |
| `02-no-click-still-disconnected.png` | 等 8 秒仍未自动连接。 |
| `03-connect-codex-ready.png` | 点击 Connect 后进入 Daytona PTY，Codex ready。 |
| `04-turn-one.png` | 第一轮 prompt 进入同一个持久 Codex session。 |
| `05-artifact-visible.png` | Codex 写出 `agent-e2e-1778963356804.txt`，artifact 面板可见。 |
| `06-artifact-download.png` | Download 按钮可用，fetch 校验内容匹配。 |
| `07-disconnected-clean.png` | Disconnect 清掉旧 Codex terminal 输出，状态回到 `idle`。 |
| `08-reconnect-codex-ready.png` | Reconnect 后再次进入 Codex。 |
