# 电影柔光：独立 C++ 接入 QCut 预览与导出

日期：2026-09-06。此文记录本次新增产品入口、运行边界与开发验证，算法语义见 `research/independent-soft-glow/semantic-contract.zh.md`。本次不修改供应商 App，不将其二进制、LUT、Shader、Lua 或私有参考帧放入仓库。

## 身份与显示

| 字段 | 固定值 |
|---|---|
| resourceId | `7447126702137904420` |
| version | `9673f80b8e2f5a07f02f9ce1130b784a` |
| provider | `qcut-cpu-soft-glow-ui-snapshot-v1` |
| presetId | `qcut-independent-soft-glow-ui-snapshot-v1` |
| 强度语义 | `ui-snapshot` |
| 应用后的名称 | 电影柔光 · QCut CPU |
| 目录实现类型 | `cinematic-soft-glow` |
| 卡片标识 | 独立 CPU · 待验证 |

新卡位于已有独立滤镜目录。保留其他 Metal 卡的路由；不自动迁移时间线中旧 `jianying-local-effect-v1` 卡。`fidelity=native-local` 在现有接口里用于选择本机逐帧渲染路径，并不证明剪映 UI 对标已通过；本卡 `verification` 明确保持 `unverified`。

初次实验的 `qcut-cpu-soft-glow-v1` 描述符使用 `output-mix`。为避免静默改变持久化参数含义，新实现使用上表中的模式标识；旧实验卡明确提示重新应用。资源 `version` 仍是包版本，不挪作算法版本。

## 共用执行路径

1. 目录按精确 ID、版本与 `cacheStatus=cached` 识别此卡。`load` 检查自己的 helper 和本机外部 LUT；目录可见本身不代替就绪检查。
2. Electron 的既有 `qcutIndependentFilter.load/render` IPC 分流到 `createSoftGlowProvider`。保持主窗口可信主 frame 校验；renderer 不能提交 LUT 路径。
3. 预览调用 `renderJianyingLocalEffectPreview`，要求返回的 provider、resourceId、尺寸与请求一致。独立 provider 失败直接报告，不调用供应商后备渲染器。
4. 浏览器视频导出通过原有本机颜色运行时选择器进入 Canvas 路径，并调用相同 IPC/provider。`filter-lab` 独立原生命令的导出计划增加 `qcut-cpu-soft-glow`，复用已有 FFmpeg 解码/编码管线及同一个 `createSoftGlowSession`。
5. JS 使用 0–100，启动 helper 时除以 100，并显式指定 `ui-snapshot`。C++ 将当前强度解释成固定 UI 事件快照；导出帧适配器不再做一次输出混合。CPU 卡强度 0 仍保留其图层效果，必须进入相同 provider；A 原图使用 `enabled=false` 关闭效果。其他 native/Metal provider 的零强度直通语义保留。

已有 C++ Gaussian、SoftLight、单次 SGlow、LUT、Normal 算法保留，不新增近似 Shader，不借供应商二进制执行效果。

## 外部 LUT 绑定

`soft-glow-assets.ts` 只在用户现有私有缓存和 Jianying 缓存根目录下寻找固定包，兼容 `artistEffect` 与 `effect` 目录；不使用开发者绝对目录，不自动下载。

| 校验对象 | SHA-256 |
|---|---|
| `AmazingFeature/main.scene` | `09424db1ae0fefdbd459a509db8c04dd4e589db5d7f3ad5586fd86cb5684a7d7` |
| `AmazingFeature/resource/images/reference map2.png` | `4dc2e1a87a571a18ed4729c04159ddaf18ccf3f79ac35d7cc1141b6aedb2e39f` |
| 解码后的 512×512、top-down RGBA8 | `f9f142849b99e77d5b9174b054c7634d0945f6fd731c4133def07900d0bd9239` |

不读取目录中另一个未被实际场景绑定的 `filter.png`。解码使用工程已有的 `@napi-rs/canvas`，输出哈希也必须匹配，避免图像解码或颜色处理改变像素。检查的是上述具体文件与绑定，不将目录名或这些文件的哈希说成整个资源包的完整性证明。

每个 helper 会话把已验证的 RGBA 图集写入本机临时私有目录，文件权限 `0600`；进程关闭后删除。应用源码与打包资源不包含 LUT。

## 进程协议、复用和失败处理

helper 启动参数：

```text
qcut-independent-soft-glow-host --lut ATLAS.rgba --width W --height H --intensity 0..1 --intensity-mode ui-snapshot
```

stdin/stdout 均为紧密排列、top-down RGBA8；每帧恰好 `W×H×4` 字节，没有帧头、时间戳或日志。stderr 保存错误/结束统计。C++ 每帧 flush，因此可持续写一帧、读一帧。

JS session 按固定模式、宽、高、强度运行，按接收字节数拼合分块 stdout。provider 串行处理请求，最多保留 4 个请求，复用同参数的进程；尺寸或强度变化重建进程，30 秒空闲后关闭。源素材及时间戳变化不重建：此实现使用当前参数的静态快照，不模拟供应商的通用时序状态。CLI 未显式传模式时继续使用 `output-mix`，兼容先前的独立算法与 CGL 宿主实验；产品不会依赖 CLI 默认值。

