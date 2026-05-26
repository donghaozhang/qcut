# Investigation Plan / 排查思路

Date / 日期: 2026-05-26

## Goal / 目标

Determine where terminal input is lost after the first successful Codex image-generation task:

确认第一次 Codex 图片生成任务成功后，terminal 输入到底丢在哪一层：

1. Browser keyboard / paste event.
2. xterm.js `onData`.
3. Front-end `sendTerminalInput`.
4. Browser WebSocket.
5. Cloudflare relay Durable Object.
6. Daytona PTY `sendInput`.
7. Codex TUI stdin/composer.

1. 浏览器键盘 / 粘贴事件。
2. xterm.js `onData`。
3. 前端 `sendTerminalInput`。
4. 浏览器 WebSocket。
5. Cloudflare relay Durable Object。
6. Daytona PTY `sendInput`。
7. Codex TUI stdin/composer。

## Principle / 原则

Do not rely on visual connected state alone. The terminal must expose separate health for:

不要只依赖视觉上的 connected 状态。terminal 应该分别暴露这些健康状态：

- socket open
- xterm focused
- recent keyboard event observed
- recent xterm `onData` observed
- recent WebSocket send succeeded
- recent relay input received
- recent PTY input acknowledged or echoed

- socket 是否 open
- xterm 是否 focused
- 最近是否观察到键盘事件
- 最近是否观察到 xterm `onData`
- 最近 WebSocket send 是否成功
- relay 最近是否收到 input
- PTY 最近是否确认或回显 input

## Step 1: Add Front-End Input Diagnostics / 第一步：增加前端输入诊断

Add temporary diagnostics to `packages/nexusai-website/js/agent-chat/03-terminal-job.js`.

在 `packages/nexusai-website/js/agent-chat/03-terminal-job.js` 中增加临时诊断。

Record counters and timestamps for:

记录以下计数器和时间戳：

- `keydown` on `#agent-terminal`.
- `keydown` on `.xterm-helper-textarea`.
- `paste` on `.xterm-helper-textarea`.
- xterm `onData`.
- `sendTerminalInput()` called.
- `terminalSocket.send(...)` succeeded.
- `terminalSocket.readyState`.
- `document.activeElement`.

- `#agent-terminal` 上的 `keydown`。
- `.xterm-helper-textarea` 上的 `keydown`。
- `.xterm-helper-textarea` 上的 `paste`。
- xterm `onData`。
- `sendTerminalInput()` 是否被调用。
- `terminalSocket.send(...)` 是否成功。
- `terminalSocket.readyState`。
- `document.activeElement`。

Expected interpretations:

预期判断：

- If `keydown` is missing, Chrome or page focus is not delivering keyboard events.
- If `keydown` exists but `onData` is missing, xterm.js input handling is stuck.
- If `onData` exists but `sendTerminalInput` is missing, the front-end binding is broken.
- If send is called but socket is not open, UI connected state is stale.
- If send succeeds but no terminal echo appears, investigate relay / PTY / Codex stdin.

- 如果没有 `keydown`，说明 Chrome 或页面焦点没有送达键盘事件。
- 如果有 `keydown` 但没有 `onData`，说明 xterm.js 输入处理卡住。
- 如果有 `onData` 但没有 `sendTerminalInput`，说明前端绑定断了。
- 如果调用 send 时 socket 不是 open，说明 UI 的 connected 状态过期。
- 如果 send 成功但 terminal 没有回显，继续排查 relay / PTY / Codex stdin。

## Step 2: Add a Debug Panel / 第二步：增加调试面板

Add a hidden or query-param gated debug panel on `chat-agent.html`, for example enabled by:

在 `chat-agent.html` 中增加一个隐藏或 query-param 控制的调试面板，例如通过以下参数启用：

```text
https://quriosity.com.au/chat-agent.html?debugTerminal=1
```

Show:

显示：

- active session id
- terminal socket readyState
- xterm instance exists
- xterm textarea exists
- active element tag/id/class
- terminal contains active element
- last keydown timestamp
- last paste timestamp
- last xterm `onData` timestamp
- last outbound input byte length
- last send success/error
- last relay output timestamp

- active session id
- terminal socket readyState
- xterm instance 是否存在
- xterm textarea 是否存在
- active element 的 tag/id/class
- terminal 是否包含 active element
- 最近 keydown 时间
- 最近 paste 时间
- 最近 xterm `onData` 时间
- 最近发送出去的 input byte length
- 最近 send 成功或失败信息
- 最近 relay output 时间

