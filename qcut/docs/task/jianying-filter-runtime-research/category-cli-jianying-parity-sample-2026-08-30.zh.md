# QCut 滤镜 CLI 与剪映分类抽样对比（2026-08-30）

## 结论

- QCut CLI 功能成功：**23/23**。
- 量化门禁：**verified 4 / close 12 / unverified 7**。
- 本轮按实现类型抽样：单 LUT、双 LUT、Shader、Face AI 各 5 张；人脸区域 LUT 目录仅 3 张，因此全测。
- 目录另有 2 张 `unknown` 实现，因没有可运行分类而排除，作为 catalog gap 记录。
- CLI 成功只证明滤镜可调用，不等于与剪映逐像素一致。

## 测试约束

```bash
QCUT_JIANYING_DISABLE_APP_BUNDLE=1 \
QCUT_JIANYING_DISABLE_USER_CACHE=1 \
qcut filter-lab render \
  --resource-id <id> \
  -i <input> \
  --output <output> \
  --filter-intensity 100 \
  --force \
  --json
```

两个环境变量强制 QCut 使用自己的私有离线快照，不读取剪映 App Bundle 或剪映用户缓存。所有滤镜强度为 100；视频样本为 1 秒、30 fps。

## 分类汇总

| 实现类别 | 样本 | CLI | Verified | Close | Unverified | 平均 RMSE | 平均 SSIM | 平均 DeltaE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 单 LUT | 5 | 5/5 | 0 | 5 | 0 | 1.5782 | 0.998289 | 0.9230 |
| 双 LUT | 5 | 5/5 | 0 | 1 | 4 | 6.2530 | 0.903664 | 2.7618 |
| Shader | 5 | 5/5 | 4 | 1 | 0 | 0.7132 | 0.997337 | 0.4395 |
| Face AI | 5 | 5/5 | 0 | 3 | 2 | 3.9365 | 0.980890 | 2.0422 |
| 人脸区域 LUT | 3 | 3/3 | 0 | 2 | 1 | 2.2672 | 0.979919 | 1.5630 |

## 逐张结果

### 单 LUT

| 滤镜 | Resource ID | Backend | 门禁 | RMSE | SSIM | DeltaE |
|---|---|---|---|---:|---:|---:|
| 晴朗增蓝 | `7644886476886478116` | `ffmpeg-lut` | close | 1.7564 | 0.998507 | 1.0194 |
| 情绪大片 | `7650536865895894282` | `ffmpeg-lut` | close | 1.4951 | 0.997976 | 0.8641 |
| 海边大片 | `7633097495257550131` | `ffmpeg-lut` | close | 1.4544 | 0.998453 | 0.8607 |
| 通透暖食 | `7409674549467352374` | `ffmpeg-lut` | close | 1.7764 | 0.998054 | 1.0356 |
| 富士XT5 | `7535108076081335606` | `ffmpeg-lut` | close | 1.4085 | 0.998457 | 0.8352 |

### 双 LUT

| 滤镜 | Resource ID | Backend | 门禁 | RMSE | SSIM | DeltaE |
|---|---|---|---|---:|---:|---:|
| 青灰 | `7127671508264078599` | `jianying-native-swing` | close | 2.5615 | 0.984025 | 1.5583 |
| 冷月夜 | `7281165355353951543` | `jianying-native-swing` | unverified | 2.7768 | 0.978703 | 1.6550 |
| 亮肤 | `7127655008715230495` | `jianying-native-swing` | unverified | 10.7496 | 0.829648 | 6.2437 |
| 橙蓝 | `7127561047048850718` | `jianying-native-swing` | unverified | 2.8806 | 0.979893 | 1.7796 |
| 森山 | `7242215081663008056` | `jianying-native-swing` | unverified | 12.2962 | 0.746052 | 2.5724 |

### Shader

| 滤镜 | Resource ID | Backend | 门禁 | RMSE | SSIM | DeltaE |
|---|---|---|---|---:|---:|---:|
| 清透美食 | `7403664041945681191` | `jianying-native-multi-pass` | verified | 0.0053 | 1.000000 | 0.0000 |
| 暗角旧影 | `7647099764940557618` | `jianying-native-multi-pass` | verified | 0.3844 | 0.999127 | 0.1609 |
| 迷雾 | `7160594413847203085` | `jianying-native-multi-pass` | verified | 0.0000 | 1.000000 | 0.0000 |
| 电影柔光 | `7447126702137904420` | `jianying-native-multi-pass` | verified | 0.8927 | 0.998524 | 0.5091 |
| 摩登 | `7131219052021779719` | `jianying-native-swing` | close | 2.2838 | 0.989034 | 1.5273 |

