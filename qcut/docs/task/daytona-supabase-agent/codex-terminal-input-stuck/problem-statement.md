# Codex Terminal Input Stuck Problem / Codex Terminal 输入卡住问题

Date / 日期: 2026-05-26

## Summary / 摘要

The current issue is that the QCut website Chat Agent terminal can show a healthy-looking connected Codex session while the interactive input path is stale or wedged after a successful task. The same server-side session can recover after closing the old browser attachment and reconnecting.

当前问题是：QCut 网站 Chat Agent terminal 看起来仍然连接正常，但成功任务之后交互式输入链路可能进入陈旧或卡住状态。关闭旧 browser attachment 并重新连接后，同一个 server-side session 可以恢复。

This is not currently best described as a failed image generation bug. The image generation completed successfully. The failure is in the interactive terminal attachment/input path after that successful task.

这目前不应优先归类为图片生成失败问题。图片生成已经成功完成。失败点在成功任务结束后的交互式 terminal attachment/input 链路。

## Observed Behavior / 已观察到的现象

- The page shows the Daytona PTY status as `connected`.
- The Codex TUI shows an idle prompt: `gpt-5.5 default · ~/qcut`.
- The terminal area displays the Codex composer placeholder: `Use /skills to list available skills`.
- The generated image and sidecar JSON are visible in the Sandbox files list.
- Typing ordinary letters such as `a` or `b` does not show any characters in the Codex composer.
- Paste also does not appear to work.
- A system-level keypress sent through Computer Use also did not appear in the terminal.
- macOS accessibility reported the focused UI element as `Terminal input`.

- 页面显示 Daytona PTY 状态为 `connected`。
- Codex TUI 显示空闲 prompt：`gpt-5.5 default · ~/qcut`。
- terminal 区域显示 Codex composer 占位提示：`Use /skills to list available skills`。
- 生成出来的图片和 sidecar JSON 已经出现在 Sandbox files 列表中。
- 输入普通字母，例如 `a` 或 `b`，不会在 Codex composer 中显示。
- 粘贴文本似乎也无法进入 terminal。
- 通过 Computer Use 发送的系统级按键同样没有出现在 terminal 里。
- macOS 可访问性树显示当前焦点确实在 `Terminal input` 上。

## Current Interpretation / 当前判断

The session is in a partial or misleadingly healthy state:

当前 session 处于一种“部分健康”或“误导性健康”的状态：

- The output/status path is still alive enough for the page to show `connected`.
- The Codex TUI is visually rendered and appears to be waiting for input.
- The browser accessibility layer believes the xterm input field has focus.
- But the input path from keyboard or paste into xterm and onward to the PTY is not functioning.

- 输出/状态链路仍然足够健康，所以页面可以显示 `connected`。
- Codex TUI 视觉上仍然渲染正常，并且看起来在等待输入。
- 浏览器可访问性层认为 xterm 输入框已经获得焦点。
- 但是从键盘或粘贴进入 xterm，再继续送到 PTY 的输入链路没有正常工作。

This makes a pure keyboard hardware explanation unlikely. If the Apple keyboard were the root cause, system-level injected keypresses would be expected to behave differently from physical typing. They did not.

因此，纯粹的键盘硬件问题不太可能是根因。如果苹果键盘本身是根因，通过系统级注入的按键理论上应该和物理键盘表现不同。但实际没有区别。

## What This Is Probably Not / 大概率不是这些问题

The first stuck observation did not look like only an Enter-key mapping problem because ordinary letters also failed to appear. The latest current-session probe is more nuanced: text can become visible in the Codex composer, but submit keys still do not dispatch a Codex turn. So the issue may include a Codex TUI submit/key-handling layer, not just a browser focus layer.

第一次卡住时，它不像单纯的 Enter 键映射问题，因为普通字母也没有出现。但最新的当前 session probe 更细：文本可以进入并显示在 Codex composer 中，但 submit key 仍没有触发 Codex turn。因此问题可能包含 Codex TUI submit/key-handling 层，而不只是浏览器 focus 层。

This also does not look like the image provider still running. The terminal printed a successful completion message, the output files are visible, and the Codex TUI returned to an idle prompt.

这也不像图片 provider 仍在运行。terminal 已经打印了成功完成信息，输出文件已经可见，Codex TUI 也回到了空闲 prompt。

This does not look like a simple focus miss. The accessibility tree showed focus on `Terminal input`, and clicking inside the terminal did not restore character input.

这不像简单的“没有点到输入框”。可访问性树显示焦点在 `Terminal input` 上，而且重新点击 terminal 内部也没有恢复字符输入。

## Most Likely Failure Area / 最可能的故障区域

The latest live probes narrowed the failure area further than the earlier observations. The browser does receive ordinary keydown events on xterm's hidden textarea, and the page does call `WebSocket.send(...)` for those keys. A later reconnect on the same session also proved that the same browser/xterm instance can submit input again after the old attachment is closed and a fresh PTY/Codex process is created.