This lets the user and tester know what state the browser believes it is in without using DevTools.

这样用户和测试者无需打开 DevTools，也能知道浏览器认为自己处于什么状态。

## Step 3: Add a Safe Synthetic Input Button / 第三步：增加安全的合成输入按钮

Add a debug-only button that sends a harmless probe through the same production input path:

增加一个仅 debug 模式可见的按钮，通过同一条生产输入链路发送无害探针：

```text
printf 'QCUT_INPUT_PROBE\n'
```

or for Codex composer:

或者针对 Codex composer：

```text
Please reply with QCUT_INPUT_PROBE_OK only.
```

The important part is that this button should call `sendTerminalInput({ text })` directly. It helps separate user keyboard problems from WebSocket / relay / PTY problems.

关键是这个按钮应直接调用 `sendTerminalInput({ text })`。它能区分用户键盘问题和 WebSocket / relay / PTY 问题。

Interpretation:

判断方式：

- If button input works but keyboard does not, the issue is browser/xterm keyboard event handling.
- If button input also fails, the issue is socket / relay / PTY / Codex stdin.

- 如果按钮输入有效但键盘无效，问题在浏览器或 xterm 键盘事件处理。
- 如果按钮输入也失败，问题在 socket / relay / PTY / Codex stdin。

## Step 4: Instrument Relay Input / 第四步：给 Relay 输入链路加埋点

Add relay-side audit events in `packages/qcut-relay/src/pty-session.ts`:

在 `packages/qcut-relay/src/pty-session.ts` 中增加 relay 侧 audit event：

- when a browser WebSocket message arrives
- whether it is treated as resize or input
- input byte length
- whether `sendInput?.(...)` resolves or throws
- current session id and provider

- 浏览器 WebSocket message 到达时
- 该 message 被识别为 resize 还是 input
- input byte length
- `sendInput?.(...)` resolve 还是 throw
- 当前 session id 和 provider

Avoid logging raw user input. Only log sizes and event kinds.

不要记录原始用户输入，只记录长度和事件类型。

Expected interpretations:

预期判断：

- If browser diagnostics show send success but relay has no input audit, the WebSocket state is misleading or the message is not reaching the Durable Object.
- If relay receives input but `sendInput` fails, the Daytona PTY bridge is the suspect.
- If relay receives input and `sendInput` succeeds but no echo appears, Codex TUI or PTY stdin behavior is suspect.

- 如果浏览器诊断显示 send 成功，但 relay 没有 input audit，说明 WebSocket 状态有误导性，或消息没有到 Durable Object。
- 如果 relay 收到 input 但 `sendInput` 失败，嫌疑点是 Daytona PTY bridge。
- 如果 relay 收到 input 且 `sendInput` 成功，但没有回显，嫌疑点是 Codex TUI 或 PTY stdin 行为。

## Step 5: Test PTY Without Codex / 第五步：绕过 Codex 测试 PTY

Create a debug mode where the relay starts a plain shell instead of Codex:

增加一个 debug mode，让 relay 启动普通 shell，而不是 Codex：

```bash
/bin/bash -l
```

Then test:

然后测试：

```bash
echo QCUT_PTY_PROBE
```

Interpretation:

判断方式：

- If plain shell input works after a long task, Codex TUI is the likely failure point.
- If plain shell input also fails, the failure is xterm / WebSocket / relay / Daytona PTY.

- 如果普通 shell 在长任务后仍能输入，Codex TUI 是主要嫌疑。
- 如果普通 shell 也无法输入，问题在 xterm / WebSocket / relay / Daytona PTY。

## Step 6: Reproduce With a Short Task / 第六步：用短任务复现

Do not use real image generation first. Use a short command that simulates completion:

不要一开始就用真实图片生成。先用短命令模拟任务完成：

```text
Please run: echo FIRST_DONE; sleep 2; echo READY_FOR_SECOND_INPUT
```

Then try second input:

然后尝试第二次输入：

```text
Please run: echo SECOND_DONE
```

If this reproduces the stuck input state, the bug is independent of image generation.

如果这样也能复现输入卡住，说明 bug 与图片生成本身无关。

## Step 7: Reproduce With a Long Non-Provider Task / 第七步：用非 Provider 长任务复现

If the short task does not reproduce it, test a longer local-only task:

如果短任务不能复现，测试一个更长但不调用 provider 的本地任务：

