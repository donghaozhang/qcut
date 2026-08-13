# Jianying Loop Text Animation Porting

## 中文

### 范围

2026-07-29 批量采集了剪映专业版“循环”页的 72 个卡片，得到 67 个本地特效包。其中 16 个包包含可读的 `TextAnim.lua`，可以从公式层分析；13 个完成了完整分析，另外 3 个在 Claude 额度耗尽后由 Codex 手工补齐。

本文件只记录派生行为、移植决策和 QCut 文件边界。剪映缓存、Lua、shader、贴图和其他原始素材均不进入仓库。

### 移植原则

- 预设只有在正式预览与导出共用同一条确定性渲染链路时才开放。
- 像素扭曲、逐字符 3D、跨帧反馈和多副本合成不伪装成“已完整移植”。
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
| `7069965879437431303` | 超强 3D 颤抖 | 部分已有可移植原语 | 已支持逐字 seeded 3D 姿态、透视、缩放和有界当前帧拖影；梯形像素扭曲与跨帧 feedback 待补 |
| `7075224569421763079` | 逐字放大 | 部分可移植 | 时间运动可加入分段 scale profile；完整效果仍需要静态拱形像素扭曲 |
| `7096375845773644318` | 文字雨 | 新原语 | 需要文字快照和最多 60 个独立实例 |
| `7134190113780666887` | 发散涌出 | 新原语 | 需要文字快照、9 个生命周期实例和确定性 emitter |
| `7168819879183651359` | 水平 3D 翻转 | 已有可移植原语 | 透明文字纹理经透视三角网格执行真实 Y 轴旋转；预览和导出共用 Canvas 路径 |
| `7179135028343870012` | 圆柱环绕 | 已有可移植原语 | 透明文字纹理映射到可排序圆柱网格；预览和导出共用 Canvas 路径 |
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
   - `apps/web/src/lib/text/text-animation-canvas-raster.ts`
   - `apps/web/src/lib/text/text-animation-projective-surface.ts`
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
6. 本机剪映私有运行时兼容层：
   - `electron/jianying-text-runtime/package-resolver.ts`
   - `electron/jianying-text-runtime/animation-package-resolver.ts`
   - `electron/jianying-text-runtime/script-dependencies.ts`
   - `electron/jianying-text-runtime/script-resource-policy.ts`
   - `electron/jianying-text-runtime/script-content-hydrator.ts`
   - `electron/jianying-text-runtime/resource-catalog.ts`
   - `electron/jianying-text-runtime/resource-recovery.ts`
   - `electron/jianying-text-runtime/resource-recovery-installer.ts`
   - `electron/jianying-text-runtime/resource-recovery-archive.ts`
   - `electron/jianying-text-runtime/script-caption-timing.ts`
   - `electron/jianying-text-runtime/bridge-render.ts`
   - `research/jianying-runtime-probe/text-probe.mm`

### 本机私有运行时兼容状态（2026-08-13）

这条路径复用本机已安装剪映的私有运行时和已下载缓存，目标是高保真技术验证。它与 QCut 自己的跨平台文字渲染器是两条不同的实现路径。

| 本机缓存类型 | 样本数 | 当前结果 |
| --- | ---: | --- |
| `TextStyle` | 212 | 212/212 可见渲染，0 运行时错误，0 边缘溢出；137 个含纹理，110 个含多层描边 |
| `InfoSticker` | 149 | 149/149 可见渲染，0 透明空帧，0 运行时错误；原资源为静态时输出保持静态 |
| `ScriptInfoSticker` 固定矩阵 | 25 | 25/25 真实透明视频通过；包含完整缓存、目录恢复、旧 ID 别名恢复和仅形状层安全降级 |

初始资源完整的三类包合计为 **372/372 成功渲染**。`ScriptInfoSticker` 固定矩阵现为 **25/25 真实视频通过**：常规目录恢复覆盖原来的 21 个；两个旧动画 ID 通过 `third_resource_id_str` 映射到当前卡片，覆盖另外 3 个；最后 1 个包缺失的依赖只属于 `shape` 子层，运行前移除该损坏形状层并保留动态文字和贴纸兄弟层。两份新式 `caption` ScriptTemplate 也通过了真实动态视频 E2E；运行前会按 grapheme 注入确定性 `caption_duration_info`。

另有两种没有 `effectStyle.json`、但包含完整 `InfoSticker`/`AmazingFeature` 配置、prefab、shader 和材质的 effectStyle 组件包。解析器会把它们识别为运行时组件并注入私有运行时，不再误报成缺失的普通 TextStyle。

