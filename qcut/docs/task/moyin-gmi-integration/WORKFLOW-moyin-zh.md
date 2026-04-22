# Moyin（导演面板）工作流

> 在 QCut 编辑器中，交互式地把剧本 → 故事板 → 视频生成出来。
> 无头 CLI 流程见 `WORKFLOW-novel2movie-zh.md`。
> English: [WORKFLOW-moyin-en.md](./WORKFLOW-moyin-en.md)

## 1. 进入 Director（导演）面板

在 QCut 编辑器内，打开媒体面板并切换到 **Director** 标签页。
面板分为三列：

- **左列**：Script Editor（Import / Create / Novel 三个子标签）+ Configuration
- **中列**：Structure — 角色、场景、集数、镜头
- **右列**：所选条目的属性检查器

## 2. 提供剧本

从三个输入标签中选一个：

| 标签 | 输入什么 | 程序会做什么 |
| --- | --- | --- |
| **Import** | 粘贴已有的剧本 | 直接解析 |
| **Create** | 简短想法 + 类型 + 时长 | 先生成剧本，再解析 |
| **Novel** | 小说 / 散文文本 | 先转成剧本格式，再解析 |

## 3. 配置 Parse Model（解析模型）

在剧本文本框下方的 CONFIGURATION 区，**Parse Model** 下拉菜单默认为
**GMI · GLM-5.1** —— QCut 许可证服务器代理目前只配置了 GMI 的 key,
没有 OpenRouter 的，所以 GMI 是稳定可用的路径。

其他选项：

- GMI · Gemini 3.1 Flash Lite（更便宜、更快）
- GMI · Gemini 3.1 Pro（更聪明、更慢）
- Gemini Flash / Pro（经 OpenRouter —— 目前会返回 503，除非 Worker
  env 配置更新）
- MiniMax / Kimi / Claude（同样受限）

下方的 **Image Provider** 和 **Video Provider** 选择分镜生成后端 ——
FAL（Flux Pro + WAN v2.1）或 GMI（Seedream + Veo 3.1 Lite）。

## 4. 点击 Parse Script

后台运行 **6 步流水线**：

1. **初始解析** —— 把角色、场景、集数提取为结构化 JSON（单次 LLM 调用）
2. **标题校准** —— 精炼标题 + logline
3. **Synopsis 生成** —— 2-3 句剧情简介
4. **镜头校准** —— 按每一集生成镜头分解（机位、景别、运镜、角色）
5. **角色校准** —— 通过 character-calibrator 丰富角色的视觉身份锚点
   （骨骼结构、眼型、服装等）
6. **场景校准** —— 通过 scene-calibrator 丰富场景的美术指导
   （灯光、色彩、空间布局）

左侧面板实时显示每一步的进度。步骤 1 完成后中间面板就会显示部分结果；
后续步骤只是在丰富已有数据。

## 5. 审阅与编辑

- **Characters 标签**：点击角色编辑名字、外貌、角色定位、视觉 prompt、
  身份锚点
- **Scenes 标签**：编辑地点、时间、氛围、视觉 prompt
- **Shots 标签**：每个镜头的机位、角色、图像/视频 prompt

所有编辑会以 1 秒防抖自动保存到 `localStorage`，按项目 ID 隔离。
离开面板再回来，状态完全恢复。

## 6. 生成图片与视频

选中一个或多个镜头，点击 **Generate Image**（或对于已有图片的镜头点
Generate Video）。所选的 `Image Provider` / `Video Provider` 决定后端。

持久化：每个镜头生成的 URL 独立保存；项目重新加载后图像依然存在。

## 7. 导出 / 推送到时间轴

准备好后，可以把故事板数据导出为 JSON（归档用），或者把镜头 + 媒体
推送到 QCut 时间轴做最终剪辑。校准后的剧本数据会接入主编辑器的轨道系统。

## 备选：完全通过 CLI 自动化

上述每一步都可用 CLI 驱动（适合 QA / 回归 / 批处理）：

```bash
bun run pipeline editor:moyin:set-script --text '<剧本>' --json
bun run pipeline editor:moyin:parse --model gmi-glm-5.1 --json
bun run pipeline editor:moyin:status --json
bun run pipeline editor:moyin:export --json
```

需要 Electron 正在运行。完整示例见 `E2E-TEST.md` §C1。
