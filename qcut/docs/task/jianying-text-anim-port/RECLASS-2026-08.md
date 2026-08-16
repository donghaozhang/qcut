# Shader 池复查(bloom 能力落地后)/ Shader-pool reclassification

日期 / Date: 2026-08-17 · 分支 / branch: `text-animation-v3`(PR #417)

## 背景 / Context

复现线的 5 个真字符数学候选全部移植后,对"字符层为空、内容在装饰性
shader 里"的剩余包做第二次分类 —— 这次的能力上限包含:WebGL2 bloom
pass(`text-animation-gpu-pass.ts`)、`outlineAmount` 通道、per-unit
辉光、最强 unit 驱动的 raster pass、参数化 marquee。

After the five real char-math candidates shipped, the shader-decorated
remainder was re-classified against the NEW capability ceiling (WebGL2
bloom, outlineAmount, per-unit glow, strongest-unit raster, marquee).

## 方法 / Method

三层信号,逐层收紧(脚本在会话 scratchpad,结论如下):

1. 全量:619 包中可读、未移植(按 i18n 中文名匹配)、非 caption → **172**
2. 关键词计数含模板噪音(GlowBlurLayerScript 引入即 +9),收紧为
   **seek/updateAnim 内主动驱动的 uniform 写入** → 仅 1 个逐帧驱动
3. 辉光多为**初始化静态配置**(动画在 alpha 层)→ 改查 prefab/scene/
   init 层的 glow 挂载 → **8 个真候选**

## 结论 / Verdict(8 个真候选)

| 包 | 相位 | 判定 |
|---|---|---|
| 发光模糊多行 | loop | **范围外** — 实为 caption 排版机(c_module 分页/逐词),辉光是静态装饰 |
| 拖尾(入场 7244102915239973432)| entrance | **可做** — 13 份同心缩放回声(0.5→1,bezier .167/.167/.48/1,错峰 (4+i)/34,长满即隐)+ AE 缩放/高斯轨。需给 keyframes 文档加 trail 通道(trailStrength/trailSamples 状态已存在,缺通道接线) |
| 拖尾(出场 7244102819731477049)| exit | **可做** — 入场的镜像(同族 driver) |
| 向左模糊 | exit | **可做** — 方向性模糊;raster pass 加 "dirBlur" kind(沿方向多次 drawImage 低 alpha 叠印)即可,连 WebGL 都不用 |
| 缤纷冲屏 | entrance | **可近似**(已读,7116829842271638053)— 三层实例 ×8 档 Deep_Glow + 径向模糊冲屏 + 高斯。径向模糊≈echo kind(小 spread 多壳),deep glow≈bloom,冲屏≈scale 过冲 —— 无需新能力,但 939 行 driver 转录量大,留作下批 |
| 影像叠加 | loop | **阻塞** — 混合模式 + 影像纹理 |
| 拼贴纹理 | loop | **阻塞** — 纹理拼贴素材 |
| 彩色火焰 | loop | **阻塞** — 程序化火焰 shader(多 pass 噪声场,超出 raster pass 表达力) |

其余 164 个可读未移植包:辉光/模糊仅为静态装饰或无视觉主体,不构成
独立预设价值 —— 与上次"其余 70 个字符层为空"的结论一致,这次的口径
覆盖更全(172 > 70 是因为包含了全部 no-lsanim 家族的可读 driver)。

**bloom 的直接消费者**:发光类循环预设(文字泛光/霓虹类 look)不在
未移植池里 —— 那一族要么已按近似移植(可回头升级为 bloom 版),要么
是"自己写"阶段的原创素材。bloom 能力的主要价值在后者。

## 下一步 / Next

1. ~~拖尾对~~ ✅ echo raster kind(带符号 spread)→ echo-trail-in / echo-trail-out
2. ~~向左模糊~~ ✅ dirBlur raster kind → blur-left-out
3. ~~缤纷冲屏判定~~ ✅ 可近似(echo+bloom+scale 组合),转录留作下批
4. 已移植的发光近似预设(glow-flicker 等)可选升级:glowIntensity →
   bloomIntensity(视觉从 shadowBlur 换成真 bloom)
5. 之后进入"自己写"阶段(README §7 的命名决策仍待定)
