# 电影柔光：强度入口与独立宿主探针

2026-09-06。资源 `7447126702137904420`，版本 `9673f80b8e2f5a07f02f9ce1130b784a`。供应商脚本、素材和运行库均未修改；原始日志、逐帧输出和私有观察器保存在仓库外。

**中间强度不能由 0/100 两个端点推断。** 本次稳定 D634 FeatureSegment 参考中，0% 和 100% 与线性输出混合端点相同，但 37%、80%、81% 显著不同。这是独立宿主结论；剪映当前 UI 的强度与逐视频帧行为由另一组 UI 导出实验验证。

## 固定身份

| 对象 | 身份 |
| --- | --- |
| 输入 | 自有不透明 chart，320×180 RGBA；SHA-256 `74fea03ff5679c7b4996c7677dea3c9fa99ddeb6f9393cffe87013dd15c51066` |
| 包目录树 | `9db2974298a914c4a465c4fc42a1e797f4c2e416bd2d9442d2ab57174526f971` |
| 本次像素参考 libcccreator | ARM64 UUID `D6342ECD-5432-33F0-A2AD-0C28F5699994`；SHA-256 `0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9` |
| 当前已安装 libcccreator | ARM64 UUID `100726E3-FCB0-31BC-98EE-1B196A1714A3`；SHA-256 `b09c395d934169cb20ec865dd1d4032ca68023b287a7264e1b06ff4d71fd1be4` |
| 当前安装位置 | `/Applications/VideoFusion-macOS.app/Contents/Frameworks/libcccreator.dylib` |

没有把 D634 像素结果冒充当前安装 build 的结果。当前安装库仅完成本文观察器的独立加载与入口门禁 smoke；未通过本探针控制剪映 UI。

## 三条入口必须区分

| 入口 | 实际行为 | 本次结果 |
| --- | --- | --- |
| 现有 QCut CGL provider | 固定包先渲染，再以用户强度混合完整输出与原图 | 默认图稳定；属于 output mix |
| CGL composer update | `bef_effect_composer_update_node` 配合 `enable_composerNodeEvent_to_amazingScene` | API 返回 0，但包脚本收到 event=nil；不能作为本包正确的事件入口 |
| Swing FeatureSegment | `bef_swing_segment_set_params` → `FeatureSegment::setParameters`，JSON `{intensity:t}` | 真正进入包内 intensity 回调；出现已预测的脚本错误，并产生不同中间强度输出 |

旧四方文档只验证强度 100。复核其私有 `oracle-intensity-one/probe.log` 原始行 523–526 已存在 Layer 引用缺失与 SGlow step 缺失错误；旧成功输出不等于这些事件函数全部成功。

## 先保留失败与不稳定结果

第一轮 CGL 实验包括默认 set-effect、默认 composer 和 0/0.37/0.8/0.81/1，共 14 个进程。每进程固定 t=0 连续三帧，所有输出与默认图一致。事件组记录：

- Layer 原文件第 401 行：访问 event=nil。
- SGlow 原文件第 238 行：访问 event=nil。
- LVFilter 原文件第 49 行：访问 event=nil。

这说明 composer 回调调用约定不适合直接驱动本包的 `onEvent(comp,event)`，而非证明包内 intensity 本来就无作用。原始结果位于 `cgl-events/`。

第二轮使用现有交互 Swing host。五档参数确实进入 FeatureSegment，0 为原图，37/80 报 Layer 错误，81/100 再报 step 错误；但八帧中多次混入完全等于原图的输出。所有帧与出现次数均保留在 `swing-events/`，没有按相似度选择“好帧”。尝试用 `{}` 作为默认参数被原生 setParameters 拒绝，返回 -1，未取得输出；该组不能按进程退出码 0 算成功。

初次切换到 sequence 探针时，Filter 私有依赖闭包缺少该通用启动器要求的 `Resources/lumi_js_resources`，因此拒绝启动，记录在 `swing-sequence-delay50/`。随后使用已有、同 SHA 的 Transition 完整 D634 闭包；未复制或补改供应商文件。

## 稳定的 FeatureSegment 矩阵

使用已有 `research/jianying-runtime-probe/build/jianying-runtime-probe` 的 `filter-sequence` 入口，固定 50ms 读回等待。首帧 update modes 为 `0,1,1,2`，后续为 `1`，每组八帧、两个全新进程。

时间参数通过现有序列入口传入 fps=1,000,000,000，使其 `index×1,000,000/fps` 整数微秒时间戳在本次八帧中全部为 0；每帧日志已记录 timestamp=0。这只是复用该入口表达固定时间的探针方式，不是视频帧率测试。

