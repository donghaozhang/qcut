# 10 Agent Session 模式

## 目标

让网站 Chat Agent 默认使用一个持久的、由 Daytona 支撑的 Codex session。用户应该能和同一个 sandbox 持续对话，复用文件和工作状态，只有在 idle 超时、硬 TTL 或显式"新 session"操作之后才会丢失 sandbox。

这跟当前的纯 job 模型不同：

- **当前**：每条消息创建一个 `agent_jobs` 行、一个 Daytona sandbox、一个 Codex 进程，然后在 artifact 上传后删除 sandbox。
- **目标 v1**：每个浏览器 chat 对应一个 `agent_sessions` 行和一个常驻 Daytona sandbox。消息仍然创建 `agent_jobs` 行，但 job 指向 session 并复用 sandbox。

## 范围

这个任务实现的是持久化的 **sandbox/session 复用**，不是一个长存的交互式 Codex PTY 进程。每一轮仍然可以调用 `codex exec`，但它运行在同一个 Daytona 文件系统和环境里。这正好给到用户最想要的实际好处：下载的文件、生成的 artifact、临时工具、repo 状态和工作目录可以跨多轮保持。

保持一个 Codex 进程一直活着是后续工作，因为它需要 PTY 或 daemon 协议、背压、取消和不同的消息 transport。

## 数据模型

新增 `agent_sessions`：

| Column | 用途 |
| --- | --- |
| `id` | 浏览器可见的 chat session id。 |
| `user_id` | 所有者。与 `agent_jobs` 用同一个用户模型。 |
| `status` | `active`、`stopping`、`ended` 或 `error`。 |
| `provider` | 目前是 `daytona`。 |
| `provider_session_id` | 一旦创建好 sandbox 就写入 Daytona sandbox id。等待第一个 job 认领前可为空。 |
| `image_tag` | sandbox 使用的镜像。 |
| `started_at` | session 首次创建时间。 |
| `last_active_at` | 创建 job 时和 job 完成后更新。idle 清理用这个字段。 |
| `expires_at` | 硬 TTL。 |
| `ended_at` | worker 清理或用户显式结束 session 时设置。 |
| `end_reason` | `idle_timeout`、`ttl`、`user_kill` 或 `error`。 |
| `runner_id` | 最后一次操作 session 的 worker。 |

在 `agent_jobs` 上新增可空的 `session_id`，引用 `agent_sessions.id`。

session id 本身不被信任。License-server 始终按 `user_id` 限定 scope；worker 也会用 job 中存储的 `user_id` 校验已认领的 job。

## API 形状

### 创建/复用 session

`POST /api/agent/sessions`

Body：

```json
{
  "mode": "codex"
}
```

行为：

- 如果用户存在未过期的 active session，就返回最新的一个。
- 否则创建一个新的 active session，`provider_session_id` 暂时为空。
- 这条路由很轻。Daytona 由 worker 在第一个引用 session 的 job 上 lazy 创建。

### 结束 session

`POST /api/agent/sessions/:sessionId/end`

行为：

- 将 session 标记为 `stopping`，`end_reason = 'user_kill'`。
- worker 的清理循环会删除 Daytona sandbox 并把它标记为 `ended`。
- 即使 worker 当时挂了，下一个 worker 进程也会执行清理。

### 在 session 中创建 job

`POST /api/agent/jobs`

Body 保留现有契约，新增可选的 `sessionId`：

```json
{
  "command": "codex exec --skip-git-repo-check --json -",
  "args": { "codexPrompt": "..." },
  "sessionId": "..."
}
```

行为：

- 如果传了 `sessionId`，校验它属于该用户并处于 active。
- 存到 `agent_jobs.session_id`。
- 更新 `agent_sessions.last_active_at`。

## Worker 行为

对于没有 `session_id` 的 job，保留现有的 one-shot 行为：创建 sandbox，运行命令，上传 artifact，删除 sandbox。

对于带 `session_id` 的 job：