最新 live probe 已经把故障范围进一步缩小。浏览器确实在 xterm 的隐藏 textarea 上收到了普通 keydown event，页面也确实对这些按键调用了 `WebSocket.send(...)`。随后在同一个 session 上重连也证明：关闭旧 attachment 并创建新的 PTY/Codex 进程后，同一个浏览器/xterm instance 可以再次提交输入。

The remaining likely failure areas are:

剩下的高概率故障区域是：

1. The old browser WebSocket appears open and accepts `send(...)`, but the message is not delivered reliably to the relay Durable Object.
2. The relay receives the message, but the WebSocket message handler or Daytona `pty.sendInput(...)` is hanging or failing.
3. Daytona PTY accepts `sendInput(...)`, but the old PTY stdin stream or old Codex TUI no longer handles the bytes reliably.
4. Codex TUI receives some bytes but terminal capability/probe responses are not recognized in time, causing degraded input interpretation.
5. The UI `connected` state only reflects socket attachment, not the health of the full input and submit path.

1. 旧浏览器 WebSocket 看起来 open，并且接受 `send(...)`，但 message 没有可靠送达 relay Durable Object。
2. relay 收到了 message，但 WebSocket message handler 或 Daytona `pty.sendInput(...)` hang 住或失败。
3. Daytona PTY 接受了 `sendInput(...)`，但旧 PTY stdin stream 或旧 Codex TUI 不再可靠处理这些字节。
4. Codex TUI 收到了一部分字节，但 terminal capability/probe response 没有及时被识别，导致输入解释退化。
5. UI 的 `connected` 只反映 socket attachment，并不代表完整输入和 submit 链路健康。

## Debug Instrumentation Added / 已加入的 Debug 埋点

The current code now adds tester-visible front-end input diagnostics and relay-side PTY input audit messages. The goal is to make the next stuck state answer a concrete question: did the browser fail before sending, did the relay fail while forwarding, or did Codex receive bytes but fail to submit?

当前代码已经加入测试者可见的前端输入诊断，以及 relay 侧 PTY input audit。目标是让下一次卡住时可以回答一个具体问题：是浏览器发送前失败，还是 relay 转发时失败，还是 Codex 收到了字节但没有 submit？

Front-end changes:

前端改动：

- `chat-agent.html` now shows a small terminal debug line under the terminal.
- `03-terminal-job.js` tracks socket sequence/state, outbound input byte length, source, last send time, last output byte length, and send/resize errors.
- `01-runtime-api.js` stores the terminal debug counters shared by the terminal module.
- Raw user input text is not displayed or logged; only byte counts, source labels, timestamps, and state are shown.

- `chat-agent.html` 现在在 terminal 下方显示一行小型 terminal debug 信息。
- `03-terminal-job.js` 会记录 socket 序号/状态、发出 input 的 byte length、来源、最近发送时间、最近 output byte length，以及 send/resize 错误。
- `01-runtime-api.js` 保存 terminal module 共享的 debug counters。
- 不显示也不记录原始用户输入内容；只显示 byte count、来源标签、时间戳和状态。

Relay changes:

Relay 改动：

- `pty-session.ts` now audits browser control frames such as resize as `pty_control`.
- Terminal input is wrapped with timing and timeout handling before calling Daytona `pty.sendInput(...)`.
- Successful terminal input emits aggregated `pty_input` audit events with payload type, byte counts, message counts, elapsed time, provider, and session id.
- Failed or timed-out input emits `pty_input_error` or `pty_input_timeout`.
- Raw input bytes are never written to audit logs.

- `pty-session.ts` 现在会把 resize 等 browser control frame 记录为 `pty_control`。
- terminal input 在调用 Daytona `pty.sendInput(...)` 前增加耗时和 timeout 处理。
- 成功的 terminal input 会聚合写入 `pty_input` audit event，包含 payload type、byte count、message count、elapsed time、provider 和 session id。
- 失败或超时的 input 会写入 `pty_input_error` 或 `pty_input_timeout`。
- audit log 永远不写原始输入字节。

## Related Code Paths / 相关代码路径

- Front-end terminal creation and input forwarding:
  - `packages/nexusai-website/js/agent-chat/03-terminal-job.js`
  - `ensureTerminalRenderer()`
  - `terminalInstance.onData((data) => sendTerminalInput({ text: data }))`
  - `sendTerminalInput({ text })`

- Relay PTY bridge:
  - `packages/qcut-relay/src/pty-session.ts`
  - Browser WebSocket message handler
  - `sendInput?.(data)`
  - Daytona `sandbox.process.createPty(...)`

- Codex startup configuration:
  - `buildCodexStartupCommand(...)`
  - per-session `CODEX_HOME`
  - TUI keymap block for composer submit

- 前端 terminal 创建和输入转发：
  - `packages/nexusai-website/js/agent-chat/03-terminal-job.js`
  - `ensureTerminalRenderer()`
  - `terminalInstance.onData((data) => sendTerminalInput({ text: data }))`
  - `sendTerminalInput({ text })`

