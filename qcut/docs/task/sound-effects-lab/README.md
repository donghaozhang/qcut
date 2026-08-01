# QCut Sound Effects Lab / QCut 音效实验室

Date / 日期: 2026-08-01  
Branch / 分支: `codex/sound-effects-lab`

## 中文

### 目标与边界

音效实验室是一个默认关闭、仅供本地开发和内部对标使用的剪映音效参照目录。
它复用 QCut 现有音频卡片、试听播放器、素材缓存和时间线导入链路，但不把剪映
音频、缓存目录、签名 URL 或机器专属 manifest 放进 Git，也没有上传到 Supabase。

剪映中的 `free` / `VIP` 只表示剪映产品内的访问规则，不是再分发许可证。因此:

- 实验室资源标记为 `commercialUse: restricted` 和“禁止分发”；
- 本地参照音效不能收藏、不能写入最近使用，避免持久化临时 `blob:` URL；
- 用户明确点击加入时间线后，QCut 才读取并导入该本地文件；
- 正式发布目录只能换成 QCut 自有、CC0、AI 生成或另行授权的音效。

### 架构

```text
combined-title-file-map.json
  -> build-local-sound-effects-lab-manifest.ts
     - 检查每个本地路径
     - 重新计算并比对 MD5
     - 计算 SHA-256 / 字节数
     - 用 ffprobe 读取真实时长
  -> sound-effects-lab.local.json (仅本机)
  -> Electron platform.files.readFile
  -> 延迟生成 File + blob URL
  -> AudioLibraryItem / AudioPreviewPlayer
  -> addSoundToTimeline
```

关键实现:

- `apps/web/src/lib/audio/local-sound-effects-manifest.ts`:严格 schema、路径和
  唯一性校验；
- `apps/web/src/hooks/media/use-local-sound-effects-lab.ts`:默认关闭的本地目录
  加载状态；
- `apps/web/src/components/editor/media-panel/views/sound-effects-lab.tsx`:
  分类、搜索、分批挂载、试听和导入 UI；
- `scripts/build-local-sound-effects-lab-manifest.ts`:从采集映射生成完整性
  manifest；
- `apps/web/src/lib/assets/freesound-asset.ts`:给本地参照音频保留 restricted
  license、字节数和 SHA-256。

### 本地库存

生成的 manifest:

`~/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/sound-effects-lab.local.json`

| 指标 | 结果 |
|---|---:|
| 分类 | 20 |
| 音效 | 382 |
| 唯一 resource ID / numeric ID | 382 / 382 |
| 唯一 MD5 / SHA-256 | 382 / 382 |
| 缺失文件 / 未声明分类引用 | 0 / 0 |
| 总大小 | 84,579,696 bytes (约 80.7 MiB) |
| 总时长 | 3,262.541 秒 (约 54 分 23 秒) |

分类数量:

| 分类 | 数量 | 分类 | 数量 |
|---|---:|---|---:|
| 热门 | 20 | 网感口播🔥 | 20 |
| 综艺感 | 20 | 魔法 | 20 |
| 知识科普 | 20 | 转场 | 20 |
| 笑声 | 20 | 打斗 | 20 |
| 尴尬 | 16 | 最新 | 20 |
| 热梗语录 | 20 | 震惊 | 20 |
| 抽象 | 20 | 提示音 | 20 |
| 机械 | 20 | 悬疑 | 20 |
| BGM | 20 | 美食 | 20 |
| 动物 | 20 | 环境音 | 20 |

`尴尬` 为 16 条，因为当前剪映目录总共只确认到 16 个唯一资源；其余类别已到
20 条。实验室 UI 默认只挂载 60 张卡，避免一次为 382 个文件创建对象 URL。

### 启用和重建

先生成 manifest:

```bash
bun run build:sound-effects-lab-manifest -- \
  --input "$HOME/Documents/QCut/exports/jianying-sfx-batch-02-2026-08-01/combined-title-file-map.json" \
  --output "$HOME/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/sound-effects-lab.local.json" \
  --catalog-date 2026-08-01
```