会话拒绝错误版本、非法尺寸、长度不符、透明输入、非有限强度和参数不匹配。单帧等待上限 60 秒。残缺/多余输出、进程错误、超时与取消均失败并销毁进程；不会返回残帧或替代滤镜。导出 session 接收 `AbortSignal`，取消可终止正在等待的原生帧。provider 关闭也终止正在执行的进程和排队请求。

当前产品输入限制为不透明 SDR RGBA8，单边最多 4096、总像素最多 1920×1080。透明、HDR、广色域、4K 与跨平台等价性未交付。没有 GPU 或多线程优化，不能据此宣称实时播放速度。

预览 `contain` 拟合可能在空画布留下透明边，非同宽高比素材因此也可能触发透明输入拒绝。本轮没有通过填背景来掩盖这个边界；16:9 验收素材不触及此问题。

## 构建与打包

`soft-glow-bridge.ts` 使用 C++20、`-O2`、`-ffp-contract=off` 编译自己的源码。开发态按架构、源码与编译选项指纹缓存 helper；发布态先查 `process.resourcesPath/bin/qcut-independent-soft-glow-host`。

现有命令 `bun run stage-independent-filter-host` 现会同时构建原 Metal helper 和新 CPU helper，CPU 输出路径为 `electron/resources/bin/qcut-independent-soft-glow-host`。既有 `package.json` 的 `extraResources` 已将该目录复制至打包后的 `bin`，无需运行时访问研究目录或开发机器路径。

本机实际已单独 stage CPU helper，`file` 为 arm64 Mach-O；`otool -L` 只有系统 `libc++` 与 `libSystem`。该二进制受已有 `.gitignore` 排除。这里只验证本机 arm64 helper 和打包资源规则，尚未完成整个发行包构建、签名或 Intel/Windows/Linux 验收。

切换 `ui-snapshot` 后再次 stage，helper SHA-256 为 `5d746f0d9e1494e35d5d95191711718b01168c90f8793575aa1e369ea01fa79c`。开发缓存 revision 也显式包含 `ui-snapshot-protocol-v1`，与全部源码/头文件指纹共同避免复用旧模式 helper。

## 本轮开发验证

- `bunx tsc -p electron/tsconfig.json --noEmit` 通过。初次出现导出适配器匿名参数的 TS7031，补显式参数类型后复跑通过。
- 首个扩大测试批次 8 个文件、46 项通过：CPU session/provider/export plan/catalog；现有独立 IPC/Metal 帧适配；浏览器预览与导出路由；滤镜目录 UI。覆盖分块读取、连续帧、参数重建、取消、超时、排队上限、错误长度、版本、非有限输入、错误进程和不允许后备渲染。
- 初始 `output-mix` 实验曾使用真正 provider 与本机 LUT 运行两张不同的 1×1 不透明输入，同会话、强度 0，输出逐字节保持输入。这只是当时的资产/编译/进程协议烟测，不能作为新 `ui-snapshot` 零强度输出的预期。
- 使用本次编译的 Electron 模块读取实际 catalog，找到「电影柔光」，精确版本、`available=true`、`verification=unverified`、`independentKind=cinematic-soft-glow`。
- 并行 E2E 审阅发现旧目录只为名称尾缀 `QCut Metal` 显示强度控件，现已补充精确 CPU 卡名，并新增可操作 37% 强度和 A/B 比较的回归测试。
- 边界审计另发现最后一个 stdout 分块到齐与取消处于同一事件循环时，旧实现可能仍交付完成帧。现于交付前复核关闭、失败和取消状态；同时为三个 pipe 的错误统一终止进程。新增 4 项后 CPU session/provider/integration 三文件 20 项通过，UI 控件文件 5 项通过。
- 新模式回归 8 文件、58 项通过，额外覆盖：helper 显式模式参数、新 provider/preset 标识、CPU 零强度预览与导出仍执行、A/B 关闭原图、旧实验卡明确失败、其他 4 类 provider 零强度行为保持。切换后的 Electron 类型检查也通过。
- `bunx tsc -p apps/web/tsconfig.json --noEmit` 通过。旧模式提前抛错后的不可达重复类型比较已移除；对应预览路由 17 项测试复跑通过，旧卡失败行为保留。
- 新模式真实产品 provider 烟测：1×1 输入 RGBA `[80,100,120,255]`，0% 两帧均输出 `[66,91,117,255]`；37% 输出 `[65,92,120,255]`；100% 输出 `[65,93,123,255]`，四帧全部返回新 `ui-snapshot` provider。这验证实际模式参数传递、零强度非直通、重复一致及参数切换，仍不将单像素测试当作 UI 图像对标。
- 第二次真实 E2E 暴露快速改强度后画布停在 0%：成功 IPC 日志包含 37%，但没有保存当时失败 IPC，故日志本身不能直接证明满队列。新增受控慢帧组件测试复现完全相同状态：旧 effect 各自启动帧占满 4 个槽；最新 37% effect 失败，旧 37% 成功却被 cleanup 取消提交。修复前画布保持 0%、两项回归失败；修复后队列通过组件 `useRef` 跨 effect 串行，取消任务启动前跳过，仅实际执行 0→10→37，并发峰值 1，画布内容与 marker 均更新为 37，卸载后不启动旧排队任务。组件加预览/导出路由共 26 项及前端类型检查通过；不修改 E2E 快速滑动时序或增加等待绕过。
- `git diff --check` 通过。没有提交或推送本次变更。

