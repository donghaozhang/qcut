# Phase D 门禁证据 — 全实验室组合（滤镜栈 + 转场 + 贴纸 + 音效 + caption/text 同一时间线）

日期：2026-08-31 · QCut Desktop：`bun run electron`（editable worktree）
本机大文件（不入 Git）：`/Users/peter/Desktop/QCut-Compose-Labs-E2E-2026-08-31/editable-phase-d/`
（phase-d-export.mp4、headless.mp4、frames/、frames-headless/、diffs/、screenshots/、*-cli.log；SHA256 见 `sha256.txt`）

## 配方

1. `compose project --target editor`：Phase C 同款 3 片段 + 逐片段滤镜栈（单 LUT / 有序双效果 / native dual-lut）+ 2 crossfade（`project-result.json`，verified: true）。
2. `compose apply` 叠加实验室 patch（`labs-patch.json`，7 ops，资源全部来自 snapshot `availableResources` 候选）：
   - 2 个同时出现的贴纸：水豚噜噜-进度条（**动画**：fade 入 + pulse 循环 + fade 出）@3–8s、红圈圈重点（静态）@4–7s
   - 3 个音效：Applause（trim 1s/2.94s + **playbackRate 2** + fadeIn/fadeOut）@5s、Crowd laugh（与前者**重叠 → 自动分轨**）@6s、Sitcom Laughter（trim + fadeOut 1s）@20s
   - 1 caption（中文）+ 1 text overlay

## 结果

- **Apply**（`apply-labs-result.json`）：7/7 applied，`skipped: []`，read-back `verified: true`。时间线终态：Text / Captions / Stickers×2 / Sound×2 / 主轨（3 clips + 2 dissolve）共 **10 元素 + 2 转场 + 3 滤镜栈**。
- **幂等 replay**（`apply-replay-result.json`）：`applied: {}`，7 ops 全部 alreadyApplied。
- **整机重启持久化**（§10.2 最强门禁）：kill QCut → 重启 → 重开项目 → 元素/转场/滤镜栈 canonical 摘要**逐字节一致**（`timeline-digest-before/after-restart.txt`，digest `14f45d02…`）。UI 截图 `screenshots/timeline-after-restart.png` 可见全部轨道与元素。
- **导出**：renderer-muxer，1080p30，29.077s（`ffprobe.json`）。帧证据：4.5s 双贴纸齐现（`frames/export-4.5.png`）、2s caption、11.5s text、各 clip 中点滤镜生效。
- **音频**（`audio-windows.txt`）：三个音效窗口 RMS −18.1 / −21.1 / −23.8 dB vs 无音效参照窗口 −27.7 dB（+4~+10 dB），2× 变速窗口时长与 (source−trims)/rate 语义一致（UI 波形带 2x 标记）。
- **Headless vs Editor 对照**（§14.4，`headless-vs-editor.txt` + `diffs/` 热图）：同一 manifest 分别走 headless FFmpeg 与编辑器导出，无覆盖时间点（0.5/15/18/24.5/27s，覆盖三个滤镜后端）**SSIM 0.964–0.975、PSNR 39–41dB** —— 跨后端滤镜渲染高度一致（门限 ≥0.95 全过）。t=9.75s 转场中点 SSIM 0.772：headless 有 crossfade、muxer 硬切 —— 即 muxer 转场 parity gap 的量化记录。
- **负面/回滚**（`apply-bad-result.json`）：patch 混入不存在的 sound-effects-lab id → `invalid-asset-reference` 校验拒绝、"nothing was applied"，元素数不变（10）、媒体库无孤儿（8 个文件与好状态一致）。

## 本阶段修复的缺陷

1. **删除打开中的项目毒化 renderer**：补偿清理会删掉编辑器正打开的项目，后续任何 mutation 的 project-scope 守卫 503。修复：清理前先导航回先前项目。
2. **就绪≠active 竞态**：新建项目 open 后 renderer 仍在收尾上一项目，守卫 750ms 窗口频繁误杀。修复：编排器要求连续两次 active 确认 + 服务端守卫窗口放宽到 5s（仍 fail-closed）。

## 未覆盖（已记录）

- muxer 转场渲染 parity gap（量化见上，根修独立工作项）。
- 多效果混合 backend 的 adjustment 层（显式 skipped，Phase C 记录）。
