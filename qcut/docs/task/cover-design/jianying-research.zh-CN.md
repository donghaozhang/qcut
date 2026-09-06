# 剪映封面机制研究

> 2026-09-06 更正：本文 2026-08-30 实验观察的是 Web/CEF 路径，不能概括所有封面入口。后续原生“封面设计”实测确认 `Cache/template/<hash>/template.json` 包含 `cover.cover_draft`，并成功套用文字模板。下文“Cache/template 仅属常规视频模板”“封面只走在线图文编辑器”的推断已被该证据推翻；历史正文保留供追溯。当前缓存、分类、依赖与未实现边界见 [原生模板缓存实测](./native-cache-2026-09-06.zh-CN.md)。

- 研究日期：2026-08-30
- 应用：剪映专业版 macOS 11.3.0
- Bundle ID：`com.lemon.lvpro`
- 安装包：`/Applications/VideoFusion-macOS.app`
- 草稿根目录：`/Users/peter/Movies/JianyingPro/User Data/Projects/com.lveditor.draft`
- 受控样本：`8月30日 (4)`，画布 `720 x 1280`

## 一句话结论

剪映的“封面”不是主时间线里的普通视频片段，而是草稿级的专用静态封面资产。它有独立的取帧、导图、模板/文字设计和 AI 封面入口；点击“设为封面”后，剪映会把设计结果扁平化为 JPEG，同时写入项目根目录、当前 Timeline 目录和 `Resources/cover`，并同步更新草稿状态、备份和封面编辑标记。封面“模板”也不是传统视频模板或本地特效包，而是在线图文编辑器下发的结构化页面模板；卡片缩略图只是预览，真正套用时会生成文字、图片槽位、形状和样式等可编辑图层。

可以把完整流程理解为：

```text
视频帧 / 本地图片 / URL
          ↓
    封面素材准备层
Resources/cover/<UUID>.jpg
          ↓
  独立封面编辑器（模板、文字、AI）
          ↓
      扁平化静态 JPEG
          ↓
┌──────────────────────────────────────────┐
│ Resources/cover/<new UUID>.jpg           │
│ draft_cover.jpg                          │
│ Timelines/<timeline-id>/draft_cover.jpg  │
└──────────────────────────────────────────┘
          ↓
  更新草稿体、备份、元数据和设置
```

## 1. 界面层到底在做什么

输入截图中的“封面设计”面板分成四块：

1. 左侧是“模板 / 文本”，模板按默认、推荐、生活、游戏、知识、时尚、影视、美食分类。
2. 中间是独立的竖屏画布，不是普通预览播放器。
3. 顶部提供字体、颜色、阴影、描边、背景、气泡、排列、对齐、粗体、下划线和斜体等平面设计控制。
4. 底部是视频候选帧条、导入按钮、撤销/重做和裁剪，右下角用“设为封面”提交。

设定完成后，主编辑器时间线最左侧会保留一块独立的小封面缩略图，后面才是正常的视频片段。这个位置关系也说明封面不是零时长视频片段或普通轨道素材，而是挂在草稿/Timeline 上的特殊对象。

## 2. 受控实验

### 2.1 实验条件

- 当前工程：`8月30日 (4)`
- 源视频：`planar-calibration-3s.mp4`
- 当前画布：竖屏 `720 x 1280`
- 封面编辑器使用默认设计，没有添加模板或额外文字
- 操作：进入封面设计，选择当前校准帧，点击“设为封面”

### 2.2 进入封面设计后

点击“设为封面”之前，剪映已先提取一张候选帧：

```text
Resources/cover/C7EB2305-1CBA-49D1-981C-4797CC34DBCB.jpg
```

属性：

| 项目 | 值 |
|---|---|
| 创建时间 | `2026-08-30 23:25:59` |
| 尺寸 | `720 x 1280` |
| 大小 | `109001` bytes |
| SHA-256 | `80c42ea3e85815ea9988ae4f9a9c4184e001501848060432fd68ef038f7801ae` |

此时项目根目录和当前 Timeline 目录都还没有这次实验生成的最终 `draft_cover.jpg`。

### 2.3 点击“设为封面”后

