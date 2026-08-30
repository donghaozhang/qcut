# 剪映音频基础面板实现与本地探针

## 结论

我们已经有三层本地探针，但此前没有一个探针把截图中的音频基础面板完整串起来：

1. 草稿结构探针：能盘点明文/opaque 草稿，并对同一测试项目做脱敏的前后语义差分。
2. 音频输出探针：能比较导出文件的声道、采样率、时长、响度、真峰值、静音区间和逐声道差值。
3. 本次新增的音频面板探针：把草稿集合、启用态样本和剪映二进制静态标记按控件汇总，输出不含文件路径的 JSON。

截至 `2026-08-30`，本机安装的是剪映专业版 macOS `11.3.0`，bundle id 为
`com.lemon.lvpro`。新增探针通常在约 `2-3s` 内完成，并在 10 组能力上全部找到预设的
`libvideoeditor.dylib` / `libVECreator.dylib` 静态标记。

这里的“静态标记全部命中”只证明当前版本包含对应模型、字段和业务编排代码，不等于已经通过 UI
实测了每种参数，也不等于所有 AI 能力都能离线运行。

## 当前实测基线

只读扫描结果：

| 项目 | 数量 |
| --- | ---: |
| 草稿候选文件 | 1340 |
| 可解析 JSON | 385 |
| opaque 文件 | 955 |
| 含时间线的明文文档 | 29 |
| 处于 `.locked` 状态的项目 | 2 |

与音频基础面板相关的材料集合：

| 集合 | 总对象 | 探针识别出的启用态 |
| --- | ---: | ---: |
| `sound_channel_mappings` | 35 | 0 |
| `vocal_separations` | 35 | 0 |
| `audio_fades` | 0 | 0 |
| `loudnesses` | 0 | 0 |
| `audio_balances` | 0 | 0 |
| `realtime_denoises` | 0 | 0 |
| `vocal_beautifys` | 0 | 0 |
| `audio_pitch_shifts` | 0 | 0 |
| `audio_pannings` | 0 | 0 |
| `ai_translates` | 0 | 0 |
| `multi_language_refs` | 0 | 0 |

另外发现 48 个带 `volume` 和 `last_nonzero_volume` 的 segment，全部是默认值。35 个
`sound_channel_mappings` 和 35 个 `vocal_separations` 也是每段素材自动附带的默认
companion，不是 35 次声道配置或声音分离操作。

## 控件实现图谱

证据等级：

- `明文实测`：当前本地明文草稿中确实出现。
- `静态强证据`：11.3.0 的字段、序列化类、动作或任务日志直接命名该能力。
- `待验证`：仍缺单变量 UI 操作后的明文差分或导出行为证据。