- Relay PTY 桥接：
  - `packages/qcut-relay/src/pty-session.ts`
  - 浏览器 WebSocket message handler
  - `sendInput?.(data)`
  - Daytona `sandbox.process.createPty(...)`

- Codex 启动配置：
  - `buildCodexStartupCommand(...)`
  - per-session `CODEX_HOME`
  - composer submit 的 TUI keymap 配置块

## Evidence Captured / 已捕获证据

The active browser session showed:

当前浏览器 session 显示：

- URL: `https://quriosity.com.au/chat-agent.html`
- Session: `88906ab5-35ad-46e7-b97a-bf3ab4196ad4`
- Terminal status: `connected`
- Focused element: `Terminal input`
- Visible output image:
  - `/tmp/qcut-output/gpt_image_2_ima_a-fashion-editorial-photograph-of-a-supermodel-walking-down_1779770166619.png`
- Visible JSON:
  - `/tmp/qcut-output/gpt_image_2_ima_a-fashion-editorial-photograph-of-a-supermodel-walking-down_1779770166619.json`

Additional live probes on the same session:

对同一个 session 做的追加 live probe：

- macOS accessibility showed `Terminal input` as the focused UI element before the DevTools experiments.
- System-level keypresses sent to Chrome did not appear in the Codex composer.
- Chrome AppleScript page inspection was blocked because `Allow JavaScript from Apple Events` was disabled.
- A current-session PTY token request succeeded:
  - Endpoint: `POST https://qcut-license-server.zdhpeter.workers.dev/api/agent/sessions/88906ab5-35ad-46e7-b97a-bf3ab4196ad4/pty-token`
  - Result: HTTP `200`
  - Session status: `active`
  - Provider session id: `b583e518-9b8b-4290-bb09-df5910fb40b9`
- A second WebSocket upgrade attempt using that fresh PTY token was rejected by the relay:
  - Result: HTTP `409 Conflict`
  - Body: `session_already_attached`

- DevTools / Console was opened as a fallback injection path, but Chrome's current UI state did not allow reliable paste or key entry into the console prompt. This did not reset the session, but it prevented deeper in-page instrumentation on the live tab.

- macOS 可访问性在 DevTools 实验前显示焦点位于 `Terminal input`。
- 发送给 Chrome 的系统级按键没有出现在 Codex composer 中。
- Chrome AppleScript 页面检查被阻止，因为 `Allow JavaScript from Apple Events` 未开启。
- 对当前 session 请求 PTY token 成功：
  - Endpoint: `POST https://qcut-license-server.zdhpeter.workers.dev/api/agent/sessions/88906ab5-35ad-46e7-b97a-bf3ab4196ad4/pty-token`
  - 结果：HTTP `200`
  - Session 状态：`active`
  - Provider session id：`b583e518-9b8b-4290-bb09-df5910fb40b9`
- 使用新的 PTY token 尝试第二条 WebSocket upgrade 被 relay 拒绝：
  - 结果：HTTP `409 Conflict`
  - Body：`session_already_attached`

- 作为 fallback 打开了 DevTools / Console，但 Chrome 当前 UI 状态无法可靠地把 paste 或按键送入 console prompt。这没有 reset session，但阻止了对 live tab 做更深的页面内埋点。

## Updated Narrowing / 最新缩小范围

The backend session lifecycle is not the immediate failure:

后端 session 生命周期不是直接故障点：

- license-server still sees the session as `active`.
- The Daytona sandbox provider session id still exists.
- The relay Durable Object still thinks one browser attachment is active.
- The relay refuses a second attachment with `session_already_attached`.

- license-server 仍认为 session 是 `active`。
- Daytona sandbox provider session id 仍然存在。
- relay Durable Object 仍认为已有一个浏览器 attachment 处于 active。
- relay 用 `session_already_attached` 拒绝了第二个 attachment。

Therefore the bug is narrower than "the session disconnected". It is most likely inside the currently attached browser-to-relay-to-PTY path after the browser calls `WebSocket.send(...)`:

因此，这个 bug 已经比“session 断了”更窄。它最可能位于当前已 attach 的 browser-to-relay-to-PTY 链路中，并且发生在浏览器调用 `WebSocket.send(...)` 之后：

- WebSocket `send` succeeds locally but the existing relay attachment does not receive the bytes,
- or relay receives the bytes but `pty.sendInput(...)` fails or hangs,
- or `pty.sendInput(...)` succeeds but Daytona PTY / Codex TUI stdin is wedged.

- WebSocket `send` 在本地成功，但现有 relay attachment 没有收到字节，
- 或 relay 收到字节，但 `pty.sendInput(...)` 失败或 hang 住，
- 或 `pty.sendInput(...)` 成功，但 Daytona PTY / Codex TUI stdin 卡住。

## Reconnect Probe Result / 重连探针结果

After preserving the same active session id, clicking `Disconnect` and then `Connect` on the page recovered typing in the terminal. A single-character probe, `x`, appeared in the Codex composer after reconnect.