剪映生成了第二张封面资源：

```text
Resources/cover/7E9C299E-7BE6-4F6E-94D4-87B89A1A8E3F.jpg
```

同时生成两份最终封面：

```text
draft_cover.jpg
Timelines/B625D41C-63ED-452F-994C-53370CD62653/draft_cover.jpg
```

三份最终文件完全相同：

| 文件 | 尺寸 | 大小 | SHA-256 |
|---|---:|---:|---|
| `Resources/cover/7E9C...jpg` | `720 x 1280` | `108767` bytes | `52ecfa9b870e8cef3d6ca1f0120184b7e1d98be8a9e14e8fd9a0edbcc8779bb5` |
| 根目录 `draft_cover.jpg` | `720 x 1280` | `108767` bytes | 同上 |
| Timeline `draft_cover.jpg` | `720 x 1280` | `108767` bytes | 同上 |

原始候选帧和最终封面不是字节级复制。二者内容肉眼一致，但最终图经过了一次重新编码：

- PSNR：`47.059327 dB`
- SSIM：`0.998037`

这说明即使没有模板和文字，点击“设为封面”也会走一次封面渲染/保存流程，而不是简单地把候选帧原文件改名。

## 3. 草稿状态如何变化

### 3.1 当前草稿体是不可直接解析的

当前 11.3.0 草稿的 `draft_info.json` 和 `draft_meta_info.json` 都是单行 Base64 文本，解码后不是可识别的 JSON 或压缩包。此次研究没有尝试解密或绕过密钥机制。

因此，当前版本里模板、文字和封面选帧的完整可编辑状态无法从明文 JSON 直接读取。能确认的是，保存封面会让草稿体发生变化。

### 3.2 保存时发生了正常的草稿轮换

保存封面后：

| 文件组 | SHA-256 | 关系 |
|---|---|---|
| 当前 `draft_info.json` | `e282e78b...9c9f383` | 新草稿体 |
| 根目录和 Timeline 的 `template-2.tmp` | `e282e78b...9c9f383` | 与新草稿体完全一致 |
| 根目录和 Timeline 的 `draft_info.json.bak` | `3bcbaf9d...c9bcc12` | 保存前的草稿体 |

这不是只写一张图片。剪映同时更新了当前草稿状态，并把旧状态旋转到 `.bak`。

### 3.3 `draft_settings` 明确记录封面编辑

当前样本的 `draft_settings` 是可读的 INI：

```ini
[General]
ai_cover_agent_prompt_text=参考选中图片帧，生成爆款视频封面，比例是竖屏 3:4
is_use_cover_edit=true
```

这两个字段说明：

- 剪映明确区分“使用过封面编辑器”的草稿。
- AI 封面代理以选中的图片帧为参考，并保存自己的提示词状态。
- UI 的模板/文字封面与 AI 封面属于同一个封面业务域，但不等于所有封面都会调用 AI。

本次操作还改变了 `draft_meta_info.json` 和 `draft_settings` 的文件哈希。没有变化的明文侧车包括 `timeline_layout.json`、`draft_virtual_store.json`、`draft_biz_config.json`、`draft_agency_config.json` 和视频跟踪文件。

## 4. 应用二进制暴露出的内部能力

以下是静态字符串证据，不代表每个开关在当前账号和当前实验里都已启用。

### 4.1 基础封面接口

`libvideoeditor.dylib` 中能看到：

```text
draft_cover action must be set or clear
draft_cover set requires source=image/url/frame
frame_time_us
frame cover requires segment_id and non-negative frame_time_us
failed to copy cover image into draft resources
update static cover image path failed
draft_cover_handler.cpp
```

这确认基础模型至少支持：

- `set` 和 `clear` 两种操作。
- `image`、`url`、`frame` 三种来源。
- 从指定视频片段和 `frame_time_us` 取帧。
- 把图片复制到草稿资源目录。
- 更新草稿的静态封面路径，而不只是写根目录 JPEG。

### 4.2 Web 封面设计器和 AI 封面

`libVECreator.dylib` 中能看到：