| UI 控件 | 草稿持久化 | 11.3.0 实现证据 | 执行方式 | 当前状态 |
| --- | --- | --- | --- | --- |
| 音量 | segment 的 `volume`，视频 segment 另有 `last_nonzero_volume` | `SegmentAudio/SegmentVideo::set_volume(double)` | 本地时间线增益，支持音频关键帧 | 默认值明文实测；dB 到线性值映射待测 |
| 淡入/淡出 | `audio_fades[]`，字段 `fade_in_duration`、`fade_out_duration`、`fade_type` | `MaterialAudioFade`，`AUDIO_FADE_IN/OUT_ACTION` | 本地时间线包络 | 字段和整数类型为静态强证据；单位、曲线类型枚举待测 |
| 响度统一 | 新版 `loudnesses[]`；旧版还存在 `audio_balances[]` | `MaterialLoudness`、`LoudnessParam`、`LoudnessManager`、`KAudioLoudness` | 先分析 average/peak，再按 target 应用；算法任务可阻塞导出 | 静态强证据；无启用态草稿 |
| 音频降噪 | `realtime_denoises[]` | `is_denoise`、`denoise_mode`、`denoise_rate`、SAMI 元数据；`KAudioDenoise` | 本地实时材料加模型处理，业务层还受远端配置控制 | 本地模型存在；各模式及是否全离线待测 |
| 人声美化 | `vocal_beautifys[]` | `enable`、`production_path`、`time_range`、`voice_change_mode`、`ambient_sound_level`；`KAudioVocalBeautify` | 异步算法生成派生音频，存在 SAMI/网络任务路径 | 静态强证据；无启用态草稿和导出样本 |
| 声音分离 | `vocal_separations[]` | `choice`、`removed_sounds`、`production_path`、`final_algorithm`、`time_range` | 异步分离，生成派生 stem；未完成任务会阻塞导出 | 默认 companion 明文实测；启用态待测 |
| 变调 | `audio_pitch_shifts[]` | `enable_pitch_shift`、`semitones`、`cents`；`AudioPitchShiftViewModel` | 本地音频处理；半音与音分分开保存 | 静态强证据；范围、量化和保时长行为待测 |
| 立体声平衡 | `audio_pannings[]` | `enable_panning`、`panning_value` | 本地逐声道 panning | 静态强证据；数值范围和 panning law 待测 |
| 声道配置 | `sound_channel_mappings[]` | `MaterialChannelConfig` 的 `audio_channel_mapping`、`is_config_open` | 输入声道路由/选择元数据 | 默认 companion 明文实测；枚举含义待测 |
| 音频翻译 | `ai_translates[]`、`multi_language_refs[]` | source/target language、`production_path`、`mouth_shape_modify`；任务日志含 upload/web/download 各阶段 | 明确的网络异步任务，可含人声检测、语言检测、声纹比较和口型修改 | 静态强证据；无启用态草稿和下载结果 |

## 关键判断

### 1. `audio_balances` 不是当前“立体声平衡”

11.3.0 中：

- `MaterialAudioBalance` 的字段是 `enable_balance`、`average_loudness`、
  `peak_loudness`、`target_loudness`，属于旧响度平衡模型。
- `MaterialAudioPanning` 才有 `enable_panning` 和 `panning_value`，对应当前面板的
  “立体声平衡”。

QCut 若直接把 `audio_balances` 当左右声像，会把两个不同版本的语义错误合并。

### 2. 响度统一不是普通音量滑杆

剪映同时保存目标响度、分析得到的平均/峰值响度和时间范围。二进制明确限制
`target_loudness` 在 `[-70, 0] LUFS`，并存在 `LoudnessManager`、写入分析结果和等待算法
完成的流程。因此 QCut 对齐时应建模为“分析结果 + 启用状态 + 目标值”，不能只保存一个
gain。

### 3. 降噪有本地模型，但不能据此宣布完全离线

安装包中实际存在：

```text
Contents/Resources/audiosami/unet_denoise_44k_music_model_v1.0.model
```

文件大小为 `264172` bytes。运行时同时出现 `MaterialRealtimeDenoise`、本地模型路径和
远端 tool descriptor/SAMI 相关标记。可靠结论是“至少存在本地模型支持的处理路径”；不同
模式是否会下载模型或调用网络仍需断网对照。

### 4. 人声美化、声音分离、音频翻译会生成派生结果

三者都有 `production_path` 或等价输出路径。剪映的导出阻塞日志会分别检查
`vocal_beautify`、`vocal_separation`、`ai_translate` 和 `loudness` 是否完成。音频翻译还明确
记录 detach、upload audio、language detection、voiceprint comparison、web task、download、
mouth shape modification 的耗时，因此它不是本地实时滤镜。

## 可直接使用的探针

### 综合音频面板探针

```bash
bun research/jianying-basic-audio-probe/probe-report.ts
```

可指定另一个安装包或测试草稿根目录：

```bash
bun research/jianying-basic-audio-probe/probe-report.ts \
  --app "/Applications/VideoFusion-macOS.app" \
  --draft-root "$HOME/Movies/JianyingPro/User Data/Projects/com.lveditor.draft"
```

