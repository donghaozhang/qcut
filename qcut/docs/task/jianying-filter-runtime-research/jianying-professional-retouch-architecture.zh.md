# 中文剪映专业版美颜美体：UI、效果包与模型链路

记录时间：2026-08-25

## 结论先行

中文剪映专业版的美颜美体不是一组普通颜色滤镜，也不是 UI 滑杆直接调用某一个模型。
它是四层组合：

1. QML 属性面板和 ViewModel 管理页签、人脸模式、预设、滑杆与手动画笔；
2. `ressdk_db` 资源目录把 UI 卡片映射到效果资源、模型清单和算法节点要求；
3. 每个效果包用 `config.json`、`algorithmConfig.json` 和 Scene/Lua 定义参数协议与算法图；
4. Swing/AlgorithmService 在运行时共享 GL 上下文中执行人脸、皮肤、五官、GAN 或骨骼算法，再把结果写回纹理。

美颜依赖人脸检测、关键点、跨帧人脸 ID、皮肤分割、脸部对齐等不同模型；美妆还需要
face fitting；美体主要使用人体骨骼模型。手动美颜画笔和手动美体是另外的交互式链路，
不能用自动美颜/美体滑杆代替。

## 研究边界

本轮只研究中国版剪映专业版：

| 项目 | 当前值 |
| --- | --- |
| 应用 | `/Applications/VideoFusion-macOS.app` |
| Bundle ID | `com.lemon.lvpro` |
| 显示名称 | 剪映专业版 |
| 应用版本 | `11.2.13043` |
| 构建版本 | `11.3.0-beta6` |

没有读取或运行 CapCut 应用。中文资源文件中个别共享文案仍含 `CapCut` 字样，不能据此把
两个产品当成同一个验证对象。本文件的应用身份、缓存目录、UI 观察和二进制证据均来自
`com.lemon.lvpro`。

本文件不提交剪映二进制、模型、效果包、Lua、Shader、纹理、缓存数据库或原始日志，
只记录资源身份、参数语义、摘要和验证结果。

## 剪映 UI 是怎样组织的

### 可见层级

当前中文本地化资源和实际界面共同确认以下层级：

```text
画面
  -> 美颜美体
       -> 美颜
            -> 皮肤管理
            -> 脸型
            -> 五官精修
            -> 美妆
            -> 手动精修
       -> 美体
            -> 智能美体 / 参数调节
            -> 手动美体
       -> 美颜预设
       -> 美体预设
```

人脸侧另有“单人脸模式 / 多人脸模式”，以及“当前画面未识别到人脸”“请先选择 1 个人像”等
状态。美体侧有“当前画面未识别到人体”。预设支持保存、重命名、删除和数量上限。

手动精修不是普通滑杆：本地化和二进制中同时存在画笔、橡皮擦、大小、强度、只允许在人脸框
内涂抹、重置和撤销/重做相关入口。手动美体也有拉长区域、瘦身瘦腿和放大缩小三种交互工具。

### UI 宿主

`libVECreator.dylib` 的本地符号和嵌入式 QML 字符串确认了主要宿主对象：

| 对象/枚举 | 职责 |
| --- | --- |
| `VideoBeautySettingViewModel` | 美颜美体主属性面板 |
| `BeautyPanelGroup` | 面板分组 |
| `KVideoFaceBeauty` | 美颜页 |
| `KVideoBodyBeauty` | 美体页 |
| `KVideoFaceBeautyPreset` | 美颜预设页 |
| `KVideoBodyBeautyPreset` | 美体预设页 |
| `VideoManualBeautyViewModel` | 手动美颜状态与工具 |
| `ManualBeautyBodyControlViewModel` | 手动美体控件 |
| `ManualBeautyBrush` / `BeautyGraffitiBrush` | 人脸框内画笔与擦除交互 |
| `FaceBeautyPresetExecutor` | 将组合预设展开到片段和人脸模式 |

UI 还发布 `lv.event.retouch.panel.action`、`lv.event.retouch.layer.action` 和
`lv.event.retouch.selectedLayer.update` 等事件，并把状态持久化为人像效果、手动美颜和预设相关
材料。手动画笔通过 `updateManualBeautyBrush`、`writeManualBeautyAlgCache`、
`resetManualBeautyEffect` 等独立请求更新算法缓存，因此它不是自动磨皮滑杆的另一种外观。