`FeatureSegment` 参数在首帧 render 后设置，因此事先将 frame0 标为初始化阶段，frame1–7 标为事件之后。默认无参数组八帧全部一致；五档事件组的 frame1–7 全部一致，且两个独立进程的 SHA 相同。首帧没有删除，采样规则不依赖输出相似度。

下表用**同一 Swing 默认完整效果**计算线性混合参考，避免把 CGL/Swing 的基础渲染差异混入强度比较。逐通道按最近整数取整，比较 RGB，Alpha 恒为 255。

| 强度 | 事件输出 vs 线性输出混合 MAE | RMSE | 最大通道差 | 事件错误 |
| --- | ---: | ---: | ---: | --- |
| 0 | 0 | 0 | 0 | 未记录上述脚本错误；输出为原图 |
| 0.37 | 5.127865 | 6.775850 | 36 | Layer 对象引用 nil |
| 0.8 | 3.667216 | 6.260246 | 33 | Layer 对象引用 nil |
| 0.81 | 3.651071 | 6.091623 | 31 | Layer 对象引用 nil；SGlow step=nil |
| 1 | 0 | 0 | 0 | Layer 对象引用 nil；SGlow step=nil |

默认 Swing 与默认 CGL 的 RGB RMSE 为 0.731429，MAE 为 0.268727，最大差为 12。这个差异比中间强度路径差异小，但没有被当作零，也不能称二者逐像素相同。

| 输出 | RGBA SHA-256 |
| --- | --- |
| Swing 默认 / fresh intensity=1 | `643afe920098f79aa9ccf7d1adc16dd95454a2371954ff0ebe13b642759a5fbb` |
| CGL 默认 | `42254b2d5b4ec4c74c44406dcc4959caa9a09dfdbfee9b9d53e1b2db4c571146` |
| intensity=0.37 | `f8f50b0d25c2ae029d9d3f4c078436ef0dea0263ae1054f615af6df348e2de8f` |
| intensity=0.8 | `3d2e797fee848d11182d20e2199fa126c3ee896cd1c7466b46a96163bbeddb99` |
| intensity=0.81 | `a65ef9fbcbdcc6ae9e45d5ed1b439fd17fcaea9c1fef0b5eecae875a539b2da5` |

## 错误并不表示整个效果被取消

稳定运行日志验证了先前[生命周期审计](../../../research/independent-soft-glow/semantic-lifecycle.zh.md)中的两个具体缺口：

- Layer 的 opacity 事件在第 406 行索引未初始化的 `self.LumiLayer_301`。
- SGlow 在 t>0.8 时于第 249 行调用不存在的全局 step，尚未执行该分支的 threshold/brightness 写入。

LVFilter 的 uniAlpha 事件与其他引擎强度处理仍可能继续生效，不能把局部脚本错误解释为整个滤镜无效。t=1 与 fresh 默认图相同，也不能解释为 SGlow 已成功取 threshold=0.7725/brightness=3.9。

本次矩阵每档都用新进程。由于失败分支可能保留此前参数，**从 80 滑到 81 的同会话行为尚不能由 fresh 81 推断**；真实 UI 实验应记录强度调整顺序，并在需要时对比新加载与连续调整。此处没有臆测该状态差异的数值。

## 当前 build 的最小参数观察器

复用仓库已有 `probes/feature-params-capture.cpp`，在私有生成版本中加入四重门禁：加载镜像 ARM64 UUID、原文件 SHA-256、symbol 相对偏移、16 字节函数序言。仅接受上表 D634 和 100726。入口为 `FeatureSegment::setParameters(const std::string&)`：

- D634 相对偏移 `0x180ca58`。
- 100726 相对偏移 `0x1815930`。
- 两者前 16 字节均为 `ff4303d1f6570aa9f44f0ba9fd7b0ca9`，对应不依赖 PC 的栈帧指令。

观察器记录 payload、线程、对象和 caller，随后原样调用原函数。安装方式会在目标进程内对入口页作 copy-on-write remap，不修改 app 磁盘文件或参数。未知身份拒绝安装。当前 build 的独立 load-only smoke 日志为 `verified-current-100726` 后 `patched`；D634 实际矩阵同时验证了 JSON 捕获与原函数渲染继续工作。

另用自行编译、导出同名函数但 UUID 未登记的微型测试库执行反例：日志仅为 `rejected-unknown-uuid`，没有 `patched`，进程正常退出。证据为 `observer-unknown-rejected.log`；没有修改供应商库来制造此反例。

启动参数观察所需环境名为 `DYLD_INSERT_LIBRARIES`、`JY_FEATURE_PARAMS_LOG`。它只能观察启动时加载了该 dylib 的进程，不能给已经运行的 UI 自动添加环境。本轮像素优先的 UI 操作没有因此被重启；由主任务自行决定是否需要 UI 观察器。

