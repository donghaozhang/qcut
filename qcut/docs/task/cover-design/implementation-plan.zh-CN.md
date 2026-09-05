# QCut 封面与封面模板实现方案

- 日期：2026-08-31
- 目标代码库：`/Users/peter/Desktop/code/qcut/qcut`
- 参考研究：`/Users/peter/Desktop/剪映封面机制研究.md`
- 文档状态：可拆分实施

## 一句话方案

在 QCut 中建立独立于时间线的 `CoverDesign` 领域：从时间线正式渲染器或本地图片取得背景，使用专用图层文档完成文字、图片和形状编辑，再确定性渲染为项目画布尺寸的主封面；模板只负责创建可编辑的设计实例，项目卡片只读取已发布的扁平预览。

不要把封面伪装成零时长时间线元素，也不要把 tldraw 快照、远程模板缩略图或 DOM 截图直接当作最终封面数据。

```text
时间线合成帧 / 本地图片 / 已有媒体
                  ↓
        项目内持久化封面资产
                  ↓
       CoverDesign 可编辑图层文档
        ├─ image
        ├─ text
        └─ shape
                  ↓
      QCut 确定性 Canvas 渲染器
                  ↓
        全尺寸 PNG + 卡片 WebP
                  ↓
      TProject.cover 发布绑定
```

## 1. 产品边界

### 1.1 第一版必须完成

1. 从当前播放头的完整合成画面设置封面。
2. 从本地图片设置封面。
3. 清除封面并恢复项目卡片的旧降级逻辑。
4. 提供独立封面编辑器，支持图片、纯文本和基础形状图层。
5. 支持移动、缩放、旋转、层级、隐藏、锁定、撤销和重做。
6. 保存可继续编辑的设计文档。
7. 发布与项目画布同尺寸的主封面，以及项目卡片专用预览图。
8. 重启、切换工程、复制工程后仍能正确读取。
9. 提供本地 QCut 封面模板，支持图片和文本占位槽。
10. 提供命令行读、设、渲染、清除和模板套用能力。

### 1.2 第一版不做

- 不接入剪映模板目录，不复制剪映预览图或专有模板。
- 不依赖在线模板服务。
- 不做富文本片段级混排。
- 不做 SVG/HTML 任意脚本内容。
- 不做 AI 标题、AI 抠图或自动布局。
- 不自动把封面写入当前加密剪映 11.3 草稿。
- 不把封面加入视频导出帧序列。

### 1.3 后续能力

- 人物识别与抠图。
- 模板自动配色和自动重排。
- 多人协作及在线模板目录。
- AI 背景、标题和封面建议。
- 平台专用裁切区，例如视频为 `9:16`、展示封面为 `3:4`。

## 2. 当前 QCut 已有的基础

### 2.1 项目类型已有缩略图字段，但不是正式封面

`packages/editor-core/src/types/project.ts` 的 `TProject` 当前有：

```ts
thumbnail: string;
canvasSize: CanvasSize;
scenes: Scene[];
currentSceneId: string;
```

但 `thumbnail` 只是字符串。`apps/web/src/lib/storage/storage-service.ts` 只避免持久化 `blob:` URL，没有封面来源、尺寸、哈希、设计文档或版本信息。

### 2.2 项目卡片当前使用“第一个媒体缩略图”

当前链路是：

```text
use-project-thumbnail-loader.ts
  → timeline-store-persistence.ts#getProjectThumbnail
  → storage-service.ts#findProjectThumbnail
  → 时间线最早媒体 / 最近导入媒体的 thumbnailUrl
```

它不是用户设置的项目封面。缓存也只按 `projectId` 建键，封面更新后不能自然失效。

`project-card.tsx` 与 `project-list-row.tsx` 还重复实现了缩略图加载和展示。新增封面时应抽成共享 `ProjectThumbnail`，不要把相同优先级和错误处理再写两遍。

### 2.3 已有正式的单帧合成渲染

`apps/web/src/lib/export/export-still-frame.ts` 已经能够：

- 使用当前播放头时间。
- 按项目 `canvasSize` 创建画布。
- 调用 `export-engine-renderer.ts#renderFrame`。
- 渲染视频、图片、文字、字幕、贴纸、调色和特效。
- 避免把参考线、标尺等编辑辅助层写入输出。
- 执行受限素材导出检查。

