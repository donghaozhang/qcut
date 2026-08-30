# Phase B 门禁证据 — 3 个无滤镜 clips 创建/保存/重开/导出

日期：2026-08-31 · 硬件：Apple M4 Pro，macOS 26.5.2
运行中的 QCut Desktop：`bun run electron`（labs worktree，分支 codex/compose-labs-complete 基座）
CLI：editable worktree（分支 `codex/compose-editable-project-v2`，commit 见 environment.json）

## 配方

`compose-config.json`：3 个真实视频片段（中文口播成片 / 英文口播成片 / Jianying 转场成片，各 10s，来源与画面均不同）+ 2 个 0.5s crossfade。预期时间线时长 30 − 2×0.5 = **29.0s**。

素材与成片均在本机（不入 Git）：
`/Users/peter/Desktop/QCut-Compose-Labs-E2E-2026-08-31/editable-phase-b/`
（clip1/2/3.mp4、phase-b-export.mp4、frames/、project-cli.log、replay-cli.log、export-cli.log；SHA256 见 `sha256.txt`）

## 命令与结果

1. **创建 + 应用 + 重开验证**（`apply-result.json`）：

```bash
QCUT_API_TOKEN=… bun run pipeline compose project \
  --config compose-config.json --target editor \
  --name "Compose Editable Phase B" --output-dir out --json
```

- 项目 `1a515458-931e-4ece-a6fe-c0102fbe7c3a` 创建成功；3 个 `insert-media-clip` 以 operation id 作为元素 id 落到 **isMain 主轨**；2 个 `upsert-transition`（dissolve 0.5s）落库拿到真实 transition id；apply `verified: true`；`reopen.navigatedAway: true, missingElementIds: []`（导航去另一项目再回来，元素全部仍在）。
- 实测时间线（HTTP GET timeline）：元素区间 [0,9.75] / [9.75,19.25] / [19.25,29.0]，与编译器的 t/2 修剪时序**完全一致**。

2. **幂等 replay**（`replay-result.json`）：同一 manifest 对同一项目重跑 → `applied: {}`、5 个 op 全部 `alreadyApplied`、`skipped: []`、重开校验通过 → 无重复元素/转场。

3. **导出**（native-cli 引擎自动选择，`ffprobe.json`）：1920×1080 30fps H.264+AAC，时长 **29.021s**（29.0 + AAC priming）。
   - 转场中点帧（9.75s / 19.25s）为真实溶解混合：与两侧邻帧 SSIM 0.53–0.71（硬切会对一侧 ≈1.0）；`frames/frame-9.75.png` 肉眼可见中英两片段叠影。
   - 三个 clip 窗口音频 RMS 分别 −33.5 / −28.8 / −24.9 dB（`audio-energy.txt`）— 三个不同来源的音频都真实存在。

4. **补偿事务**（第一次运行，见 `project-cli.log` 历史）：转场落库失败时（duration 语义缺陷，后已修复），本轮创建的项目被自动删除（"cleanup: created project … was deleted again"），根因错误保留为主错误。

## E2E 暴露并修复的缺陷

1. **media 元素 duration 语义**：QCut 元素 duration = 源时长（可见长度 = duration − trims）；首版按时间线时长下发导致相邻性校验拒绝转场。修复：`compose-timeline-media.ts` 下发 `sourceDuration`。
2. **重开校验把转场 op id 当元素 id**：转场创建的是独立 transition id。修复：期望集只含 element-creating kinds。
3. **重开后时间线水合竞态**：navigator 重开后 store 异步水合，单次读取可能拿到空时间线。修复：轮询直到元素齐或超时。

## 已知限制（Phase C/D 处理）

- `set-media-filter-stack` / `add-filter-layer` 在 v1 桥接中显式进 `skipped`（不静默丢弃）；`compose project --target editor` 遇到任何 skipped 直接判失败。
- manifest 本地文件 overlays 在 editor 目标被显式拒绝（提示改用 Sticker Lab id）。
- 完整 14.3 配方（滤镜栈/贴纸/音效/caption 组合、无损帧对照、headless 对照）属 Phase C/D 门禁。
