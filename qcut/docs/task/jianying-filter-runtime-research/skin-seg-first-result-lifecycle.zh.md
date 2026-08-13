# 人像路径：首次分割结果的交付生命周期

记录时间：2026-08-11；2026-08-12 完成 re-seek 后续实验

## 单一问题

本轮只验证一个问题：一次 Swing V2 seek/render 已返回后，如果 ByteNN/CoreML backend 随后完成初始化，宿主不再调用
EffectSDK，仅等待并运行当前线程的 run loop，当前原地输入纹理和 CPU skin mask 是否会被异步改写。

结论是：**不会。** 当前纹理在等待前后逐字节一致，也没有额外 mask 交付。CoreML ready 只有在后续 seek
进入算法链时才被宿主观察到；即使 ready 日志出现在某次 seek 内，也可能已经晚于该帧消费算法结果的时点。

这个结论只回答独立 V2 宿主的首次结果交付，不等同于剪映 UI 已经与探针逐像素一致，也不覆盖真实导出路径。

## 探针边界

`filter-sequence` 新增默认关闭的诊断参数：

```text
JY_FILTER_POST_SEEK_DELAY_MS=<non-negative integer>
```

非零时，每一帧执行以下顺序：

1. 完成已有参数提交和最后一次 Swing seek/render；
2. renderer callback 返回；
3. 立即 readback 当前真正承载 V2 结果的第一张原地输入纹理；
4. 不调用 EffectSDK，在同一线程上运行 `NSRunLoop` 并等待指定时间；
5. 再次 readback 同一张纹理，报告变化字节数；
6. 写出第二次 readback 作为该帧输出。

等待值为 `0` 时没有额外 readback，旧路径保持不变。相关实现见
[graphics-probe.mm](../../../research/jianying-runtime-probe/graphics-probe.mm)、
[filter-probe.mm](../../../research/jianying-runtime-probe/filter-probe.mm) 和
[探针说明](../../../research/jianying-runtime-probe/README.md)。

CPU mask 仍由 UUID gated 的
[skin-seg-result-capture.cpp](probes/skin-seg-result-capture.cpp) 观察。每个有效输出按既有规则使用 capture
sequence `N+1`；preparation 内较早的 sequence `0` 单独保留，不把它错当成最终输出 mask。

### 作废的第一版等待协议

第一版把 `sleep` 放在 renderer callback 内。该做法会阻塞宿主调用栈和当前线程事件处理，无法区分“算法没有
完成”与“完成回调被我们堵住”，所以 `passive-wait-2000-sleep` 只保留为失败协议，不参与结论。

最终协议在 callback 返回后等待，并以同帧双 readback 直接判断纹理是否发生变化。

## 固定夹具

| 项目 | 固定值 |
| --- | --- |
| 滤镜 | 奥林巴斯 |
| resource ID | `7361792068475325735` |
| package version | `3db90437187dd911b234766ef7297fe9` |
| 输入 | 854x480、30 fps 无损 RGBA 人物帧 |
| physical skin model | UI resolver 使用的 v5.1 文件 |
| model MD5 | `63b6b4b76d30ec8e11c0e9fdfdc9a608` |
| update mode | preparation `3;1;2`，后续帧 `1` |
| native texture flags | `001` |
| feature 参数 | `{"intensity":1}` |
| AlgorithmCacheFlag / ExportMode | `9 / 0` |
| EnableImageQuality / float color | `1 / 0` |
| manager create option | `0` |
| parallel/async Swing | `1`，确认进入 V2 |
| SIMD | `1` |

五帧短清单是 preparation frame 1，随后直接使用 source frame 61-64。它故意缩短生命周期实验，但省略了
source frame 2-60，因此不能与 UI 的连续 70 帧历史做绝对 PSNR/MAE 对照。本轮只比较完全相同短清单下的
宿主状态。

## 实验组

