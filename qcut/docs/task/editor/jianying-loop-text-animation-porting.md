# Jianying Loop Text Animation Porting

## 中文

### 范围

2026-07-29 批量采集了剪映专业版“循环”页的 72 个卡片，得到 67 个本地特效包。其中 16 个包包含可读的 `TextAnim.lua`，可以从公式层分析；13 个完成了完整分析，另外 3 个在 Claude 额度耗尽后由 Codex 手工补齐。

本文件只记录派生行为、移植决策和 QCut 文件边界。剪映缓存、Lua、shader、贴图和其他原始素材均不进入仓库。

### 移植原则

- 能用现有确定性 2D 状态模型表达的效果，才进入当前预设目录。
- 像素扭曲、3D 透视和多副本合成不伪装成“已完整移植”。
- 与现有预设重复的包用于校准参数，不增加重复卡片。
- 随机效果必须使用持久化 seed，不能逐帧重新随机。
- Canvas 正式渲染、预设卡片预览和导出必须消费同一套求值结果。

### 16 个包分类

| Package ID | 推断效果 | 分类 | QCut 决策 |
| --- | --- | --- | --- |
| `6724927688047333891` | 大波浪 | 现有 `wave` | 用 0.75 个空间周期、0.2em 振幅校准逐字近似；像素级弯曲仍待 shader |
| `6857036499389518349` | 高频小波浪 | 现有 `wave` 重复 | 不增加卡片；未来像素位移原语支持 8 个空间周期、0.05em 振幅 |
| `6908281696253121038` | 摇摆/钟摆 | 可直接移植 | 新增 `sway`，逐字同步、底部中心支点、`smoothstep` 相位上的余弦摆动 |
| `7065208406633615909` | 透视晃动 | 新原语 | 需要逐字 3D、梯形扭曲和方向性拖影 |
| `7067046171381862919` | 果冻/水波 | 新原语 | 需要整段文字纹理的 UV 位移 |
| `7069965879437431303` | 超强 3D 颤抖 | 新原语 | 需要逐字 3D、seeded jitter、透视和缩放拖影 |
| `7075224569421763079` | 逐字放大 | 部分可移植 | 时间运动可加入分段 scale profile；完整效果仍需要静态拱形像素扭曲 |
| `7096375845773644318` | 文字雨 | 新原语 | 需要文字快照和最多 60 个独立实例 |
| `7134190113780666887` | 发散涌出 | 新原语 | 需要文字快照、9 个生命周期实例和确定性 emitter |
| `7168819879183651359` | 水平 3D 翻转 | 新原语 | 需要带透视的 Y 轴旋转和中点镜像切换 |
| `7179135028343870012` | 圆柱环绕 | 新原语 | 需要文字纹理圆柱映射和 3D 相机 |
| `7210283971316290085` | 五连缩放脉冲 | 现有 `pulse` | 校准为 1.5 秒内 5 次 `1 -> 0.85 -> 1` 的 smoothstep 脉冲 |
| `7211060597352305189` | 满屏刷屏/弹幕 | 新原语 | 需要全屏文字快照多实例布局 |
| `7308277117622424090` | 彩色反馈拖尾入场 | 新原语 | 需要 offscreen feedback、发光和颜色 LUT；基础斜向逐字入场不足以代表完整效果 |
| `7397688001356108339` | 多行逐词高亮字幕 | 新原语 | 需要 caption word timing、三行重排、已读 clone 和高斯模糊 |
| `7398492769628459539` | 双色故障横移 | 新原语 | 需要双文字层、离散时间步、位移噪声和后处理 |

### 当前实现

1. 状态契约和安全规范化：
   - `packages/editor-core/src/text-animation/model.ts`
   - `packages/editor-core/src/text-animation/normalize-effect.ts`
2. 确定性公式：
   - `packages/editor-core/src/text-animation/effect-state.ts`
   - `packages/editor-core/src/text-animation/evaluate.ts`
3. 正式 Canvas 和卡片预览：
   - `apps/web/src/lib/text/text-animation-canvas-state.ts`
   - `apps/web/src/components/editor/properties-panel/text-animation-preset-card.tsx`
4. 预设、时长、重复模式和双语名称：
   - `apps/web/src/lib/text/text-animation-presets/catalog-exit-loop.ts`
   - `apps/web/src/lib/text/text-animation-presets/effects.ts`
   - `apps/web/src/lib/text/text-animation-presets/snapshots.ts`
   - `apps/web/src/lib/i18n/translations.ts`
5. 回归测试：
   - `packages/editor-core/src/__tests__/text-animation-jianying-loop-effects.test.ts`
   - `packages/editor-core/src/__tests__/text-animation-segmentation-normalization.test.ts`
   - `apps/web/src/lib/text/__tests__/text-animation-presets.test.ts`
   - `apps/web/src/lib/text/__tests__/text-animation-canvas-renderer.test.ts`

### 后续子任务

#### A. 像素位移

先定义“文字渲染到透明 offscreen surface，再运行确定性像素变换”的统一接口。波浪、果冻、拱形逐字放大和故障位移共用该接口，避免每个预设各写一套 shader 管线。

相关现有文件：

- `apps/web/src/lib/text/text-animation-canvas-renderer.ts`
- `apps/web/src/lib/text/text-animation-preview-envelope.ts`
- `packages/editor-core/src/text-animation/model.ts`

#### B. 3D 文字变换

扩展状态模型为可选的 `rotationX`、`rotationY`、`perspective` 和透视后的 bounds。正式预览、卡片预览和导出必须同时支持后再开放预设。

相关现有文件：

- `packages/editor-core/src/text-animation/model.ts`
- `packages/editor-core/src/text-animation/effect-state.ts`
- `apps/web/src/lib/text/text-animation-canvas-state.ts`

#### C. 多实例文字合成

增加独立于 grapheme state 的 text-snapshot instance 列表，包含 transform、opacity、z-order 和 seed。文字雨、发散涌出、满屏刷屏共用一个有实例上限的 renderer。

相关现有文件：

- `packages/editor-core/src/text-animation/evaluate.ts`
- `apps/web/src/lib/text/text-animation-canvas-renderer.ts`
- `apps/web/src/lib/text/text-animation-preview-envelope.ts`

#### D. 字幕布局与反馈后处理

逐词高亮字幕应建立在 caption timing 数据上，而不是硬塞进普通文字动画。反馈拖尾和双色故障则应依赖统一的 offscreen compositing graph。

相关现有文件：

- `packages/editor-core/src/captions`
- `packages/editor-core/src/text-animation`
- `apps/web/src/lib/text`

## English

### Result

The 16 readable packages split into three groups:

- Current 2D engine: calibrate `wave` and `pulse`, and add the new `sway` preset.
- Partial motion only: per-character zoom-pop can be timed in 2D, but its static arch warp still needs a pixel primitive.
- New rendering primitives: 3D perspective, pixel displacement/feedback, multi-instance text snapshots, or caption-aware word layout.

The implementation intentionally keeps the schema backward compatible. Optional profiles extend the existing rotate, scale, and bounce effects; animations without those profiles retain their previous behavior.

### Long-Term Architecture

1. Build one reusable transparent offscreen text surface and pixel-transform pipeline.
2. Add a bounded, deterministic text-snapshot instance renderer.
3. Add 3D state only when preview, export, crop envelopes, and tests can share it.
4. Keep caption word timing separate from generic text animation sequencing.
5. Preserve derived formulas and tests in the repository, but never redistribute Jianying package assets.