## 私有证据入口

根目录：`/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/intensity/`。

- `intensity-metrics.json`：固定采样规则、全部分布与误差。
- `swing-sequence-delay50-full-closure/manifest.json`：稳定矩阵，每档两进程八帧与脚本错误。
- `run-cgl-intensity.py`、`run-swing-intensity.py`、`run-swing-sequence-full-closure.py`、`compare-intensity.py`：本次私有复现入口。
- `feature-entry-identities.json`：当前与备份库的 SHA、UUID、入口偏移和序言。
- `build-observer.py`、`feature-params-observer-gated.cpp`、`libfeature-params-observer-gated.dylib`：新增门禁的私有观察器。
- `observer-current-smoke.log`：当前已安装 build 的加载门禁 smoke。

旧四方输入仍可用于 UI 复测：`~/Library/Application Support/QCut/Research/JianyingFilter/cinematic-soft-glow-four-way/2026-08-13/fixture/source.png`。该旧目录的 `jianying-ui/` 下保留 baseline 与 filtered ProRes 4444 视频。旧帧指标不替代本次多强度或逐帧验收。

## 历史 output-mix 卡片的产品接线 E2E（run1）

新增测试 [qcut-independent-soft-glow.e2e.ts](../../../apps/web/src/test/e2e/qcut-independent-soft-glow.e2e.ts)，本次结果 `1 passed (1.4m)`。测试启动独立 Electron 进程与临时用户目录，只在该进程内拦截原生滤镜 IPC，不改变机器或剪映设置。

真实操作覆盖：选择“应用 电影柔光 QCut CPU”、预览 100%、导出、键盘调节强度至 37%、离开并重开项目、确认仍为 37% 且 provider 不变、再导出。测试包裹已有独立 IPC handler 并原样调用，捕获 **88 次实际响应**，provider 全为 `qcut-cpu-soft-glow-v1`；其中两个导出阶段各 30 次，原生滤镜 fallback 请求为 0。

随后在该隔离进程中故意令独立渲染 IPC 抛错，验证预览明确显示失败、导出明确拒绝且未生成文件、原生 fallback 仍为 0。没有通过替换渲染结果或伪造 provider 来满足断言。

输入来自现有真人运动片段的第 60–69 帧，放慢三倍至 1 秒后统一为 1280×720、30fps。它是实际人物运动片段的慢放测试夹具；第 0/15/29 帧不同，不把它称为原始实时 30fps 拍摄。100% 与 37% 导出均经 ffprobe 确认为 H.264、1280×720、30fps、30 帧、1 秒，各自抽取三帧均有变化，且两档导出的帧哈希不同。

复现时指定：`QCUT_INDEPENDENT_SOFT_GLOW_E2E=1`、`QCUT_INDEPENDENT_SOFT_GLOW_VIDEO=/absolute/path/to/1s-moving.mp4`、`QCUT_INDEPENDENT_SOFT_GLOW_EVIDENCE=/absolute/private/evidence`，运行 `bunx playwright test apps/web/src/test/e2e/qcut-independent-soft-glow.e2e.ts --reporter=line`。

本次证据为 `/Users/peter/Downloads/QCut-Soft-Glow-Video-2026-09-06/e2e/run1/editor-evidence.json`；同目录含 UI 截图、两档 MP4、文件 SHA-256 清单。**这些历史断言验证当时独立 CPU 的产品调用与失败传播，不把 37% output-mix 输出认定为剪映 UI 像素对齐。**

后续已实现显式`ui-snapshot`，默认CLI仍保留历史`output-mix`。新provider为`qcut-cpu-soft-glow-ui-snapshot-v1`；最终`run4`实际E2E通过，76次CPU响应、正常流程IPC失败0／原生回退0／pageErrors0，两次各30帧导出通过。100%／0%／恢复0%的暂停画布RGBA hash均与真实CPU返回一致，A切原图、B恢复0正确，快速调37及项目完整重载保持37。故意CPU错误时预览显式失败、导出拒绝、没有回退。

中间`run2`暴露并修复了跨React effect并发导致画布停留旧强度的问题；`run3`是测试辅助声明遗漏，已分别保留失败证据。最终实测、字段结构、项目重载范围及性能／透明输入边界见[产品接入报告](soft-glow-product-integration-2026-09-06.zh.md)。五档实际ProRes导出中帧对照和两种独立强度公式见[强度模式契约](../../../research/independent-soft-glow/intensity-modes.zh.md)，仍不将产品E2E通过等同于任意视频逐帧原生一致。
