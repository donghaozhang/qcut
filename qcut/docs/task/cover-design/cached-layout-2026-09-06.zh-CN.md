# 剪映缓存封面：文字布局接入与依赖诊断

日期：2026-09-06。分支：`codex/cover-design`。PR：[#463](https://github.com/Quriosity-agent/qcut/pull/463)。

## 结论

本轮把真实缓存模板的文字布局接入 QCut 封面编辑器，并复用字体实验室和花字实验室。现在可以点击“套用文字布局”，得到可编辑的文字层；S23、HERO 的 InfoSticker 使用原生运行器实际出图，不是把模板预览图贴到背景上。

**这不是完整原生封面模板的直接套用，也不是逐像素一致。** 当前保留用户背景及裁剪，不导入模板背景、背景滤镜、视频或音频。八个缓存样本中七个通过布局和资源准备；三个完成 UI 出图、保存与重开验证。不能将七个准备成功等同于七个全部实机渲染通过。

## 为什么一直显示依赖不完整

1. 五个缺失引用实际属于视频背景滤镜，而不是文字字体或花字。旧状态只统计整个模板，无法说明文字部分已经可用。现在按 `material_id` 和 `extra_material_refs` 追踪所属轨道，分别显示“缺背景滤镜”“文字资源就绪”，并列出名称和资源 ID；未知或共享依赖不冒充背景依赖。
2. 原生模板的 `text/` 系统字体可能是隐式依赖。现在必须解析到自有缓存中已验证的 `SystemFont/zh-hans.ttf`，不能悄悄换成操作系统默认字体。
3. 字体目录快照可能早于封面资源恢复。原生花字运行器现在先按 SHA-256 查询 QCut 自有字体，再走目录查找，避免已经恢复却必须重启才找得到。
4. 浏览器开发模式没有 Electron 字体 IPC。新增仅开发期、同源且限本机地址的字体读取接口，复用真实缓存字节、字形覆盖检查和 FontFace 加载；生产 Web 不暴露该接口。原生 InfoSticker 仍需桌面运行器。
5. Day 1 的 `style_name`“黄字黑边”是显示名称，颜色和描边已明确记录在模板内，不是另一个待下载的样式包。解析器不再误拦截这个名称。

## 实现边界

- 读取并验证自有缓存中的 `template.json`，解析 `cover.cover_draft` 中横排文字、层级、位置、统一缩放、旋转、颜色、透明度、间距、描边和阴影。
- 按画布比例适配布局，保留背景和手动文字，只替换上一个模板所属文字。最多 20 个文字层。
- 字体通过现有私有字体缓存保留；花字按实际资源 ID/包哈希恢复到现有 `JianyingText/Cache/artistEffect`，复用原生花字渲染链路。旧版资源迁移只接受已有目录证据，不按同名猜测。
- 恢复花字时检查相对路径、重复路径、包种类、每个文件大小及 SHA-256。已有包必须与预期文件清单一致；额外文件、符号链接或损坏内容会被拒绝。新包先写临时目录再发布。
- 加载字体、检查字形并执行真实绘制预检，成功后才修改封面。修改设计、切换项目、禁用编辑或关闭弹窗会使过期导入失效；失败可重试，原设计不被部分替换。
- 不支持的竖排、翻转、非等比缩放、关键帧、多重文字特效等明确拒绝，不返回半成品。
- 复用字体缓存时补上并发发布处理：Windows 重命名失败后，仅在目标字节已经匹配同一个哈希时接受另一写入者的结果；损坏目标仍报错。

## 八个真实样本

“准备通过”包括读取真实定义、恢复字体/花字依赖；不是渲染一致性证明。

| 模板 | 文字层 | 字体 | 原生花字包 | 准备 | 本轮 UI 证据 |
| --- | ---: | ---: | ---: | --- | --- |
| 周末的仪式感 | 6 | 4 | 0 | 通过 | 浏览器实际绘制、保存、重开；桌面及窄屏截图 |
| Jessica's Travel Vlog | 10 | 4 | 0 | 通过 | 未逐项实机验证 |
| Iceland Vlog 冰岛旅行 | - | - | - | 拒绝竖排 | 不是缺失字体的错误提示 |
| 新赛季必备攻略 S23 | 3 | 2 | 2 | 通过 | Electron 实际绘制、保存、刷新后重开 |
| Day 1 七天吉他速成教学 | 3 | 2 | 0 | 通过 | 未逐项实机验证 |
| 爱用物 购物车 | 4 | 3 | 0 | 通过 | 未逐项实机验证 |
| HERO | 3 | 2 | 2 | 通过 | Electron 绘制；HERO 改为 QCUT 后保存并重开 |
| Tacos Cheese Omelette 鸡蛋芝士墨西哥饼 | 4 | 4 | 0 | 通过 | 未逐项实机验证 |

## 仍缺的五个背景滤镜

本轮没有找回以下精确版本，也没有用同名滤镜或猜测 LUT 填充。

| 模板 | 滤镜 | 资源 ID | 旧包哈希 |
| --- | --- | --- | --- |
| 周末的仪式感 | A-log | 6867493201318515207 | 306ef80eeb16aaad4b9a7ccfde1dcdc3 |
| Jessica | 午后 | 6709359425695519240 | c2636a1fe82498d503e1d9f28343851f |
| Iceland | 小镇 | 6877828523751379470 | 77a842c891a712e7569d6799d631bf46 |
| S23 | 自然 | 6864084600281371150 | 49825cb1ed50117a7fe586ebaedcd6e3 |
| HERO | 赛博朋克 | 6746808141544952323 | 8e723bd567bbe6feb195e90843479b73 |

这说明当前可访问缓存中仍无精确包，不说明资源已永久下架。找回时需要对应资源 ID、包哈希或可验证的版本映射，再接入背景滤镜渲染。

## 缓存与证据

两份封面缓存本轮重新校验通过，均有 8 个模板、119 个去重对象、46,579,803 字节；解析后目录 JSON 的 SHA-256 相同：`d51da387b21b7e1ae2278c26da11a3e77bcac599bafbc2d813fe40c6ff7af318`。

- 主缓存：`$HOME/Library/Application Support/QCut/PrivateAssets/JianyingCover`
- 备份：`$BACKUP_ROOT/qcut-materials/PrivateAssets/JianyingCover`
- 截图：`$EVIDENCE_ROOT/qcut-cover-comparison-2026-09-06/`

截图文件：`qcut-cover-layout-weekend-reopened.png`、`qcut-cover-layout-mobile.png`、`qcut-cover-layout-s23.png`、`qcut-cover-layout-s23-reopened.png`、`qcut-cover-layout-hero.png`、`qcut-cover-layout-hero-edited.png`、`qcut-cover-layout-hero-edited-reopened.png`。截图包含真实灰色背景上的文字渲染，用于隔离文字效果，不替代与同背景剪映输出的逐像素比较。

浏览器验证项目为 `ed8c9463-739a-4136-b4b5-c2d7769493c7`；Electron 使用隔离 profile `$HOME/.cache/qcut-cover-native-audit-profile`，项目 `6a06e56b-8d45-4561-9b2a-33b8bd7abeee`。未修改用户原浏览器项目 `77e01234-cb19-4a84-b4d3-2d7396382b13`。

HERO 改为 QCUT 后的项目正式引用记录：1920×1080 PNG，166,701 字节，SHA-256 `26f3f0e82ca8cffef101be7b5b5b0d1383ceda2c4b9ab10b19b46ed49c3038bb`；640×360 WebP 缩略图，8,626 字节。重开截图可见 QCUT 原生效果和另外两个文字层。此处哈希来自保存后的项目引用，不声称本轮重开后重新导出的 PNG 已做哈希一致性比较。

## 验证

源码位于 SSD `$SSD_ROOT/qcut/qcut`；依赖和验证运行于同步后的 APFS 镜像 `$HOME/.cache/qcut-cover-validation/qcut`。未把专有字体、花字包、预览或生成产物提交进 Git。

```sh
bun x vitest run apps/web/src/lib/cover apps/web/src/components/editor/cover apps/web/src/lib/fonts electron/__tests__/jianying-cover electron/__tests__/jianying-font-private-cache.test.ts electron/__tests__/jianying-text-font-resolver.test.ts packages/editor-core/src/cover electron/__tests__/jianying-text-runtime electron/__tests__/jianying-text-render apps/web/src/lib/preview/__tests__/jianying-text-render-entry.test.ts
bun x tsc --noEmit -p apps/web/tsconfig.json
bun run build:electron
```

- 281 项测试通过，1 项原生版本比对 E2E 因环境门控跳过；32 个文件通过、1 个文件跳过。
- Web TypeScript、完整 Electron 构建、33 个变更代码文件的 Biome 检查通过。
- 安全测试涵盖非本机 Host、跨源 Origin、跨站请求、错误方法、畸形/过大字体请求和错误响应不泄露路径；资源测试涵盖校验损坏、路径穿越、重复路径、包额外文件、符号链接和默认字体缺失。
- 390×844 下封面对话框恰好占满视口，无横向溢出；“套用文字布局”按钮 `clientWidth` 和 `scrollWidth` 均为 293，已目视检查截图。
- 推送前 PR 旧 HEAD `b957e1d8` 的 macOS/Linux CI 成功，Windows 失败。已定位并修复本轮链路相关的私有字体并发重命名 EPERM；旧运行另有 Remotion 平台未初始化及人物抠图测试路径失败。本地验证不代表新提交 Windows CI 已通过，须以新 HEAD 检查为准。

## 剩余差距

S23 的原生包默认颜色与封面预览不同，模板级颜色覆盖仍需接入。竖排、模板背景滤镜与完整合成未完成；字距、阴影、斜体和文本框边界仍是参数映射，不是所有剪映样式的像素等价实现。先完成同背景、同字体、同文字的导出对照，再扩大到其余四个准备成功但未实机验证的样本。
