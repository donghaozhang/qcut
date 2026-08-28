# QCut 人物抠像差距收敛记录（2026-08-28）

## 本轮结论

QCut 的 object 路线现在分成两条身份独立的执行路径：固定 D634 runtime 的 exact Bach worker，以及不依赖剪映私有宿主的 same-model CoreML fallback。exact worker 不再经过已证伪的 Swing Effect handle；它在隔离进程内用已审计的 `TECVPixelBufferFrame` 与 `TEBachMattingAlgorithm` 具名导出执行原 Bach graph。fallback 则从已校验 SHA-256 的 `video_saliency_seg_bce` packed model 提取 `20440.3_sod_fp16.mlmodelc` 到私有缓存，直接用 CoreML 执行相同网络。模型和剪映二进制均不进入仓库。

packed graph 的输入输出契约已还原并实现：RGBA 源帧直接双线性缩到 256×256，再按 BGR/NCHW 和 `/255` 生成 `data`；网络同时接收 `prev_img [1,3,256,256]` 与 `prev_mask [1,1,256,256]`，输出 `nn_3 [1,1,256,256]`。首帧两个状态为零，连续帧使用上一帧归一化图像和上一帧原始 `nn_3`。exact worker 随后把 raw 256 Mask 交给固定版 `TEMattingBlendEffectV2`，由 vendor `FastBlend` 输出源尺寸 Alpha；fallback 才使用 QCut 自有 resize。该 graph 内没有人脸节点或人脸输入。

这一输入链来自 Bach 进程内的 CoreML raw capture，而不是 graph 尺寸字段推测。对同一首帧，最可信实现是源 RGBA 按 half-pixel 坐标直接双线性缩到 256，再以 `floor(value + 0.5)` 取整：归一化 MAE 为 `0.000343492`，最大误差为 `1/255`，`196608` 个元素中 `179387` 个逐灰阶相同（`91.2409%`）。旧的 `source → 288×512 → 256` 两段缩放 MAE 为 `0.005591259`、最大误差为 `96/255`，已被证据排除并从产品 fallback 删除。direct CoreML 的能力身份因此升级为 `source-rgba-direct-256-v2`，processor/cache 指纹同步换代。剩余单级 `±1` 灰阶差异仍使 fallback 不能称为 Bach bit-exact。

`cacheOffset:0` 的时序语义已经由连续两帧动态 capture 最终确定，不再只依赖静态字段或输出 A/B。首帧 `prev_img`、`prev_mask` 全零；第二帧 `prev_img` 与首帧 `data` 逐字节相同，第二帧 `prev_mask` 与首帧 ByteCoreML `nn_3` 逐字节相同。该 capture 是把只读 CoreML hook 注入当前 QCut Bach bridge 的隔离 worker 后取得，不是剪映 GUI capture，也不是单帧 frame probe。此前 60 帧真人 A/B 仍作为结果侧交叉验证：上一帧语义的 MAE/IoU 为 `2.1942/255`、`0.997186`，优于错误的当前帧语义 `2.3791/255`、`0.996814`。

固定版本的 native route 为 `video-object-jianying-bach-v2-exact-d634-v1`，产品 provider/pipeline 为 `qcut-jianying-video-object-bach-v2-exact-d634-v1`；它们只接受匹配的 runtime UUID/SHA、graph SHA、model SHA、V2 capability marker、config ID，以及本机 runtime manifest 全部 23 个私有 Framework dylib 的逐文件 SHA。闭包 identity 是 `jianying-runtime-framework-closure-d634-v1-e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e`。它不是跨剪映版本、macOS 或 GPU 的通用 ABI。blend identity 为 `TEMattingBlendEffectV2-vendor-exact`。默认 refinement identity 是 `vendor-v2-exact-no-qcut-refinement-v1`；只有用户显式改变高级参数时，才在 V2 源尺寸 Alpha 之后进入 `qcut-alpha-refinement-after-vendor-v2-v1`。无私有宿主的 provider 仍明确为 `qcut-video-object-same-model-coreml-v1`，能力角色记录为 `private-host-independent-fallback`。旧 Effect host interop 只保留为质量门禁候选和回退诊断。

QCut 仍保留完整流 Alpha 质量门禁。旧 host interop 若再次产生 `0/1/2` 坏 Alpha，会自动回退 GRU + Vision；direct CoreML 接线曾在真实产品 render 中完成 60 帧推理、VP9 Alpha 编码，并返回：

