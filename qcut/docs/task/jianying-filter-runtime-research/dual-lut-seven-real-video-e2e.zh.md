# 7 张双 LUT 人像滤镜真实视频 E2E

记录时间：2026-08-13

## 结论

奥林巴斯、青灰、冷月夜、橙蓝、亮肤、森山、雾野已经完成真实连续视频批处理，不再使用同一张图片平移冒充视频。每张卡都通过以下检查：

- 读取 `854x480 / 30 fps` 的 70 张连续视频帧；
- 最后 10 帧包含真实人物运动，7 对 source 相邻帧越过运动阈值；
- 对应 7 对 native mask 相邻帧都发生变化；
- 素材 A -> B 后的 RGBA 和 mask 与 fresh-B session 逐字节一致；
- 导出 H.264 为 `854x480 / 30 fps / 70 帧 / 2.333333 秒`；
- 相对剪映 UI 的 `maskEdgeMae` 门禁为 `verified <= 0.02`、`close <= 0.08`；严格模式超过 `0.08` 时失败，证据模式仍写完整报告并标记 `uiMaskGatePassed=false`。

奥林巴斯达到 `verified`；青灰、冷月夜、亮肤达到 `close`；橙蓝、森山、雾野为 `unverified`。七张都完成了逐卡对照，但只有一张通过 verified 门禁。

## 目标验收

| 目标 | 完成度 | 权威证据 |
| --- | ---: | --- |
| 真实连续视频 | 7 / 7 | 每张 native 报告均绑定 70 帧真实视频 source |
| 真实人物运动逐卡验证 | 7 / 7 | 每张 source 与 mask 均有 7 对运动帧 |
| `maskEdgeMae` 剪映 UI 对照 | 7 / 7 | 1 个直接 UI mask + 6 个逐卡 UI 视频反推 mask |
| A -> B 素材切换 | 7 / 7 | 每张 RGBA 与 mask 均逐字节等于 fresh-B |
| Electron 产品预览 | 7 / 7 | 每张均保存预览截图并与本机 provider RGBA 对照 |
| 真实视频导出 | 7 / 7 | native 为 70 帧；产品为 30 帧、1 秒 H.264 |
| 剪映 UI 逐卡对标 | 7 / 7 | 每张使用独立 reference，未通过门禁者保留失败状态 |

## 两组严格时间线

UI mask manifest 会绑定 source 文件 SHA-256、宽高、帧数和算法图 SHA-256。这样可以拒绝“UI mask 来自 A 素材，但 native mask 来自 B 素材”的无效比较。

### 奥林巴斯

- source：无缩放 ProRes 时间线前 70 帧封装成无损 FFV1；
- source SHA-256：`82368440b756da91aa081b4851b2b7a7c2a161d62a602a34b7db77aa22f31234`；
- reference：剪映 UI 直接读回的 70 帧 skin mask；
- reference SHA-256：`373b33605a9cb0cb55630316e640dbfe081d537a0bfa7c67439ca15a13bfe424`。

### 其余六张卡

青灰、冷月夜、橙蓝、亮肤、森山、雾野的 `algorithmConfig.json` 规范化 SHA-256 相同；在本次 70 帧输入上，六张卡的 native mask 也逐字节相同。但不能据此假设剪映 UI 为六张卡绑定了相同的 mask 状态。旧报告复用青灰 UI mask，导致六张得到完全相同的 `0.075152`；本轮撤回这个逐卡结论，改为从每张卡自己的剪映 UI 视频独立反推 mask。

- source：与青灰 UI 导出对应的 HEVC 基准时间线前 70 帧，无损封装为 FFV1；
- source SHA-256：`cd3616e1633176e578e356500630c46a410b14647750642d2af10f3693c197c6`；
- 青灰、冷月夜、橙蓝、亮肤、森山、雾野 UI 导出 SHA-256 分别为 `f7324914...bf1c`、`bf9175ed...6053`、`4a299d2f...c9dc`、`3aba51ba...1748`、`9951f30e...5143`、`91590a82...b3cc`；
- 各卡双 LUT 重建 RGB RMSE 分别为 `1.846467`、`1.877149`、`1.911829`、`1.574561`、`5.158150`、`1.737290 / 255`，全部低于 `8` 的反推有效门限；
- 可辨识 LUT 差异的像素覆盖率分别为 `0.612580`、`0.941357`、`0.859082`、`0.610739`、`0.385203`、`0.835501`。

反推方法先在独立的奥林巴斯无缩放时间线上校准。相对直接 UI mask 的结果为 `maskMae=0.023626`、`maskEdgeMae=0.040906`、相关系数 `0.990049`；门禁要求 `maskMae <= 0.03` 且相关系数 `>= 0.98`。校准时间线与青灰目标时间线分离，避免编码或缩放错配污染结论。

## 逐卡结果

