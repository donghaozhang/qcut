# 剪映专业版：人脸关键点到大眼输出链路

记录时间：2026-08-22

## 验证边界

本轮只验证中国版剪映专业版，不使用 CapCut：

| 项目 | 值 |
| --- | --- |
| 应用 | `/Applications/VideoFusion-macOS.app` |
| Bundle ID | `com.lemon.lvpro` |
| 素材 | 同一张 `1280x720` 真人静帧 |
| 剪映参数 | 仅“大眼”开启，UI 值 `12`；其余手动人像参数为 `0` |
| 剪映导出 | `1280x720`、30 fps、H.264、YUV 4:2:0、BT.709、5 秒 |
| 本机 oracle | 私有运行时、同尺寸独立输入/输出 `GL_TEXTURE_2D`、同一 CGL context 与线程 |

CapCut 的应用包、缓存和导出结果不能作为本结论的证据。

## 卡片到参数

剪映专业版缓存把“韩系清透”映射到：

```text
resource ID: 7594398775116893446
package md5: 5f2b18dd84759a5fe6bd0db949b29b08
```

它不是单 LUT，而是 `auto_beauty.json` 定义的 21 项组合预设。全局默认值为
`0.8`；其中“大眼”的 resource ID 为 `7408077108586515746`，相对最大值为
`0.15`。因此该预设在 UI 中展开后的“大眼”值为：

```text
0.8 * 0.15 = 0.12
```

剪映专业版右侧参数面板实际显示“大眼 12”，与缓存映射一致。随后清除组合预设，
只保留手动“大眼 12”，作为独立对照。

“大眼”效果包的 `config.json` 请求 `tt_face`、`tt_fsnew_base_jianying` 和
`tt_freid`，`algorithmConfig.json` 还请求 `tt_face_extra`。Lua 监听
`SetEffectIntensity` 的 `face_adjust` 键，并把强度写入：

```text
degree[1] = base + 0.14 * intensity
```

## 关键点与输出

低层探针在同一帧上独立读取到：

```text
face_count=1
landmarks=106
face_score=1
```

原始缓存包经标准 composer 顺序加载后，
`bef_effect_composer_update_node_with_json` 返回 `0`，但强度 `0` 与 `0.8`
都仍是 passthrough。也就是说，函数签名与人脸检测不是当前卡点；独立宿主尚未把
composer 事件转发成 Lua 收到的 `SetEffectIntensity`。

为隔离这个事件桥，仓库外私有副本只修改 Lua 默认强度，并保持原 shader、模型、
关键点和渲染链不变。结果如下：

| 私有副本强度 | 与输入不同的 RGB 通道值 | face count | landmarks |
| ---: | ---: | ---: | ---: |
| `0.06` | `6,178` | `1` | `106` |
| `0.12` | `14,702` | `1` | `106` |
| `0.18` | `23,358` | `1` | `106` |
| `0.12` + `--skip-algorithm` | `0` | unavailable | unavailable |

关闭算法执行时，输出与输入经 `cmp` 逐字节一致；恢复算法后，同一私有默认参数立即只在
眼部产生几何差值。这组单变量门禁证明
`关键点 -> FaceReshape -> 输出纹理 -> 读回帧` 已经在本机二进制路径跑通。
私有副本仅用于 oracle，资源包和二进制均不进入 Git，也不能作为产品依赖。

## 剪映 UI 对照

剪映参考是高码率 H.264 导出，不是无损帧，因此全图差异同时包含几何效果、
RGB/YUV 转换、4:2:0 色度采样和编码误差。眼部 ROI 固定为
`x=520, y=300, w=230, h=90`，比较相同剪映导出帧：

| 候选 | 对剪映专业版的眼部 ROI PSNR |
| --- | ---: |
| 原图 / 强度 `0` | `40.442648 dB` |
| 本机二进制 `0.06` | `40.853754 dB` |
| 本机二进制 `0.12` | **`41.071341 dB`** |
| 本机二进制 `0.18` | `40.980087 dB` |

`0.12` 是三组邻域候选中的最优值。相对原图，它提高 `0.628693 dB`，眼部 ROI
均方误差降低约 `13.477%`。在更大的面部 ROI
`x=490, y=270, w=300, h=170` 中，PSNR 从 `40.927270` 提高到
`41.202835 dB`，SSIM 从 `0.983792` 提高到 `0.984172`。这说明本机几何变化
方向与剪映专业版一致，但编码噪声仍占据大部分全图差异，不能据此宣称逐像素一致。

仓库外证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  face-keypoint-parity/korean-clear-2026-08-22/
```

关键文件：

```text
jianying-professional-big-eyes-only-12.mov
jianying-professional-big-eyes-only-12-frame-1s.png
jianying-professional-big-eyes-only-12.jpeg
jianying-professional-export-success.jpeg
big-eyes-instrumented-006.png
big-eyes-instrumented-012.png
big-eyes-instrumented-018.png
big-eyes-intensity-sweep.png
big-eyes-parity-grid.png
```

`big-eyes-intensity-sweep.png` 从左到右为原图、`0.06`、`0.12`、`0.18`、剪映
专业版；`big-eyes-parity-grid.png` 上排为原图、本机 `0.12`、剪映专业版，
下排依次为三组八倍差值图。

## 结论

已经证明：

- 剪映专业版“韩系清透 80”把“大眼”映射为 `0.12`；
- 独立结果 API 能稳定交付 1 张人脸和 106 个关键点；
- 原始 `FaceReshape` 图在私有默认参数注入后会消费关键点并写出变形帧，跳过算法时则
  逐字节 passthrough；
- `0.12` 在相邻强度中与剪映专业版导出最接近。

仍未证明：

- 未修改效果包时，独立宿主如何把 composer update 转成 Lua 的
  `SetEffectIntensity`；
- 剪映专业版无损预览/导出帧与本机输出是否逐像素一致；
- 动态人物、跨帧关键点平滑和多人分配是否一致。

官方 composer 接口顺序是：

```text
composer_set_mode -> composer_set_nodes -> composer_update_node
```

本机探针已经按此顺序执行。下一次只研究一个问题：剪映专业版
宿主在 UI 修改“大眼”时，事件从 composer API 到 Amazing Scene/Lua 的具体转发键、
payload 和调用时机。

参考：

- [BytePlus Effects C API](https://docs.byteplus.com/en/docs/effects/docs-c-api)
- [BytePlus Effects C interface access guide](https://docs.byteplus.com/en/docs/effects/docs-c-interface-access-guide)