在保留同一个 active session id 的前提下，点击页面上的 `Disconnect`，再点击 `Connect`，terminal 输入恢复了。重连后发送单字符探针 `x`，该字符出现在了 Codex composer 中。

Observed state after reconnect:

重连后的观察状态：

- Session id remained `88906ab5-35ad-46e7-b97a-bf3ab4196ad4`.
- The page returned to `connected`.
- Codex TUI restarted and showed `OpenAI Codex (v0.133.0)`.
- The terminal accepted visible keyboard input again.

- Session id 仍然是 `88906ab5-35ad-46e7-b97a-bf3ab4196ad4`。
- 页面恢复为 `connected`。
- Codex TUI 重新启动，并显示 `OpenAI Codex (v0.133.0)`。
- terminal 再次可以接收并显示键盘输入。

This strongly suggests the Apple keyboard is not the root cause. It also suggests the browser page can receive input when the terminal attachment is freshly established.

这强烈说明苹果键盘不是根因。同时也说明，在 terminal attachment 重新建立后，浏览器页面本身是可以接收输入的。

The failure is now best described as a stale or wedged attachment/input path:

现在更准确的故障描述是：attachment 或输入链路进入了陈旧/卡住状态：

- Before reconnect, the UI said `connected`, the session was active, and the relay refused a second WebSocket with `session_already_attached`, but typed characters did not reach the composer.
- After reconnect, the same session accepted typed input again.

- 重连前，UI 显示 `connected`，session 是 active，relay 也用 `session_already_attached` 拒绝第二条 WebSocket，但输入字符无法进入 composer。
- 重连后，同一个 session 又可以接收输入。

This points away from permanent server session failure and toward one of these temporary-state failures:

这使问题进一步远离“server session 永久失败”，并指向以下临时状态问题之一：

- the old browser WebSocket looked attached but no longer had a working input path,
- the old xterm binding stopped forwarding input,
- the old relay attachment or Daytona PTY stdin path was wedged,
- or the old Codex TUI process was visually idle but stopped accepting stdin.

- 旧浏览器 WebSocket 看起来 attached，但输入路径已经不可用，
- 旧 xterm binding 停止转发输入，
- 旧 relay attachment 或 Daytona PTY stdin 路径卡住，
- 或旧 Codex TUI 进程视觉上空闲，但不再接收 stdin。

## Code and Log Evidence / 代码与日志证据

The recovery path gives an important clue. In the current front-end code, `Disconnect` + `Connect` does not recreate the xterm instance:

恢复路径提供了一个重要线索。在当前前端代码中，`Disconnect` + `Connect` 不会重建 xterm instance：

- `ensureTerminalRenderer()` returns early when `terminalInstance` already exists.
- `terminalInstance.onData((data) => sendTerminalInput({ text: data }))` is bound only when the xterm instance is first created.
- `disconnectAgentTerminal()` closes the current WebSocket, clears `terminalSocket`, updates UI status, and calls `resetTerminalOutput(...)`.
- On reconnect, the same xterm instance is reused, but a fresh WebSocket / relay attachment is created.

- `ensureTerminalRenderer()` 在 `terminalInstance` 已存在时会直接返回。
- `terminalInstance.onData((data) => sendTerminalInput({ text: data }))` 只在 xterm instance 首次创建时绑定。
- `disconnectAgentTerminal()` 会关闭当前 WebSocket，清空 `terminalSocket`，更新 UI 状态，并调用 `resetTerminalOutput(...)`。
- 重连时复用同一个 xterm instance，但会创建新的 WebSocket / relay attachment。

The relay-side code then creates a fresh Daytona PTY and starts Codex again:

relay 侧代码随后会创建新的 Daytona PTY，并重新启动 Codex：

- `PtySession.fetch()` rejects a second concurrent browser attachment with `session_already_attached`.
- On WebSocket close, the relay calls `closePty?.()` and then clears `this.attached`.
- For Daytona, reconnect calls `sandbox.process.createPty(...)` again with a new `buildDaytonaPtyId(...)` nonce.
- The startup command launches a new `codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen -C /home/qcut/qcut` process.

- `PtySession.fetch()` 会用 `session_already_attached` 拒绝第二个并发 browser attachment。
- WebSocket close 时，relay 调用 `closePty?.()`，然后清除 `this.attached`。
- 对 Daytona 来说，重连会再次调用 `sandbox.process.createPty(...)`，并通过 `buildDaytonaPtyId(...)` 生成新的 nonce。
- 启动命令会启动新的 `codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen -C /home/qcut/qcut` 进程。

Therefore, the fact that reconnect recovered input while reusing the same xterm instance makes a broken Apple keyboard or permanently broken xterm `onData` listener less likely. It points more strongly at the old WebSocket / relay attachment / Daytona PTY / old Codex TUI process.

因此，重连复用同一个 xterm instance 却恢复了输入，这使“苹果键盘坏了”或“xterm `onData` listener 永久坏了”的可能性降低。更强的嫌疑点是旧 WebSocket / relay attachment / Daytona PTY / 旧 Codex TUI 进程。