1. 加载 session 行。
2. 如果它有 `provider_session_id`，尝试 `daytona.get(...)`。
3. 如果没有 sandbox 或 Daytona 说它已经没了，创建一个新 sandbox 并更新 `agent_sessions.provider_session_id`。
4. 在那个 sandbox 中运行 job。
5. 只把这次 job 的 `/tmp/qcut-output` 内容作为 artifact 上传。
6. job 结束后**不要**删除 sandbox。
7. 更新 `last_active_at`。

命令 wrapper 仍然按每个 job 清空 `/tmp/qcut-output`，保证 artifact 边界干净。其他路径如 `/tmp/qcut-tools`、`/home/qcut` 和工作目录跨多轮保留。

## Idle 清理

清理工作归 worker，因为它已经有 Daytona 凭据。

默认值：

- Idle 超时：`20 分钟`
- 硬 TTL：`2 小时`
- 清理间隔：`60 秒`

清理查询：

- `last_active_at < now - idle_timeout` 的 active session
- `expires_at < now` 的 active session
- 标记为 `stopping` 的 session

对每个匹配：

1. 状态设为 `stopping`。
2. 如果有 `provider_session_id`，尝试删除 Daytona sandbox。
3. 标记 `ended`，设置 `ended_at` 和 `end_reason`。
4. 写入 `agent_events`：`job_id = null`，`kind = 'agent_session_ended'`。

## 网站行为

Chat Agent 默认 Codex 模式使用 session：

- 在 `localStorage` 保留 `qcut_agent_session_id`。
- 首次 Codex 发送时调用 `POST /api/agent/sessions`。
- 把返回的 `session.id` 传给 `POST /api/agent/jobs`。
- 在页面显示 session 状态。
- 增加"新建 session"按钮：
  - 尽量为旧 session 调用 end 路由
  - 清空 localStorage
  - 下一次发送时创建新的 session

网站表面有意只保留 Chat Agent。图片和视频请求通过持久 sandbox 中的 Codex 走；当 worker 从 `/tmp/qcut-output` 上传文件时，它们会出现在 Artifacts 面板。

## 测试

已实现的覆盖：

- License-server：
  - 创建/复用 active session
  - 把自己拥有的 session 标记为 `stopping`
  - 结束其他用户的 session 时返回 `404`
  - 拒绝 session 缺失/未激活的 job
  - 拒绝带其他用户 session id 的 job，并且不插入 row
  - 在 job 上存储 `sessionId`
- Agent worker：
  - one-shot job 保留旧的 create/run/delete 行为
  - 新 session job 用 session 行的 `image_tag` 创建持久 sandbox
  - session job 复用 `provider_session_id`
  - 当 Daytona sandbox 丢失时，session job 替换 sandbox 并保持替换后的活着
  - session job 在结束后不删除 sandbox
  - idle、TTL、user-kill 和 missing-sandbox 清理路径都会把 session 标记为 ended
  - 每个 job 都注入一次 Codex prompt，被复用的 sandbox 不会重放旧 prompt
- 网站：
  - 通过 license-server 路由创建 session
  - 把 `sessionId` 传入 Codex job 创建
  - 存储和清理 `qcut_agent_session_id`
  - "新建 session" 流程会 POST 到 session end 路由
  - 页面保持为单一 Chat Agent 流程，没有直接的 image-mode 选择器

本地验证：

```bash
bun --cwd packages/agent-worker test -- run-on-daytona.test.ts claim.test.ts stream-events.test.ts
bun --cwd packages/license-server test -- agent.test.ts
node --test packages/nexusai-website/js/agent-chat.test.js
bunx tsc -p packages/agent-worker/tsconfig.json --noEmit
bunx biome check packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/run-on-daytona.test.ts packages/license-server/src/routes/agent.test.ts
bunx biome check packages/db/src/schema.ts packages/license-server/src/routes/agent.ts packages/license-server/src/routes/agent.test.ts packages/agent-worker/src/claim.ts packages/agent-worker/src/main.ts packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/run-on-daytona.test.ts packages/agent-worker/src/stream-events.test.ts packages/nexusai-website/chat-agent.html
```

已知验证缺口：

