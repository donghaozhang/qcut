# 封面复用原生花字与字体实验室

日期：2026-09-06。分支：`codex/cover-design`。PR：[#463](https://github.com/Quriosity-agent/qcut/pull/463)。

## 纠正与范围

QCut 已有花字实验室、字体实验室和剪映文字原生运行时。上一阶段封面只接了 approximation，遗漏的是封面入口、数据保存和渲染调用，而不是这些底层能力不存在。本轮复用这些模块，不另造一套花字引擎。

| 能力 | 本轮状态 |
| --- | --- |
| TextStyle 原生花字 | 从实验室选卡，实际原生渲染，保留可编辑文字 |
| InfoSticker 复杂贴图花字 | 接入相同运行时，纹理不再压成描边/阴影近似 |
| ScriptInfoSticker 文字模板 | 保留包内多部件、竖排和时序；可选取帧时间 |
| 本机剪映字体 | 复用字体实验室、字形检查、真实字体加载与内容寻址 |
| QCut 自有字体副本 | 读取时保留原始字体；目录可单独扫描、恢复 |
| 完整 `cover.cover_draft` 封面模板 | **尚未直接套用**，不是 ScriptInfoSticker 文字模板的同义词 |

## 数据与渲染

1. 花字卡片复用实验室目录、类别、缓存缩略图和 `buildTextStyleLabUpdates`，不再排除只有原生引用、没有 approximation 的卡片。
2. `CoverDesignV1.layers[]` 的文字层保存 `jianyingTextStyle`、`nativeFrameTime` 和可选 `fontAsset`。引用包含资源 ID、包 hash、包类型与时间/文字映射；不保存本机绝对包路径或临时 PNG 路径。
3. 共享纯函数校验原生引用；封面模型额外校验字体 SHA-256 标识、CSS family 和帧时间。旧版封面仍可读取。
4. 封面复用 `createJianyingTextRenderEntry` 和 Electron `jianyingTextRuntime.render`，将原生帧按运行时返回的位置绘制进封面 Canvas。图层顺序、透明度和旋转不重复应用。
5. 预览、保存 PNG 和缩略图走同一渲染路径。快速编辑取消过期请求；缺字、缺包、运行时诊断或无效输出会报错，不静默保存近似结果。

应用花字保留当前文字、层 ID、字体、字号和几何信息。原生花字的颜色、描边、B/I/U 与对齐由包决定，相应普通文字控件禁用，避免出现改了参数但画面不变的假交互。可修改文字、字号、真实字体、文本框、旋转和取帧，或移除原生花字回到普通文字。

字体弹窗复用已有组件。切换文字层或关闭弹窗会使未完成的字形检查失效，防止迟到结果套到另一层。Escape 只关闭字体弹窗，不误关封面编辑器。

## 字体缓存与备份

QCut 持久目录：`~/Library/Application Support/QCut/PrivateAssets/JianyingFonts/`。

备份目录：`$BACKUP_ROOT/qcut-materials/PrivateAssets/JianyingFonts/`。

- 按原始字体 SHA-256 命名；先校验并保留原始字节，再做浏览器兼容转换，避免转换后内容破坏字体身份。
- 每个字体限制 128 MiB，使用临时文件和原子替换；原始缓存发生变化时，优先使用校验通过的 QCut 副本。
- 实验室默认扫描 QCut 自有字体、QCut 自有文字包和原有剪映缓存；按内容去重，提供“QCut 自有缓存”来源筛选。
- 本机分批保留 **147 个唯一字体、467,685,232 字节（约 446 MiB）**。SSD 备份的 147 个字体逐文件 SHA-256 与源完全一致；ExFAT 的 `._` 元数据文件不计作字体。
- 仅扫描 QCut 字体目录得到 147 条、0 个无效文件，已选字体仍能读取。不通过删除或改名用户剪映缓存来模拟离线。

这些字体和原生包只保留为本机私有资源，未提交 Git。缓存存在不代表获得再次分发的授权，也不代表所有资源已做视觉一致性测试。整包跨机迁移与字体授权仍需单独处理。

## 验证

自动验证在 APFS 镜像 `$HOME/.cache/qcut-cover-validation/qcut` 完成，源文件逐个与 SSD 工作目录同步：

- 43 个测试文件、**322 项测试通过**；1 个已有环境门控测试文件（1 项）跳过。
- 覆盖三种原生引用、字体身份与持久化、渲染错误/取消/输出边界、保存复制、字体弹窗竞态以及共享实验室回归。
- Web TypeScript 检查与完整 `build:electron` 通过；共享引用校验器纳入 Electron CJS 构建。

实际桌面测试使用真实 Electron、正式 IPC 和本机私有资源，没有注入 mock。独立测试项目 `6a06e56b-8d45-4561-9b2a-33b8bd7abeee`，未修改用户原项目。测试时实验室显示 2,210 个可应用样式；这是目录能力数量，不是逐条验证结果。

| 实测 | 结果 |
| --- | --- |
| TextStyle `7332292224668994867` | 橙金描边效果实际出现在封面 |
| InfoSticker `7127668616656506149` | 交叉纹理花字可修改中文内容，输出像素随之变化 |
| InfoSticker 换“仓耳锋舞九天W05” | 字形变化；保存、完整刷新、重开后字体 ID 与 PNG hash 一致 |
| ScriptInfoSticker `7205562420020989240` | 2.1 秒帧显示竖排与额外装饰部件；重开仍为 2.1 秒且像素一致 |
| 1440×900 与 390×844 | 画面非空、工具栏换行；窄屏工作区无水平溢出 |

InfoSticker 换字体后及重开的封面 SHA-256：`2fc23a7166253d3ce09157b03c8a2b820ec584865c8f9e3ac192611b85404f42`。

ScriptInfoSticker 2.1 秒帧及重开的封面 SHA-256：`ce7084f70972f81c3053448156f9211d05910c8780181087c64fa38dccc44db2`。

## 截图与剩余差距

本地证据目录：`$EVIDENCE_ROOT/qcut-cover-comparison-2026-09-06/`。

- `qcut-cover-native-infosticker.png`：复杂纹理花字实际应用。
- `qcut-cover-native-font-picker.png`：复用字体实验室及真实字体效果。
- `qcut-cover-native-script-frame.png`：文字模板 2.1 秒原生帧。
- `qcut-cover-native-textstyle.png`、`qcut-cover-native-mobile.png`：桌面与窄屏。
- `native-cover-evidence.json`：样本引用、像素统计、输出 hash 和验证边界。

完整封面模板的草稿导入、背景/贴纸/依赖编排仍未接入；原生文字模板取帧不能代替整张封面模板。实验室部分缩略图还是历史生成预览，例如本轮 ScriptInfoSticker 的缩略图与真实多部件布局不同，仍需刷新。此次没有使用同素材同模板做剪映逐像素对照，不能宣称完全一致。