另有 36 个动画子包完成矩阵验证：32 个可直接作为普通动画槽动态渲染，4 个 CaptionModule 必须放回 ScriptTemplate 上下文。已研究的 16 个高阶动画又全部通过 48 帧透明序列与 WebM E2E：16 个包含 shader 组件，8 个包含 3D 信号或网格，1 个包含跨帧反馈；覆盖像素波浪、文字雨、多实例、Y 轴翻转、圆柱文字、反馈拖尾、逐词高亮和双色故障。文字雨与满屏效果使用显式“允许触边”策略，其余样本仍要求边缘 alpha 为零。

这些高阶 E2E 验证的是**剪映私有运行时桥接**，不是 QCut 已经原生重写了剪映的完整 shader 或组件引擎。QCut 的可移植路径现已增加透明文字纹理、透视相机数学、真实 Y 轴平面翻转、圆柱网格，以及逐字符 seeded 3D 抖动和有界当前帧拖影；正式预览与导出共用同步 Canvas 渲染器。像素位移、梯形扭曲、真正跨帧反馈和确定性多实例仍未完成。没有安装兼容剪映运行时的机器只能使用这些已实现的 QCut 原语或明确降级。

这个结果不能写成“任意剪映花字 100% 支持”，边界如下：

- 主包和传递依赖必须存在于本机缓存、能从本地目录恢复，或满足已验证的安全降级规则；目录里没有且会影响文字/贴纸主体的资源 ID 无法猜出。
- `TextStyle` 和带可编辑富文本槽的 `ScriptInfoSticker` 可以替换用户文字；拍平的 `InfoSticker` 只能忠实显示原资源，不自动变成任意文字模板。
- 当前兼容层依赖 macOS 上匹配版本的剪映私有运行时，不承诺 Windows、Linux 或未安装剪映的机器可移植。
- 本地目录中的 `AmazingFeature` 还没有完成“文字卡片归属”映射，不能把全部 106 个包直接算作未支持花字。
- 剪映缓存、字体、Lua、shader、纹理和二进制只用于本地验证，不复制进仓库，也不随 QCut 发布。

因此，当前可以说“本机资源完整、类型已识别的花字包兼容率为 100%”，不能说“剪映线上所有花字、任意机器、任意文字都已经原生复刻”。

### 后续子任务

#### A. 像素位移

先定义“文字渲染到透明 offscreen surface，再运行确定性像素变换”的统一接口。波浪、果冻、拱形逐字放大和故障位移共用该接口，避免每个预设各写一套 shader 管线。

相关现有文件：

- `apps/web/src/lib/text/text-animation-canvas-renderer.ts`
- `apps/web/src/lib/text/text-animation-preview-envelope.ts`
- `packages/editor-core/src/text-animation/model.ts`

#### B. 3D 文字变换（平面和圆柱已完成）

当前实现先把文字和背景画入透明离屏纹理，再把纹理切成有界三角网格，以透视相机数学投影回 Canvas。它不依赖 WebGL，因此正式预览和导出共用同一同步路径。`flip3d` 提供真实 X/Y 轴平面旋转，`cylinder3d` 提供带深度排序的圆柱映射；旧的 2D `flip` 与 `orbit` 继续保留以兼容已有项目。

逐字符 `rotationX`/`rotationY`/`translateZ` 和有界当前帧拖影也已经接入同一网格渲染器。仍需补齐梯形像素扭曲、方向性历史采样，以及与统一像素后处理图的组合。

相关现有文件：

- `packages/editor-core/src/text-animation/model.ts`
- `packages/editor-core/src/text-animation/effect-state.ts`
- `apps/web/src/lib/text/text-animation-projective-surface.ts`
- `apps/web/src/lib/text/text-animation-canvas-renderer.ts`

#### C. 多实例文字合成

增加独立于 grapheme state 的 text-snapshot instance 列表，包含 transform、opacity、z-order 和 seed。文字雨、发散涌出、满屏刷屏共用一个有实例上限的 renderer。

相关现有文件：

- `packages/editor-core/src/text-animation/evaluate.ts`
- `apps/web/src/lib/text/text-animation-canvas-renderer.ts`
- `apps/web/src/lib/text/text-animation-preview-envelope.ts`

#### D. 字幕布局与反馈后处理

私有运行时路径已经能为剪映 CaptionModule 注入 grapheme timing；QCut 原生逐词高亮字幕仍应建立在自己的 caption word timing 数据上，而不是硬塞进普通文字动画。反馈拖尾和双色故障则应依赖统一的 offscreen compositing graph。

相关现有文件：

- `packages/editor-core/src/captions`
- `packages/editor-core/src/text-animation`
- `apps/web/src/lib/text`

## English

### Result

The 16 readable packages split into three groups:

