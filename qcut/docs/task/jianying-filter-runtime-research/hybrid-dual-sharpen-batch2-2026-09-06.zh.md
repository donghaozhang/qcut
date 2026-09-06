# 双 LUT 第二批：新增 43 张，保留本地模型

日期：2026-09-06。对象是中文剪映专业版，不是 CapCut。
本轮承接 [首批 57 张](hybrid-dual-lut-batch-2026-09-06.zh.md)。
只迁移渲染，不替换已有本地人像模型，不覆盖旧 CLI 或剪映原生后端。

## 数量与边界

| 指标 | 本轮前 | 本轮后 |
| --- | ---: | ---: |
| 本机目录卡片 | 892 | 892 |
| 完全独立渲染 | 713 | 713 |
| 自有 Metal + 本地原生 mask | 57 | 100 |
| QCut Metal 可选合计 | 770 | 813 |
| 尚未迁移 | 122 | 79 |

尚未迁移的 79 张包括双 LUT 31、Face AI 33、Shader 10、脸部区域 LUT 3、未知 2。
其中 4 张仍缺包；这不等于 79 张在旧原生后端都不可用。
本轮从本机剪映资源缓存补入 18 个缺失的 QCut 私有效果包，没有替换模型。
所有新增 profile 只记录 ID、版本、控制文件/资源 SHA-256、采样和强度参数，不包含第三方资源字节。

**100 张是混合路径，不能叫完全脱离剪映二进制。**
模型宿主仍加载私有原生库，初始化并渲染原包以取得 skin mask；原生 RGBA 丢弃，
QCut Metal 自己执行像素处理。当前不是仅调用一个独立模型的轻量宿主，也没有性能提升结论。
所有新入口仍为 `unverified`；本轮原生宿主对照不自动继承旧后端的 UI verified 状态。

## 本轮处理的四种拓扑

1. 31 张：自有锐化 Pass，接皮肤/背景双 LUT Pass。
2. 3 张：完整插值 tiled 双 LUT。
3. 5 张：VF 3D 双 LUT，保留其纹理坐标和 alpha 权重语义。
4. 4 张：旧式 tiled-floor 双 LUT，保留蓝色维度取整。

31 张锐化卡的 shader 对和事件脚本经本机检查一致。
锐化系数为 `0.6 * intensity`；第二 Pass 的两张 LUT 也各自使用 intensity。
因此 37% 的正确参照不是把 100% 成片与原图线性混合。
验证工具在仓库外的临时副本中，通过原包 `SeekModeScript:onEvent` 传递 37%，
由原脚本计算各 Pass 的参数，避免参照端重复抄写 QCut 的 0.6 倍率。
这验证原包事件行为，仍不宣称捕获了本轮剪映 UI 的完整真实调用序列。

## 测试发现并修复的问题

“橙蓝”首次全量测试失败：`Invalid dual LUT dimensions`。
实物背景 LUT 为 17³，皮肤 LUT 为 64³，旧编码协议错误要求两者同尺寸。

修复内容：

- 两张 LUT 保留原始尺寸，不重采样、不降低精度。
- DualConfig 从原来的 16 字节扩至 24 字节，新增 sharpen 和 skinSize。
- 原生 Metal 宿主按独立 skinSize 校验、读取与分配第二张 3D 纹理。
- 混合协议就绪标识更新为 `0x51464d33`；普通独立 graph 仍为 `0x51464d31`。
- 旧混合宿主在帧处理前明确拒绝，不允许静默错位读流。
- 增加大小不同的 LUT、无效尺寸、强度范围、半透明像素、重复调用和重设分辨率测试。

修复后橙蓝的 9 组像素条件通过，最大 RGB 通道差为 1/255。
完整 70 帧 CLI 导出耗时 9.762 秒，854×480、30 fps、2.333 秒，无缩放，
FFprobe 确认 70 帧，FFmpeg 全文件解码通过。源文件无音轨，输出也无音轨，
不能把 `audioPreserved: true` 当作该素材存在音频的证明。

## 验证记录

证据根目录：
`/Users/peter/Downloads/QCut-Hybrid-Dual-Batch2-2026-09-06/`

