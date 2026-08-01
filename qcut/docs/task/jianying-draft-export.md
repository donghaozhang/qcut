# QCut → 剪映 / CapCut 草稿导出

## 当前结论

QCut 现在保留两条明确分开的导出路径：

- `synthetic-plaintext-5.9` 是早期剪映明文兼容基线，不能代表新版剪映或
  CapCut 已验证兼容。
- `CapCut 8.1.1 / macOS` migration profile 根据本机参考草稿构建可迁移 bundle，
  已覆盖结构生成、素材复制、完整性校验和写后重读；新 E2E bundle 尚未在隔离
  macOS 会话里完成打开、保存、重开和导出，因此不能宣称视觉回归已经闭环。

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
- CapCut 8.1.1 在省略草稿字体字段时可以内部 fallback 并完整显示已测中文，
  但这不等于任意汉字、任意字体或其他版本都已经验证。

## 可重复 E2E 素材

生成自包含测试 run：

```bash
bun run capcut:e2e:fixtures -- --run-id <run-id>
```

生成器只使用当前平台随 QCut 分发的 FFmpeg / FFprobe 8.1.2，不回退到系统
`PATH`。每个 run 包含：

- 6 秒无音轨 H.264：前 3 秒为 testsrc2 `CLIP A`，后 3 秒为 SMPTE
  `CLIP B`；所有烧入像素只使用 ASCII。
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
- 最终草稿不伪造 `font_name`、`font_path`、`fonts` 或 `styles[].font`。

这套策略防止静默丢字，但目前不是“所有中文字体 fidelity 已验证”的承诺。以后要
支持显式字体，必须为每个字体建立版本绑定的参考草稿、资源复制规则和真实 GUI
回归；否则只能选择系统 fallback 或烘焙为透明媒体。

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

## 下一阶段与发布门槛

按以下顺序闭环，不跳过视觉验证：

1. 在独立 macOS 用户或 VM 中安装三个新 bundle；每个都执行打开、保存、退出、
   重开、导出。
2. 原生中文精确检查：标题必须是 `剪映真实导入测试 ABC123`，字幕无 tofu；
   保存和重开后重复检查。
3. 贴纸检查透明边缘；导出音轨再次测量前后 440 / 660 Hz。
4. dissolve 在转场前、中、后各取帧；按 466666 微秒 profile 判断，不按请求的
   500000 微秒误判。
5. LUT / mask 用同一个 Clip A 比较 raw、treated ellipse 内外像素，保存和重开
   后重复。
6. 保存后的草稿重新读取并核对结构、素材 hash 和时间线语义；再跑 macOS / Windows
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
