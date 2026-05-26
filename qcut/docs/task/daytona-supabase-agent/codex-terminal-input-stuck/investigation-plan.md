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

## Current Live Finding / 当前 live 发现

The current session did not need to be replaced to recover typing. A same-session page-level `Disconnect` followed by `Connect` restored visible input in the Codex composer.

当前 session 不需要新建就能恢复输入。对同一个 session 在页面上执行 `Disconnect`，然后 `Connect`，Codex composer 中的可见输入恢复了。

Concrete observation:

具体观察：

```text
session = 88906ab5-35ad-46e7-b97a-bf3ab4196ad4
before reconnect: connected UI, active session, focused Terminal input, typed letters did not appear
second WebSocket probe before reconnect: 409 session_already_attached
after Disconnect + Connect: same session id, Codex TUI restarted, typed "x" appeared
```

Interpretation:

判断：

- The Apple keyboard is unlikely to be the cause.
- The page/xterm can accept keyboard input after a fresh attachment.
- The failing state is probably stale attachment state, stale xterm binding, wedged relay input forwarding, wedged Daytona PTY stdin, or a stuck old Codex TUI process.
- The immediate product gap is that `connected` does not mean "input path is healthy".

- 苹果键盘不太可能是根因。
- 重新建立 attachment 后，页面/xterm 可以接收键盘输入。
- 故障状态很可能是 attachment 状态陈旧、xterm binding 陈旧、relay 输入转发卡住、Daytona PTY stdin 卡住，或旧 Codex TUI 进程卡住。
- 直接的产品缺口是：`connected` 并不等于“输入链路健康”。

This makes reconnect semantics and input-health instrumentation higher priority than creating a new session to reproduce the issue.

因此，相比新建 session 复现问题，reconnect 语义和输入健康埋点现在优先级更高。

Latest recovery status:

最新恢复状态：

```text
same session id: 88906ab5-35ad-46e7-b97a-bf3ab4196ad4
old page state: disconnected after the stale attachment closed
action: injected QCAP probe, then clicked Connect
new page state: connected
typed keys: a, b, Return
visible Codex response: What would you like me to do with ab?
history.jsonl latest entry: {"text":"ab"}
```

This confirms the current session is usable again after reconnect. It also confirms the keyboard is not the root cause and that a new server-side session is not required for recovery.

这确认了当前 session 在重连后已经恢复可用。它也确认键盘不是根因，并且恢复不需要新建 server-side session。

Additional code/log finding:

追加代码/日志发现：

- `Disconnect` + `Connect` reused the existing xterm instance and existing `onData` binding.
- The relay closed the old PTY and created a fresh Daytona PTY / Codex process.
- `history.jsonl` shows no submitted input during the stuck period.
- `codex-tui.log` shows the image task completed at `2026-05-26T04:36:14Z`, then no new `op.dispatch.user_input` before the reconnect at `2026-05-26T05:03:26Z`.
- No Codex panic or shutdown was visible in that gap.

- `Disconnect` + `Connect` 复用了现有 xterm instance 和现有 `onData` 绑定。
- relay 关闭旧 PTY，并创建新的 Daytona PTY / Codex 进程。
- `history.jsonl` 显示卡住期间没有提交成功的输入。
- `codex-tui.log` 显示图片任务在 `2026-05-26T04:36:14Z` 完成，然后直到 `2026-05-26T05:03:26Z` 重连前没有新的 `op.dispatch.user_input`。
- 这段时间没有看到 Codex panic 或 shutdown。

This narrows the next probes. We no longer need to start by asking whether the Apple keyboard works. We need to prove whether the old page sent bytes to the old socket, and whether the old relay/PTY/Codex accepted those bytes.

这进一步收窄了下一步 probe。不需要再优先怀疑苹果键盘。现在要证明的是：旧页面是否把字节发给了旧 socket，以及旧 relay/PTY/Codex 是否接收了这些字节。

Latest current-session reproduction:

最新当前 session 复现：

