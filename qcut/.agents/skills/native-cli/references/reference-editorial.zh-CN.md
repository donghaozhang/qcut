# 多素材索引、剪辑计划与成片复检

这套流程适用于风景、旅行、混剪、产品展示等多素材项目。它补充
`qcut analyze video`，不会替代现有的单视频快速分析。

## 命令边界

```bash
# 快速理解单个视频
qcut analyze video -i clip.mp4

# 为整个素材目录建立可复用索引
qcut analyze index --dir ./downloads -o ./analysis

# 深入查看一个候选区间
qcut analyze inspect \
  --index ./analysis/index.json \
  --source yarra.mp4 \
  --start 2 \
  --end 9

# 按旁白 Beat 生成 EDL 和 QCut manifest
qcut edit plan \
  --index ./analysis/index.json \
  --script narration.zh.txt \
  --duration 43 \
  -o ./plan-zh

# 把 manifest 原子应用到已打开的 QCut 项目
qcut editor timeline apply \
  --project-id <project-id> \
  --manifest @./plan-zh/timeline.json \
  --replace \
  --atomic \
  --verify

# 对导出成片的每个切点做复检
qcut edit verify \
  --edl ./plan-zh/edl.json \
  --video ./final-zh.mp4 \
  --cut-window 1.5 \
  -o ./verification-zh
```

CLI 层级使用空格，不新增 `video-use` 命令，也不使用 slash command。

## 多素材索引

`analyze index` 会记录：

- 媒体探测结果与 SHA-256 素材指纹
- FFmpeg 本地场景边界
- 帧级亮度、对比度、清晰度、主体位置、运动和稳定度
- 稳定区间与排序后的候选入点/出点
- 可选的 Gemini 摘要、标签、地点、时段、主体和语义场景

默认语义模型是 `openrouter_gemini_3_5_flash_video`。本地视频不会整体
Base64 塞入请求，而是根据 FFmpeg 场景边界抽取最多 12 张有时间锚点的
640x360 JPEG，避免超过 OpenRouter 请求大小。使用 `--no-ai` 可执行完全
本地、可重复的索引。

主要产物：

```text
analysis/index.json
```

语义分析按素材降级。某条素材的模型调用失败时，错误会进入该素材的
`warnings`，本地场景、运动与质量索引仍会完成。

## 局部 Timeline View

`analyze inspect` 会生成 PNG 和 JSON sidecar，其中包含：

- 连续采样帧
- 素材时间尺
- 场景边界
- 提供 `--narration` 时的旁白波形
- 提供 `--transcript` 时的单词位置

`edit plan` 还会在 `views/` 下为每个选中镜头生成同类视图。只有脚本时，
单词位置会按文本权重估算并明确标记；提供旁白音频时会自动转写，除非
已经显式提供 transcript。

## 旁白 Beat 对齐

可用 `NAME:` 标注脚本 Beat：

```text
YARRA: 雅拉河穿过墨尔本市中心。
TRAM: 电车沿着城市街道向前。
DUSK: 黄昏时，天际线换上另一种颜色。
```

规划器会：

1. 根据词级时间戳或脚本文本权重生成 Beat 时间。
2. 把过长 Beat 拆成适合镜头长度的 slot。
3. 综合语义相关度、技术质量、运动和构图连续性、重复惩罚来选镜头。
4. 输出一等公民 EDL 和可直接应用的 QCut manifest。

中文和英文脚本独立规划。两版可以复用素材决策，但不会被强制使用完全
相同的 Beat 时间和切点。

每个 EDL 镜头包含：

```json
{
  "source": "pexels-yarra-riverfront.mp4",
  "start": 2.4,
  "end": 8.1,
  "beat": "YARRA",
  "reason": "匹配河流语义；构图稳定；向右运动与下一镜头连贯"
}
```

产物：

```text
plan-zh/edl.json
plan-zh/timeline.json
plan-zh/views/clip-01.png
plan-zh/views/clip-01.json
```

所有时间边界由同一个时间游标产生，相邻镜头没有缝隙或重叠。切换另一
语言的 plan 时，文件名与字节大小一致的项目素材会被直接复用。

## 成片切点复检

`edit verify` 会对每个 EDL 切点检查：

- 单帧亮度闪变
- 过大的构图跳变
- 运动方向反转
- 孤立的音频 RMS 突刺
- 已声明标题的时间重叠和安全区风险

产物：

```text
verification-zh/verification.json
verification-zh/cuts/cut-01-3.295s.png
```

JSON 报告包含每项检查的测量值、状态、严重程度和说明。存在 error 时
`passed` 为 false；warning 会保留给剪辑人员复核。

## E2E 验收

使用真实素材时，应逐项确认：

1. `index.json` 包含所有可读素材，每个有效场景至少有一个候选区间。
2. 默认 AI 冒烟测试写入了 `semantics`，且没有请求体过大的错误。
3. `inspect` 和每镜头视图包含画面、时间尺和场景边界。
4. 中文与英文 plan 的切点数组是独立生成的。
5. `editor timeline apply --atomic --verify` 能连同转场一起成功。
6. QCut read-back 的有效时长和 source trim 与 EDL 一致。
7. 应用另一语言版本时，共享素材不会重复导入。
8. 请求 1080p 时，导出文件至少为 1920x1080。
9. `edit verify` 为每个切点生成证据图，且没有无法解释的 error。
