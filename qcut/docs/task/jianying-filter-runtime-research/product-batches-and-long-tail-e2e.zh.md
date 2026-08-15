# 滤镜产品批处理、固定时间基与长尾 Pass E2E

记录时间：2026-08-12，2026-08-13 追加双 LUT 真实视频门禁

## 结论

本轮完成三件彼此独立的产品工作：

1. 三个普通多 Pass 已进入产品像素门禁。`清透美食`、`暗角旧影`、`迷雾` 与既有 `净白` 一起，使
   verified 产品门禁从 1 张增加到 4 张。
2. 单 LUT 与双 LUT 都能在持久化本机宿主中连续处理。一次初始化后不再逐帧启动进程；素材变化或时间戳
   回跳会退休旧 session，同一素材的单调时间戳连续帧复用同一 context、线程和 Effect handle。
3. QCut 自有结构化渲染器新增 `grain-noise`、`light-leak`、`bloom`、`chromatic-aberration` 和
   `lens-distortion`。Bloom 是第一条真实消费 `scale=0.5`、浮点中间数据和多级 blur 的产品 Pass。

第三项是 **QCut 自有能力覆盖**，不是剪映卡片平价结论。没有同一张剪映卡的 UI 无损帧对照前，这五类不能
标为 verified，也不会因为“语法可以运行”就宣称复刻完成。

## 持久化宿主与批处理

### 60 张单 LUT

`run-native-single-lut.ts` 对当前可运行的 60 张单 LUT 各执行初始化、首帧和同 session 第二帧：

| 指标 | 结果 |
| --- | ---: |
| 成功 | 60 / 60 |
| 确定性 | 60 / 60 |
| verified / close / unverified | 2 / 56 / 2 |
| 平均初始化 | 1588.72 ms |
| 平均首帧 | 94.84 ms |
| 平均稳定帧 | 91.95 ms |
| 稳定帧 P95 | 121.26 ms |

这里的 60 是本次真实目录扫描结果，不再把旧计划中的“59”硬编码为总体。

### 7 张双 LUT 人像

奥林巴斯、青灰、冷月夜、橙蓝、亮肤、森山、雾野已从三张平移静帧升级为 `854x480 / 30 fps`
真实视频的 70 帧连续处理：

| 指标 | 结果 |
| --- | ---: |
| 成功 | 7 / 7 |
| 每张处理帧数 | 70 |
| 人物运动窗口 | 最后 10 帧；每张 7 对 source 和 7 对 mask 发生变化 |
| 7 张 A -> B 与 fresh-B RGBA | 全部逐字节一致，MAE 0 |
| 7 张 A -> B 与 fresh-B mask | 全部逐字节一致，MAE 0 |
| 7 张导出 | 全部 854x480、30 fps、70 帧、2.333333 秒 |
| UI mask 门禁 | 1 verified / 3 close / 3 unverified，全部为逐卡 reference |

七张输出 SHA-256 均不相同。奥林巴斯相对直接剪映 UI mask 的 `maskEdgeMae=0.013262`，达到 verified；
青灰、冷月夜、亮肤分别为 `0.075152 / 0.059560 / 0.079349`，达到 close；橙蓝、森山、雾野分别为
`0.113760 / 0.220857 / 0.096268`，仍为 unverified。旧的共享青灰 mask 只能证明共同算法图，不能充当逐卡
UI 结论，现已由每张卡自己的 UI 导出替换。完整素材绑定、校准方法和逐卡结果见
[dual-lut-seven-real-video-e2e.zh.md](dual-lut-seven-real-video-e2e.zh.md)。

## 导出时间基修复

旧实现把本机人像滤镜强制送进 `STANDARD + MediaRecorder`。MediaRecorder 按墙钟时间写时间戳，原生分割
每帧约 95 ms 时，1 秒、30 帧的时间线会被录成约 34 秒。

本机颜色 provider 现在改走 Mediabunny `CanvasSource`：仍调用与预览相同的 canvas renderer 和持久化
provider，但每帧显式写入 `frame / fps` 与 `1 / fps`。单元测试故意延迟每帧渲染，确认写入时间戳仍为
`0, 1/30, 2/30...`。

最新真实 Electron E2E 已依次应用七张人像卡，每张保存真实预览截图，并导出 `1280x720 / 30 fps / 30 帧 /
1.000 秒` H.264。每个导出抽取的三张采样帧哈希均不同，证明不是静态占位。逐卡预览 canvas 相对本机
provider RGBA 的 RGB MAE 为 `0.023146` 到 `0.061505`。

