# 剪映专业版多人检测、选择与 Track ID 研究

> 日期：2026-08-25  
> 对象：剪映专业版 macOS（`com.lemon.lvpro` / `VideoFusion-macOS`），不是 CapCut  
> 本轮范围：人脸检测、多人框选、`face.id`、`freid.trackid`、会话生命周期，以及 QCut 当前差距

## 结论

剪映不是把人脸检测器返回的 `face.id` 直接当人物身份。

它的真实链路是：

1. `face_0` 检测人脸并产生基础 `face.id`、框、角度和关键点。
2. `freid_0` 把 `face.id` 映射为当前跟踪会话的 `trackid`。
3. 隐藏的“人脸框”效果包输出最多 5 个可选人物，输出中的 `id` 是 `freid.trackid`。
4. 用户点击人脸框后，美颜、脸型和五官效果把这个 `trackid` 放进向量参数。
5. 效果包用精确 `trackid` 命中逐脸参数；`id=-1` 是“全部人脸”的回退参数。

最重要的边界是：

- `face.id` 是检测器内部编号，会在人物离场再回来时变化。
- `freid.trackid` 能在同一个连续跟踪会话中跨帧、短暂离场和正常移动保持稳定。
- `freid.trackid` 不是永久人物 ID。新建 manager 后，不同人物都可能重新得到 `0`。
- 硬切或单帧瞬间交换人物位置时，`freid` 可能沿用空间轨迹而绑定错人物。

因此，项目数据不能只持久化一个裸 `trackId`。QCut 需要把项目级人物身份与原生会话 ID 分开。

## 三种 ID

| 名称 | 作用域 | 本轮证据 | 能否直接持久化为项目人物 |
| --- | --- | --- | --- |
| `face.id` | 当前 face 检测状态 | 离场再进入后从 `1` 变为 `2`，另一人从 `0` 变为 `3` | 不能 |
| `freid.trackid` | 当前 Swing / AlgorithmService 跟踪会话 | 连续移动和短暂离场可保持；冷启动重置；硬跳变可串人 | 不能单独使用 |
| `personBindingId` | QCut 项目与素材范围 | 已加入项目数据，并以检测帧框和帧号作为重绑定锚点 | 可以 |

QCut 现已分别返回 `faceId` 和 `freidTrackId`；兼容字段 `trackId` 明确等于当前宿主的 `freidTrackId`，不再把 `FaceBuffer.id` 冒充跟踪 ID。

## 剪映检测图

真实脸型包的 `algorithmConfig.json` 包含：

- `face_0`
  - `face_max_num = 10`
  - `face_base_model_key = tt_fsnew_base_jianying`
- `freid_0`
  - `freid_buffer_immediate_mode = 1`
- 图连接
  - 输入纹理进入 `face_0`
  - 输入纹理进入 `freid_0`
  - `face_0` 的结果进入 `freid_0`

本机私有快照中的模型包括：

- `tt_fsnew_base_jianying`
- `tt_face_extra`
- `tt_freid`
- `tt_faceverify`

本轮真正跑起来的是 `face + freid`。存在 `tt_faceverify` 文件不等于剪映这条 UI 链路一定用它做跨会话人物识别，本轮没有这项动态证据。

## 剪映如何产出人脸框

本机资源库中找到剪映隐藏资源“人脸框”：

- resource id：`7406173874112531752`
- md5：`1a54ce6e30e262b72b46dfa257a5948e`
- effect type：`auto_beauty`
- `hide_in_pc = true`
- `hide_in_mobile = true`
- requirements：`face`、`freid`、`blit`、`faceDetect`

它不是用户看到的普通素材卡，而是播放器内部用于多人选择的辅助效果段。

`AmazingFeature/lua/face_info.lua` 的行为已直接确认：

1. 最多读取 10 张人脸。
2. 用 `baseInfo.ID == freidInfo.faceid` 建立映射。
3. 把 `freidInfo.trackid` 写入输出字段 `id`。
4. 按脸框面积从大到小排序。
5. 只输出前 5 张可操作人脸。
6. 输出 `id`、算法 `index`、`bbox`、`yaw/pitch/roll`。
7. `bbox` 不只是原始检测框，还用 106 点数据和 FACE145 网格扩展边界。
8. 超过 5 张时写出 `face_count_exceed_max=true`。