- A lightweight prompt pasted with `Cmd+V` briefly appeared as the macOS accessibility value of `Terminal input`.
- The pasted text did not visibly appear in the Codex composer.
- `Return` and `Ctrl+M` did not submit it.
- A later normal keypress (`z`) also did not visibly appear.
- The page still reported `connected`.
- A fresh PTY token request still succeeded and the same session remained `active`.
- A second WebSocket upgrade still returned `409 session_already_attached`.
- Codex `history.jsonl` and `codex-tui.log` still showed no new submitted user input.

- 通过 `Cmd+V` 粘贴的轻量 prompt 曾短暂出现在 macOS accessibility 的 `Terminal input` value 中。
- pasted text 没有在 Codex composer 中可见显示。
- `Return` 和 `Ctrl+M` 没有提交它。
- 随后普通按键 `z` 也没有可见显示。
- 页面仍显示 `connected`。
- 新的 PTY token 请求仍成功，同一个 session 仍是 `active`。
- 第二条 WebSocket upgrade 仍返回 `409 session_already_attached`。
- Codex `history.jsonl` 和 `codex-tui.log` 仍没有新的已提交 user input。

This first made browser/xterm input handling look suspicious, especially around paste and the hidden textarea state. A later in-page probe narrowed it further: ordinary keydown events do reach xterm's hidden textarea, and browser-side `WebSocket.send(...)` is called with one-byte terminal payloads. Relay/PTY/Codex stdin remains the highest-priority unknown until inbound relay audit proves whether those bytes arrived server-side.

这起初让 browser/xterm 输入处理看起来更可疑，尤其是 paste 和 hidden textarea 状态相关的问题。后续页面内探针进一步收窄了范围：普通 keydown event 确实到达了 xterm 隐藏 textarea，浏览器侧也确实用单字节 terminal payload 调用了 `WebSocket.send(...)`。在 relay 入站 audit 证明这些字节是否到达服务端之前，relay/PTY/Codex stdin 是优先级最高的未知点。

Latest temporary probe result:

最新临时探针结果：

```text
after "z":    document keydown +1, xterm-helper-textarea target +1, relay WebSocket send +1 byte
after Ctrl+M: document keydown +1, xterm-helper-textarea target +1, relay WebSocket send +1 byte
Codex logs:   no new op.dispatch.user_input
Codex history: no new submitted prompt
```

This means the next investigation should not spend much time asking whether the Apple keyboard, page focus, or xterm helper textarea can see keys. It should prove what happens after browser-side `WebSocket.send(...)`.

这意味着下一步排查不应继续把主要时间花在“苹果键盘、页面焦点、xterm helper textarea 是否能看到按键”上。现在要证明的是浏览器侧 `WebSocket.send(...)` 之后发生了什么。

Latest submit-key finding:

最新 submit-key 发现：

```text
composer visible text: Summarize recent commits
after Return:        browser/xterm keydown observed, WebSocket send observed
after Ctrl+M:        browser/xterm keydown observed, WebSocket send observed
Codex history:       no new submitted prompt
Codex TUI log:       no new op.dispatch.user_input
remote config:       [tui.keymap.composer] submit = ["enter", "ctrl-m", "ctrl-j"]
startup probe log:   cursor_position=false, default_colors=false, keyboard_enhancement_supported=None
```

This shifts the investigation from "does input reach xterm?" to "why does Codex TUI show composer text but not dispatch submit?". The current strongest suspects are terminal capability/probe handling and Codex TUI key interpretation after those probes time out.

这把排查重点从“input 是否到达 xterm”转移到了“为什么 Codex TUI 能显示 composer text，但不能 dispatch submit”。当前最强嫌疑是 terminal capability/probe handling，以及这些 probe 超时后 Codex TUI 对 submit key 的解释。

Latest terminal capability probe:

最新 terminal capability probe：