```text
requested=video-object
actual=video-object
provider=qcut-video-object-same-model-coreml-v1
pipeline=qcut-video-object-same-model-coreml-v1
refinement=qcut-same-model-graph-output-v1
didModelRouteFallback=false
frames=60
```

该旧 E2E 只证明 fallback 的产品接线、时序与编码链可运行。当前 fixed Bach+V2 产品路径已另用同一段 60 帧真人宽景完成正式 Electron E2E：`1/1 passed (22.1s)`，首轮真实执行 exact helper、第二轮命中独立新缓存，两轮均返回 `provider/pipeline=qcut-jianying-video-object-bach-v2-exact-d634-v1`、`blend=TEMattingBlendEffectV2-vendor-exact`、`refinement=vendor-v2-exact-no-qcut-refinement-v1`，且 `didModelRouteFallback=false`。完整证据见 [固定版同算法验收](./jianying-person-cutout-exact-bach-v2-2026-08-28.zh.md)。

## 旧 Object host interop 注册与诊断边界

本轮没有把未验证的私有 ABI 接进产品。静态调用链确认 `bef_effect_init(..., modelDir, ...)` 已在内部创建普通 file resource finder；改成显式调用同一个 finder 不会改变解析语义。其他可见入口也不能直接当作缺失拼图：Bach finder 创建入口依赖 Effect/host helper，JavaScript resource finder 只是 URL 回调，assigned-model API 映射的是逻辑 key/name，而不是已证明可替代剪映宿主的 physical-model/设备注册。

真实包与 QCut 生成包的 A/B 又给出更强的运行证据：真实 root `config.json` 通过 `Link: matting` 声明五个候选模型，`ai_matting_video_object` 子目录只含 graph；QCut 的 standalone 包直接声明 object graph。两条都能解析同一模型、进入同一后端，也都得到相同的零输入纹理告警和 `0/1/2` Alpha。因此当前不应继续把“模型名日志为 null”单独解释成模型未加载，更不能仅凭 Effect C API 返回 0 宣称 provider 成功。

QCut 仍把旧 Effect host 路径显式标为 `output-gated-candidate`，诊断能力记录普通 file resolver、QCut standalone effect、未复现的 host Effect registry 和 C API texture 输入；该描述进入独立 capability 指纹。它与已验证的 `same-model-coreml` provider 分开，不能污染 direct CoreML 的 provider、pipeline 或缓存身份。只有同时包含质量 capability marker 与整段 hostless `0/1/2` 特征的错误才打开旧路径 circuit；其他结果提取失败、取消或瞬时错误仍逐任务 fail closed 回退 GRU + Vision。

本轮继续完成了两条输入传输 A/B：