```text
CoverEditorSubWebView
cover_editor_web_view
web_cover_editor_enable
https://www.jianying.com/editor-graphic
saveCoverPicture
saveCoverDraft
jsonPath
web_cover.json
ai_cover_agent
getFrameResult
getAsrResult
frames_uri
cover_uri
```

最稳妥的解释是：

- 剪映存在 Web 子视图实现的封面设计路径，并可连接 `editor-graphic` 页面。
- “保存封面图片”和“保存可编辑封面草稿”是两个不同动作。
- 模板编辑路径明确包含独立 JSON 载体 `web_cover.json` 和在线封面草稿保存；它是否还会把部分状态合并进当前加密草稿体，仍未确认。
- AI 封面路径不仅取视频帧，也能获取 ASR 字幕结果，用于标题/文案生成。

本次默认封面实验没有在项目目录发现 `web_cover.json`。这不能证明该文件从不使用，只能说明“不加模板和文字的默认保存”不需要在项目目录额外落一份可见的 `web_cover.json`。

## 5. 老版本明文草稿能看到哪些字段

对草稿根目录中仍可用 `jq` 解析的 JSON、备份和临时文件进行只读扫描，发现以下封面相关结构：

```text
static_cover_image_path
cover
retouch_cover
editing_draft.cover_extra_info
editing_draft.cover_extra_info.select_segment_id
editing_draft.cover_extra_info.select_segment_source_start
editing_draft.cover_extra_info.select_segment_target_start
editing_draft.cover_extra_info.slot_image_path
materials.drafts[].draft_cover_path
```

观察到的明文样本中：

- 草稿根级 `static_cover_image_path` 为空字符串，`cover` 和 `retouch_cover` 为 `null`。
- 复合草稿材料 `materials.drafts[].draft_cover_path` 非空，并指向 `draft_cover.jpg`。
- `editing_draft.cover_extra_info` 有完整的选段、源时间、目标时间和槽位图片字段，但已检查样本大多仍是默认空值。

因此可以确认剪映的数据模型早已为“从某个片段某个时间选封面”和“复合草稿自己的封面路径”预留了结构；但不能用这些旧明文字段反推 11.3.0 当前加密草稿的全部内部格式。

## 6. 全部本地项目的封面分布

草稿根目录当前有 53 个一级项目目录：

- 50 个项目根目录存在 `draft_cover.jpg`。
- 4 个项目存在 `Resources/cover` 目录。
- 这些目录里共有 5 张 UUID 命名的封面资源图。
- 一个名为 `QCut-JY-Lab-20260813-D001-Empty` 的空实验工程也有默认 `draft_cover.jpg`。

50 张项目根封面的尺寸分布：

| 数量 | 尺寸 |
|---:|---:|
| 21 | `1920 x 1080` |
| 8 | `1280 x 720` |
| 8 | `640 x 360` |
| 5 | `1080 x 1920` |
| 4 | `854 x 480` |
| 1 | `720 x 1280` |
| 1 | `1280 x 1280` |
| 1 | `1024 x 576` |
| 1 | `818 x 432` |

这说明 `draft_cover.jpg` 不是固定尺寸的小缩略图，而通常跟随项目画布/预览输出尺寸。项目列表需要显示小图时，应在读取端缩放，而不是把封面源文件固定生成成 320 x 180。

## 7. 哪些结论已经确认

### 运行时确认

- 进入封面设计时会把候选视频帧提取到 `Resources/cover/<UUID>.jpg`。
- 点击“设为封面”会产生新的最终封面资源。
- 最终资源会字节级复制到项目根和当前 Timeline 的 `draft_cover.jpg`。
- 最终封面是画布尺寸的扁平 JPEG。
- 保存封面会更新草稿体、备份、元数据和 `draft_settings`。
- 保存后的主时间线左侧出现独立封面缩略块。

### 静态代码证据确认

- 基础封面接口支持 `set/clear`。
- 封面来源支持 `image/url/frame`。
- 帧封面使用片段 ID 和微秒时间戳。
- 应用包含 Web 封面编辑器、独立保存图片/草稿、AI 封面和字幕输入路径。

### 高可信推断

