# 剪映手动美体私有运行时与 QCut 产品 E2E

记录时间：2026-08-25

## 结论

QCut 已接入中文剪映专业版的三种手动美体工具：拉长、瘦身瘦腿、放大缩小。三者均使用本机
QCut 私有快照中的原生效果包，不依赖剪映用户缓存或 App Bundle；属性面板、画布控制柄、时间线
持久化、撤销/重做、原生预览、MP4 导出和项目重开均已通过真实 Electron E2E。

当前裁决是 **functional + strict offline**，不是剪映 UI 像素级 parity。第三方二进制、模型和效果包
只存在于用户本机私有快照，未提交 Git，也不能据此推导可分发许可。

## 中文剪映资源与参数协议

| 工具 | QCut runtime package | resource id | version |
| --- | --- | --- | --- |
| 拉长 | `manual-stretch` | `7406180541361392896` | `842ae3d2c0e00271729129fc90f59712` |
| 瘦身瘦腿 | `manual-slim` | `7406017234474175796` | `08af2313acd311315abf352ff737264e` |
| 放大缩小 | `manual-zoom` | `7406174489727339791` | `f21ee9174404341a6b01d792db7366db` |

三张卡均由 AmazingFeature 的 `ReshapableGridRenderer` 处理，不要求人体骨骼检测模型。原生强度范围
是 `-0.5..0.5`；QCut UI 使用 `-50..50`，发送前除以 100。

```json
{
  "stretch": {
    "effects_adjust_intensity": 0.5,
    "upper": 0.72,
    "bottom": 0.18
  },
  "slim": {
    "effects_adjust_intensity": 0.5,
    "x": 0.5,
    "y": 0.52,
    "width": 0.42,
    "height": 0.58,
    "rotation": 18
  },
  "zoom": {
    "effects_adjust_intensity": 0.5,
    "x": 0.5,
    "y": 0.5,
    "r": 0.24
  }
}
```

`upper`、`bottom`、`x`、`y`、`width`、`height` 和 `r` 都是素材局部坐标中的归一化值；
`rotation` 使用角度。放大缩小的原生半径键是 `r`，项目数据中命名为 `radius`。

## 私有快照与 resolver

备份脚本会从 catalog 的全部 runtime identity 自动复制效果包，并生成逐文件 SHA-256 manifest。本轮
快照为：

```text
~/Library/Application Support/QCut/PrivateRuntimes/JianyingFilter/
  D6342ECD-5432-33F0-A2AD-0C28F5699994-cb04efad88cd637d/
```

快照包含 28,039 个文件、23 个运行库、53 个模型和 761 个效果包，总计 1,370,889,731 字节。
三张手动美体包均已写入 `manifest.json`。同时禁用剪映两种来源后，resolver 对六张 manual 包均返回
`ready=true`、`source=qcut-private`：

```bash
QCUT_JIANYING_DISABLE_APP_BUNDLE=1 \
QCUT_JIANYING_DISABLE_USER_CACHE=1 \
bun scripts/verify-jianying-manual-body.ts
```

## QCut 产品实现

### 时间线与撤销

`MediaPortraitAdjustments.manualBody` 按工具保存以下数据：

```text
stretch: intensity, upper, bottom
slim:    intensity, x, y, width, height, rotation
zoom:    intensity, x, y, radius
```

数据经过严格范围归一化，并进入项目 JSON、Claude bridge、预设和 snapshot validation。一次 pointer
down 到 pointer up 只形成一条历史记录；撤销恢复拖动前完整对象，重做恢复拖动后的完整对象。

### 三套画布控制柄

- 拉长：两条水平虚线及上下两个拖动圆点；
- 瘦身瘦腿：可移动、缩放和旋转的矩形；
- 放大缩小：可移动圆形及半径控制点。

进入手动美体时，普通素材移动/缩放框暂时退出，避免透明拖动层抢占指针。离开手动美体后普通素材
控制立即恢复。

控制柄嵌在素材自己的变换和裁切容器中，因此会继承素材旋转、非等比缩放和裁切。指针坐标通过
SVG `getScreenCTM()` 的逆矩阵回到素材局部坐标，再归一化到 `0..1`。测试覆盖平移、旋转、非等比
缩放、水平翻转和 crop 可见区域；裁切外控制内容会由同一 clip path 隐藏。

### 原生预览和导出

每个强度非零的工具形成独立稳定 stage，按 `manual-stretch -> manual-slim -> manual-zoom` 处理，上一
stage 的 RGBA 输出作为下一 stage 输入。预览与导出都传递同一份 `manualBody` 数据。

原生渲染是异步的。为避免参数变化时闪黑，`ColorPreviewCanvas` 现在只在尺寸真正变化时重设 canvas，
并先在离屏 canvas 完成整帧，再一次性替换可见帧；旧帧会保留到新帧准备完成。

## 原生实际输出

1280 x 720 真人素材在严格离线模式下的单工具结果：

| 工具 | changed pixels | changed ratio | RGB MAE | max channel delta |
| --- | ---: | ---: | ---: | ---: |
| 拉长 | 787,724 | 85.4735% | 6.861858 | 244 |
| 瘦身瘦腿 | 485,763 | 52.7087% | 3.778422 | 224 |
| 放大缩小 | 467,437 | 50.7202% | 2.575739 | 201 |

本机证据目录：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  manual-body-private-runtime-e2e/2026-08-25/
```

其中 `stretch-before-after.png`、`slim-before-after.png`、`zoom-before-after.png` 是原图与原生输出
并排图，`report.json` 保存包来源和量化指标。

## Electron 严格离线 E2E

```bash
QCUT_JIANYING_DISABLE_APP_BUNDLE=1 \
QCUT_JIANYING_DISABLE_USER_CACHE=1 \
bunx playwright test \
  apps/web/src/test/e2e/jianying-manual-body.e2e.ts \
  --project=electron
```

最终结果：**1 passed，30.8 秒**。测试真实完成：导入多人真人图片；给素材设置 14 度旋转、
`scaleX=0.86`、`scaleY=1.08` 和四边裁切；打开三种工具；用真实鼠标分别拖动水平线、旋转矩形和
圆形半径；验证撤销/重做；等待稳定非黑原生预览；导出 1 秒、1920 x 1080、30 fps H.264 MP4；
抽取导出帧；刷新页面并核对项目数据完全一致。

拖动后的实际持久化值包括：

```text
stretch.upper = 0.7737798141562378
slim.x/y      = 0.5428283993815093 / 0.45273139733576423
zoom.radius   = 0.3091455088382701
```

重开值逐字段等于上述最终值。最终预览采样为 129,600 个有效像素，其中 126,105 个为非黑像素。
导出文件和截图：

```text
output/playwright/jianying-manual-body/
  01-stretch-lines-transformed.png
  02-rotated-slim-undo-redo.png
  03-zoom-circle-native-preview.png
  04-project-reopened.png
  manual-body-export.mp4
  manual-body-export-frame.png
  e2e-evidence.json
```

## 仍未证明

1. 尚未用同版本中文剪映 UI 对同一无损素材、同参数做逐像素 parity；
2. 当前产品 E2E 用静态图片导出 1 秒视频，尚未覆盖真实人物连续运动、跨帧稳定性和时间回跳；
3. 尚未提供面向用户的独立 `qcut` 手动美体 CLI 命令；当前数据可通过编辑器状态和 bridge 持久化；
4. 手动瘦脸属于另一张 `manual-deformation` 包，本报告不把它算入三种手动美体；
5. 第三方运行时和资源只能用于用户本机私有互操作，不能提交或随 QCut 分发。
