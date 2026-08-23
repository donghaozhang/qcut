# 美颜美体 UI 与剪映本机二进制 E2E

日期：2026-08-23

## 结论

QCut 的 `画面 -> 美颜美体` 已补成可用面板，并接入真实剪映本机运行时。它不是 CSS、Canvas 几何近似，也不是只保存数值的占位 UI。剪映应用无需启动；运行库、模型、效果包和本轮接入的美妆卡均可从 QCut 私有快照离线解析。

本轮完成：

- 4 个一级页签：美颜、美体、美颜预设、美体预设。
- 4 个美颜二级页签：皮肤、脸型、五官、美妆。
- 72 个真实数值参数，其中美颜 62 个、美体 10 个。
- 8 个真实运行包：磨皮、眼部精修、肤色、牙齿、脸型、五官、美妆宿主、美体。
- 12 个美妆分类、15 张真实缓存卡片和真实缩略图。
- 全部人脸与人脸 1 至人脸 10 的目标选择；目标 ID 会传给原生效果参数。
- 美颜与美体预设分别保存、应用和删除。美颜预设同时保存人脸目标与美妆选择，应用其中一类不会覆盖另一类参数。
- UI 状态持久化到 `MediaElement.portraitAdjustments`；项目快照会严格校验数值键、人脸目标、美妆分类、卡片 ID 和强度。
- 预览通过 Electron IPC 调用持久化原生宿主；导出复用同一原生渲染入口。
- 多个能力同时启用时，按 `smooth -> eye-details -> skin-tone -> teeth -> face -> features -> standalone makeup -> dynamic makeup -> body` 组合原生阶段。

## UI 对照

参考剪映截图中的结构，QCut 已实现：

| 剪映区域 | QCut 状态 |
|---|---|
| 美颜 / 美体 / 美颜预设 / 美体预设 | 已接 UI 与状态 |
| 皮肤管理 | 已接磨皮、肤色、冷暖、亮眼、淡化眼袋、淡化法令纹、美白牙齿 |
| 脸型 | 已接瘦脸、窄脸、V 脸、下颌、颧骨、下巴、额头、发际线、上中下庭等 |
| 五官精修 | 已按常用、眼睛、鼻子、嘴唇、眉毛、精修分组，全部调用真实参数 |
| 美妆分类与卡片 | 已接 12 类 15 卡，含无、缩略图、选中态和独立强度 |
| 单人脸 / 多人脸目标 | 已接全部人脸或指定 `freid` |
| 美体 | 已接小头、天鹅颈、瘦手臂、直角肩、宽肩、瘦身、瘦腰、长腿、胸型、美胯 |

最新界面截图：

- `output/playwright/jianying-portrait-adjustment/01-basic-offline-ready.png`
- `output/playwright/jianying-portrait-adjustment/02-skin-tone-live-preview.png`
- `output/playwright/jianying-portrait-adjustment/03-face-shape-live-preview.png`
- `output/playwright/jianying-portrait-adjustment/04-features-live-preview.png`
- `output/playwright/jianying-portrait-adjustment/05-makeup-target-live-preview.png`
- `output/playwright/jianying-portrait-adjustment/06-body-combined-live-preview.png`

在 2048 x 1092 的真实 Electron 截图中，右侧面板可滚动，页签、文字、数值框和卡片没有重叠；中央预览始终有真实非透明像素。

## 运行包与参数

本轮读取的是中文剪映专业版 `/Applications/VideoFusion-macOS.app`，不是 CapCut。

| QCut 运行包 | 剪映 resource/version | 数量与用途 |
|---|---|---|
| `smooth` | `7408077820116667700/b000f31572be3e5f9fd195d7bba37968` | 1，磨皮 |
| `eye-details` | `7408077446257331471/a5ff2cc5d18c0f1ba8803b2550be679d` | 3，亮眼、眼袋、法令纹 |
| `skin-tone` | `7408757645705760000/c36221f2a2097535ce1a2f70cd9e0116` | 2，肤色、冷暖 |
| `teeth` | `7408077691880049960/314c864e3cac447612ba24e8261eab31` | 1，美白牙齿 |
| `face` | `7408077448513998114/aa4932200616e291a252039a3aac7232` | 18，基础脸型与五官 |
| `features` | `7408077472211668276/f662ff9c955ee319f1ae03b2aa27df76` | 37，脸型补充和五官精修 |
| `makeup` | `21769690/89ad943ef61e4509b877db7105e3216e` | 动态美妆宿主 |
| `body` | `7408076932065152296/9c891b188dd6b523a30efa8bfb63602b` | 10，美体 |

15 张卡覆盖套装、口红、腮红、修容、卧蚕、眉毛、睫毛、眼线、眼影、美瞳、高光和雀斑。动态卡通过 `makeup.prefab` 挂载真实卡片路径；套装和流畅眉使用各自独立 `AmazingFeature/main.scene`。选择变化会改变阶段签名并销毁过期宿主，避免上一张卡残留在后续帧。

## 离线运行时

产品 provider：`jianying-local-swing-v1`。

2026-08-23 实测：

