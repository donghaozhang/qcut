# 剪映字幕能力实现研究

> 研究对象：剪映专业版 macOS 11.3.0
>
> 记录日期：2026-08-30
>
> 范围：用户截图中的“字幕”面板，包括识别字幕、歌词识别、字幕模板、智能包装和新建字幕
>
> 性质：只读互操作研究，不复制或分发剪映私有模型、接口、素材与缓存

## 结论先行

剪映字幕不是单一实现路径，而是至少三层混合架构：

1. **本地字幕编辑和渲染层**：普通字幕片段、新建字幕、字幕样式、字幕动效、字幕模板应用都落在本地草稿和本地渲染链。`libvideoeditor.dylib` 暴露了 `TextClient`、`TextTemplateClient`、`TextTemplateEditorClient`、`lvve::CaptionInfo`、`lvve::CaptionAnim` 等草稿/渲染符号。
2. **本地 ASR Provider 层**：本机用户数据中存在 `SupplysStore/local-asr-supplies`，包含 `asr-model-encoder.onnx`、`asr-model-classifier.onnx`、`asr-punc.onnx`、`asr-itn-fst.fst` 和 `strategy.json`。安装包还有 `libspeechsdk.dylib`，其中可见 `UniversalAsr`、`CaptionPostProcessActor` 等语音识别和字幕后处理结构。
3. **云端权益/服务层**：识别字幕、歌词识别、字幕模板、翻译和智能包装都有账号、次数、网络、VPN、队列、上传或回传服务端文案。生产 UI 不能被建模成“永远本地”。它会按能力、素材、账号、会员、地区或实验策略选择本地/云端路径。

最稳妥的产品判断：**新建/编辑/样式渲染是本地；识别字幕和歌词识别是混合；双语翻译和智能包装明确有云端处理；字幕模板是在线素材/权益 + 本地应用渲染。**

## 功能总表

| UI 功能 | 底层做法 | 执行位置 | 证据等级 |
| --- | --- | --- | --- |
| 新建字幕 | 写入文本片段、`CaptionInfo` 和时间范围，预览/导出时本地渲染 | 本地 | 强证据 |
| 识别字幕 | ASR 生成文本片段，再进入字幕编辑/渲染链；本机存在离线 ASR 供给，但 UI 受登录、次数、网络和账号状态约束 | 本地/云端混合 | 已证实 |
| 歌词识别 | 与字幕识别类似，另有歌词动效、歌词模板和缓存路径 | 本地/云端混合 | 已证实 |
| 自定义词汇识别 | 本地缓存关键词，但同步失败、数量上限和权益由账号服务控制 | 本地缓存 + 云端同步 | 强证据 |
| 智能划重点 | `auto_caption.ini` 中保存 `autoHighlight=true`；智能包装也可识别全文字幕并高亮关键词 | 混合，需运行时继续拆分 | 强证据 |
| 智能去水词 | `auto_caption.ini` 中保存 `filterWords=true`；具体删除策略尚未定位到独立本地模型 | 未完全确认 | 推断 |
| 字幕翻译/双语字幕 | 本地保存翻译状态和结果路径；授权文案明确音视频素材回传服务器处理 | 云端处理 + 本地落地 | 已证实 |
| 字幕模板 | 在线/会员素材目录与导出次数控制；下载或缓存后由本地文字模板运行时应用和渲染 | 混合 | 已证实 |
| 字幕动效/花字 | 资源包内的文字模板、caption animation、花字素材由本地渲染链消费 | 本地渲染，素材可来自云端下载 | 强证据 |
| 智能包装 | 上传或回传草稿到服务端，自动匹配字幕、花字、音效和特效；本地只保存状态和结果 | 云端 | 已证实 |

## 本地探针

探针源码：

```text
research/jianying-subtitle-probe/probe.ts
research/jianying-subtitle-probe/probe.test.ts
```

复查命令：

```bash
bun research/jianying-subtitle-probe/probe.ts
```

可指定剪映安装包和用户数据目录：

```bash
bun research/jianying-subtitle-probe/probe.ts \
  --app /Applications/VideoFusion-macOS.app \
  --user-data "$HOME/Movies/JianyingPro/User Data"
```

当前本机结果摘要：

