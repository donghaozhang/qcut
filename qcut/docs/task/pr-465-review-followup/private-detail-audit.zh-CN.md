# 私有信息审计：PR #465 合并后的 `master`

记录时间：2026-09-06。基线：`origin/master` @ `c3c52a9b3`（`v2026.09.06.2`）。仓库为**公开**仓库。

## 为什么有这份文档

CodeRabbit 在 PR #465 上只对 5 个文档、6 处位置提出「移除本机私有路径 / 私有目录字段」的评论。
评审收尾时对整个 PR diff（219 个文件、+26589 行）做了一次全量只读扫描，发现同类内容远不止那 6 处；
又因为 PR 已合并，进一步对 `master` 上三个相关目录做了逐文件统计。结论分两类：

1. **本机绝对路径**（`/Users/<用户名>/...`、`/Volumes/<卷名>/...`）：不含任何技术价值，
   只是把开发者用户名和外接硬盘名写进了公开仓库。这一类与仓库自身的规则相悖
   （研究 README 与 FLP-008 都要求证据留在仓库外），应当清理。
2. **私有运行时身份与逆向细节**（dylib UUID、私有包文件 SHA-256、代码偏移地址、剪映缓存路径）：
   这是 `docs/task/jianying-filter-runtime-research/` 与 `research/` 长期以来有意采用的研究记录方式，
   README 明确允许「QCut 自撰的研究文字和探针源码」，provenance 门禁刻意不对符号内容做启发式判断。
   评审中 `3943098746` 正是基于这一点被驳回。是否继续公开属于**仓库所有者的决定**，本文只给出规模。

两类都不涉及密钥、签名下载 URL、rp.db / ressdk_db 行内容或二进制文件——全量扫描未发现任何一项。

## 一、本机绝对路径（建议清理）

统计范围：`docs/task/jianying-filter-runtime-research/`、`research/`、`electron/qcut-independent-filter/`。

| 模式 | 出现次数 | 文件数 |
| --- | --- | --- |
| `/Users/<用户名>/...` | 61 | 26 |
| `/Volumes/<卷名>/...` | 1 | 1 |

其中 PR #465 新增文件贡献了绝大部分；`bach-algorithm-model-clip-params.zh.md`（1 处）是合并前已存在的。
CodeRabbit 的 5 条评论只覆盖其中 5 处（见 [README](README.zh-CN.md) 待修第 12/13 项）。

### 逐文件