- 项目根 `draft_cover.jpg` 主要服务于项目级封面/项目列表预览。
- Timeline 下的 `draft_cover.jpg` 服务于对应 Timeline 的封面和时间线入口。
- `Resources/cover` 保存封面编辑器使用的源图和最终资源；根目录与 Timeline 文件是消费端更稳定的镜像。

## 8. 还没有完全确认的部分

1. 静态代码已确认模板编辑路径使用 `web_cover.json`、`web_cover_origin_img.jpg` 和在线草稿接口，但本次模板套用没有完成，因此尚未取得一个成功落盘的模板封面样本来确认三者的实际内容和更新顺序。
2. 根封面、Timeline 封面和 `static_cover_image_path` 的准确更新顺序，以及项目列表读取时的优先级。
3. 点击“清除封面”后，是删除三个文件、恢复默认帧，还是只清空草稿路径。
4. Web 封面编辑器离线时能否完整打开已下载模板。
5. AI 封面实际会上传哪些帧和 ASR 文本，以及当前账号对应的服务端保留策略。

## 9. 对 QCut 复现的直接建议

如果 QCut 只要实现“基础封面”而不是完整模板市场，最小闭环应包括：

1. 支持从时间线帧、本地图片和 URL 设置封面，并支持清除。
2. 取帧时保存 `segment_id` 与 `frame_time_us`，避免只保存播放器当前像素。
3. 生成与项目画布一致的静态封面，不固定为缩略图尺寸。
4. 保留一个规范化资源文件，再维护项目级和 Timeline 级稳定镜像。
5. 草稿 schema 中单独保存 `staticCoverPath`、来源类型、来源片段和时间戳。
6. 封面提交必须进入正常草稿事务、备份和元数据更新流程。
7. 读取端缺图时按“Timeline 封面 → 项目封面 → 首帧/占位图”降级。

不要只在现有剪映 11.3.0 草稿里直接覆盖 `draft_cover.jpg`。实测保存还会改变加密草稿体、元数据、设置和备份，只替换 JPEG 可能造成封面图与草稿内部路径/状态不一致。

若要做完整剪映同等体验，还需要第二阶段研究模板/文字图层、Web 设计草稿、在线资源许可、AI 取帧/标题生成以及离线回放。

## 10. 证据边界

- 本研究只读取剪映本地项目和应用二进制字符串，并在自有校准工程中执行一次正常“设为封面”。
- 没有修改仓库源代码。
- 没有解密、替换或复制受保护的剪映草稿体。
- 没有把模板资源或专有素材复制进 QCut 仓库。
- 所有“运行时确认”“静态代码证据”“推断”和“未确认”已分开标记。

## 11. 封面模板到底是什么

### 11.1 核心结论

剪映封面模板可以拆成四个不同对象：

```text
在线模板目录对象
  ├─ 分类、名称、许可/付费状态、预览 URL
  └─ 模板详情 ID
          ↓
远程卡片预览图
  └─ 只供模板列表展示，不能证明模板已可编辑或可离线使用
          ↓
结构化图文页面模板
  ├─ 文本、图片槽位、SVG、线条、形状、页面属性
  ├─ 字体、颜色、描边、阴影、排列、占位文本
  └─ 可选的人物识别、抠图、自动配色和自动布局
          ↓
用户的封面设计实例
  ├─ web_cover_origin_img.jpg
  ├─ web_cover.json
  └─ 在线草稿/资源引用
          ↓
draft_cover.jpg（最终扁平输出）
```

因此，“模板列表里看得到卡片”“卡片缩略图已缓存”“模板详情已下载”“模板能成功套用”“模板能离线重开”是五种不同状态，不能互相替代。

### 11.2 它走的是在线图文编辑器，不是 `ressdk` 特效包

当前设置文件明确启用了新路径：

```json
{
  "ai_cover_agent_ab_config": {
    "cover_frame_construction_enable": true,
    "web_cover_editor_enable": true
  },
  "cover_template_new_path": {
    "enabled": true
  }
}
```

证据来自：

```text
/Users/peter/Movies/JianyingPro/User Data/MMKV/settings_json
```

CEF 主页面缓存还保留了本次封面编辑器的真实入口。去掉无关参数后，形式如下：

