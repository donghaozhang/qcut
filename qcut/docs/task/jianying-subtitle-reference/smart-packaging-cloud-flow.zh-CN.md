# 剪映智能包装云端流程研究

> 研究对象：剪映专业版 macOS 11.3.0
>
> 记录日期：2026-08-30
>
> 范围：字幕面板里的“智能包装”，以及它对字幕、花字、音效、贴纸/特效素材的自动匹配链路
>
> 性质：本地只读互操作研究；不调用剪映私有接口，不上传素材，不记录完整签名 URL 或用户素材对象

## 结论

“智能包装”不是本地模板随机套用，也不是单纯字幕识别。它是一个**云端异步草稿处理任务**：

1. 本地校验主轨视频/音频和用户选项。
2. 用户授权后，客户端把当前草稿和素材上传到剪映服务端可访问的对象存储。
3. 客户端提交 `cap_key: "ai_packaging_draft"` 的异步任务。
4. 服务端分析画面/人声/字幕，匹配字幕高亮、花字、文字模板、文字动画、音效、贴纸等素材。
5. 客户端轮询排队和进度。
6. 服务端返回处理后的 draft/template 下载地址和素材统计。
7. 本地下载结果，写入本地草稿和 `SmartPackCache`，之后预览、编辑、导出走本地时间线/素材渲染链。

因此 QCut 对标时不能把它实现成纯前端按钮。正确边界是：**云端负责理解和决策，本地负责选项、上传任务、进度、结果校验、草稿合并、缓存和渲染**。

## 本地探针复查

探针源码：

```text
research/jianying-subtitle-probe/probe.ts
research/jianying-subtitle-probe/probe.test.ts
```

复查命令：

```bash
bun research/jianying-subtitle-probe/probe.ts
```

`schema: "qcut.jianying-subtitle-probe/2"` 会输出 `smartPackaging` 字段，包含：

- `config`：`ai_packaging.ini` 的本地开关，草稿 UUID 会脱敏成 `[draft-id-n]_video`。
- `cache`：`Cache/SmartPackCache` 的缓存文件摘要。
- `asyncTasks`：真实 `attachment_async_tasks.json` 中的 `ai_packaging_draft` 任务摘要。
- `draftResults`：本地草稿 `attachment_pc_common.json` 中的包装结果统计。
- `endpoints`：安装包二进制里可见的上传、common task、资源和埋点接口摘要。

## 用户流程顺序

| 顺序 | 剪映行为 | 本地证据 |
| --- | --- | --- |
| 1 | 进入“字幕 > 智能包装” | 本地化文案包含“选择智能包装，一键匹配精美素材” |
| 2 | 校验素材条件 | 文案包含“主轨为空”“未识别到音频”“未识别人声”“暂不支持纯图片” |
| 3 | 选择包装风格和开关 | `ai_packaging.ini` 保存 `packagingStyle`、`clearCurrentSubtitles`、`commercialMaterialsOnly`、`generateIntro`、`generateChapters` |
| 4 | 请求上传/分析授权 | 文案明确“将您的草稿文件回传至服务端进行处理” |
| 5 | 上传草稿和素材 | 真实任务 payload 包含 `draft.uri`、`material.storage: "vcloudspace"`、`video_uri`、`audio_vid` |
| 6 | 创建云端异步任务 | 真实任务 payload 包含 `cap_key: "ai_packaging_draft"` |
| 7 | 排队/处理中轮询 | 文案包含“智能包装排队中”“智能包装处理中 %1%” |
| 8 | 下载处理结果 | 真实结果 payload 包含签名 draft URL，域名为 `lf26-faceu-file-sign.bytecdn.com` |
| 9 | 本地落地和渲染 | `attachment_pc_common.json` 写入 `ai_packaging_infos` 和 `ai_packaging_report_info`；`SmartPackCache/template.zip` 内是普通草稿 `template.json` |

## 云端接口链

下面是当前能从本机二进制和真实任务记录拼出的接口链。`ai_packaging_draft` 的请求 payload 是真实草稿持久化证据；具体 HTTP POST 落在哪个 common-task 路由上，没有做 live packet capture，因此路由列按证据等级区分。

