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
7. 同参数逐帧对照工具：
   - `research/jianying-runtime-probe/text-parity-plan.ts`
   - `research/jianying-runtime-probe/text-parity-render.ts`
   - `research/jianying-runtime-probe/text-parity-media.ts`
   - `research/jianying-runtime-probe/text-parity-matrix.ts`
   - `research/jianying-runtime-probe/text-parity-matrix.example.json`

### 本机私有运行时兼容状态（2026-08-13）

这条路径复用本机已安装剪映的私有运行时和已下载缓存，目标是高保真技术验证。它与 QCut 自己的跨平台文字渲染器是两条不同的实现路径。

| 本机缓存类型 | 样本数 | 当前结果 |
| --- | ---: | --- |
| `TextStyle` 顶层运行时包 | 212 | 212/212 在剪映 App 路径不存在时仍可见渲染，0 回退、0 运行时错误 |
| 可证实的 `InfoSticker` 花字根包 | 80 | 79 个由 flower 目录证明，另 1 个由本地剪映项目的真实花字选择记录恢复；80/80 在剪映 App 路径不存在时可见渲染 |
| `ScriptInfoSticker` 固定矩阵 | 25 | 25/25 在剪映 App 路径不存在时替换文字并可见渲染；另有 25/25 真实透明视频通过 |
| `ScriptInfoSticker` 模板字体引用 | 37 | 33/37 保留模板原字体；4 个引用对应 3 个本机完全缺失的字体 ID，仅降级受影响字槽 |
| 其他缓存 `InfoSticker` | 70 | 53 个有非花字目录或独立包结构证据，17 个是其他模板的依赖组件；0 个未分类，均不作为顶层花字卡片展示 |

把 `JY_APP_BUNDLE` 指向不存在的路径后，隔离保存的 23 个运行时动态库独立完成了 **317/317 顶层候选**：212 个 `TextStyle`、80 个有直接花字归属的 `InfoSticker` 和 25 个 `ScriptInfoSticker`。这直接证明当前兼容链路使用的是完整私有运行时二进制及资源包，而不是依赖正在运行的剪映进程。花字实验室先查询目录数据库；目录记录缺失时，再读取本地项目 `key_value.json` 中结构化的 `text + text_special_effect` 选择记录，并扫描 `ScriptInfoSticker` 富文本里的结构化资源引用。直接目录/项目归属优先于依赖和包结构，因此真正花字、独立贴纸、滤镜和内部组件不会为了清零未知数而混为一类。当前 500 个已识别缓存包为 0 个未分类、0 个归属冲突。

新增的 `InfoSticker` 样本 `7067070987363208485:c890d1bc4fc4c97e44f776ae3c47362d` 在剪映 App 路径不存在时，通过旧版隔离 runtime UUID `D6342ECD-5432-33F0-A2AD-0C28F5699994` 独立输出了 `512x512` 透明 RGBA。产品链路又用四字“花字验证”完成 48 帧、`1280x720` H.264 E2E。此前 host-text 自动缩放只覆盖 `TextStyle`，导致该 `InfoSticker` 触边裁切；现在两种 host-text 包共用 alpha 边界探测与最多四次字号收敛，严格的零边缘 alpha 断言已通过，`ScriptInfoSticker` 仍使用模板槽位缩放。

`ScriptInfoSticker` 固定矩阵现为 **25/25 真实视频通过**：常规目录恢复覆盖原来的 21 个；两个旧动画 ID 通过 `third_resource_id_str` 映射到当前卡片，覆盖另外 3 个；最后 1 个包缺失的依赖只属于 `shape` 子层，运行前移除该损坏形状层并保留动态文字和贴纸兄弟层。两份新式 `caption` ScriptTemplate 也通过了真实动态视频 E2E；运行前会按 grapheme 注入确定性 `caption_duration_info`。多样式槽不再把所有超长尾部塞进最后一个槽，而是按原槽 grapheme 长度确定性分配，保留混合字体、字号和颜色的大致比例；另有 3 个代表性包通过长中英混排、emoji、组合字符和多行文字的真实视频 E2E。脚本包改写 schema 已进入渲染缓存键，算法升级不会误用旧帧。

