# lsanim 池:第一次 shader 普查的漏判 / The lsanim pool: a missed family

日期 / Date: 2026-08-17 · 分支 / branch: `effects-v2`

## 漏判 / What was missed

RECLASS-2026-08.md 把 164 个包判为"字符层为空、无可移植物"。**其中 65 个
带明文 `studioAnim.lsanim`** —— 正是 AE 关键帧模型格式(`Text_BaseSelector`
+ `motionKeyFrameInfo`),与我们移植得最成功的那批同源。43 个有 ≥2 条动画
轨道,最富的 发光旋入 有 16 条轨 + 2 个 selector。

**根因是度量错配**:普查用 `charWrites`(Lua driver 里 `char.* =` 写入数)
判断可移植性,而 **lsanim 家族根本没有 Lua driver —— AE 模型本身就是动画**。
指标对该家族恒返回 0,那个"构造性的零"被读成了"空"。同一会话内的同类错误
还有:漏看 `textTimeData.words`(字幕逐词时钟)、误称 bloom 无消费者。

教训:**任何可移植性指标必须先声明它适用于哪个格式家族**,跨家族套用等于
没测。

RECLASS-2026-08.md 中"164 个无独立预设价值"一句就此作废;正确数字是
**99 个**(有 Lua driver 且 charWrites=0 —— 对那个家族指标适用,判定成立)。

## 能力对照 / Capability mapping

65 个包用到的效果,与本会话建成的能力几乎一一对应:

| 源效果 | 出现 | QCut 对应 |
|---|---|---|
| SoftGlow / DeepGlowSimple / SGlow / RadianceGlow | 32 | bloom(WebGL2) |
| RadialBlur | 11 | echo(近似) |
| DirectionalBlurs | 10 | dirBlur |
| WaveWarp / TurbulenceDisplacement | 13 | displace |
| ChromaticAberration | 8 | rgbSplit |
| AlphaOutline | 7 | outlineAmount |
| GaussianBlur | 7 | blurPx |
| Dust | 4 | shatter |
| LinearWipe / Shake / Mosaic / Trail | 5 | mask / jitter / pixelate / echo |

无对应的只有 6 种,各出现 1–2 次:GodRay、LayeredReplacement、
PixelSprint、RoughEdge、DistortChroma、CrossBlur。

**效果链 100% 有对应能力的包:58 个**;有缺口的 7 个。

## 结构约束 / Structural constraint

按需要的 raster pass 数分布:

- **0 或 1 个 pass:45 个** —— 现有单槽 raster 链即可,**可立即移植**
- **2 个:15 个**,**3 个:5 个** —— ✅ **raster 链式已建成**
  (`postProcess.raster` 单值 → 数组;`applyTextAnimationRasterPasses`
  用 post-chain-a/b 两个 ping-pong 缓冲逐个跑,只有最后一个 pass 画进
  目标 ctx)。链序固定为 **几何 → 色度 → 辉光**
  (displace / echo / dirBlur → pixelate / rgbSplit → bloom),与剪映
  effectAnimators 的堆叠顺序一致 —— 辉光对前序结果起晕才正确。
  padding 按全链累加。这 20 个包现在也可移植。

另有多 selector 包(如 横向分割 用 3 个 selector 让不同字符组反向移动)
超出当前单 selector 支持。

## 首批(已合入)/ First batch

`keyframe-documents-lsanim-a.ts` + 解码器 `scratchpad/decode_lsanim.py`
(句柄已是相对偏移,`t/D` 归一后与 TextKeyframePoint 一一对应):

| 预设 | 源 | 要点 |
|---|---|---|
| firework-burst-in | 烟花爆破 | 0.3→1 爆开 + 暖色 DeepGlow(exposure 1.05→0,tint 转 colorTrack) |
| light-wave-in | 光波扩散 | 距离 −1→0 滑入 + 蓝紫辉光;丢弃 Shake pass |
| blur-resolve-in | 模糊显现 | 单一 GaussianBlur 50→0 长缓清除 |
| outline-trace-in | 逐字显现2 | AlphaOutline 描边 + 蓝→青→琥珀→珊瑚 循环色 |

## 第二批(已合入)/ Second batch

`keyframe-documents-lsanim-b.ts` —— 9 个出场/循环预设,用生成器
`scratchpad/gen_lsanim.py`(映射表 + 缩放系数固化在代码里,避免多次
转录漂移)批量产出后逐个复核:

pixel-glow-out(像素辉光,Mosaic 解构)、brighten-fade-out(亮度渐变)、
blur-fade-out(模糊淡出)、dust-scatter-out(破碎消散)、
glitch-dissolve-out(故障消散)、smear-fade-out(文字淡隐)、
energy-pulse-loop(能量脉冲)、flash-loop(文字亮闪)、
color-flash-loop(闪色循环)

## ⚠ 关键限制:运动在加密脚本里 / Motion lives in encrypted script

生成 38 个候选后发现:**其中 34 个的字符运动在 `custom_script`
(加密 .jsdat 表达式选择器)里,只有效果链可读**。移植它们只能得到
"静态文字 + 光晕",名字里的"旋入/滑入/归位"全丢 —— 那是目录噪音,
不是移植。

因此筛选标准改为:**可读的效果链是否就是该预设的身份**。
- 是(模糊淡出、故障消散、亮闪…)→ 移植
- 否(发光旋入 的"旋"、左滑入场 的"滑"…)→ 跳过

据此,65 个 lsanim 包的**实际可移植数约 13 个**(已全部完成),
而非早先估计的 58。"58 个效果链全覆盖"只说明能力够,不代表内容够。

人工复核发现并修正的三处生成偏差:
1. 金粉拉开 与已移植的 light-wave-in 运动骨架逐字节相同(仅 tint 不同)→ 丢弃
2. 横向分割 需 3 个 selector 做反向分离,单 selector 版丢了"分割"身份 → 丢弃
3. 故障消散 色差 ×600 系数产出 300 px 分离(远超可读)→ 按曲线形状重标定到 26 px

## 下一步 / Next

1. ~~继续移植~~ ✅ 可移植的已做完(13 个)
2. ~~raster 链式~~ ✅ 已建成
3. 多 selector 支持 → 解锁 横向分割 类
4. 6 种无对应效果按需评估(GodRay 出现 2 次,可能值得做)