- `bunx tsc -p packages/license-server/tsconfig.json --noEmit` 目前在检查这些改动之前就会失败，因为 workspace 缺少 `sharp` 的隐式类型定义。

## 生产 E2E - 2026-05-15

部署和迁移：

- 在生产 Supabase 应用了 `agent_sessions` 和 `agent_jobs.session_id` 的 schema。
- 重新部署 `qcut-license-server` 到 Cloudflare Workers。
- 验证临时迁移路由用完后已移除；该路由现在返回 `404`。
- 用 `QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516` 从当前 `qcut-cli-v2` checkout 重启了生产形态的 `qcut-agent-worker` tmux worker。
- 验证 `https://quriosity.com.au/chat-agent.html` 和 `https://quriosity.com.au/js/agent-chat.js` 包含 session UI 和 session API client 代码。

真实 session 复用测试：

| 步骤 | 证据 |
| --- | --- |
| 创建/复用 session | `b6423733-cef4-4a94-b031-c06737d78d3b` |
| 第一个 Codex job | `970686e6-19d5-4d91-aded-dc227d01b7ae` 成功 |
| 第一个 job 行为 | Codex 把 `session-e2e-1778901412` 写入 `/tmp/qcut-tools/session-e2e/marker.txt` |
| 第一个 sandbox 事件 | `agent_session_ready.reused=false`，sandbox `2df92162-0f45-4ec6-8a7a-0b7395672f97` |
| 第二个 Codex job | `2f488dd9-ba75-4cec-875f-ce03d6dc54d0` 成功 |
| 第二个 job 行为 | Codex 读到了第一个 job 留下的 marker，并回复 `SECOND_OK_SAME_SANDBOX_session-e2e-1778901412` |
| 第二个 sandbox 事件 | `agent_session_ready.reused=true`，sandbox 同为 `2df92162-0f45-4ec6-8a7a-0b7395672f97` |

线上网站测试：

| 步骤 | 证据 |
| --- | --- |
| 网站 URL | `https://quriosity.com.au/chat-agent.html` |
| UI 创建的 Codex job | `ec2e282d-7a3a-4e9a-9a26-6c552601f19d` 成功 |
| UI session | `b6423733-cef4-4a94-b031-c06737d78d3b` |
| UI sandbox 事件 | `agent_session_ready.reused=true`，sandbox `2df92162-0f45-4ec6-8a7a-0b7395672f97` |
| UI Codex 响应 | `WEBSITE_CODEX_SESSION_UI_OK` |

截图：

- `/Users/peter/Desktop/code/qcut/qcut/output/playwright/live-chat-agent-session-e2e.png`

## 补充验证 - 2026-05-15

实现 follow-up：

- 在 `packages/db/supabase/migrations/20260516000000_agent_sessions.sql` 增加了 Supabase CLI 的迁移副本。
- 修复 Daytona worker：新建 session sandbox 时使用 `agent_sessions.image_tag`，不再只用 worker 进程默认。
- 移除网站 image-mode 选择器，让页面只提交持久 Codex chat job。Image/video 输出预期通过现有 Artifacts 面板在上传后显示。
- 扩展测试，覆盖 session 所有权、新持久 sandbox 创建、Daytona 报告旧 sandbox 已不存在后的替换、TTL 清理、user-kill 清理、missing-sandbox 清理、以及网站结束 session 的请求。

聚焦测试运行：

```bash
bun --cwd packages/agent-worker test -- run-on-daytona.test.ts claim.test.ts stream-events.test.ts
bun --cwd packages/license-server test -- agent.test.ts
node --test packages/nexusai-website/js/agent-chat.test.js
bunx tsc -p packages/agent-worker/tsconfig.json --noEmit
bunx biome check packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/run-on-daytona.test.ts packages/license-server/src/routes/agent.test.ts
```

结果：

- Agent worker：27 个测试通过。
- License server：21 个测试通过。
- 网站 chat client：14 个测试通过。
- Agent worker typecheck 通过。
- 聚焦 Biome 检查通过。

对生产 license-server 和当前本地生产形态 worker 的真实 session 复用 smoke：