Additional sandbox evidence:

追加 sandbox 证据：

- `history.jsonl` contains exactly three submitted prompts for this Codex home:
  - the earlier image ratio/size E2E prompt,
  - the earlier second-input E2E prompt,
  - the later manual 16:9 supermodel image prompt.
- The failed `a`, `b`, and paste attempts did not become Codex history entries.
- `codex-tui.log` shows the manual image turn completed at `2026-05-26T04:36:14Z`.
- There is then no new `op.dispatch.user_input` before the reconnect at `2026-05-26T05:03:26Z`.
- The log does not show a Codex panic or shutdown during that idle gap.
- Reconnect started a new Codex TUI thread after `2026-05-26T05:03:26Z`.

- `history.jsonl` 中只有三条已提交 prompt：
  - 之前的图片比例/尺寸 E2E prompt，
  - 之前的 second-input E2E prompt，
  - 后来的手动 16:9 supermodel 图片 prompt。
- 失败的 `a`、`b` 和 paste 尝试没有成为 Codex history entry。
- `codex-tui.log` 显示手动图片任务在 `2026-05-26T04:36:14Z` 完成。
- 从那之后直到 `2026-05-26T05:03:26Z` 重连前，没有新的 `op.dispatch.user_input`。
- 这段 idle gap 里日志没有显示 Codex panic 或 shutdown。
- 重连后在 `2026-05-26T05:03:26Z` 之后启动了新的 Codex TUI thread。

## Current Reproduction After Reconnect / 重连后的当前复现

After reconnect restored single-character input once, a later lightweight paste-based probe reproduced the stuck state without starting a new session:

重连曾经恢复过一次单字符输入；随后一次轻量 paste probe 在不新建 session 的情况下复现了卡住状态：

1. The page was still on session `88906ab5-35ad-46e7-b97a-bf3ab4196ad4`.
2. Status still showed `connected`.
3. The focused UI element was `Terminal input`.
4. A prompt was put on the macOS clipboard and pasted with `Cmd+V`.
5. macOS accessibility briefly showed the pasted text as the value of `Terminal input`.
6. The Codex composer did not visibly update with that pasted prompt.
7. Pressing `Return` and `Ctrl+M` did not create a Codex submission.
8. Pressing a normal key (`z`) afterward did not visibly appear in the composer.
9. A fresh PTY token request still returned HTTP `200`, session `active`, provider `daytona`, provider session `b583e518-9b8b-4290-bb09-df5910fb40b9`.
10. A second WebSocket upgrade using that fresh token still returned HTTP `409 Conflict` with `session_already_attached`.
11. `history.jsonl` still did not contain the pasted lightweight prompt.
12. `codex-tui.log` still did not show a new `op.dispatch.user_input` after the reconnect startup.

1. 页面仍处于 session `88906ab5-35ad-46e7-b97a-bf3ab4196ad4`。
2. 状态仍显示 `connected`。
3. 焦点 UI element 仍是 `Terminal input`。
4. 通过 macOS clipboard 和 `Cmd+V` 粘贴了一个 prompt。
5. macOS accessibility 曾短暂显示 pasted text 是 `Terminal input` 的 value。
6. Codex composer 视觉上没有显示这段 pasted prompt。
7. 按 `Return` 和 `Ctrl+M` 都没有形成 Codex submission。
8. 随后按普通键 `z` 也没有在 composer 中显示。
9. 重新请求 PTY token 仍返回 HTTP `200`，session `active`，provider `daytona`，provider session `b583e518-9b8b-4290-bb09-df5910fb40b9`。
10. 使用新 token 尝试第二条 WebSocket upgrade 仍返回 HTTP `409 Conflict` 和 `session_already_attached`。
11. `history.jsonl` 仍没有出现该 pasted lightweight prompt。
12. `codex-tui.log` 在 reconnect startup 之后仍没有新的 `op.dispatch.user_input`。

This reproduction initially made the browser/xterm side suspicious because the pasted text reached the hidden terminal input element from macOS accessibility's point of view, but it did not become visible Codex composer state and did not become a submitted Codex turn. The later in-page probe narrowed that further: ordinary keys do reach xterm's helper textarea and do trigger browser-side WebSocket sends.

这次复现一开始让 browser/xterm 侧显得很可疑，因为站在 macOS accessibility 的角度，pasted text 到达了隐藏的 terminal input element；但它没有变成可见的 Codex composer 状态，也没有变成一次已提交的 Codex turn。后续页面内探针进一步收窄了范围：普通按键确实到达 xterm helper textarea，也确实触发了浏览器侧 WebSocket send。

## Latest In-Page Probe / 最新页面内探针

A non-reloading bookmarklet-style probe was injected into the currently stuck page. It wrapped `WebSocket.prototype.send` and counted document keyboard/paste events, events targeting `.xterm-helper-textarea`, and WebSocket sends whose URL includes `qcut-relay`.