上述mock路由和1×1协议检查与下面的真实编辑器证据分别保留。当前CPU性能、透明边界及跨平台限制不因E2E通过而改变。

## 最终真实编辑器 E2E（run4）

在包含跨effect串行绘制修复的最终Web构建与已stage的CPU helper上，`qcut-independent-soft-glow.e2e.ts` 返回 **1 passed (1.3m)**。测试使用独立Electron进程和临时用户目录；原生滤镜IPC仅在该隔离进程中被拒绝，没有改变剪映或机器全局设置。

主证据：`/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/e2e/run4/editor-evidence.json`。测试及自产像素观察辅助分别位于 `apps/web/src/test/e2e/qcut-independent-soft-glow.e2e.ts`、`apps/web/src/test/e2e/helpers/qcut-independent-soft-glow-probe.ts`。

| 检查 | 实测结果 |
| --- | --- |
| 真实卡片应用 | 精确ID／版本，新provider `qcut-cpu-soft-glow-ui-snapshot-v1` |
| 独立CPU成功响应 | 76次；preview100=3、export100=30、preview0=3、restored0=3、preview37=7、export37=30 |
| 正常流程错误／回退 | IPC失败0、原生fallback请求0、pageErrors=0 |
| 暂停预览实际像素 | 480×270；100%、0%及恢复0%的画布RGBA SHA-256与CPU返回各自完全相同 |
| 0%与A/B | 0%的CPU输出不同于输入；A原图像素等于原输入；B恢复仍为0%，像素恢复相同SoftLight结果 |
| 快速调节 | 保留原0→10→20→30→40→39→38→37键盘序列，37%最终画布更新 |
| 保存重载 | 完整重载项目URL后，已保存强度37及新provider保持，预览成功 |
| 100%导出 | H.264、1280×720、30fps、30帧、1秒，167598字节 |
| 37%导出 | H.264、1280×720、30fps、30帧、1秒，159928字节 |
| 动态内容 | 两个导出的第0／15／29帧各自不同，两档的帧hash也不同 |
| 故意CPU失败 | 预览显示失败，导出拒绝且未创建目标文件，原生fallback仍为0 |

暂停输入SHA为 `97eeaeb64cb8c44bd5b0f38c235bcafa89e5d61163dbebd2a9ec9e34941a8667`；100%画布及CPU输出SHA为 `eee133850dc4d65219c741bdf758c06ed23eeb77f8b545df2851c3d36ffe39b1`；0%及恢复0%的共同输出SHA为 `91f75b392bd53f065cc9b5b38cf502f87d1f76cc2dc2352fe11577a96443c070`。因此这部分证据不是只检查UI标记或mock调用。

素材来自既有真人视频的第60–69帧，慢放三倍并采样成1秒／30帧夹具，不称为原始实时30fps拍摄。两个MP4证明产品导出真实动态内容；H.264量化后的帧hash不同不等于与剪映视频逐帧一致。UI强度数值对照、独立70帧持续处理与本产品E2E应分别引用。没有在这次E2E中测量实时播放帧率。

本轮公共`navigateToProjects`辅助在导航前等待networkidle超过10秒；测试随后显式`page.goto(projectUrl)`执行完整文档重载，并核对持久化设置及新画布。本结果描述的是完整项目重载，没有声称已成功经过项目列表页面。

各轮结果不合并为一次无失败运行：

- `run2`发现产品缺陷：0%及A/B像素已通过，快速调到37%后画布停留0%。后续受控组件回归证明跨effect并发占满队列，串行调度修复该问题。
- `run3`在测试辅助函数抽取时遗漏`paused`局部声明，尚未进入0／37步骤即抛ReferenceError。这是测试代码错误，已补声明及独立TypeScript检查；未修改产品来绕过。
- `run4`使用上述修复后的最终代码，完整通过，保留原快速强度序列。正常流程没有IPC失败，随后独立检查了故意失败的传播行为。

`editor-evidence.json`保留身份、`full`／`partial`媒体检查、PNG预览hash、`paintedPixels`实际RGBA证据、`zeroOriginalComparison`、重载后的`reopened`设置、`probe`成功响应／失败／原生尝试、`pageErrors`及`failurePropagation`。同目录的`pixel-evidence.json`先于后续导出落盘，避免后续失败导致已验证像素证据丢失。