## 资源目录怎样驱动 UI

当前剪映缓存：

```text
~/Movies/JianyingPro/User Data/Cache/ressdk_db/*/rp.db
```

`http_cache` 中的中文剪映面板
`CC525E83E67B68B6F5A5A0BA0BC57D73` 在 2026-08-11 缓存了五类资源：

| category key | 中文名称 | 资源数 | 当前资源标题 |
| --- | --- | ---: | --- |
| `beauty` | 智能美颜 | 6 | 磨皮、美白、白牙、瘦脸、大眼、瘦鼻 |
| `body` | 智能美体 | 4 | 瘦身、长腿、瘦腰、小头 |
| `manual_body` | 手动美体 | 3 | 拉长、瘦身瘦腿、放大缩小 |
| `manual_beauty` | 手动美颜 | 3 | 手动瘦脸、手动磨皮、祛斑祛痘 |
| `face` | 智能美型 | 2 | 瘦鼻、大眼 |

另外三类资源端点负责更完整的皮肤项和组合预设：

| category key | 作用 |
| --- | --- |
| `skin_management` | 磨皮、美白、肤色、匀肤、丰盈、祛斑祛痘、眼部细节等 |
| `auto-beauty2` | 与皮肤管理共享的自动美颜卡和人脸框资源 |
| `one_click_beauty` | 韩系清透、蜜桃初妆等组合预设 |

资源行不是最终算法本体。它提供 UI 标题、资源 ID、下载信息、`model_names`、
`requirements`、`intensity_key` 和业务元数据；运行时随后定位对应效果包。部分 UI 卡片 ID 与
右侧参数面板使用的聚合包 ID不同，例如自动磨皮卡和 `_from_beauty_pannel` 磨皮包是两个资源身份。
因此不能仅凭卡片 ID 猜实际加载目录。

## 从滑杆到输出纹理

目前最强证据支持以下调用层级：

```text
剪映 QML 属性面板
  -> VideoBeautySettingViewModel / VideoManualBeautyViewModel
  -> 当前片段、face_mode、选中人物或预设材料
  -> 资源目录定位效果包
  -> model clip / FeatureSegment 参数
  -> TESwingProcessUnit
  -> TESwingEffectManagerV2
  -> SwingManager + AlgorithmService
  -> 效果包 algorithmConfig 算法图
  -> Scene/Lua 接收 SetEffectIntensity
  -> 原地写回输入 frame 的第一张运行时纹理
```

自动美颜有两种主要参数协议：

1. 标量包使用归一化强度，例如 `{"intensity": 1}`；
2. 脸型、五官、GAN 和多数美妆包使用按键向量，例如
   `face_adjust_xxx: [{id, intensity}]`。

UI 的 `0..100` 通常归一化到运行时 `0..1`；允许负方向的项目按包内范围映射。
`freid` 提供跨帧 `trackid`，向量中的 `id` 用来区分人物。组合预设不是一张最终 LUT，
而是把一个预设强度继续乘到多个子资源的相对强度上。例如既有“韩系清透 80”对“大眼”
的相对上限为 `0.15`，最终运行时强度是 `0.8 * 0.15 = 0.12`，剪映 UI 显示为 `12`。

## 实际调用了哪些模型

以下是当前剪映效果包 `config.json`、`algorithmConfig.json` 与本机物理模型文件共同确认的
模型角色。逻辑名由效果包声明，AlgorithmService 再解析到具体版本文件。

| 能力 | 逻辑模型 | 当前物理模型示例 | 用途 |
| --- | --- | --- | --- |
| 基础人脸 | `tt_fsnew_base_jianying` | `v2.0` | 人脸框、基础关键点和通用脸部输入 |
| 人脸细节 | `tt_face` / `tt_face_extra` | `v11.2` / `v15.0` | 更细关键点、眼口鼻和属性能力 |
| 人物跟踪 | `tt_freid` | `v2.0` | 跨帧人物 ID 与多人参数绑定 |
| 皮肤分割 | `tt_skin_seg` | `v5.1` | 皮肤区域权重、背景与眼唇保护 |
| 美妆拟合 | `tt_facefitting1256` | `v2.0` | 美妆贴合与高密度脸部几何 |
| 身体骨骼 | `tt_skeletonsquat` | `v10.0` | 身体关键点和人体形变 |
| 匀肤/丰盈 GAN | `jypc_yunfuhua_gpucpu` | `v1.0` | 对齐后的人脸皮肤 GAN |
| 祛斑祛痘 GAN | `newbandou` + `newbandou_remove_script` | `v1.0` | 瑕疵检测、修复与脚本后处理 |