这也解释了剪映 UI 为什么可以检测 10 张，但只允许前 5 张真正应用逐脸效果。

## 剪映如何选择人物

`libVECreator.dylib` 中可直接看到以下播放器和 UI 链路：

- `UpdateVideoFaceRecognition`
- `OnSegmentClicked multi_faces_effect`
- `QueryFaceInfo`
- `IsEnableedFaceId`
- `UnEnableedFaceCount`
- `enableVideoEffectFaceRecognition`
- `queryFaceSegmentInfo`
- `getEffectFaceBoundingBoxInfosWithCb`
- `VideoClient::enableVideoFaceRecognition`
- `VideoClient::getVideoFaceBoundingBoxInfos`
- `VideoBeautySettingViewModel`
- `faceModeList`
- `faceModeTypeIndex`
- `SetFaceModeTypeIndex(selectedIndex)`

内嵌 QML 还确认：

- 美颜面板从 `viewModel.faceModeList` 读取人脸模式。
- 选择变化调用 `SetFaceModeTypeIndex`。
- 多素材选择时禁用逐脸模式并显示全局模式。

结合隐藏人脸框包，可以确认剪映的产品链路是：播放器启用内部人脸识别段，查询 `face_info`，画出可点击框，把选中框的 `freid.trackid` 交给美颜材料。

具体到脸型包，Lua 的参数语义是：

- 每一项参数是 `{id, intensity}` 向量。
- 精确匹配当前 `freid.trackid` 时，使用该人物的强度。
- 没有精确匹配时，使用 `id=-1` 的全局强度。
- 同时最多对面积最大的 5 张脸执行效果。

## 动态实验

### 实验环境

- Effect Core UUID：`D6342ECD-5432-33F0-A2AD-0C28F5699994`
- EffectSDK：`21.9.0`
- QCut 私有 Frameworks、Models 和效果包
- 同一个 OpenGL/CGL context、同一线程、同一个 Swing manager
- 真实双人图，1024 x 512 RGBA
- 仓库外证据目录：
  - `~/Library/Application Support/QCut/Research/JianyingFilter/multi-person-track-id-2026-08-25/`

探针只在仓库外的效果包副本中增加日志，没有修改剪映安装缓存或 QCut 私有快照。

### 连续会话：离场再进入

| 画面 | 女性 | 男性 | 结论 |
| --- | --- | --- | --- |
| 初始两人 | `face.id=0`, `trackid=0` | `face.id=1`, `trackid=1` | 新会话两种 ID 暂时相同 |
| 只保留女性 | `0 / 0` | 不在画面 | 女性保持 |
| 男性回来 | `0 / 0` | `2 / 1` | 基础 ID 改了，freid 保持 |
| 只保留男性 | 不在画面 | `2 / 1` | 男性保持 |
| 女性回来 | `3 / 0` | `2 / 1` | 基础 ID 再次变化，freid 保持 |

这证明效果参数必须使用 `freid.trackid`，不能使用 `face.id`。

### 平滑交叉移动

构造 21 帧序列：

- 男性从右下逐帧移动到左下。
- 女性从左上逐帧移动到右上。
- 两条水平轨迹交叉，但垂直位置不同，人物始终可见。

结果：21/21 帧渲染成功。

- 男性：`trackid=0`，x 从约 `0.72` 连续移动到 `0.12`。
- 女性：`trackid=1`，x 从约 `0.14` 连续移动到 `0.75`。

正常连续运动下，`freid` 跟随人物而不是固定屏幕位置。

### 单帧硬交换

把原图左右两半直接互换，人物在相邻帧瞬间交换位置。

结果：

- 原来左侧女性的 `trackid=0` 留在左侧，实际绑定到了男性。
- 原来右侧男性的 `trackid=1` 留在右侧，实际绑定到了女性。

因此 `freid` 是时序跟踪 ID，不是无条件的人脸身份识别。硬切、跳帧或不连续取帧时必须重置或重新绑定。

### 冷启动

每次创建全新的 manager：

- 只输入男性：`face.id=0`, `trackid=0`
- 只输入女性：`face.id=0`, `trackid=0`

所以 `trackid=0` 只表示“这个会话发现的第一个轨迹”，不表示某个固定人物。

## 剪映的持久化边界

本机剪映 draft schema 中存在：

