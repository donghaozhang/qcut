# 人像路径：skin-seg SIMD AB 单变量对照

记录时间：2026-08-11

## 单一问题

本轮只验证 `enable_skin_seg_use_simd_optim` 是否解释独立 Swing V2 与剪映 UI 的剩余人像差异。
两组都固定使用 UI resolver 实际返回的 physical v5.1 skin-seg 文件，只在 manager 创建前分别注入：

```text
enable_skin_seg_use_simd_optim=0
enable_skin_seg_use_simd_optim=1
```

结果不是“打开 SIMD 后更接近 UI”，而是：**只要 CoreML 后端在同一时点 ready，SIMD 0/1 的完整
224x128 mask 和最终 854x480 RGBA 都逐字节一致。** 之前看到的小差异来自异步模型就绪时序，不是 SIMD
计算路径。

## 探针改动

`filter-sequence` 新增两个默认不改变旧行为的环境变量：

```text
JY_ENABLE_SKIN_SEG_USE_SIMD_OPTIM=0|1
JY_FILTER_STAGE_DELAY_MS=<non-negative integer>
```

- SIMD 变量是三态：未设置时不覆盖 EffectSDK 默认值，设置时在 manager 创建前调用既有
  `bef_effect_config_ab_value`，失败会终止测试；
- stage delay 只在 `3;1;2` 这类分号分隔的 staged seek 之间等待，普通逐帧 mode `1` 不等待；
- 日志同时证明 config、运行时 `getABValue` 和 `kSkinSegOptimizeMode` 分别真实得到 `0/false` 与
  `1/true`，不是只改了宿主变量；
- [compare-skin-model-runs.py](probes/compare-skin-model-runs.py) 支持将独立宿主输出区间与 UI 帧区间分别
  对齐，并允许给两组证据命名，避免动态片段被错误地从 UI 第 0 帧开始比较。

mask 观察器依赖进程启动时注入。本机经过系统 shebang 启动链时会清理 `DYLD_INSERT_LIBRARIES`，因此带
观察器的复跑先用 `run-probe.sh inspect` 编译，再直接启动生成的
`build/jianying-runtime-probe`。每次都要求 `masks/index.tsv` 首行是 `status=patched`，不能把只有 RGBA 的
运行误报成完整验证。

未设置 SIMD 与 stage delay 的默认回归也单独跑了 `10/10`：日志没有宿主 SIMD config 行，只看到 SDK
读取自身默认值 `0`；10 张 RGBA 与改动前的 no-delay v5.1 输出逐字节一致。因此诊断开关没有改变既有调用方。

## 固定夹具

| 项目 | 固定值 |
| --- | --- |
| 滤镜 | 奥林巴斯 |
| resource ID | `7361792068475325735` |
| package version | `3db90437187dd911b234766ef7297fe9` |
| 输入与 UI 对照 | 同一 854x480 无损人物序列 |
| manifest | 1 个 `3;1;2` staged preparation + 70 个连续源帧 |
| 静态测量窗口 | output `1-10` 对 UI `0-9` |
| 动态测量窗口 | output `61-70` 对 UI `60-69` |
| physical skin model | UI v5.1，2071057 字节 |
| model MD5 | `63b6b4b76d30ec8e11c0e9fdfdc9a608` |
| exact model resolver | `1` |
| native texture flags | `001` |
| feature 参数 | `{"intensity":1}` |
| AlgorithmCacheFlag / ExportMode | `9 / 0` |
| EnableImageQuality / float color | `1 / 0` |
| manager create option | `0` |
| parallel/async Swing | `1`，确认进入 V2 |
| staged delay | `100 ms`，仅位于 preparation 的三个 seek 之间 |

两组都在最终 `timestamp=0 passes=3;1;2` 返回前报告 `skin_seg coreml is Ready!`。它不是凭等待时长
推断，而是由同一运行日志直接确认。

## 为什么前两版协议无效

### 重复静态图、无等待

最初用同一张输入图连续渲染。SIMD=0 的两次进程得到过不同稳定状态：一次第一帧前 CoreML 已 ready，
另一次第一帧后才 ready；后者与 SIMD=1 及上一轮 v5.1 结果逐字节相同。因为重复帧会复用第一次算法结果，
它测到的是“第一次结果何时进入缓存”，不能隔离 SIMD。

### 动态图、无等待

改用连续源帧后，SIMD=0/1 在后 10 帧仍有很小差异：

| 指标 | SIMD=0 | SIMD=1 | SIMD=1 - SIMD=0 |
| --- | ---: | ---: | ---: |
| RGB RMSE 对 UI | `1.163368` | `1.173697` | `+0.010329` |
| RGB PSNR 对 UI | `46.816460 dB` | `46.739683 dB` | `-0.076777 dB` |
| mask MAE 对 UI | `4.658125` | `4.802888` | `+0.144763` |

但两组的 CoreML ready 相对首帧顺序不同，而且差异从动态窗口首帧约 `-0.223 dB` 逐渐衰减到接近零。
这仍是不同预热历史，不是合格 A/B，因此不把该数字当作 SIMD 影响。

## 受控结果

在相同 staged preparation 中加入 `100 ms` 间隔，让两组都在最终 preparation 输出前 ready：

