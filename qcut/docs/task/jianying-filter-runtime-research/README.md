# 剪映滤镜运行时互操作性研究

记录时间：2026-08-09

## 范围

本目录只提交 QCut 自有的研究文字和探针源码，用于记录剪映滤镜包的运行时行为、GL 纹理上下文要求和可复现实验方法。

本目录不包含，也不得后续加入：

- 剪映、火山引擎或其他第三方的 `.dylib`、Framework、可执行文件；
- `tt_face`、`tt_face_extra`、`tt_skin_seg` 等模型文件；
- 滤镜包、LUT、Shader、Lua、纹理、Scene、Material 或序列化资源；
- 剪映缓存数据库、原始运行日志或应用配置；
- 本地编译产物、PPM/PNG 输出和其他二进制证据。

需要复现实验时，应由研究者在仓库之外提供自己有权使用的 SDK、模型和素材。不得从本目录推导出重新分发第三方运行时的许可。

## 已确认结果

旧探针使用缓存中的 EGL/GLES 创建纹理，但目标 Effect 库的 GL 符号绑定到 macOS `OpenGL.framework`。两套 context 不共享 GLuint 命名空间，导致输入纹理被视为不可加载。

新的 CGL 探针验证了以下工作组合：

```text
CGLContextObj
  + OpenGL 3.2 core profile
  + OpenGL.framework 创建的独立 source/target GL_TEXTURE_2D
  + 同一个 current context
  + 同一个调用线程
```

在测试机器上，该配置得到 OpenGL 4.1 Metal。三个不同的纯 3D LUT Effect 包都满足：

- 输入和输出纹理在调用前后均通过 `glIsTexture`；
- `bef_effect_process_texture` 返回成功；
- 每帧 `glGetError` 为零；
- framebuffer 完整；
- 目标纹理相对输入和预填测试颜色均发生非零变化；
- 不同包产生不同输出，同一包重复运行得到逐字节一致输出。

OpenGL legacy profile 只有 2.1，无法编译运行时生成的 GLSL 330，因此不能作为替代方案。

## 人像算法边界

使用不含人脸的校准图加载一份人像区域滤镜时，运行时成功解析并加载了逻辑模型 `tt_face`、`tt_face_extra` 和 `tt_skin_seg`。异步素材加载完成后，算法与渲染调用都返回成功。

这只证明模型定位和算法图生命周期可以启动，尚未证明：

- 真人面部检测结果正确；
- skin segmentation mask 的空间方向和数值正确；
- 背景 LUT 与皮肤 LUT 的区域混合和剪映输出一致；
- 当前调用满足正式 SDK 的授权和分发要求。

完整技术记录见 [gl-texture-context.zh.md](gl-texture-context.zh.md)。可复现探针源码见 [effect-cgl-render-probe.cpp](probes/effect-cgl-render-probe.cpp)。

## 探针用途

探针通过动态符号加载研究接口，只用于本机互操作性验证，不是 QCut 产品代码。它要求调用者显式传入本机路径：

```sh
./effect-cgl-render-probe \
  <effect-library> \
  <model-directory> \
  <effect-package-directory> \
  <output.ppm> \
  core32
```

产品实现应优先采用 QCut 自有 LUT 解析、渲染和获得授权的人像分割能力，而不是打包或调用剪映私有二进制。