```json
{
  "beauty_face_auto_retouch_info": {
    "beauty_face_auto_retouch_id": "",
    "face_id": []
  }
}
```

这证明草稿格式为自动美颜预留了人脸 ID 数组，但本机现有草稿中没有找到非空实例。因此本轮不能证明：

- 剪映是否把 `freid.trackid` 原样长期写入草稿。
- 项目重开后是否重跑识别并重写 ID。
- 遮挡数秒、跨镜头、变速、倒放和复合片段时如何恢复同一人物。
- 预览和导出是否共享同一个跟踪缓存。

这些仍属于未知，而不是已经复刻。

## QCut 实现更新（2026-08-25）

### 已完成

1. 原生探针读取 `FreidBuffer` 中的 `faceid` 与 `trackid`。节点名查询失败时使用算法类型 `131` 获取 `freid_0`，再按 `faceId -> freidTrackId` 连接基础检测结果。
2. 检测接口分别返回 `faceId`、`freidTrackId`、兼容 `trackId`、框、角度、tracking count 和 landmark count。
3. 项目数据新增 `personBindingId` 与 `bindingAnchor = {rect, frameNumber}`。逐脸美颜和美妆绑定项目人物，不再把冷启动的 `0/1` 当永久身份。
4. 同帧重新识别采用有最大成本和歧义阈值的全局几何分配。低置信度或候选相近时返回 unmatched，不猜最近的人。
5. 检测与渲染都携带 `sourceKey + frameNumber`。同一源同一帧允许浏览器缩放产生的 RGBA 微差；换源、换帧仍拒绝旧检测映射。没有帧号的旧调用继续要求像素 hash 完全一致。
6. 每个效果包保留自己的原生 tracker，并按项目人物 ID 把参数重写为该宿主的 `freidTrackId`。新加入的包可以从当前同源宿主转移人物映射。
7. tracker 按预览源隔离为最多 4 组的 LRU 会话池，隐藏预载画面不再销毁正在编辑素材的连续会话；倒退或大跨度 seek 只重置对应源。
8. UI 框的 React key、点击选择和保存均使用 `personBindingId`。无真实检测结果时不再提供 0 到 9 的虚拟人物。
9. 美体明确是整帧作用，不把美体参数伪装成逐脸数据。CLI patch 和项目归一化会保留项目人物 ID 与锚点。
10. 人物映射按 Stage 的真实逐脸参数收窄。脸型和逐脸美妆会映射各自的 `freidTrackId`；整帧美体以及标量磨皮、美白、清晰不再错误地向不发布 `freid` 的效果包索要轨迹。

### 当前运行链

```text
原始预览帧
  -> face_0 + freid_0
  -> faceId / freidTrackId / rect
  -> 同帧置信度重绑定
  -> personBindingId（项目）
  -> 每个效果包局部 freidTrackId
  -> 参数向量 id 重写
  -> 原生渲染
```

这里有三层明确分离：当前帧 observation、原生宿主轨迹、项目人物。`人脸 1` 仍只是当前帧面积排序标签，但真正选择状态由不可见的 `personBindingId` 决定。

### 真实产品 E2E

素材：真实双人静态图，480 x 240 产品预览，完整 Electron UI 与真实本机二进制。

流程：

1. 导入并放入时间线。
2. 开启原版美颜美体并真实识别两张脸。
3. 选择左侧人物，只给该人物添加柔和粉口红和瘦脸 90。
4. 同一帧再次识别，确认原项目人物从 `bindingStatus=new` 变为 `matched`。
5. 添加整帧瘦腰，再通过真实 `qcut editor:element:patch` 添加长腿，并把所选左脸的瘦脸从 90 改为 20。
6. 等待 CLI 触发的真实原生重渲染，确认无 fallback toast；随后回读项目状态，确认 CLI 未丢失 `personBindingId`、锚点和逐脸美妆。

量化结果：

- 左侧选中人物：口红相对基线改变 1406 个像素，RGB 绝对差总和 47181。
- 右侧未选人物：改变 0 个像素，RGB 绝对差总和 0。
- 第二次识别：选中人物保持同一个 `personBindingId`，状态为 `matched`。
- CLI：项目人物 ID 与锚点保持，逐脸瘦脸为 20，全局瘦腰为 70、长腿为 55；画面完成原生重渲染且没有降级提示。
- E2E：1 passed，21.1 秒。

