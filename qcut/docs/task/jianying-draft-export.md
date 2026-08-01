# QCut → 剪映 / CapCut 草稿导出

## 当前结论

QCut 现在保留两条明确分开的导出路径：

- `synthetic-plaintext-5.9` 是早期剪映明文兼容基线，不能代表新版剪映或
  CapCut 已验证兼容。
- `CapCut 8.1.1 / macOS` migration profile 根据本机参考草稿构建可迁移 bundle，
  已覆盖结构生成、素材复制、完整性校验、写后重读，以及实际应用包/字体文件的
  cmap 预检；新 E2E bundle 尚未在隔离 macOS 会话里完成打开、保存、重开和导出，
  因此不能宣称视觉回归已经闭环。

QCut 不读取、覆盖或解密用户现有草稿。自动 GUI 回归也不得在 Peter 的主账号
或其任何子目录中运行。

## 中文方框根因

旧的 LUT + Mask 验证图里，`真□□入□□` 不是 CapCut 原生文字层：

- 对应 `draft_info.json` 的 `materials.texts` 为空，轨道只有 `video` 和
  `adjust`。
- 原始 `qcut-e2e-video.mp4` 在导入前的 3.1 秒帧里已经包含同样的方框。
- 原始视频、migration bundle 资产和已保存草稿资产的 SHA-256 都是
  `192edb04b2db671f4d9993e3c16b927852cd550028ea39a005ff4fdf07f1b891`。
- 同一份 CapCut 导出帧中，原生标题 `QCut → 剪映` 和底部原生中文字幕完整，
  只有中间烧进源视频的旧测试文案仍有方框。

因此，已证明的结论是：旧 fixture 在生成视频像素时使用了未受控或不完整的字体
fallback，方框在 CapCut 导入前就已存在。旧生成命令没有保留，不能把根因进一步
归到某一个具体字体。

本机 cmap 检查提供了边界证据：

- CapCut `zh-hans.ttf` 是 `Source Han Sans CN Medium`，对
  `剪映真实导入测试` 无缺失字形。
- CapCut `en.ttf` 是 `Metropolis Medium`，不包含这 8 个汉字。
- CapCut `ja.ttf` 是 `Source Han Sans JP Medium`，恰好只缺截图中变成方框的
  `实`、`导`、`测`、`试`。这与旧图高度吻合，但由于旧 FFmpeg 命令没有保留，
  只能作为“很可能误用了日文字体 fallback”的证据，不能反推为已证明的具体字体。
- CapCut 8.1.1 在省略草稿字体字段时可以内部 fallback 并完整显示已测中文，
  但这不等于任意汉字、任意字体或其他版本都已经验证。

## 可重复 E2E 素材

生成自包含测试 run：

```bash
bun run capcut:e2e:fixtures -- --run-id <run-id>
```

生成器只使用当前平台随 QCut 分发的 FFmpeg / FFprobe 8.1.2，不回退到系统
`PATH`。每个 run 包含：

- 6 秒、180 帧、无音轨 H.264：前 3 秒冻结 testsrc2 的首帧作为 `CLIP A`，
  后 3 秒冻结 SMPTE bars 的首帧作为 `CLIP B`；所有烧入像素只使用 ASCII。
- 顶部 96 像素显示全局零基帧号，视觉比较区固定为 `1280x624+0+96`，不会把
  动态帧号误算进 dissolve 指标。
- fixture schema 2 保存 12 张校准图及 hash：A 的 0/45/46/83/89 帧比较区必须
  完全相同，B 的 90/97/135/136/179 帧比较区必须完全相同，A/B 必须不同，
  45/46 帧的帧号条必须不同。
- 独立 48 kHz mono PCM WAV：前 3 秒 440 Hz，后 3 秒 660 Hz。
- 独立 `cjk-font-proof.png`；中文不会烧进导入 CapCut 的源视频。
- 字体逐 Unicode scalar cmap 检查、字体文件 hash、所有产物 hash、ffprobe
  原始结果和实测音频频率。频率容差为 ±1 Hz，不符合即失败。

从有效 run 生成三类 migration bundle：

```bash
bun run capcut:e2e:bundles -- --run-id <run-id>
```

三个 case 是：