此前青灰单卡导出还由 `ffprobe` 确认为：

```text
codec=h264
resolution=1920x1080
r_frame_rate=30/1
avg_frame_rate=30/1
frames=30
stream duration=1.000000
container duration=1.000000
```

同一用例中，奥林巴斯与青灰预览 canvas 相对原生 IPC RGBA 的 RGB MAE 分别为 `0.966649` 与
`0.511152`。这证明预览和导出都经过真实本机 provider；它不证明两张卡已经与剪映 UI 逐像素一致。

## 新增长尾 Pass

| Pass | 浏览器预览 | FFmpeg 导出 | 当前边界 |
| --- | --- | --- | --- |
| `grain-noise` | 固定 seed、颗粒尺寸、逐帧确定性噪声 | 相同坐标 hash，支持静态/时变 | 尚无剪映同卡对照 |
| `light-leak` | 可动画径向 Screen 漏光 | `geq` 时间表达式 | QCut 自有程序纹理，不复制包内纹理 |
| `bloom` | 亮部提取、半分辨率、1-5 层 blur、Screen | 分支、降采样、浮点格式、多级 blur、Screen | 结构等价，不是已知剪映 shader 公式 |
| `chromatic-aberration` | 双向 RGB 子像素采样 | `geq` 分通道位移 | repeat/mirror 的 FFmpeg 精确语义待样本驱动 |
| `lens-distortion` | 双线性径向重采样 | `lenscorrection` | 尚无同卡参数映射 |

所有 Pass 都继承 `scale`、`pixelFormat`、`mipLevels`、`edgeMode`、`intensityCurve` 和
`timeVarying`。项目快照读取会拒绝非法 scale、像素格式、mip、采样模式、曲线点和 RGB 颜色数组。

浏览器的 `float16` 中间值按 10-bit mantissa 量化；FFmpeg 侧把 `float16/float32` 统一提升到
`gbrpf32le` 再处理，因为当前导出图没有可靠的半浮点 filter 协商。两条路径都避免在 blur 前退回 RGBA8，
但还不能声称与某个剪映内部纹理格式逐位一致。

真实 FFmpeg 烟测把五类 Pass 串联到 `320x180 @ 6 fps / 1 s` 的测试源，成功输出 H.264。六张解码帧的
MD5 全部不同，证明时变分支不是静态占位；输出保持 320x180、6 fps、1 秒且非空。

## 仓库外证据

| 证据 | SHA-256 |
| --- | --- |
| 单 LUT 批处理报告 | `71f96a387ba32efb3aa148e1d4caea711f8e1a23edd05f18c20cdb15297577a0` |
| 双 LUT 批处理报告 | `da525cd52793867b746111edae694632ffd1962c8a87368031b8e1047725c54c` |
| 双 LUT contact sheet | `aa9ba28382b111affa5b21fa7dfa73cfaf3e06c305ad0825e18c99c67c35bf44` |
| 奥林巴斯 70 帧 UI mask E2E 报告 | `7277bfbd98a0fd3ff65a7fe588dec1af3e335d5223f927327c6912453c4621b8` |
| 七张逐卡 UI mask E2E 报告 | 见逐卡文档中的 7 个 SHA-256 |
| Electron 七张预览与导出清单 | `75444956dae70a4f1a2562b7a4ae2e044dde669c416edffe1855670903ce7864` |
| 1 秒青灰导出 | `8b90fe6c904a8ec8aa0347f25578d7743ae4d610f973a3b8d3c744992f789ca9` |
| 五类长尾 Pass 烟测视频 | `dbaa85416d7c9311fce15638d78a9d59f146f3fae4ae3ce718806f29e1cbb7c8` |
| 长尾 Pass 0 秒 / 0.5 秒 contact sheet | `c7568ae4e07184e9e7ce43317e3f409b4c9afab4d8f444c1ede2d41a7aaf04d0` |

证据位于 `~/Library/Application Support/QCut/Research/JianyingFilter/`。第三方运行时、模型、效果包、LUT、
shader、纹理、输入帧和输出帧均不进入 Git。

## 下一步

下一轮不应继续添加抽象 kind，而应各选一张真实已缓存候选卡，按 `Bloom -> 色差/畸变 -> 漏光/动态纹理 ->
颗粒` 顺序做同素材无损 UI 对照。只有拿到 pass 分辨率、格式、采样、强度曲线和逐像素指标后，才把 QCut
参数绑定到具体卡片并升级 verification。
