# 生产环境 Connect Gen Smoke

日期：2026-05-17

## 目标

验证生产环境 `chat-agent.html` 的 Connect 路径在真实的 Daytona sandbox 终端上能跑通，然后从持久 Codex session 运行有代表性的 QCut 生成命令：

- `qcut gen image`
- `qcut gen video`
- `qcut gen music`

这测试的是网站托管路径，不是本地 CLI：

```text
quriosity.com.au/chat-agent.html
  -> qcut-license-server /api/agent/sessions
  -> Daytona sandbox
  -> qcut-relay /pty WebSocket
  -> 持久 Codex 终端
  -> /home/qcut/qcut 内的 qcut CLI
  -> /tmp/qcut-output
  -> license-server sandbox file API
```

## 证据

本地证据目录：

```text
output/playwright/agent-chat-production-connect-20260517-163752
output/playwright/agent-chat-production-gen-connect-20260517-163752
```

重要文件：

```text
output/playwright/agent-chat-production-connect-20260517-163752/result.json
output/playwright/agent-chat-production-connect-20260517-163752/05-artifact-visible-failed.png
output/playwright/agent-chat-production-gen-connect-20260517-163752/result.json
output/playwright/agent-chat-production-gen-connect-20260517-163752/remote-summary.md
output/playwright/agent-chat-production-gen-connect-20260517-163752/video-retry-result.json
output/playwright/agent-chat-production-gen-connect-20260517-163752/video-retry-summary.md
```

file API 观察到的生产 Daytona session：

```text
session_id: af73cd39-87ba-4665-ae97-e78742f4a621
```

## 基线 Connect E2E

命令：

```bash
bun scripts/agent-chat-e2e.ts \
  --url https://quriosity.com.au/chat-agent.html \
  --out-dir output/playwright/agent-chat-production-connect-20260517-163752 \
  --connect-timeout-ms 300000 \
  --prompt-timeout-ms 240000 \
  --artifact-timeout-ms 240000
```

结果：部分通过，然后失败。

通过：

- 页面加载，终端状态为 `disconnected`。
- 用户点击前页面保持 disconnected。
- 手动 Connect 在 Daytona PTY 中打开 Codex。
- 第一个 prompt 到达了持久 Codex session。
- Codex 执行了请求的 shell 命令并创建了：
  `/tmp/qcut-output/agent-e2e-1779061116340.txt`。

失败：

- E2E 等待 artifact 文件名出现在可见的文件浏览器，但当前文件浏览器的路径是 `/`，不是 `/tmp/qcut-output`。
- 失败原因：
  `forFunction: Timeout 240000ms exceeded`。

结论：生产环境 Connect 和命令执行都工作正常。现有 E2E 的 artifact 断言在文件浏览器切到完整 sandbox 路径浏览之后已经过时。

## Gen Smoke

远端输出目录：

```text
/tmp/qcut-output/qcut-gen-connect-1779088800762
```

Harness 结果：通过。Harness 连接到生产环境，向持久 Codex 终端发送 prompt，并通过下面的路径下载了 `summary.md`：

```text
/api/agent/sessions/:sessionId/files/download?path=/tmp/qcut-output/...
```

命令和结果：

| 命令 | 结果 | 详情 |
| --- | --- | --- |
| `qcut gen image -t ... -m flux_dev --json -o /tmp/qcut-output/qcut-gen-connect-1779088800762/image` | 通过 | Exit `0`；生成了 JPG 和 JSON。成本 `0.003`；耗时 `6.903s`。 |
| `qcut gen music -t ... --instrumental --json -o /tmp/qcut-output/qcut-gen-connect-1779088800762/music` | 通过 | Exit `0`；生成了 `output.mp3`（`3,212,649` 字节）。耗时 `117.176s`。 |
| `qcut gen video -m ltx23_fast_t2v ... -d 1s --json -o /tmp/qcut-output/qcut-gen-connect-1779088800762/video` | 失败 | Exit `1`；provider 拒绝了非法的 duration。 |

视频失败：

```text
FAL returned error: Input should be 6, 8, 10, 12, 14, 16, 18 or 20
```

失败的视频命令用了 `-d 1s`。`ltx23_fast_t2v` 不接受这个值。

## 视频重试

远端输出目录：

```text
/tmp/qcut-output/qcut-gen-video-retry-1779089310970
```

命令：

```bash
qcut gen video \
  -m ltx23_fast_t2v \
  -t "production connect smoke small blue square moving left to right on a clean white background" \
  -d 6s \
  --json \
  -o /tmp/qcut-output/qcut-gen-video-retry-1779089310970
```

结果：通过。

输出：

```text
/tmp/qcut-output/qcut-gen-video-retry-1779089310970/ltx23_fast_t2v_production-connect-smoke-small-blue-square-moving-left-to_1779089351962.mp4
```

详情：

```text
exit_code: 0
bytes: 1,885,601
cost: 0
duration: 21.763s
```

## 发现

1. 生产环境 Connect 路径在真实 Daytona PTY session 中端到端工作正常。
2. Codex 在 sandbox 中启动并能执行 QCut CLI 命令。
3. `/tmp/qcut-output` 文件可以通过生产 license-server 的 full-path file API 下载。
4. `gen image`、`gen music` 和 `gen video` 在使用合法命令参数时都成功。
5. 现有的 `scripts/agent-chat-e2e.ts` 的 artifact 断言应该更新成切换文件浏览器到 `/tmp/qcut-output`，或者直接使用 full-path file API。
6. `gen video` 的文档和帮助信息应避免暗示 `ltx23_fast_t2v` 支持任意 `1s` duration 的例子；provider 只接受固定 duration `6, 8, 10, 12, 14, 16, 18, 20`。