| 步骤 | 证据 |
| --- | --- |
| Run id | `plan-e2e-1778902437060` |
| Session | `b6423733-cef4-4a94-b031-c06737d78d3b` |
| 第一个 Codex job | `1f7c80da-5ff7-4201-9ffa-c6d59f1576af` 成功 |
| 第二个 Codex job | `9020e69f-3606-48d1-ab2f-d92ae5da5807` 成功 |
| Sandbox 复用 | 两个 job 都使用 sandbox `2df92162-0f45-4ec6-8a7a-0b7395672f97` |
| 持久化证据 | 第二个 job 读到了第一个 job 写下的 marker，并在 `codex-last-message.md` 中返回 `SECOND_PLAN_E2E_SAME_SANDBOX_plan-e2e-1778902437060` |
| Artifact 证据 | 两个 job 都上传了 `codex-events.jsonl`、`qcut-exit.json`、`qcut-output.tar` 和 `codex-last-message.md` |

## 线上网站 E2E - 2026-05-15

通过运行前的生产修复：

- 在线 license-server 之前用 `image_tag='qcut-cli'` 创建新 session，Daytona 在云端拉不到这个镜像，导致 create/start 超时。
- 在 `packages/license-server/wrangler.toml` 设置 `QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:youtube-fix-20260516`，重新部署 Cloudflare Worker。
- worker 的 Daytona create/start 超时从 120 秒提高到 300 秒，让首次拉镜像有足够余量。

修复后的聚焦测试：

```bash
bun --cwd packages/agent-worker test -- run-on-daytona.test.ts
bunx tsc -p packages/agent-worker/tsconfig.json --noEmit
bun --cwd packages/license-server test -- agent.test.ts
bunx biome check packages/license-server/wrangler.toml packages/license-server/src/routes/agent.ts
```

在 `https://quriosity.com.au/chat-agent.html` 的线上 UI 运行：

| 步骤 | 证据 |
| --- | --- |
| Run id | `ui-e2e-1778904289442` |
| Session | `2676fb3f-daed-45c3-b4c2-9be072ac2992` |
| Sandbox | `8a7b6295-fbbf-4545-a339-ae43fbaccb36` |
| Turn 1 job | `30d42eae-352e-4185-b524-1264918e9a4e` 成功 |
| Turn 1 回复 | `TURN1_OK_ui-e2e-1778904289442` |
| Turn 2 job | `811dec1b-43ab-4684-b8af-e49e59c98642` 成功 |
| Turn 2 回复 | `TURN2_OK_SAME_CONVERSATION_ui-e2e-1778904289442` |
| Turn 2 连续性证据 | job prompt 包含第一轮 user/assistant 对话，并且 `agent_session_ready.reused=true`，sandbox 不变 |
| 视频 job | `f60d3e6e-2b6d-4c48-bb94-61856b76b05c` 成功 |
| 视频 artifact | `e2e-video-ui-e2e-1778904289442.mp4`，kind `video`，40,239 字节 |
| 下载验证 | artifact 下载端点返回 `200`、`Content-Type: video/mp4`、`Content-Disposition: attachment; filename="e2e-video-ui-e2e-1778904289442.mp4"`、MP4 `ftyp` 签名 |

截图：