| 层级 | 输入与覆盖 | 结果 |
| --- | --- | --- |
| 单元与原生 Metal 回归 | 18 个测试文件，含原有独立 renderer、IPC、UI shelf、mask、graph | 133/133 通过 |
| 首次全量原生对照 | 100 张，静态人像的三个平移位置，0/37/100 强度 | 99 张通过；橙蓝维度失败已保留 |
| 修复后全量对照 | 100 张 × 3 帧 × 3 强度，1280×720，重复渲染检查 | 100/100 卡、900/900 条件通过，421.832 秒 |
| 生命周期 | 鲜美、粉霞、青灰、花间；A → A 连续 → 灰图 → A | 16/16 通过，返回 A 逐字节一致，44.260 秒 |
| 真实人物运动 | 上述四张；连续 10 帧 → 灰图 → 首帧 | 48/48 通过，最大通道差 1，重置一致，44.299 秒 |
| 720p CLI | 上述四张；1 秒、30 帧、含音轨 | 4/4 导出及完整解码通过，9.472/10.222/9.381/9.451 秒 |
| 真实 70 帧 CLI | 鲜美、青灰 | 2/2 通过，9.954/9.625 秒 |
| 初轮 Electron | 四张搜索、应用、真实预览像素、导出，最后一张重开 | 通过，约 1.7 分钟 |
| 最终协议 Electron | 鲜美、橙蓝；真实人物视频的 H.264 副本 | 通过，约 1.5 分钟；预览、导出、重开及故障拒绝通过 |
| 最终协议连续帧 | 鲜美、橙蓝，独立模型宿主，含灰图切换与返回 | 24/24 通过，最大通道差 1，重置一致，22.152 秒 |
| 远端整合后 Electron | 鲜美、粉霞、青灰、花间、橙蓝 | 5/5 预览与导出通过，项目重开通过，整条用例约 2.3 分钟 |

像素门禁保持 RGB MAE ≤ 0.25、最大通道差 ≤ 4、alpha 差为 0；
不是把差距门槛放宽来取得通过。表中的 1 是 8-bit 通道数值，不是位置移动了一个像素。
完整 100 张回归中，最差单条件 RGB MAE 为 0.116428/255，最大通道差为 3/255，
alpha 最大差为 0；900 个条件的重复输出全部逐字节一致。完整结果见 all-100-final/parity.json。

全量静态对照共享原生输出的 mask，用于隔离 Metal 渲染误差；
生命周期/真实连续帧对照使用两个独立模型宿主，不共享 mask。
这些是分开的证据，不把“共享 mask 的像素一致”当成“模型生命周期已一致”。

### 真实运动素材

原始私有测试视频：
`/Users/peter/Library/Application Support/QCut/Research/JianyingFilter/native-dual-lut-real-video/2026-08-13/fixture/portrait-motion-70.mkv`

- FFV1，854×480，30 fps，70 帧。
- SHA-256：`82368440b756da91aa081b4851b2b7a7c2a161d62a602a34b7db77aa22f31234`。
- 逐像素原生比较取第 60–69 帧，保留尺寸，不用静帧平移代替真实人物运动。
- 9 个相邻帧对中 7 对有明显运动；MAE 为 7.9634、0、8.4381、8.5393、8.3055、7.6594、0、6.7819、5.4920。
- `real-motion/` 中保留首尾输入、四张效果输出及对应原生输出。
- 最终协议另对鲜美、橙蓝复测，见 `real-motion-final/`。

Electron 首次尝试直接导入 FFV1/MKV，在素材导入等待阶段超时，尚未进入滤镜应用。
保留 `editor-final.log` 和 `mkv-import-failed.png`。
随后仅将输入转为 H.264/yuv420p MP4，未缩放，作为 UI 工作流素材；
这个有损副本不用于无损逐像素门禁，也没有宣称本轮修复了 FFV1/MKV 编辑器导入。
UI 测试沿用现有用例，导出时间线的前 1 秒、1280×720/30 fps；不把它当作原始尺寸的
第 60–69 帧连续运动门禁，后者由独立生命周期测试和 CLI 完整 70 帧导出负责。

本轮测试期间远端将 master 合入 timeline-fixed，本地从 e97407645 快进至 3fda494fd，
未覆盖其他 agent 的未提交研究文件。整合后 Electron 构建和 Web TypeScript/Vite 构建通过，
133 项回归再次通过（unit-integrated.json）。整合版五张代表卡的 UI 复测记录于 editor-integrated/。
整合版读到目录 813 张，五个导出均为 30 帧，pageErrors 为空；注入 Metal 故障后，
预览显示警告、导出拒绝且未创建输出文件。项目导航存在 networkidle 超时日志，
现有 helper 的备用导航完成重开，最终用例成功；本轮未修改全局导航 helper。

截图：editor-integrated/lut-1-preview.png 至 lut-5-preview.png，
项目重开截图：editor-integrated/lut-project-reopened.png。

### 复现命令

```sh
export QCUT_JIANYING_DISABLE_APP_BUNDLE=1
export QCUT_JIANYING_DISABLE_USER_CACHE=1

bun scripts/verify-hybrid-dual-filters.ts \
  --source /Users/peter/Downloads/QCut-Independent-Filter-2026-09-06/original-frame-15.png \
  --output /Users/peter/Downloads/QCut-Hybrid-Dual-Batch2-2026-09-06/recheck

bun scripts/verify-hybrid-dual-lifecycle.ts \
  --video "/Users/peter/Library/Application Support/QCut/Research/JianyingFilter/native-dual-lut-real-video/2026-08-13/fixture/portrait-motion-70.mkv" \
  --ids 7330581892510649636,7127561047048850718 \
  --output /Users/peter/Downloads/QCut-Hybrid-Dual-Batch2-2026-09-06/recheck-motion

bun electron/native-pipeline/cli/cli.ts filter-lab render-independent \
  --resource-id 7127561047048850718 \
  -i "/Users/peter/Library/Application Support/QCut/Research/JianyingFilter/native-dual-lut-real-video/2026-08-13/fixture/portrait-motion-70.mkv" \
  --output /Users/peter/Downloads/QCut-Hybrid-Dual-Batch2-2026-09-06/recheck-orange-blue.mp4 \
  --json
```