1. 原生标题 `剪映真实导入测试 ABC123`、原生字幕、透明 PNG 贴纸和独立音频。
2. Clip A → Clip B 的 dissolve；请求 0.5 秒，CapCut 8.1.1 profile 会明确
   canonicalize 为已验证的 466666 微秒，并产生固定 warning。
3. 同一段 Clip A 重复两次；第二段应用明显的 2×2 invert LUT 和静态 ellipse
   mask，便于做 raw / treated 像素对照。

每个 case 都必须精确匹配 warning allowlist、没有 blocker 或 durability warning，
写入后再由 `verifyCapCut81MigrationBundle` 完整重读。bundle manifest 记录草稿、
素材、LUT、贴纸 alpha 和完成标记的 hash。

## 字体导出策略

CapCut 8.1.1 的当前保守策略是：

- 只在 macOS 8.1.1 profile 接受 `system` 默认字体路径。
- 旧默认 `Arial` 可以导出，但必须给出
  `CAPCUT_FONT_FAMILY_SUBSTITUTED` warning，因为它不会被原样保留。
- 未建立参考映射的显式字体、font runs、Emoji、未验证 script、平台或版本会在
  写盘前阻断。
- text 和 caption 使用相同 preflight；隐藏或不会进入 mapper 的元素不制造
  假警告。
- 写草稿前还会只读检查实际 `/Applications/CapCut.app`：应用 ID、短版本、bundle
  版本、可执行文件、`Info.plist`、`en.ttf` 和 `zh-hans.ttf` 都要满足 8.1.1
  约束，并对本次所有可见文字按 Unicode scalar 检查两份字体 cmap 的并集。
  缺应用、文件漂移、hash 漂移或任一字形在两份字体中都不存在时，导出直接阻断。
- 最终草稿不伪造 `font_name`、`font_path`、`fonts` 或 `styles[].font`。

这套 cmap 策略是防止静默丢字的必要条件，不是 CapCut 已实际选择 fallback、完成
shaping 或正确渲染的充分条件，更不是“所有中文字体 fidelity 已验证”的承诺。以后要
支持显式字体，必须为每个字体建立版本绑定的参考草稿、资源复制规则和真实 GUI
回归；否则只能选择系统 fallback 或烘焙为透明媒体。

## 原生字体参考采集

当前唯一真实保存证据是 CapCut 8.1.1 的系统 fallback：保存后 text material 会写入
`font_path=/Applications/CapCut.app/Contents/Resources/Font/SystemFont/en.ttf`，
但 `font_name`、`font_id`、`font_resource_id` 仍为空，material `fonts` 是空数组，
`styles[].font` 和顶层 `materials.fonts` 都不存在。中文仍能显示，说明这个
`font_path` 不是“所有字符只由 en.ttf 渲染”的证明；CapCut 内部仍会做 fallback。

显式字体必须在独立 macOS 用户或 VM 中逐个采集。每次只对固定文案
`剪映字体参考ABC123` 改一个字体，保存并完全退出后分别复制修改前、修改后的同一
草稿快照；material ID、文字、字号、样式和所有非字体字段必须保持不变。分析命令：

```bash
bun run capcut:e2e:font-reference -- \
  --before /absolute/path/to/before-draft \
  --after /absolute/path/to/after-draft \
  --text '剪映字体参考ABC123' \
  --font-label 'UI 中显示的字体名' \
  --output /absolute/path/to/reference.json
```

分析器同时读取根目录和 timeline 的 `draft_info.json`，记录文件 hash，并只接受
`font_*`、material `fonts`、顶层 `materials.fonts` 和 `styles[].font` 的变化。
无字体变化、root/timeline 不一致、material ID 变化或任何非字体语义变化都会拒绝。
至少要分别采集系统默认、一个 CapCut 内置中文字体和一个下载中文字体，再检查实际
字体文件的 cmap 与授权/复制规则，才能把该字体加入 `CapCut81FontResolver`。字体
不存在、文件 hash 漂移或目标文字缺字时必须阻断；不能静默换成系统字体。

原始草稿和 CapCut 字体资源只留在忽略的本地证据目录，不提交或分发；仓库只记录
人工审阅后的字段规则、测试和非专有的 hash 证据。

## GUI 安全边界