```text
QCAP after fresh same-session Connect:
ws=1 in=185 out=6 q=1/1/1/1 r=1 last=1b.5b.3f.31.3b.32.63

Remote Codex startup log after the same connection:
terminal startup probes completed duration_ms=99 cursor_position=false default_colors=false keyboard_enhancement_supported=None
initial cursor position probe timed out; defaulting to origin
```

Interpretation:

判断：

- The browser/xterm side saw all four tracked terminal queries.
- xterm sent at least one cursor-position response.
- Codex still reported the probes as failed or unsupported.
- This keeps terminal probe timing/parsing on the suspect list, but it is not enough to prove root cause without relay inbound audit.

- browser/xterm 侧看到了四类被跟踪的 terminal query。
- xterm 至少发送了一次 cursor-position response。
- Codex 仍然记录 probe failed 或 unsupported。
- 因此 terminal probe timing/parsing 仍在嫌疑列表中，但没有 relay 入站 audit 还不能证明根因。

Final live input probe:

最终 live input probe：

```text
typed "a": browser WebSocket sent hex 61
typed "b": browser WebSocket sent hex 62
pressed Return: browser WebSocket sent hex 0d
history.jsonl: appended text "ab"
```

This proves the fresh attachment can carry ordinary input and submit keys through to Codex. The stuck state is therefore likely attachment/PTY/TUI stateful degradation, not a permanent front-end keyboard failure.

这证明新的 attachment 可以把普通输入和 submit key 送到 Codex。卡住状态因此更像 attachment/PTY/TUI 的状态性退化，而不是永久性的前端键盘故障。

## Step 1: Add Relay Input Audit / 第一步：增加 Relay 输入审计

Add relay-side audit events in `packages/qcut-relay/src/pty-session.ts`.

在 `packages/qcut-relay/src/pty-session.ts` 中增加 relay 侧 audit event。

Current implementation status:

当前实现状态：

- Implemented in `packages/qcut-relay/src/pty-session.ts`.
- Resize/control messages emit `pty_control`.
- String and binary terminal input now go through one audited path before `pty.sendInput(...)`.
- The audited path records payload type, byte length, message count, elapsed time, provider, session id, and timeout/error state.
- `pty_input_timeout` is emitted if `sendInput` does not complete within the configured timeout.
- The audit intentionally avoids raw input content.

- 已在 `packages/qcut-relay/src/pty-session.ts` 实现。
- resize/control message 会写入 `pty_control`。
- string 和 binary terminal input 现在都会先经过同一条 audited path，再调用 `pty.sendInput(...)`。
- audited path 会记录 payload type、byte length、message count、elapsed time、provider、session id，以及 timeout/error 状态。
- 如果 `sendInput` 在配置的 timeout 内没有完成，会写入 `pty_input_timeout`。
- audit 有意避免记录原始输入内容。

This is now the highest-value next step because the current live probes already show browser-side key receipt, WebSocket sends, and same-session recovery after a fresh attachment. The missing evidence is whether input sent during the bad attachment arrives at the Durable Object and whether Daytona `pty.sendInput(...)` completes.

这是现在价值最高的下一步，因为当前 live probe 已经证明浏览器侧收到了按键并调用了 WebSocket send，也证明了同一个 session 在新 attachment 后可以恢复。缺失证据是：坏 attachment 期间发送的 input 是否到达 Durable Object，以及 Daytona `pty.sendInput(...)` 是否完成。

Record:

记录：

- when a browser WebSocket message arrives
- whether it is treated as resize, ping, or terminal input
- input byte length, never raw input
- `sendInput` start timestamp
- `sendInput` success/error/timeout
- elapsed time for `sendInput`
- current session id and provider

- 浏览器 WebSocket message 到达时间
- message 被识别为 resize、ping，还是 terminal input
- input byte length，不记录原始输入
- `sendInput` 开始时间
- `sendInput` success/error/timeout
- `sendInput` 耗时
- 当前 session id 和 provider

Also wrap string-input `sendInput` with the same defensive handling as binary input. Today, the string path effectively does:

同时给 string input 的 `sendInput` 加上和 binary input 一样的防御处理。现在 string path 实际上类似：

```ts
await sendInput?.(data);
```

That path should log failures and avoid leaving the browser in a misleadingly healthy state if `pty.sendInput(...)` throws or hangs.

如果 `pty.sendInput(...)` throw 或 hang，这条路径应该记录失败，并避免让浏览器继续处于误导性的 healthy state。

Expected interpretations:

预期判断：

- Browser sends, relay has no inbound audit: the WebSocket is half-open or the message is not reaching the Durable Object.
- Relay receives input, `sendInput` fails or times out: the Daytona PTY bridge is the suspect.
- Relay receives input, `sendInput` succeeds, composer changes but no `op.dispatch.user_input` appears: Codex TUI submit-key handling is the suspect.

- 浏览器发送了，但 relay 没有入站 audit：WebSocket 半开，或 message 没有到 Durable Object。
- relay 收到 input，但 `sendInput` 失败或超时：嫌疑点是 Daytona PTY bridge。
- relay 收到 input，`sendInput` 成功，composer 变化了但没有 `op.dispatch.user_input`：嫌疑点是 Codex TUI submit-key handling。

## Step 1.5: Probe Terminal Capability Responses / 第一点五步：探测 Terminal Capability 响应

Add a focused probe for terminal responses because Codex startup currently logs:

增加一个专门针对 terminal response 的 probe，因为当前 Codex startup 记录了：

```text
cursor_position=false
default_colors=false
keyboard_enhancement_supported=None
initial cursor position probe timed out
```

Test whether xterm.js sends responses back through `onData` when the PTY outputs terminal query sequences:

测试当 PTY 输出 terminal query sequence 时，xterm.js 是否会通过 `onData` 把 response 送回去：

- cursor position query: `ESC [ 6 n`
- primary device attributes query: `ESC [ c`
- default foreground/background color query: `OSC 10 ; ? ST` and `OSC 11 ; ? ST`
- keyboard enhancement query if Codex emits one

- cursor position query：`ESC [ 6 n`
- primary device attributes query：`ESC [ c`
- default foreground/background color query：`OSC 10 ; ? ST` 和 `OSC 11 ; ? ST`
- 如果 Codex 会发 keyboard enhancement query，也记录它

Latest result:

最新结果：

The temporary QCAP probe showed browser-side query and response activity, but the remote Codex startup log still reported probe failure. The product-level diagnostic should therefore log both outbound terminal query bytes and inbound terminal response bytes at relay level, with timestamps.

临时 QCAP 探针显示浏览器侧存在 query 和 response 活动，但远端 Codex startup log 仍记录 probe 失败。因此产品级诊断应该在 relay 层记录 PTY 输出的 terminal query bytes 和浏览器输入的 terminal response bytes，并记录时间戳。

Expected interpretations:

预期判断：

- If xterm does not answer these terminal probes, Codex starts with degraded terminal assumptions.
- If xterm answers but relay/Codex never sees the answer, the relay input path is dropping terminal-generated responses.
- If probe responses arrive but Codex still reports timeout, inspect timing and response format: the response may be delayed, malformed, or parsed after Codex gives up.

- 如果 xterm 不回答这些 terminal probe，Codex 会以 degraded terminal assumption 启动。
- 如果 xterm 回答了，但 relay/Codex 没看到，说明 relay input path 在丢 terminal-generated response。
- 如果 probe response 到达了但 Codex 仍报告 timeout，检查时序和响应格式：response 可能延迟、格式不合预期，或在 Codex 放弃之后才被解析。

## Step 2: Add Front-End Input Diagnostics / 第二步：增加前端输入诊断

Add temporary diagnostics to `packages/nexusai-website/js/agent-chat/03-terminal-job.js`.

在 `packages/nexusai-website/js/agent-chat/03-terminal-job.js` 中增加临时诊断。

Current implementation status:

当前实现状态：