随后在当前卡住的页面中注入了一个不刷新页面的 bookmarklet 风格探针。它包装了 `WebSocket.prototype.send`，并统计 document keyboard/paste event、目标为 `.xterm-helper-textarea` 的 event，以及 URL 包含 `qcut-relay` 的 WebSocket send。

Probe counters after the stuck-state tests:

卡住状态测试后的探针计数：

```text
initial:       dk=0 bi=0 inp=0 p=0 xt=0 ws=1 val=0 last=ws:3
after "z":     dk=1 bi=0 inp=0 p=0 xt=1 ws=2 val=0 last=ws:1
after Ctrl+M:  dk=2 bi=0 inp=0 p=0 xt=2 ws=3 val=0 last=ws:1
later read:    dk=2 bi=0 inp=0 p=0 xt=2 ws=5 val=0 last=ws:3
```

Legend:

说明：

- `dk`: document `keydown` count.
- `bi`: `beforeinput` count.
- `inp`: `input` count.
- `p`: `paste` count.
- `xt`: events targeting `.xterm-helper-textarea`.
- `ws`: wrapped `WebSocket.send(...)` calls for the relay socket.
- `val`: hidden textarea value length.
- `last`: most recent event/send; `ws:1` means a one-character terminal payload.

- `dk`：document `keydown` 计数。
- `bi`：`beforeinput` 计数。
- `inp`：`input` 计数。
- `p`：`paste` 计数。
- `xt`：目标为 `.xterm-helper-textarea` 的事件数。
- `ws`：relay socket 上被包装捕获的 `WebSocket.send(...)` 次数。
- `val`：隐藏 textarea 的 value length。
- `last`：最近一次事件或 send；`ws:1` 表示一个单字符 terminal payload。

This is the strongest evidence so far:

这是目前最强的证据：

- The keypress reached the browser document.
- The event target was xterm's hidden textarea.
- The front-end sent a one-byte payload to the relay WebSocket for both `z` and `Ctrl+M`.
- The Codex composer still did not visibly change.
- `history.jsonl` and `codex-tui.log` still showed no new submitted user input.

- 按键到达了浏览器 document。
- 事件目标是 xterm 的隐藏 textarea。
- 前端对 `z` 和 `Ctrl+M` 都向 relay WebSocket 发送了一个 1 byte payload。
- Codex composer 仍然没有可见变化。
- `history.jsonl` 和 `codex-tui.log` 仍然没有新的已提交 user input。

## Latest Submit-Key Probe / 最新 Submit 键探针

Continuing with the same active session and without creating a new session, the visible state changed again: the Codex composer showed the text `Summarize recent commits`.

继续使用同一个 active session，且没有新建 session 后，可见状态又发生了变化：Codex composer 中显示了 `Summarize recent commits`。

Then two submit-key probes were sent:

随后发送了两个 submit-key probe：

```text
before Return:     title probe roughly dk=2 xt=2 ws=12
after Return:      dk=3 xt=3 ws=14 last=ws:1
after Ctrl+M:      dk=4 xt=4 ws=17 last=ws:1
history.jsonl:     still only the original three prompts
codex-tui.log:     still no new op.dispatch.user_input after 2026-05-26T05:03:27Z
wrangler tail:     no relay error output observed during the probe
```

Important interpretation:

重要判断：

- The session is not simply unable to receive characters.
- At least one pending/pasted prompt became visible in the Codex composer.
- Return and Ctrl+M both reached the browser/xterm path and triggered WebSocket sends.
- Neither key produced a Codex `op.dispatch.user_input`.
- Therefore the current failure is best described as "composer text can exist, but submit does not dispatch".

- 当前 session 并不是简单地完全收不到字符。
- 至少有一条 pending/pasted prompt 已经在 Codex composer 中可见。
- Return 和 Ctrl+M 都到达 browser/xterm 路径，并触发了 WebSocket send。
- 两个键都没有产生 Codex `op.dispatch.user_input`。
- 因此，当前故障更准确地描述为：“composer text 可以存在，但 submit 没有 dispatch”。

Additional configuration evidence:

追加配置证据：

- Current remote `CODEX_HOME` is `/home/qcut/.qcut-codex-home/88906ab5-35ad-46e7-b97a-bf3ab419`.
- Its `config.toml` contains:

```toml
[tui.keymap.composer]
submit = ["enter", "ctrl-m", "ctrl-j"]

[tui.keymap.editor]
insert_newline = ["shift-enter"]
```

- The same keymap shape is accepted by local Codex `0.133.0` with `--strict-config`; it is not rejected as an unknown config.
- Remote Codex startup logged:

```text
terminal startup probes completed duration_ms=99 cursor_position=false default_colors=false keyboard_enhancement_supported=None
initial cursor position probe timed out; defaulting to origin
```

- 当前远端 `CODEX_HOME` 是 `/home/qcut/.qcut-codex-home/88906ab5-35ad-46e7-b97a-bf3ab419`。
- 它的 `config.toml` 包含：