这应成为“从时间线取封面”的底座。应抽出返回内存 `Blob` 的中立函数，而不是让封面模块模拟点击“导出当前帧”或截取预览 DOM。

### 2.4 已有可复用的模板概念

`packages/editor-core/src/templates/timeline-template.ts` 已经有：

- schema 和 schema version。
- 模板语义版本。
- 宽高比变体。
- 图片和文字槽位。
- 字体依赖与 fallback。
- 模板验证和版本迁移。
- 稳定的 `templateBinding`。

这些概念应该复用，但不能直接把 `TimelineTemplatePlacement` 用作封面图层，因为它强制包含 `startTime` 和 `duration`。

### 2.5 已有设计交互引擎

项目已依赖 `tldraw@4.4.0`，并在 `apps/web/src/components/editor/draw/tldraw-canvas.tsx` 中实现了：

- 固定画布边界。
- 背景图片锁定。
- 选择、移动、缩放和编辑历史。
- JSON 快照。
- 栅格图导出。

tldraw 适合做封面编辑器的交互层，但其快照不能成为 QCut 的长期领域格式。QCut 必须持有自己的 `CoverDesignV1`，并通过适配器与 tldraw 同步。

### 2.6 已有真实项目目录

`electron/lib/project-structure.ts` 将工程目录规范为：

```text
~/Documents/QCut/Projects/<projectId>/
```

`project.json` 会自动同步到这里，但当前代码明确把它视为信息快照，而不是编辑器加载的唯一事实源。因此：

- `TProject.cover` 与封面仓库是事实源。
- `project.json.cover` 只是面向 Agent/CLI 的镜像。
- 不能只改 `project.json` 来设置封面。

## 3. 核心架构决策

| 问题 | 决策 |
|---|---|
| 封面是不是时间线元素 | 不是，属于项目级独立领域 |
| 编辑器状态是不是最终格式 | 不是，tldraw 只做交互适配 |
| 封面背景是不是引用实时播放头 | 不是，选择时立即物化为项目资产 |
| 最终图片如何生成 | 调用确定性的 Canvas 渲染器 |
| 主封面格式 | 全分辨率 PNG |
| 项目卡片格式 | 独立 640 x 360 WebP，避免无意裁掉竖版封面 |
| 模板如何套用 | 深复制成项目内设计实例，保留来源和槽位绑定 |
| 模板更新 | 显式迁移，绝不静默改变已发布封面 |
| 在线资源 | 必须先下载、校验、哈希并落入项目，渲染时不热链 |
| 发布事务 | 不可变文件先写完，项目绑定最后提交 |

## 4. 领域模型

建议在 `packages/editor-core/src/cover/` 建立平台无关模型。

### 4.1 项目绑定

```ts
export interface ProjectCoverBindingV1 {
  schemaVersion: 1;
  designId: string;
  designRevision: number;
  designPath: string;
  render: CoverAssetRefV1;
  thumbnail: CoverAssetRefV1;
  source: CoverSourceV1;
  canvas: { width: number; height: number };
  updatedAt: string;
}
```

在 `TProject` 增加：

```ts
cover?: ProjectCoverBindingV1;
```

第一版只做项目级封面。`source.sceneId` 记录封面来自哪个 Scene，但不在每个 Scene 上复制一份封面字段。未来若确实需要 Scene 封面，再增加 `Scene.cover`，不要提前制造双重事实源。

### 4.2 资产引用

```ts
export interface CoverAssetRefV1 {
  assetId: string;
  relativePath: string;
  sha256: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  byteLength: number;
}
```

项目 JSON 只保存相对工程目录的路径，不保存绝对路径、`blob:` URL 或 data URL。

### 4.3 来源记录

```ts
export type CoverSourceV1 =
  | {
      kind: "timeline-frame";
      sceneId: string;
      timeSeconds: number;
      frame: number;
      fps: number;
      capturedAsset: CoverAssetRefV1;
    }
  | {
      kind: "local-image";
      originalName: string;
      capturedAsset: CoverAssetRefV1;
    }
  | {
      kind: "project-media";
      mediaId: string;
      capturedAsset: CoverAssetRefV1;
    }
  | {
      kind: "generated-image";
      mediaId: string;
      provider?: string;
      capturedAsset: CoverAssetRefV1;
    };
```

