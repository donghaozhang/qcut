# QCut 十项本地视频实验室：真人 E2E 与剪映对比

> 验证日期：2026-08-30  
> 范围：QCut CLI、可见 QCut UI、剪映专业版真实 UI、双方实际导出文件  
> 素材：同一位真人的两条 3 秒测试轨

## 结论

十项功能都已经用真人视频跑过，不是只验证开关或单元测试。QCut 的七项像素处理通过 CLI 写入、UI 回读和实际导出；三项智能工具先完成本地 MediaPipe 真人追踪，再生成关键帧并导出。剪映侧每项都在真实应用中单独建立时间线、操作 UI 并导出结果。

结果分成三类：

1. **功能链已打通**：十项 QCut 输出都与各自基线哈希不同，预览、持久化和导出可用。
2. **效果方向可测**：降噪、去闪、运动模糊、运镜、裁剪和追踪均产生与预期一致的指标变化。
3. **不能宣称模型等价**：QCut 目前有四项是本地替代实现，不是剪映同名模型；补帧时长已修复，但仍不是 UMVFI。

机器探针覆盖 `26` 个源片、基线和效果导出；最暗帧的平均亮度仍为 `14.775417`，没有零帧或整帧黑屏。QCut 与剪映的 30 fps 效果导出均为 `90` 帧 / `3.000s`。

## 测试素材

| 测试轨 | 规格 | 用途 |
| --- | --- | --- |
| `02-real-person-challenge-noisy-3s.mp4` | 360 x 640、24 fps、72 帧、3 秒、真人、抖动 + 闪烁 + 时域噪声 | 防抖、降噪、防闪烁、运动模糊、眼神修正、超分、补帧 |
| `04-real-person-small-clean-3s.mp4` | 360 x 640、24 fps、72 帧、3 秒、真人位于画面左侧且占比较小 | 智能运镜、智能裁剪、镜头追踪 |

像素测试轨故意保留 `171:176` SAR，用来暴露编辑器对非方形像素的处理差异。智能测试轨使用 `1:1` SAR，避免几何因素干扰追踪结论。

## 十项结果

所有 SSIM 都是“该编辑器效果输出 vs 该编辑器自己的同源基线”，不是 QCut 与剪映逐像素互比。低 SSIM 只表示改变更明显，不直接等于质量更高。

| 功能 | QCut 本地实现与结果 | 剪映实测 | 判断 |
| --- | --- | --- | --- |
| 视频防抖 | FFmpeg `deshake`，估计全局位移下降 `5.95%`，SSIM `0.680675` | 真实防抖导出，SSIM `0.991019`，变化较轻 | 链路通过；不是剪映防抖算法 |
| ByteNN 降噪 | 实际为 `hqdn3d`，空间细节下降 `1.64%` | UI 明确选择“本地”模型，细节下降 `7.73%` | 链路通过；不是 ByteNN |
| 防闪烁 | FFmpeg `deflicker`，帧亮度波动下降 `59.71%` | 帧亮度波动下降 `1.17%` | 两边均生效；强度未校准 |
| 光流运动模糊 | `minterpolate -> tmix -> fps`，细节/时域差下降 `44.84% / 32.61%` | 下降 `61.37% / 52.33%` | 两边都有明显模糊效果 |
| 实验室眼神修正 | 本地亮眼与眼袋弱化，SSIM `0.828571` | 剪映眼神修正，SSIM `0.993849` | 名称相近但语义不同；QCut 不改变视线方向 |
| 实验室 AI 超分 | Lanczos 2x + unsharp，归一化后细节 `+0.48%` | 真实异步超分任务，细节 `+0.08%` | 都有导出；不能证明 AI 模型或清晰度等价 |
| 实验室 UMVFI 补帧 | 实际为 FFmpeg `minterpolate`，SSIM `0.818902`，输出 `90` 帧 / `3.000s` | SSIM `0.822099`，输出 `90` 帧 / `3.000s` | 两边时长完整；QCut 仍不是 UMVFI 模型 |
| 实验室智能运镜 | MediaPipe 12 个真人采样点生成变换关键帧，SSIM `0.902837` | 启用开关并应用运镜预设，SSIM `0.861345` | 双方都产生明显运镜 |
| 实验室智能裁剪 | MediaPipe 主体关键帧，缩放范围 `1.138x-1.608x`，SSIM `0.799535` | 指定 `16:9` 后应用，SSIM `0.742241` | 都生效；QCut 目前不是目标比例裁剪工作流 |
| 实验室镜头追踪 | MediaPipe 位置关键帧，SSIM `0.857374` | 真实头部追踪、人脸框与时间线结果，SSIM `0.898793` | 都生效；剪映目标是头部，QCut 当前是人物框 |