| 比较 | 结果 |
| --- | --- |
| SIMD=0 vs SIMD=1，71 张 RGBA | 全部逐字节一致 |
| SIMD=0 vs SIMD=1，72 张原生 mask | 全部逐字节一致 |
| 原生 mask MAE / RMSE / max abs | `0 / 0 / 0` |
| 原生 mask IoU @ 128 | `1.0` |
| 最终 RGB RMSE / PSNR 差值 | `0 / 0 dB` |
| UI mask MAE / IoU 差值 | `0 / 0` |

独立的第二轮受控进程再次得到同一结果。SIMD=0 与 SIMD=1 各自都与首轮 71 张 RGBA、72 张 mask
逐字节一致，排除了偶然缓存命中。忽略仅包含对象地址、线程 ID 和微小时钟值的 `index.tsv` 元数据后，
两组内容树摘要为：

```text
71 RGBA: fb697c73dfc22aa584e9edcb23a749b17cfd3a210fc94a7b8ee6d3db50eb5005
72 masks: f123da01d6ee1af2d1f3c0295341baaab8a3d54b0f90878531c15ac98acd911f
```

受控 v5.1 对 UI 的绝对指标如下。这些数值描述当前宿主仍剩多少误差，不影响 SIMD 两组零差结论：

| 窗口 | RGB RMSE | RGB PSNR | mask MAE | mask IoU @ 128 |
| --- | ---: | ---: | ---: | ---: |
| 静态 10 帧 | `1.168216` | `46.780337 dB` | `4.988363` | `0.946869` |
| 动态 10 帧 | `1.163368` | `46.816460 dB` | `4.658125` | `0.861405` |

## 对上一轮 v5.1 结论的修正

上一轮无 stage delay 的 v5.1 运行在 `timestamp=0 passes=3;1;2` 之后才报告 CoreML ready。该状态对 UI
达到 `RMSE 0.916513 / 48.888033 dB`、mask `MAE 3.243866 / IoU 0.962409`。本轮 readiness 受控状态则为
`RMSE 1.168216 / 46.780337 dB`、mask `MAE 4.988363 / IoU 0.946869`。

同一 physical v5.1 文件的两种生命周期状态之间，原生 mask 本身已有 `MAE 3.861258 / RMSE 12.994668`，
最终 RGB 也有 `RMSE 0.899084`。因此旧 v5.0 -> v5.1 对照仍证明 **resolver 会改变真实模型与输出**，但
`5.846004 dB` 的全部增益不能继续被表述为纯模型文件贡献；那个实验混入了首次算法结果、异步 ready 与缓存
状态。要量化纯 physical-model 增益，必须在两种模型都采用同一受控 readiness 协议后另做一轮，不能从现有
数字相减。

## 结论与下一步

`enable_skin_seg_use_simd_optim` 已在 physical v5.1、CoreML ready、静态与动态窗口下排除为像素变量，
不要再次测试它。它可能改变内部实现或性能，但本轮没有做性能基准，也不据此评价速度。

异步模型 ready、第一次有效算法结果和缓存提交的生命周期已在下一轮继续隔离。renderer callback 返回后，
同一 V2 纹理在两秒 run-loop 等待前后逐字节一致，且没有额外 mask 交付；ready 需要后续 seek 才被宿主观察。
见 [skin-seg-first-result-lifecycle.zh.md](skin-seg-first-result-lifecycle.zh.md)。下一轮只测试 ready 已被观察后的
同 timestamp re-seek 是否替换旧结果，不要同时加入 manager reset。

## 仓库外证据

证据根目录：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/skin-seg-simd-ab
```

| 证据 | SHA-256 |
| --- | --- |
| 71-step manifest | `a3c0193e3d4b6194f03cd5cd4f2a7e18b94e40f1899cc461d9aba159e67fb3d4` |
| UI RGBA 70 帧 | `d82813bb7fe384dff8ceaf12d82fa9a3e42d1caff3ba37b4039ed437eec82b49` |
| UI mask 70 帧 | `373b33605a9cb0cb55630316e640dbfe081d537a0bfa7c67439ca15a13bfe424` |
| controlled SIMD=0 log | `a75233b0f21c198f151afbe406eb1adbf3d418ec977f46819bec784fca6843aa` |
| controlled SIMD=1 log | `c6ed7cbd0cee34e9a2e14c96c93c2a733dbb281297be75d764e6fe9082227536` |
| exact repeat SIMD=0 log | `89d0aa2b53be49ed48ece5df8282edc2dba7ec18ee5f5c38d7f2e9617c0382f9` |
| exact repeat SIMD=1 log | `c3b96c5b456e16cf4513c37e901613b265280cf5ad47dcf9e8cbe2edf65b0015` |
| static metrics JSON | `56251c6f8cb9dc553b487615e7b5461df90d076cf485e6c52fc78e7c46fc5751` |
| dynamic metrics JSON | `1651e2a8c659db4c2053e5406bd34a30349716a6229d0ffdf972c8a6d57375aa` |
| readiness comparison JSON | `82afaed14be761d6b2ba84b73d0b1623b6471b1ea2a477acc08bfff7af5a2d8a` |
| dynamic RGBA panel | `9fa812f3cfc349223e91a45484cf84333aeaf55f4507b74c04a283ae726ef0e4` |
| dynamic mask panel | `1fdff593b4e42b2650907b4a7711aebac184b30fda08d688c820e05e97028fd4` |

模型、效果包、输入、日志、原始输出、PNG、JSON 与编译产物都保留在仓库外。仓库只保存自有探针、比较工具、
哈希、指标与结论。