```toml
[tui.keymap.composer]
submit = ["enter", "ctrl-m", "ctrl-j"]

[tui.keymap.editor]
insert_newline = ["shift-enter"]
```

- 同样的 keymap 结构被本机 Codex `0.133.0` 的 `--strict-config` 接受；它不是未知配置。
- 远端 Codex startup 记录了：

```text
terminal startup probes completed duration_ms=99 cursor_position=false default_colors=false keyboard_enhancement_supported=None
initial cursor position probe timed out; defaulting to origin
```

This makes a terminal capability/probe mismatch and Codex TUI submit-key handling the strongest current suspects. The relay still needs inbound audit to prove exact delivery, but the visible composer text shows that at least some stdin bytes are reaching Codex TUI.

这使 terminal capability/probe mismatch 和 Codex TUI submit-key handling 成为当前最强嫌疑。relay 仍需要入站 audit 来证明精确送达情况，但可见的 composer 文本说明至少有一部分 stdin 字节已经到达 Codex TUI。

## Final Live Probe Result / 最终 Live 探针结果

After the old attachment naturally closed and the page showed `disconnected`, a non-reloading terminal-capability probe was injected before pressing `Connect` again on the same session id.

旧 attachment 自然关闭、页面显示 `disconnected` 后，在不刷新页面的情况下先注入 terminal capability 探针，然后对同一个 session id 再次点击 `Connect`。

Probe counters after the fresh connection:

新连接后的探针计数：

```text
QCAP ws=1 in=185 out=6 q=1/1/1/1 r=1 last=1b.5b.3f.31.3b.32.63
remote codex-tui.log:
terminal startup probes completed duration_ms=99 cursor_position=false default_colors=false keyboard_enhancement_supported=None
initial cursor position probe timed out; defaulting to origin
```

Interpretation:

判断：

- The browser received Codex terminal capability queries.
- xterm sent at least one cursor-position response back through the WebSocket path.
- Codex still logged the startup probes as failed or unsupported.
- Therefore the probe failure is not simply "browser never answers"; timing, response format, PTY delivery, or Codex-side parsing still needs relay-side audit.

- 浏览器收到了 Codex 的 terminal capability query。
- xterm 至少通过 WebSocket 路径回发了一次 cursor-position response。
- Codex 仍然把 startup probe 记录为失败或 unsupported。
- 因此 probe failure 不是简单的“浏览器完全没有回答”；仍需要 relay 侧 audit 来确认时序、响应格式、PTY 传递或 Codex 侧解析问题。

A small input test then confirmed the current session is usable again:

随后一个小输入测试确认当前 session 已经恢复可用：

```text
typed: a
typed: b
typed: Return
Codex visible output: What would you like me to do with ab?
history.jsonl latest entry: {"text":"ab"}
```

This proves the same active session id can recover without creating a new server-side session. It also proves the keyboard is not the root cause.

这证明不创建新的 server-side session，同一个 active session id 也可以恢复。它同时证明键盘不是根因。

The current best-supported conclusion is:

当前最有证据支持的结论是：

The terminal attachment can stay visually connected while the old input path is not healthy. The best-supported root area is stale/wedged browser WebSocket attachment, relay/Daytona PTY stdin, or old Codex TUI terminal-input state after a completed task. Terminal capability probe handling is still suspicious because the browser/xterm response was observed while Codex still reported probe failure. Relay inbound audit is still needed to prove exact byte delivery and timing.

terminal attachment 可以在视觉上保持 connected，但旧输入链路并不健康。当前最有证据支持的根因区域是：browser WebSocket attachment 陈旧/卡住、relay/Daytona PTY stdin 卡住，或旧 Codex TUI 在完成任务后的 terminal-input 状态异常。terminal capability probe handling 仍然可疑，因为已经观察到浏览器/xterm 回答过 probe，但 Codex 仍记录 probe 失败。relay 入站 audit 仍然需要补上，用来证明精确的字节送达和时序。

## Immediate Risk / 直接风险

The user can lose confidence because the UI says connected and ready while the terminal cannot accept input. This is worse than a clean disconnect because the visible state suggests the user should be able to keep working.

这个问题会严重影响用户信心，因为 UI 显示已经连接且可继续使用，但 terminal 实际无法接收输入。这比明确断开连接更糟，因为可见状态会误导用户继续尝试。

The current safest recovery is to preserve/download needed artifacts first, then use `Disconnect` + `Connect` to create a fresh attachment for the same active session. Starting a new session is not necessary unless reconnect fails. However, that is a workaround, not a fix.

当前最安全的恢复方式是先保留或下载需要的 artifact，然后用 `Disconnect` + `Connect` 为同一个 active session 创建新的 attachment。除非重连失败，否则不需要新建 session。但这只是 workaround，不是根本修复。

## Implemented Fix / 已实现修复

Date / 日期: 2026-05-26

The implementation now turns the proven recovery path into an explicit product action and adds input-path evidence instead of relying on the visual `connected` state.