```text
https://www.jianying.com/editor-graphic
  ?clientVersion=11.3.0
  &editorType=pc
  &width=720
  &height=1280
  &videoDraftId=<当前草稿 ID>
  &enter_from=cover_edit
  &current_page=picture_edit
  &from_page=timeline
  &preload=true
```

对应缓存文件为：

```text
/Users/peter/Movies/JianyingPro/User Data/CEF/Cache/Cache/Cache_Data/a8158a319a5bbcc6_0
```

这证明原生剪映会把画布宽高、视频草稿 ID、语言、入口来源和页面模式传给 `jianying.com` 的图文编辑器。`commonSetting.ini` 还持久化了 `web_cover_login_id`；二进制桥接代码也有登录态和 token 传递能力。本文不记录或复用这些身份值。

本机另有：

```text
/Users/peter/Movies/JianyingPro/User Data/Cache/template
```

该目录中的 `template.json`、ZIP 和附件属于剪映常规视频模板缓存。当前封面模板的列表、预览和图文编辑路径出现在 CEF/IndexedDB 中，没有证据表明它们使用这个常规视频模板目录，也没有表现为一个 `effect`/`artistEffect` 包。

### 11.3 模板卡片如何出现

本次打开“封面设计”后，CEF 缓存新增了 35 个来自 `faceu-img-sign.byteimg.com` 的签名图片请求，图片统一请求约 500 像素宽的 WebP 预览版本。抽取其中一个 HTTP 缓存响应体后确认：

- 文件是有效 WebP，不是 JSON 或模板包。
- 实际尺寸为 `500 x 667`，即接近竖屏 `3:4`。
- 图片中的中文标题、背景和装饰已经整体栅格化。
- 界面会把竖版预览裁进左侧横向模板卡片。

这说明列表卡片首先加载的是远程扁平预览图。卡片上直接看见文字，不等于相应字体和文字图层已经下载。

CEF IndexedDB 中还能看到以下数据库/存储键：

```text
lvweb-editor-graphic-loader-cache-0411
db-version033
resource-request
recent-use
defaultWord
recommend
list
cursor
hasMore
photoList
```

它们与加载器缓存、资源请求、最近使用、推荐列表和分页目录相吻合；但本次没有解码其中的完整序列化值。

### 11.4 在线目录和模板详情接口

CEF V8 代码缓存暴露了封面所用图文编辑器的通用模板服务。核心能力包括：

```text
GetCategories
GetTemplatesAccordCategory
GetRecentList
ReportRecently
GetTemplateDetail
GetTemplateHotWords
SearchTemplates
GetAllTemplateRatio
GetTemplateScenes
GetPresets
GetPresetDetail
```

可见的服务路径包括：

```text
/lv/v1/cc_web/plane/get_collections
/lv/v1/cc_web/plane/get_collection_templates
/lv/v1/editor/template/recent_list
/lv/v1/editor/use_report
/lv/v1/pic/marketing/template/detail
/lv/v1/cc_web/replicate/search_templates
/lv/v1/cc_web/plane/get_collection_presets
/lv/v1/cc_web/plane/preset_template_detail
```

模板对象还携带 `templateName`、分类 ID/名称、原始分类、预览 URL、是否需要购买和允许的购买类型。由此可以确认，左侧“默认、推荐、生活、游戏、知识、时尚、影视、美食”不是扫描本地目录得到的静态文件夹，而是在线目录经过客户端页面呈现后的分类视图。

### 11.5 点击模板后发生什么

图文编辑器代码不是把卡片 JPEG 盖到画布上，而是通过 `applyTemplate` 事务把结构化模板应用到页面。可见的图层处理器包括：

```text
Page
Text
Image / ImageContainer
SVG
Line
Shape
```

套用逻辑还包含：

- `namedPlaceHolder`、`textPlaceholder` 和可替换图片槽位。
- 富文本、字体、颜色、描边、阴影和对齐等文字样式。
- `applyAutoColorDraft` 和 `applyAutoLayoutDraft`。
- 页面尺寸不匹配时创建新页面的分支。
- 套用完成后移除仍未替换的占位元素。
- `TEMPLATE_LAYER_1/2/3_UPLOAD` 与人物识别路径。
- `COVER_IMAGE_CUTOUT_UPLOAD/APPLY/LOAD` 抠图路径。

