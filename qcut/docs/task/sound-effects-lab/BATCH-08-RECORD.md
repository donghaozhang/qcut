# Sound Effects Lab Batch-08 / 音效实验室 Batch-08

Date / 日期: 2026-08-22

Branch / 分支: `codex/sound-effects-offline-pack`

PR: [#424](https://github.com/Quriosity-agent/qcut/pull/424)

## 中文

### 最终结论

本批把 QCut 音效实验室从 1108 项扩展到 1422 项。新增 314 项全部来自
Freesound CC0，不是复制剪映受限音频。生产私有 manifest 当前包含:

| 指标 | 结果 |
|---|---:|
| 分类 | 20 |
| 总音效 | 1422 |
| 原有剪映内部参照 | 1108 |
| 新增 Freesound CC0 | 314 |
| 总字节数 | 279,900,295 bytes |
| UI 显示大小 | 266.9 MiB |
| 唯一缓存 SHA-256 | 1422 |

“还差多少”必须分两种口径回答:

1. **分类容量口径:** 已用 314 个 CC0 替代音效补齐本轮数值缺口，当前容量缺口为
   0。
2. **剪映原始载荷口径:** 当前剪映目录有 1411 个唯一 resource ID。旧 QCut
   目录中 1097 个仍在当前目录，另有 11 个历史条目;当前目录的 314 个唯一
   resource ID 没有复制进 QCut。因此一对一剪映原始载荷仍差 **314 个**。

后者是主动保留的版权边界，不是下载失败。314 个 CC0 条目只补充相同分类的
可用容量，不声明与缺失的剪映音效逐条相同。

### 缺口审计

当前剪映目录与 Batch-07 的 1108 项对比得到 314 个唯一缺失资源、330 次分类
出现。一个资源可以属于多个分类，因此两个数字不同。

| 分类 | 缺失分类出现次数 |
|---|---:|
| 综艺感 | 116 |
| 最新 | 68 |
| 笑声 | 61 |
| 网感口播🔥 | 21 |
| 环境音 | 19 |
| 抽象 | 15 |
| 魔法 | 14 |
| 热门 | 12 |
| 机械 | 3 |
| 悬疑 | 1 |
| 合计 | 330 |

其余 10 个分类在这次当前目录对比中没有唯一资源缺口: `打斗`、`动物`、
`尴尬`、`美食`、`热梗语录`、`提示音`、`震惊`、`知识科普`、`转场`、
`BGM`。

### CC0 采集结果

- 从 Freesound CC0 候选中下载并转码 492 项;
- 接受 314 个唯一音频，正好完成 314 个唯一目标;
- 建立 330 次分类分配，其中 16 次来自跨分类条目;
- 新增音频为 24,154,061 bytes;
- 下载失败 0，最终内容 MD5/SHA-256 重复 0;
- 每项保留 Freesound source ID、原始页面、作者、`CC0-1.0` 和许可 URL;
- 生产卡片按条目显示 `Freesound CC0`、作者和 `CC0-1.0`。旧剪映参照仍按
  条目显示受限许可。

最终 QCut 分类计数:

| 分类 | 项数 | 分类 | 项数 |
|---|---:|---|---:|
| 抽象 | 85 | 打斗 | 46 |
| 动物 | 59 | 尴尬 | 16 |
| 环境音 | 90 | 机械 | 53 |
| 美食 | 53 | 魔法 | 87 |
| 热梗语录 | 59 | 热门 | 224 |
| 提示音 | 59 | 网感口播🔥 | 127 |
| 笑声 | 140 | 悬疑 | 71 |
| 震惊 | 29 | 知识科普 | 35 |
| 转场 | 82 | 综艺感 | 236 |
| 最新 | 192 | BGM | 36 |

### 本批代码修复

1. manifest builder 新增 `--previous-private-manifest`。构建新目录时按
   `resourceId` 保留旧对象不可变 key，并校验旧条目的大小、SHA-256 和重复项。
   这避免把 1108 个旧对象错误改写为新的日期路径。
2. 客户端 manifest parser 允许旧对象日期早于当前 catalog 日期，但拒绝未来
   日期。Freesound 必须使用 `qcut/...` namespace，剪映参照必须使用
   `jianying/...` namespace。
3. 私有发布器增加生产保护:旧对象 key 或内容被意外改写时，在上传前失败，
   不会产生半发布目录。
4. license server 固定读取不可变的 Batch-08 manifest。
5. 修复混合许可证显示:音效实验室条目携带经过 schema 校验的 CC0 许可证 URL
   时，资产层不再把它覆盖成“第三方内部参照”。无独立开放许可证的旧条目仍
   fail closed 为 restricted。

### Supabase 与生产接口

| 项目 | 值 |
|---|---|
| Bucket | `sound-effects-lab` (private) |
| 不可变生产 manifest | `qcut/2026-08-22/manifest.batch-08.json` |
| 兼容 manifest | `qcut/2026-08-22/manifest.json` |
| Staging manifest | `qcut/2026-08-22/manifest.staging-1422.json` |
| 旧目录备份 | `qcut/2026-08-22/manifest.1108.bak.json` |
| Manifest SHA-256 | `0900108ff5b8949072a34999bc24d74da2c3b74a7b99d06f45d973e12a6bc241` |
| Worker URL | `https://qcut-license-server.zdhpeter.workers.dev` |
| Worker version | `598b7351-dfe1-400a-80c3-19cc530c683e` |

发布和回读结果:

- 314/314 新对象上传成功;
- 314/314 从私有 bucket 回读后大小和 SHA-256 完全一致;
- 未认证 manifest 请求返回 401;
- 白名单账号返回 catalog `qcut-sfx-library-2026-08-22`、20 分类、1422 项;
- 随机新对象经签名接口下载 29,493 bytes，大小和 SHA-256 匹配;
- 兼容 manifest 已同步到三个旧 `jianying/.../manifest.json` 路径，旧客户端
  不会继续停在 1108 项。

发布报告:

`~/Documents/QCut/Exports/qcut-sfx-cc0-batch-08-2026-08-22/publish-report.json`

### QCut 本地备份

采集、候选、来源、报告和 314 个 CC0 payload:

`~/Documents/QCut/Exports/qcut-sfx-cc0-batch-08-2026-08-22/`

最终 v1/v2 manifest 和发布前 1108 项 manifest:

`~/Documents/QCut/Exports/qcut-sfx-lab-batch-08-2026-08-22/`

这些目录是 QCut 自己的本地备份，不依赖
`~/Movies/JianyingPro/User Data/Cache/music`。

### Electron 离线 E2E

使用启用音效实验室的 production Web build 和真实 Electron 运行:

| 检查 | 结果 |
|---|---:|
| manifest 项数 | 1422 |
| IndexedDB 命中 | 1422 |
| 缺失 Blob | 0 |
| 大小不匹配 | 0 |
| SHA-256 不匹配 | 0 |
| 唯一缓存 SHA-256 | 1422 |
| Batch-08 项 / 命中 | 314 / 314 |
| Freesound CC0 项 | 314 |
| 缓存字节数 | 279,900,295 |
| persistentStorage | `true` |
| 断网播放远端 asset 请求 | 0 |

断网整页重载后，QCut 从自己的 IndexedDB 恢复 1422 项。搜索
`Crowd laugh` 得到 4 个 CC0 条目，卡片显示作者和 `CC0-1.0`;播放按钮进入
“暂停试听”，底部播放器推进到 `0:01 / 0:03`，期间没有请求远端音效对象。

截图证据:

- [1422 项更新入口](./evidence/18-batch-08-update-available.png)
- [1422 项离线包已安装](./evidence/19-batch-08-local-pack-1422-installed.png)
- [断网恢复完整 1422 项目录](./evidence/20-batch-08-offline-1422-catalog.png)
- [断网播放 CC0 音效并显示正确许可证](./evidence/21-batch-08-offline-cc0-sound-playing.png)

### 自动化验证

- 8 个 Web/manifest/publisher 聚焦测试文件，50/50 通过;
- license-server 音效实验室路由 11/11 通过;
- Web production build 包含 TypeScript 检查并通过;
- license-server `tsc --noEmit` 通过;
- 生产 API、Supabase 回读和 Electron 离线播放均为真实环境验证。

### 2026-08-26 收尾更新

PR #424 已于 2026-08-22 合并。此前未完成清单中的以下项目已经完成:

- 入口默认可见，并有加载、无权限、网络不可用和离线状态;
- 顶部改为混合许可证计数，314 个 CC0 条目开放收藏、收藏夹和拖拽，1108 个
  剪映参照继续限制这些个人复用动作;
- 真实生产 smoke test 已提交为显式 opt-in Electron E2E;
- 1422 个音频已完成自动化全库 QA，1422 通过、0 失败、0 内容哈希重复;
- CC0 加入时间线、保存、退出重启恢复和带声音 MP4 导出已完成;
- 新版 manifest 保留作者和 554 个 VIP 标记，并通过兼容双端点上线。

当前未完成项只剩公开发行替换、199 个 QA 警告的人工抽听、11 个历史 ID 的
元数据恢复、正式签名 `app://.` 冷安装验证，以及离线包异常恢复 UX。完整证据见
[2026-08-26 收尾报告](./FINALIZATION-2026-08-26.md)。Batch-09 之后新增 314 个
剪映受限原始参照，公开发行前的替换范围扩大为 1422 项，最新清单见
[Batch-09 记录](./BATCH-09-RECORD.md)。

### 2026-08-22 历史未完成事项

以下内容保留为 Batch-08 当日快照，已被上面的 2026-08-26 更新取代。

#### P0:公开发行边界

1. 1108 个旧条目仍是剪映内部参照，不能随 QCut 公开发行。必须逐项替换为
   QCut 自有、CC0、AI 生成或另行取得授权的音频，替换完成前 private bucket、
   白名单和 fail-closed 行为都必须保留。
2. 当前仍缺 314 个“与剪映当前 resource ID 一对一相同”的原始载荷。现有 CC0
   是分类级替代，不是精确复刻。若目标改为内容对标，应建立听感/用途映射，
   不能用相同数量代表相同内容。
3. 页面顶部仍使用全局“仅限内部参照 / 禁止分发”提示。它对旧 1108 项安全，
   但对混合目录过于宽泛;后续应改成“混合授权，以单项许可证为准”，同时不能
   弱化旧条目的受限提示。当前收藏、最近使用和拖拽限制也仍按
   `source === "sound-effects-lab"` 统一处理，所以 314 个 CC0 条目虽然许可证
   显示正确，交互能力仍按受限条目保守关闭;后续应改为按解析后的逐项许可证
   决定能力。
4. PR #424 尚未合并，QCut 客户端授权显示和 Batch-08 解析逻辑尚未进入正式
   release。Worker 和 Supabase 已在线，但这不等于桌面客户端已发布。

#### P1:发布前验证

1. 在正式签名/打包的 `app://.` 安装包执行一次空缓存冷下载、退出重开、断网
   试听和删除离线包。目前证据来自源码目录的 production build Electron。
2. 把本轮真实生产 E2E 整理为显式 opt-in 脚本并提交;当前临时 CDP 脚本位于
   gitignored 的 `output/playwright/`，CI 不应默认下载 266.9 MiB。
3. 对 314 个 CC0 条目执行主观分类抽检，尤其是本轮新增的 150 次分类归属调整。
   数量和 schema 已验证，不代表每个条目的语义归类都已人工确认。
4. 执行全库音频 QA:响度、true peak、静音头尾、截断、损坏帧、声道异常、
   重复听感和过长尾音。当前已验证可解码、大小、哈希和抽样播放，不等于完成
   1422 项听感 QA。
5. 专门验证 CC0 条目从离线目录加入时间线、保存项目、重启恢复和最终导出。
   本轮最终 E2E 覆盖目录、搜索、许可证和试听，没有重新跑完整导出链路。

#### P2:产品完善

1. 增加离线包差量说明，例如新增、删除、许可证变化和预计下载字节数。
2. 增加取消/暂停/恢复、磁盘空间不足、配额被回收和单文件损坏后的用户级恢复
   流程 E2E。
3. 改善 Freesound 英文标题、本地化关键词和作者为 `deleted_user_*` 时的显示。
4. 定期重新验证来源 URL 和许可证快照，保留不可变 provenance 报告;来源页面
   下线时仍需能解释已发布条目的采集依据。
5. 用第二个白名单账号做一次真实设备共享 Blob、删除最后引用账号后清理缓存的
   生产 smoke test;当前这一行为只有自动化测试覆盖。

#### 本轮观察到但未纳入修复

1. Electron 日志报告一个旧测试项目的本地 JSON 尾部存在多余内容。Batch-08
   目标项目仍能载入和完成 E2E，但后续应清理该损坏 fixture，并给存储恢复路径
   增加独立测试。
2. 传统声音搜索 handler 在源码目录 production build 中找不到
   `dist/electron/config/default-keys`，因此日志显示没有 Freesound API key。
   音效实验室使用已发布私有 manifest 和本地离线包，不依赖这条实时搜索路径，
   所以本轮 E2E 不受影响;默认 key 的打包/路径问题仍需单独修复。
3. Vite build 仍输出仓库已有的 route test 文件命名、dynamic/static import 和大
   chunk 警告。构建退出码为 0，本批没有为这些全局构建问题扩展范围。

## English

### Result

Batch-08 expands the private QCut catalog from 1,108 to 1,422 unique sounds in
20 categories. The 314 additions are Freesound CC0 replacements, not copied
Jianying payloads. The final manifest contains 1,108 restricted internal
references and 314 redistributable CC0 items, totaling 279,900,295 bytes
(266.9 MiB).

There are two distinct gap counts. The category-capacity gap is now zero because
the 314 CC0 items fill the numeric category deficit. Exact Jianying payload
parity is still short by 314 current resource IDs. The live Jianying snapshot
contained 1,411 unique IDs; 1,097 overlap the old QCut catalog and 11 old QCut
references are historical. QCut intentionally did not copy those 314 restricted
payloads.

Collection downloaded and transcoded 492 candidates, accepted 314 unique CC0
files, created 330 category assignments, and added 24,154,061 bytes with zero
download failures or final hash duplicates. Every new item retains source ID,
source URL, creator, license ID, and license URL.

### Production and verification

All 314 objects were uploaded to the private `sound-effects-lab` bucket and read
back with exact byte-size and SHA-256 matches. Production serves immutable
`qcut/2026-08-22/manifest.batch-08.json` through Worker version
`598b7351-dfe1-400a-80c3-19cc530c683e`. Unauthenticated access returned 401;
the allowlisted account received catalog `qcut-sfx-library-2026-08-22` with 20
categories and 1,422 items.

The Electron offline E2E found all 1,422 expected Blobs, zero missing resources,
zero size or hash mismatches, and 279,900,295 cached bytes. After a fully offline
reload, QCut restored the catalog and played a CC0 `Crowd laugh` item without an
asset network request. The card showed the creator and `CC0-1.0`, confirming the
mixed-license override bug is fixed. The focused run passed 50 Web/publisher
tests, 11 license-server route tests, both TypeScript checks, and the enabled
production build.

### Remaining work

The 2026-08-26 follow-up completed the mixed-license UI, per-item reuse actions,
committed opt-in production E2E, automated full-catalog audio QA, CC0 timeline/
restart/export flow, and enriched VIP/author manifest rollout. PR #424 is merged.
P0 then remained replacing all 1,108 restricted references before public release.
P1 is manual review of 199 QA-warning items, metadata recovery for 11 historical
IDs, and a signed packaged `app://.` cold-install/offline/delete test. P2 remains
delta and recovery UX, title localization, provenance rechecks, and a real
two-account cache-sharing smoke test. See
[`FINALIZATION-2026-08-26.md`](./FINALIZATION-2026-08-26.md) for that evidence.

Batch-09 (2026-08-27) then added 314 restricted Jianying originals, so the
current replacement scope is 1,422 restricted references. The
[`BATCH-09-RECORD.md`](./BATCH-09-RECORD.md) record is the authoritative
current checklist; the 2026-08-26 finalization report and the older Batch-08
list above remain as historical context.