当前实现已经把有证据证明有效的恢复路径变成明确的产品动作，并且加入输入链路证据，不再只依赖视觉上的 `connected` 状态。

- Added a visible `Reconnect` button next to `Connect` and `Disconnect`.
- `Reconnect` closes the current browser WebSocket attachment, waits for it to close, and then opens a fresh PTY attachment for the same stored active session.
- `Connect` now prefers the stored active session id before creating a new session, so reconnect-style recovery preserves the server-side session and files.
- Relay now sends browser-readable `pty_input_ack`, `pty_input_error`, and `pty_input_timeout` control messages after terminal input is forwarded to `pty.sendInput(...)`.
- The browser debug line now shows input send state, relay ack state, output state, and stale-input errors.
- If browser-side input is sent but no relay ack arrives within 7 seconds, the UI reports that the input path is stale and points the user to `Reconnect`.
- Relay audit still records `pty_input`, `pty_input_error`, and `pty_input_timeout` without logging raw terminal input.

- 新增了可见的 `Reconnect` 按钮，位置在 `Connect` 和 `Disconnect` 旁边。
- `Reconnect` 会关闭当前 browser WebSocket attachment，等待它关闭，然后为同一个已保存的 active session 打开新的 PTY attachment。
- `Connect` 现在会优先复用已保存的 active session id，然后才创建新 session，因此 reconnect 式恢复会保留 server-side session 和文件。
- relay 现在会在 terminal input 转发给 `pty.sendInput(...)` 后，向浏览器发送可识别的 `pty_input_ack`、`pty_input_error` 和 `pty_input_timeout` control message。
- 浏览器 debug line 现在显示 input send 状态、relay ack 状态、output 状态，以及 stale-input 错误。
- 如果浏览器侧 input 已发送但 7 秒内没有收到 relay ack，UI 会提示 input path stale，并指向 `Reconnect`。
- relay audit 仍然记录 `pty_input`、`pty_input_error` 和 `pty_input_timeout`，但不记录原始 terminal input。

This does not claim to prove the internal Codex TUI root cause. It fixes the user-visible stuck state by detecting the unhealthy input path and providing an explicit same-session recovery action. Final production E2E also proved that a second terminal input works after real image generation, and that input still works after explicit `Reconnect`.

这并不声称已经证明 Codex TUI 内部根因。它修复的是用户可见的卡住状态：检测不健康的输入链路，并提供明确的同 session 恢复动作。最终生产 E2E 也证明了真实图片生成之后第二次 terminal 输入可以继续工作，并且显式 `Reconnect` 之后输入仍可工作。

## Follow-up Fixes / 后续修复

Date / 日期: 2026-05-26

After the initial implementation, three additional fixes were applied to keep the recovery path reliable and to address a concurrency review on the relay audit code.

初次实现之后，又应用了三个修复，用来保持恢复路径可靠，并处理 relay audit 代码上的一条并发评审。

- Relay: `sendInputWithAudit` now mutates a shared `PtyInputAuditStats` object synchronously after each `await`, instead of taking a snapshot and writing back via callback. This removes a race in `inputAuditBytes` / `inputAuditMessages` accumulation when multiple terminal input messages were forwarded concurrently. (Gemini PR #311 review.)
- Website: `shouldCreateFreshTerminalSession` now also treats `session_not_found` as a stale session and falls back to a new session.
- Website: `connectAgentTerminal` resets `terminalInputSequence` and `terminalLastAckedInputId` on each reconnect so the 7-second ack watchdog does not flag pre-reconnect input ids as stale.
- Production E2E: the final run passed the image-generation workflow, the second input after image generation, explicit same-session `Reconnect`, post-reconnect input, and artifact download.

- relay：`sendInputWithAudit` 在每次 `await` 之后会同步修改一个共享的 `PtyInputAuditStats` 对象，而不再使用“快照 + callback 回写”。这消除了多条 terminal input 并发转发时，`inputAuditBytes` / `inputAuditMessages` 累加上的 race。（来自 Gemini 对 PR #311 的评审。）
- 网站：`shouldCreateFreshTerminalSession` 现在也把 `session_not_found` 视为 stale session，并 fallback 到新建 session。
- 网站：`connectAgentTerminal` 在每次重连时会重置 `terminalInputSequence` 和 `terminalLastAckedInputId`，避免 7 秒 ack watchdog 把重连前的 input id 误判为 stale。
- 生产 E2E：最终运行通过了 image-generation workflow、图片生成后的第二次输入、显式同 session `Reconnect`、reconnect 后输入，以及 artifact download。

Final production evidence:

最终生产证据：

```text
result: output/playwright/agent-chat-e2e-2026-05-26T07-00-24-883Z/result.json
status: passed
image generation: passed in 112895ms
second input after image: passed in 5748ms
explicit reconnect: passed in 3683ms, same session id 3c07f57f-43bd-44ab-85fd-4e2bd24123b3
input after reconnect: passed in 10883ms
debug ack examples: input #465 / ack #465, input #663 / ack #663, input #186 / ack #186
```
