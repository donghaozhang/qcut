# 电影柔光的两种强度模式

2026-09-06。精确资源 `7447126702137904420`，版本 `9673f80b8e2f5a07f02f9ce1130b784a`。本说明定义独立C++的强度选择，沿用[整链契约](semantic-contract.zh.md)的不透明、top-down RGBA8 SDR输入。

## 可直接实现的定义

`t`是[0,1]有限数。Gaussian、SoftLight、Glow空间参数、LUT图集和最终Normal连接均沿用精确场景。SoftLight固定opacity=0.7、居中scale=1.03；Normal固定opacity=0.64，base为SoftLight输出B。

| 模式 | Glow threshold | Glow brightness | LUT opacity | 输出 | t=0 |
| --- | --- | --- | --- | --- | --- |
| `output-mix`（默认） | 0.84 | 2.4 | 0.8 | `Q(lerp(I,F,t))` | 逐字节I |
| `ui-snapshot`，t≤0.8 | `1−0.175t` | `3t` | `0.8t` | F | B |
| `ui-snapshot`，t>0.8 | 0.84 | 2.4 | `0.8t` | F | 不适用 |

I为原图，F为最终Normal输出，Q为RGBA8量化。阈值比较包含0.8边界：80%为threshold=0.86／brightness=2.4，81%为0.84／2.4；保留这个分支变化，不做插值平滑。37%为0.93525／1.11，LUT opacity=0.296。

`ui-snapshot`每次调用直接由t重建参数，不读取上一帧或上一次强度。0不旁路整链：辉光brightness=0，LUT opacity=0，最终同base的Normal返回SoftLight。100的所有内部参数及结果与原模式相同。该模式描述实测导出快照，未声称恢复实时预览状态机或所有事件宿主语义，也没有修复或执行供应商Lua。

## C++与CLI接口

`PipelineRequest`尾字段是 `IntensityMode intensity_mode = IntensityMode::output_mix`。已有四字段aggregate初始化保持兼容。`StreamRequest`同样在尾部追加该字段。

```cpp
const auto frame = softglow::cinematic_soft_glow({
    input, atlas, 0.37F, {}, softglow::IntensityMode::ui_snapshot
});
```

单张CLI和流式CLI共用严格模式解析；省略模式使用`output-mix`，不认识的模式报错。流式进程的尺寸、LUT、强度、模式均固定，变化时重新建进程。统计JSON报告`intensity_mode`；帧流stdout仍只有RGBA像素，不插入新协议头。

```sh
./build/soft-glow --input input.rgba --output output.rgba \
  --width 1280 --height 720 --lut reference-map2.rgba \
  --intensity 0.37 --intensity-mode ui-snapshot
./build/soft-glow-stream --width 1280 --height 720 --lut reference-map2.rgba \
  --intensity 0.37 --intensity-mode ui-snapshot < frames.rgba > rendered.rgba
```

## 证据各自证明什么

旧D634 CGL宿主使用完整输出混合，已有三输入×100%／37%的六组对照。新默认CLI重放六组，输出SHA全部与旧C++结果相同。原生参考、旧输出和旧源文件hash保持原样，旧hash是当时快照，不是当前源代码清单。

剪映实际UI导出采用另一条强度行为。1280×720静态图、150帧导出，固定检查零基第75帧。原PNG作为独立实现输入时，H.264导出的候选RGB MAE分别为：0%=0.370842、37%=0.606729、80%=0.761970、81%=0.769768、100%=0.773330。37%的旧输出混合MAE为5.258995。**这些误差包含导出编码和颜色转换，不是纯算法误差。**

随后五档全部显式导出ProRes4444，实际codec=prores、profile=4444、pix_fmt=yuva444p12le。0／37／80／81／100%的候选MAE分别为0.340657／0.545537／0.701910／0.705149／0.711324（仍以原PNG作为输入）；用已解码的无滤镜基线作为控制输入时分别为0.106239／0.380563／0.553789／0.555211／0.565888。0%对应旧输出混合MAE为6.751786（基线控制输入）。两种输入实验分别保留，不选更低数字替换主输入结果。这里是静态图的五档导出中帧矩阵，不能替代运动视频逐帧对照。

“新加滤镜的100%”与强度往返后的100%，以及“37%后改81%”与“80%后改81%”，对应第75帧各自逐字节一致。完整H.264导出仅分别有121／150、98／150帧在相同索引一致，不能把中帧一致写成整视频一致。它支持本次快照参数独立于调整顺序，不证明完整预览历史状态。

正式`ui-snapshot`程序又对0／37／80／81／100%五档重放原PNG输入，输出与上述独立候选程序已有raw结果全部逐字节一致。因此候选数值对应正式实现，没有把换成新接口后的结果凭空继承为已验证。

## 自动验证

Release与ASan/UBSan各通过三项CTest：九组算法测试、流协议测试和可选Python真实CLI测试。覆盖UI0保留SoftLight、100与旧模式同字节、阈值解析期望、80／81边界、LUT有效opacity、不同调用顺序重复一致；两模式多帧与逐帧调用一致；省略模式兼容；非法模式、重复流参数、残帧和空EOF。

私有证据目录：`/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/intensity-modes/`。

- `default-compatibility.json`：六组历史输出与当前默认CLI的命令、hash。
- `candidate-compatibility.json`：正式UI模式与既有五档候选的逐字节核验。
- `ui-evidence-snapshot.json`：从UI总报告摘取的有时间与源报告hash的中帧证据，含两种输入、实际codec与历史调整对照。
- `build/Testing/Temporary/LastTest.log`、`build-sanitize/Testing/Temporary/LastTest.log`：当前源码测试输出。

完整UI原始数据位于同级`ui/metrics.json`与各MOV／decode JSON；原生错误及FeatureSegment事件观察见[独立宿主强度探针](../../docs/task/jianying-filter-runtime-research/soft-glow-intensity-probes-2026-09-06.zh.md)。供应商资源始终留在本机私有缓存，仓库仅保存自产算法和说明。