- Before：`/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-e2e-before.png`
- Turn 1 之后：`/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-e2e-after-turn1.png`
- Turn 2 之后：`/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-e2e-after-turn2.png`
- 视频 artifact 之后：
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-e2e-after-video-artifacts.png`

## 实时 Stdout 流式修复 - 2026-05-15

UI 验证时发现的问题：

- 页面在 job 运行时会流式展示 Daytona/Codex 生命周期事件，但 Codex 命令执行的 shell stdout 只在后来才出现在 `item.completed.aggregated_output` 中。
- 这让 UI 在长时间命令（如 `yt-dlp`、`ffmpeg`、QCut 生成 job）期间显得空闲。

实施修复：

- 把 `codex-live-stdout.log` 加为 Codex job 的 Daytona stream 源。worker 用与 `codex-events.jsonl` 相同的基于 cursor 的 stream loop 进行轮询。
- 更新了 Codex sandbox 指令，让长时间运行的 shell 命令把用户可见的 stdout 流出来：

```bash
tee -a /tmp/qcut-output/codex-live-stdout.log
```

- 为实时 stdout 行新增了 `codex_stdout` 事件，让网站待回复 Codex 消息和 Events 面板在 job 仍处于 `running` 时能显示命令进度。
- 当没看到 live 行时，把 `codex-events.jsonl` 的 fallback `aggregated_output` 拆成 `codex_stdout` 行，让旧的/没用 tee 的命令也能在 Codex 发出 completed 事件后干净地暴露 stdout。
- 加了去重，让已经从 `codex-live-stdout.log` 流出的行不会再从最终 `aggregated_output` 重复。

聚焦测试：

```bash
bun --cwd packages/agent-worker test -- stream-events.test.ts run-on-daytona.test.ts
bunx tsc -p packages/agent-worker/tsconfig.json --noEmit
node --test packages/nexusai-website/js/agent-chat.test.js
bunx biome check packages/agent-worker/src/stream-events.ts packages/agent-worker/src/stream-events.test.ts packages/agent-worker/src/run-container.ts packages/agent-worker/src/run-on-daytona.ts packages/agent-worker/src/run-on-daytona.test.ts
```

结果：

- Agent worker：27 个测试通过。
- 网站 chat client：14 个测试通过。
- Agent worker typecheck 通过。
- 聚焦 Biome 检查通过。

针对 `https://quriosity.com.au/chat-agent.html` 的线上 UI 验证，用从该分支重启的本地生产形态 worker：

| 步骤 | 证据 |
| --- | --- |
| Running stdout job | `398d42a4-b6c3-4695-b05f-55d541044b37` |
| Runner | `c6146513-2bcd-4182-945f-48ce7421098f` |
| Session 复用 | `agent_session_ready.reused=true`，sandbox `af9c00ec-e4c4-41f2-9e84-884114e3d8c8` |
| Running UI 证据 | 页面在 job 仍 `running` 时显示了 `codex_stdout: LIVE_STDOUT_stdout-dedupe-1778908772404_1` |
| 完成 | job 以 exit `0` 成功 |
| 去重证据 | 最终 API response 中 `_1`、`_2`、`_3` 三个 stdout 行的 `eventCount=3`、`uniqueCount=3` |
| Artifact 证据 | 上传了 `codex-live-stdout.log`、`stdout-dedupe-stdout-dedupe-1778908772404.txt`、`qcut-output.tar`、`codex-events.jsonl`、`qcut-exit.json` 和 `codex-last-message.md` |

截图：

- Running stdout stream：
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-e2e-live-stdout-dedupe-running.png`

## PTY Terminal 模式 - 2026-05-15

实时 stdout 流式之后发现的问题：

- `codex exec --json` 只在 `item.completed` 时发出真实的 assistant 消息；它不暴露逐 token 的 assistant delta。
- 之前的 web UI 可以显示 worker 事件和 shell stdout，但跟真实终端体验不同。用户没法在固定的 sandbox shell 里打字。

实施修复：

- 在 `packages/qcut-relay` 增加 Daytona 支撑的 PTY 路径。relay 现在接受 `agent_sessions` 的签名 token，连接到 session 的 Daytona sandbox，创建 PTY，通过 WebSocket 在浏览器和 PTY 之间桥接输入/输出。
- license-server 增加 `POST /api/agent/sessions/:sessionId/pty-token`。这会创建或复用 Daytona sandbox、注入已保存的 `agent_secrets`、并签发一个带 `session_kind="agent"` 的短时效 relay token。
- 新增 terminal artifact 端点：
  - `GET /api/agent/sessions/:sessionId/artifacts`
  - `GET /api/agent/sessions/:sessionId/artifacts/:filename/download`
- 更新 `chat-agent.html` 改用 xterm.js 作为主界面。Send 按钮现在把 `codex exec --dangerously-bypass-approvals-and-sandbox` 命令写入实时 PTY，让用户在终端中看到真实 shell/Codex 输出，并且 Codex 在已经隔离的 Daytona sandbox 内部不会因为权限提示而暂停。
- 修复本地网站 E2E 的 CORS，把 `http://localhost:4177` 和 `http://127.0.0.1:4177` 加入 allowlist。
- 修复 relay 的 stdin 处理：非 resize 的字符串 WebSocket 消息是终端输入，不是控制 packet。

