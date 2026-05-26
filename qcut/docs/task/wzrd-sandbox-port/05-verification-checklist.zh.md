# 验证清单

在宣布 WZRD 移植完成前，用这个清单做验证。

## 镜像

- 镜像能从 clean checkout 构建成功。
- `qcut-smoke` 或 WZRD 等价 smoke 通过。
- sandbox 内 `which qcut` 能解析。
- sandbox 内 `which codex` 能解析。
- `codex --version` 可运行。
- `qcut system doctor --json --skip-health` 返回可解析 envelope。
- 镜像包含 Codex 被指示阅读的 native CLI skill docs。
- 生产环境使用 immutable image digest，而不是仅使用可变 tag。

## Secret handling

- Provider keys 永远不发送到浏览器。
- 写任何 env file 前，provider keys 经过 allow-list。
- sandbox env file 权限是 `0600`。
- entrypoint 每次启动重写 env file，而不是 append。
- 如果支持 `CODEX_AUTH_JSON`，写入前必须验证。
- 过期 Codex token 会被拒绝，或被 API-key login 替换。
- WZRD 不从 client 或 Edge Function 直接查询 `auth.users`。

## Job execution

- job command validation 会拒绝 shell metacharacters。
- Codex jobs 要求非空 prompt。
- prompt size 有上限。
- worker 可以原子领取 exactly one queued job。
- job state 会经过 queued、running 和某个 terminal state。
- worker restart 不会让 queued jobs 永久卡住。
- 长任务有 timeout。
- 最终文件落在 `/tmp/qcut-output` 或选定的 WZRD output root。
- 临时工具和 cache 不会写入 output root。

## Session lifecycle

- 创建 session 时会存 user id、provider、image tag、status、expiry。
- 后续 prompt 在预期情况下会复用 active session。
- 过期 session 不能接受新 job。
- idle cleanup 会结束旧 session 并删除 Daytona sandbox。
- 用户主动 end 会把 session 标记为 stopping/ended 并删除 sandbox。
- provider sandbox 缺失时，会创建 replacement 或返回清晰错误。

## Files and artifacts

- 上传文件名拒绝 path separators、null bytes、`.` 和 `..`。
- 上传大小有上限。
- sandbox paths 必须是绝对路径，并拒绝 `.` / `..` 段。
- 目录下载会安全地归档。
- Output artifacts 会复制到 `project-assets/{userId}/qcut-agent/{sessionId}/...` 或等价 WZRD 路径。
- Artifact rows 存储 content kind、byte size、storage path 和有用 metadata。
- 即使 byte metadata 缺失，text preview cap 也会执行。

## 如果加入交互式 terminal

- Relay tokens 有短有效期。
- Relay 打开 PTY 前验证 token signature。
- Relay 获取 session state，并拒绝 inactive sessions。
- 一个 PTY session 只允许一个浏览器 attachment。
- PTY cwd 是预期 workspace。
- `CODEX_HOME` 按 session 隔离。
- startup command 会创建 input、output、tools 目录。
- disconnect 会清理 PTY，且不会误结束较新的 attachment。

## 产品集成

- 生成媒体会出现在 WZRD asset library。
- chat UI 展示 progress、errors 和 final artifacts。
- 如果启用 credit deduction，必须在昂贵 sandbox 工作前完成。
- sandbox 创建失败时，不能留下已付费但不可用、且没有 refund path 的 session。
- 真实 end-to-end prompt 至少能生成一张图或一个视频，并能在 WZRD 中显示/下载。

## 有用的 QCut 命令

在 `qcut/` 下：

```bash
bun run build:cli-image
bun --cwd packages/agent-worker test
bun --cwd packages/license-server test
bun --cwd packages/qcut-relay test
```

WZRD 移植应镜像这些检查：

- Image build/smoke。
- Worker unit tests。
- Edge Function route tests。
- 真实 Daytona sandbox smoke。
- 浏览器 E2E，确认 final artifact 在 app 中可见。

