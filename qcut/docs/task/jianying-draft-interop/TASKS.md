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
| L1-L8 | 未开始(规划) |
