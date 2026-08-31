# Phase C 门禁证据 — 逐片段 Filter Lab 有序滤镜栈

> 路径占位符：`$EVIDENCE_ROOT` = 本机证据目录（`~/Desktop/QCut-Compose-Labs-E2E-2026-08-31`）；`$REPO_ROOT` = 本仓库检出根。大文件不入 Git，仅存本机。

日期：2026-08-31 · QCut Desktop：`bun run electron`（editable worktree 新构建，含 renderer + main 改动）
素材与成片在本机（不入 Git）：`$EVIDENCE_ROOT/editable-phase-c/`

## 配方（compose-config.json）

Phase B 的 3 个片段 + 2 个 crossfade，加逐片段滤镜：

- **c1**：单 LUT `7639191499833429274` 夏日晴朗 @100（fidelity `lut`）
- **c2**：**有序 2 效果栈** `7647099764940557618` 暗角旧影 @100（native multi-pass → fidelity `native-local`）→ 夏日晴朗 @60（`lut`）
- **c3**：dual-lut `7617814057051016484` 晴空海岸 @100（native portrait 肤色分割 → `native-local`）

## 结果

1. **Apply**（`apply-result.json`）：3 clips + 2 transitions + **3 个 `set-media-filter-stack` 更新全部落地**（`appliedUpdateOperationIds`），`skipped: []`，read-back `verified: true`（`filterStack` 已入 `MEDIA_VERIFY_KEYS`，逐字节 JSON 对比通过）。
2. **时间线真实状态**（HTTP GET）：三个元素分别携带 `[lut@100]`、`[native-local@100, lut@60]`（顺序保留）、`[native-local@100]`。
3. **Reopen 一致**：导航去别的项目再回来，3 个 filterStack 的 canonical JSON sha256 **逐字节一致**（`stack-digest-before/after-reopen.txt`）。
4. **幂等 replay**（`replay-result.json`）：`applied: {}`，无 skips，元素/转场/栈数量不变（3/2/3）。
5. **导出**：engine `renderer-muxer`（新策略强制：服务端 `timelineRequiresRendererFilterStackExport` + renderer 端 factory 双保险），1080p30、29.077s（`ffprobe.json` format.duration=29.077333）。
6. **夸张 vs neutral 量化差异**（`filter-diff-ssim.txt`，对照 Phase B 同素材无滤镜导出）：
   - t=5s（c1 LUT）：SSIM 0.882，R 通道 0.806（暖色 LUT 特征）
   - t=14.5s（c2 双效果栈）：SSIM 0.890（vignette+LUT 复合）
   - t=24s（c3 native 肤色分割）：SSIM 0.799，**B 通道 0.686**；`$EVIDENCE_ROOT/editable-phase-c/frames/filtered-24.png`（仅存本机，不入 Git）肉眼可见磨皮/肤色处理。
   - 关键推理：c3 的 multiPass `passes: []`（纯 nativeEffect），若原生路径未真实执行则画面**零变化**——巨大色差证明本机剪映运行时真实渲染。
7. **负面/回滚**（`badfilter-result.json`）：未编目资源 id → `Filter … is not in the local catalog`，事务回滚 + 本轮新建项目删除，媒体库无孤儿。

## E2E 暴露并修复的缺陷（本批已修）

1. **bun 并发失败态动态 import 挂死**：三个滤镜栈并发解析 → 并发 import 同一个含 `node:sqlite` 的模块 → 第二个 import 永不 settle → 事件循环耗尽 → CLI 以 exit 0 静默死亡。修复：目录加载走 `exportCatalogDefault`（bun-child shim）且进程级 memo 化。
2. **HTTP 1MiB body 上限 destroy socket**：33³ LUT cube ≈ 1MB JSON，超限时 `req.destroy()` 让 413 都发不出去（表现为 socket closed）。修复：timeline elements/batch 路由上限提到 64MiB + 回归测试。
3. **服务端 auto 引擎选择丢滤镜**：`editor:export:start` 的 native/renderer 分流不知道 filterStack → native-cli 会静默丢弃全部滤镜。修复：`timelineRequiresRendererFilterStackExport`（叶子模块 + 测试）纳入 requiresRendererExport。
4. 客户端 HTTP 错误现在带失败 URL（定位用）。

## 已知限制（记录在案）

- muxer 引擎不渲染 clip 转场（既有 parity gap，PR #441 记录）：含滤镜栈的导出被策略强制走 muxer，转场中点是硬切。转场渲染验收在 Phase B 已用 native-cli 完成。根修属 muxer 转场 parity 工作项。
- 多效果 adjustment 层（`add-filter-layer`）目前支持纯 LUT 链合成单 multiPass；混合 backend 多效果层显式 skipped（不静默重排）。