| 滤镜 | UI mask 状态 | `maskEdgeMae` | source 运动对 | mask 变化对 | A -> B RGBA / mask | 导出帧数 |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| 奥林巴斯 | verified | 0.013262 | 7 | 7 | exact / exact | 70 |
| 青灰 | close | 0.075152 | 7 | 7 | exact / exact | 70 |
| 冷月夜 | close | 0.059560 | 7 | 7 | exact / exact | 70 |
| 橙蓝 | unverified | 0.113760 | 7 | 7 | exact / exact | 70 |
| 亮肤 | close | 0.079349 | 7 | 7 | exact / exact | 70 |
| 森山 | unverified | 0.220857 | 7 | 7 | exact / exact | 70 |
| 雾野 | unverified | 0.096268 | 7 | 7 | exact / exact | 70 |

每张卡分别初始化、处理 70 帧、切换素材、导出视频，并选择自己的 UI mask reference。三张 `unverified` 表示测试完成但没有通过 close 门禁，不等于执行失败。

## 实现门禁

`run-native-dual-lut.ts` 支持 `--resource-ids`，允许把不同 source SHA 的算法图拆成独立运行。每张卡会执行：

1. 解码并验证真实视频存在运动；
2. 在同一 native session 中顺序渲染 70 帧；
3. 校验人物运动窗口内 mask 确实变化；
4. 以 fresh-B session 为 oracle 验证素材切换 reset；
5. 写出并用 FFprobe 核验固定帧数视频；
6. 按 manifest 中的算法图选择 UI mask，执行半像素双线性放大和方向判定；
7. 默认对 `maskEdgeMae > 0.08` 的卡报错；显式 `--allow-unverified-ui-mask` 时继续完成其余证据并在报告中写入失败状态。

`build-dual-lut-ui-mask-manifest.ts` 有两种互斥模式：直接 UI mask 和经过独立 direct-mask 校准的 UI 输出反推。manifest 不接受 source SHA、尺寸或帧数不一致的运行。

## 仓库外证据

| 证据 | SHA-256 |
| --- | --- |
| 奥林巴斯最终 E2E 报告 | `7277bfbd98a0fd3ff65a7fe588dec1af3e335d5223f927327c6912453c4621b8` |
| 青灰 / 冷月夜 / 橙蓝逐卡报告 | `3ef9c3fc1cc38c634e222363fadf6d45a6e36eedda6939eb05cde6cd86af8f04` / `0950f96a8b675d59635905658cc910f03d9f64fd800cec7ca147f724218340ee` / `b1c4b27ef54ac65928d27f23e8b47fa27448b18b8bf6069410470a6dad919656` |
| 亮肤 / 森山 / 雾野逐卡报告 | `2b2451faf2fa36372cce0089570fc9d6184ec3d267c4ed2c932e76e650475f70` / `0840f169a9e2c8b89453a1dcd07b7b2df0ec698c9392ecd50da1e160ae471e33` / `04b48f5d9118db81c6947ef987e96b9c801d38b53befc477347f4f3b327af5cf` |
| 奥林巴斯 direct manifest 构建报告 | `817cceb454db935af0046f1f412761b421918545b8edc7680ca3f7258d762a90` |
| 青灰 / 冷月夜 / 橙蓝 manifest 构建报告 | `16f41fcd818ac214949a752021d50a748868bf4b93d9bcdb12b9352e738091e4` / `90754f24b5e2cec47f8caf05febae486191d9e8c15f117349ea066531ecf5791` / `7d476ad8021537499e308e4a34d963c7a44407322082b0edd1208e825efeb327` |
| 亮肤 / 森山 / 雾野 manifest 构建报告 | `6680249dd05321a097d11db793357784100d7942363edb64e19522a7058978ad` / `9bf1dced010f5e9e4961178429cf44ce9bdbd275c646bf97266fe6d4121617d4` / `8c02c9fd6261a16647e6dd35686ddb23cb26c87b16aae6b3d659fca2f4ac5677` |
| Electron 七张预览与导出清单 | `75444956dae70a4f1a2562b7a4ae2e044dde669c416edffe1855670903ce7864` |

证据根目录为 `~/Library/Application Support/QCut/Research/JianyingFilter/native-dual-lut-real-video/2026-08-13/`。剪映二进制、模型、效果包、LUT、输入、mask 和导出视频都保留在 Git 之外。

## 准确边界

这轮补齐了 7 张卡的连续帧、人物移动、逐卡 mask 边缘、素材切换和导出 E2E。它证明本机二进制路径可稳定运行，并量化了每张卡的 segmentation 边缘差距。

它没有证明七张都已完美复刻。青灰、冷月夜、亮肤只达到 close，橙蓝、森山、雾野尚未达到 close。下一步应先解释三张卡为何在相同 native raw mask 下呈现不同 UI mask，再缩小边缘、羽化或每卡宿主配置差异。