部署：

- 加入 PTY token 和 terminal artifact 路由后，把 `qcut-license-server` 部署到 Cloudflare Workers。
- 加入 Daytona PTY 支持后，把 `qcut-relay` 部署到 Cloudflare Workers。
- 两个 Worker 上设置共享 `RELAY_SIGNING_SECRET`。
- 两个 Worker 上设置 `DAYTONA_API_KEY`。

聚焦测试：

```bash
node --test packages/nexusai-website/js/agent-chat.test.js
bun --cwd packages/license-server test -- src/routes/agent.test.ts src/services/payment-config.test.ts
bun --cwd packages/qcut-relay test
bun --cwd packages/agent-worker test
bunx tsc -p packages/qcut-relay/tsconfig.json --noEmit
```

结果：

- 网站 chat client：18 个测试通过。
- License server 聚焦测试：31 个测试通过。
- QCut relay：9 个测试通过。
- Agent worker：46 个测试通过。
- QCut relay typecheck 通过。
- License-server repo typecheck 仍然有现有的、无关的 `Cannot find type definition file for 'sharp'` 问题。

针对部署后的 Worker 和本地网站的 Live/local E2E：

| 步骤 | 证据 |
| --- | --- |
| Session | `13a3b39a-d9fe-420a-bec3-f7dc9eb00a6d` |
| Daytona sandbox | `9c50d534-8190-4e14-a30d-2a8350638252` |
| PTY 证据 | 浏览器终端接受了键盘输入并打印了 `direct-pty-ok` |
| Codex 证据 | Send 按钮在 PTY 中运行了真实 `codex exec` |
| QCut CLI 证据 | Codex 跑了 `qcut --help \| head -12`，输出 `qcut-pipeline v1.0.0 — AI content generation CLI` |
| Artifact 证据 | `/tmp/qcut-output/terminal-e2e.txt` 出现在网页 Artifacts 面板，带 Download 按钮 |

截图：

- 已连接 PTY：
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-pty-connected.png`
- 直接键盘 PTY：
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-pty-keyboard-direct.png`
- Terminal artifact 刷新：
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-pty-artifact-refresh-confirmed.png`
- Send 按钮在 PTY 中启动真实 Codex：
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-send-codex-command-visible.png`
- Codex 结果加可下载 artifact：
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-send-codex-artifact-visible.png`
- 推到网站后的生产页面：
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-production-pty-artifacts.png`

权限 follow-up：

- 把网站 PTY Send 和 agent-worker Codex job 都更新为以 `--dangerously-bypass-approvals-and-sandbox` 启动 Codex。这避免在已经运行在一次性 Daytona sandbox 内部时被审批 prompt 卡住。

默认连接 follow-up：

- 网站现在在 Chat Agent 页面初始化后会自动连接 Daytona PTY。用户不再需要先点 Connect 才能发 Codex prompt。
- 本地浏览器验证保存到了
  `/Users/peter/Desktop/code/qcut/qcut/output/playwright/chat-agent-autoconnect-local.png`，
  确认页面加载时终端到达了 `connected`。

默认 Codex follow-up：

- relay 现在直接把 PTY 启动进交互式 Codex，而不是停留在普通 shell prompt。
- 启动时先跑 `qcut-entrypoint`，让保存的 QCut/Codex 认证落地，把 `/home/qcut/qcut` 标为受信任的 Codex 项目，把 QCut Chat Agent 默认值写入 sandbox 的 `AGENTS.md`，然后启动一个空闲的交互式 Codex TUI：
- relay 在 bootstrap 期间临时关闭 PTY 输入回显，避免 setup 脚本污染用户终端 scrollback。