- Implemented in `packages/nexusai-website/js/agent-chat/03-terminal-job.js`.
- Shared state was added in `packages/nexusai-website/js/agent-chat/01-runtime-api.js`.
- A visible debug line was added to `packages/nexusai-website/chat-agent.html`.
- The debug line reports socket sequence/state, latest input byte length/source/time, latest output byte length/time, and send/resize/socket errors.
- xterm `onData` now reports the source as `xterm` when forwarding to `sendTerminalInput`.
- The implementation avoids displaying raw terminal input.

- 已在 `packages/nexusai-website/js/agent-chat/03-terminal-job.js` 实现。
- 共享状态已加入 `packages/nexusai-website/js/agent-chat/01-runtime-api.js`。
- 可见 debug line 已加入 `packages/nexusai-website/chat-agent.html`。
- debug line 会显示 socket 序号/状态、最近 input byte length/source/time、最近 output byte length/time，以及 send/resize/socket 错误。
- xterm `onData` 现在转发给 `sendTerminalInput` 时会标记 source 为 `xterm`。
- 实现避免显示原始 terminal input。

Reason this is still useful:

为什么这一步仍然有价值：

- The live session could not be instrumented through Chrome AppleScript because JavaScript from Apple Events is disabled.
- DevTools opened, but the current Chrome UI state did not allow reliable console paste/key entry.
- The backend session is still active.
- The relay reports `session_already_attached`, so the browser attachment is still considered live.
- The temporary in-page probe proved the key parts once, but the product needs a repeatable tester-visible version.
- It should expose whether future failures stop before or after browser-side `WebSocket.send(...)`.

- live session 无法通过 Chrome AppleScript 埋点，因为 JavaScript from Apple Events 被禁用。
- DevTools 已打开，但当前 Chrome UI 状态无法可靠地向 console paste/输入。
- 后端 session 仍然 active。
- relay 返回 `session_already_attached`，说明浏览器 attachment 仍被认为 live。
- 临时页面内探针已经证明过关键路径一次，但产品需要可重复、测试者可见的版本。
- 它应该显示未来故障是停在浏览器侧 `WebSocket.send(...)` 之前还是之后。

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
- hidden textarea current value length, never raw text.
- whether a paste event was followed by an `onData` event within 500 ms.

- `#agent-terminal` 上的 `keydown`。
- `.xterm-helper-textarea` 上的 `keydown`。
- `.xterm-helper-textarea` 上的 `paste`。
- xterm `onData`。
- `sendTerminalInput()` 是否被调用。
- `terminalSocket.send(...)` 是否成功。
- `terminalSocket.readyState`。
- `document.activeElement`。
- hidden textarea 当前 value length，不记录原始文本。
- paste event 后 500 ms 内是否出现 `onData` event。

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

Also record whether the same counters reset correctly after `Disconnect` + `Connect`. The current live behavior shows reconnect can recover input, so the diagnostic panel should make it visible whether reconnect recreated all of these pieces:

同时记录 `Disconnect` + `Connect` 后这些计数器是否正确 reset。当前 live 行为显示 reconnect 可以恢复输入，因此 debug panel 应该明确显示 reconnect 是否重建了这些部分：

- WebSocket object
- xterm instance or xterm attachment binding
- `onData` disposable/listener
- terminal focus target
- relay attachment id, if available

- WebSocket object
- xterm instance 或 xterm attachment binding
- `onData` disposable/listener
- terminal focus target
- relay attachment id，如果可用

## Step 3: Add a Debug Panel / 第三步：增加调试面板

Add a hidden or query-param gated debug panel on `chat-agent.html`, for example enabled by:

在 `chat-agent.html` 中增加一个隐藏或 query-param 控制的调试面板，例如通过以下参数启用：

Current implementation status:

当前实现状态：

The first slice uses an always-visible one-line debug status instead of a full gated panel. This is intentional for the current bug because the user could not reliably type or paste into DevTools during the stuck state. A query-param panel can still be added later if the one-line signal is not enough.

