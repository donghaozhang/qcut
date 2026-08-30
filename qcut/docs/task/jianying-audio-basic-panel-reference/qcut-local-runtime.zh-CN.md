# QCut 自有本地音频运行时

日期：2026-08-30

## 目标

剪映只作为行为参考和对照样本，不作为 QCut 的运行时依赖。QCut 桌面版必须使用自己的
FFmpeg、自己的派生缓存和自己的能力状态；不得加载剪映 dylib、复制剪映模型，或把云端结果
标成“本地完成”。

## 本轮已实现

| 能力 | 本地状态 | QCut 实现 |
| --- | --- | --- |
| 音量、淡入、淡出 | 可用 | 既有 QCut FFmpeg 包络链 |
| 响度标准化 | 可用 | FFmpeg `loudnorm` |
| 本地高质量降噪 | 可用 | QCut `afftdn` 频谱降噪，生成缓存 FLAC |
| 人声增强 | 可用 | QCut 三段参数均衡 |
| 变调 | 可用 | QCut 重采样与节奏补偿链 |
| 立体声平衡 | 可用 | FFmpeg `stereotools` |
| 声道配置 | 可用 | 新增 stereo/mono/left/right/swap 实际路由和面板入口 |
| 神经网络降噪 | 未安装模型 | 能力状态返回 `model-required`，不回退剪映 |
| 六轨声音分离 | 未安装模型 | 能力状态返回 `model-required: demucs` |
| 音色转换 | 未安装模型 | 能力状态返回 `model-required` |
| 音频翻译 | 未安装模型 | 能力状态返回 `model-required` |

桌面版面板中的“本地增强”现在强制调用 `qcut-audio-runtime:process`。浏览器版仍可保留原有
FAL 回退，但桌面本地路径不会上传音频。

## QCut 缓存契约

运行时 ID 为 `qcut-ffmpeg-audio-v1`。实际缓存目录由 Electron `app.getPath("userData")`
决定，目录名为：

```text
Cache/qcut-audio-derived-v1
```

每个派生结果包含：

```text
<cache-key>.flac
<cache-key>.json
```

`cache-key` 由以下内容计算：

1. 源文件完整 SHA-256，而不是只看路径或修改时间。
2. 会影响声音的规范化参数。
3. QCut 音频引擎版本、输出格式、采样率和声道数。

任务状态、错误文本、`processedMediaId` 和响度分析显示值不会污染缓存键。清单只记录哈希、
引擎和输出参数，不记录源文件绝对路径。写入采用临时文件加原子重命名；相同请求会共享正在
执行的任务，完成后直接命中缓存。上限为 8 GiB 或 1024 个派生结果，按最近使用时间回收。
全局“清理缓存”已纳入该目录，但不会删除未来安装的 QCut 音频模型。

## 与剪映对齐的边界

目前完成的是字段、生命周期和可测输出层对齐，不是算法字节级复刻：

- `volume/fade/loudness/pitch/pan/channel mapping` 可用同一校准音测量参数行为。
- QCut 本地频谱降噪不是剪映私有神经网络模型，也不是 DeepFilterNet。
- 分离、音色转换和翻译必须在 QCut 自有、许可明确的模型包安装并通过真实音频测试后，才能
  从 `model-required` 改成 `ready`。
- 剪映缓存只能作为本地只读证据；QCut 缓存不得链接、复制或分发其中的二进制和模型。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| Electron TypeScript | 通过 |
| Web TypeScript | 通过 |
| 新运行时、真实 FFmpeg、既有音频导出回归 | 10 files / 32 tests 通过 |
| Web 音频完整目录 | 35 files / 213 tests 通过 |
| 缓存维护 | 3 tests 通过 |
| 定向 Biome | 通过 |
| 属性面板整组 | 22 files / 113 tests 通过 |

真实测试使用随 QCut 仓库提供的 FFmpeg 生成左声道 440 Hz、右声道 880 Hz 的双声道校准音。
第一次处理生成 48 kHz 双声道 FLAC，第二次相同请求命中同一缓存路径；选择左声道后，解码
结果的左右 PCM 样本逐点一致。缓存清单不含源路径，也不含 `Jianying` 标记。

## 下一步

1. 选择许可可分发的 QCut 神经降噪模型，并定义签名、SHA-256、版本和卸载流程。
2. 为 Demucs 或等价模型制作 QCut 自有离线包，不依赖系统 Python。
3. 将音色转换拆为模型安装、参考音色授权、推理缓存和派生媒体生命周期。
4. 将音频翻译拆为本地 ASR、翻译、TTS 与时间对齐四个可单独验证的阶段。
5. 完成 A-001 至 A-010 剪映校准实验后，记录数值差异与听感差异，不能只比较 UI。