| 阶段 | 接口或能力 | 证据等级 | 用途 |
| --- | --- | --- | --- |
| 上传签名 | `/lv/v1/upload_sign`、`/lv/v2/upload_sign` | 二进制端点表 | 获取上传空间和签名 |
| 上传预检 | `/lv/v1/copilot/get_preupload_time` | 二进制端点表 | 估算或准备上传耗时 |
| 上传素材 | `/lv/v1/copilot/upload_material`、`/lv/v1/edit/material/upload` | 二进制端点表 | 上传视频/音频/草稿依赖素材 |
| 视频上传参数 | `https://vas.snssdk.com/video/openapi/v1/?action=GetVideoUploadParams` | 二进制端点表 | 获取视频上传参数 |
| 视频上传确认 | `https://vas.snssdk.com/video/openapi/v1/?action=UpdateVideoUploadInfos` | 二进制端点表 | 更新上传结果 |
| 创建异步任务 | `/lv/v1/common_task/new` 或 `/agent_edit_api/common_task/new` | 二进制端点表 + 真实 `cap_key` payload | 提交 `ai_packaging_draft` |
| 查询异步任务 | `/lv/v1/common_task/query` 或 `/agent_edit_api/common_task/query` | 二进制端点表 + 排队文案 | 轮询状态、进度、预计等待 |
| 取消异步任务 | `/lv/v1/common_task/cancel` 或 `/agent_edit_api/common_task/cancel` | 二进制端点表 | 用户取消或草稿操作冲突时终止 |
| 同步任务状态 | `/lv/v1/common_task/sync` | 二进制端点表 | 同步后台任务状态 |
| 历史任务 | `/lv/v1/capflow/history_task` | 二进制端点表 | 查询历史 capflow 任务 |
| 素材资源 | `https://lv-api.ulikecam.com/artist/v1/effect/*`、`https://effect.snssdk.com`、`https://lv-effect.ulikecam.com`、`https://gecko.zijieapi.com` | 二进制端点表 | 下载/查询包装结果引用的模板、花字、贴纸、音效等资源 |
| 埋点 | `https://mcs.zijieapi.com/v1/json`、`https://mcs.zijieapi.com/v1/list` | 二进制端点表 | 上报包装任务和素材统计 |

关键点：`/agent_edit_api/run_draft_modify_intent` 和 `/agent_edit_api/common_task/*` 更像剪映 AI 辅助/智能编辑通用链路，和智能包装共用上传、任务和草稿修改能力；当前证据不足以证明智能包装每次都固定走 `agent_edit_api`，所以不能把它写死成单一路径。

## 真实任务 payload 摘要

真实草稿路径：

```text
~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/7月2日-副本/common_attachment/attachment_async_tasks.json
```

该文件中有 1 个智能包装任务，核心字段如下。对象存储路径和签名 URL 在本文中只保留类型，不保留完整值。

```json
{
  "enter_from": "edit_draft",
  "status": -2,
  "err_code": 0,
  "duration": 30465,
  "expect_cost_time": 55460,
  "request_payload": {
    "cap_key": "ai_packaging_draft",
    "cap_json": {
      "draft": {
        "uri": "tos-cn-v-0000c2242/[redacted]"
      },
      "material": {
        "format": "vid",
        "storage": "vcloudspace",
        "time_range": {
          "start_time": 0,
          "end_time": 84100
        },
        "type": "video"
      },
      "options": {
        "audio_format": "aac",
        "audio_lang": "zh",
        "audio_sample_rate": 44100,
        "canvas_height": 1920,
        "canvas_width": 1080,
        "gen_asr": false,
        "gen_chapters": false,
        "gen_intro": false,
        "gen_subtitle_and_text_template": true,
        "only_commercial_material": false,
        "style": "knowledge",
        "video_duration": 84100000,
        "video_height": 570,
        "video_uri": "tos-cn-v-0000c2242/[redacted]",
        "video_width": 320
      }
    }
  }
}
```

结果 payload 包含：

| 字段 | 观察值 |
| --- | --- |
| `draft.url` | 有，域名 `lf26-faceu-file-sign.bytecdn.com`，完整签名参数未记录 |
| `analytics.materials` | 18 个素材引用 |
| 素材类型分布 | `text_templates` 7、`sound_effects` 6、`sticker` 2、`font` 1、`fancy_word` 1、`text_animation` 1 |
| 素材存储 | `artist` 16、`loki` 2 |

这说明智能包装返回的不是“字幕文本”这么简单，而是一个带资源引用、字幕模板和装饰素材的草稿修改结果。

## 本地落地结构

### 用户选项

```text
~/Movies/JianyingPro/User Data/Config/ai_packaging.ini
```

当前本机示例：

```ini
[General]
[draft-id-a]_video=true
[draft-id-b]_video=true
authorized=false
clearCurrentSubtitles=true
commercialMaterialsOnly=false
generateChapters=false
generateIntro=false
packagingStyle=1
```

`auto_caption.ini` 还保存：

```ini
autoHighlight=true
filterWords=true
```

这些是本地状态，不代表包装算法在本地执行。

### 草稿结果

真实草稿路径：

```text
~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/7月2日-副本/attachment_pc_common.json
```

核心字段：

| 字段 | 观察值 |
| --- | --- |
| `ai_packaging_infos` | 106 条 |
| `ai_packaging_infos[].material_type` | `1`: 18、`2`: 48、`3`: 30、`10`: 10 |
| `ai_packaging_infos[].keyword_info` | 包含“2.5”“一些企业”“开始内测”“参考时长”等文本关键词 |
| `ai_packaging_report_info.task_id` | 有任务 ID |
| `ai_packaging_report_info.method` | `video` |
| `ai_packaging_report_info.page_from` | `edit` |
| `ai_packaging_report_info.style` | `entertainment` |
| `ai_packaging_report_info.text_style` | `full_caption` |
| `ai_packaging_report_info.caption_id_list` | 19 个字幕 ID |

