# 奥林巴斯人像滤镜端到端对标

记录时间：2026-08-12

## 结论

本轮选定剪映「奥林巴斯」作为第一张完整人像滤镜对标卡：

| 字段 | 值 |
| --- | --- |
| resource ID | `7361792068475325735` |
| package version | `3db90437187dd911b234766ef7297fe9` |
| 分类 | 相机模拟 |
| 能力 | `blit`、`face`、`skin_seg` |
| 实现 | 背景 64³ tiled LUT + 肤色 64³ tiled LUT + 224x128 skin mask |

三个层次的结论必须分开：

1. **研究 oracle 已高精度重放。** 固定静态人物帧上，真实二进制 V2 宿主在 CoreML ready 被后续 seek
   观察后，同 timestamp re-seek 达到 `RMSE 0.916513 / PSNR 48.888033 dB`，mask 为
   `MAE 3.276394 / IoU@128 0.962641`。
2. **QCut 产品已可加载和应用。** Filter Lab 现在能识别包内 `filter_bg.png` 与 `filter_skin.png`，
   分别解码为 64³ cube；卡片由 `available=false / lutCount=0` 变为
   `available=true / lutCount=2`。
3. **QCut 产品尚未达到像素级复刻。** 当前产品使用 `skin-tone-v1` 逐颜色启发式 mask，不是空间 skin
   segmentation。同一人物帧只有 `RMSE 9.627368 / PSNR 28.460652 dB`，mask 为
   `MAE 0.142202`（归一化 0..1）/ `IoU@128 0.445115`。卡片因此必须保持 `unverified`。

这意味着本轮补齐了「目录发现 -> 双 LUT 解码 -> Filter Lab 应用 -> 本地导出」E2E，但没有把剪映私有
skin-seg 冒充为 QCut 产品能力。

## 包语义验证

真实包中的背景与肤色 LUT 都是 `512x512` PNG。其 shader 将 RGB 乘以 63，在 8x8 tile 中对蓝通道相邻
切片插值，再执行：

```text
background = LUT(filter_bg, source)
skin = LUT(filter_skin, source)
output = mix(background, skin, skin_mask)
```

`algorithmConfig.json` 声明 `textureBlitter -> face -> skin_seg`，blitter 为 `128x224`。既有单变量实验已
证明该滤镜的 skin-seg 不消费 face 连线，因此当前对标的关键是 skin mask，而不是关键点。

QCut 之前已经能解码同尺寸的单张 tiled LUT，但 package inspector 只识别文件名 `filter.png`。本轮增加
严格的双 LUT 识别条件：两张图片尺寸必须正确，并且包中至少一个 GLES fragment shader 同时声明 mask、
两张 LUT、63 级采样和 `mix(res0, res1, mask.a)`。不满足完整语义时不暴露 renderer。

## 真实二进制 E2E

### 静态历史

固定 854x480 RGBA 人物帧、physical skin model v5.1、SIMD=1、native texture flags `001`，先执行完整
manifest，再在同一 manager、AlgorithmService、线程和 GL context 中回到原输入、原时间戳。两次独立复跑的
最终 RGBA SHA-256 都为：

```text
aa58c13edb92d6a17e2bca1b108ea61eed96c02d857b7d41c818885362996e72
```

两次日志都证明 `skin_seg coreml is Ready!` 先于 re-seek 标记。普通输出在开启/关闭诊断时逐字节一致，
所以默认关闭的诊断没有改变原路径。re-seek 的 mask 与 UI 更接近：

| 指标 | pre-ready 最终 mask | ready 后 re-seek |
| --- | ---: | ---: |
| mask MAE | 4.056598 | 3.276394 |
| mask IoU@128 | 0.943612 | 0.962641 |
| RGB PSNR | 不作为同强度对照 | 48.888033 dB |

preparation 的首帧在提交 `intensity=1` 前完成，因此不能拿其 RGB 与 re-seek 做纯 readiness 增益归因；
绝对 re-seek/UI 指标和 mask 对照有效。

### 动态历史

同一 manager 先经过 60 张静态帧和 10 张运动帧，再回到原输入、原时间戳。两次复跑的回跳 RGBA SHA-256
都为：

```text
97a7da52d9e5ab5bdbad83c5f928e613c98a5a60e0c884709b4348f74782ae70
```

结果从静态历史的 `48.888033 dB / IoU 0.962641` 降为
`40.140233 dB / IoU 0.265185`。两次运行逐字节一致，排除了随机竞态；差异来自持续保留的分割时序状态。

因此宿主规则是：

- 连续 clip 的单调时间戳帧复用 manager；
- clip/source 变化或向后时间跳转时，重建 manager 与 AlgorithmService；
- 同 timestamp re-seek 只能刷新当前静态历史，不能替代 discontinuity reset。

既有 A -> gray -> B 实验已经证明 manager reset 后 B 从首帧起逐字节等于 fresh-B；`feature` 和 `video`
reset 不足以清除该状态。