固定矩阵进一步对每个包分别渲染短文本和长中英混排、多行、emoji、组合字符压力文本，并比较透明序列的 alpha 空间哈希。25/25 均产生不同且可见的文字几何，压力文本没有给任何模板增加画布边缘裁切。当前 25 个包共包含 40 个可编辑文字 widget 和 56 个富文本槽；改写器会递归处理嵌套 widget，并跳过没有槽的装饰文字层。

模板字体现在是独立依赖，不再把一个系统字体无条件写进所有 `<font>` 标签。固定矩阵包含 37 个字体引用、27 个唯一字体 ID；解析器先按当前长 ID 查找，再从本地草稿的 `resource_id -> text/<md5>/字体文件` 记录恢复旧短 ID 包，并复制到 QCut 私有缓存。当前真实缓存恢复了 **33/37 个引用**；其中 `SmileySans-Oblique`、`Charm-Regular`、`Antic-Regular`、`BarlowCondensed-Thin` 和 `NewYork` 均由旧 ID 缓存重定位，未调用剪映 App。剩余 4 个引用对应 `7203638484756599352`、`7268259657167147577`、`7312720780599497225`，本机既没有字体包，也没有可用路径或目录记录，因此只对这些字槽使用系统回退并给出 `template-font-missing` 诊断。只有用户明确选择时间线字体时，才会覆盖模板全部字体。

另有两种没有 `effectStyle.json`、但包含完整 `InfoSticker`/`AmazingFeature` 配置、prefab、shader 和材质的 effectStyle 组件包。解析器会把它们识别为运行时组件并注入私有运行时，不再误报成缺失的普通 TextStyle。

另有 36 个动画子包完成矩阵验证：32 个可直接作为普通动画槽动态渲染，4 个 CaptionModule 必须放回 ScriptTemplate 上下文。已研究的 16 个高阶动画又全部通过 48 帧透明序列与 WebM E2E：16 个包含 shader 组件，8 个包含 3D 信号或网格，1 个包含跨帧反馈；覆盖像素波浪、文字雨、多实例、Y 轴翻转、圆柱文字、反馈拖尾、逐词高亮和双色故障。文字雨与满屏效果使用显式“允许触边”策略，其余样本仍要求边缘 alpha 为零。

这些高阶 E2E 验证的是**剪映私有运行时桥接**，不是 QCut 已经原生重写了剪映的完整 shader 或组件引擎。QCut 的可移植路径现已增加透明文字纹理、透视相机数学、真实 Y 轴平面翻转、圆柱网格，以及逐字符 seeded 3D 抖动和有界当前帧拖影；正式预览与导出共用同步 Canvas 渲染器。像素位移、梯形扭曲、真正跨帧反馈和确定性多实例仍未完成。没有安装兼容剪映运行时的机器只能使用这些已实现的 QCut 原语或明确降级。

逐帧对照工具会在清单中锁定资源 ID/哈希、包类型、文字内容、字体资源、字号、画布、位置、透明度、起始时间、持续时间和帧率。参考项还必须声明来源：剪映正式导出需要记录 App 版本，QCut 候选自对照只能标记为 `qcut-private-runtime-control`。候选侧通过独立 Node worker 调用本机私有运行时，先生成透明 PNG 序列，再按运行时返回的位置合成到指定底色；验证侧拒绝尺寸、帧率或总帧数不同的视频，并同时计算五个时间点的整帧 MAE/RMSE、文字前景 RMSE、前景遮罩 IoU、中心/边界偏移，以及全区间 PSNR/SSIM。默认通过门槛是整帧 RMSE 不高于 `4`、文字前景 RMSE 不高于 `24`、遮罩 IoU 不低于 `0.9`，并且中心和边界偏移都不超过 `2px`，避免小面积文字被大面积背景稀释后错误通过。真实缓存 `TextStyle` 已通过 12 帧候选视频 E2E，重复运行能命中渲染缓存；候选视频自对照得到五点整帧/前景 RMSE `0`、遮罩 IoU `1`、几何偏移 `0px`、全区间 RMSE `0`、SSIM `1`，证明比较工具自身没有引入偏差。该结果在报告中记为 `control`，永远不计入剪映 parity 的通过数。

