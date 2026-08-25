# 剪映手动美颜协议与 QCut 私有运行时 E2E

记录时间：2026-08-25

## 结论

QCut 已经把中文剪映专业版的两种手动美颜工具接入产品：

- 手动磨皮：画笔、擦除、大小、强度、撤销、重做、清空；
- 手动祛痘：共用同一交互模型，加载独立原生效果包；
- 项目保存：笔画以归一化坐标持久化，最多 256 笔、每笔最多 512 点；
- 本机缓存：原生包生成 mask PNG，QCut 写入并校验 `retouch_config.json`；
- 私有运行时：禁用剪映 App Bundle 和剪映用户 Cache 后仍可真实渲染。

这是 **functional + offline** 结论，不是与剪映 UI 逐像素一致的 parity 结论。手动瘦脸包已经进入
QCut 私有快照，但本轮没有把它接成画布形变工具。手动美体三种工具随后已完成，见
[manual-body-private-runtime-e2e.zh.md](manual-body-private-runtime-e2e.zh.md)。

## 中文剪映的真实协议

本轮对象始终是中文剪映专业版 `com.lemon.lvpro`，不是 CapCut。当前本机资源目录确认三张手动
美颜卡：

| 工具 | resource id | version |
| --- | --- | --- |
| 手动瘦脸 | `7408028088627465524` | `e607793158bce9c274fe73722ec983fb` |
| 手动磨皮 | `7447725847449965107` | `cdadab3125d2a44f561cca947057977f` |
| 祛斑祛痘 | `7456626609332687397` | `4375341231235e0656e15dcc64c49b39` |

手动磨皮和手动祛痘的 Lua 参数协议已经由独立宿主逐项验证：

```json
{
  "draft_path": "/absolute/cache/path/",
  "load_manual_retouch_cache": false,
  "canvas_size": "{\"width\":1280,\"height\":720}",
  "brush_type": "manual_beauty_smooth",
  "brush_mode": 0,
  "intensity": 100,
  "brush_size": 68
}
```

其中：

- `brush_type` 为 `manual_beauty_smooth` 或 `manual_acne_removal`；
- `brush_mode=0` 是画笔，`brush_mode=1` 是擦除；
- `brush_size` 使用 UI 的 `1..100`，`intensity` 使用 `0..100`；强度为 `0` 时仍保留笔画和 mask，便于无损调回；
- 坐标是画面左上角原点的 `0..1` 归一化坐标；
- 触摸事件键依次为 `touch_begin`、若干 `touch_move`、`touch_end`，值是嵌套 JSON 字符串
  `{"x": ..., "y": ...}`；
- begin、每个 move 和 end 后都必须在同一个 GL context、同一个线程处理一帧。把全部触摸参数在
  同一帧一次性发送会得到空 mask；
- 独立 Swing 宿主直接调用 manager touch API 只返回成功码但不生成笔画；已验证有效的路径是
  FeatureSegment 参数更新后逐事件处理 frame。

效果包生成 256 x 256 的 PNG mask。QCut 根据原生 tracker id 写入：

```json
{
  "smooth_mask_list": {
    "0": "smooth_mask_1_....png"
  }
}
```

祛痘包使用其原始拼写 `acne_removeal_mask_list`。恢复时必须在第一帧前同时设置 `draft_path` 和
`load_manual_retouch_cache=true`。只存在 manifest 而缺少引用的 PNG 不能算有效缓存。

## QCut 实现

### 项目数据与 UI

`MediaPortraitAdjustments.manualRetouch.strokes[]` 保存：

```text
id, tool, mode, size, intensity, points[], optional faceTrackId
```

属性面板增加“手动”子页，提供手动磨皮/手动祛痘切换、画笔/擦除、大小、强度、撤销、重做、清空
和笔数。预览层显示实际笔刷圆圈；青色表示画笔，白色表示擦除。按下鼠标后记录归一化坐标并把
命中的原生人脸 track id 一并保存。

强度是原生包的全局工具参数，不是每个 mask 独立的混合值。因此用户修改某一工具的强度时，QCut
会同步重写该工具已有笔画的强度，避免项目里出现原生运行时无法准确表达的混合强度历史。

### 原生宿主与缓存

provider 为 `manual-smooth` 和 `manual-acne` 分别创建 stage。stage id 包含笔画内容 SHA-256
摘要；撤销、重做、大小或强度变化都会形成不同的内容地址。宿主先预热并检测人脸，再逐事件回放
笔画。原生包写出 mask 后，QCut 原子写入 manifest。

