# 人像路径：skin-seg 模型解析

记录时间：2026-08-11

## 单一问题

本轮只验证一个问题：独立 V2 宿主为何曾在运行时请求 `tt_skin_seg_v5.0.model` 时实际加载 video skin-seg model，以及改为精确文件名解析后，mask 和最终帧会改变多少。

不修改包、输入、mode、纹理、强度、AlgorithmService 参数、羽化、生命周期或导出路径。两组都显式发送同一 `intensity=1`，唯一变量是资源回调的模型解析策略。

## 探针改动

`ModelCatalog` 原来只从请求中提取 `tt_skin_seg_` 家族，再取排序后的第一个候选。目录里有多个同家族模型时，这个策略可以把运行时明确请求的 static model 替换成 video model。

新增默认关闭的环境开关：

```text
JY_PREFER_EXACT_MODEL_FILENAME=1
```

打开后先用请求路径的 basename 做精确匹配，找不到才回退到原家族策略。日志会明确标记 `(exact filename)` 或 `(family fallback)`。默认行为没有改变。

第一次实现错误地把可能含目录的 `name` 与 basename 比较，导致精确模式仍回退。修正为 `filesystem::path(name).filename()` 后，第二次运行才命中精确模型。失败试跑不进入指标。

## 固定夹具

| 项目 | 值 |
| --- | --- |
| 滤镜 | 奥林巴斯 |
| resource ID | `7361792068475325735` |
| package version | `3db90437187dd911b234766ef7297fe9` |
| 输入 | 同一张 854x480 真人静帧，重复 10 帧 |
| 首帧 mode | `3;1;2` |
| 后续 mode | `1` |
| 强度 | 显式 `intensity=1` |
| `EnableImageQuality` | `true` |
| `AlgorithmCacheFlag` | `9` |

测试模型目录故意同时放入两个 skin-seg 模型，并让 video model 的测试文件名排序在前：

| 模型 | 大小 | MD5 |
| --- | ---: | --- |
| video | `407541` | `cd5474732a4b56b7fffceba8a83d7c1e` |
| static v5.0 | `260961` | `2b5a3aed4a9a45a67b7febabe9247d6e` |

## 模型选择证据

两组运行时都发出相同请求：

```text
skin_seg/tt_skin_seg_v5.0.model
```

家族回退组实际加载：

```text
tt_skin_seg_00-video.model (family fallback)
report md5 cd5474732a4b56b7fffceba8a83d7c1e
```

精确组实际加载：

```text
tt_skin_seg_v5.0.model (exact filename)
report md5 2b5a3aed4a9a45a67b7febabe9247d6e
```

因此此前的“V2 主动选择 video model”并不准确：**V2 请求的是 static v5.0；探针的家族回调替换了实际文件。**

## mask 对比

两组均渲染 `10/10` 帧。仓库外的只读 hook 从 `SkinSegInfo` CPU fallback 读取每次 `224x128`、`28672` 字节的完整 mask。`/usr/bin/script` 会剥离 DYLD 注入变量，所以 mask 证据使用已编译探针直接启动；普通日志与最终帧另有带 PTY 的完整记录。

预热后的稳定 mask 对比：

| 指标 | 值 |
| --- | ---: |
| MAE | `11.727539` |
| RMSE | `33.061614` |
| 最大差值 | `250` |
| Pearson 相关 | `0.934179` |
| IoU，阈值 128 | `0.821854` |

模型切换明显改变了分割结果，不是日志层面的名义差异。

## 最终帧对比

预热后首个稳定帧与同尺寸剪映 UI 目标比较：

| 模型解析 | RGB RMSE | PSNR | SSIM | Delta E | 状态 |
| --- | ---: | ---: | ---: | ---: | --- |
| 家族回退到 video model | `1.813743` | `42.959291` | `0.995864` | `0.732991` | `close` |
| 精确 static v5.0 | `1.796547` | `43.042030` | `0.995639` | `0.759327` | `close` |

两组最终帧彼此为 `RMSE 2.343566 / PSNR 40.733260`。static model 把 UI PSNR 提高 `0.082739 dB`，RGB RMSE 只降低 `0.017196`。它方向正确，但幅度很小。

## 结论

本轮回答了当时的模型选择问题：**差异来自探针资源回调，不是 V2 自己把 static 请求改成 video。**
精确解析会显著改变 mask，但旧 `v5.0` 相对错误 video-family fallback 只轻微改善最终 UI 指标。后续
真实 UI 证据表明 UI 实际映射到 `v5.1`，所以这里不能推导“模型身份不是剩余约 `1.8` RGB RMSE 的
主因”；本轮没有比较 UI 真正使用的物理模型。

精确模式暂时保持 opt-in。要成为默认还需要验证连续视频、源切换和所有模型命名规则，不能仅凭这一张静帧改变产品行为。

仓库外完整证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  portrait-model-resolution/
```

其中包含两组日志、raw 输出、PNG、model symlink、mask、index 和 `metrics.json`；私有模型与二进制不进入 git。

## 后续验证结果

真实 UI / 独立 V2 的 `support_external_model_name` 对照进一步限定了本页结论：两边都以值 `3` 接受
相同逻辑请求 `skin_seg/tt_skin_seg_v5.0.model`，但 UI 的缓存 resolver 实际返回
`tt_skin_seg_v5.1_size100_md563b6...model`，exact-first finder 返回旧 `v5.0`。因此本页只证明
`v5.0` 优于错误的 video-family fallback，不能证明 UI 实际 `v5.1` 模型的贡献很小，也不能据此排除
模型映射为剩余误差主因。见 [support-external-model-name.zh.md](support-external-model-name.zh.md)。

后续对照把旧 v5.0 换成 UI 实际 v5.1 后，最终 RGB 从 `43.042030 dB` 变为 `48.888033 dB`，UI mask
IoU 从 `0.853549` 变为 `0.962409`，确认 resolver 是像素变量。但再下一轮发现 v5.1 候选在最终 staged
输出后才 CoreML ready；同一 v5.1 在受控 ready 后只有 `46.780337 dB`。因此本页“v5.0 只比 video
fallback 好一点”的旧数字仍不能评价 UI v5.1，旧 `5.846004 dB` 也不能全部当作 pure model 增益。
详见 [ui-physical-skin-model.zh.md](ui-physical-skin-model.zh.md) 与
[skin-seg-simd-ab.zh.md](skin-seg-simd-ab.zh.md)。

显式强度事件的单变量对照已经完成，见
`portrait-intensity-event.zh.md`。无参数与 `intensity=1` 的稳定输出逐字节一致，
因此它不能解释旧 V2 基线从 `31.412 dB` 到当前约 `43 dB` 的变化。

旧、新运行的差分随后确认主变量是 native buffer 第三个标志及其读回通道约定，
见 `mask-binding-fix.zh.md` 和 `portrait-intensity-event.zh.md`。旧 `31.412 dB`
数字属于错误 mask 绑定基线，不能再用于评价模型解析。
