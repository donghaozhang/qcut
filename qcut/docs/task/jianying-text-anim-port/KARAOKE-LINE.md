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
| 翻转/翻动/空翻 | 6 | 待做 — KaraokeSegment 需加 rotationX/Y |
| 飞入/集合 | 6+ | 待做 — 需加 offsetX(现仅 offsetY) |
| 故障/闪烁 | 2 | 待做 — 需 color 闪烁序列,可用现 color 字段 |
| 模糊滚动 | 1 | 待做 — 需 blur 字段 |
| 雨刷/擦除 | 1 | 待做 — 需逐词内 clip/gradient(color 梯度可近似) |
| 调皮/随机 | 2 | 待做 — 需 seeded per-word 随机 |
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

## 下一批 / Next

1. `KaraokeSegment` 扩 `offsetX` + `rotationDeg` → 飞入/集合、翻转家族
2. 故障闪烁(color 序列)与雨刷(gradient 近似)
3. 排版风格类与字幕样式预设系统对接(独立议题)