即使来源是现有 MediaItem，也要把图片字节复制或按内容哈希写入封面对象库。否则用户从媒体库删除素材后，已发布封面会损坏。

播放头时间应先按项目 FPS 量化：

```text
frame = round(timeSeconds × fps)
timeSeconds = frame / fps
```

### 4.4 设计文档

```ts
export interface CoverDesignV1 {
  schema: "qcut.cover-design";
  schemaVersion: 1;
  id: string;
  revision: number;
  canvas: {
    width: number;
    height: number;
    backgroundColor: string;
  };
  source: CoverSourceV1;
  layers: CoverLayerV1[];
  templateOrigin?: {
    templateId: string;
    templateVersion: string;
    variantId: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

坐标统一使用画布像素，原点在左上角。不要在持久化层混用百分比、DOM 像素和当前时间线以中心为原点的坐标。

### 4.5 图层

```ts
interface CoverLayerBaseV1 {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: "normal" | "multiply" | "screen" | "overlay";
  zIndex: number;
  transform: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    flipX: boolean;
    flipY: boolean;
  };
  slotId?: string;
}

export interface CoverImageLayerV1 extends CoverLayerBaseV1 {
  kind: "image";
  asset: CoverAssetRefV1;
  fit: "cover" | "contain" | "fill";
  crop: { top: number; right: number; bottom: number; left: number };
  cornerRadius: number;
}

export interface CoverTextLayerV1 extends CoverLayerBaseV1 {
  kind: "text";
  content: string;
  fontFamily: string;
  fontAssetId?: string;
  fontSize: number;
  color: string;
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline" | "line-through";
  letterSpacing: number;
  lineHeight: number;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundRadius: number;
  backgroundPadding: number;
}