### 效果包算法图

| 能力包 | 主要算法节点 | 关键事实 |
| --- | --- | --- |
| 磨皮 | `face + skin_seg + blit` | 皮肤 mask 驱动，不是全画面模糊 |
| 美白 | `face + skin_seg + texture_blit` | 保护非皮肤区；默认强度必须被宿主显式覆盖 |
| 清晰 | `face + blit` | 使用 `tt_fsnew_base_jianying`，近似线性强度但有轻微状态漂移 |
| 眼部细节 | `face + freid + blit` | 亮眼、眼袋、法令纹共用包，最多跟踪 10 张脸 |
| 肤色 | `face + skin_seg + blit` | 同时支持肤色强度和冷暖方向 |
| 脸型 | `face + freid + blit` | 18 个基础脸型/五官键 |
| 五官精修 | `face + freid + blit` | 37 个眼、鼻、嘴、眉和脸型补充键 |
| 美妆 | `face + face_fitting + freid + blit` | 人脸检测上限 10，face fitting 输出上限 5 |
| 匀肤/丰盈 | `face align + face + freid + script + blit` | 两个强度键共用同一个 GAN 包 |
| 祛斑祛痘 | `face select + face align + face + freid + script + blit` | 模型较重，异步就绪需要宿主持续泵帧 |
| 美体 | `face + skeleton + blit` | 真正形变由 `tt_skeletonsquat` 驱动 |

## 美颜与美体的语义差异

### 美颜是逐脸的

脸型和五官包声明最多跟踪 10 张脸；美妆 face fitting 上限是 5。参数向量携带
`trackid`，所以 UI 可以选择单人脸或多人脸并给不同人物设置不同值。每个效果包有自己的 tracker，
宿主需要把不同包的 ID 对齐，不能假设所有包都从 0 开始并永久一致。

### 自动美体是整帧的

聚合美体包的算法图使用 `tt_skeletonsquat`。包内 Lua 当前真正映射 10 个键：小头、天鹅颈、
瘦手臂、直角肩、宽肩、瘦身、瘦腰、长腿、胸型和美胯。它只读取参数向量的第一项强度，
不读取人脸 `id`，因此这一包无法逐人物定向。

`config.json` 的 composer 参数里还能看到 `SlimLeg`，原生枚举也存在该类型，但当前包的 Lua
映射没有接收这个键；传入独立瘦腿键会被忽略。剪映 UI 中的“瘦身瘦腿”属于另一条手动美体工具，
不能把它当成自动美体包已经公开的独立瘦腿滑杆。

### 手动精修是第三条路径

手动磨皮/祛痘通过画笔在脸框内记录区域并写入手动美颜算法缓存；手动美体记录拉长区域或局部
形变操作。它们有自己的材料、撤销/重做和重置协议，不经过普通 `face_adjust_*` / `body_adjust_*`
滑杆就能完整表达。

手动磨皮和祛痘的效果包协议已经进一步实测：`brush_mode=0/1` 分别对应画笔/擦除，大小使用 UI 的
`1..100`、强度使用 `0..100`，触摸坐标使用左上角原点的 `0..1` 归一化坐标。begin、每个 move 和 end 都必须
通过 FeatureSegment 参数分别下发并各处理一帧；把所有事件压进同一帧会得到空 mask。效果包写出
256 x 256 PNG，宿主再用 `smooth_mask_list` 或原包拼写 `acne_removeal_mask_list` 写入
`retouch_config.json`。首帧前设置 `draft_path` 和 `load_manual_retouch_cache=true` 可恢复缓存。完整协议、
QCut 接入和像素证据见
[manual-retouch-private-runtime-e2e.zh.md](manual-retouch-private-runtime-e2e.zh.md)。