| 探针项 | 结论 | 关键证据 |
| --- | --- | --- |
| 识别字幕 | `hybrid` / `confirmed` | `libspeechsdk.dylib`、`local-asr-supplies`、字幕识别次数、网络异常、账号/VPN 文案 |
| 歌词识别 | `hybrid` / `confirmed` | `image_h5_smart_lyrics`、`LyricsAsrDetect`、歌词识别次数、`TextClient::getLyricsRecognizeInfo` |
| 字幕翻译/双语字幕 | `cloud` / `confirmed` | 音视频翻译回传服务器授权文案、`AudioClient::enableAITranslate`、`TextClient::translateText` |
| 字幕模板/样式/动效 | `hybrid` / `confirmed` | `publish-subtitle-template.html`、`Cache/AITextTemplate`、字幕模板次数、`CaptionAnim` 和 `TextTemplateClient` |
| 智能包装 | `cloud` / `confirmed` | 草稿文件回传服务端、排队/处理中状态、`DraftStore::setIsAiPackagingUsed` |

探针只做本地只读扫描，不调用剪映私有服务，不上传素材，也不复制私有模型。它的目的不是“跑通字幕识别”，而是防止我们把静态 UI 截图误写成纯本地或纯云端。

## 证据摘录

### 本地 ASR 供给

本机用户数据目录存在：

```text
~/Movies/JianyingPro/User Data/SupplysStore/local-asr-supplies
```

关键文件包括：

```text
asr-model-encoder.onnx
asr-model-classifier.onnx
asr-punc.onnx
asr-itn-fst.fst
asr-model-token.txt
asr-punc-token.txt
strategy.json
```

`strategy.json` 显示 ASR 策略包含模型类型、调度比例、VAD 切片时长和句子分割配置。这证明本机具备离线 ASR 供给，但不能单独证明截图中的每次“开始识别”都走本地。

### 账号、网络和服务端约束

本地化资源中可复查到以下语义：

- 识别字幕及识别歌词按月免费次数，导出时扣除，免费次数需登录后查看并使用。
- 网络异常时，草稿中的字幕结果可能无法读取。
- 字幕功能可能因账号封禁或 VPN 环境不可用。
- 音视频翻译需要将素材内容回传至服务器处理。
- 智能包装明确允许剪映上传草稿文件并回传至服务端处理。

这些文案把识别字幕、翻译和智能包装从“纯本地功能”中排除。

### 本地草稿与渲染符号

`libvideoeditor.dylib` 中可见：

```text
TextClient::createSubtitleFragmentInfos
TextClient::updateSubtitleFragmentInfos
TextClient::splitSubtitleFragmentInfos
TextClient::updateSubtitleTemplate
TextClient::getLyricsRecognizeInfo
TextTemplateClient::generateResourcePackage
TextTemplateEditorClient::addCaptionAnim
TextTemplateEditorClient::updateCaptionKeywordStyle
lvve::CaptionInfo
lvve::CaptionAnim
```

这证明字幕结果进入本地草稿模型后，会由本地文字/模板运行时处理，而不是每次预览都请求云端。

## QCut 对应设计建议

QCut 不要用一个 `subtitleEffect` 把识别、模板、动效和包装全部揉在一起。建议拆成：

```ts
type SubtitleProvider = "local-asr" | "cloud-asr" | "cloud-translate" | "local-render";

type SubtitleJob = {
  id: string;
  kind: "speech-recognition" | "lyric-recognition" | "translation" | "smart-packaging";
  provider: SubtitleProvider;
  sourceFingerprint: string;
  language: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  transcriptPath?: string;
  segmentsPath?: string;
  errorCode?: string;
};
```

字幕样式和模板应独立于识别任务：

- 识别任务只产出文本、时间戳、词级信息和置信度。
- 字幕模板只消费已有字幕片段，保存样式资源 ID、关键词样式、动效和版本。
- 云端任务必须保存授权、上传状态、远端任务 ID、重试和结果校验。
- 本地 ASR 必须有模型版本、语言支持、设备能力和断网回归测试。

## 后续需要补的运行时验证

1. 断网状态下点击“识别字幕”，确认当前账号/语言是否会走本地 ASR 或直接失败。
2. 在线状态识别同一素材，记录是否下载/更新 `local-asr-supplies`，以及草稿新增的字幕片段字段。
3. 对“智能划重点”和“智能去水词”分别做最小音频样本，比较开关前后的字幕片段和关键词样式。
4. 对字幕模板下载后断网重开，确认已缓存模板是否仍能本地预览和导出。
5. 对智能包装抓取任务队列、草稿字段、上传授权和返回结果路径，确认本地只负责落地结果。

验收必须分开报告：识别是否成功、字幕片段是否保存、模板是否应用、预览是否生效、导出是否生效、断网行为、账号/权益失败路径和缓存复用。不要把其中一项当作全部完成。