当前已有一个剪映 App 正式导出的 `TextStyle` 同参样本通过：资源
`7623376604814904638:99d51368afceae9b105af34b8403a79f`、文字“花字”、字号
48、`1920x1080@30fps`。五点最坏整帧 RMSE 为 `3.021`、最坏前景 RMSE 为
`5.024`、最低前景遮罩 IoU 为 `0.984159`、最大边界偏移为 `1px`，全区间
SSIM 为 `0.996499`。这证明该单个 `TextStyle` 与剪映正式导出达到当前严格门槛，
但还不是三类花字的批量 App parity 结论。新增同参剪映参考后执行：

```bash
bun research/jianying-runtime-probe/text-parity-matrix.ts \
  --matrix /absolute/private-evidence/text-parity-matrix.json \
  --output /absolute/private-evidence/text-parity-output \
  --mode run
```

清单、剪映参考视频、候选视频、逐帧图片和报告都必须留在仓库外或已忽略目录。目前只能对上述单个 `TextStyle` 声称通过剪映正式导出对比；在 `TextStyle`、`InfoSticker` 和 `ScriptInfoSticker` 都形成真实成对批次前，不能把这个结论外推成全库逐帧一致。

这个结果不能写成“任意剪映花字 100% 支持”，边界如下：

- 主包和传递依赖必须存在于本机缓存、能从本地目录恢复，或满足已验证的安全降级规则；目录里没有且会影响文字/贴纸主体的资源 ID 无法猜出。
- `TextStyle`、可编辑 host-text `InfoSticker` 和带富文本槽的 `ScriptInfoSticker` 可以替换用户文字；真正拍平的 `InfoSticker` 只能忠实显示原资源，不自动变成任意文字模板。
- 当前兼容层依赖 macOS 上匹配版本的剪映私有运行时，不承诺 Windows、Linux 或未安装剪映的机器可移植。
- 本地当前 113 个有效顶层 `AmazingFeature` 已完成归属审计：105 个以 `resourceId + md5` 精确归属滤镜目录，5 个是同一滤镜资源 ID 的旧缓存版本，数据库未命中的 3 个具有完整的 `Filter.material`、滤镜 shader 和 LUT payload，按包结构归为滤镜；没有发现顶层花字包。花字主包传递引用的嵌套 `AmazingFeature` 仍按依赖图交给私有运行时，不能把独立滤镜包当作文字入口。这里的数量是可变本机缓存快照，分类规则不依赖固定总数。
- 剪映缓存、字体、Lua、shader、纹理和二进制只用于本地验证，不复制进仓库，也不随 QCut 发布。

因此，当前可以说“本机资源完整、类型已识别的花字包兼容率为 100%”，不能说“剪映线上所有花字、任意机器、任意文字都已经原生复刻”。

### 剪映二进制版本适配（2026-08-13）

剪映更新到 `CFBundleVersion 11.3.0-beta4`（显示版本 `11.2.13038`）后，
arm64 `libcccreator` UUID 从私有备份的
`D6342ECD-5432-33F0-A2AD-0C28F5699994` 变为
`FDF42EF4-427D-30DF-9310-A8C7B352C5CD`。公开文字符号仍可解析，但只放行新
UUID、继续调用旧的私有上下文偏移会让隔离进程以 `SIGBUS` 退出。因此，运行时
兼容不能只检查 dylib 能否加载，必须按 UUID 绑定完整 ABI profile。

新版上下文构造/析构 thunk 分别为 `0x3fb3ec` 和 `0x3fb418`，相对旧版均移动
`0x30`。桥接器现在会在创建任何运行时对象前读取 Mach-O UUID，选择完整 profile，
未知 UUID 明确拒绝。新旧两个 profile 使用同一个缓存 `TextStyle`、同一文字、字体、
字号、画布和时间点，各自成功输出 `640x360` 透明 RGBA，且两个输出 SHA-256
字节级一致。这证明“先复用本机剪映完整二进制链路”在该受控样本上可行；它仍不等于
剪映 App 正式导出的逐帧对比结果。

双运行时门控 E2E 又用同一显式 fallback 字体，对 25 个 `ScriptInfoSticker`、每包
36 帧、相同长文本和时间参数比较了解码后的透明 RGBA。24/25 包的全部 864 帧位级
一致；`7302280874177940770` 仅第 3–7 个入场帧存在版本插值差异，整段预乘 RGBA
RMSE 为 `2.201`，最坏帧 RMSE 为 `8.241`，边界最多偏 `1px`，其余 31 帧一致。
未固定 fallback 字体时另有 4 个缺字体包分叉，因为旧私有运行时使用 macOS 黑体，
新版 App 运行时优先使用随包 `zh-hans.ttf`；这属于明确的字体降级差异，不是 ABI
兼容证据。因此跨版本测试强制使用同一可读字体，生产缓存键也包含实际字体路径和
运行时指纹。

