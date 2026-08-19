# 导入侧放宽指纹:实验室对齐方案任务清单

> 2026-08-19 · 规划文档,先不动手
> 思路:互导缺的「映射目标 + 验收方法论」正好是各实验室已积累的资产——滤镜/转场/特效/贴纸实验室
> 与草稿互导读同一套标识体系(rp.db、artistEffect 缓存、resourceId/hash),实验室的
> 「参照采集 → 拟合/映射 → 平价验收 → 闸门内部先行」流水线就是 capability 矩阵要求的
> 「对真剪映验证后开闸」。现状与差距总盘点见 [README.md](README.md)。

## 前置事实(代码锚点)

- 导入准入闸在 `packages/editor-core/src/jianying-draft/import/qcut-mapping.ts:163`:
  `capability !== "exact"` 一律不跨,进 `skipped` 报告。**downgrade 今天没有准入通道**。
- beta4 验证默认指纹: `import/beta4-video-segment-defaults.ts`、`beta4-video-material-defaults.ts`、
  `beta4-default-companions.ts`;关键帧只认 `beta4-position-keyframes.ts` 的双通道线性 X 形状。
- 转场导入映射先例: `import/capcut-8-1-transition-mapper.ts`(仅原生叠化)。
- 实验室资产:滤镜拟合配方 `apps/web/src/lib/filters/jianying-parity/`(13 个配方/预设文件,
  带留出+网格双分数);转场 `apps/web/src/lib/transitions/`(`transition-resource.ts`、
  `jianying-timeline-preview.ts`);特效 jianying-local 原生运行时 + 区间特效段(T5 阶段2);
  贴纸 `apps/web/src/lib/stickers/local-sticker-manifest.ts` + `@qcut/editor-core/sticker-lab`。

## 任务列表

### L0 · downgrade 准入通道(基础设施,一切内容映射的前提)

- **目标**:允许能力级为 downgrade 的段跨进 QCut,并在导入报告中声明近似方式与保真度。
- **改动文件**:`import/qcut-mapping.ts`(准入分支)、`import/validation.ts`(issue 结构加
  approximation 字段)、`draft-interop/capability.ts`(如需细分 downgrade 子级)。
- **代码核心**:`exact` 直跨不变;`downgrade` 带 `{approximation, fidelityEvidence}` 才准入,
  否则维持 skipped;opaque/blocked 语义不动,foreign envelope 保真不动。
- **验收**:现有导入测试全绿(exact 行为零变化)+ downgrade 准入/拒绝的新单测。
- **规模**:1 天。

### L1 · 真剪映验收 harness(方法论复用)

- **目标**:一条可复跑的「构造剪映草稿 → 剪映原生导出 → 与 QCut 渲染逐帧比对」流水线,
  作为 L2-L8 每次开闸的回执生产器(registry `verificationEvidence` 用)。
- **新增文件**:`scripts/interop-parity/`(草稿构造器 + 帧比对器,复用滤镜实验室采参照
  与隔离验收方法——记住 SSIM 会被错模型骗过,必须做「有/无该特性」隔离对照)。
- **代码核心**:参数化生成单变量草稿(只含被测特性),比对报告落盘为带分数的参照记录。
- **规模**:2 天(此后每项开闸边际成本大幅下降)。

### L2 · 变换标量:旋转/缩放/透明度/位移 → transform

- **目标**:带 clip transform 的视频/图片段从 opaque 变 **exact**(纯几何,无需近似)。
- **改动文件**:`import/beta4-video-segment-defaults.ts`(指纹放宽)、
  `import/static-video-mapper.ts`(clip → QCut transform 映射)。
- **验收**:L1 harness,若干旋转/缩放/透明度组合逐帧比对。
- **规模**:1-1.5 天。

### L3 · 变速标量 → playbackRate

- **目标**:常速倍率段(无变速曲线)变 **exact**。
- **改动文件**:`beta4-video-segment-defaults.ts`、`static-video-mapper.ts`
  (source_timerange = target × speed 一致性校验已在,接到 playbackRate)。
- **验收**:harness 比对时长与抽帧对齐;变速曲线仍 opaque。
- **规模**:1 天。

### L4 · 关键帧形状扩展

- **目标**:逐形状放宽(双轴位移 → 缩放 → 透明度 → 非线性插值),每个形状独立开闸。
- **改动文件**:`import/beta4-position-keyframes.ts` 及新增形状校验模块。
- **验收**:harness 按时间采样位置/尺寸/alpha 比对插值曲线。
- **规模**:每形状 0.5-1 天。