输出保证：

- 不输出项目名、草稿路径、媒体路径或派生音频路径。
- 不修改剪映项目、缓存或安装包。
- 将对象总数和“启用态对象数”分开。
- 静态标记缺失时 fail-closed，标记为 `partial` 或 `missing`，不会默认为支持。

### 草稿盘点与单变量差分

```bash
bun .agents/skills/qcut-toolkit/jianying-draft-binary-reference/scripts/inspect-draft.ts inventory

bun .agents/skills/qcut-toolkit/jianying-draft-binary-reference/scripts/inspect-draft.ts diff \
  --before "/private-evidence/A-001/before/draft_content.json" \
  --after "/private-evidence/A-001/after/draft_content.json"
```

### 导出音频比较

```bash
bun scripts/capcut-e2e/audio-comparison.ts \
  --left "/private-evidence/jianying.mov" \
  --right "/private-evidence/qcut.mov" \
  --output "/private-evidence/comparison" \
  --json
```

该探针会比较声道布局、采样率、时长、EBU R128 integrated loudness、LRA、true peak、
静音区间和逐声道差值。`audio-tone-evidence.ts` 还能用校准音测量指定窗口的频率，但它目前是
E2E 模块，不是独立 CLI。

## 仍缺的受控实验

当前两个可见实验项目都有 `.locked`，当前 draft body 也是 opaque。遵守安全协议，本次没有
复制、修改或强行读取它们。下一轮应创建全新的 `QCut-JY-Lab-YYYYMMDD-Audio`，只放生成的
双声道校准音，每次只改一个控件：

| ID | 单一操作 | 草稿证据 | 导出证据 |
| --- | --- | --- | --- |
| A-001 | 音量从 `0.0dB` 改为 `-6.0dB` | `volume` 精确值 | RMS/peak 比例，验证 dB 映射 |
| A-002 | 淡入 `1.2s`、淡出 `0.7s` | duration 单位与 `fade_type` | 包络起止和曲线 |
| A-003 | 开启响度统一 | target/average/peak、任务状态 | LUFS 收敛值和 true peak |
| A-004 | 开启每一种降噪模式 | mode/rate/path | 噪声底、语音失真、断网行为 |
| A-005 | 开启人声美化并改强度 | 输出路径、模式、时间范围 | 派生文件和频谱变化 |
| A-006 | 分别保留人声/伴奏 | choice、removed sounds、输出路径 | 两个 stem 的泄漏量 |
| A-007 | 设为 `+3` 半音并加细调 | semitones/cents | 主频比和时长保持 |
| A-008 | 平衡设为全左、中央、全右 | panning value | 左右声道增益，推导 panning law |
| A-009 | 逐项切换声道配置 | mapping 枚举 | 左右/单声道输入路由 |
| A-010 | 中译英，不启用口型修改 | 语言、任务、输出路径 | 网络请求阶段和派生音频 |

每个 case 必须从同一个干净基线复制，在项目关闭且 autosave 静止后取 before/after。若只得到
opaque body，则保留 UI/导出证据，等待剪映自己产生明文 backup/subdraft，不解密、不复制
`.locked` 项目。

## 对 QCut 的直接含义

1. 先实现可确定的本地参数层：`volume`、fade、pitch、panning、channel mapping。
2. 响度要拆成分析和应用两个阶段，并保存测量值，不能复用普通音量模型。
3. 降噪接口要允许 mode/rate/model provenance，并把“本地可用”和“需要网络资源”分开报告。
4. 美化、分离、翻译要有异步任务状态、取消、缓存、派生文件生命周期和导出阻塞。
5. 导入器必须保留未知音频材料；当前 QCut 对 `audio_fades` 仍是声明损失，不能称为完整互操作。

在 A-001 至 A-010 完成前，可以确认“架构和字段入口”，不能确认 UI 数值映射、算法参数或
剪映级听感一致性。