第一版使用始终可见的一行 debug status，而不是完整的 query-param panel。这是针对当前 bug 的有意选择，因为卡住时用户无法可靠地在 DevTools 中输入或粘贴。如果一行信号不够，后续仍可以加 query-param panel。

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

The debug panel should explicitly show whether the xterm instance was recreated or reused across reconnect. Current code reuses it, which is useful evidence: if reconnect fixes input while xterm is reused, the panel should make that visible.

debug panel 应明确显示 xterm instance 在 reconnect 过程中是被重建还是被复用。当前代码会复用它，这是有价值的证据：如果 reconnect 修复了输入而 xterm 被复用，面板应该把这件事显示出来。

## Step 4: Add a Safe Synthetic Input Button / 第四步：增加安全的合成输入按钮

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

Live evidence from the current stuck session:

当前卡住 session 的 live 证据：

```text
POST /api/agent/sessions/88906ab5-35ad-46e7-b97a-bf3ab4196ad4/pty-token
=> 200 OK
session.status = active
providerSessionId = b583e518-9b8b-4290-bb09-df5910fb40b9

Second WebSocket upgrade with the fresh token:
=> 409 Conflict
body = session_already_attached
```

This means a reconnect feature must deliberately close or replace the existing attachment. Simply asking for another PTY token is not enough while the Durable Object still considers the old browser socket attached.

这说明 reconnect 功能必须有意识地关闭或替换已有 attachment。只请求另一个 PTY token 不够，因为 Durable Object 仍认为旧浏览器 socket attached。

Additional live result:

追加 live 结果：

```text
Page Disconnect + Connect
=> same session id remained visible
=> Codex TUI restarted
=> visible keyboard input recovered
```

This means the current implementation already has a recovery path, but it is too implicit: the UI still advertised the old broken state as `connected`, and the user had no indication that reconnect was the correct action.

这说明当前实现已经存在某种恢复路径，但它太隐式：UI 仍把旧的坏状态显示为 `connected`，用户不知道应该通过 reconnect 恢复。

Latest live result:

最新 live 结果：

```text
Old attachment eventually closed and the page showed disconnected.
Clicking Connect on the same session id created a fresh attachment.
After that, typing "ab" and Return produced a Codex turn and a history entry.
```

This means automatic detection of stale attachment and a user-visible same-session reconnect action should be treated as product requirements, not merely debug conveniences.

这说明自动检测 stale attachment，以及提供用户可见的同 session reconnect 动作，应该被当作产品需求，而不只是 debug 便利功能。

Recommended behavior:

建议行为：

- Keep `Disconnect` as a clear socket/attachment close action.
- Add an explicit `Reconnect` action that closes the current browser attachment and reopens the same active session.
- When a session is `connected` but input health is stale, show a visible recovery action instead of leaving the user guessing.
- Avoid silently creating a new session unless the user clicks `New`.

- 保留 `Disconnect` 作为明确关闭 socket/attachment 的动作。
- 增加显式 `Reconnect` 动作：关闭当前浏览器 attachment，并重新打开同一个 active session。
- 当 session 显示 `connected` 但输入健康过期时，给出可见恢复动作，不要让用户猜。
- 除非用户点击 `New`，否则不要静默创建新 session。

Important nuance:

重要细节：

The current recovery did not merely "refocus" the terminal. It closed the old WebSocket and caused the relay to kill the old PTY. The next `Connect` started a fresh PTY and fresh Codex TUI process inside the same server-side session. A product-level `Reconnect` button should be clear about this behavior: it preserves files and the active session id, but it may restart the interactive Codex process.

当前恢复不只是“重新 focus terminal”。它关闭了旧 WebSocket，并导致 relay kill 旧 PTY。下一次 `Connect` 在同一个 server-side session 里启动了新的 PTY 和新的 Codex TUI 进程。产品层面的 `Reconnect` 按钮应该清楚表达这一行为：它保留文件和 active session id，但可能会重启交互式 Codex 进程。