## 运行时必须满足的条件

1. 算法、效果加载、纹理创建、渲染和读回必须位于运行时发布的共享 GL 上下文和同一线程；
   自建不共享的 `NSOpenGLContext` 会让人脸算法得到 0 张脸。
2. 输入输出纹理尺寸必须一致；当前 V2 路径把同一个 frame 作为输入和输出并原地写回第一张纹理。
3. 祛斑祛痘等较重模型是异步加载的。`set_effect` 成功不等于模型已发布结果，固定睡眠或只泵两帧
   都可能偶发得到原图。
4. 经理和 AlgorithmService 会保留内容历史。素材切换或时间回跳时需要按剪映生命周期重置，
   否则皮肤 mask 和 tracker 可能继承上一素材状态。
5. UI、预览和导出必须使用一致的色彩、方向、时间戳和 source boundary；二进制调用成功本身不等于
   与剪映导出逐像素一致。

## 现有真人素材已经证明什么

既有本机研究已使用真人静帧、五人全身画面和短视频验证：

- 人脸链路可返回 1 张脸、106 个关键点，并驱动“大眼”真实几何输出；
- 美白差异局限在人脸皮肤区，背景与眼唇受保护；
- 匀肤、丰盈和祛斑祛痘会产生与各自语义一致的 GAN 差分；
- 五人全身画面上，长腿、瘦身和小头均产生非零原生输出；
- 远景脸部检测可以为 0，但骨骼美体仍能生效，证明美体不依赖人脸 tracker；
- 中文剪映 UI 的单项输出与本机二进制方向一致，但多数单项尚未完成无损逐像素平价。

仓库外已有证据目录包括：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  face-keypoint-parity/korean-clear-2026-08-22/
  beauty-gap-cards-2026-08-24/
```

这些目录是本机研究证据，不是可分发产品资产。

## 已证实、推断与未知

### 已证实

- 应用身份是中文剪映专业版 `com.lemon.lvpro`；
- UI 四大页、单/多人脸、手动精修和手动美体入口存在；
- 资源目录的五类面板、资源标题、模型清单和算法 requirements 已从当前 `rp.db` 读取；
- 上表模型文件在当前本机缓存中存在；
- 自动美颜/美体效果包的算法图、参数键和美体整帧语义已从原包配置与 Lua 核对；
- QML/ViewModel、预设执行器、手动画笔请求和持久化对象存在于当前剪映二进制；
- 手动磨皮/祛痘的画笔、擦除、大小、强度、逐事件帧处理和 mask 缓存协议已由独立宿主验证；
- 代表性真人素材已跑通人脸、皮肤 GAN、五官形变和骨骼美体输出。

### 强证据推断

- UI 通过 ViewModel 更新当前片段材料，再由 Swing FeatureSegment 把参数交给效果包；已有真实 UI
  参数捕获和二进制调用链支持该结构，但本轮没有对 77 个滑杆逐个动态 hook。
- 单/多人脸参数依赖 `freid trackid`；不同包之间仍需要宿主做 ID 映射。

### 尚未知或未完成

- 当前版本每一个 UI 滑杆到具体聚合包目录的动态加载记录；
- 所有美颜、美妆和美体单项相对同版本剪映 UI 的无损逐像素平价；
- 手动磨皮/祛痘与三种手动美体相对剪映 UI 的无损导出 parity，以及手动美体真实连续视频稳定性；
- 长视频中多人遮挡、人物进出、镜头切换后 trackid 与预设绑定的完整行为；
- 第三方运行时、模型和效果资源的授权与分发条件。

## 本轮只读复核命令

```bash
plutil -p /Applications/VideoFusion-macOS.app/Contents/Info.plist
sqlite3 -readonly ~/Movies/JianyingPro/User\ Data/Cache/ressdk_db/515395108782262524/rp.db
jq . <effect-package>/config.json
jq . <effect-package>/algorithmConfig.json
strings -a /Applications/VideoFusion-macOS.app/Contents/Frameworks/libVECreator.dylib
```

所有命令均为只读；没有修改剪映应用、效果包、模型或缓存数据库。
