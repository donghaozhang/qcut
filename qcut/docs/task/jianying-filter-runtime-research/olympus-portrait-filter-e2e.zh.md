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

四个层次的结论必须分开：

1. **研究 oracle 已高精度重放。** 固定静态人物帧上，真实二进制 V2 宿主在 CoreML ready 被后续 seek
   观察后，同 timestamp re-seek 达到 `RMSE 0.916513 / PSNR 48.888033 dB`，mask 为
   `MAE 3.276394 / IoU@128 0.962641`。
2. **QCut 产品本机预览已能调用真实二进制。** 可选 provider 在 macOS 上发现用户已安装的
   `libcccreator`、skin-seg 模型和效果包，经 UUID 白名单后由 QCut 自有桥创建同线程 CGL context，返回完整
   RGBA 和 224x128 CPU skin mask。固定人物帧输出与独立低层探针逐字节一致，对 UI 为
   `PSNR 37.331351 dB`。
3. **预览与导出已经共用本机 provider。** 同一 source 的单调时间戳帧复用 session；source 变化或时间回跳
   会重建 session。需要本机空间 provider 的导出改用固定时间戳 muxer，不再由 FFmpeg 路径降级成
   `skin-tone-v1`，也不会因原生帧较慢把 1 秒时间线拉长到约 34 秒。
4. **产品仍未达到像素级复刻。** 产品化低层 Effect 路径的 `37.331351 dB` 低于研究 V2 oracle 的
   `48.888033 dB`。连续帧、discontinuity reset 和原生导出已经补齐，但与剪映 UI 的完整视频平价和实时
   30 fps 吞吐仍未达到；卡片因此继续保持 `unverified`。

这意味着本轮补齐了「目录发现 -> 双 LUT 解码 -> Filter Lab 应用 -> 本机二进制连续预览 -> 固定时间基导出」E2E。它是真实
调用用户机器上的剪映 skin-seg，但不是把私有运行时打包进 QCut，也不是完整视频导出平价。

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

## QCut 产品本机 provider E2E

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

上面的 `2220 ms` 是旧的一次性冷启动总耗时。持久化宿主批量跑七张双 LUT 时，平均初始化为
`1647.39 ms`，初始化后的连续帧平均 `94.60 ms`、P95 `101.69 ms`。奥林巴斯 A -> B 切源后相对 fresh-B
的 RGBA 与 mask 都逐字节一致，MAE 均为 0。

背景和肤色图片都真实解码为 `size=64`、`values=786432` 的 cube。产品新增的可替换 provider 边界为：

```text
renderer -> trusted IPC -> local portrait provider -> QCut-owned CGL bridge
         -> installed libcccreator + installed model + installed effect package
         <- full RGBA + raw 224x128 skin mask
```

开发态桥按 QCut 源码哈希编译到 `~/Library/Caches/QCut/`；打包态只分发这个 QCut 自有小桥。运行时、模型和
效果包始终从用户本机安装读取。ABI 只接受已验证的 `libcccreator` UUID，目录存在但没有
`tt_skin_seg*.model` 时不会报告 `ready`。

在同一张 854x480 人物帧上，TypeScript provider 的真实运行结果为：

```json
{
  "state": "ready",
  "provider": "jianying-local-effect-v1",
  "bridgeReady": true,
  "runtimeReady": true,
  "modelReady": true,
  "elapsedMs": 2220,
  "output": "854x480 RGBA",
  "mask": "224x128 bottom-left"
}
```

provider 输出 SHA-256 为
`d82b9c2e1881b1201a3ed5be0869bb44c3f9fb41221ef65e9230512df1ee9570`，与先前独立低层探针输出逐字节
一致。与剪映 UI 无损帧比较为：

| 路径 | RGB RMSE | PSNR | mask MAE | mask IoU@128 |
| --- | ---: | ---: | ---: | ---: |
| 剪映二进制 skin-seg oracle | 0.916513 | 48.888033 dB | 3.276394（0..255） | 0.962641 |
| QCut 本机 Effect provider | 3.467（由 PSNR 换算） | 37.331351 dB | 未以 UI mask 对标 | 未以 UI mask 对标 |
| QCut `skin-tone-v1` | 9.627368 | 28.460652 dB | 0.142202（0..1） | 0.445115 |