## Step 9: Add an Attachment Health Probe / 第九步：增加 Attachment 健康探针

Add a light-weight health probe before making reconnect decisions:

在做 reconnect 决策前，增加一个轻量 health probe：

- front-end sends a small non-user control frame, for example `{ "kind": "ping" }`
- relay replies with `{ "kind": "pong" }` without touching PTY stdin
- front-end records whether the current WebSocket still has round-trip behavior

- 前端发送一个非用户输入的 control frame，例如 `{ "kind": "ping" }`
- relay 回复 `{ "kind": "pong" }`，不触碰 PTY stdin
- 前端记录当前 WebSocket 是否仍有 round-trip 行为

Then add a separate PTY input probe only in debug mode:

然后只在 debug 模式中增加单独的 PTY input probe：

- front-end sends a short probe through the same `sendTerminalInput` path
- relay records input byte length and `sendInput` result
- do not log raw input text

- 前端通过同一个 `sendTerminalInput` 路径发送短探针
- relay 记录 input byte length 和 `sendInput` 结果
- 不记录原始输入文本

This separates "WebSocket alive" from "PTY stdin alive".

这样可以区分“WebSocket 还活着”和“PTY stdin 还活着”。

## Step 10: Add Automated Regression / 第十步：增加自动化回归

Extend `scripts/agent-chat-image-ratio-size-e2e.ts` or add a smaller dedicated terminal test.

扩展 `scripts/agent-chat-image-ratio-size-e2e.ts`，或新增一个更小的 terminal 专用测试。

Current implementation status:

当前实现状态：

- Added a page-structure assertion for the terminal debug line in `packages/nexusai-website/js/agent-chat.prompt.test.js`.
- Verified the website prompt/page tests with `node --test packages/nexusai-website/js/agent-chat.prompt.test.js`.
- Verified relay behavior with `bun run test` inside `packages/qcut-relay`.
- Verified focused formatting/lint for the changed terminal and relay logic with Biome.

- 已在 `packages/nexusai-website/js/agent-chat.prompt.test.js` 增加 terminal debug line 的页面结构断言。
- 已用 `node --test packages/nexusai-website/js/agent-chat.prompt.test.js` 验证 website prompt/page tests。
- 已在 `packages/qcut-relay` 内用 `bun run test` 验证 relay 行为。
- 已用 Biome 验证本次改动涉及的 terminal 和 relay 逻辑。

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
- Add a watchdog: if browser-side `WebSocket.send(...)` increases but relay ack/output does not follow within a short window, show a clear recovery action.

- reconnect 时重建 xterm instance 并重新绑定 `onData`。
- 显示真实 input-health 状态，而不只显示 socket `connected`。
- 增加手动 “refocus terminal” 操作，直接调用 xterm focus。
- 增加不结束 server session 的 “Reconnect current session”。
- 增加 relay input audit event。
- 增加 watchdog：如果浏览器侧 `WebSocket.send(...)` 增加了，但短时间内没有 relay ack/output，显示明确恢复动作。

Implemented fix status:

已实现修复状态：

- Done: explicit `Reconnect` button in `chat-agent.html`.
- Done: reconnect closes the current browser attachment and then reconnects to the same stored active session id.
- Done: `Connect` prefers the stored active session id before creating a new session.
- Done: relay sends `pty_input_ack`, `pty_input_error`, and `pty_input_timeout` server-control messages to the browser.
- Done: front-end parses those control messages without writing them into xterm output.
- Done: front-end has a 7-second ack watchdog after `WebSocket.send(...)`.
- Done: relay audit and browser debug avoid raw input text.

- 已完成：`chat-agent.html` 中加入显式 `Reconnect` 按钮。
- 已完成：reconnect 会关闭当前 browser attachment，然后重新连接同一个已保存的 active session id。
- 已完成：`Connect` 会优先使用已保存的 active session id，然后才创建新 session。
- 已完成：relay 会向浏览器发送 `pty_input_ack`、`pty_input_error` 和 `pty_input_timeout` server-control message。
- 已完成：前端会解析这些 control message，不会把它们写入 xterm output。
- 已完成：前端在 `WebSocket.send(...)` 后加入 7 秒 ack watchdog。
- 已完成：relay audit 和浏览器 debug 都避免记录原始输入文本。

