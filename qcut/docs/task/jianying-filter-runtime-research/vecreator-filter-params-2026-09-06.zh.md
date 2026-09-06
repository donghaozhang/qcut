# libVECreator 滤镜强度与提交路径：2026-09-06

本轮针对“电影柔光”后续独立实现，分析其上游通用滤镜检查器。通过本机剪映 11.3.0 的 ARM64 有界反汇编，已把检查器数值更新追到 `UpdateGlobalFilterReqStruct` 和 `DraftClient::draftCombo`。**输入 double 在这段路径内原值传递；乘 100 与取整发生在操作埋点中。** 不能因此认定电影柔光的所有内部 Pass 都按同一强度线性变化。

## 样本、证据和范围

| 项目 | 本轮结果 |
| --- | --- |
| 应用 | `/Applications/VideoFusion-macOS.app` |
| 安装版本 | `CFBundleShortVersionString = 11.3.0`；`CFBundleVersion = 11.3.0` |
| 被分析文件 | `/Applications/VideoFusion-macOS.app/Contents/Frameworks/libVECreator.dylib` |
| 原始通用二进制 SHA-256 | `fb2082654df3a54c39e99d6828abf8189b011c4a1eaf48a5332b18525df7b62b` |
| ARM64 UUID | `C4A59C03-BCE4-30E9-801E-BDC096397FD3` |
| x86_64 UUID | `41F6CB48-E683-3E64-A68A-1254F410ADAC`，本轮未反汇编此架构 |
| 私有证据目录 | `/Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/vecreator/` |
| 证据层级 | 本文恢复的函数语义为 `static-strong`；没有新做运行时调用观测或渲染比较 |

只读访问应用包；未打开、复制或修改剪映项目，未注入、修补或调用供应商库。原始符号、ARM64 薄片和反汇编均在仓库外。仓库内只记录原创分析，不保存供应商实现代码。

资源 ID `7447126702137904420`、标题“电影柔光”取自已有 [四方对照记录](cinematic-soft-glow-four-way-e2e.zh.md)。本轮找到的是通用 `SegmentFilter` 检查器路径，没有在函数中观察到该资源 ID 的专用分支，也未重跑旧文档的像素指标。

## 已恢复的调用链

```text
DraftInspectorFilterPropertiesViewModel
  → DraftInspectorFilterPropertiesModel
    → FilterSegmentActionWrapper
      → 每个选中片段对应一个 UpdateGlobalFilterReqStruct
      → DraftClient::draftCombo
```

ViewModel 的 `setValue`、`acceptValue`、`reset` 都先检查其模型弱引用，再转交同名 Model 方法；未在这一层看到缩放、量化或 GPU 参数写入。Model 的读取方法返回本地 double 字段，写入则走 ActionWrapper。因此检查器显示的字段、请求提交和最终渲染是三个需要分别核对的节点。

### 1. 强度常量：默认 1.0，精度 0.001

| 符号 | ARM64 地址 | 恢复结果 |
| --- | --- | --- |
| `VECConstKeys::get_kFilterDefaultIntensity()` | `0x847b54` | 直接返回 double `1.0` |
| `VECConstKeys::get_kFilterIntensityPrecision()` | `0x847b5c` | 返回 double 位模式 `0x3f50624dd2f1a9fc`，即 `0.001` |

证据：`filter-constants.asm`。这是全局常量 getter 的实际结果，不等于每张卡的初始化预设已被验证；精度常量的存在也不证明每次写入都会按 0.001 取整。

### 2. `FilterSegmentActionWrapper::setValue`：原值写请求，百分比用于埋点

函数范围：`0x5a4cd20–0x5a4d760`。证据：`wrapper-set-value.asm`。

恢复的行为：

1. 遍历当前保存的片段集合，为每项建立 `lyra::UpdateGlobalFilterReqStruct`。
2. 将片段标识写入请求；输入 double 原样载入并写入请求数值槽。在本构建中，写入点为 `0x5a4cdf4–0x5a4cdf8`，数值槽相对请求对象起点为 `+0x100`。该偏移只用来复核本样本，不能作为跨版本 ABI。
3. 第一项 bool 为 false 时跳过操作埋点；为 true 时读取滤镜素材、分类等描述，计算 `round(value × 100)`，交给 `tracking_click_filter_adjust_control::set_control_detail`。
4. 第二项 bool 为 false/true 时，埋点动作类型分别选择 `click` / `shortkey`。这两个字符串通过实际只读地址解析确认，见 `selected-rodata.json`。
5. 将已构造的请求集合连同第一项 bool 交给 `dispatchActions`。

例如输入 `0.5`：请求仍携带 `0.5`；启用埋点时产生的百分比数值为 `50`。这是这一函数的静态数据流结论，不是本轮对剪映 UI“强度 50”做出的运行时测量。

对应的 Model 入口：

| 入口 | 普通分支的转交方式 | 证据地址 |
| --- | --- | --- |
| `setValue(double const&)` | `setValue(value, false, false)` | `0x5a36dd4–0x5a36dec` |
| `acceptValue(double const&, bool)` | `setValue(value, true, inputBool)` | `0x5a36f00–0x5a36f3c` |

Model 另有关键帧处理分支：检查已存在的关键帧，在对应模式下调用 `clearAllFrames(false)`；接受更新时还可能进入 `utils::key_frame::alertToClearKeyFrames`。`+0x62` 所代表的模式尚未完整恢复，不能据此声称每次改强度都会删除关键帧。证据：`model-value-set-accept-reset.asm`。

### 3. `dispatchActions`：组合请求边界

函数范围：`0x5a4b96c–0x5a4bc38`。证据：`wrapper-dispatch.asm`。