这部分是剪映把云端结果合并回本地草稿后的追踪/报告结构。

### SmartPackCache

缓存路径：

```text
~/Movies/JianyingPro/User Data/Cache/SmartPackCache
```

当前本机可见：

| 文件 | 含义 |
| --- | --- |
| `template.zip` | 返回的智能包装草稿模板，内部只有 `template.json` |
| `*.mp4` | 包装示例或素材视频缓存 |
| `*.mp4.alpha.mp4` | 带 alpha 的视频缓存 |
| `*.aac` | 音频缓存 |
| `*_sample.zip` | 示例素材包 |

`template.zip/template.json` 摘要：

| 项 | 观察值 |
| --- | --- |
| `tracks` | 7 |
| `materials.text_templates` | 存在 |
| `materials.stickers` | 存在 |
| `materials.texts` | 存在 |
| `config.subtitle_keywords_config` | 存在 |
| `extra_info.subtitle_fragment_info_list` | 65 条 |

其中 `subtitle_cache_info` 里有字幕识别缓存，包含 `language_server_recognize: "zh-CN"`、`language_user_select: "Auto"`、`task_id`、`text` 和 `words`。这证明返回模板已经内嵌字幕片段/词信息，但最终结构仍是本地草稿可消费的普通 `template.json`。

## 二进制符号证据

`libvideoeditor.dylib` 可见：

```text
AttachmentAiPackagingInfo
AttachmentAiPackagingItemInfo
AttachmentAiPackagingReportInfo
AttachmentBrollPackagingInfo
ai_packaging_infos
ai_packaging_report_info
template_use_smart_pack
create_ai_package
draft_cloud_package_type
cloud_package_type
cloud_package_completed_time
draft_is_ai_packaging_used
enable_smart_pack
use_smart_pack
```

`libAICreator.dylib` 和 `libDeepAgentsService.dylib` 可见：

```text
UploaderService_DoUpload
HttpClient_GetTaskId
common_task
ai_packaging_task_id
ai_packaging_material_cnt
ai_packaging_material_type_list
ai_packaging_material_id_list
ai_packaging_caption_template_id
ai_packaging_text_template_id
ai_packaging_caption_highlights_list
ai_packaging_text_highlights_list
ai_packaging_start_time_list
ai_packaging_duration_list
```

这些符号与真实 `attachment_async_tasks.json` 的任务 payload 能互相印证：智能包装有上传、任务 ID、素材统计、字幕模板/高亮和本地草稿状态。

## 对 QCut 的实现要求

如果 QCut 要接近剪映智能包装，建议拆成以下链路：

1. **素材和草稿快照层**：收集主轨视频、音频、已有字幕、镜头边界、画布尺寸、时长和语言。
2. **授权和上传层**：明确告知用户云端处理；上传草稿快照和必要素材；记录上传对象、hash、大小和过期策略。
3. **云端任务层**：提交 `smart-packaging` job，保存远端任务 ID、provider、模型版本、选项、风格、状态、重试次数。
4. **轮询层**：支持 queued/running/progress/failed/canceled/completed；可恢复，不依赖单次页面会话。
5. **结果校验层**：校验返回字幕、词级 timing、资源 ID、资源包、时间线修改范围和版本兼容性。
6. **本地合并层**：把返回结果转成 QCut 时间线操作：字幕模板、关键词高亮、贴纸/特效、音效、转场、章节/开场。
7. **缓存层**：缓存可复用资源，区分云端任务结果、素材包和本地渲染缓存。
8. **探针/诊断层**：记录 provider、耗时、素材数量、失败码、是否命中缓存和实际修改的 timeline action。

不要把智能包装和字幕识别绑死。剪映的证据显示，包装任务可以设置 `gen_asr: false`，但仍会生成/应用字幕和文字模板。这意味着它可以消费已有识别结果，也可以在服务端按选项生成字幕相关结果。

## 仍需 live capture 确认的点

当前结论足够确认“智能包装是云端异步草稿处理”，但还不能确认以下细节：

- `ai_packaging_draft` 在当前账号、当前地区、当前版本下究竟固定走 `/lv/v1/common_task/new` 还是 `/agent_edit_api/common_task/new`。
- `status: -2` 的枚举名，需结合运行时或更多任务状态样本确认。
- `ai_packaging_infos[].material_type` 的数字枚举含义，当前只知道它对应包装素材项类型，不能直接把 `1/2/3/10` 写成某个固定业务类型。
- 服务端是否总是返回完整 draft，还是某些场景只返回 patch/intent。
- 不同包装风格：智能推荐、科技风、生活 Vlog、营销带货、知识分享、综艺娱乐，对 payload 和结果素材分布的影响。

最小 live 验证方案：用 15-30 秒无隐私测试口播素材，新建一次智能包装，开启网络代理或系统级 HTTPS 记录，只保存 host、path、状态码、payload schema 和耗时，不保存 token、cookie、签名 URL 或原始素材地址。
