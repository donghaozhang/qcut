# 预览与导出：ExportMode 单变量验证

记录时间：2026-08-11

## 单一问题

本轮只验证一个问题：在其余宿主配置完全不变时，把 Swing manager 的
`ExportMode` 从 `false` 改为 `true`，是否会改变奥林巴斯人像滤镜的模型初始化、
输出像素或销毁顺序。

本轮不声称捕获了剪映 UI 的完整导出调用序列。UI 的真实导出渲染运行在 hardened
`--lvve-service` 子进程，当前观察器不能注入该进程。

## 静态入口

本机 `libcccreator.dylib` 导出：

```text
TESwingManagerInterfaceWrapper::setExportMode(bool)
```

定点反汇编确认该方法在 wrapper mutex 内调用：

```text
SwingManager::setParameterBool("ExportMode", value)
```

随后把 wrapper 内部状态字段清零。它不是 AB key，也不通过 segment 参数传递。

## 探针改动

`filter-sequence` 新增默认关闭的环境变量：

```text
JY_EXPORT_MODE=0|1
```

探针在 manager 创建成功、segment 和 feature 尚未创建时调用与 wrapper 相同的
`setParameterBool("ExportMode", value)`。创建结果日志包含该调用的返回码。

## 固定条件

| 项目 | 值 |
| --- | --- |
| 滤镜 | 奥林巴斯 |
| resource ID | `7361792068475325735` |
| package version | `3db90437187dd911b234766ef7297fe9` |
| 输入 | 同一张 854x480 真人静帧，重复 10 帧 |
| 首帧 mode | `3;1;2` |
| 后续 mode | `1` |
| skin-seg model | 精确 `tt_skin_seg_v5.0.model` |
| native texture flags | `001` |
| `EnableImageQuality` | `true` |
| `AlgorithmCacheFlag` | `9` |

唯一变量是 `JY_EXPORT_MODE`。

## 结果

两组都成功渲染 `10/10` 帧。运行时日志分别确认：

```text
initAlgorithm ... enableAlgorithmCache:9 ... exportMode:0
initAlgorithm ... enableAlgorithmCache:9 ... exportMode:1
```

逐帧 `cmp`：

| 指标 | 结果 |
| --- | ---: |
| 比较帧数 | `10` |
| 不同帧数 | `0` |

两组稳定帧 SHA-256 均为：

```text
6cc16a55a89f3bfbb66396db082c3004d68eb9d4f0498e3406e99bcaa3ffc2b7
```

过滤地址和时间后比较完整算法日志，唯一可见差异是
`exportMode:0` 对 `exportMode:1`。两组都选择相同模型、得到相同
`398x224` 算法尺寸，并依次完成 feature、video、AlgorithmService、JS runtime 和
GPDevice 销毁；没有异常退出或悬空异步任务。

## 结论

`ExportMode` 的真实入口和设置时机已经确定，但该 bool **单独不会改变当前人像滤镜
短序列的最终像素或销毁行为**。因此不能用“把 ExportMode 设为 1”解释预览正确、
导出不同的问题。

如果真实 UI 导出仍与预览不同，下一层变量应是外围 orchestration：导出进程中的
update-mode 序列、帧时间戳、seek/source-boundary reset、并发提交和 flush/wait 顺序。
这些必须逐项捕获或复现，不能从本轮静帧 A/B 外推。

仓库外完整证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/export-mode/
  preview-mode/
  export-mode/
```

其中包含两组 probe 日志与 raw 输出；私有模型、包和二进制不进入 git。

## 后续验证

源切换生命周期已经按本页提出的单一问题完成，结果见
[source-switch-manager-reset.zh.md](source-switch-manager-reset.zh.md)：连续
`portrait A -> gray -> portrait B` 时，未 reset 的 B 连续十帧都不同于 fresh-B；manager reset
从第一张 B 起逐字节等于 fresh-B。

真实 UI 导出仍待验证的唯一大项是 hardened `--lvve-service` 外围 orchestration，而不是
`ExportMode` 这个 bool 本身。