Verification evidence:

验证证据：

```bash
node --test packages/nexusai-website/js/agent-chat.prompt.test.js
# 12 passed

cd packages/qcut-relay && bun run test
# 21 passed

bunx biome check \
  packages/nexusai-website/js/agent-chat/03-terminal-job.js \
  packages/nexusai-website/js/agent-chat/04-bootstrap.js \
  packages/qcut-relay/src/pty-session.ts \
  packages/qcut-relay/src/pty-session.test.ts \
  --max-diagnostics=120
# Checked 4 files. No fixes applied.
```

What remains for live proof after deploy:

部署后仍需做的 live proof：

- Open the Chat Agent page, connect an existing session, type one character, and confirm the debug line shows both `input #... sent` and `ack #...`.
- Reproduce or simulate a stale input path and confirm the 7-second watchdog surfaces the missing ack.
- Click `Reconnect` and confirm the same session id remains visible while a fresh PTY/Codex attachment starts.
- Submit a second prompt after reconnect and confirm `history.jsonl` gets the prompt.

- 打开 Chat Agent 页面，连接已有 session，输入一个字符，并确认 debug line 同时显示 `input #... sent` 和 `ack #...`。
- 复现或模拟 stale input path，并确认 7 秒 watchdog 会暴露 missing ack。
- 点击 `Reconnect`，确认可见 session id 保持不变，同时 fresh PTY/Codex attachment 启动。
- reconnect 后提交第二条 prompt，并确认 `history.jsonl` 写入该 prompt。

Commit and PR evidence:

Commit / PR 证据：

- Website repo `donghaozhang/nexusai-website`:
  - branch: `master`
  - commit: `4998409` (`Fix chat terminal reconnect diagnostics`)
- Main repo `Quriosity-agent/qcut`:
  - branch: `image-cli-v11`
  - commit: `9708913cf` (`Fix agent terminal reconnect diagnostics`)
  - PR: `https://github.com/Quriosity-agent/qcut/pull/311`

- Website repo `donghaozhang/nexusai-website`：
  - branch：`master`
  - commit：`4998409`（`Fix chat terminal reconnect diagnostics`）
- Main repo `Quriosity-agent/qcut`：
  - branch：`image-cli-v11`
  - commit：`9708913cf`（`Fix agent terminal reconnect diagnostics`）
  - PR：`https://github.com/Quriosity-agent/qcut/pull/311`

## Suggested First Implementation Slice / 建议第一步实现范围

Start small:

先从小范围开始：

1. Add relay inbound audit for terminal input receive, `sendInput` start, success, error, timeout, and elapsed time.
2. Add front-end counters for keydown, paste, xterm `onData`, and WebSocket send.
3. Add debug panel gated by `?debugTerminal=1`.
4. Add one debug-only direct input probe button.
5. Add an explicit `Reconnect` button that keeps the same session and reports whether xterm/socket/listeners were recreated.
6. Reproduce the issue manually and compare browser send counters with relay inbound audit.

1. 增加 relay 入站 audit：terminal input receive、`sendInput` start、success、error、timeout 和耗时。
2. 增加前端 keydown、paste、xterm `onData`、WebSocket send 计数器。
3. 增加由 `?debugTerminal=1` 控制的 debug panel。
4. 增加一个仅 debug 模式可见的 direct input probe 按钮。
5. 增加显式 `Reconnect` 按钮，保持同一个 session，并报告 xterm/socket/listener 是否被重建。
6. 手工复现问题，对比浏览器 send 计数和 relay 入站 audit。

This should identify the responsible layer before changing reconnect/session semantics.

这样可以在修改 reconnect/session 语义之前，先定位真正负责的层。