默认缓存根：

```text
~/Library/Application Support/QCut/Caches/JianyingManualRetouch/
```

测试可用 `QCUT_JIANYING_MANUAL_RETOUCH_CACHE_ROOT` 隔离。加载前会解析 manifest，拒绝目录穿越、
错误扩展名、空列表和缺失 PNG；不能只凭 `retouch_config.json` 存在就跳过重建。

三张手动效果包、Framework 和模型均包含在仓库外的 QCut 私有快照中。resolver 现会一致尊重
`QCUT_JIANYING_DISABLE_USER_CACHE=1`，严格测试不会再回退读取剪映用户效果包或美妆卡目录。

## 严格离线验证

验证同时设置：

```bash
QCUT_JIANYING_DISABLE_APP_BUNDLE=1
QCUT_JIANYING_DISABLE_USER_CACHE=1
QCUT_JIANYING_MANUAL_RETOUCH_CACHE_ROOT=<isolated-directory>
```

`provider.inspect({ refresh: true })` 返回：

```text
state: ready
available: true
offlineReady: true
manual-smooth: ready, qcut-private
manual-acne: ready, qcut-private
manual-deformation: ready, qcut-private
```

真人 1280 x 720 原始 RGBA 的量化结果：

| A/B | changed bytes | RGB(A) MAE | max channel delta |
| --- | ---: | ---: | ---: |
| 磨皮 100 vs 原图 | 46,590 | 0.051746 | 42 |
| 缓存重开 vs 首次磨皮 | 3,997 | 0.001304 | 6 |
| 画笔后擦除 vs 原图 | 4,131 | 0.001166 | 3 |
| 大小 20 vs 90 | 47,555 | 0.059440 | 47 |
| 强度 25 vs 100 | 42,322 | 0.038416 | 32 |
| 手动祛痘 vs 原图 | 9,181 | 0.004382 | 14 |

缓存重开并非逐字节相同，原因是原生算法重复加载时存在少量量化差；但输出仍接近首次结果，且明显
不同于原图。画笔后擦除接近原图，证明擦除不是 UI 状态切换，而是真正改变了原生 mask。

仓库外像素证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  manual-retouch-qcut-private-e2e-2026-08-25/
```

其中 `08-comparison-face-crops.png` 是原图、磨皮 100、画笔后擦除和手动祛痘的脸部并排图；
`result.json`、`erase-result.json`、`size-intensity-result.json` 和 `acne-result.json` 保存结构化指标。

## Electron 产品 E2E

严格离线环境下运行：

```bash
bunx playwright test \
  apps/web/src/test/e2e/jianying-manual-retouch.e2e.ts \
  --project=electron --timeout=120000
```

最终回归结果：**1 passed，22.8 秒**。测试真实执行：导入真人图片、识别人脸、打开手动页、设置
大小 90，验证强度 0 边界后调回 100，鼠标拖动画笔、切换擦除、撤销和重做，并检查时间线状态、
预览像素以及磁盘 mask 缓存。

截图：

```text
output/playwright/jianying-manual-retouch/
  01-manual-controls-ready.png
  02-native-paint-preview.png
  03-native-erase-preview.png
  04-undo-redo-restored.png
```

隔离缓存中实际出现两份 `retouch_config.json` 和三张 `smooth_mask_*.png`。协议回归、状态管理与
既有人像回归共运行 8 个 Vitest 文件、48 项全部通过；全仓 TypeScript 检查和 Web/Electron 生产
构建也通过。

## 仍未完成

1. 没有用同一张无损素材在当前中文剪映 UI 与 QCut 做逐像素手动画笔 parity；
2. 没有验证真实连续视频、遮挡、多人交叉、时间回跳和项目重开后的完整交互；
3. 任意裁切、旋转、缩放后的素材坐标映射仍需单独 E2E；当前证据使用全画布、无变换素材；
4. 手动瘦脸包虽已私有缓存，但 QCut 尚未实现其局部形变交互；
5. 手动美体三种工具已在后续工作完成，但与剪映 UI 的逐像素 parity 仍未证明；
6. 缓存目前按笔画内容寻址，但尚未实现容量上限和 LRU 清理；
7. 第三方运行时、模型和效果包只能保留在用户本机私有快照，不能提交 Git 或随产品分发。