产品链路真实 E2E 同时验证了连续序列与 5 个独立 seek 逐帧一致、透明 WebM 预览与
PNG alpha 一致、损坏预览重建、渲染缓存复用、活跃原生任务取消后恢复，以及最终
48 帧 H.264 导出。子进程测试覆盖超时、崩溃隔离和按 request ID 取消；资源测试覆盖
旧 ID 重定位与项目重开；前端测试覆盖播放、暂停预热和循环回拨同步。

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
| Top-level `TextStyle` runtime packages | 212 | 212/212 render visibly with the Jianying App path absent, with zero fallback or runtime errors |
| Proven `InfoSticker` word-art roots | 80 | 79 have flower-catalog evidence and one is recovered from a real local-project word-art selection; all 80 render visibly with the Jianying App path absent |
| Fixed `ScriptInfoSticker` matrix | 25 | 25/25 replace text and render visibly with the Jianying App path absent; 25/25 real transparent-video cases also pass |
| `ScriptInfoSticker` template-font references | 37 | 33/37 preserve their authored font; four references share three font IDs absent from all local evidence and degrade only their affected slots |
| Other cached `InfoSticker` packages | 70 | 53 have non-word-art catalog or standalone-structure evidence and 17 are dependencies of other templates; none remain unclassified or appear as top-level word-art cards |

With `JY_APP_BUNDLE` pointed at a nonexistent path, the isolated 23-library runtime completed **317/317 top-level candidates**: 212 `TextStyle` packages, 80 directly owned `InfoSticker` word-art packages, and 25 `ScriptInfoSticker` packages. This proves that the compatibility path uses the complete saved private runtime and resource packages rather than a running Jianying process. The word-art lab checks catalog ownership first. When catalog history is absent, it reads structured `text + text_special_effect` selections from local-project `key_value.json` files and structured resource references from `ScriptInfoSticker` rich text. Direct catalog/project ownership outranks dependency and package-structure evidence, so word art, standalone stickers, filters, and internal components are not conflated merely to eliminate unknowns. The current 500 recognized cached packages have zero unclassified and zero ambiguous ownership results.

The additional `InfoSticker` sample `7067070987363208485:c890d1bc4fc4c97e44f776ae3c47362d` produced visible `512x512` transparent RGBA through isolated runtime UUID `D6342ECD-5432-33F0-A2AD-0C28F5699994` while the Jianying App path was nonexistent. The product route then completed a 48-frame `1280x720` H.264 E2E with the four-character text “花字验证”. Host-text fitting had previously been restricted to `TextStyle`, which clipped this `InfoSticker`; both host-text package kinds now share alpha-bound probing and up to four font-size convergence passes. The strict zero-edge-alpha assertion passes, while `ScriptInfoSticker` retains template-slot fitting.

The fixed `ScriptInfoSticker` corpus is also **25/25 in real-video tests**. Conventional catalog recovery covers the original 21; two legacy animation IDs resolve through `third_resource_id_str` aliases and cover three more packages; the final package is missing an animation used exclusively by a shape child, so hydration removes that broken shape while preserving its dynamic text and sticker siblings. Two newer `caption` ScriptTemplates also passed dynamic-video E2E after deterministic grapheme-level `caption_duration_info` injection. Mixed-style slots now distribute longer replacements deterministically in proportion to the original slot grapheme spans instead of placing the entire tail in the final style, preserving the rough balance of mixed fonts, sizes, and colors. Three representative packages additionally pass real-video E2E with long CJK/Latin text, emoji, combining characters, and multiple lines. The script-package editing schema is part of the render-cache key, so an editor upgrade cannot reuse stale frames.

The fixed corpus now renders both short content and a long CJK/Latin, multiline, emoji, and combining-character stress string for every package. All 25 packages produce changed, visible alpha geometry without adding canvas-edge clipping. The corpus currently contains 40 editable text widgets and 56 rich-text slots; recursive editing also covers future nested widgets while preserving literal decorative text layers.

