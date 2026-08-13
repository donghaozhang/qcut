# 7 张双 LUT 人像滤镜真实视频 E2E

记录时间：2026-08-13

## 结论

奥林巴斯、青灰、冷月夜、橙蓝、亮肤、森山、雾野已经完成真实连续视频批处理，不再使用同一张图片平移冒充视频。每张卡都通过以下检查：

- 读取 `854x480 / 30 fps` 的 70 张连续视频帧；
- 最后 10 帧包含真实人物运动，7 对 source 相邻帧越过运动阈值；
- 对应 7 对 native mask 相邻帧都发生变化；
- 素材 A -> B 后的 RGBA 和 mask 与 fresh-B session 逐字节一致；
- 导出 H.264 为 `854x480 / 30 fps / 70 帧 / 2.333333 秒`；
- 相对剪映 UI 的 `maskEdgeMae` 门禁为 `verified <= 0.02`、`close <= 0.08`，超过 `0.08` 时脚本直接失败。

奥林巴斯达到 `verified`。其余六张达到 `close`，不能写成逐像素一致。

## 两组严格时间线

UI mask manifest 会绑定 source 文件 SHA-256、宽高、帧数和算法图 SHA-256。这样可以拒绝“UI mask 来自 A 素材，但 native mask 来自 B 素材”的无效比较。

### 奥林巴斯

- source：无缩放 ProRes 时间线前 70 帧封装成无损 FFV1；
- source SHA-256：`82368440b756da91aa081b4851b2b7a7c2a161d62a602a34b7db77aa22f31234`；
- reference：剪映 UI 直接读回的 70 帧 skin mask；
- reference SHA-256：`373b33605a9cb0cb55630316e640dbfe081d537a0bfa7c67439ca15a13bfe424`。

### 青灰及共享算法图的六张卡

青灰、冷月夜、橙蓝、亮肤、森山、雾野的 `algorithmConfig.json` 规范化 SHA-256 相同；在本次 70 帧输入上，六张卡的 native mask 也逐字节相同。各卡不同的是背景 LUT 和人物 LUT，不是 segmentation graph。因此只从青灰 UI 导出反推一次共享 UI mask，再按算法图复用到另外五张。

- source：与青灰 UI 导出对应的 HEVC 基准时间线前 70 帧，无损封装为 FFV1；
- source SHA-256：`cd3616e1633176e578e356500630c46a410b14647750642d2af10f3693c197c6`；
- 青灰 UI 导出 SHA-256：`f732491464d1d186f973302499a7d6ec309cdb17018374ea988c51a297b8bf1c`；
- shared UI mask SHA-256：`86f8b2a7689116ef270c56362eab9bff1d842051d71c567af4bb257c4648a62a`；
- 双 LUT 重建 RGB RMSE：`1.846467 / 255`；
- 可辨识 LUT 差异的像素覆盖率：`0.612580`。

反推方法先在独立的奥林巴斯无缩放时间线上校准。相对直接 UI mask 的结果为 `maskMae=0.023626`、`maskEdgeMae=0.040906`、相关系数 `0.990049`；门禁要求 `maskMae <= 0.03` 且相关系数 `>= 0.98`。校准时间线与青灰目标时间线分离，避免编码或缩放错配污染结论。

## 逐卡结果

| 滤镜 | UI mask 状态 | `maskEdgeMae` | source 运动对 | mask 变化对 | A -> B RGBA / mask | 导出帧数 |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| 奥林巴斯 | verified | 0.013262 | 7 | 7 | exact / exact | 70 |
| 青灰 | close | 0.075152 | 7 | 7 | exact / exact | 70 |
| 冷月夜 | close | 0.075152 | 7 | 7 | exact / exact | 70 |
| 橙蓝 | close | 0.075152 | 7 | 7 | exact / exact | 70 |
| 亮肤 | close | 0.075152 | 7 | 7 | exact / exact | 70 |
| 森山 | close | 0.075152 | 7 | 7 | exact / exact | 70 |
| 雾野 | close | 0.075152 | 7 | 7 | exact / exact | 70 |

六张共享卡的 `maskEdgeMae` 相同是算法图和 raw mask 相同的结果，不是把一张卡的数值人工复制到六张。每张卡仍分别初始化、处理 70 帧、切换素材并导出自己的视频。

## 实现门禁

`run-native-dual-lut.ts` 支持 `--resource-ids`，允许把不同 source SHA 的算法图拆成独立运行。每张卡会执行：

1. 解码并验证真实视频存在运动；
2. 在同一 native session 中顺序渲染 70 帧；
3. 校验人物运动窗口内 mask 确实变化；
4. 以 fresh-B session 为 oracle 验证素材切换 reset；
5. 写出并用 FFprobe 核验固定帧数视频；
6. 按 manifest 中的算法图选择 UI mask，执行半像素双线性放大和方向判定；
7. 对 `maskEdgeMae > 0.08` 的卡直接报错。

`build-dual-lut-ui-mask-manifest.ts` 有两种互斥模式：直接 UI mask 和经过独立 direct-mask 校准的 UI 输出反推。manifest 不接受 source SHA、尺寸或帧数不一致的运行。

## 仓库外证据

| 证据 | SHA-256 |
| --- | --- |
| 奥林巴斯最终 E2E 报告 | `7277bfbd98a0fd3ff65a7fe588dec1af3e335d5223f927327c6912453c4621b8` |
| 共享六卡最终 E2E 报告 | `2aa6e6dc1223085edca13fe934681c16535d6a10f26ac0a3e9835d45fca01632` |
| 奥林巴斯 direct manifest 构建报告 | `817cceb454db935af0046f1f412761b421918545b8edc7680ca3f7258d762a90` |
| 共享六卡 calibrated manifest 构建报告 | `d974565fe142218a9375ea4a552fb965759eded4e068ff815bee94a5827bef5a` |

证据根目录为 `~/Library/Application Support/QCut/Research/JianyingFilter/native-dual-lut-real-video/2026-08-13/`。剪映二进制、模型、效果包、LUT、输入、mask 和导出视频都保留在 Git 之外。

## 准确边界

这轮补齐了 7 张卡的连续帧、人物移动、mask 边缘、素材切换和导出 E2E。它证明本机二进制路径可稳定运行，并量化了 segmentation 边缘差距。

它没有证明六张共享卡已经完美复刻：`0.075152` 只达到 close，且共享 reference 是从青灰 UI 输出反推，不是六张卡各自直接读回 UI mask。若要把六张升级为 verified，下一步应优先缩小共享 segmentation 的边缘和羽化差异，而不是重复导出五套相同算法图的 UI mask。