| 文件 | `/Users/` | 备注 |
| --- | --- | --- |
| `research/independent-soft-glow/stream.zh.md` | 10 | 构建命令 `-B` 参数、视频目录、MP4 链接 |
| `docs/task/jianying-filter-runtime-research/hybrid-dual-sharpen-batch2-2026-09-06.zh.md` | 8 | 证据根目录、`Application Support/QCut/Research/...` 绝对形式、`--source` 示例帧 |
| `research/independent-soft-glow/semantic-glow.zh.md` | 6 | 另含 1 处剪映缓存路径 |
| `research/independent-soft-glow/README.zh.md` | 3 | 目录列表、`--executable` 示例 |
| `research/independent-soft-glow/semantic-lifecycle.zh.md` | 3 | 另含 1 处剪映缓存路径 |
| `docs/task/jianying-filter-runtime-research/agfx-texture-contract-2026-09-06.zh.md` | 2 | 私有证据根目录、`JY_EVIDENCE=` 示例 |
| `docs/task/jianying-filter-runtime-research/binary-priority-research-2026-09-06.zh.md` | 2 | 第 3 行还把工作区绝对路径写进了标题元数据 |
| `docs/task/jianying-filter-runtime-research/hybrid-dual-lut-batch-2026-09-06.zh.md` | 2 | 目录核查文件、证据根目录 |
| `docs/task/jianying-filter-runtime-research/independent-lut-batch-2026-09-06.zh.md` | 2 | 第 108 行是 `Application Support/QCut/JianyingFilterPackages/...` 的绝对形式，应改 `$HOME` |
| `docs/task/jianying-filter-runtime-research/soft-glow-agfx-case-2026-09-06.zh.md` | 2 | 另含 1 处剪映缓存路径 |
| `docs/task/jianying-filter-runtime-research/soft-glow-intensity-probes-2026-09-06.zh.md` | 2 | |
| `docs/task/jianying-filter-runtime-research/soft-glow-ui-video-verification-2026-09-06.zh.md` | 2 | |
| `docs/task/jianying-filter-runtime-research/vecreator-filter-params-2026-09-06.zh.md` | 2 | |
| `docs/task/jianying-filter-runtime-research/videoeditor-filter-chain-2026-09-06.zh.md` | 2 | |
| `research/independent-soft-glow/semantic-contract.json` | 2 | `local_report` / `local_evidence_snapshot` 字段 |
| `docs/task/jianying-filter-runtime-research/bach-algorithm-model-clip-params.zh.md` | 1 | 合并前已存在 |
| `docs/task/jianying-filter-runtime-research/hybrid-dual-3dl-batch3-2026-09-06.zh.md` | 1 | |
| `docs/task/jianying-filter-runtime-research/independent-complex-batch2-2026-09-06.zh.md` | 1 | CodeRabbit `3943205588` |
| `docs/task/jianying-filter-runtime-research/independent-complex-batch3-2026-09-06.zh.md` | 1 | CodeRabbit `3943205588` |
| `docs/task/jianying-filter-runtime-research/independent-complex-migration-2026-09-06.zh.md` | 1 | CodeRabbit `3943098743` |
| `docs/task/jianying-filter-runtime-research/independent-filter-product-2026-09-06.zh.md` | 1 | CodeRabbit `3943098743` |
| `docs/task/jianying-filter-runtime-research/soft-glow-product-integration-2026-09-06.zh.md` | 1 | |
| `research/independent-soft-glow/graph-evidence.zh.md` | 1 | |
| `research/independent-soft-glow/intensity-modes.zh.md` | 1 | |
| `research/independent-soft-glow/semantic-contract.zh.md` | 1 | |
| `research/independent-soft-glow/semantic-experiments.json` | 1 | `private_reproduction_directory` 字段 |
| `docs/task/jianying-filter-runtime-research/independent-fog-chain-2026-09-06.zh.md` | 0（`/Volumes/` 1） | 第 50 行外接卷路径，CodeRabbit `3943098743` |

### 全仓库视角

同一模式在 `docs/` 与 `research/` 整体上共 **291 处、88 个文件**，最早可追溯到 2026-02-12。
也就是说这不是 PR #465 引入的新习惯，而是一直没有被任何门禁拦住。
`daytona-supabase-agent/`、`sound-effects-lab/`、`jianying-video-basic-panel-reference/evidence/*.json` 等目录都有。

### 建议的处理方式

1. 先清理上表 26 个文件（PR #465 范围），统一改成占位符：
   证据根目录用 `$EVIDENCE_ROOT` 或 `<仓库外证据根目录>`，
   `Application Support` 路径一律写成 `$HOME/Library/Application Support/QCut/...`。
   两个 JSON 文件里的 `local_report` / `local_evidence_snapshot` / `private_reproduction_directory`
   字段值改成相对路径或删掉字段。
2. 在 `scripts/check-filter-provenance.ts`（CI 已经在跑）里增加第三条静态检查：
   `git ls-files` 中的 `.md` / `.json` / `.ts` 不得含 `/Users/[^/]+/` 或 `/Volumes/`。
   先只对 `docs/task/jianying-filter-runtime-research/` 与 `research/` 生效，避免一次性把 88 个历史文件全拦下。
3. 其余 62 个历史文件另开任务分批处理，或在门禁里用允许清单过渡。

清理时不要连带改掉 `$HOME/...`、`~/Library/...` 形式的可移植路径，评审已明确保留它们。

## 二、私有运行时身份与逆向细节（所有者决定）

同一统计范围内：