```bash
codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen -C /home/qcut/qcut ...
```

- sandbox 的 `AGENTS.md` 部分告诉 Codex 它是 QCut 网站 Chat Agent，把它指向 `/home/qcut/qcut/.claude/skills/native-cli/SKILL.md`，并复述 `/tmp/qcut-output` artifact 规则。这避免把第一轮交互浪费在 setup 指令上。
- 网站 Send 按钮现在向那个持久 Codex session 发送 bracketed paste 加 carriage return，而不是对每条消息生成一个 `codex exec`。Artifact 轮询仍然监视 `/tmp/qcut-output`。
- 生产 E2E 通过发送一个 Codex prompt 让它创建 `/tmp/qcut-output/direct-1778919565593.txt` 确认了流程；部署的 Artifacts API 列出了它，下载端点返回了匹配内容。
- Artifact 列表现在优先用 Daytona `fs.listFiles()`，当 `/tmp/qcut-output` 不可见时 fallback 到 `sh -lc` 进程命名空间的列表。

## Terminal Artifact 下载修复 - 2026-05-16

生产环境发现的问题：

- 通过 PTY session 路由下载 artifact 失败，错误是
  `"Buffer" is not supported: Module "buffer" is not available in the "serverless" runtime`。
- 根因是 Daytona SDK `sandbox.fs.downloadFile()` 把 multipart response 通过 Node `Buffer` 转换，而 Cloudflare Workers 没有提供 `Buffer`。

实施修复：

- 新增 `packages/license-server/src/services/daytona-download.ts`，调用 Daytona 更底层的 `downloadFiles` API，用 `responseType: "arraybuffer"`。
- 用 `Uint8Array`、`TextEncoder` 和 `TextDecoder` 解析 multipart response；不使用 Node `Buffer` 或 `require("buffer")`。
- 更新 PTY terminal artifact 路由，返回解析出的二进制字节，带 `Content-Length`、`Content-Type` 和 attachment disposition。
- 新增专门的 service 测试，覆盖 multipart 文件抽取、multipart error parts 和 raw 非 multipart fallback。

验证：

```bash
bun --cwd packages/license-server test src/routes/agent.test.ts src/services/daytona-download.test.ts
node --test packages/nexusai-website/js/agent-chat.test.js
bunx tsc --noEmit --strict --moduleResolution bundler --module ESNext --target ES2022 --typeRoots /tmp/qcut-empty-types packages/license-server/src/services/daytona-download.ts
```

结果：

- License-server 聚焦测试：27 个通过。
- 网站 chat client 测试：18 个通过。
- 聚焦 service typecheck 通过。
- 完整 license-server typecheck 仍被现有的无关 workspace 问题阻塞：缺少隐式 `sharp` 类型和重复的 Drizzle 版本。

部署 `qcut-license-server` 和 `qcut-relay` 之后的生产 E2E：

| 步骤 | 证据 |
| --- | --- |
| Session | `c4b059cc-d8c2-480d-8c8a-0dd07950b45d` |
| Daytona sandbox | `960e6ecc-a2ea-4e00-9f9a-70c283ece3c9` |
| Relay/PTY | 对部署的 `qcut-relay` 打开了 WebSocket |
| 创建 artifact | `/tmp/qcut-output/download-check.txt` |
| Artifact 列表 | 返回了 `download-check.txt` |
| 下载路由 | 部署的 license-server 返回了 `qcut artifact download ok` |

## Follow-ups

- 决定是保留每个 Send 一次 `codex exec`，还是升级到 PTY 内部长存的交互式 Codex 进程。
- 对非常大的 terminal artifact，考虑流式或通过对象存储上传，而不是在 Worker 中缓冲 Daytona multipart response。
- 用户可见的"session 即将过期"倒计时。
- 如果空闲的 warm sandbox 变贵，加上按 session 的 credit policy。
- 加一条常规的 migration-runner 路径，避免在 Supabase CLI 缺少 DB 密码时，生产 schema 改动还要靠一次性 Cloudflare 路由。