```text
Please run: for i in 1 2 3 4 5; do date; sleep 20; done
```

Then send second input.

然后发送第二次输入。

Interpretation:

判断方式：

- If long local tasks reproduce it, duration or output volume may be triggering the issue.
- If only image generation reproduces it, inspect process output, progress rendering, and Codex tool/task state after provider calls.

- 如果长本地任务能复现，可能是持续时间或输出量触发问题。
- 如果只有图片生成复现，继续检查 provider 调用后的 process output、progress rendering 和 Codex tool/task 状态。

## Step 8: Check Reconnect Semantics / 第八步：检查重连语义

Review `connectAgentTerminal()` behavior.

检查 `connectAgentTerminal()` 的行为。

Current risk:

当前风险：

- The UI may show an active stored session.
- `connectAgentTerminal()` calls `ensureAgentSession()`.
- Depending on server behavior, this may create a new session rather than reconnect the existing one.
- The user needs a separate "Reconnect current session" behavior.

- UI 可能显示已有 active stored session。
- `connectAgentTerminal()` 调用 `ensureAgentSession()`。
- 取决于服务端行为，这可能创建新 session，而不是重连当前 session。
- 用户需要一个单独的“重连当前 session”行为。

Recommended split:

建议拆分：

- `Connect`: connect to stored active session if present.
- `New`: explicitly end old session and create a new one.
- `Reconnect`: close only the browser WebSocket and xterm binding, then create a new PTY attachment for the same active session if supported.

- `Connect`：如果已有 stored active session，优先连接它。
- `New`：明确结束旧 session 并创建新 session。
- `Reconnect`：只关闭浏览器 WebSocket 和 xterm 绑定，然后在支持时为同一 active session 创建新的 PTY attachment。

## Step 9: Add Automated Regression / 第九步：增加自动化回归

Extend `scripts/agent-chat-image-ratio-size-e2e.ts` or add a smaller dedicated terminal test.

扩展 `scripts/agent-chat-image-ratio-size-e2e.ts`，或新增一个更小的 terminal 专用测试。

The test should verify:

测试应验证：

- first natural-language command completes
- second input can type visible characters
- second input can submit
- second command creates a remote marker file
- third input can still type, to catch one-off recovery

- 第一条自然语言命令完成
- 第二次输入可以显示字符
- 第二次输入可以提交
- 第二条命令创建远端 marker 文件
- 第三次输入仍能显示字符，以捕捉一次性恢复的假阳性

Important: test both input methods:

重要：两种输入方式都要测：

- Playwright keyboard typing into xterm.
- Direct debug button input through `sendTerminalInput`.

- Playwright 键盘输入 xterm。
- 通过 debug 按钮直接调用 `sendTerminalInput`。

## Proposed Fix Direction / 建议修复方向

After the failing layer is identified, likely fixes are:

确认失败层后，可能的修复方向：

- Recreate xterm instance and rebind `onData` on reconnect.
- Expose real input-health status instead of only socket `connected`.
- Add a manual "refocus terminal" operation that calls xterm focus directly.
- Add "Reconnect current session" without ending the server session.
- Add relay input audit events.
- Add a watchdog: if focused terminal receives keydown but no xterm `onData`, show a clear recovery action.

- reconnect 时重建 xterm instance 并重新绑定 `onData`。
- 显示真实 input-health 状态，而不只显示 socket `connected`。
- 增加手动 “refocus terminal” 操作，直接调用 xterm focus。
- 增加不结束 server session 的 “Reconnect current session”。
- 增加 relay input audit event。
- 增加 watchdog：如果 focused terminal 收到 keydown 但没有 xterm `onData`，显示明确恢复动作。

## Suggested First Implementation Slice / 建议第一步实现范围

Start small:

先从小范围开始：

1. Add front-end counters for keydown, paste, xterm `onData`, and WebSocket send.
2. Add debug panel gated by `?debugTerminal=1`.
3. Add one debug-only direct input probe button.
4. Reproduce the issue manually and record which counter stops.

1. 增加前端 keydown、paste、xterm `onData`、WebSocket send 计数器。
2. 增加由 `?debugTerminal=1` 控制的 debug panel。
3. 增加一个仅 debug 模式可见的 direct input probe 按钮。
4. 手工复现问题，并记录是哪一个计数器停止变化。

This should identify the responsible layer before changing reconnect/session semantics.

这样可以在修改 reconnect/session 语义之前，先定位真正负责的层。