Stage-0 探测已证明：启动 CapCut 8.1.1 时设置临时 `HOME`、
`CFFIXED_USER_HOME` 和 `--draft_path`，应用仍会读取
`/Users/peter/Library/Containers/com.lemon.lvoverseas/...` 并显示 Peter 的 7 个
真实草稿。探测没有点击草稿、保存或导出，发现真实 store 后立即退出，前后 root
hash 未变化。

所以后续 GUI 自动化只能使用：

- 独立 macOS 测试用户及独立登录会话；或
- 一次性 macOS VM。

运行前必须通过 disposable-store sentinel 守卫。守卫拒绝 Peter 主目录及其所有
子目录、symlink、非空 store、异常 `root_meta_info.json`、路径绑定不符和孤儿
内容，并记录 root metadata 的 hash / inode / mtime / draft ids。

当前机器只有 `peter`（UID 501）一个真实用户，没有可用的独立测试登录。GUI runner
因此只有 dry-run 和模拟 adapter 测试可用，不能在本机主账号启动 CapCut。runner
收集到的文件也只能标为 `capture-only / unverified`；只有后续视觉 oracle 或绑定
hash 的人工审查回执才能把具体检查升级为 verified。

真实 adapter 接入前还必须校验当前 Aqua / console 登录 UID，并在每次 GUI 操作后
校验 CapCut PID 的 euid、container 和草稿 store 都属于同一独立用户。仅修改 `HOME`
或从另一个 shell UID 启动进程不构成 GUI 隔离；发现 Peter 已运行的 CapCut PID 时
必须立即拒绝。安装后的草稿还要逐文件比对源 bundle，保存和重开后重新解析结构、
素材 hash 与时间线语义；截图和导出视频必须以单文件描述符快照的 hash 绑定到最终
oracle 结果。

## 下一阶段与发布门槛

按以下顺序闭环，不跳过视觉验证：

1. 在独立 macOS 用户或 VM 中先通过 Aqua session、CapCut PID/euid、container、
   store 和应用/字体快照预检，再安装三个新 bundle；每个都执行打开、保存、退出、
   重开、导出。
2. 先做 source-video 打开/播放/导出 smoke。fixture 为标准 H.264 High/yuv420p，
   使用固定 QP 10 全帧内编码维持校准区像素稳定；在 8.1.1 真机确认兼容前，
   仍不能把 schema 2 称为“已验证可导入”。
3. 原生中文精确检查：标题必须是 `剪映真实导入测试 ABC123`，字幕无 tofu；
   保存和重开后重复检查。
4. 贴纸检查透明边缘；导出音轨再次测量前后 440 / 660 Hz。
5. dissolve 在转场前、中、后各取帧；按 466666 微秒 profile 判断，不按请求的
   500000 微秒误判。
6. LUT / mask 用同一个 Clip A 比较 raw、treated ellipse 内外像素，保存和重开
   后重复。
7. 保存后的草稿重新读取并核对结构、素材 hash 和时间线语义；再跑 macOS / Windows
   目标矩阵。Windows 在建立同版本参考证据前保持阻断。

只有以上真实打开、重开、可编辑和导出回归全部通过，才能把 CapCut 8.1.1 profile
标为视觉已验证。其他 CapCut / 剪映版本必须分别建立 reference 和发布门槛。

## 本地参考仓库

参考仓库只存在于被 Git 忽略的 `.reference-repos/`，不是 QCut 运行时依赖：

| 仓库 | 固定研究提交 | 用途 | 许可证 |
| --- | --- | --- | --- |
| [pyJianYingDraft](https://github.com/GuanYixuan/pyJianYingDraft) | `c3318066d964744e2bfc66f75c71745fe8cea52a` | 5.9 完整骨架、素材和片段语义 | Apache-2.0 |
| [capcut-cli](https://github.com/renezander030/capcut-cli) | `42ae5047e6f61ff1081c5ce76ecfd6afca7974be` | TypeScript 类型、版本护栏、原子写入 | MIT |
| [VectCutAPI](https://github.com/sun-guannan/VectCutAPI) | `c12b8e3effc5f610748e315363e000313b4ed7e3` | 工程目录和时间线镜像布局 | Apache-2.0 |

QCut 不分发剪映或 CapCut 的官方贴纸、字体、效果资源、模板预览或缓存内容。