UI 使用“滤镜实验室 → QCut Metal”，搜索卡名后应用；沿用已有参数、预览和导出管路。
`QCUT_JIANYING_DISABLE_*` 两个开关禁止从应用安装位置和剪映用户缓存加载，
但允许 QCut 私有快照。它们证明本机私有缓存路径可用，不是发行授权证明。

## 新增卡片清单

| 名称 | Resource ID | 拓扑 |
| --- | --- | --- |
| 鲜美 | `7330581892510649636` | 锐化 + tiled 双 LUT |
| 健美 | `7617815642690850111` | 锐化 + tiled 双 LUT |
| 蓝调时刻 | `7392898023505792319` | 锐化 + tiled 双 LUT |
| 粉霞 | `7525754134151105833` | tiled |
| 夜景增色 | `7341302999068757259` | 锐化 + tiled 双 LUT |
| 晚霞增色 | `7392898170524618023` | 锐化 + tiled 双 LUT |
| 高清暖调 | `7431187754379136266` | 锐化 + tiled 双 LUT |
| 哈苏蓝 | `7361792059109313811` | 锐化 + tiled 双 LUT |
| 青灰 | `7127671508264078599` | vf |
| 黑金红 | `7341266486536768831` | 锐化 + tiled 双 LUT |
| 增色II | `7411476796526300452` | 锐化 + tiled 双 LUT |
| 冷月夜 | `7281165355353951543` | vf |
| 橙蓝 | `7127561047048850718` | vf |
| 蓝调烟火 | `7328363887542209828` | 锐化 + tiled 双 LUT |
| 冰雪白 | `7462637393783360809` | 锐化 + tiled 双 LUT |
| 去雾 | `7473437502787816740` | 锐化 + tiled 双 LUT |
| 阿勒泰 | `7377370363035979034` | 锐化 + tiled 双 LUT |
| 美食增色 | `7403664465390013735` | 锐化 + tiled 双 LUT |
| 风味 | `7330579916272012580` | 锐化 + tiled 双 LUT |
| 香浓 | `7330588808666156307` | 锐化 + tiled 双 LUT |
| 家宴 | `7330584144524643595` | 锐化 + tiled 双 LUT |
| 暗调发光 | `7413717074037525769` | 锐化 + tiled 双 LUT |
| 暗金 | `7413716485396368679` | 锐化 + tiled 双 LUT |
| 夜景增色II | `7411477748130139403` | 锐化 + tiled 双 LUT |
| 蓝金 | `7341300292148907327` | 锐化 + tiled 双 LUT |
| 暗夜明肤 | `7328364126449765671` | 锐化 + tiled 双 LUT |
| 烟花璀璨 | `7328363415313993001` | 锐化 + tiled 双 LUT |
| 雾野 | `7127823362356727077` | vf |
| 花间 | `7211008985187487036` | tiled-floor |
| 森绿 | `7510128089511349555` | tiled |
| 银蓝 | `7145394266209127694` | tiled-floor |
| 黑曜 | `7223712396769119545` | vf |
| 凉夏 | `7377370212749839667` | 锐化 + tiled 双 LUT |
| 海水正蓝 | `7361398032753020201` | 锐化 + tiled 双 LUT |
| 晴海 | `7525755037050539307` | tiled |
| 高清 | `7320436048134147340` | 锐化 + tiled 双 LUT |
| 高清增强 | `7426668776491453707` | 锐化 + tiled 双 LUT |
| 高清II | `7325426821267295551` | 锐化 + tiled 双 LUT |
| 超白 | `7302338645938261287` | tiled-floor |
| 佳能G12 | `7485292050917657906` | tiled-floor |
| 背景增色 | `7538027894447131967` | 锐化 + tiled 双 LUT |
| 鲜明 | `7320434750018047251` | 锐化 + tiled 双 LUT |
| 通透 | `7530582568769522980` | 锐化 + tiled 双 LUT |

## 下一步与未证明部分

- 先处理剩余 31 张双 LUT 的复杂 topology，不按相同卡名或相同 LUT 数量直接批量标记完成。
- 模型可继续保留；完整原生效果只为 mask 工作仍有额外成本，后续需单独测量后再优化。
- 各卡尚缺新的剪映 UI 同输入、同强度无损参考。
- 尚未逐卡完成长视频、多人物遮挡、频繁 seek 和全部分辨率测试；本轮真实视频是代表卡抽样。
- 没有分发第三方 dylib、模型、资源包，也不把原生宿主接通当作允许商业发布。