### L5 · 转场家族(实验室资产最成熟,建议内容类第一个做)

- **目标**:按 resource id 对表转场实验室的 15+ 重实现,叠化之外的原生转场变 downgrade/准 exact。
- **改动文件**:新增 `import/beta4-transition-mapper.ts`(以 capcut-8-1-transition-mapper 为模板),
  映射表指向 `apps/web/src/lib/transitions/transition-resource.ts`。
- **验收**:转场实验室的批渲平价测试线现成,直接产回执。
- **规模**:1-2 天。

### L6 · 滤镜段 → 拟合配方

- **目标**:resource id 命中 `jianying-parity/` 已拟合配方的滤镜段变 **downgrade**,
  导入 issue 中携带该配方的留出/网格双分数作保真声明。
- **改动文件**:新增 `import/beta4-filter-mapper.ts` + resourceId→recipe 映射表。
- **代码核心**:映射表只存 id → QCut 配方引用,不携带任何剪映资产;未拟合 id 维持 opaque。
- **规模**:1-1.5 天(覆盖面随滤镜实验室拟合进度增长)。

### L7 · 特效段 → jianying-local 区间特效(本机条件)

- **目标**:特效段映射为 QCut effect 元素(engine = jianying-local,T5 阶段2 已支持),
  条件 downgrade:资源在本机剪映缓存才准入,否则维持 opaque。
- **改动文件**:新增 `import/beta4-effect-mapper.ts`;能力裁决加「本机可用性」条件维度(L0 扩展)。
- **注意**:jianying-local 元素本身导出阻塞(`build.ts:106`)且机器绑定——导入后再导出该段
  仍会被挡,属预期,issue 里说清楚。
- **规模**:1.5-2 天;实验室闸门内部先行。

### L8 · 贴纸段 → 贴纸实验室剪映参照(本机条件 + provenance)

- **目标**:贴纸段按 resourceId/hash 对表本机参照目录,条件 downgrade。
- **改动文件**:新增 `import/beta4-sticker-mapper.ts`,对接 `local-sticker-manifest.ts`。
- **纪律**:provenance 标注(剪映参照 · 内部)全程保留;参照内容不进 Git、不进公开渠道。
- **规模**:1-1.5 天;内部闸门。

## 顺序建议

L0 → L1(基础)→ L5 转场(平价线最全)→ L6 滤镜(有量化分数)→ L2/L3/L4(纯语义,
harness 复用,可穿插)→ L7/L8(本机运行时路径,内部先行)。总量约 10-14 天。

## 三条不变边界

1. **本机依赖分两类**:滤镜/转场配方是提交进 QCut 的重实现(机器无关,覆盖面按拟合进度长);
   特效/贴纸/花字走本机剪映缓存(能力裁决必须带本机可用性条件)。
2. **合规不变**:映射表只存 resource id → QCut 等价物引用;不解密、不搬运、不分发剪映资产。
3. **写回不受益**:映射成实验室等价物后字节身份即断,这些段在同 profile 写回中仍是结构变更
   (拒绝);opaque 信封保真照旧。放宽的是「能编辑」,不是「能无损回写」。

## 状态