## QCut 产品 E2E

真实本机目录扫描结果：

```json
{
  "resourceId": "7361792068475325735",
  "title": "奥林巴斯",
  "implementation": "dual-lut",
  "cacheStatus": "cached",
  "available": true,
  "verification": "unverified",
  "lutCount": 2,
  "tiledRendererKind": "dual-tiled-lut-8x8"
}
```

背景和肤色图片都真实解码为 `size=64`、`values=786432` 的 cube。随后通过 QCut 的双 LUT 导出路径在同一张
854x480 人物帧上生成无损 PNG，并与剪映 UI 无损帧比较：

| 路径 | RGB RMSE | PSNR | mask MAE | mask IoU@128 |
| --- | ---: | ---: | ---: | ---: |
| 剪映二进制 skin-seg oracle | 0.916513 | 48.888033 dB | 3.276394（0..255） | 0.962641 |
| QCut `skin-tone-v1` | 9.627368 | 28.460652 dB | 0.142202（0..1） | 0.445115 |

产品结果已经可用并且视觉风格接近，但肤色规则会误选背景中的暖色皮肤、灯光和物体，也无法利用人物轮廓、
遮挡与时序信息。`available` 只表示两张 LUT 可安全加载；`verification=unverified` 才表示尚未通过人像平价门禁。

真实 Electron Playwright 测试也已通过。测试启动隔离 QCut 实例，创建项目并导入视频，进入滤镜实验室扫描
883 张卡，搜索并点击奥林巴斯，随后确认调节层包含：

```text
name=奥林巴斯
background cube=64 / 786432 values
skin cube=64 / 786432 values
maskKind=skin-tone-v1
enabled=true
```

同一用例还回归了单 LUT、A/B、强度滑杆、Shader、收藏与最近列表，最终为 `1 passed (22.4s)`。截图中卡片
明确显示「可用 / 双 LUT / 未验证」，应用 toast 为「已应用 奥林巴斯 双 LUT 与肤色蒙版到调节层」。

## 剩余产品缺口

下一步不是继续猜剪映参数，而是实现一条 QCut 自有或获授权的 **skin segmentation** 路径：

1. 输出空间 skin alpha，而不是现有 whole-person cutout 或逐颜色肤色权重；
2. preview 与 native export 使用同一 mask 后处理、坐标和双 LUT 混合语义；
3. 在 source/clip/timestamp discontinuity 上显式 reset 时序状态；
4. 用本页同一静态人物与短运动人物夹具做 RGB、mask interior、boundary 和 background 回归；
5. 达到 dual-LUT verification gate 后，才把卡片从 `unverified` 升级。

不能把剪映 Framework、模型、LUT、shader 或效果包复制进 QCut，也不能把本机二进制 oracle 写入产品 verification
store。现有 `apps/web/public/models/person-segmentation.tflite` 是整个人物分割，语义不同，不能直接宣称补齐
奥林巴斯 skin mask。

## 仓库外证据

证据根目录：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/portrait-olympus-e2e
```

| 证据 | SHA-256 |
| --- | --- |
| 静态分析 JSON | `7089eb69dbd7e9eb7351af501c587a32f0364d5e5f5802d57f54f3b520d77840` |
| 动态回跳分析 JSON | `74c41a938570264e3fb9b3ad7974b3464e2a2ac6197ec765ea83a44b19f0a0b9` |
| QCut 产品候选指标 JSON | `e355bbe4a10405cb20664192e22c32b50b1dec502f06113ec1f3ed9e6f2d4ac1` |
| 静态复跑 A log | `36a5840e1ab1e886d2dc032fab7427527a2c0a2d988e01be2389926420527df0` |
| 静态复跑 B log | `b58a5ae249450048ea5716213b149f92fb96ac5afb858fae6def06dbf893a4e1` |
| 动态复跑 A log | `07e4e943786dc6700c5f35414bb9dd9e257a05e7b881b3c23bbedcfcb8235df9` |
| 动态复跑 B log | `baa0d6f5dc84e554d4e88c151f7e49bb89c4529fe99d49ff1401f5a161d91521` |
| QCut/剪映/原图对照图 | `a71d057b23c69062f7d52762cac58849ec73de87fe63a823113867195df79ed4` |
| mask 对照图 | `0cf58abf911ecfea3c598803c9155fcb3e66808d16b047d25204eba888483772` |
| Electron E2E 奥林巴斯应用截图 | `90836d1dacf52bd87da0ed947e20b0a0b65dca95187f964395457e54836bfd63` |
| `-Werror` 构建日志 | `135d48d9aaecdbb22c01fa77d48793deb9f265700a7642619c0cc0b89405c43f` |

模型、效果包、LUT、输入、输出、mask、图片、日志和编译产物均留在仓库外；Git 只保存自有代码、测试、哈希、
指标和结论。
