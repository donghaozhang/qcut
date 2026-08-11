# `support_external_model_name` 对照

记录时间：2026-08-11

## 本轮唯一问题

本轮只比较真实剪映 UI 与独立 Swing V2 宿主初始化时的
`support_external_model_name` 原值，确认它是否解释两边最终加载不同人像模型。

不修改 AB，不替换模型，不调整效果包、输入帧、update-mode、纹理、强度、
`AlgorithmCacheFlag`、`ExportMode` 或生命周期。预先判据是：只有两边原值不同，
后续才值得单独做该 AB 的 A/B；若原值相同，就把它从当前误差来源中排除。

## 静态语义

当前运行库内的配置定义为：

```json
{
  "key": "support_external_model_name",
  "dataType": 1,
  "defaultVal": 3,
  "description": "Support face & matting use external biz specify model name"
}
```

配置描述表明该整数控制 face 与 matting 是否接受业务侧提供的逻辑模型名。当前证据只证明
值为 `3` 时两类外部名字均被接受；它不负责把逻辑名字解析为本机缓存中的具体模型文件。

## 只读观察器

观察器源码为
[probes/support-external-model-name-capture.cpp](probes/support-external-model-name-capture.cpp)。
它按 `libcccreator.dylib` UUID 选择已验证布局，并支持四个只读捕获点：

- `BachABConfig` 构造完成后的字段；
- 通用 runtime config 初始化完成后的字段；
- 旧 C manager create 入口前的 `bef_effect_get_ab_value`；
- 独立 V2 实际调用的 `SwingManager::init` 前 getter。

hook 使用进程内 copy-on-write remap，原函数仍由 trampoline 调用。源码没有
`configABValue`、setter 或模型替换逻辑。未知 UUID 会拒绝字段读取，不复用旧偏移。

```bash
xcrun clang++ -std=c++20 -dynamiclib -Wall -Wextra -Werror -O2 \
  docs/task/jianying-filter-runtime-research/probes/support-external-model-name-capture.cpp \
  -o /private/tmp/libjy-support-external-model-name-capture.dylib
codesign --force --sign - /private/tmp/libjy-support-external-model-name-capture.dylib
```

## 独立 V2 结果

固定奥林巴斯效果包、同一张 `854x480` 真人帧和三帧 manifest 后，直接 V2 初始化入口捕获到：

```text
CAPTURE source=effect-ab-before-swing-init
layout=private-runtime-d383946d
key=support_external_model_name
value=3
```

运行库自己的日志也在 Swing 初始化处输出：

```text
EffectABConfig::getABValue : key = "support_external_model_name", value = 3
```

三帧均完成渲染，输出文件各为 `1639680` bytes，对应 `854 * 480 * 4`。

## 真实 UI 结果

剪映草稿 `8月10日 (1)` 使用奥林巴斯资源 `7361792068475325735`；截图同时证明
右侧面板为“奥林巴斯”、强度 `100`，画面和滤镜轨道均已加载。剪映自己的真实运行日志两次输出：

```text
EffectABConfig::getABValue : key = "support_external_model_name", value = 3
```

第二次位于 `AMGSwingManager` 初始化之前，因此不是只读取了一个未使用的配置对象。

注入边界也单独留证：观察器映射进剪映主进程，但 `libcccreator.dylib` 只存在于 hardened
`--lvve-service` 渲染子进程；该子进程没有观察器映射。因而 UI 的决定性数值来自剪映运行库
自己的 getter 日志，不把主进程观察器当成子进程直接捕获。

## 对照结果

| 项目 | 独立 V2 | 剪映 UI | 判断 |
| --- | --- | --- | --- |
| `support_external_model_name` | `3` | `3` | 完全一致 |
| face 逻辑请求 | `tt_face_v11.1.model` | `tt_face_v11.1.model` | 一致 |
| face 实际 MD5 | `8572969b...de0a` | `8572969b...de0a` | 内容一致，缓存文件名不同 |
| face-extra 逻辑请求 | `tt_face_extra_v14.0.model` | `tt_face_extra_v14.0.model` | 一致 |
| face-extra 实际 MD5 | `40355868...bf07` | `fdf5cde3...e77f` | 不同 |
| skin-seg 逻辑请求 | `tt_skin_seg_v5.0.model` | `tt_skin_seg_v5.0.model` | 一致 |
| skin-seg 实际 MD5 | `2b5a3aed...7d6e` | `63b6b4b7...a608` | 不同 |
| `enableAlgorithmCache` | `9` | `9` | 一致 |
| `ExportMode` | `0` | `0` | 一致 |