| 任务 | 状态 |
|---|---|
| L0 downgrade 准入通道 | ✅ 2026-08-19 landed(timeline-v2)。`InteropSegment.downgrade` 声明 + `qcut-mapping` 声明门准入 + plan `downgrades` 清单 + bundle 解析(顺手修了 skipped nodeType 缺 "transition" 的既有缺口)。文本段沿用旧 downgrade 通道未动。 |
| L1 真剪映验收 harness | ✅ 2026-08-19 landed + 真机首采完成。代码:`scripts/jianying-parity/`(5 个单变量用例 + 构建/注册 CLI + 隔离纪律比对器 + 回执)。**真机实测结论**:(1) beta5 能扫描列出 beta4 明文草稿但**拒绝打开**(「草稿内容已损坏」,缺加密 meta)——`--register` 路线对 beta5 不可用;(2) 退路 UI 作草稿已跑通并采到 transform-rotation 的 on/off ground truth(640×360/90帧,`.local/jianying-parity/cases/transform-rotation/jianying-{on,off}.mp4`);(3) **语义结论(比对器裁定):剪映 UI 旋转 +30° = 屏幕顺时针,与 CSS/QCut 同向**——最初目测成逆时针,帧比对抓出镜像,肉眼判断旋转方向不可信。剩余 4 case(alpha/position/scale/speed)待下个 UI 窗口采集(每个约 90 秒,透明度字段编辑要先 zoom 验证再导出)。 |
| L2 变换标量 → transform | ✅ 2026-08-19 landed + **首份真机 pass 回执**。指纹放宽(`readBeta4ClipTransform`:alpha/rotation/统一 scale/静态位移)、visual 走 QCut 约定(半画布单位×canvas/2,旋转同号)、plan/物化/bundle 全链透传。**顺带修了 QCut 全局导出 bug**:媒体元素 transform 在所有导出管线都被丢弃(时间线快照 media 分支漏序列化 + 主进程分段管线无 transform 滤镜),已修快照序列化 + 主进程 ffmpeg 变换链(scale→rotate→pad/crop→opacity)。transform-rotation 平价:isolation 128.6 / parity 16.0 / cross 128.6 / baseline 8.5 → **pass**(比对器统一 bt709 解码假设 + 相对阈值:残差 ≤ 底噪+15%×特征强度)。渲染器引擎(Standard/Optimized/CLI)的同类缺陷未修,已记 TODO。 |
| L3 变速标量 → playbackRate | ✅ 2026-08-19 landed。指纹放宽:常速 companion(`isConstantRateSpeed`,须与段 speed 一致)+ 时序关系校验(target = source ÷ speed,±1µs 容差)+ 曲线变速/不一致维持 opaque。导出侧:segment `duration` 定为时间线秒 + `playbackRate` 字段,视频 `setpts=(PTS-STARTPTS)/rate` + **必须链内 `fps=` 阶段**(仅靠输出 `-r` 会把 90 帧错采成 47 帧/斜率 1.914,链内 fps 精确 2×,实测 45帧/1.500s/逐帧 2N 映射),音频 atempo 链([0.5,2] 分段)。QCut 侧自检通过(on 第 N 帧 = off 第 2N 帧)。**2026-08-19 第二个副屏窗口:四案 ground truth 采集完成,全部一次 pass**——L2+L3 的五个案例全部拿到真机回执:rotation(parity 16.0) / scale(6.9) / alpha(5.2) / position(8.2) / speed(8.5),isolation 42-163、baseline 8.5,回执在 `.local/jianying-parity/cases/*/receipt.json`。UI 采集补充经验:数值框 triple_click 比 double_click 可靠;倍数框输 "2" 会追加成 1.20x,须输 "2.0";一个全默认 off 导出可复用为全部 transform/speed 案例的共享基线。 |
| L4 关键帧形状扩展(阶段1) | ✅ 2026-08-19 landed。**双轴线性位移**:放开 Y 通道(此前 Y 值非零即 unsupported),Y 按 canvasHeight/2 归一(与 X 对称的候选语义,待专属平价回执);形状证据边界不变(仅真机双通道 Line 形状,alpha/scale/非线性因无明文样本留后)。导出侧:线性位移关键帧 → 时变 crop 表达式(`buildLinearTrackExpression` 分段线性 + `\,` 转义;变速时按 t/rate 采样时间线时钟),动画幅度并入 pad 计算;快照序列化补上 media keyframes(又一处既有缺失)。QCut 端到端验证:kf-position-xy 案例导入→导出,0s 居中/1s 半程/2s 满偏移(+80px,-36px)/尾段保持,逐帧正确。**2026-08-19 第三个副屏窗口:两案 ground truth 采集完成**——kfx 一次 pass(parity 11.5);kfxy 首跑 fail 触发 **Y 轴语义裁决**:对 off 帧做平移匹配,剪映实测位移 (80,+36) rmse 2.8 → **剪映 Y 轴上正(数学系),QCut 下正,映射取负**(UI Y=-72 渲染向下 36px;L2 静态位置映射同病同修,当时只测了 X 未暴露);取负后 kfxy pass(parity 13.6)。**七个平价案例全部持有真机 pass 回执**。UI 采集经验:片段上点击会挪播放头,先 home 归零再 →×60 步进到帧;◇ 在非关键帧时刻显示空心属正常。 |
| L5 转场家族 | ✅ 2026-08-19 landed + 端到端真机链路验证。新增 `import/beta4-transition-mapper.ts`:验证过的原生叠化维持 exact;**目录化原生转场 → 转场实验室预设的声明式 downgrade**(左移/右移→push、翻页、横移模糊、闪黑/闪白,id 来自本机 ressdk_db 目录,只存 id→QCut 预设引用,不携带剪映资产);未目录 id 维持无声明 downgrade(不准入)。接缝几何规则与 CapCut 映射器一致(相邻贴合、时长 ≤ 2×min 邻段)。**顺带修了既有缺口**:companion 计数把 transition ref 当处理伴生数,导致带转场的段永远不 exact——现按 bucket 过滤。plan 转场结构放宽(presetId/type/easing/direction/tuning)+ `downgrades` 清单收转场准入 + bundle/物化透传 direction/tuning。**端到端验证**(测试草稿 左移@0.5s 接缝):导入被指纹门拦下→接受声明指纹→导入成功,时间线 2 元素 + move-left/push/direction right 转场,导出接缝帧呈现左推(旧画面左出、新画面右入)。教训:改完 editor-core 必须 `bun run build` 再做真机验证——热身窗口曾用旧包复现「只剩 1 段无转场」假象。**2026-08-19 第四个副屏窗口:左移 ground truth 采集完成,回执已出**——结论分两层:(1) **推挤本体对齐**:边界逐帧测量 JY vs QCut 最大偏差 9px/640,接缝中点(90帧)完全一致(parity 7.0),窗口同为 0.5s 接缝居中、对称 quint 类缓动;(2) **原生左移在两翼(±0.1s)带风格化修饰**(模糊/缩放复合,纯时移和纯缩放假设都被匹配测试否定),QCut move-left 纯推挤不含此层 → mean parity 15.0 超严格上限 11.0,`parityBeatsCross` 通过(15.0 ≤ 0.5×43.0)→ 回执 verdict fail(诚实记录,downgrade 声明的 fidelityEvidence 已引用该回执数字)。**剪映无余量转场语义**:素材出点无 handle 时弹「添加重复帧创建转场」,不改片段时长。采集顺利一次成型(新建草稿→双板相邻→off 导出→拖左移改 0.5s→on 导出,约 2 分钟)。 |
| L6 滤镜段 → 拟合配方 | ✅ 2026-08-19 landed + 端到端真机链路验证。新增 `import/beta4-filter-mapper.ts`:**57 条 resource_id → `jy-*` 拟合配方引用**(55 个已拟合预设;去雾/黑金各双 id),id/名字来自本机 ressdk_db http_cache(effect_item_list,effect_type 12),表内只存 id→QCut 引用、零剪映资产。挂接:视频段恰带一个目录化 filters ref → 段能力 downgrade + 声明(`filter-lut-recipe:<presetId>`,证据引用拟合残差 3-8 RMSE/255)+ `filterPreset {presetId, presetVersion, intensity}`(剪映 value 0-1 → QCut 0-100,缺省=100 拟合平价点);未目录/名字不符/value 越界 → 维持 opaque 不准入。companion 计数排除 filters bucket(同 L5 transitions 手法,否则带滤镜的段永不 exact)。物化:plan 元素 `filter` → `element.color`(新增 `import-media-color.ts` 中性 color 工厂,只开 filter 层)。**端到端**:fixture 草稿(怀旧@0.8)导入 → 指纹门 → 接受 → 时间线元素 `color.filter = {jy-nostalgia, v1, 80}`,邻段干净。**形状契约注记**:本地无明文 beta4 滤镜草稿样本,材料形状契约为 fixture 定义(type/resource_id/name/value),偏离契约一律不跨界——待某个 UI 窗口用真机滤镜草稿验证(但 beta5 加密,可能永远只能靠导出平价而非草稿样本)。**缺口已修(2026-08-19 同日)**:claude 导出引擎原本完全不渲染 color(滤镜/LUT/曲线全丢)。修法:渲染器在导出快照里把 filter 预设折算成 17³ LUT cube(`resolveColorFilterSettings`,与 video-properties 导出线同构;`hasMediaColorEdits` 守卫保证未调色段字节不变),主进程 `buildExportSegmentScaleFilter` 在 fit 与几何变换之间插入 `buildVideoColorFilter` 链(调色须在 pad 之前,否则黑边被提亮)。**端到端验证**:jy-nostalgia@80 项目导出,白色 255→231 与预览 cube 采样逐点吻合;lut3d 无二次编码时全点 ≤0.8/255(纯红也是),导出对比中的 8-18 残差归因为二次 H.264 4:2:0 色度量化(该合成板已知编码底噪),非渲染缺陷。配方保真由滤镜实验室拟合平价线背书,导入侧不重复采集。 |
| L7-L8 | 未开始(规划) |
