# 普通多 Pass：`src1.png` 纹理重放

记录时间：2026-08-11

## 单一问题

本轮只验证一个问题：对明确读取额外纹理 `src1.png` 的“暗角旧影”，独立 Swing V2 宿主能否让剪映二进制自行完成纹理绑定、坐标变换、Alpha 混合、模糊中间纹理和多 Pass 调度，并复现剪映 UI 强度 100。

本轮不手工重写 shader，不替换纹理，不修改 sampler、颜色空间、Pass 格式或 AB 开关。宿主配置沿用上一轮已验证的配置，并显式注入：

```json
{"intensity": 1}
```

## 包证据

| 项目 | 值 |
| --- | --- |
| 滤镜 | 暗角旧影 |
| resource ID | `7647099764940557618` |
| package version | `29fec8019c1c3fb2e4d8606e10ebb39d` |
| package kind | `shader-or-effect-package` |
| 主要资源 | `lut0.png`、`src1.png`、filter/blur/corner material 与 shader |

`corner.frag` 明确声明 `sampler2D u_src1`，采样时翻转 Y 坐标，再按纹理 Alpha 合成：

```glsl
vec4 src1 = texture2D(u_src1, vec2(v_uv.x, 1.0 - v_uv.y)) * u_opacity;
base = src1 + base * (1.0 - src1.a);
```

包内 Lua 把统一强度同时映射到四个量：

- LUT 的 `u_intensity`；
- blur 的 `radius`；
- blur 的 `T`；
- corner 的 `u_opacity`。

所以这不是单 LUT 测试。结果同时覆盖额外纹理的坐标和 Alpha 语义，以及模糊和最终合成所需的中间纹理链路。

## 固定条件

- 输入和 UI 目标均为既有滤镜实验室的同一张 1280x720 无损图片；
- 首帧 update-mode 为 `0,1,1,2`，后两帧为 `1`；
- native texture flags 为 `001`；
- `EnableImageQuality=1`；
- `AlgorithmCacheFlag=9`；
- `enable_parallel_and_async_swing=1`；
- 使用完整 Effect 包，不复制或改写包内资源。

完整私有证据位于仓库外：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  multipass-src1/vignette-intensity-one-2026-08-11/
```

其中包含 `probe.log`、三张 RGBA 帧、`binary-v2.png`、`difference.png` 和 `metrics.json`。

## 结果

探针成功渲染 `3/3` 帧，feature 参数 API 返回 `0`。三个输出帧逐字节一致：

```text
4a75bc6e3a8fda7d7036b49a73a5b679d72d7f24c797b1ef1b556405730e76c0
```

与剪映 UI 强度 100 的无损 PNG 比较：

| RGB RMSE | PSNR | SSIM | Delta E | 状态 |
| ---: | ---: | ---: | ---: | --- |
| `0` | `100` | `1` | `0` | `verified` |

比较覆盖全部 `921,600` 个像素，RGB 完全一致。`difference.png` 为全黑差值图。PNG 文件哈希不同只来自编码容器，不是像素差异。

## 结论

本轮问题已经回答：**在完整包由剪映二进制执行时，`src1.png` 的 sampler、Y 翻转、Alpha 混合、模糊中间纹理和 Pass 调度都可以逐像素复现 UI，不需要 QCut 手工推导。**

结合上一轮“清透美食”的 `intensity=1` 精确对齐，普通多 Pass 的主要宿主协议已经收敛为：加载完整 feature 后显式发送 UI 强度参数。此前 QCut 用 FFmpeg/Web 近似时的误差来自替代实现，不代表原二进制无法复现。

这仍不代表可以合法分发剪映二进制或缓存资源，也不覆盖依赖人像算法的滤镜、视频跨帧状态和导出路径。

## 下一次唯一问题

普通多 Pass 暂停继续拆 shader。下一轮只回到人像路径，固定同一模型和同一输入，定位一项 `AlgorithmService`/model-clip 创建后配置，观察它是否改变模型选择、mask 字节或最终帧；不同时测试羽化、生命周期和导出 mode。
