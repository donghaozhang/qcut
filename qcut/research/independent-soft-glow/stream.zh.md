# RGBA8 持续帧流

`soft-glow-stream` 把独立 C++ 算法接到视频解码器、编码器或产品 helper。程序不加载供应商动态库、Lua、GLSL 或 Metal；调用与单张图相同的 `cinematic_soft_glow`，使用调用者提供的 LUT。

## 协议

```text
soft-glow-stream --lut ATLAS.rgba --width W --height H [--intensity 1]
  [--intensity-mode output-mix|ui-snapshot]
```

- `--lut` 必须为 512×512、紧密排列的 RGBA8 图集；不提供默认替代图集。
- stdin 与 stdout 都是无帧头、top-down 的 RGBA8；每帧恰好 `W×H×4` 字节，输入 Alpha 必须全部为 255。
- `--width`、`--height` 必填且保持不变；`--intensity` 为 [0,1]，每个进程保持固定。改变尺寸、LUT、强度或模式需另开进程。
- `--intensity-mode` 默认 `output-mix`，0强度逐字节返回原图；`ui-snapshot` 将强度映射到辉光与LUT参数，0仍保留SoftLight。详见 [两种强度模式](intensity-modes.zh.md)。模式不增加帧头，也不改变帧字节数。
- 调用者可以分块写入；完整帧到齐才执行。每帧结果写出并 flush 后，继续等待下一帧，因此支持“写一帧、读一帧”的持久交互。
- 整帧边界的 EOF 成功，空流成功并报告 0 帧。残缺帧不补零，读写错误、透明输入或不支持的参数返回非零退出码。
- stdout 只包含像素字节；help、错误及结束统计全部写入 stderr。发生后续错误时，之前完成的帧可能已经输出，调用者必须同时检查退出码与输出长度。
- 程序只持有当前输入、输出及算法工作图像，内存随单帧尺寸变化，不随视频长度累计。没有跨帧状态，不要求预热或按时间顺序调用。

结束统计示例：

```json
{"protocol":"rgba8-frames-v1","frames":70,"bytes_in":114777600,"bytes_out":114777600,"width":854,"height":480,"intensity":1.000000,"intensity_mode":"output-mix","seconds":24.892085}
```

帧流不携带时间戳、帧率或音轨。VFR、剪辑时间线和音频同步由外层负责；不能把任意输入的时间戳丢弃后按固定 30 fps 重建，再宣称保持原始时间线。下面验证的是已检查过的 CFR 素材。

## 构建与测试

只构建此目录，生成物放在仓库外：

```sh
cmake -S research/independent-soft-glow \
  -B /Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/build-stream \
  -DCMAKE_BUILD_TYPE=Release
cmake --build /Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/build-stream -j 6
ctest --test-dir /Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/build-stream --output-on-failure
```

另一次 Debug 构建打开 `-DSOFT_GLOW_SANITIZERS=ON`，运行相同 CTest。算法测试和流协议测试在 Release、ASan/UBSan 两种配置均通过。协议测试覆盖多帧与独立调用逐字节比较、重复／乱序、两种零强度行为、空 EOF、每种短尾长度、读失败、写失败、flush 失败及无效输入。有Python时，CTest还运行 `cli_intensity_test.py`，用真实两个CLI检查省略模式／显式两模式×5档强度、非法模式与stdout仅包含像素。双模式构建三项CTest在两种配置均通过。

实际子进程另外验证了分块发送、完整帧前无输出、EOF 前输出已可读、持续两帧应答、help 不污染 stdout、参数错误、残帧、透明帧和 broken pipe。证据保存在私有 `stream-cli-protocol-verification.json`。

## 已完成的视频验证（历史 output-mix）

私有目录：`/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/video/`。

| 输入 | 处理尺寸／帧数 | 视频时间 | 验证结果 |
| --- | --- | --- | --- |
| 既有 `portrait-motion-70.mkv` 人物视频 | 854×480／70 帧 | 30 fps，2.333333 秒 | 全帧重复结果与 FFV1 解码逐字节相等；乱序调用相等 |
| 既有 `source-moving.mp4` 音频夹具 | 明确缩小至 320×180／30 帧 | 30 fps，1 秒 | 全帧重复相等；MP4 的 48 个 AAC 包内容与时间字段相等 |

人物素材包含较长停留，70 帧共有 9 个不同图像，真实人物运动集中在最后 10 帧。不能把帧数称为独立运动状态数。其本次 helper 用时约 24.89 秒，属于离线 CPU 验证，不是实时播放性能结论。

FFV1 文件用于无损像素核验；H.264 MP4 用于观看，像素受编码量化影响。音频保留结论针对 MP4：AAC 包 SHA256、PTS、DTS、duration、首包 skip-samples 与原输入逐项相同；不能仅依据容器总时长或 audioPreserved 标志。原音频有效时间为 0–1 秒，首个编码包从 −0.021333 秒开始并携带 1024 个 skip samples，末包时长为 0.018667 秒。

可查看：

- [人物视频 MP4](/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/video/portrait-motion-70-soft-glow.mp4)
- [人物视频无损像素参考](/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/video/portrait-motion-70-soft-glow.mkv)
- [音频保留 MP4](/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/video/audio-boundary-30-soft-glow.mp4)
- [输入／输出对照帧](/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/video/portrait-before-after.png)
- [完整命令、帧 hash 与媒体元数据](/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/video/stream-video-verification.json)
- [可重新执行的视频验证脚本](/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/video/verify-stream-video.py)

这些结果证明独立实现可以持续处理真实视频、重复与乱序调用保持一致，并正确对接编码器。它们不单独构成剪映原生视频逐帧一致性证明；原生输出对照必须另行绑定同一输入、尺寸、参数及运行时身份。