- `QCUT_JIANYING_ENGINE_CONTEXT_PROBE=1` 能绑定 `HTSGLContext.sharedImageProcessingContext`，但独立进程随后报告 `RenderDeviceGLES30 createSharedContext() failed` 并停止推进。该路径只保留为显式诊断探针，生产默认不启用。
- ARM64 真实调用点确认私有 buffer ABI 为 `algorithm_buffer(handle, width, height, data, format, timestamp)`；RGBA format `0` 与[官方 Effect SDK 像素格式](https://docs.byteplus.com/en/docs/effects/docs-c-api)一致。真实 wrapper 会先取得/刷新一对 16-byte new requirement。QCut 的 standalone Bach graph 即使在 `effectSet` 后等待并用 texture 入口激活，`get_new_requirment` 仍返回 `0/0`，直接 buffer 调用返回 `2`，没有进入模型推理。因此缺口进一步收敛为剪映宿主注入的 requirement/设备输入状态，而不是 buffer 指针、宽高或 RGBA 枚举；该 canary 也只在 `QCUT_JIANYING_BUFFER_INPUT_PROBE=1` 时运行。

继续替换相同 file resolver、重复改 `model_names` 或伪造另一份 standalone `config.json`，现有证据预计不会改变结果。下一项有效实验是从剪映真实 render 调用截获这对 requirement，或在同 RLDevice 中构造 device texture；在此之前不把猜测 ABI 放进默认 provider。

## 实现变化

### Same-model CoreML provider

- packed model 必须匹配固定 SHA-256；提取后还会验证 `data`、`prev_img`、`prev_mask`、`nn_3` 的 metadata tensor contract。
- 缓存命中不重读 packed model；损坏缓存会原子替换，并发提取只接受最终通过 schema 验证的 bundle，不会删除另一个调用已经发布的有效缓存。
- direct provider 不再要求 `libcccreator.dylib`、真实 effect graph 文件或私有宿主 framework 存在；这些只属于旧 host interop fallback。
- native bridge 逐帧保存上一帧 image/mask 状态，reset 会同时清零两者；`QCUT_VIDEO_OBJECT_RESET_FRAMES` 只作为测试/seek 语义探针。
- 精细默认参数 `0.5/0/0/0` 保持 raw graph output；额外 QCut refinement 使用不同 pipeline id，避免把自主后处理伪装成剪映原始蒙版。
- packaged direct bridge 必须包含 `video-object-same-model-coreml-v1`；它只校验 tensor shape、finite 与 clamp，不能套用 hostless `0/1/2` 启发式。Alpha 质量 marker 只属于旧 host interop bridge。

### 自动路由

- `auto` 不再直接返回 GRU；它会解析 object runtime、完整检测所有抽样帧，再按实际决定选择运行时。
- 比例严格按 `facePositiveSampleCount / validSampleCount` 计算，不再遇到第一张脸就提前结束。
- 任一抽帧、解码或检测失败都会使整次路由 fail closed，避免用部分样本错误切换模型。
- 路由失败和 Blend 失败分层回退；object 失败后，GRU 会重新使用自己的稳定 Blend 选择，不会继承 object 的执行状态。
- object bridge 每帧前恢复 QCut 自有 OpenGL context，避免 vendor effect 切换 context 或残留 GL error 让第 2 帧纹理更新误失败。
- Alpha 门禁在完整流结束后判定；合法空画面不误回退，只有完整流 `0/1/2` 量化噪声才标记 hostless。
- 同一 bridge capability 一旦命中明确的坏 Alpha 能力标记，本次 App 会话内会打开 circuit breaker；后续自动任务直接走 GRU 缓存，不再重复付出已知无效的 object graph 成本。capability 指纹不含画幅，bridge/model/library/graph 更新才会自动重新探测；诊断环境也可显式要求重试。
- object 子进程若连续 20 秒没有任何 stderr/progress 活动，会被终止并自动切换 GRU + Vision，避免私有 context 或设备初始化卡住整项任务。
- engine-context 与 CPU-buffer 两条宿主输入实验均为显式 opt-in；生产默认继续使用已验证的 standalone texture、完整 Alpha 门禁和回退链。
- 结果同时保存 `requestedModelRoute`、`modelRoute` 和 `didModelRouteFallback`。
- 自动抽帧、face detection、ffprobe 与单个订阅者等待均支持取消；相同 Alpha 的共享构建不再被第一个调用者取消后连带中断。

### 结果身份与缓存

- Provider 改为真实的 `qcut-local-person-matting-v1`，不再把 GRU + Vision 标成完整剪映宿主。
- Pipeline 明确区分 GRU + Vision、GRU-only、已验证 same-model CoreML、显式 QCut-refined CoreML、实验性 host interop 和实验性 saliency script。
- Alpha 缓存升级到 v4；manifest 新增 `providerId`、`pipelineId`、`refinementProvider` 和整份 `alpha.gray` 的 SHA-256。
- 缓存命中会验证 Alpha 长度和内容哈希，能拒绝“长度正确但内容损坏”的文件。
- 源视频优先使用声明/实读帧数，缺失时才按时长与帧率估算；Alpha 帧数必须满足对应容差，成功退出但中途截断的 stream 不能写入缓存。
- Blend 实现不再参与预合成 Alpha 缓存键。native/compatible 的语义 Alpha 相同，不再因合成诊断路径重复推理。
- Processor 指纹加入实际 `libcccreator.dylib` 内容哈希；Vision 是否启用也进入 pipeline 与 processor 身份。
- 透明视频 metadata 写入实际 provider、pipeline、route 和 refinement，不再只写模型名。

### GPU 与 CPU 往返

持久缓存保存的是合成前的语义 Alpha。旧 native 路径每帧把源图和 Alpha 上传 GPU，再回读完整 RGBA，但后续只保留回读 Alpha；这在当前 CPU VP9 Alpha 编码链中没有形成零拷贝，反而增加往返。

现在的策略是：

- 生产默认使用 compatible 路径生成同一语义 Alpha；
- 私有 native Metal 只在显式诊断开关下启动，并用一帧验证私有 ABI、设备链和像素公式；
- 首帧通过后，其余帧直接在 CPU 以已经逐字节验证的 `sourceAlpha × matte / 255` 公式写缓存；
- 同尺寸 Alpha resize 直接复制；最大位移为 0 时跳过平移搜索；时序衰减由逐像素 `pow` 改为逐参考帧预计算；
- bridge 输出分阶段计时 JSON，分别记录 GRU、Vision、resize、postprocess、native canary 和 cache write。
- 静默透明 WebM 明确写入 `hasAudio=false` 后，预览不再额外启动隐藏的原视频 audio decoder；旧素材缺少 metadata 时仍保留兼容回退。

这不等于端到端 GPU 零拷贝。真正的零拷贝仍需要预览直接消费设备纹理，或编码器直接接收 GPU/CVPixelBuffer，而不是把 Alpha 写成 CPU 灰度缓存后交给 `libvpx-vp9`。

## Raw capture 与真人基准

### Source → 256 resize 规则

对 SHA-256
`bb6ac4b70ab4ae5b683fdeb43faf082051098bc72192f1fd947806c39bb4333d`
的首帧 360×640 RGBA，与 `coreml-0000-data.bin` 的 BGR/NCHW float32
比较结果如下。MAE 与最大误差均以 8-bit 灰阶计：

| 候选 | MAE | 最大误差 | 逐值相同 |
| --- | ---: | ---: | ---: |
| direct half-pixel，`floor(v + 0.5)` | **0.0875905** | **1** | **179387 / 196608（91.2409%）** |
| direct half-pixel，banker's rounding | 0.0926208 | 1 | 178398 / 196608 |
| direct half-pixel，floor | 0.363022 | 1 | 125235 / 196608 |
| direct align-corners 最优 | 1.652903 | 94 | 78324 / 196608 |
| direct asymmetric 最优 | 3.426290 | 148 | 51074 / 196608 |
| two-stage half-pixel 最优 | 1.401647 | 96 | 88109 / 196608 |
| 产品旧 two-stage half-pixel/round | 1.425771 | 96 | 84235 / 196608 |

真实 `vImageScale_ARGB8888` direct 默认路径为 MAE `1.424276`、最大误差
`83`；FFmpeg swscale 候选中最好的 area 为 MAE `1.116948`、最大误差
`59`。VideoToolbox 解码出的首帧也没有缩小残差：同一 direct half-pixel/round
变成 MAE `0.109426`、最大误差 `3`、逐值相同 `89.5218%`。因此当前最可信规则是：

```text
sx = (dx + 0.5) * sourceWidth  / 256 - 0.5
sy = (dy + 0.5) * sourceHeight / 256 - 0.5
u8 = floor(bilinear(source, sx, sy) + 0.5)
tensor = BGR(u8) / 255, NCHW
```

在 360→256 与 640→256 这组比例上，6 bit 以上的 OpenCV-style 定点权重
与 float half-pixel 得到相同候选，现有 capture 无法再区分二者。剩余 `±1`
也不能由一个全局取整阈值解释，更可能来自剪映 frame reader 的颜色转换或内部
整数 kernel；它不再阻塞 exact Bach worker，因为 exact worker 直接复用同一 Bach
preprocess，只影响独立 CoreML fallback 的 bit-exact 声明。

完整 resize 比较日志保存在
`/private/tmp/qcut-resize-forensics-20260828-144456.log`，SHA-256 为
`e37bd02ea28d138bcd26cea3aa3cfdb3c8533f5f33e469df5bdb6e73ee673316`。

### 两帧 temporal capture

本次 capture 目录为
`/private/tmp/qcut-jy-coreml-capture-20260828-144456`。被测对象是从当前产品源
`electron/jianying-person-cutout/native/video-object-bach-bridge.mm` 编译出的隔离
Bach bridge；`coreml-feature-capture.mm` 仅作为只读 hook 注入该 worker，记录
`MLDictionaryFeatureProvider` 输入。它不是剪映 GUI 进程，也不是早期单帧
`qcut-jy-bach-frame-probe`。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `capture.log` | 391 | `f3a8f1da3911e9ce4dfe9ce4e617469fa59bcf4a29b36c27e436435d8c8b23a5` |
| `coreml-0000-data.bin` | 786432 | `209e3e1a88dc2464eee4d35575850cade736b8a916ae1125b1d7dffed77af801` |
| `coreml-0000-prev_img.bin` | 786432 | `599c1bb5ffd4b87229a81958f33f1060821cd01cd7aa7ccafa0d862f4522f3f6` |
| `coreml-0000-prev_mask.bin` | 262144 | `8a39d2abd3999ab73c34db2476849cddf303ce389b35826850f9a700589b4a90` |
| `coreml-0001-data.bin` | 786432 | `cc74c2458883139c3fe54e2f8f2734e88a6bbe1d91fc1f6ada9bdaf8e1603bff` |
| `coreml-0001-prev_img.bin` | 786432 | `209e3e1a88dc2464eee4d35575850cade736b8a916ae1125b1d7dffed77af801` |
| `coreml-0001-prev_mask.bin` | 262144 | `18914e224988222bf3f47b1bf07ef9c71b877c278c21b8c986f751fcbba43a07` |

`coreml-0000-prev_img.bin` 和 `coreml-0000-prev_mask.bin` 分别为全零
`196608`/`65536` floats。`coreml-0001-prev_img.bin` 与
`coreml-0000-data.bin` 不只是数值相等，而是 SHA 与所有 bytes 完全相同；
`coreml-0001-prev_mask.bin` 也与先前首帧 ByteCoreML 输出
`bytecoreml-nn_3.bin` 的 SHA
`18914e224988222bf3f47b1bf07ef9c71b877c278c21b8c986f751fcbba43a07`
完全相同。这直接证明第二帧输入的是上一帧 image 与上一帧 raw `nn_3`。

输入两帧 RGBA SHA-256 为
`aad9a96c96f2c40ba1e3f0117bcb1aa8628546cd61a8ae25438eba58fe66f38e`；
该次历史输出仍使用 QCut 双线性放大；`/private/tmp/qcut-jy-bach-two-frame-alpha-20260828-144456.gray` 为
`460800` bytes，SHA-256
`092b2f8c362868a2dc6d601b6561c41e56d705069af8ae98ccf143f376a5332b`。
完整执行日志在 `/private/tmp/qcut-jy-bach-two-frame-20260828-144456.log`
（SHA-256
`fc6b238de9ea5ea7f80bfcf398516a4f9e6804daf5044b9516a797476429aa16`）。
该日志属于 V2 接入前的历史 bridge，只用于 raw Bach/temporal 证据，末尾为：

```text
progress frame=1 total=2
progress frame=2 total=2
ok width=360 height=640 frames=2 route=video-object-jianying-bach-d634-v1
```

### Bach raw256 → vendor V2 source Alpha

当前 exact helper 已把上述 raw mask 接入同一固定版 `TEMattingBlendEffectV2`。
同一两帧真人输入的 source-size Alpha 为 `460800` bytes，SHA-256
`dca0f2912ba0188939737920b18c66834d7354aca7e11b8c906d4effd85f6c3e`；
无可选参数与显式 `0.5 0 0 0` 逐字节相同。首帧 SHA-256
`e8ad4c25d5d1a4dc0cc6a559686c14d98d411e43918c45d8c3249f4a56d3ba97`，
与独立 V2 probe 输出完全相同。

60 帧输出为 `13,824,000` bytes，SHA-256
`f1a113fc4b4330e9c405508253848376bf60b6f9b0eddcbddb712abdf0cc7b91`；
两次运行逐字节一致。旧 QCut resize 的 60 帧 SHA-256 为
`589b1e55c8ec7265b3fc00ab55bb5e4d5ab3009e54602b345324f9553cdd3c8c`；
两者 `168640/13824000` 像素不同，且全部只差 `1`，u8 MAE `0.0121991`、
soft IoU `0.99993001`。单次同机 wall-clock 为 vendor V2 `1.07s`、旧 resize
`0.94s`。最终升级为完整 23-dylib Framework 闭包门禁后，60 帧输出 SHA 不变，
单次 wall-clock 为 `1.10s`；只执行所有 SHA 门禁、在 `dlopen` 前因缺失输入退出的
warm-cache 测量为 `0.61s`。

闭包按 basename 排序的 `basename=sha256\n` digest 为
`e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e`。
native 在 `dlopen` 前逐文件校验主 `libcccreator` 与其余 22 个 Framework；把临时
快照中的间接依赖 `libIESAppLogger.dylib` 截断后，worker 以退出码 1 拒绝并报告
该文件 SHA 不匹配。系统 Framework、CoreML、GPU 驱动和硬件仍是宿主环境边界。

默认成功日志明确为：

```text
ok width=360 height=640 frames=60 route=video-object-jianying-bach-v2-exact-d634-v1 blend=TEMattingBlendEffectV2-vendor-exact closure=jianying-runtime-framework-closure-d634-v1-e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e refinement=vendor-v2-exact-no-qcut-refinement-v1
```

非默认 `0.6 0.2 1 2` 在 V2 后执行 refinement，2 帧输出 SHA-256 为
`ace77edac0f73dd5415311e23b14f7f0f3d21ac5809d721946a3baa49b7e5e74`，
并报告 `qcut-alpha-refinement-after-vendor-v2-v1`，不会冒充默认 exact。

异常清理也做了真实流式故障注入：输入一帧再附加一个残缺字节，helper 先完成第一帧，
随后以 `video-object input ended mid-frame` 返回 1，并按
`V2 -> restore Engine context -> Bach` 顺序完整销毁。context 恢复失败会终止隔离
进程，由 parent fallback 接管。

### Bach `nn_3` 对 graph `saliency_mask`

新的只读 hook 直接截获 `IESMMProcessNN::doDictPredictionWithOptions:error:`
返回的 ByteCoreML `nn_3`，不再用 standalone CoreML replay 代替 vendor backend。
完整两帧 capture 位于
`/private/tmp/qcut-jy-coreml-capture-20260828-1444`：

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `bytecoreml-0000-nn_3.bin` | 262144 | `18914e224988222bf3f47b1bf07ef9c71b877c278c21b8c986f751fcbba43a07` |
| `bytecoreml-0001-nn_3.bin` | 262144 | `a6febb781f79279295a55018a0a4882cb3c374e13169f428f9df787356da4a59` |
| `coreml-0000-data.bin` | 786432 | `209e3e1a88dc2464eee4d35575850cade736b8a916ae1125b1d7dffed77af801` |
| `coreml-0000-prev_img.bin` | 786432 | `599c1bb5ffd4b87229a81958f33f1060821cd01cd7aa7ccafa0d862f4522f3f6` |
| `coreml-0000-prev_mask.bin` | 262144 | `8a39d2abd3999ab73c34db2476849cddf303ce389b35826850f9a700589b4a90` |
| `coreml-0001-data.bin` | 786432 | `cc74c2458883139c3fe54e2f8f2734e88a6bbe1d91fc1f6ada9bdaf8e1603bff` |
| `coreml-0001-prev_img.bin` | 786432 | `209e3e1a88dc2464eee4d35575850cade736b8a916ae1125b1d7dffed77af801` |
| `coreml-0001-prev_mask.bin` | 262144 | `18914e224988222bf3f47b1bf07ef9c71b877c278c21b8c986f751fcbba43a07` |

对应 raw graph 输出
`/private/tmp/qcut-jy-bach-two-frame-raw-256.gray` 为 `131072` bytes，
SHA-256
`1e49daa89eeade3d40ece0d5ea6658bf2bbb016dfb3585a56f5b09c7af4473f0`。
两帧都满足：

```text
saliency_mask = round(clamp(nn_3, 0, 1) * 255)
```

逐帧均为 `65536/65536` 像素相同、MAE `0`、最大误差 `0`。旧的
`0.04414/255`、最大 `1/255` 是 standalone Apple CoreML replay 相对
ByteCoreML 的 backend drift，不是 graph `convert_2` 的量化差异。

为了排除 V2 构造时的 TERL context/ConfigID 改写 Bach 推理，最终
full-framework-closure capture worker 在构造 V2 后再次连续处理相同两帧；capture
目录为
`/private/tmp/qcut-jy-bach-v2-framework-closure-capture-final-20260828-1521`。
frame 0/1 `nn_3` SHA 仍分别为上述 `18914e...43a07` 与
`a6febb...a4a59`，相对 V2 接入前两个文件均 `cmp=0`。按 graph 规则量化后再与
历史 raw 256 mask 比较，`131072/131072` 像素完全相同，MAE `0`、最大误差
`0`。V2 初始化没有改变 Bach 原始 Mask，变化只发生在 raw Mask 后的 vendor
source-size 合成。

时序也产生了可观测结果：第二帧 warm raw mask SHA-256 为
`2ad1da78ee5ae715dd9bc803f3b433ba7b4fa07e8327bbd13adf931489f3dea4`；
把同一个 RGBA 帧放入新 worker 冷启动，SHA-256 为
`10da001c8db46377f21f32e39aab9393db6a45268a37b33d7203ffedc95519c9`。
两者 `23213/65536` 像素不同，u8 MAE `0.6737823486`、最大误差 `69`。

### 旧 two-stage Same-model CoreML 对重建剪映 Alpha（已废弃）

以下结果来自已经被 raw capture 排除的 `source → 288×512 → 256` 两段输入缩放，只保留为历史定位证据，不再代表当前 direct fallback，也不能作为新实现的 parity 数字。输入为同一段 360×640、30 fps、60 帧真人视频，参照 Alpha 是从剪映同段黑/白背景导出重建的 8-bit 代理，不是 `MP_ProcessBorder` 前的内部原始 tensor。

| 指标 | 结果 |
| --- | ---: |
| 全片 MAE | **2.194188 / 255** |
| 全片二值 IoU | **0.997186** |
| frame 0 MAE / IoU | 1.810460 / 0.999039 |
| frame 59 MAE / IoU | 8.422977 / 0.971162 |
| 输出 SHA-256 | `4fb1c2c6b7c81577298f724f0d2cd575cd2a7132d389ff69dd8d08dd7ff26703` |

frame 59 是该历史链的最弱帧，尾部差异可能同时包含错误的两段输入缩放、参照视频编码、帧对齐或尚未截获的图内后处理影响，不能单独归因到网络推理。reset 验证仍有效：在 frame 30 清零状态后，后 30 帧与从源 frame 30 冷启动的输出逐字节相同，MAE 为 0。

### 既有 GRU/Blend 性能基准

输入为同一段 360×640、30 fps、60 帧真人视频。先解码为同一 RGBA 文件，再分别连续运行三次 bridge；两条路径均启用 GRU + Vision。

| 路径 | 三次总耗时 | 中位数 | native canary 帧 |
| --- | --- | ---: | ---: |
| compatible | 6516.309 / 6570.317 / 6533.095 ms | **6533.095 ms** | 0 |
| native canary | 6577.883 / 6526.306 / 6445.312 ms | **6526.306 ms** | 1 |

修正后的 `total_us` 包含输出 flush、Vision/Metal/handle 释放与 `dlclose`，等于完整 bridge wall time。两条中位数只差 `6.789 ms`，约 `0.10%`，方向属于系统噪声，当前应表述为“性能持平”，不能宣称 native 加速。native 单帧 canary 本身三次为 `19.265 / 16.320 / 15.906 ms`。历史逐帧 native 实现的同类 60 帧结果曾慢约 `831 ms`；这足以确认逐帧 GPU 上传/回读已从当前缓存链移除。

六份 13,824,000 字节 Alpha 的 SHA-256 全部相同：

```text
7f36016c92476d48e6ef50376b1ae46955feb2c0d6e7f23dfbd0d4b215b1fbe3
```

这证明本轮性能调整没有改变输出 Alpha。

## Same-model 真人桌面 E2E（输入修正前的接线证据）

使用同一段 360×640、60 帧真人宽景，强制 `QCUT_PERSON_CUTOUT_ROUTE=video-object` 运行完整 Electron UI 流程，实际完成素材导入、精细抠像、Alpha 缓存、VP9 透明视频、时间线蒙版挂载、浏览器解码和播放器预览，结果为 `1/1 passed (23.8s)`。该次运行使用现已废弃的两段 resize；它只证明接线完整，不代表 source→256 v2 的当前画质或缓存结果。

- `requestedModelRoute=video-object`、`modelRoute=video-object`；
- `didModelRouteFallback=false`；
- `provider/pipeline=qcut-video-object-same-model-coreml-v1`；
- `refinementProvider=qcut-same-model-graph-output-v1`；
- 60 帧、2 秒、360×640、30 fps、VP9 Alpha、无音频；
- 浏览器解码 ROI：顶部背景 `0`、中心人物 `252.8691`；
- 第二次运行命中完整 Alpha 缓存，仍保持 same-model provider、无 route fallback，耗时 `4435 ms`（包含 VP9 重新编码）。

本地证据目录：

```text
/private/tmp/qcut-same-model-desktop-e2e-20260828/
```

其中包含三张 UI 截图、`desktop-person-cutout.webm` 与 `e2e-evidence.json`。这些真人素材和运行证据不进入仓库。

## 历史 host interop 真人桌面 E2E

完整 Electron E2E 分别使用近景和宽景真人片段，实际完成自动路由、60 帧 object graph、坏 Alpha 拒绝、GRU + Vision 回退、VP9 Alpha 编码、素材入库、时间线蒙版挂载、播放器解码，以及同一 App 会话的 circuit/cache 二次运行。最终两次均为 `1/1 passed`。

关键结果：

- 输出：2 秒、360×640、30 fps、60 帧 VP9，`ALPHA_MODE=1`；
- `requestedModelRoute=auto`；
- `modelRoute=portrait-gru`；
- `didModelRouteFallback=true`；
- `provider=qcut-local-person-matting-v1`；
- `pipelineId=qcut-gru-vision-fusion-v1`；
- 近景浏览器解码 ROI：人物核心 `223.77934`、前景手部 `255`、右上背景 `0`；
- 宽景浏览器解码 ROI：中心人物 `252.98184`、顶部背景 `0`；
- 截图目检中老人脸、头发、身体和搀扶人物均被保留。
- 同一 App 会话第二次执行中，近景耗时 `4071 ms`、宽景耗时 `5058 ms`，两者均为 `didModelRouteFallback=false`：circuit breaker 跳过已知坏 object capability，并明确观察到“人物蒙版缓存完整”后重新编码。该耗时包含 VP9 Alpha 重新编码，不等于纯缓存读取延迟。

证据目录：

```text
<仓库外 improve_voice 证据目录>/qcut-gru-real-person-test-2026-08-26/qcut-parity-gap-reduction-2026-08-28/desktop-near-route-gl-context/
<仓库外 improve_voice 证据目录>/qcut-gru-real-person-test-2026-08-26/qcut-parity-gap-reduction-2026-08-28/desktop-wide-route-final/
<仓库外 improve_voice 证据目录>/qcut-gru-real-person-test-2026-08-26/qcut-parity-gap-reduction-2026-08-28/desktop-auto-post-context-gate/
```

每个目录都包含 `desktop-person-cutout.webm`、三张桌面截图、`e2e-evidence.json` 和本地 `electron-runtime.log`；运行时日志只作为私有证据，不进入仓库。

## 当前剩余差距

1. **exact Bach+V2 内部链已逐字节闭环，direct CoreML fallback 仍非 bit-exact。** 产品 helper 与独立 vendor V2 probe 的真人首帧源尺寸 Alpha exact ratio `1`、MAE `0`、IoU `1`；V2 前后两帧 raw `nn_3` 也逐字节不变。direct CoreML 的 source→256 输入仍有单灰阶差异，因此只能作为独立身份的 fallback。
2. **cache cursor 提交顺序未完全静态还原。** previous-image 的选择有明确全片 A/B 支持，但仍需截获 `UpdateCacheIdx` 的真实调用顺序才能把 offset 语义完全锁死。
3. **自动模型路由仍需更多真实片段覆盖。** object route 已是同模型链；近景选择 GRU 时，QCut 的 GRU + Vision 仍是自主补洞，不代表剪映内部调用 Vision。
4. **还不是端到端 GPU 零拷贝。** direct CoreML 输入、Alpha 缓存和 VP9 编码仍经过 CPU；剪映可能在预览链内直接传递设备纹理/CVPixelBuffer。
5. **剪映缓存失效与预览策略没有完全复制。** 变速、倒放、源范围、切镜、`tt_matting_video_preview.model` 和预览/导出模型切换仍需单独动态样本。

## 验证门禁

- packed ZIP offset、tensor schema 拒绝、完整 manifest/hash 缓存命中、损坏修复、并发发布与活 PID 锁：9/9 定向测试通过。
- same-model/host capability 隔离、resolver fail-closed、processor/cache 身份、编译发布与 packaged marker 已进入 17 个 focused 文件、79 项测试并全部通过。
- CoreML native preprocess 测试以 `-Wall -Wextra -Werror` 在 Vitest 中真实编译运行；覆盖 source→256、BGR/NCHW、首帧零状态、advance/reset、合法低值 Alpha 与非有限值拒绝。
- 当前 `renderJianyingPersonCutout` 强制 exact video-object E2E 已完成 60 帧、无 fallback、VP9 Alpha 编码、桌面截图与第二轮 cache-hit；结果为 `1/1 passed (22.1s)`。
- 路由、取消、缓存、回退、无进度保护、计时、metadata、UI、签名和打包能力门禁均已通过；完整 fixed-version 结论与证据索引见 [固定版同算法验收](./jianying-person-cutout-exact-bach-v2-2026-08-28.zh.md)。
- 原生 Alpha resize、融合、时序、Vision、object Alpha 质量及两套 bridge 均通过编译/执行门禁，使用 `-Wall -Wextra -Werror`。
- 全仓 TypeScript：通过。
- Electron build：通过。
- Web production build：通过。
- 真人 Electron E2E：近景、宽景及最终默认 auto 回归各 1/1 通过；最终 auto 回归耗时 `28.4s`，包含 Alpha ROI、静默结果无隐藏 audio decoder、cache-hit 和第二次路由状态断言。

仓库只记录 QCut 自有代码、测试和结论；剪映 dylib、模型、原始动态日志及真人素材继续保存在用户本机，不进入版本库。