| 模式 | 出现次数 | 文件数 | 主要来源 |
| --- | --- | --- | --- |
| dylib / 二进制 UUID | 48 | 26 | `research/jianying-runtime-probe/README.md`（6）、`research/jianying-tracking-probe/README.md`（4）、各 `*-2026-09-06.zh.md` 每篇 2 个（ARM64 + x86_64） |
| SHA-256 摘要（64 个十六进制字符） | 720 | 62 | `electron/qcut-independent-filter/graph-profiles*.ts` 合计 324 个，为产品运行时校验 LUT 资产/控制文件身份的 `assetHash` / `controlHash`；研究文档中是私有包文件与 dylib 的摘要 |
| 代码偏移地址 `0x…` | 289 | 33 | `probes/jianying-matting-runtime-trace.mm`（61）、`videoeditor-filter-chain-2026-09-06.zh.md`（54）、`agfx-texture-contract-2026-09-06.zh.md`（29）、`vecreator-filter-params-2026-09-06.zh.md`（19） |
| 剪映缓存路径（`Movies/JianyingPro/User Data/Cache`、`PrivateAssets/JianyingText/Cache`） | 12 | 9 | 多为 `~/` 前缀的可移植形式 |

### 判断

- `graph-profiles*.ts` 里的摘要是**产品功能**：渲染前校验本机私有 LUT 是否与研究时的资产逐字节一致，
  没有它独立渲染器就失去了「与剪映输出对齐」的依据。摘要本身不能还原文件，与 `verified-algorithm-packages.ts`
  在 `master` 上已有的 resourceId + version-md5 配对是同一模式。**不建议动。**
- 研究文档里的 UUID / SHA-256 / 偏移地址是可复现性的一部分（读者据此确认自己手上的运行时版本与文中一致）。
  PR #465 之前的 20 余篇研究文档已经这样写，`3943098746` 的驳回理由也依赖这一惯例。
  如果所有者决定收紧，需要**同时**改 README 的范围声明、FLP-008 的门禁条款和全部历史文档，
  而不是只删 PR #465 新增的几篇——否则规则和实际内容会自相矛盾。
- 剪映缓存路径 12 处里 `~/` 形式的与 `$HOME` 等价，可保留；其中 3 处以 `/Users/<用户名>/` 开头，已计入第一类。

## 三、已确认不存在的问题

全量扫描 PR diff 新增行（排除 lock 文件）与 `master` 三个目录后，以下各项均为零：

- API key / token（`sk-`、`fal_`、`sbp_`、`ghp_`、`AKIA`、JWT、Bearer、PEM）；
- 带签名或 token 查询串的下载 URL（只出现 `fal.ai` / `queue.fal.run` 与 `*.test` 测试主机）；
- `rp.db` / `ressdk_db` / `http_cache` 行内容或 CDN、ByteDance 主机名；
- 剪映用户 uid / 设备 id、邮箱、主机名；
- 二进制文件或体积异常的新文件（最大新增文件是 43 KB 的 drizzle 快照 `packages/db/migrations/meta/0010_snapshot.json`）；
- `*.private.json` 证据文件（只被引用，未被提交）。

`bun scripts/check-filter-provenance.ts` 在当前树上通过（13658 个受跟踪文件，退出码 0）。

## 复现本审计

```bash
# 在仓库根目录执行（不是 qcut/ 子目录）；两个路径族一起统计
git grep -I -o -E '/(Users|Volumes)/[^/]+/' origin/master -- qcut/docs qcut/research | wc -l
```

上表的逐文件数字来自把三个目录导出后用脚本统计，比单条 `git grep` 更严格地区分了
`/Users/`、`/Volumes/`、剪映缓存路径、UUID、SHA-256 和偏移地址六类：

```bash
git archive origin/master qcut/docs/task/jianying-filter-runtime-research \
  qcut/research qcut/electron/qcut-independent-filter | tar -x -C <临时目录>
```

注意 `git grep` / `git ls-tree` 的 pathspec 相对于**当前目录**解析：在 `qcut/` 子目录里执行时不要再加 `qcut/` 前缀，
否则会静默返回空结果——本次审计第一遍就因此得出「0 处」的错误结论。