所以一个模板本质上是“可参数化的平面设计页面”：背景图可能替换为当前视频帧，标题可能替换为用户文字，人物图层可能先识别或抠图，其他图层按模板的布局和样式重新构造。

### 11.6 原生剪映与 Web 编辑器如何分工

`libVECreator.dylib` 中的 `CoverEditorSubWebView` 暴露了原生与网页之间的桥接动作：

```text
getFileByPath
getFileByMd5
getSelectCoverPath
getAssetFolderPath
coverAssetsGet / coverAssetsDel
downloadOnlineFile
filecodeSaveTolocalfile
notifyCoverImage
notifyWebDraftChanged
```

据此可确认职责大致是：

1. 原生端向网页提供当前选中封面帧和封面资源目录。
2. Web 端获取模板详情并执行图层编辑。
3. 远程资源需要时由桥接层下载并复制进本地 `Resources/cover`。
4. Web 端通知原生端设计草稿已经变化。
5. 提交时原生端保存在线封面草稿，并把最终图像写回剪映工程。

保存路径相关的静态字符串包括：

```text
web_cover_origin_img.jpg
web_cover.json
draft_cover.jpg
SAVE_TEMPLATE_TO_COVER
FinishWebEditor
saveCoverDraft
saveCoverPicture
```

其中 `web_cover_origin_img.jpg` 对应设计源图，`web_cover.json` 对应可继续编辑的图层/页面文档，`draft_cover.jpg` 对应最终扁平结果。`saveCoverDraft` 还会接收 `cover_path`、`jsonPath` 和 `isCoverAiImageDesign`，然后进入 `CoverClient::saveOnlineCover`。

这是静态代码能够确认的文件职责；由于本次没有成功套用一个模板，尚不能把某个实际 `web_cover.json` 的字段结构标记为运行时确认。

### 11.7 本次模板套用实验

在受控工程 `8月30日 (4)` 中执行了以下操作：

1. 重新进入“封面设计”。
2. 选中“推荐”区第一张模板卡片。
3. 等待模板下载/套用超过 30 秒。
4. 对整个工程内所有文件重新计算内容哈希。

观察结果：

- 模板卡片进入持续加载状态。
- 右侧画布没有变成该模板设计。
- 工程文件内容哈希没有任何变化。
- 没有生成 `web_cover.json` 或 `web_cover_origin_img.jpg`。
- 原先的 `draft_cover.jpg` 和 `Resources/cover` 图片保持不变。

因此本次只能确认“目录和预览图已加载”，不能声称该模板已经下载、套用或可离线使用。持续加载可能来自网络、账号、许可、接口状态或页面运行错误；当前证据不足以把原因归到其中任何一种。

### 11.8 对 QCut 模板系统的建议

如果 QCut 要做自己的封面模板，不应把剪映卡片缩略图当成模板文件，也不应复制剪映专有模板。建议把数据模型明确拆成：

1. `TemplateDefinition`：画布比例、图层树、图片槽位、文本占位、样式、资源引用、许可和预览。
2. `CoverDesign`：用户套用模板后产生的可编辑实例，保存替换后的图片、文字和布局。
3. `CoverRender`：从设计实例确定性渲染出的全尺寸静态封面。
4. `CoverBinding`：项目/Timeline 与当前设计、最终封面、来源帧之间的绑定。

模板“可离线使用”至少要同时满足：

- 模板定义已经缓存。
- 所有图片、字体和其他引用资源已经缓存且许可允许。
- 本地渲染器支持模板使用的全部图层能力。
- 设计实例可以在没有目录服务时重新打开。
- 最终渲染结果可由同一份设计文档稳定重建。

实现顺序可先支持文本、图片槽位、形状、层级和对齐，再逐步加入自动配色、自动布局、人物识别和抠图。在线模板目录、许可/付费状态、设计文档和最终 JPEG 应保持分层，避免“有缩略图但不可套用”被错误标记为 `offlineReady`。
