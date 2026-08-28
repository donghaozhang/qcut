# QCut 与剪映固定版人物抠像同算法验收（2026-08-28）

## 结论

QCut 的精细人物抠像现已接通剪映 D634 固定快照的同一条用户态数值链：

```text
源 BGRA 帧
  -> TEBachMattingAlgorithm
  -> ai_matting_video_object
  -> video_saliency_seg_bce
  -> 原始 256x256 recurrent mask
  -> TEMattingBlendEffectV2 / FastBlend
  -> 源尺寸 Alpha
```

产品 provider 与 pipeline 均为
`qcut-jianying-video-object-bach-v2-exact-d634-v1`，默认后处理身份为
`vendor-v2-exact-no-qcut-refinement-v1`，blend 身份为
`TEMattingBlendEffectV2-vendor-exact`。默认路径不再叠加 QCut 的 Vision、形态学或
时序补洞；只有用户显式调整高级参数时，才进入身份独立的 QCut 后处理路径。

这里的“同算法”严格限定为：同一 Mac、固定 D634 私有 runtime/graph/model 与完整
Framework 闭包上的 Bach + vendor V2 provider。它不表示复制整个剪映 App，也不保证
跨 macOS、CoreML、Metal 驱动或 GPU 的逐字节一致。VP9 透明视频是 QCut 的交付编码，
也不属于模型内部数值链。

## 固定闭包

- runtime UUID：`D6342ECD-5432-33F0-A2AD-0C28F5699994`
- `libcccreator` SHA-256：
  `0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9`
- graph SHA-256：
  `797fab4d5b1f0118ae565d3f9128b6a5d550b6af559c6da764c3d7777e1f7f5b`
- model SHA-256：
  `346b64693e02775faff84b6506e6aa8fb399d1060ab7eb3448157eef741849ef`
- 23 个私有 Framework 闭包：
  `jianying-runtime-framework-closure-d634-v1-e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e`

helper 在 `dlopen` 前逐文件核对大小和 SHA；缺失、混装或篡改任意依赖都会拒绝 exact
provider。子进程环境会清除继承的 `DYLD_*`，再只设置已审计的 Framework 路径。
剪映私有二进制、模型、graph、动态捕获和真人素材均未进入仓库。

## 内部数值证据

- 独立 V2 probe 与产品 helper 的真人首帧源尺寸 Alpha 逐字节相同：
  `e8ad4c25d5d1a4dc0cc6a559686c14d98d411e43918c45d8c3249f4a56d3ba97`，
  exact ratio `1`、MAE `0`、IoU `1`。
- 60 帧 exact 输出 SHA-256：
  `f1a113fc4b4330e9c405508253848376bf60b6f9b0eddcbddb712abdf0cc7b91`；
  重复运行逐字节相同。
- V2 接入前后 Bach 的两帧 `nn_3` 保持逐字节一致；raw 256 mask 的
  `131072` 个像素 MAE `0`、最大误差 `0`。
- 原生 60 帧约 `1.10 s`；完整依赖 SHA 门禁 warm-cache 约 `0.61 s`。
- source Alpha 非全不透明时，最终 Alpha 没有越过 source Alpha 上限。

## 真人桌面 E2E

使用同一段 `360x640`、30 fps、2 秒、60 帧真人宽景，强制 exact
`video-object` 路线运行完整 Electron UI 流程。结果为 `1/1 passed (22.1s)`：

- 首轮真实运行 exact helper，未 fallback；
- 生成 VP9 Alpha WebM，时长 `2.000 s`、大小 `182576 bytes`；
- `provider/pipeline=qcut-jianying-video-object-bach-v2-exact-d634-v1`；
- `blend=TEMattingBlendEffectV2-vendor-exact`；
- `refinement=vendor-v2-exact-no-qcut-refinement-v1`；
- 浏览器解码 ROI：顶部背景 `0`，人物中心 `252.9399479167`；
- 第二轮在同一任务独立的新缓存根上观察到缓存完整，仍为 exact provider、无 fallback；
- 完成素材入库、时间线蒙版挂载、播放器预览和三张桌面截图。

白底对比固定为左剪映、右 QCut。对剪映黑白导出重建的 Alpha 代理，最终 QCut VP9
Alpha 在阈值 128 下为 IoU `0.998339276242`、precision `0.998937929021`、
recall `0.999400073951`、MAE `1.965280598958/255`。这些数字同时包含剪映白/黑导出
重建误差和 QCut VP9 Alpha 量化，不能反推内部 Bach+V2 不一致；内部同帧逐字节证据
以前一节的独立 probe 为准。

证据目录：

```text
<仓库外 improve_voice 证据目录>/qcut-gru-real-person-test-2026-08-26/qcut-jianying-bach-v2-exact-2026-08-28/
```

## 产品边界

- exact 不可用或运行失败时，QCut 仍按 direct CoreML、旧 Effect host、GRU + Vision
  回退；这些 provider 有不同身份，不能称为同算法。
- 自动模型路由仍是 QCut 的采样策略。选择 GRU + Vision 的近景不属于本页的 exact
  object provider；若要固定同算法，应使用精细抠像的 exact `video-object` 路线并检查
  结果 metadata。
- seek、切镜、倒放、变速、源范围变化和剪映预览/导出模型切换仍属于宿主策略，尚未
  宣称完整复制。
- Alpha 仍会回读 CPU、写缓存并编码 VP9；这影响性能和最终编码字节，不改变已验证的
  Bach + vendor V2 模型数值链。
- 共享缓存任务的最后一个订阅者取消后，后台构建目前会继续完成；缓存提交 I/O 错误的
  错误分类也仍可继续收紧。这两项是任务生命周期/错误策略，不是 Alpha 算法差异。