Template fonts are now first-class dependencies instead of one system font being written unconditionally into every `<font>` tag. The fixed corpus contains 37 references across 27 unique font IDs. Resolution first checks the current long ID, then recovers legacy short-ID packages through local draft mappings of `resource_id -> text/<md5>/font-file`, copying the validated package into QCut's private cache. Current local evidence resolves **33/37 references**. `SmileySans-Oblique`, `Charm-Regular`, `Antic-Regular`, `BarlowCondensed-Thin`, and `NewYork` were all relocated from legacy IDs without launching the Jianying App. The remaining four references use `7203638484756599352`, `7268259657167147577`, or `7312720780599497225`; no local font package, path mapping, or catalog record exists for those IDs, so only those slots receive the system fallback plus a `template-font-missing` diagnostic. An explicit timeline font selection still overrides every template font as requested.

Two effectStyle dependencies without `effectStyle.json` were also verified as complete runtime component packages containing `InfoSticker`/`AmazingFeature` configuration, prefabs, shaders, and materials. They are now injected as runtime components instead of being misreported as missing ordinary TextStyles.

A separate 36-animation-package matrix produced 32 directly dynamic slot animations; four CaptionModules require their ScriptTemplate host. All 16 researched advanced animations also passed 48-frame transparent-sequence and WebM E2E: all 16 contain shader components, eight contain 3D signals or meshes, and one uses cross-frame feedback. The matrix covers pixel waves, text rain, deterministic instances, Y-axis flips, cylindrical text, feedback trails, word highlighting, and duotone glitch effects. Only the intentionally full-frame effects opt into edge contact; every other sample retains the zero-edge-alpha assertion.

These advanced E2Es validate the **private Jianying runtime bridge**; they do not mean QCut has natively reimplemented Jianying's complete shader or component engine. QCut's portable path now includes transparent text textures, perspective-camera math, true Y-axis plane rotation, cylindrical meshes, and seeded per-glyph 3D jitter with a bounded current-frame trail through one synchronous Canvas renderer shared by preview and export. Pixel displacement, trapezoid warping, true cross-frame feedback, and deterministic multi-instance composition remain open. Machines without a compatible Jianying runtime can use only the implemented QCut primitives or an explicit degraded state.

The frame-parity tool locks resource identity, package kind, text, font asset, font size, canvas, placement, opacity, source time, duration, and frame rate in one manifest. Every reference must also declare its provenance: a formal Jianying export records the App version, while candidate-against-itself evidence must use `qcut-private-runtime-control`. A separate Node worker invokes the local private runtime, emits a transparent PNG sequence, and composites it at the runtime-reported coordinates over the configured background. Verification rejects mismatched dimensions, frame rates, or frame counts and measures five-stop full-frame MAE/RMSE, text-foreground RMSE, foreground-mask IoU, centroid/bounds displacement, and full-interval PSNR/SSIM. The default pass thresholds are full-frame RMSE at most `4`, foreground RMSE at most `24`, mask IoU at least `0.9`, and both centroid and bounds displacement at most `2px`; this prevents a small text region from being hidden by a low whole-frame error. A real cached `TextStyle` passed the 12-frame candidate-video E2E and render reuse; a candidate-against-itself control produced zero full-frame/foreground RMSE, mask IoU 1, zero geometric displacement, zero full-interval RMSE, and SSIM 1. The report records that result as `control`, and it never contributes to the Jianying parity pass count.

A formal same-parameter Jianying App export now exists for one `TextStyle`,
`7623376604814904638:99d51368afceae9b105af34b8403a79f`, using the text
“花字”, font size 48, and `1920x1080@30fps`. It passes with worst five-stop
full-frame RMSE `3.021`, worst foreground RMSE `5.024`, minimum foreground-mask
IoU `0.984159`, maximum bounds shift `1px`, and full-interval SSIM `0.996499`.
This is valid Jianying App parity evidence for that single `TextStyle`, not for
the full catalog. Add further exact-parameter exports and run:

```bash
bun research/jianying-runtime-probe/text-parity-matrix.ts \
  --matrix /absolute/private-evidence/text-parity-matrix.json \
  --output /absolute/private-evidence/text-parity-output \
  --mode run
```