export interface CoverShapeLayerV1 extends CoverLayerBaseV1 {
  kind: "shape";
  shape: "rectangle" | "ellipse" | "line";
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export type CoverLayerV1 =
  | CoverImageLayerV1
  | CoverTextLayerV1
  | CoverShapeLayerV1;
```

第一版不加 `group`、任意 SVG 和富文本。等三个基本图层稳定后再扩 schema。

## 5. 存储布局

在 `electron/lib/project-structure.ts` 的统一结构中增加：

```text
~/Documents/QCut/Projects/<projectId>/cover/
├── objects/sha256/ab/<full-hash>.png
├── designs/<designId>/1.json
├── designs/<designId>/2.json
├── renders/<designId>/1.png
├── renders/<designId>/2.png
├── previews/<designId>/1.webp
├── previews/<designId>/2.webp
└── .staging/<transactionId>/
```

### 5.1 为什么使用不可变版本文件

若直接覆盖 `design.json` 和 `cover.png`，应用崩溃时可能出现设计已经更新但图片仍是旧版，或项目元数据已经指向半写文件。

推荐发布顺序：

1. 在 `.staging/<transactionId>` 写入设计、主渲染和预览。
2. 解码图片，验证尺寸、MIME、字节数和 SHA-256。
3. 原子移动到最终不可变版本路径。
4. 更新 `TProject.cover`，让它指向新 revision。
5. 触发 `project.json` 镜像更新。
6. 后台清理没有任何项目绑定引用的旧 staging 和旧 revision。

项目元数据最后提交，因此最坏情况是产生可安全回收的孤立文件，不会出现项目绑定指向不存在文件。

### 5.2 Electron 与 Web

建立 `CoverRepository` 接口：

- Electron 实现写入真实项目目录。
- 浏览器实现写入 OPFS。
- `TProject.cover` 的结构保持一致。
- Renderer 不直接接触任意绝对路径。

不要沿用 `DrawingStorage` 把大图片和 tldraw 快照塞进通用 JSON 键值存储。

### 5.3 项目复制与删除

当前 `duplicateProject` 主要复制项目元数据。封面功能上线时必须定义：

- 复制工程：把当前设计 revision、引用资产、主渲染和预览复制进新工程目录，并重写相对路径；不能让新工程引用旧工程目录。
- 删除工程：删除项目元数据后，清理该工程 `cover/` 目录；失败应记录为可重试清理任务。
- 清除封面：先移除 `TProject.cover`，再异步回收无引用文件，不能先删文件再改绑定。

## 6. 渲染链路

### 6.1 从时间线捕获背景

从 `exportStillFrame()` 抽出：

```ts
export async function renderCompositedFrameToBlob({
  project,
  sceneId,
  timeSeconds,
  tracks,
  mediaItems,
  format,
}: RenderCompositedFrameOptions): Promise<Blob>;
```

调用时必须快照化 `project/tracks/mediaItems`，避免渲染过程中用户又移动了元素。

该函数继续使用：

- `expandCompoundMediaTracks`。
- `assertRestrictedMediaExportAllowed`。
- `export-engine-renderer#renderFrame`。
- 项目背景、FPS 和正式画布尺寸。

UI 的“导出当前帧”和封面捕获都调用它，从根上避免两套帧渲染逻辑。

### 6.2 渲染封面设计

新增纯渲染入口：

```ts
export async function renderCoverDesign({
  design,
  resolveAsset,
  output,
}: RenderCoverDesignOptions): Promise<Blob>;
```

顺序固定：

1. 创建与 `design.canvas` 一致的画布。
2. 填充不透明背景色。
3. 按 `zIndex` 和稳定 `id` 排序。
4. 解码并渲染图片图层。
5. 渲染形状图层。
6. 等待字体后渲染文字图层。
7. 编码主 PNG。
8. 从同一渲染结果生成卡片 WebP。

### 6.3 复用现有渲染代码

- 文字：通过适配器复用 `apps/web/src/lib/text/text-canvas-renderer.ts#renderTextToCanvas`，不要另写一套中文换行、字距、描边和阴影。
- 图片：把 `fit/crop/transform` 的底层绘制能力从 `export-engine-renderer.ts` 提取到共享 Canvas primitive，封面和时间线共同调用。
- 字体：复用 `local-font-runtime.ts` 与 `canvas-font.ts` 的 CJK fallback。
- 颜色与混合模式：复用现有 Canvas 映射函数。

封面渲染器不能依赖 Zustand、React、DOM 选择器或当前选中状态。输入必须完整，输出必须可重复。

### 6.4 字体规则

1. 渲染前等待 `document.fonts.ready`。
2. 模板声明 required 字体时，缺失必须阻止发布。
3. 可选字体只能使用模板明确声明的 fallback。
4. 中文模板必须执行实际字形覆盖检查，不能只检查字体名称存在。
5. 预览与最终渲染使用同一字体解析器。

### 6.5 卡片预览

项目卡片当前固定为 `aspect-video`。竖版封面若直接 `object-cover` 会被严重裁切。

第一版应生成 `640 x 360` 的独立 WebP：

- 原封面按 contain 居中。
- 空白区使用项目背景色或深灰色。
- 不改变主封面。
- 后续可增加用户指定焦点裁切。

## 7. 封面模板

### 7.1 模板不是预览图

模板包由 manifest、可编辑图层、占位槽、资源、字体依赖和实际渲染预览组成。模板卡片 WebP 只是派生资产。

### 7.2 Schema

```ts
export interface CoverTemplateV1 {
  schema: "qcut.cover-template";
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  license: {
    id: string;
    redistribution: "allowed" | "restricted";
    commercialUse: "allowed" | "restricted";
  };
  defaultVariantId: string;
  fonts: TemplateFontDependency[];
  assets: CoverAssetRefV1[];
  slots: CoverTemplateSlotV1[];
  variants: CoverTemplateVariantV1[];
  preview: CoverAssetRefV1;
}
```

槽位类型：

```ts
export type CoverTemplateSlotV1 =
  | {
      id: string;
      kind: "text";
      label: string;
      required: boolean;
      defaultValue: string;
    }
  | {
      id: string;
      kind: "image";
      label: string;
      required: boolean;
      defaultAssetId?: string;
    };
```

每个 variant 包含明确画布尺寸和静态图层。封面可以复用时间线模板已有的语义版本、字体依赖和迁移思想，但图层变体必须独立。

标准比例建议共享为中立常量：

```text
16:9, 9:16, 1:1, 4:5, 3:4
```

自定义项目尺寸仍由 `canvas.width/height` 表示，不强迫伪装成某个标准比例。

### 7.3 套用算法

1. 验证 schema、语义版本、文件数量、解压大小和每个资产哈希。
2. 按项目画布选择精确 variant。
3. 没有精确 variant 时第一版禁用套用，不静默拉伸。
4. 验证 required 槽位和字体。
5. 将模板资源复制进项目内容寻址对象库。
6. 深复制模板图层并生成新的项目图层 ID。
7. 替换图片和文字槽位。
8. 记录 `templateOrigin` 与每层 `slotId`。
9. 生成一次预览渲染。
10. 将整个套用动作记录为一个撤销步骤。

套用后设计属于项目，不依赖全局模板继续存在。用户可以任意改图层；升级模板必须由用户主动触发迁移。

### 7.4 模板包格式

建议文件扩展名：`.qcut-cover-template`，内部为 ZIP：

```text
cover-template.json
preview.webp
assets/<sha256>.<ext>
```

导入时必须防止：

- ZIP path traversal。
- 符号链接逃逸。
- 超大解压比。
- 超出文件数量和总字节上限。
- MIME 扩展名伪装。
- manifest 哈希不匹配。
- SVG 脚本、外链和 `foreignObject`。

第一版可完全不支持 SVG，从而缩小安全面。

### 7.5 `offlineReady`

只有同时满足以下条件才能显示离线可用：

```text
manifest 有效
AND 所有资产哈希命中
AND 所有 required 字体可加载且覆盖所需字形
AND 当前渲染器支持全部图层 capability
AND 许可允许当前用途
AND 默认槽位能够完成一次真实渲染
```

有卡片缩略图绝不等于 `offlineReady`。

## 8. 编辑器体验

### 8.1 入口

在预览工具栏增加封面图标按钮，并在时间线左侧显示当前封面小块。两处都打开同一个 `CoverEditorDialog`。

### 8.2 布局

使用接近全窗口的工作区：

```text
┌──────────────┬──────────────────────────┬──────────────┐
│ 模板 / 素材  │                          │ 图层 / 属性  │
│              │       封面画布           │              │
│              │                          │              │
├──────────────┴──────────────────────────┴──────────────┤
│ 时间线候选帧 / 当前帧 / 导入图片 / 撤销重做 / 设为封面 │
└────────────────────────────────────────────────────────┘
```

- 左侧使用 Tab 区分模板、素材和文本。
- 中间是受画布边界约束的 tldraw 交互面。
- 右侧用图层列表和属性面板，不把属性卡片再套进卡片。
- 底部使用 `filmstrip-extractor.ts` 生成候选帧，选择结果仍按精确帧号捕获正式合成帧。

### 8.3 状态规则

- 进入编辑器只创建或加载设计草稿，不改变已发布封面。
- 应用模板只改变设计草稿。
- 自动保存设计草稿使用带 `projectId` 守卫的 debounce，防止切换工程后串写。
- “设为封面”才执行正式渲染和发布事务。
- “取消”保持已发布封面不变；已自动保存的草稿可以下次继续。
- “清除封面”只清除发布绑定，不把时间线第一帧伪装成已设置封面。

### 8.4 tldraw 使用边界

推荐用 tldraw 提供：

- 选择框和 transform handles。
- 平移、缩放和画布约束。
- 对齐吸附。
- 键盘删除、复制、粘贴。
- 会话内撤销/重做。

QCut 需要提供：

- `CoverDesign ↔ tldraw records` 双向适配器。
- 仅允许 image/text/rectangle/ellipse/line。
- 资产 URL 由受控 resolver 提供。
- 每次事务后更新 `CoverDesign`。
- 发布时忽略 tldraw 自带导出，调用 QCut 封面渲染器。

不要把原始 tldraw store snapshot 写入 `TProject.cover`。可以把它作为同 schema revision 下的可丢弃编辑缓存，但不能成为唯一可恢复格式。

## 9. Store 与事务

新增 `useCoverStore`，只管理当前编辑会话：

```ts
interface CoverStore {
  projectId: string | null;
  design: CoverDesignV1 | null;
  published: ProjectCoverBindingV1 | null;
  selectedLayerIds: string[];
  status: "idle" | "loading" | "editing" | "saving" | "rendering" | "error";
  dirty: boolean;
  history: CoverDesignV1[];
  redoStack: CoverDesignV1[];
}
```

规则：

- 一个拖拽手势只产生一个历史记录。
- 套用模板是一个历史记录。
- 选择图层和缩放视图不进入设计历史。
- 历史只在当前设计会话内；持久 revision 由每次 autosave/发布产生。
- 所有异步完成回调都检查捕获的 `projectId/designId/revision`。

## 10. 项目卡片集成

创建共享 `ProjectThumbnail` 组件和 `project-thumbnail-service.ts`。

读取优先级：

```text
1. project.cover.thumbnail
2. 旧项目 durable project.thumbnail
3. 时间线最早媒体的 persisted thumbnail
4. 最近可视媒体
5. 占位图
```

缓存键：

```text
<projectId>:<cover-thumbnail-sha256-or-fallback-version>
```

这样发布新封面后会自然失效，不需要全局清空缓存。

`ProjectCard` 和 `ProjectListRow` 只负责尺寸布局，共享实际加载、错误状态、替代文本和 URL 回收逻辑。

## 11. Electron 与平台 API

在 `@qcut/platform-core` 增加可选 `cover` 能力：

```ts
interface CoverPlatformAPI {
  loadDesign(options: LoadCoverDesignOptions): Promise<CoverDesignV1 | null>;
  importAsset(options: ImportCoverAssetOptions): Promise<CoverAssetRefV1>;
  commitRevision(options: CommitCoverRevisionOptions): Promise<CommittedCoverRevision>;
  resolveAssetUrl(options: ResolveCoverAssetOptions): Promise<string>;
  removePublishedCover(options: RemovePublishedCoverOptions): Promise<void>;
  collectGarbage(options: CollectCoverGarbageOptions): Promise<CoverGarbageResult>;
}
```

Electron main 进程负责：

- 路径清理和 project root 限制。
- `.staging` 与原子 rename。
- MIME sniff、尺寸、字节和 SHA-256 验证。
- 内容寻址去重。
- 文件读取 URL 授权。
- 垃圾回收。

`electron/local-media-protocol.ts` 已允许 `Documents/QCut/Projects`，但 MIME 表当前主要是视频和音频。封面上线时应加入 PNG、JPEG 和 WebP，继续通过 realpath 检查阻止符号链接逃逸。

## 12. CLI 与 Editor API

建议新增：

```text
editor:cover:get
editor:cover:set-frame
editor:cover:set-image
editor:cover:render
editor:cover:clear
editor:cover:template:list
editor:cover:template:apply
editor:cover:design:export
editor:cover:design:apply
```

示例：

```bash
qcut-pipeline editor:cover:set-frame \
  --project-id <id> \
  --scene-id <scene-id> \
  --time 3.2 \
  --verify \
  --json

qcut-pipeline editor:cover:template:apply \
  --project-id <id> \
  --template-id clean-headline \
  --slots @cover-slots.json \
  --publish \
  --verify \
  --json

qcut-pipeline editor:cover:clear \
  --project-id <id> \
  --verify \
  --json
```

所有写命令默认：

- `--atomic=true`
- `--verify=true`
- 返回设计 revision、主图/预览哈希、尺寸和相对路径。
- read-back 不一致时返回失败，不能只报告 IPC 已接收。

`project.json` 增加只读镜像：

```json
{
  "cover": {
    "designId": "cover-...",
    "designRevision": 3,
    "renderPath": "cover/renders/cover-.../3.png",
    "renderSha256": "...",
    "thumbnailPath": "cover/previews/cover-.../3.webp",
    "sourceKind": "timeline-frame",
    "sceneId": "...",
    "frame": 96
  }
}
```

## 13. 异常与边界处理

### 13.1 画布尺寸变化

项目画布改变后不要静默拉伸封面。保留旧封面用于项目卡片，同时把设计标记为需要 reflow；再次进入封面编辑器时要求选择：

- 保持并居中。
- 按 cover 重新裁切。
- 选择模板对应 variant。
- 重新从时间线取帧。

发布前主封面尺寸必须与当前项目画布一致。

### 13.2 来源媒体变化

封面已经物化为项目资产，所以时间线变化或媒体删除不应改变已发布封面。设计来源信息只用于溯源和“重新捕获”，不是实时依赖。

### 13.3 丢失资产

- 编辑器显示明确的缺失图层占位，不用空白假装成功。
- 发布失败并列出缺失 asset ID。
- 项目卡片若主封面预览损坏，降级到旧媒体缩略图并记录诊断。
- 不自动把损坏绑定覆盖掉，便于修复。

### 13.4 并发与切换工程

异步模板加载、字体加载、帧捕获和 autosave 都必须携带：

```text
projectId + designId + expectedRevision
```

完成时不匹配就丢弃结果，不能写到新打开的工程。

### 13.5 透明度

项目封面最终必须不透明。若设计存在透明区域，使用 `design.canvas.backgroundColor` 合成。透明 PNG 可作为手动导出选项，但不能作为项目卡片默认封面。

## 14. 安全、许可与隐私

1. 不导入或再分发剪映模板资源；只参考行为和架构。
2. 模板 manifest 必须带许可元数据。
3. 远程 URL 不能在渲染阶段直接加载，必须先经过主进程下载与验证。
4. 下载器阻止 loopback、内网、文件协议和超时重定向。
5. 限制单文件、总包、图片像素和解压后大小，防止 image/ZIP bomb。
6. 所有项目路径都经过 `getProjectRoot` 和 realpath 验证。
7. 第一版拒绝 SVG；后续支持时必须 sanitize。
8. AI 封面需要用户明确触发并说明会上传哪些帧和字幕，不在打开封面编辑器时自动上传。
9. 受限素材策略覆盖封面捕获和封面发布，因为它们同样是导出派生物。

## 15. 测试矩阵

### 15.1 editor-core 单元测试

- 所有合法图层通过验证。
- 非有限坐标、负尺寸、重复 ID、无效 zIndex 被拒绝。
- asset hash、MIME 和尺寸不一致被拒绝。
- required 槽位和字体缺失被拒绝。
- 模板变体精确匹配。
- 不支持比例时不静默缩放。
- 模板应用稳定生成图层和 slot binding。
- v1 迁移保持视觉字段。

### 15.2 Renderer 单元测试

- zIndex 与稳定 ID 决定绘制顺序。
- cover/contain/fill 和 crop 像素正确。
- 旋转、翻转、透明度和混合模式正确。
- 中文换行、字距、描边、阴影与时间线文字渲染一致。
- 缺字形时按规则失败或 fallback。
- 相同输入重复渲染得到相同像素哈希。
- 主图尺寸严格等于项目画布。
- 卡片 WebP 为 640 x 360 且完整包含竖版封面。

### 15.3 存储与事务测试

- path traversal 和 symlink escape 被拒绝。
- staging 失败不改变现有发布绑定。
- 主图写完但项目保存失败只留下可回收孤立 revision。
- 项目保存成功后 read-back 路径、哈希和尺寸一致。
- 清除封面先清绑定再回收文件。
- 复制工程后删除原工程，副本封面仍可读。
- 删除工程后封面目录可重试清理。
- 跨工程 autosave 不串写。

### 15.4 Store 与 UI 测试

- 一个拖拽手势只有一个 undo step。
- 套用模板可以一次撤销。
- 取消不改变已发布封面。
- autosave 草稿可以恢复。
- 发布后项目卡片缓存立即换 key。
- 清除后恢复旧缩略图优先级。
- 竖版、横版、方形和 `4:5` 文本不溢出。
- 键盘、焦点、按钮名称和颜色对比符合无障碍要求。

### 15.5 Desktop E2E

至少使用四个真实画布：

```text
1920 x 1080
1080 x 1920
1080 x 1080
1080 x 1350
```

每个 E2E 必须验证：

1. 导入确定性测试视频。
2. 精确 seek 到已知颜色/编号帧。
3. 设置封面。
4. 验证主图和预览文件存在。
5. 用图片解码器验证尺寸。
6. 用像素/哈希验证确实是目标帧，不只看 UI toast。
7. 添加中文文字和形状后重新发布。
8. 关闭并重开工程。
9. 验证设计仍可编辑且项目卡片显示新预览。
10. 清除并验证降级。

还需单独执行：

- 模板包断网套用。
- 缺字体失败。
- 人为中断 commit 的 crash-recovery 测试。
- CLI 设置、read-back、清除闭环。
- 视频导出结果不包含封面额外帧。

## 16. 建议文件拆分

```text
packages/editor-core/src/cover/
├── model.ts
├── validation.ts
├── template.ts
├── template-application.ts
├── migration.ts
└── index.ts

apps/web/src/lib/cover/
├── cover-repository.ts
├── cover-renderer.ts
├── cover-frame-capture.ts
├── cover-thumbnail.ts
├── cover-tldraw-adapter.ts
└── project-cover-resolver.ts

apps/web/src/stores/
└── cover-store.ts

apps/web/src/components/editor/cover/
├── cover-editor-dialog.tsx
├── cover-canvas.tsx
├── cover-source-strip.tsx
├── cover-template-browser.tsx
├── cover-layer-list.tsx
├── cover-properties.tsx
└── cover-toolbar.tsx

electron/
├── cover-handler.ts
├── cover-repository.ts
└── preload-types/api-types/cover-api.ts
```

每个文件保持单一职责。不要做一个同时处理 schema、磁盘 I/O、React UI 和渲染的 `cover-utils.ts`。

## 17. 建议实施顺序

### PR 1：领域模型和验证

- `CoverDesignV1`、`ProjectCoverBindingV1`、模板 schema。
- Zod/手写验证和迁移入口。
- editor-core 单元测试。

完成条件：可以对独立 JSON 做严格 parse/validate/round-trip。

### PR 2：封面仓库和平台 API

- 项目目录。
- 内容寻址资产。
- staging、原子 commit、读取和清理。
- Electron/OPFS adapter。
- 安全测试。

完成条件：无 UI 也能保存、重载和验证一个设计 revision。

### PR 3：正式帧捕获重构

- 从 `exportStillFrame` 抽出 `renderCompositedFrameToBlob`。
- 保留现有导出行为。
- 增加精确 frame 和受限素材测试。

完成条件：现有“导出当前帧”测试继续通过，封面可直接获得 Blob。

### PR 4：封面确定性渲染器

- image/text/shape。
- 复用文字和媒体 Canvas primitive。
- 主 PNG 与卡片 WebP。
- 像素和字体测试。

完成条件：相同 fixture 稳定产生相同结果，四种画布尺寸正确。

### PR 5：项目绑定和卡片读取

- `TProject.cover` 持久化。
- 共享 `ProjectThumbnail`。
- 新优先级和缓存失效。
- 复制、删除、清除生命周期。

完成条件：重启后项目卡片读取已发布封面；清除后正常降级。

### PR 6：基础封面编辑器

- tldraw 适配。
- 素材、文本、形状、图层和属性。
- 候选帧条。
- undo/redo、autosave 和发布。

完成条件：本地 UI 端到端完成捕获、编辑、发布、重开。

### PR 7：本地模板系统

- 内置模板。
- 模板包导入导出。
- 槽位替换、variant、字体和 `offlineReady`。
- 无网络 E2E。

完成条件：模板预览来自真实渲染，断网后仍可套用并重开。

### PR 8：CLI 和 Agent 接口

- cover commands。
- 原子写与 read-back verify。
- `project.json.cover` 镜像。
- CLI E2E。

完成条件：CLI 能独立完成 set/get/render/clear/template apply 闭环。

### PR 9：AI 与在线目录

只有前八步稳定后再做。在线目录必须建立签名、许可、缓存和隐私机制，不能把远程缩略图可见误报成模板可用。

## 18. MVP 验收标准

满足以下所有条件才算“封面功能完成”：

- 用户明确设置的封面与普通媒体缩略图区分。
- 主封面与项目画布同尺寸。
- 项目卡片使用独立预览且不破坏竖版构图。
- 发布后重启仍能读取。
- 设计文档可继续编辑。
- 时间线变化不会偷偷改变已发布封面。
- 清除后绑定和 UI 都恢复到未设置状态。
- 模板应用产生真实图层，不是把卡片图盖到画布上。
- 模板断网可用必须经过真实资源、字体和渲染验证。
- UI、CLI 与磁盘 read-back 指向同一 revision 和哈希。
- 封面不出现在视频开头，也不改变视频总时长。
- 没有使用或再分发剪映专有模板资源。

## 19. 最重要的三个先手

1. 先从 `exportStillFrame()` 抽出返回 Blob 的正式合成帧函数。
2. 先建立 `CoverDesignV1 + CoverRepository`，再做 UI。
3. 先让项目卡片读取显式 `project.cover.thumbnail`，再接模板市场。

做到这三点后，基础封面、模板、AI 生成和未来的剪映导出适配都能建立在同一个可信数据链路上。