- Current 2D engine: calibrate `wave` and `pulse`, and add the new `sway` preset.
- Partial motion only: per-character zoom-pop can be timed in 2D, but its static arch warp still needs a pixel primitive.
- Portable projective surface: transparent text textures now support a true Y-axis plane flip and cylindrical mapping through the same synchronous Canvas path used by preview and export.
- Remaining rendering primitives: per-glyph 3D, pixel displacement/feedback, multi-instance text snapshots, and caption-aware word layout.

The implementation intentionally keeps the schema backward compatible. Optional profiles extend the existing rotate, scale, and bounce effects; animations without those profiles retain their previous behavior.

### Local Private-Runtime Compatibility (2026-08-13)

This path reuses a locally installed Jianying private runtime and already-downloaded cache for high-fidelity technical validation. It is separate from QCut's portable native text renderer.

| Local package kind | Samples | Current result |
| --- | ---: | --- |
| `TextStyle` | 212 | 212/212 visibly rendered, zero runtime errors and zero edge overflows; 137 use textures and 110 use multiple strokes |
| `InfoSticker` | 149 | 149/149 visibly rendered, with zero blank-alpha frames and zero runtime errors; authored-static resources remain static |
| Fixed `ScriptInfoSticker` matrix | 25 | 25/25 real transparent videos pass, covering complete caches, catalog recovery, legacy-ID aliases, and one shape-only safe degradation |

All **372/372 initially resource-complete packages** across the three supported kinds rendered successfully. The fixed `ScriptInfoSticker` corpus is now **25/25 in real-video tests**. Conventional catalog recovery covers the original 21; two legacy animation IDs resolve through `third_resource_id_str` aliases and cover three more packages; the final package is missing an animation used exclusively by a shape child, so hydration removes that broken shape while preserving its dynamic text and sticker siblings. Two newer `caption` ScriptTemplates also passed dynamic-video E2E after deterministic grapheme-level `caption_duration_info` injection.

Two effectStyle dependencies without `effectStyle.json` were also verified as complete runtime component packages containing `InfoSticker`/`AmazingFeature` configuration, prefabs, shaders, and materials. They are now injected as runtime components instead of being misreported as missing ordinary TextStyles.

A separate 36-animation-package matrix produced 32 directly dynamic slot animations; four CaptionModules require their ScriptTemplate host. All 16 researched advanced animations also passed 48-frame transparent-sequence and WebM E2E: all 16 contain shader components, eight contain 3D signals or meshes, and one uses cross-frame feedback. The matrix covers pixel waves, text rain, deterministic instances, Y-axis flips, cylindrical text, feedback trails, word highlighting, and duotone glitch effects. Only the intentionally full-frame effects opt into edge contact; every other sample retains the zero-edge-alpha assertion.

These advanced E2Es validate the **private Jianying runtime bridge**; they do not mean QCut has natively reimplemented Jianying's complete shader or component engine. QCut's portable path now includes transparent text textures, perspective-camera math, true Y-axis plane rotation, cylindrical meshes, and seeded per-glyph 3D jitter with a bounded current-frame trail through one synchronous Canvas renderer shared by preview and export. Pixel displacement, trapezoid warping, true cross-frame feedback, and deterministic multi-instance composition remain open. Machines without a compatible Jianying runtime can use only the implemented QCut primitives or an explicit degraded state.

This is not a claim that every Jianying word-art card is universally supported:

- The root package and transitive dependencies must be cached locally, catalog-recoverable, or covered by a verified safe-degradation rule. An absent dependency that affects the primary text or sticker content cannot be inferred.
- `TextStyle` and `ScriptInfoSticker` packages with editable rich-text slots can accept user text. A flattened `InfoSticker` can reproduce its authored resource but does not become an arbitrary-text template.
- The compatibility layer currently requires a matching Jianying private runtime on macOS; it is not portable to Windows, Linux, or machines without that runtime.
- The 106 locally discovered `AmazingFeature` packages do not yet have reliable text-card ownership mapping, so they must not be counted as unsupported word art.
- Jianying binaries, fonts, Lua, shaders, textures, and cached packages remain local and are never committed or redistributed with QCut.

The accurate status is therefore: **100% rendering success for locally resource-complete packages of the recognized kinds**, not 100% native reproduction of Jianying's entire online catalog on arbitrary machines.

### Long-Term Architecture

1. Extend the reusable transparent offscreen text surface from projective meshes to bounded pixel-displacement passes.
2. Extend the per-glyph 3D pass with trapezoid warping and a deterministic cross-frame feedback graph.
3. Add a bounded, deterministic text-snapshot instance renderer.
4. Keep caption word timing separate from generic text animation sequencing.
5. Preserve derived formulas and tests in the repository, but never redistribute Jianying package assets.