本机 provider 的完整 RGBA 已包含真实空间分割，浏览器只负责 LUT 强度和 QCut 调色蒙版混合。它不可用时的
肤色规则仍会误选背景中的暖色灯光和物体。`available` 只表示包和渲染器可安全加载；
`verification=unverified` 表示仍未通过完整人像平价门禁。

真实 Electron Playwright 测试也已通过。测试启动隔离 QCut 实例，创建项目并导入视频，进入滤镜实验室扫描
883 张卡，先确认本机 bridge/runtime/model 都为 `ready`，再通过真实 IPC 取得
`provider=jianying-local-effect-v1` 和 224x128 mask，最后点击奥林巴斯并确认调节层包含：

```text
name=奥林巴斯
background cube=64 / 786432 values
skin cube=64 / 786432 values
maskKind=skin-segmentation-v1
resourceId=7361792068475325735
enabled=true
```

测试将真实 IPC RGBA 与实际预览 canvas 做 RGB 平均绝对误差门禁，并确认没有出现本机运行时降级提示。同一
用例还应用青灰并执行真实 1920x1080 导出。最新运行结果为 `1 passed (1.0m)`；奥林巴斯和青灰预览 canvas
相对 IPC 原生结果的 RGB MAE 分别为 `0.966649` 与 `0.511152`。`ffprobe` 确认导出为 H.264、30 帧、
30 fps、流和容器都为 `1.000000 s`，修复了旧 MediaRecorder 把 1 秒时间线拉成约 34 秒的问题。

## 剩余产品缺口

持久化宿主、source/timestamp discontinuity reset 和固定时间基导出已经完成。下一阶段按优先级为：

1. 用与剪映 UI 相同的短运动人物夹具，量化七张卡的 RGB、mask interior、boundary、background 和时序稳定性；
2. 把约 `94.60 ms/frame` 降到交互式预览目标，或提供分辨率/帧率自适应代理；
3. 后续自有或获授权模型实现相同 provider 契约，替换本机第三方运行时而不改变时间线资源身份和 UI；
4. 达到 dual-LUT verification gate 后，才把对应卡片从 `unverified` 升级。

不能把剪映 Framework、模型、LUT、shader 或效果包复制进 QCut。允许进入仓库和安装包的只有 QCut 自有桥；
它在运行时检查并调用用户本机已有安装。现有 `apps/web/public/models/person-segmentation.tflite` 是整个人物
分割，语义不同，不能直接替换 skin mask。

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
| 本机 provider 结果 JSON | `040143e41fec271ff7403f2d72e65b8da56893558535d7c6b89d5d7ee3efe73b` |
| 本机 provider 输出 PNG | `2a3685e9ce9fec3f5cbe80afefd90c1e42b4edbb7736f5d407718a937fea96c1` |
| 本机 provider CPU mask | `f6e23ed106fb54c747e08f3909335c800e650833944045979c4db8c1f7ff32ca` |
| 原图 / QCut 本机二进制 / 剪映 UI 对照 | `1a384350847f644433143f5396c1f5e66417eaef3ebb13515160fc81affb6f90` |
| 最新 Electron E2E 奥林巴斯截图 | `691de33430fc8ccd6c51eba43be91d1c402c32f7e6f0f3bc8d65ecf53e08e3fa` |
| 最新 Electron E2E 原生预览证据 JSON | `e4014af47db932d9e6c77060e13974824bf14bf74d0eeb67198656d89dad83a7` |
| 七张双 LUT 持久化宿主批处理报告 | `da525cd52793867b746111edae694632ffd1962c8a87368031b8e1047725c54c` |
| 固定时间基 Electron E2E 证据 JSON | `eba6b1b2e9c214dc0339621a6ac849f9cfacf55c59dfae3674ac868ff1ed8a40` |
| 30 帧、1 秒青灰原生导出 | `8b90fe6c904a8ec8aa0347f25578d7743ae4d610f973a3b8d3c744992f789ca9` |

模型、效果包、LUT、输入、输出、mask、图片、日志和编译产物均留在仓库外；Git 只保存自有代码、测试、哈希、
指标和结论。