The real manifest, Jianying reference, QCut candidate, extracted frames, and reports must remain outside the repository or under an ignored path. Only that one `TextStyle` currently has formal export parity; the result cannot be generalized until paired corpora cover `TextStyle`, `InfoSticker`, and `ScriptInfoSticker`.

This is not a claim that every Jianying word-art card is universally supported:

- The root package and transitive dependencies must be cached locally, catalog-recoverable, or covered by a verified safe-degradation rule. An absent dependency that affects the primary text or sticker content cannot be inferred.
- `TextStyle`, editable host-text `InfoSticker`, and `ScriptInfoSticker` packages with rich-text slots can accept user text. A genuinely flattened `InfoSticker` can reproduce its authored resource but does not become an arbitrary-text template.
- The compatibility layer currently requires a matching Jianying private runtime on macOS; it is not portable to Windows, Linux, or machines without that runtime.
- All 113 currently valid top-level `AmazingFeature` packages now have ownership evidence: 105 match filter records by exact `resourceId + md5`, five are stale cached versions of the same filter resource IDs, and three catalog misses contain the complete `Filter.material`, filter-shader, and LUT-payload fingerprint and are classified structurally as filters. No top-level word-art package was found. Nested `AmazingFeature` components referenced by a proven text root still run through the private runtime dependency graph; standalone filter packages are never treated as text entry points. These totals are a mutable local-cache snapshot; classification does not depend on a fixed count.
- Jianying binaries, fonts, Lua, shaders, textures, and cached packages remain local and are never committed or redistributed with QCut.

The accurate status is therefore: **100% rendering success for locally resource-complete packages of the recognized kinds**, not 100% native reproduction of Jianying's entire online catalog on arbitrary machines.

### Jianying Binary Version Adaptation (2026-08-13)

After the installed app updated to `CFBundleVersion 11.3.0-beta4` (display
version `11.2.13038`), the arm64 `libcccreator` UUID changed from the private
backup's `D6342ECD-5432-33F0-A2AD-0C28F5699994` to
`FDF42EF4-427D-30DF-9310-A8C7B352C5CD`. The public text symbols still resolved,
but accepting only the new UUID while calling the old hidden context offsets
made the isolated renderer exit with `SIGBUS`. Binary compatibility therefore
requires a complete UUID-pinned ABI profile, not merely a successful `dlopen`.

The new context constructor/destructor thunks are `0x3fb3ec` and `0x3fb418`,
both `0x30` later than the old profile. The bridge now reads the Mach-O UUID
before creating runtime objects, selects the matching complete profile, and
rejects unknown UUIDs. Both profiles then rendered the same cached `TextStyle`
with identical text, font, size, canvas, and timestamp into visible `640x360`
transparent RGBA frames whose SHA-256 values matched byte for byte. This proves
controlled reuse of both local binary versions; it does not replace formal
frame parity against a Jianying App export.

A gated two-runtime E2E also compares decoded transparent RGBA for all 25
`ScriptInfoSticker` packages at 36 frames each with identical content, timing,
and an explicit shared fallback font. Twenty-four packages are byte-identical
for all 864 frames. `7302280874177940770` differs only on entrance frames 3-7:
whole-sequence premultiplied RGBA RMSE is `2.201`, worst-frame RMSE is `8.241`,
and bounds move by at most `1px`; its other 31 frames match. Without a pinned
fallback, four additional packages with genuinely missing template fonts differ
because the backup runtime selects the macOS system font while the installed
runtime selects its bundled `zh-hans.ttf`. The version gate therefore pins one
readable fallback and keeps both the runtime fingerprint and selected font path
in product cache identity.

Product E2E additionally proves sequence/independent-seek identity, alpha-preview
consistency and repair, cache reuse, cancellation recovery, and 48-frame H.264
export. Process tests cover timeout, crash containment, and request-scoped
cancellation; resource tests cover legacy-ID relocation and project reopen; UI
tests cover playback, paused prewarming, and backward loop resynchronization.

### Long-Term Architecture

1. Extend the reusable transparent offscreen text surface from projective meshes to bounded pixel-displacement passes.
2. Extend the per-glyph 3D pass with trapezoid warping and a deterministic cross-frame feedback graph.
3. Add a bounded, deterministic text-snapshot instance renderer.
4. Keep caption word timing separate from generic text animation sequencing.
5. Preserve derived formulas and tests in the repository, but never redistribute Jianying package assets.
