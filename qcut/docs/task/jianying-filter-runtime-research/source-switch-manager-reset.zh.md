# 素材切换：manager reset 单变量验证

记录时间：2026-08-11

## 单一问题

本轮只验证一个问题：同一 Swing V2 宿主先处理人物 A、再处理无人物灰底、最后切到不同人物 B 时，
旧素材的分割历史会不会污染 B；如果会，重建 manager 及其 `AlgorithmService` 能否从 B 的第一帧起
恢复到新进程基线。

本轮不调整模型、update-mode、滤镜强度或纹理标志，也不从最终 RGB 反推羽化参数。

## 三组输入

| 组别 | 序列 | B 边界操作 |
| --- | --- | --- |
| continuous | A x3 -> gray x5 -> B x10 | 无 reset |
| manager-reset | A x3 -> gray x5 -> B x10 | 第一张 B 前重建 manager |
| fresh-B | B x10 | 新进程直接处理 B |

A 是单人红毯近景，B 是灰墙前的三人舞蹈画面，两者不是同一人物或同一构图。这样可以排除此前
“返回同一张 A”只命中了输入缓存的解释。

## 固定条件

| 项目 | 值 |
| --- | --- |
| 滤镜 | 奥林巴斯 |
| resource ID | `7361792068475325735` |
| 输入尺寸 | `854x480` RGBA |
| skin-seg model | 精确 `tt_skin_seg_v5.0.model` |
| model MD5 | `2b5a3aed4a9a45a67b7febabe9247d6e` |
| native texture flags | `001` |
| `EnableImageQuality` | `true` |
| `AlgorithmCacheFlag` | `9` |
| `ExportMode` | `false` |
| 首个 A 的 mode | `3;1;2` |
| 其余帧的 mode | `1` |

三组中唯一有意义的变量是 B 之前是否重建 manager。fresh-B 是独立的目标基线。

## 逐帧结果

三组分别成功渲染 `18/18`、`18/18` 和 `10/10` 帧。将长序列中的 B00-B09 与 fresh-B 的
B00-B09 对齐后：

| 对比 | 不同帧数 | 相同帧数 |
| --- | ---: | ---: |
| continuous B vs fresh-B | `10` | `0` |
| manager-reset B vs fresh-B | `0` | `10` |

第一张 B 的 raw SHA-256：

```text
continuous     740d0fe926321a0445796d180092f178c8ba6d9ca30abfa943dc841aecbffee4
manager-reset  6e19fa3ef8c954fa7e7eedcb5d03ff7b355ceeb880ba5cdda80e82a6096dcbd9
fresh-B        6e19fa3ef8c954fa7e7eedcb5d03ff7b355ceeb880ba5cdda80e82a6096dcbd9
```

PNG RGB 指标也给出同一结论：

| 帧 | 对比 | RGB RMSE | PSNR | SSIM | Delta E |
| --- | --- | ---: | ---: | ---: | ---: |
| B00 | continuous vs fresh-B | `2.758818` | `39.316342 dB` | `0.998552` | `0.526787` |
| B09 | continuous vs fresh-B | `2.758818` | `39.316342 dB` | `0.998552` | `0.526787` |
| B00 | manager-reset vs fresh-B | `0` | `100 dB` | `1` | `0` |
| B09 | manager-reset vs fresh-B | `0` | `100 dB` | `1` | `0` |

continuous 的 B00 和 B09 误差完全相同，说明旧状态不是一两帧后自然收敛的简单预热；至少在本轮
十张重复 B 中，它持续存在。manager reset 则不是“逐渐接近”，而是从第一张 B 起逐字节恢复 fresh-B。

## 结论

独立 V2 宿主的分割状态确实跨素材保留。只在同一 manager 上换输入纹理不够，连续十帧也不会自动
恢复。当前经过验证的 clip/source 边界策略是：销毁并重建 manager、`AlgorithmService`、video segment
和 feature，然后再处理新素材。

这个结论解决的是独立宿主的生命周期正确性，不等于证明剪映 UI 在每个切点也销毁 manager。若后续
能捕获 UI 的更窄 reset API，可以再缩小重建范围；在此之前，manager reset 是唯一达到逐字节新进程
基线的方案。

仓库外完整证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/source-switch/
  continuous/
  manager-reset/
  fresh-b/
  inputs/
```

私有模型、效果包、raw 帧和运行日志不进入 git。

