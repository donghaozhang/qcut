# QCut 美颜美体逐项极值审计

记录时间：2026-08-25

## 结论

当前 UI 暴露的 77 个数值控制和 15 张美妆卡，共 92 项，已全部使用剪映本机二进制和真人素材做极值渲染：

| 分组 | 项目数 | 生效 | 弱输出 | 零输出 |
| --- | ---: | ---: | ---: | ---: |
| 皮肤 | 8 | 8 | 0 | 0 |
| 脸型 | 17 | 17 | 0 | 0 |
| 五官 | 42 | 42 | 0 | 0 |
| 美体 | 10 | 10 | 0 | 0 |
| 美妆 | 15 | 15 | 0 | 0 |
| **合计** | **92** | **92** | **0** | **0** |

这里的“生效”表示极值参数在合适真人素材上产生可测 RGB 像素变化，不表示已经与剪映专业版 UI 逐像素平价。最终结构化报告的 SHA-256 为 `3c967e82a38b5433ba737ea9b699c70847505f1b0a3330d117d7f0b92a9c556f`，结果摘要 digest 为 `5a30bbe5b859529c686d476f472396b8d34721e5990cf91969e000b5dfc9ad8e`。

## 方法

审计脚本为 `scripts/audit-jianying-portrait-controls.ts`。它直接读取产品 catalog 和美妆 catalog，避免维护第二份项目清单：

- 正值控制使用 UI 最大值；正负双向控制同时渲染最小值和最大值，再保留变化更明显的一侧；
- 皮肤、亮眼、眼袋、法令纹和白牙同时使用普通近脸和细节更明显的近脸素材；
- 美体使用颈肩、腰、腿均完整可见的单人全身素材；
- 美妆 15 张卡全部使用强度 `100`；
- 共渲染 152 个变体，每项保存原图、极值效果和六倍差分图；
- `changedPixels = 0` 记为 `no-effect`；变化少于 16 像素或 RGB 绝对差总和小于 256 才记为 `weak`。

最小的非零结果仍明显超过门禁：亮眼改变 729 像素，美瞳改变 899 像素，自然眼线改变 910 像素。它们作用区域本来就小，不能只凭肉眼缩略图判断为无效。

## 两个初始异常

### 天鹅颈：素材误判，不是产品缺陷

第一轮使用五人远景舞蹈帧，`body_adjust_SwanNeck=100` 为零输出。包内 Lua 明确把该键映射到 `Amaz.NsItemType.SWAN_NECK`，参数协议没有错误。

换成颈肩清晰的单人全身图后连续三帧分别改变 5,876、5,771、5,576 像素，最大通道差为 106。最终全量审计保留合适素材并把天鹅颈记为 `functional`。结论是美体审计必须按部位选择素材；人物太小、颈部被衣领遮挡或多人远景都可能合理透传。

### 祛斑祛痘：真实异步就绪缺陷，已修复

修复前，同一持久宿主对两张近脸各渲染 12 次，共 24 次，只有 8 次输出效果，另外 16 次逐字节透传。原因是 `newbandou` GAN 异步加载和结果发布，而宿主每个请求固定只泵 `warm + final` 两遍。

产品 provider 现只对 `spot-acne` stage 做有上限的就绪重试：每次渲染后比较 stage 输入与输出；仍为逐字节透传时继续泵动同一宿主，检测到真实输出即停止，最多 8 次。其他 91 项不承担这项开销；没有可修复瑕疵的素材到上限后仍可正常返回原图。

修复后对普通近脸和细节近脸各做 10 次独立冷启动，共 20/20 次产生非零效果。普通近脸每次约改变 75,595 至 75,670 像素，另一张近脸每次约改变 21,078 至 21,752 像素。

## 真实 Electron UI

最终 Electron 合并门禁为 `3 passed (1.1m)`：

1. 单人全身图：依次操作皮肤、脸型、五官、美妆、预设和美体；天鹅颈单独设为 `100` 后画布哈希变化，再完成组合美体和 1 秒 MP4 导出。导出文件为 233,905 bytes。
2. 近脸图：原图和祛斑祛痘 `100` 使用同尺寸预览哈希；两边均为 482,967 个有效像素，左右半帧哈希都发生变化，store 同时保存 `face_adjust_SpotAcne: 100`。
3. 双人图：真实检测两张脸，只给左侧人物应用口红后左侧改变 2,515 像素，右侧改变 0；美体仍按全部人物保存；CLI patch 返回 `ok` 并在 UI 回显长腿 `55`。

## 证据

逐项报告和 205 个证据文件：

```text
output/playwright/jianying-portrait-control-audit/
  report.json
  report.md
  skin-contact-sheet.png
  face-shape-contact-sheet.png
  features-contact-sheet.png
  body-contact-sheet.png
  makeup-contact-sheet.png
  comparisons/*.png
  renders/*.png
```

真实 UI、状态和导出证据：

```text
output/playwright/jianying-portrait-adjustment/
  02a-spot-acne-original.png
  02b-spot-acne-maximum.png
  06a-swan-neck-live-preview.png
  06-body-combined-live-preview.png
  07-multiface-detected-selected.png
  08a-one-face-makeup-canvas.png
  10-cli-patch-reflected-in-ui.png
  e2e-evidence.json
  spot-acne-ui-evidence.json
  multiface-ui-cli-evidence.json
  portrait-adjustment-export.mp4
```

## 仍需诚实保留的边界

- 本轮证明“产品控件确实驱动本机二进制并改变像素”，没有替代逐卡剪映 UI 无损帧 parity。
- `offlineReady` 当前仍为 `false`：美白、清晰、祛斑祛痘和 skin GAN 包仍从本机剪映安装读取；其余包和 15 张美妆卡来自 QCut 私有本地快照。第三方二进制和资源不得提交仓库或随产品分发。
- 美体包是整帧语义，不支持按某一张脸单独绑定；UI 已明确显示“全部人物”。
- 静态极值审计不能替代长视频中的跟踪、跨帧稳定性和素材切换测试。
