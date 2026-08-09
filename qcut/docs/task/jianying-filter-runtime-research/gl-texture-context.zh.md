# GL 纹理上下文对齐

记录时间：2026-08-09

## 问题定位

最初的 EGL/GLES 探针可以创建 Effect handle、初始化运行时并加载 Effect 包，但目标纹理没有得到有效画面。输出日志显示输入 2D 纹理不可加载，运行时改用零纹理。

符号绑定检查给出了直接原因：目标 Effect 库的 `_glBindTexture`、`_glIsTexture`、`_glTexImage2D`、`_glFramebufferTexture2D` 和 `_glReadPixels` 均来自 macOS `OpenGL.framework`，而探针的纹理来自另一套 EGL/GLES context。相同的整数纹理 ID 不代表相同的 GPU 对象。

## 验证矩阵

| 图形路径 | GL 版本 | 纹理可见 | Shader | 目标纹理 |
| --- | --- | --- | --- | --- |
| 缓存 EGL/GLES3 | OpenGL ES 3 | 否 | 可进入处理 | 保持测试种子 |
| CGL legacy | OpenGL 2.1 Metal | 是 | GLSL 330 编译失败 | 黑帧 |
| CGL 3.2 core | OpenGL 4.1 Metal | 是 | 成功 | 有效滤镜输出 |

这表明“同 context”是必要条件，但不是充分条件。context profile 还必须满足运行时生成的桌面 GLSL 版本。

## 工作调用顺序

```text
创建 CGL 3.2 core context
  -> CGLSetCurrentContext
  -> 用 OpenGL.framework 创建 sourceTexture
  -> 用 OpenGL.framework 创建 targetTexture
  -> 创建 Effect handle
  -> 执行正式 SDK 所要求的授权步骤
  -> 设置 render API
  -> init(width, height, modelDirectory)
  -> set_width_height(width, height)
  -> set_orientation(orientation)
  -> set_effect(effectPackageDirectory)
  -> 每帧 algorithm_texture(sourceTexture, timestamp)
  -> 每帧 process_texture(sourceTexture, targetTexture, timestamp)
  -> targetTexture 挂载同一 context 的 framebuffer
  -> glReadPixels 验证
  -> 销毁 handle、纹理和 context
```

必须保持以下不变量：

1. source 和 target 是两张独立、同尺寸的 `GL_TEXTURE_2D`。
2. 纹理创建、SDK 初始化、素材加载、算法、渲染和读回使用同一个 current context。
3. 上述生命周期位于同一个线程。
4. 每次 SDK 调用后检查 context、`glIsTexture` 和 `glGetError`。
5. 不能只根据接口返回零判定成功，必须读回并比较目标像素。

## 本地验证数据

64x64 RGBA 校准图测试结果：

| 测试包 | process | GL error | 与输入绝对差值 | 与洋红种子绝对差值 | 输出像素和 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 纯 LUT A | 0 | 0 | 152,005 | 1,519,511 | 2,680,185 |
| 纯 LUT B | 0 | 0 | 188,482 | 1,554,580 | 2,606,348 |
| 纯 LUT C | 0 | 0 | 231,673 | 1,563,697 | 2,664,175 |

三份输出互不相同。纯 LUT A 重复运行得到完全相同的 SHA-256，说明当前输入下输出具有确定性。原始二进制、滤镜包、输出图片和完整日志只保留在仓库外的本机研究目录。

## 人像算法图

人像区域滤镜的配置声明以下逻辑依赖：

```text
source texture
  -> resize/blit
  -> face detection
  -> skin segmentation
  -> mask texture
  -> background LUT / skin LUT blend
  -> target texture
```

无脸校准图测试观察到：

- `tt_face`、`tt_face_extra`、`tt_skin_seg` 均被模型目录解析；
- 三个模型均报告加载成功；
- 第一帧异步加载期间算法结果未就绪；
- 第二帧起算法调用、效果处理和 GL 状态均成功；
- 目标纹理产生非零输出。

因为输入不含真人，这不能证明人脸结果或 skin mask 正确。下一项验证应使用一张授权真人测试图，并同时生成：

1. 原图；
2. 背景路径输出；
3. 人像区域滤镜输出；
4. mask 可视化；
5. 有模型与禁用模型时的差值图。

只有 skin mask 能与人物皮肤位置对齐，并且双 LUT 输出可重复，才能把人像路径记录为成功。

## 产品边界

本次成功证明的是本机互操作性和 GL 设备要求，不代表第三方二进制可以进入 QCut 产品。QCut 产品路径仍应是：

- 纯 LUT：QCut 自有严格解析器、3D texture 和混合 shader；
- 人像滤镜：获得授权或 QCut 自有的人脸/皮肤分割模型；
- 回归测试：使用 QCut 自有测试素材和可提交的比较指标；
- 第三方缓存：仅作为仓库外的行为参考，不提交、不上传、不分发。