| 组 | staged delay | post-seek wait | 观察到的 ready 时点 |
| --- | ---: | ---: | --- |
| `pre-ready` | 0 ms | 0 ms | preparation 输出后、下一次 seek 内 |
| `passive-wait-2000-runloop-5` | 0 ms | 2000 ms | 第一次等待结束后、下一次 seek 内 |
| `ready-before-final-seek` | 100 ms | 0 ms | preparation 的最终 seek 之前 |
| `same-frame-double-readback` | 0 ms | 2000 ms | 第一次等待结束后、下一次 seek 内 |
| `same-frame-final` | 0 ms | 2000 ms | 单帧进程的两秒等待内未报告 ready |

另外一次 `verification-passive-wait` 复跑中，ready 在 preparation 的最终 seek 内出现，而不是在它之前或
之后。这次自然竞态使后续四帧进入另一种历史状态，说明不能只按环境变量给运行贴标签，必须检查同一日志中的
ready 与 seek 顺序。

## 真实结果

### 同一帧没有异步纹理写回

五帧双 readback 组每一帧都报告：

```text
[filter] post-seek texture changed-bytes=0/1639680
```

也就是等待前后整张 854x480 RGBA 纹理的 `1,639,680` 个字节全部一致，连续五次均为零变化。最终代码的一帧
独立复跑再次得到 `0/1639680`，并成功渲染 `1/1`。

该单帧日志在 wait begin 与 wait end 之间明确出现 `ByteNN finish init with backend 10`，但没有出现
`skin_seg coreml is Ready!`。这将“后台 backend 没有完成”与“完成状态没有发布给当前算法帧”区分开来。

这一帧最终 RGBA 与原 `pre-ready` 输出逐字节一致；两张 preparation mask 也分别逐字节一致。两秒等待期间
没有新增 mask 文件：单帧运行始终只有 sequence `0` 与 `1`。

### 被动等待不改变五帧结果树

原 `pre-ready` 与 `passive-wait-2000-runloop-5` 的结果为：

| 比较 | 结果 |
| --- | --- |
| 5 张 RGBA | `0/5` 不同，全部逐字节一致 |
| 6 张原生 mask | `0/6` 不同，全部逐字节一致 |
| RGBA 内容树 | 两组均为 `c30643044b5673f4da62200bb8c414a6da86f0070cf60bdc21e0727a197b0d01` |
| mask 内容树 | 两组均为 `1a04fdf6088c80a0dedb6d915d61538f612a02926f5c86e6de61cc0cbe3934e9` |

加入同帧第一次 readback 后，`same-frame-double-readback` 的 5 张 RGBA 和 6 张 mask 仍与原 passive-wait
组全部逐字节一致，说明诊断 readback 本身没有改变最终结果。

### ready 在最终 seek 前会产生另一种状态

`ready-before-final-seek` 与 `pre-ready` 使用相同模型、SIMD、包、输入和参数，仅在 preparation staged seeks
间等待 100 ms，使 ready 明确发生在最终 seek 之前：

| 比较 | 结果 |
| --- | --- |
| 5 张 RGBA | `5/5` 不同 |
| 6 张原生 mask | `5/6` 不同；较早的 sequence `0` 不变，最终 sequence `1-5` 均改变 |
| RGB 直接差值 | MAE `0.325913`，RMSE `1.295456`，最大差 `27` |
| 原生 mask 直接差值 | MAE `3.988804`，RMSE `16.059495`，最大差 `240` |
| Alpha | 全部逐字节一致 |

ready-before-final-seek 的 RGBA 和 mask 内容树分别为
`b3569c3cb18851366f3e402968e84f5ead16eaea07983e6f78e85b3eda8173a5` 与
`5b2d93d98ef5b083cec3c565e38705aff0c60030f626be2a9a57e20b1a8e8077`。

这些是两种生命周期状态之间的直接差值，不是对 UI 的精度评价。短清单没有完整时序历史，因此本轮撤回并
不引用基于该短清单计算的 UI PSNR/MAE。

## 结论

本轮排除了“模型在后台 ready 后，会在没有下一次 seek 的情况下自动改写当前 V2 纹理或再交付一张 mask”这一
假设。仅等待、泵 run loop 和 GPU readback 都不会让当前帧追上 ready 状态。

更准确的宿主模型是：

