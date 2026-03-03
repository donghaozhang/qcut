# QCut 导出修复记录（最终版）

## 问题现象

在项目 `298edff5-068a-4b7a-8211-d34d107d11b0` 中：

- `editor:timeline:export` 能看到素材（image + video）
- 但 `editor:export:start --poll` 报错：
  - 之前：`Cannot export an empty timeline`
  - 当前主症状：`No exportable segments found (no video or image media on timeline)`

## 新根因（本次定位）

前一轮已修复「符号链接 + media/imported 扫描」后，仍会失败，原因是：

1. 导出路由只依赖 `listMediaFiles(projectId)`（磁盘目录扫描）
2. 当前项目的素材实际存在于 **renderer 的 media store**，并带有 `localPath`（位于系统临时目录）
3. 这些素材并不一定落盘到 `{project}/media` 或 `{project}/media/imported`
4. 结果：`timeline` 有元素，但传给导出引擎的 `mediaFiles` 为空/不完整，最终 `segments.length === 0`

也就是说：**时间线和素材状态来自 renderer，但导出入口仅看项目目录磁盘，数据源不一致**。

---

## 最小化修复点

### 1) `electron/claude/http/claude-http-shared-routes.ts`

新增 `listMediaFilesWithRendererFallback()`：

- 先读取原有 `listMediaFiles(projectId)`（保持现有行为）
- 再尝试 `accessor.requestStateSnapshot({ include: ["media"] })`
- 从 `state.media.items` 中提取带 `localPath` 的条目，`stat` 后转为 `MediaFile`
- 与磁盘结果按 `id` 合并（renderer 可补齐缺失素材）
- 导出接口 `/api/claude/export/start` 改为使用该合并结果

### 2) `electron/claude/http/claude-http-server.ts`

为 `WindowAccessor` 增加实现：

- `requestStateSnapshot(request)`
- 直接走 `requestEditorStateSnapshotFromRenderer(getWindow(), request)`

### 3) `electron/utility/utility-http-server.ts`

为 utility 模式下的 `WindowAccessor` 同步增加：

- `requestStateSnapshot(request)`
- 通过 `requestFromMain("get-editor-state-snapshot", { request })`

> 以上为增量补丁，不改导出引擎主流程、不做大重构。

---

## 本地验证（按要求执行）

### 1. 构建

```bash
bun run build
```

结果：通过。

### 2. 确保 QCut 运行

已重启并确认 QCut（Electron）启动，Claude API utility server 在 `127.0.0.1:8765` 正常监听。

### 3. 打开项目

```bash
bun run pipeline editor:navigator:open --project-id 298edff5-068a-4b7a-8211-d34d107d11b0 --json
```

结果：`success: true`。

### 4. 导出时间线

```bash
bun run pipeline editor:timeline:export --project-id 298edff5-068a-4b7a-8211-d34d107d11b0 --json
```

结果：`success: true`，包含 2 个 media 元素（image + video）。

### 5. 启动导出并轮询

```bash
bun run pipeline editor:export:start --project-id 298edff5-068a-4b7a-8211-d34d107d11b0 --poll --json
```

结果：`success: true`，状态 `completed`。

- jobId: `export_1772543140611_ccx3xw`
- outputPath: `/Users/peter/Documents/QCut/Exports/298edff5-068a-4b7a-8211-d34d107d11b0-2026-03-04-000540.mp4`
- fileSize: `290410477` bytes

### 6. 导出文件信息（ffprobe）

```bash
stat -f 'size_bytes=%z' <output>
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of json <output>
```

结果：

- 视频路径：`/Users/peter/Documents/QCut/Exports/298edff5-068a-4b7a-8211-d34d107d11b0-2026-03-04-000540.mp4`
- 文件大小：`290410477` bytes
- 时长：`284.699229` s
- 分辨率：`1920x1080`

---

## 结论

问题已修复并本地验证通过。核心是把导出入口的素材来源从“仅磁盘扫描”补齐为“磁盘 + renderer media state(localPath)”，从而消除 timeline 有素材但导出分段为空的问题。