剪映把 `skin_seg/tt_skin_seg_v5.0.model` 映射到缓存中的
`tt_skin_seg_v5.1_size100_md563b6...model`；独立宿主的 exact-first finder 则返回文件名
精确匹配的旧 `tt_skin_seg_v5.0.model`。face-extra 也存在同类映射。这里已经可以区分两层：

```text
support_external_model_name
  -> 是否允许业务提供逻辑模型名

resource resolver / model mapping
  -> 逻辑模型名最终落到哪个缓存文件
```

## 结论

`support_external_model_name` 不是当前 UI 差值来源，两边原值都是 `3`，所以本轮没有构造
没有 UI 依据的 AB mutation。

真正的新结论是：**独立 V2 与 UI 的差异发生在资源解析层，不在逻辑模型请求层。** 此前
exact-first 实验只证明“精确文件名优于错误的 video-family fallback”，没有测试剪映 UI 实际
使用的 `v5.1` skin-seg 模型。因此不能再用旧 `v5.0` 对 video model 只有小幅改善，推导
“模型身份不是主要差距”。

UI 日志还暴露了其他差异，例如 `enable_skin_seg_use_simd_optim` 为 `1`，独立 V2 为 `0`；
这些只作为后续候选记录，本轮没有改变或评价其像素影响。

## 下一次唯一问题

下一轮只验证 **实际解析到的 skin-seg 模型文件**：固定当前独立 V2 的所有 AB、输入、包、
mode、纹理、强度和生命周期，仅把逻辑请求 `tt_skin_seg_v5.0.model` 的返回文件从旧 `v5.0`
换成 UI 真实加载的 `v5.1` 文件，比较完整 mask 与最终 RGBA。不要同时打开
`enable_skin_seg_use_simd_optim`，否则无法区分模型文件与 SIMD 配置的贡献。

## 后续单变量结果

该验证已完成，见 [ui-physical-skin-model.zh.md](ui-physical-skin-model.zh.md)。固定上述所有条件后，只把
物理文件从旧 v5.0 换成 UI v5.1：

- UI mask 从 `MAE 9.797590 / IoU 0.853549` 改善到
  `MAE 3.243866 / IoU 0.962409`；
- 最终 RGB 从 `RMSE 1.796547 / PSNR 43.042030 dB` 改善到
  `RMSE 0.916513 / PSNR 48.888033 dB`；
- 两次 v5.1 独立运行的 10 张 RGBA 与 11 张 mask 均逐字节一致。

因此本页定位的 resolver 差异确实会改变完整像素，不再只是日志相关性。但后续核对发现，两次 v5.1 候选都在
最终 staged 输出之后才报告 CoreML ready；同一 v5.1 文件在 ready 受控后得到
`RMSE 1.168216 / 46.780337 dB` 和 mask `MAE 4.988363 / IoU 0.946869`。所以旧
`5.846004 dB` 不能全部归因于 physical 模型文件，纯 v5.0/v5.1 增益仍需同 readiness 协议重测。

SIMD AB 的下一轮实验也已完成。固定 v5.1 并让两组都在最终 preparation 输出前 ready 后，SIMD 0/1 的
71 张 RGBA 与 72 张 mask 全部逐字节一致，独立复跑亦一致。SIMD 已排除，下一主变量是首次结果、异步
ready 与 cache 提交生命周期。见 [skin-seg-simd-ab.zh.md](skin-seg-simd-ab.zh.md)。

## 仓库外证据

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  support-external-model-name/
    independent-v2-init/
    ui-main-probe/
    build/
```

| 文件 | SHA-256 |
| --- | --- |
| `independent-v2-init/capture.log` | `fadfbed01f010f31cd63c68d08794c562f97247bba4a7c4e131642db605415e8` |
| `independent-v2-init/run.log` | `5fa8ea30f112598c593568cd2f812831772e3bb073735bc7be848c38ded96780` |
| `ui-main-probe/ui-run.log` | `d06d6b6018e283160863ffe279c51aa83572d348532cc42caefa6afef4b9cc32` |
| `ui-main-probe/olympus-selected.png` | `84144fc5cba5334f7a68f28b9597b19dfefffdcce056d3d116eca109a7a66e71` |
| `ui-main-probe/vmmap-main.txt` | `d87fc78942eca94a5797abc18429e11dca3f11e5a74689360428a57a61031afb` |
| `ui-main-probe/vmmap-render-service.txt` | `1c4459de5ba8959c871ff7518392a1dda0811c9776c036191b04517941be493b` |
| 临时签名观察器 | `794f9e73fb78c51c5913d763538da0f5defa1a11f10673151b0ee61bdf24a6dc` |

测试结束后已退出注入启动的剪映实例，并从普通应用入口重新启动。正常实例的主进程和
`--lvve-service` 中均没有观察器映射。模型、效果包、运行日志和编译产物均留在 git 外。