- 当前 seek 消费当时可见的算法状态并返回一张确定纹理；
- 后台初始化可以继续，但完成状态需要后续 seek 才被算法图观察和消费；
- ready 日志在 seek 内出现，也不证明该 seek 已使用新结果；
- 首次结果进入的时点会改变后续 mask 历史，所以后续帧差异不能归因于 SIMD 或简单等待时间。

这解决了“被动等待是否足够”的问题，但尚未证明独立宿主应采用哪一种恢复动作。

## ready 后同 timestamp re-seek 结果

后续实验已完成。`JY_RESEEK_AFTER_READY=1` 默认关闭；启用时先完整执行 manifest，再保持同一 manager、
AlgorithmService、线程和 GL context，对第一张输入以 timestamp `0`、update mode `1` 重新 seek。结论必须以
同一日志中 `skin_seg coreml is Ready!` 出现在 re-seek marker 前为准。

静态历史下，两次独立复跑的最终 RGBA 逐字节一致，SHA-256 都为
`aa58c13edb92d6a17e2bca1b108ea61eed96c02d857b7d41c818885362996e72`。与 UI 比较得到：

| 指标 | pre-ready 最终 mask | ready 后 re-seek |
| --- | ---: | ---: |
| mask MAE | 4.056598 | 3.276394 |
| mask IoU@128 | 0.943612 | 0.962641 |
| RGB RMSE / PSNR | 不作同强度对照 | 0.916513 / 48.888033 dB |

re-seek 确实交付了另一张 mask；它与较早的稳定 sequence 逐字节一致，而不是异步改写旧纹理。preparation
首帧在 `intensity=1` 事件前完成，因此其 RGB 不参与 readiness 增益归因。

动态历史下，同一 manager 先处理 60 张静态帧和 10 张运动帧再回到 timestamp `0`。两次复跑仍逐字节一致，
但结果降为 `40.140233 dB / mask IoU 0.265185`；最终 RGBA SHA-256 都为
`97a7da52d9e5ab5bdbad83c5f928e613c98a5a60e0c884709b4348f74782ae70`。这排除了随机竞态，并证明同
timestamp re-seek 不会自动清除时序分割历史。

宿主恢复规则由此闭合：连续 clip 保持 manager；source/clip 变化或向后时间跳转时重建 manager 与
AlgorithmService。既有 source-switch 实验已经证明 manager reset 后从目标首帧起逐字节等于 fresh process，
不需要把 reset 混入本轮单变量结果。完整对标见
[olympus-portrait-filter-e2e.zh.md](olympus-portrait-filter-e2e.zh.md)。

## 仓库外证据

证据根目录：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/first-result-lifecycle
```

| 证据 | SHA-256 |
| --- | --- |
| 单帧 manifest | `13eeb980201adcba908a9494bea87336be8d36ac50befe48eddc22a9abdfa43d` |
| 五帧 manifest | `6953f519ef2c4e5da7c2487dff2225103f7685d8d8b018874ee1a9eefa285380` |
| pre-ready log | `3a02a408bb2b33fe8272bc967f25474f8db8cc10aca40e4d90fb9037eadef52c` |
| passive-wait log | `f4150630ec17c57ac0b8ca71226d14894cf8dec592d1cbb6aadd9eb625d9c343` |
| ready-before-final-seek log | `a4c6cb5bea054b4f9e3d6378309a141a57a54a2f865b7e08e319e73af10baf3d` |
| 五帧同帧双读 log | `e0eec9e4145a7c9df3c95d6eb694e239de3a8bf2cdbc578e25dd7098ce47b2a1` |
| 最终单帧双读 log | `4afebbbb2c36adb7663a36b2ed4af0e540a256fd1d62d9606d33d23d1b878ac1` |
| 直接差值 JSON | `4fe41699cdd1be3f2d04f69327ac7a2dce3ccd2bba37fa88e96bd9a27860842e` |
| `-Werror` 最终构建日志 | `135d48d9aaecdbb22c01fa77d48793deb9f265700a7642619c0cc0b89405c43f` |

模型、效果包、输入、原始输出、mask、日志和编译产物均保留在仓库外。仓库只保存自有探针、哈希、指标与结论。