### Face AI

| 滤镜 | Resource ID | Backend | 门禁 | RMSE | SSIM | DeltaE |
|---|---|---|---|---:|---:|---:|
| 小麦肌 | `7131507906737917220` | `jianying-native-swing` | close | 2.3437 | 0.990166 | 1.4081 |
| 蒸汽机 | `7232220370667883837` | `jianying-native-swing` | close | 2.6749 | 0.982557 | 1.5735 |
| 丝滑皮肤 | `7495673180904885516` | `jianying-native-swing` | unverified | 9.5680 | 0.983626 | 3.8159 |
| 春日樱 | `7493076668009958668` | `jianying-native-swing` | close | 2.6633 | 0.989775 | 1.9391 |
| 聚焦 | `7320428711487098153` | `jianying-native-swing` | unverified | 2.4326 | 0.958326 | 1.4744 |

### 人脸区域 LUT

| 滤镜 | Resource ID | Backend | 门禁 | RMSE | SSIM | DeltaE |
|---|---|---|---|---:|---:|---:|
| 焕肤 | `7127674287238008078` | `jianying-native-face-region` | unverified | 2.3025 | 0.967576 | 1.6187 |
| 裸粉 | `7127671519450303775` | `jianying-native-face-region` | close | 2.2699 | 0.989091 | 1.5672 |
| 净透 | `7127666004477414687` | `jianying-native-face-region` | close | 2.2294 | 0.983091 | 1.5032 |

## 证据

本机完整证据位于：

```text
/Users/peter/Downloads/QCut-Filter-Category-Parity-2026-08-30
```

其中包括：

- `logs/qcut-run-results.json`：23 次 CLI 的原始 stdout/stderr、耗时和输出字节数。
- `logs/verify-existing-results.json`：14 张已有剪映 UI 参考的门禁结果。
- `logs/verify-new-ui-results.json`：9 张本轮剪映 UI 实机导出的门禁结果。
- `comparisons/*-contact-sheet.png`：原图、剪映、QCut、8 倍绝对差异四方对照。
- `jianying/nine-filter-jianying-ui.mov`：9 段剪映 UI 滤镜时间线导出。
- `jianying/focus-7320428711487098153-jianying-ui.mov`：同名卡纠正后的目标 `聚焦` UI 导出。

完整性检查结果：23 个 CLI 输出、23 个参考、23 个候选和 23 个对照图全部存在且非空。证据目录共 122 个文件、约 112 MB。

## 已知限制

- 本轮新增的 9 张剪映参考来自真实剪映 UI，但导出为 H.264 8-bit `yuv420p bt709`；指标包含编码以及 RGB/YUV 往返误差。
- 四张既有 Shader 参考使用 PNG 或高质量视频帧，是本批最强的逐像素证据；其中 4/5 通过 verified。
- 双 LUT 的 `亮肤`、`森山`，Face AI 的 `丝滑皮肤`、`聚焦`，以及人脸区域 LUT 的 `焕肤` 仍需继续对齐人像 mask、模型配置或颜色路径。
- `聚焦` 存在同名卡。本报告使用资源 ID `7320428711487098153` 对应的黄衣女子封面卡重新导出；错误同名参考的 RMSE 为 `16.9297`，纠正后降至 `2.4326`。

## 下一轮诊断顺序

1. `森山`：先验证剪映和 QCut 是否使用同一资源包、同一强度、同一 skin mask 输入。
2. `亮肤`：拆分背景 LUT、皮肤 LUT、mask 三个分量，分别与剪映对照。
3. `丝滑皮肤`：确认它是否还包含磨皮或额外 Face AI pass，而不是纯双 LUT。
4. `聚焦`：在正确同名卡基础上定位低 SSIM 是否集中在人脸区域或压缩边缘。
5. `焕肤`：检查 face-region mask 的范围、羽化与颜色混合权重。