```json
{
  "state": "ready",
  "available": true,
  "offlineReady": true,
  "packageCount": 8,
  "readyPackages": 8,
  "privatePackages": 8,
  "cardCount": 15,
  "readyCards": 15,
  "privateCards": 15,
  "controlCount": 72
}
```

私有运行时位于 `~/Library/Application Support/QCut/PrivateRuntimes/JianyingFilter/current`。`current` 是指向不可变快照的符号链接，二进制、模型和资源不会被 Git 跟踪或上传。

最新清单：

- 创建时间：`2026-08-23T06:07:50.519Z`
- 27,557 个校验文件
- 23 个运行库文件
- 53 个模型文件
- 751 个效果包
- 5 个数据库文件
- 1,368,685,027 bytes
- `localOnly: true`
- `cloudUpload: false`

## 原生像素验证

### 组合效果与美妆

输入为 512 x 512 真人 RGBA，输出在 `/tmp/qcut-portrait-full-test-20260823`：

| 对照 | 变化字节 | 平均绝对字节差 | 最大差 |
|---|---:|---:|---:|
| 输入 vs 磨皮 + 脸型 + 牙齿 + 口红 + 美瞳 | 393,486 | 2.132875 | 137 |
| 输入 vs 美瞳 | 393,419 | 2.125187 | 137 |
| 组合输出 vs 美瞳输出 | 22,067 | 0.110332 | 34 |

这证明组合阶段与单独美瞳不是同一输出；卡片和数值不只是写入状态。

### 指定人脸

双人拼图为 1024 x 512，输出在 `/tmp/qcut-portrait-face-target-2`：

| 目标 | 左半变化字节 | 右半变化字节 |
|---|---:|---:|
| `faceId: 0` | 0 | 33,714 |
| `faceId: 1` | 319,766 | 0 |

同一参数切换目标 ID 后只改变对应半边，证明 `freid` 目标路径真实生效。当前前端还没有显示检测框，因此 UI 以人脸 1 至人脸 10 表示稳定 ID，而不是伪造检测框。

## 真实 Electron E2E

命令：

```bash
QCUT_REAL_PORTRAIT_IMAGE_PATH='/Users/peter/Downloads/ChatGPT Image Jul 27, 2026, 03_11_53 PM.png' \
  bunx playwright test \
  apps/web/src/test/e2e/jianying-portrait-adjustment.e2e.ts \
  --project=electron --reporter=line --timeout=300000
```

结果：`1 passed (39.8s)`。

真实流程：

1. 导入全身真人图并加入时间线。
2. 必须显示“剪映本机二进制 / 离线就绪”。
3. 开启美颜美体，依次操作磨皮、肤色、脸型、常用五官、眉毛、精修、美妆、指定人脸和美体。
4. 每阶段预览必须同时满足哈希变化和非透明像素超过 10,000，防止异步空白帧被误判为成功。
5. 保存美颜预设，把亮眼归零后应用预设；哈希必须精确恢复到美妆完成后的画面。
6. 时间线必须保存 14 个数值参数、`faceId: 0`、口红和美瞳选择及其强度。
7. 导出 1 秒 MP4，并用文件大小和媒体元数据验证产物。

最终证据中六个阶段的非透明采样像素均为 `207328`：

| 阶段 | 哈希 |
|---|---:|
| 皮肤 | 2975664511 |
| 脸型 | 2624118107 |
| 眉毛精修 | 4151615911 |
| 亮眼 | 1146347578 |
| 美妆 + 人脸目标 | 876220701 |
| 美体 | 1378827596 |

导出产物：

- `output/playwright/jianying-portrait-adjustment/portrait-adjustment-export.mp4`
- H.264，1080 x 1920，30 fps，1.000 秒，233,813 bytes
- 状态与哈希：`output/playwright/jianying-portrait-adjustment/e2e-evidence.json`

## 自动化验证

```text
Real Electron E2E, screenshots and MP4 export: 1 passed
Targeted Electron, editor-core, snapshot, preset, preview and export tests: 23 passed
Full repository TypeScript check: passed
Web and Electron production build: passed
Targeted Biome checks: passed
```

## 尚未冒充支持的能力

以下能力在截图中存在，但当前没有足够的真实输出证据，因此没有加入无效 UI：

- 美白、丰盈、清晰等额外皮肤卡。已探测的 GAN 匀肤参数曾返回输入原字节，不能算支持。
- 手动精修笔刷、局部磨皮和手动祛斑祛痘。当前宿主尚未证明剪映的笔刷轨迹、画布坐标和逐笔事件协议，只有滑杆不能构成真实功能。
- 自动返回人脸检测框、人数和预览覆盖层。原生目标 ID 已生效，但检测结果还没有从宿主返回前端。
- 完整剪映美妆资源库。本轮是 15 张本机缓存且逐卡可解析的真实卡，不是剪映全部卡片。

“真实调用同一类剪映二进制”也不等于“与剪映 UI 完美逐像素一致”。本轮证明的是 QCut UI、状态、预览、目标人脸、美妆组合、持久化和导出端到端可用。完美复刻仍需对同一素材、同一参数和同一导出规格取得剪映 UI 无损帧，再做逐像素与连续视频稳定性对照。
