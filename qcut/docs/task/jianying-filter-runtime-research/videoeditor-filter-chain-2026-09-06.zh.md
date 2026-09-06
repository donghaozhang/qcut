# libvideoeditor：滤镜数值、关键帧与时间区间的静态调用链

记录日期：2026-09-06。目标卡：电影柔光，资源 ID `7447126702137904420`。

本轮重新读取本机剪映 11.3.0 二进制，按 ARM64 指令恢复了四处边界：材料数值写入、滤镜关键帧转换、滤镜插入时的区间转换、已有滤镜的时间更新。结果可以指导下一轮对照实验，但尚未证明电影柔光实际运行经过每条分支，也没有新增渲染或像素平价结果。

最有价值的新发现是：**滤镜的时间线区间和模型 Clip 的裁切区间分别构造；AmazingFilter 的一个特定子类型会把后者改为从零开始，同时保留原来的时间线位置。** 此外，找到的关键帧转换函数直接传递强度，没有再次除以 100。

## 本机版本与证据范围

| 项目 | 本轮实际读到的值 |
| --- | --- |
| 应用 | `/Applications/VideoFusion-macOS.app` |
| CFBundleShortVersionString / CFBundleVersion | `11.3.0` / `11.3.0` |
| 库 | `/Applications/VideoFusion-macOS.app/Contents/Frameworks/libvideoeditor.dylib` |
| Universal 文件 SHA-256 | `ee33e4e68ecf3dc05501d04c4415a3a52ce60c6a6ed3615330963e78be4c25ab` |
| ARM64 UUID | `22337058-B217-3CAF-9979-CFECA7302CF7` |
| x86_64 UUID | `6B44A39A-B635-3855-B2C3-67D1B2D7B4E5` |
| 本轮实际分析架构 | ARM64 |
| 私有证据目录 | `/Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/videoeditor/` |

全部地址均为该 ARM64 切片的静态虚拟地址，不是加过 ASLR slide 的进程地址。原始符号表、间接符号表、函数起点和定点反汇编保留在上述私有目录。仓库只增加本文，不保存第三方二进制、反汇编内容、草稿或资源包。

本轮没有打开、修改或复制剪映项目，没有修改应用，也没有注入或附加运行中的进程。电影柔光的资源身份来自已有[四方对照记录](cinematic-soft-glow-four-way-e2e.zh.md)；该记录的旧测量结果不计作本轮验证。

## 1. 材料数值写入不会自动归一化

证据等级：`static-strong`，仅限列出的函数体。

定位到 `lvve::MaterialEffect::set_value(double const&)`，范围 `0x00f1cc74–0x00f1ccbc`。入口先对新旧 double 做浮点比较；相等直接返回，不写值也不更新后续状态。不同则把输入 double 原样写入对象，然后设置变更标志。对象 `+0x20` 和 `+0x24` 的组合还控制一个状态转换；本轮没有给这些内部字段强行命名。

相邻的 `get_value()` 位于 `0x00f1cc6c`，返回该字段地址，佐证字段位置为对象 `+0xe8`。这个偏移只用作当前构建的定位证据，不应放进 QCut 产品代码。

恢复出的语义边界：

- 此 setter 没有 `0..100` 到 `0..1` 的换算，没有 clamp，也没有 finite 检查。
- 新值为 `0.5` 时，它保存的仍是 `0.5`；不能在这一层再假设存在百分比单位。
- `+0` 和 `-0` 在比较中相等，因此只改变零的符号不会触发写入。
- NaN 走浮点不相等分支；这个函数自身不会拒绝 NaN。上游是否校验仍未确认，不能据此声称 UI 接受 NaN。

这只能排除“该 setter 替我们归一化或限制强度”的假设。它不是整个 UI 到效果事件的完整映射，也不证明所有 MaterialEffect 的 value 都具有滤镜强度语义。

## 2. 滤镜关键帧转换直接传递强度和时间偏移

证据等级：`static-strong`，输入记录的完整类型为 `unresolved`。

通过 ARM64 的直接 B/BL 目标扫描，定位到当前 `__text` 中调用 `vesdk::pub::FilterKeyframe::set_intensity(double const&)` 间接桩的唯一直接分支：`0x03a19714 → 0x03f16288`。扫描结果保存在 `focused-branch-references.json`。这只统计直接分支，不排除间接调用或其他模块调用。

`LC_FUNCTION_STARTS` 确认该隐藏函数的真实范围为 `0x03a19690–0x03a197cc`，共 316 字节。函数没有可用的导出名字。objdump 显示的远处 `AlgorithmUtils::getRelativePathFromAbsolute + offset` 只是最近符号标注，**不能用作该函数的名字或职责**。

间接符号表和实参数据流交叉确认了这些操作：

