# 字幕动画移植线(karaokeMode 家族)/ Caption karaoke porting line

日期 / Date: 2026-08-17 · 分支 / branch: `text-animation-v3`

## 定位 / Positioning

剪映字幕面板的 156 个动画是逐词时间戳机(`textTimeData.words` 语音
对齐时钟)。QCut 对应的产品面**已存在**:转写词级时间
(`TranscriptionSegment.words` / SmartEdit `WordItem`)+ 卡拉 OK 渲染
系统(`SubtitleStyle.karaokeMode` + `getKaraokeSegments()` 纯函数 +
ASS 导出 \k 标签)。移植 = 给 karaokeMode 加档位,用真词钟,零时钟
语义损失。与文字动画预设线互补(那边 word-stagger、无需转写)。

## 机制家族收敛 / Mechanism families(122 个独立名称)

| 家族 | 成员 | 状态 |
|---|---|---|
| 吉祥物跟随/弹跳 | 18 | 贴纸资产阻塞(奶茶鼠/小狗/水豚 sprite) |
| 砸入/缩放 | 6 | **✅ slam 已上线**(缩小的 (.43,.09,.44,.96) 曲线) |
| 弹簧/弹性 | 2 | **✅ spring 已上线**(exp(−7t)·sin 弹性) |
| 重叠/覆盖 | 2 | **✅ overlap 已上线**(1.35→1 落下) |
| 扩展/字距 | 1 | **✅ expand 已上线**((.074,0,.324,1) 展开) |
| 扫光/高亮 | 6 | **✅ shine 已上线**(带峰扫过活动词) |
| 波浪/律动 | 6 | **✅ pulse 已上线**((.72,0,.28,1) 节拍;RGB 分离未表达) |
| 弹跳/弹入 | 3 | 现有 bounce 档已覆盖基形;变体待评 |
| 打字机/渐显 | 9 | 现有 typewriter 档覆盖基形;括号/滑入变体待评 |
| 翻转/翻动/空翻 | 6 | **✅ flip 已上线**(360° 展开;源的投影翻转以 2D 转读出) |
| 飞入/集合 | 6+ | **✅ fly-in / gather 已上线**(飞入:(.0,.78,.2,.99) 斜升 + 定向模糊清除;集合:(.16,.81,.44,1) 右滑) |
| 故障/闪烁 | 2 | **✅ glitch 已上线**(种子化 8 步 alpha 抖动 + 高亮闪,后 1/4 落定) |
| 模糊滚动 | 1 | **✅ blur-roll 已上线**(×1.5/×.7/×.7/×1.2 脉冲列 + 4px 模糊清除) |
| 雨刷/擦除 | 1 | **✅ 已移植为 loop 预设 `wiper-swing`** — 读 driver 后发现它根本不是擦除:整块绕低支点摆动 ±20°(quadOut/quadInOut/quadIn 三段),由页进度而非词钟驱动,所以归文字动画预设线而非 karaokeMode |
| 调皮/随机 | 2 | **✅ mischief 已上线**(±15° 摇 + 下沉,mischief-hop 轨道上词钟) |
| 排版风格类(下划线/大字报/拼贴/多行排版) | ~30 | 非动画 — 属字幕样式预设,另一个系统 |

收敛结论:**动画机制 ~15 个家族**,与估计(15–25)一致。首批 6 档
已用真词钟上线;再做 5 个家族需给 `KaraokeSegment` 扩字段
(offsetX / rotation / blur),两个家族现有档位已覆盖基形。

## 首批实现 / First batch(已合入)

- `KaraokeMode` 新档:`slam / spring / overlap / expand / shine / pulse`
- 曲线全部照抄 driver(见 RECLASS-2026-08.md 补记);时钟 = 真词钟
- 接线:karaoke-types / karaoke-utils(cubicBezier 求解器 + 6 函数)/
  editor-core SubtitleStyle 联合 / 属性面板与歌词卡 label map / i18n
  zh+en / 单测 ×6
- 导出:ASS 通道对非 none 档统一走逐词 \k 计时(既有行为)

## 第二批(已合入)/ Second batch

`KaraokeSegment` 扩 `offsetX / rotationDeg / blurPx`,span 渲染器
应用 translate/rotate/filter。新档:`fly-in / gather / flip /
blur-roll / glitch / mischief`。至此 15 个动画机制家族中 **13 个有
档位**(11 新 + bounce/typewriter 既有),剩余:雨刷(gradient
近似)、随机出现(词钟本身即随机序,无需新档)。

## 遗留 / Remaining

1. 排版风格类(~30)与字幕样式预设系统对接(独立议题)
3. 吉祥物类(18):贴纸资产阻塞