证据：

- `output/playwright/jianying-portrait-adjustment/multiface-ui-cli-evidence.json`
- `output/playwright/jianying-portrait-adjustment/07-multiface-detected-selected.png`
- `output/playwright/jianying-portrait-adjustment/08-one-face-makeup-and-shape.png`
- `output/playwright/jianying-portrait-adjustment/08b-person-binding-rematched.png`
- `output/playwright/jianying-portrait-adjustment/10-cli-patch-reflected-in-ui.png`

仓库外原生素材与探针证据仍位于：

- `~/Library/Application Support/QCut/Research/JianyingFilter/multi-person-track-id-2026-08-25/`

### 仍未完成

- 没有接入 face embedding / `tt_faceverify`，因此不跨镜头自动宣称“还是同一个人”。换帧后的冷重绑定会失败关闭并要求重新选择。
- 尚未用真实双人连续运动视频完成 UI 逐帧、遮挡、离场再进入和人物交叉 E2E。
- 尚未完成逐脸视频导出与预览逐帧一致性门禁；本轮 CLI 证明的是项目数据往返，不是逐脸视频导出证明。
- 项目保存重开后，同一人物在新检测帧的自动恢复尚未真实 E2E。
- UI 仍显示按面积排序的“人脸 1/2”，尚未提供用户命名的“人物 A/B”。
- 剪映自身是否在部分场景启用 `tt_faceverify`、以及草稿如何恢复人物，仍无动态证据。

## 验收矩阵

实现完成前至少需要以下真实 E2E：

| 场景 | 状态 | 当前证据或下一门禁 |
| --- | --- | --- |
| 静态双人 | 已通过 | 选中侧 1406 像素变化，未选侧 0 |
| 同帧重识别 | 已通过 | 同一 `personBindingId` 从 new 变为 matched |
| 多效果包叠加 | 已通过 | 逐脸口红与瘦脸命中同一项目人物 |
| CLI 数据往返与重渲染 | 已通过 | CLI patch 后人物 ID、锚点和美妆保留；逐脸脸型与整帧美体新值完成原生重渲染，无降级提示 |
| 两人平滑交叉 | 原生探针通过，产品 E2E 未做 | 需要真实视频 UI 逐帧证明 |
| 短暂遮挡再出现 | 原生探针通过，产品 E2E 未做 | 需要真实视频与输出帧证明 |
| 人物先后进出 | 未做产品 E2E | 新轨迹不得继承旧人物设置 |
| 单帧硬切换位 | 已知 freid 可串人 | 当前策略应重置并要求重新选择 |
| seek 回退和大跨度跳转 | 单元门禁通过 | 仍需真实视频产品 E2E |
| 项目保存并重开 | 未做 | 新会话重识别不可串人 |
| 逐脸视频导出 | 未做 | 顺序逐帧结果须与预览选择一致 |
| 六张以上人脸 | 协议已确认 | 仍需 UI 提示 E2E |

## 本轮证据与限制

已验证：

- `face.id -> freid.trackid` 的真实包内映射。
- 隐藏人脸框包的最多 10 张检测、最多 5 张输出协议。
- 逐脸向量的精确 ID 与 `-1` 全局回退语义。
- 两人离场再进入时基础 ID 变化而 freid 保持。
- 21 帧平滑交叉时 freid 跟随人物。
- 硬交换时 freid 可能串人。
- 冷启动后不同人物都从 `trackid=0` 开始。
- QCut 已能读取真实 `faceId/freidTrackId`、保存项目人物 ID，并在同帧重识别时安全匹配。
- 真实 Electron 双人 UI、逐脸多效果包与 CLI 数据往返已通过。

尚未验证：

- 剪映 UI 的完整 draft 保存/重开绑定流程。
- 真实长视频中的长时间遮挡和再次出现。
- 预览与导出是否共享同一 face recognition session。
- 剪映是否在某些场景额外使用 `tt_faceverify` 做跨会话匹配。
- QCut 真实多人运动视频、项目重开和逐脸视频导出。

探针构建注意：当前 `research/jianying-runtime-probe/run-probe.sh` 的编译列表遗漏 `filter-face-inspect.mm`，本轮使用包含该源文件的临时 `/tmp/qcut-jianying-track-probe`。这不影响上述运行时结果，但正式复现脚本仍需单独修正。