再启动桌面开发版:

```bash
cd apps/web
VITE_QCUT_ENABLE_SOUND_EFFECTS_LAB=true \
VITE_QCUT_SOUND_EFFECTS_LAB_MANIFEST_PATH="$HOME/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/sound-effects-lab.local.json" \
bun run dev
```

另一个终端运行:

```bash
NODE_ENV=development bun run electron
```

未同时提供 enable flag 和 manifest 路径时，入口不会出现或显示明确配置错误。

### 验证结果

自动化验证:

- Web 和 scripts TypeScript 检查通过；
- manifest、配置、本地文件、受限 license、UI、试听回归、音频 store 和贴纸
  manifest 共 86 个相关测试通过；
- 382 个真实文件重新计算完整性，0 缺失、0 重复内容、0 未知分类引用。

Electron 真实验证:

1. 音频侧栏出现烧瓶图标和“音效实验室 / 剪映参照目录”；
2. 目录显示 382 个音效和 20 个分类，首屏成功读取 60 张卡；
3. 选择“转场”得到 20 条，搜索“唰”得到 1 条；
4. 点击“仙尘音效”后卡片切换为暂停态，底部播放器出现；
5. 点击“唰”加入时间线后，同名 UI 节点从 1 增至 2，时间线出现音频轨道，
   卡片显示缓存勾选且无页面错误。

首次真实测试发现一条 BGM 长 888.792 秒，超过原先 10 分钟 schema 上限，
导致目录按 fail-closed 拒绝加载。上限已调整为 30 分钟，并加入 888.792 秒
回归测试；修复后完整目录加载成功。

本地截图证据(不进 Git):

- `evidence/03-audio-library-lab-entry.png`:实验室入口；
- `evidence/04-sound-effects-lab-382.png`:382 条目录；
- `evidence/05-sound-effects-lab-playing.png`:真实试听状态；
- `evidence/06-sound-effects-lab-filtered.png`:分类和搜索；
- `evidence/07-sound-effect-added-to-timeline.png`:加入时间线。

完整路径:
`~/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/evidence/`

### 下一步

1. 对 382 条参照音效做响度、峰值、静音头尾和重复听感 QA；
2. 用参照 taxonomy 建立可公开发布的自有/CC0/生成音效替换清单；
3. 给正式资源补齐语言、情绪、场景、响度和商业授权 metadata；
4. 只有资源权利确认后，才设计 Supabase 发布 manifest 和权限策略；
5. 如果继续扩充剪映参照批次，生成器和 schema 已支持最多 2,000 条，但仍应
   保持本地私有。

## English

### Purpose and boundary

Sound Effects Lab is an opt-in, desktop-only Jianying reference catalog for
internal parity work. It reuses QCut's audio cards, preview player, asset cache,
and timeline insertion path. Jianying payloads, cache databases, signed URLs,
and machine-specific manifests are neither committed nor uploaded.

Every reference is marked restricted and non-redistributable. Reference cards
cannot be favorited or persisted in recents because their `blob:` URLs are
session-scoped. A file is read only when its visible card mounts, and it is
materialized into the project only after the user chooses Add to timeline.

### Verified inventory and behavior

The local manifest contains 382 unique sounds across 20 categories: 382 unique
resource IDs, numeric IDs, MD5 hashes, and SHA-256 hashes; zero missing files;
84,579,696 bytes; and 3,262.541 seconds of audio. Every category contains 20
references except Embarrassing (`尴尬`), where the currently confirmed Jianying
catalog has 16 unique resources.

Desktop E2E verified catalog loading, 60-card lazy paging, category filtering,
search, real playback, and insertion of a local MP3 into an existing timeline.
The first run exposed a real 888.792-second BGM that exceeded the original
10-minute guardrail. The limit is now 30 minutes and covered by a regression
test.

### Release rule

This catalog is evidence, not a distributable asset source. A production QCut
catalog must replace every reference with QCut-owned, CC0, generated, or
separately licensed audio before any Supabase publication or product release.
