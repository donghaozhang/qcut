# 剪映特效补齐 — 实现映射(44 个缺失)

现有 124 个特效已覆盖截图中 30 个名字;缺 44 个。按渲染原语分类如下。
约定:id 前缀按分类(dynamic-/camera-/atmosphere-/basic-/light-…),中文名走内联 localizedName,releasedAt=2026-07-27,热门截图出现的条目 popularityScore 91-93(进热门 Top12),其余 55-88。

## A. 纯目录数据(30 个,零渲染代码)

### motion(新文件 effect-motion-extra-catalog.ts,12 个)
| 中文名 | id | 通道方案 |
|---|---|---|
| 渐渐放大 | camera-slow-zoom | scale linear ramp +0.25,低频 |
| 镜头摇晃 | dynamic-lens-wobble | x/y sine 0.012/0.016 + rotation 1.2° 不同相位 |
| 推近推远 | camera-push-pull-fast | scale sine ±0.12,0.5Hz |
| 位移抖动 | dynamic-offset-jitter | x/y sine 高频 6-8Hz 小振幅 |
| 震动屏闪 | dynamic-shake-flash | x/y sine 7Hz + opacity sine ±0.35 14Hz |
| 动感心跳 | dynamic-power-heartbeat | scale sine ±0.10 2.2Hz + rotation 0.6° |
| 丝滑运镜 | camera-silky-glide | x sine 0.02 0.18Hz + scale sine 0.05 0.12Hz |
| 跟随运镜Ⅱ | camera-follow-2 | x cosine + y sine 慢速(现有 camera-follow 变体) |
| 镜头变焦 | camera-lens-zoom | scale sine ±0.18 0.35Hz |
| 渐隐闭幕 | camera-fade-close | opacity linear -1(整段渐隐到黑) |
| 灵魂出窍 | dynamic-soul-drift | scale linear +0.35 + opacity linear -0.75(魂体飘出近似) |
| 卡点抖动 | dynamic-beat-shake | x/y sine 4Hz 中振幅 + scale ±0.05 |

### audio-reactive(追加 effect-audio-reactive-catalog.ts,2 个)
| 卡点放大 | audio-beat-zoom | driver=source band=bass property=scale 1.0→1.22 |
| 节奏闪光 | audio-rhythm-flash | band=bass property=brightness 1.0→1.6 快 attack |

### filter(追加 effect-filter-catalog.ts,6 个)
| 梦幻辉光 | light-dreamy-glow | brightness+18 blur 22 saturation+25(辉光近似) |
| 回忆检索 | atmosphere-memory-flash | sepia 45 vignette 40 blur 12 contrast-10 |
| 夏日清凉 | trendy-summer-cool | hue 200° 方向冷调 saturation+20 brightness+10 |
| 油画模糊 | atmosphere-oil-blur | blur 35 saturation+35 contrast+15 |
| 聚光灯 | light-spotlight-stage | vignette 85 brightness+15(中心亮四周暗) |
| 闭幕 | basic-curtain-close | vignette 100 + 配 motion opacity linear -1(多 stage) |

### particles 换色/密度(追加 effect-particle-catalog.ts,5 个)
| 泡泡 | atmosphere-bubbles | embers 变体,半透明蓝白,低密度(上升+闪烁≈气泡) |
| 光斑飘落 | light-bokeh-fall | snow 变体,暖金色,大颗低速 |
| 花瓣冲屏 | atmosphere-petal-rush | sakura,粉色,高密度高速度 |
| 秋叶遮罩 | nature-autumn-veil | sakura,橙棕色,中密度(+vignette filter stage) |
| 星光绽放 | light-starlight-bloom | stars,金白,高密度 |

### decoration 换色(追加 effect-decoration-catalog.ts,9 个)
| 桃粉爱心 | heart-peach-hearts | hearts-orbit,桃粉色 #ffb3a1 |
| 丁达尔摇摆 | light-tyndall-sway | rainbow-rays 暖光 + motion 慢速摇摆(多 stage) |
| 爆炸 | dynamic-explosion | burst,橙红 |
| 粉红心心 | heart-pink-hearts | hearts-orbit,粉色 |
| 祝福环绕 | atmosphere-blessing-orbit | floating-text(✦ 环绕),金色 |
| 动感光束 | light-dynamic-beams | rainbow-rays,暖白 |
| 射线光束 | light-ray-beams | rainbow-rays,金色低透明 |
| 节奏光束 | light-rhythm-beams | rainbow-rays + audio-reactive brightness(多 stage) |
| 开幕Ⅱ | basic-opening-2 | iris,暖色变体 |

### distortion 强度预设(追加 effect-distortion-catalog.ts,2 个)
| 放大镜视角 | basic-magnifier-pov | magnifier strength 0.85 |
| 鱼眼Ⅳ | basic-fisheye-4 | fisheye strength 1.0 |

### composite 组合(追加 effect-composite-catalog.ts,1 个)
| 多屏球形 | multiscreen-sphere-grid | grid 布局 + fisheye distortion 双 stage |

### overlay(追加 effect-overlay-catalog.ts,1 个)
| 边缘荧光 | light-edge-glow | frames-frame-17 高光边框资源,screen 混合,opacity 0.8 |

## B. 新变体小代码(4 个,新文件 effect-fresh-variant-catalog.ts)

1. **particle 变体 `rain`(雨滴)** — editor-core enum + particles.ts VARIANT_CONFIG(快速竖直、细长、微斜)+ effect-procedural-draw.ts 画线状雨滴;导出免费
2. **decoration 变体 `glass-shatter`(玻璃破碎 + 裂开了 两个条目)** — 静态裂纹放射线绘制;记入 isDecorationStageAnimated 静态清单
3. **decoration 变体 `dashed-ring`(圆形虚线放大镜)** — 静态虚线圆环 + magnifier distortion 双 stage 条目

## C. 暂跳过(2 个,需要新渲染管线)

- 撕拉片(拍立得撕开转场式效果——需要贴图遮罩+位移动画的新 stage)
- 拟截图放大镜(矩形截图框跟随放大——需要矩形 remap 变体+UI 框绘制)

## 验证清单

effect-catalog.test.ts、qcut-asset-manifest.test.ts、bun check-types、biome;新目录文件注册进 effect-catalog.ts。