| 位置 | 被调用接口 | 实际传参 |
| --- | --- | --- |
| `0x03a196e0` | `FilterKeyframe` 构造器 | 创建新的滤镜关键帧对象 |
| `0x03a196f4` | `Keyframe::set_type`，桩 `0x03f16de0` | 数字 `2`；未猜测公开枚举名 |
| `0x03a19708` | `Keyframe::set_time_offset`，桩 `0x03f16dbc` | 从输入记录 `+0x8` 复制 64 位值，未缩放 |
| `0x03a19714` | `FilterKeyframe::set_intensity`，桩 `0x03f16288` | 直接传入输入记录 `+0x18` 的地址 |
| `0x03a19730` | `Keyframe::set_json`，桩 `0x03f16dd4` | 隐藏 helper `0x03a194b0` 生成的字符串 |

该转换函数没有强度乘除、裁剪或帧率换算。它说明关键帧协议至少有独立的 time_offset、intensity 和 JSON 三条通道，不能把 JSON 是否为空当作关键帧是否有效的判据。

反例：输入 `0.5` 在进入 `set_intensity` 前仍指向原来的 `0.5`，不会被本函数改成 `0.005`；输入中记录的时间值也不会在这里自动从毫秒变成微秒。具体时间单位必须继续向写入输入记录的上游追踪。

这里的输入记录尚未证明是 `lvve::KeyframeFilter` 本体，更不是已知的 `UpdateGlobalFilterReqStruct`。不能把两个结构的偏移接在一起，声称已经贯通 UI 请求到运行时关键帧。

## 3. 插入滤镜时，序列位置与 Clip 裁切分别处理

证据等级：`static-strong`。子类型 `3` 对应哪类产品功能仍为 `unresolved`。

入口为 `lvve::NewVEWrapper::insertFilter(...)`，范围 `0x02e7c510–0x02e7c6c4`，接受 Filter、目标字符串和两个 `long long` 时间参数。入口没有解析资源 ID，也没有对输入 Filter 的强度做运算。

完整定点链路为：

1. `0x02e7c57c` 调用隐藏 helper `0x02debdd0`。helper 在 `0x02debde0` 计算两个时间实参之差，并构造 `{start, duration}`。
2. helper `0x02debe80–0x02dec240` 接收该区间。其日志关联字符串在 `0x048f1894` 为 `ve_filter_utils.cpp`，`0x048f18a8` 为 `insertFilter`；这提供了隐藏 helper 的额外身份线索。
3. helper 首先读取 Filter ID；为空时，通过以 `Filter_` 为前缀的生成路径补 ID。随后对 Filter 做 RTTI 转换，目标为 `vesdk::pub::AmazingFilter`。
4. 转换成功后在 `0x02debf70` 调用 `get_amazing_effect_sub_type()`。仅当返回的数值为 `3`，`0x02debf80` 才把**局部区间副本**的 start 写为 `0`，duration 保持不变。
5. `0x02debfe4` 调用构造 helper `0x03a0f09c`，使用这个局部区间。该 helper 调用 `TimeRange::set_in` / `set_out` 和 `Clip::set_trim_range`，明确证明它设置的是 Clip 裁切区间。
6. `0x02dec010–0x02dec02c` 重新从**原始区间**读取 start、duration，计算 end，并通过编辑器虚表 `+0xc8` 调用插入操作。因此 subtype 分支并没有把原时间线位置也移到零。

构造 helper `0x03a0f09c–0x03a0f278` 中，`0x03a0f134` 只将裁切起点的负值归零，然后分别在 `0x03a0f144`、`0x03a0f15c` 调用 `TimeRange::set_in` 和 `set_out`。终点使用局部 start 加 duration；没有对应的终点 clamp。

用无单位整数举例，更容易看出两组时间不能混用：

| 输入给 insertFilter 的 start / end | Amazing subtype | Clip trim in / out | 插入序列的 start / end |
| --- | --- | --- | --- |
| `100 / 140` | 不是 `3` | `100 / 140` | `100 / 140` |
| `100 / 140` | `3` | `0 / 40` | `100 / 140` |
| `-10 / 20` | 不是 `3` | `0 / 20` | `-10 / 20` |

这些是从上述静态指令推导的输入输出，不是实际调用测试结果。后续编辑器或渲染器是否进一步拒绝、校正这些输入，本轮没有验证。尤其不能把负时间例子当作产品支持承诺。

电影柔光实际使用哪个 subtype 尚未观测，因此还不能决定该卡应采用表中哪一行。但这个分支足以说明：在做 seek、裁切或起始帧对照时，应同时记录时间线位置和 Clip 本地时间，不能只保存一个 timestamp。

## 4. 更新序列时间的 wrapper 没有做单位换算

证据等级：`static-strong`，委托对象的动态类型为 `unresolved`。

`lvve::NewVEWrapper::updateFilterSequenceTime(...)` 的完整范围为 `0x02e7e174–0x02e7e198`，只有 9 条 ARM64 指令。它更新 wrapper 内部状态后，取出对象 `+0x3f8` 的委托对象，并尾调用其虚表 `+0x148`。

