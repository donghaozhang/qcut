# Codex Terminal Input Stuck Problem / Codex Terminal 输入卡住问题

Date / 日期: 2026-05-26

## Summary / 摘要

The current issue is that the QCut website Chat Agent terminal can show a healthy-looking connected Codex session, but user input no longer reaches the terminal after the first successful image generation.

当前问题是：QCut 网站 Chat Agent terminal 看起来仍然连接正常，Codex session 也显示在等待输入，但第一次图片生成成功后，用户后续输入无法进入 terminal。

This is not currently best described as a failed image generation bug. The image generation completed successfully. The failure is in the interactive terminal input path after that successful task.

这目前不应优先归类为图片生成失败问题。图片生成已经成功完成。失败点在成功任务结束后的交互式 terminal 输入链路。

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

This does not look like only an Enter-key mapping problem. In an Enter-key mapping issue, ordinary letters would still appear in the composer, but pressing Enter would fail to submit. Here, ordinary letters do not appear at all.

这看起来不只是 Enter 键映射问题。Enter 映射问题通常表现为普通字母能显示，但按 Enter 无法提交。现在的问题是普通字母本身就无法显示。

This also does not look like the image provider still running. The terminal printed a successful completion message, the output files are visible, and the Codex TUI returned to an idle prompt.

这也不像图片 provider 仍在运行。terminal 已经打印了成功完成信息，输出文件已经可见，Codex TUI 也回到了空闲 prompt。

This does not look like a simple focus miss. The accessibility tree showed focus on `Terminal input`, and clicking inside the terminal did not restore character input.

这不像简单的“没有点到输入框”。可访问性树显示焦点在 `Terminal input` 上，而且重新点击 terminal 内部也没有恢复字符输入。

## Most Likely Failure Area / 最可能的故障区域

The most likely failure area is the browser terminal input layer or the relay input path:

最可能的故障区域是浏览器 terminal 输入层，或者 relay 输入链路：

1. xterm.js may still be visually focused but no longer delivering `onData` events.
2. xterm.js may deliver input, but `sendTerminalInput()` may not be sending to the expected open WebSocket.
3. The browser WebSocket may report `connected`, but the upstream PTY input path may be stale or wedged.
4. The Daytona PTY / Codex process may be alive for output/rendering but not accepting stdin normally.
5. A front-end reconnect path may create or preserve confusing state: active session, socket, xterm instance, and Codex prompt can disagree.

1. xterm.js 视觉上仍有焦点，但已经不再触发 `onData` 事件。
2. xterm.js 可能触发了输入事件，但 `sendTerminalInput()` 没有把内容送到预期的打开 WebSocket。
3. 浏览器 WebSocket 可能显示 `connected`，但上游 PTY 输入链路已经陈旧或卡住。
4. Daytona PTY / Codex 进程可能仍能输出和渲染，但 stdin 接收不正常。
5. 前端 reconnect 状态可能混乱：active session、socket、xterm instance、Codex prompt 之间不一致。

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

## Immediate Risk / 直接风险

The user can lose confidence because the UI says connected and ready while the terminal cannot accept input. This is worse than a clean disconnect because the visible state suggests the user should be able to keep working.

这个问题会严重影响用户信心，因为 UI 显示已经连接且可继续使用，但 terminal 实际无法接收输入。这比明确断开连接更糟，因为可见状态会误导用户继续尝试。

The current safest recovery is to preserve/download needed artifacts first, then reconnect or start a new session. However, that is a workaround, not a fix.

当前最安全的恢复方式是先保留或下载需要的 artifact，然后重新连接或新建 session。但这只是 workaround，不是根本修复。