## CLI 与 UI 证据

QCut 像素测试使用 `editor:element:patch` 写入参数，再由 `editor:timeline:export` 回读持久化状态，最后用 `editor:export:start --preset tiktok --fps 30 --poll` 导出。可见 UI 还逐项切换并截图，组合状态也导出为 `qcut-ui-combined.mp4`。

智能工具测试在可见 QCut 中导入真人源片，通过本地 MediaPipe 得到 `12` 个采样点、`100%` 进度和 `ready` 状态，再分别生成运镜、裁剪和追踪关键帧。三份输出均不同于同源基线。

剪映侧不是读取草稿猜结果：七项像素功能和三项智能功能都经过真实 UI 操作与实际 H.264 导出。智能运镜第一次因为未启用总开关而与基线几乎相同，量化检查发现后已重跑；最终 SSIM 从 `0.999978` 变为 `0.861345`。

## 关键差距

1. **SAR 几何处理**：挑战源含非方形像素；QCut 基线导出 `1080 x 1920`，剪映导出 `1080 x 1980`。两边需要统一显示宽高策略后才能严格逐像素对打。
2. **模型命名**：QCut 的防抖、降噪、补帧和超分分别是 `deshake`、`hqdn3d`、`minterpolate`、Lanczos + unsharp，不应标成剪映 VAS、ByteNN、UMVFI 或 AI 超分模型本体。
3. **眼神语义**：QCut 做眼部细节增强，不做 gaze-to-camera；产品文案必须保持“实验室”并明确边界。
4. **智能裁剪语义**：QCut 当前围绕主体生成变换关键帧，剪映可明确指定目标比例。这是下一项产品差距。

## 本轮发现并修复

1. 原生 CLI 导出现在会读取完整 enhancement、portrait 和 frame-interpolation 快照。
2. CLI mutation ACK 会等待状态持久化，避免“命令成功但导出还是旧值”。
3. enhancement 滤镜在最终画布适配前执行，避免先缩放后处理造成错误结果。
4. contain 适配会先裁掉舍入溢出再 pad，修复一像素越界。
5. 动态变换尺寸向上对齐偶数，修复真人智能运镜触发的 YUV 奇数尺寸导出失败。
6. E2E 增加同源基线、导出哈希、CLI 回读 JSON 和非黑画面门禁。
7. 补帧前加入两帧克隆前视上下文，修复 `minterpolate` 丢失尾帧；E2E 现用 `ffprobe` 强制每份 QCut 输出为 `90` 帧 / `3.000s`。

## 证据入口

- [30 秒四宫格同步对比视频](./evidence/real-video-matrix/qcut-jianying-feature-comparison.mp4)
- [十项对比总览图](./evidence/real-video-matrix/qcut-jianying-feature-contact-sheet.png)
- [机器可读指标与全部媒体探针](./evidence/real-video-matrix/qcut-jianying-real-video-metrics.json)
- [QCut 像素功能 CLI / UI 证据](./evidence/real-video-matrix/qcut-pixel-matrix-evidence.json)
- [QCut 真人追踪与关键帧证据](./evidence/real-video-matrix/qcut-smart-tools-evidence.json)
- [QCut 组合 UI 截图](./evidence/real-video-matrix/20-qcut-ui-combined-features.png)
- [剪映本地降噪 UI](./evidence/real-video-matrix/34-jianying-denoise-local-ui.png)
- [剪映超分完成 UI](./evidence/real-video-matrix/38-jianying-super-resolution-complete.png)
- [剪映智能运镜完成 UI](./evidence/real-video-matrix/43-jianying-smart-motion-clean-ui.png)
- [剪映 16:9 智能裁剪 UI](./evidence/real-video-matrix/44-jianying-smart-crop-16x9-clean-ui.png)
- [剪映真人头部追踪 UI](./evidence/real-video-matrix/45-jianying-face-tracking-clean-ui.png)

## 重跑命令

```bash
bun x playwright test apps/web/src/test/e2e/media-lab-real-video-matrix.e2e.ts
bun run research/jianying-basic-video-probe/measure-real-video-matrix.ts
bun run research/jianying-basic-video-probe/build-real-video-comparison.ts
```

剪映部分需要安装的真实剪映应用和同一份素材，按截图中的每项独立时间线重跑。量化脚本只接受实际导出文件，不把 UI 截图当成像素效果证明。