此函数取得指定编辑模式的播放器对象，执行两个虚调用，再建立 `lyra::DraftComboParams`，使用标签 `Filter_Segment_Base_Action`，把请求集合交给 `DraftClient::draftCombo`。会话标识来自 `core_hlp::getLvveLyraSid`。

输入 bool 同时被写入组合参数中的字段。结合 `setValue/acceptValue` 的差异，可提出“连续修改与接受修改使用不同提交标记”的架构解释，但本轮未恢复该字段名称，不能直接称其为撤销记录开关。播放器两个虚调用的实际名称也尚未解析，因此不能把它们写成已证实的 pause/refresh。

这确认了 creator 层的责任是构造编辑请求。它没有在这条路径直接设置 Metal 纹理、Shader 或电影柔光的内部混合参数。

### 4. `reset` 与 `value`：重置请求、关键帧和多选状态

`FilterSegmentActionWrapper::reset()` 范围 `0x5a4d760–0x5a4da90`，证据为 `wrapper-reset.asm`。它为每个选中片段创建 `ResetGlobalFilterReqStruct`，写入片段标识，最终以 bool `true` 提交组合请求。**该函数没有自行给强度赋值 1.0。** 默认值 getter 为 1.0 和重置发送独立请求是两项事实；重置的最终数值由下游请求处理决定。

`FilterSegmentActionWrapper::value()` 范围 `0x5a4c7cc–0x5a4cd20`，证据为 `wrapper-get-value.asm`：

- 无选中片段时返回 `0.0`。
- 单选时调用 `PanelKeyframeBase::getKeyframeValueFromTimeline<double>`，参数类型字符串确认为 `KFTypeFilter`，而不是直接读取一个不随时间变化的 UI 数字。
- 多选时逐项获取同类关键帧值，存在基于 `0.01` 的舍入比较路径；不一致分支返回 `-1.0`。当前数值可用作“多选混合状态”的解释，不能当作合法负强度提交。对于非有限值，比较还有额外分支，本轮未恢复完整规则。

因此 `0.001` 全局精度常量、`0.01` 多选比较尺度以及埋点中的整数百分比，属于不同用途。不能将它们合并为一个通用强度量化规则。

## 对 QCut 的直接帮助

| 已有证据 | 可用于 QCut 的约束 | 仍需确认 |
| --- | --- | --- |
| Creator 写请求时保留输入 double | 在请求/存储层保留归一化数值；展示百分比和内部数值使用明确边界 | UI 输入框的 clamp、步长以及除 100 的实际发生位置 |
| 多片段各自建立更新请求 | 批量调强度应该显式处理各片段，不能只改检查器缓存值 | 下游批量请求的原子性、错误与撤销语义 |
| 读取走 `KFTypeFilter` 时间线接口 | 预览/导出要使用当前时间对应的强度 | 关键帧插值类型、端点和导出时钟 |
| reset 发送独立请求 | 重置需独立处理默认配置与关键帧状态 | `ResetGlobalFilterReqStruct` 的服务端处理器 |
| `round(value × 100)` 只在埋点分支出现 | 不应因看见此乘法就在滤镜渲染入口再乘 100 | `libvideoeditor` 到 `libcccreator` 是否还有映射 |

以上是互操作设计约束，尚不足以复制某张滤镜的完整视觉行为。本轮没有更改 QCut 产品代码，也没有声称电影柔光的独立实现已经通过对齐。

## 后续只读检查

1. 在 `libvideoeditor` 内追 `UpdateGlobalFilterReqStruct`、`ResetGlobalFilterReqStruct` 对应 action，确认数值从请求写入哪个 draft 字段，是否 clamp，以及谁更新渲染端。
2. 定位检查器 QML/声明式 UI 中的强度绑定，确认显示 `50` 与请求 `0.5` 的实际换算位置。本轮按常量名字搜索到了符号和 Qt 元数据，但未取得含该绑定的明文 QML，不能把此步骤算作完成。
3. 将已确认的外层强度，与电影柔光包内部的 LUT/SoftLight/Normal 强度分开验证。做新运行时实验时固定单个测试片段，使用 0、0.25、0.5、0.75、1 五档，分别保存无损渲染帧；当前报告未执行这些实验。
4. 解出组合参数 bool 的字段名与播放器虚调用，补齐实时调整、接受修改、撤销和导出的语义边界。

## 复核命令

```bash
JY_APP=/Applications/VideoFusion-macOS.app
JY_CREATOR="$JY_APP/Contents/Frameworks/libVECreator.dylib"
JY_EVIDENCE=/Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/vecreator

plutil -p "$JY_APP/Contents/Info.plist"
shasum -a 256 "$JY_CREATOR"
dwarfdump --uuid "$JY_CREATOR"
xcrun nm -arch arm64 -n "$JY_CREATOR"
lipo "$JY_CREATOR" -thin arm64 -output "$JY_EVIDENCE/libVECreator.arm64.dylib"
xcrun llvm-objdump -d --demangle \
  --start-address=0x5a4cd20 --stop-address=0x5a4d760 \
  "$JY_EVIDENCE/libVECreator.arm64.dylib"
```

有界反汇编使用 ARM64 薄片与普通 `llvm-objdump -d`，不要加入 `--macho`；本机该模式可能不遵守 start/stop 地址，从而输出整库。只读字符串地址通过 Mach-O segment 的 VM 地址到文件偏移映射复核，未执行程序代码。

其他区间和证据文件已在正文逐项给出。`evidence-manifest.json` 记录原始库身份、选中函数区间和主要证据校验和。本轮验证为静态数据流复核与文件完整性检查，没有新增运行时或端到端测试。