## 建议跟进

更新生产 E2E 的 artifact 检查，改成轮询：

```text
GET /api/agent/sessions/:sessionId/files?path=/tmp/qcut-output
```

或直接按完整路径下载：

```text
GET /api/agent/sessions/:sessionId/files/download?path=/tmp/qcut-output/<file>
```

这与当前文件浏览器模型一致，避免可见浏览器路径为 `/` 时产生误报。

## 2026-05-18 CLI 修复

视频 duration 失败现在已经在 QCut CLI 本地做了校验：

- 在没有传 `--model` 时，`create-video` 使用文档默认模型 `imarouter_seedance_2_0_fast_t2v`。
- 派发到 provider 之前，`--duration` 会按选中模型 registry 的 `durationOptions` 校验。
- `qcut gen video -t "small blue square" -d 1s --json` 现在会立刻失败，提示：
  `Invalid --duration '1s' for imarouter_seedance_2_0_fast_t2v. Supported durations: 5s, 6s, 7s, 8s, 9s, 10s.`

## 2026-05-18 视频 E2E 重测

再次对下面的页面跑了生产 Connect 视频重试 harness：

```text
https://quriosity.com.au/chat-agent.html
```

远端输出目录：

```text
/tmp/qcut-output/qcut-gen-video-retry-1779092057435
```

命令结果：

```text
status: ok
command: create-video
duration: 27.619s
cost: 0
```

生成的输出：

```text
/tmp/qcut-output/qcut-gen-video-retry-1779092057435/ltx23_fast_t2v_production-connect-smoke-small-blue-square-moving-left-to_1779092108425.mp4
```

文件大小：

```text
2,459,534 bytes
```

结论：生产 `chat-agent.html` 的 Connect -> Daytona -> Codex -> QCut 视频生成路径，在 `ltx23_fast_t2v` 用合法 duration（`6s`）时工作正常。

## 2026-05-18 部署目标

部署镜像 tag：

```text
ghcr.io/quriosity-agent/qcut-cli:seedance-fast-default-20260518-012452
ghcr.io/quriosity-agent/qcut-cli@sha256:91577894c04bbb7dbf1358f289050cc41e37b5c80291351cc85a2c931c9e673d
```

生产 `qcut-license-server` 应该把 `QCUT_IMAGE_TAG` 指向这个镜像，这样新的 Daytona session 启动时就带有 CLI 默认视频模型修复。

部署结果：

- GitHub Actions run `26022125848` 构建、推送并 smoke test 了镜像。
- 第一次把生产 `QCUT_IMAGE_TAG` 切到这个 tag 和到 digest 都让新的终端 Connect 在 `qcut-license-server` 中失败，错误是：
  `Too many subrequests by single Worker invocation`。
- 失败发生在同步从冷镜像创建新 Daytona sandbox 时。镜像本身是 OK 的；当前 Worker 调用模型扛不住冷拉 + 创建循环。
- Cloudflare 在当前套餐下拒绝了基于 Worker limits 的修复方案：
  `CPU limits are not supported for the Free plan`。
- 代码修复：`POST /api/agent/sessions/:id/pty-token` 现在启动 Daytona sandbox 时不再等待 SDK 的 `waitUntilStarted()`，而是存储 sandbox id、返回 `202 starting`，让网站重试直到 Daytona 报告 `started`。
- 生产环境应该把 `QCUT_IMAGE_TAG` 指向新 digest：
  `ghcr.io/quriosity-agent/qcut-cli@sha256:91577894c04bbb7dbf1358f289050cc41e37b5c80291351cc85a2c931c9e673d`。

## 2026-05-18 冷启动修复部署

部署了带异步 Daytona 终端启动流程的 `qcut-license-server`：

```text
Worker version: 94bb16be-f803-4fe6-9dce-ecbae0ed5122
QCUT_IMAGE_TAG: ghcr.io/quriosity-agent/qcut-cli@sha256:91577894c04bbb7dbf1358f289050cc41e37b5c80291351cc85a2c931c9e673d
```

生产 smoke 结果：

- `POST /api/agent/sessions/:id/pty-token` 首次返回 `202 starting`，并持久化 Daytona sandbox id `bc675909-fea1-49fd-8f35-dd94676a21d0`。
- 随后的 `pty-token` 轮询返回了一个 relay `ws_url`，确认 sandbox 到达了 `started`，没有撞到 Cloudflare subrequest 限制。
- 对 `https://quriosity.com.au/chat-agent.html` 的浏览器 smoke 点击了 Connect，到达终端状态 `connected`，并显示了 Codex banner。

结论：生产 Connect 现在通过轮询而不是单次长 Worker 调用来处理 Daytona 冷启动。

## 2026-05-18 完整 Chat Agent E2E

针对下面的页面跑了生产 Playwright E2E：

```text
https://quriosity.com.au/chat-agent.html
```

第一次运行在 `turn two creates an artifact` 失败：Codex 创建了 `/tmp/qcut-output/agent-e2e-1779126939719.txt`，生产 API 也返回了它，但 UI 文件面板还在浏览 `/`。修复在 website commit `2694429` 部署：默认文件面板到 `/tmp/qcut-output`，并让 `Artifacts` 按钮回到该路径。

Rerun 结果：

```text
status: passed
runId: 1779127442896
result: output/playwright/agent-chat-prod-e2e-20260518-deploy-rerun/result.json
```

通过的步骤：

- load page without auto-connect
- stay disconnected before click
- manual connect opens Codex
- turn one reaches persistent Codex
- turn two creates an artifact (`agent-e2e-1779127442896.txt`)
- artifact downloads from the web UI
- disconnect clears terminal state
- reconnect opens Codex again