从进入函数到尾调用，字符串参数和两个时间参数的寄存器保持不变；没有四舍五入、除以帧率、减去 Clip 起点或转成 duration。这个函数本身也没有空委托检查；其前置初始化条件必须由上游满足。

因此，上面的插入时转换规则不能直接套用为“每次更新时间都会再次构造同样的裁切区间”。插入与更新走了不同边界，需要单独验证。

## 预览、导出与当前仍缺的证据

本轮确认存在独立的入口符号：`PlayerWin::PreviewSeek` 在 `0x02e14594`，`NewVEWrapper::export_start` 在 `0x02e80ae8`，`multi_export_start` 在 `0x02e80e10`。仅凭这些符号，无法确认电影柔光的渲染图、精度、缓存或时间驱动在预览和导出时是否相同。

同样，关键帧不缩放和序列时间原样传递，也不能排除其他层的单位转换。这次没有重跑[旧四方对照](cinematic-soft-glow-four-way-e2e.zh.md)，没有重新测量 UI 与 oracle 的差异，更没有用静态调用链宣称独立实现已完成。

下一轮最小闭环：

1. 在同一版本的专用实验项目里，只使用电影柔光和校准素材，确认运行时采用的 AmazingFilter subtype 及材料强度，保留电影柔光的资源 ID、版本和包哈希。
2. 记录非零时间线起点下的 sequence start/end、Clip trim in/out、keyframe time_offset；对比插入、修改时长、seek 和重开。
3. 用 `0 / 0.5 / 1` 强度及相同源帧，分别获得预览与无损导出参考。若它们仍有差异，再把问题交给 AGFX 的纹理格式、精度或 Pass 调度分析。
4. 继续追踪生成关键帧输入记录的上游，把 `UpdateGlobalFilterReqStruct` 的值与这里的 intensity 通道连接起来。结构偏移本身不够，必须补调用和数据流证据。

对 QCut，目前可以采用“材料值、关键帧强度、序列区间、Clip 本地区间分别保存”的设计方向；不能直接采用这些私有内存布局或未命名的子类型数值作为产品兼容协议。

## 复现命令与工具注意事项

以下命令只读应用，将私有中间产物写到仓库外。`--arch=arm64` 会触发 Mach-O 特定路径，实测仍可能忽略起止地址；本轮最初遇到过这一行为，已停止命令并用正确的定点结果覆盖过大的输出。可靠办法是先提取 ARM64，再使用**不带 `--macho` 和 `--arch`** 的 `llvm-objdump -d`。

```sh
JY_LIBRARY='/Applications/VideoFusion-macOS.app/Contents/Frameworks/libvideoeditor.dylib'
JY_EVIDENCE='/Users/peter/Downloads/QCut-AGFX-Research-2026-09-06/videoeditor'
shasum -a 256 "$JY_LIBRARY"
xcrun dwarfdump --uuid "$JY_LIBRARY"
plutil -p '/Applications/VideoFusion-macOS.app/Contents/Info.plist'
xcrun lipo "$JY_LIBRARY" -thin arm64 -output "$JY_EVIDENCE/libvideoeditor.arm64.dylib"
xcrun nm -n -C "$JY_LIBRARY" > "$JY_EVIDENCE/nm.demangled.txt"
xcrun llvm-objdump --macho --indirect-symbols "$JY_EVIDENCE/libvideoeditor.arm64.dylib" > "$JY_EVIDENCE/indirect-symbols.txt"
xcrun llvm-objdump --macho --function-starts=addrs "$JY_EVIDENCE/libvideoeditor.arm64.dylib" > "$JY_EVIDENCE/function-starts.txt"
xcrun llvm-objdump -d --demangle --start-address=0x3a19690 --stop-address=0x3a197cc "$JY_EVIDENCE/libvideoeditor.arm64.dylib" > "$JY_EVIDENCE/filter-keyframe-conversion.arm64.txt"
```

其余定点范围及对应私有文件：

| 起点（包含） | 终点（不包含） | 文件 |
| --- | --- | --- |
| `0x00f1cc6c` | `0x00f1ccbc` | `material-effect-value.arm64.txt` |
| `0x02e7c510` | `0x02e7c6c4` | `insert-filter.arm64.txt` |
| `0x02debdd0` | `0x02dec240` | `insert-filter-helper.arm64.txt` |
| `0x03a0f09c` | `0x03a0f278` | `filter-model-clip-construction.arm64.txt` |
| `0x02e7e174` | `0x02e7e198` | `update-filter-time.arm64.txt` |

反汇编、间接符号表和 `LC_FUNCTION_STARTS` 三者交叉核对后才给隐藏函数划边界；不根据最近导出符号的名称推断归属。实际抽取命令、分支扫描和文件哈希另保存在私有证据目录。
