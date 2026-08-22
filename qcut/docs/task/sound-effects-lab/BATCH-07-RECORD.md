# Sound Effects Lab Batch-07 / 音效实验室 Batch-07

Date / 日期: 2026-08-22

Branch / 分支: `codex/sound-effects-offline-pack`

PR: [#424](https://github.com/Quriosity-agent/qcut/pull/424)

## 中文

### 本批结果

本批以 Batch-06 的 1038 项目录为基线，目标是从剪映当前可见目录为每个仍有
候选的分类再采集 10 项真实音效:

- 枚举到 384 个签名有效且尚未收录的分类候选;
- 尝试 74 个唯一 resource ID，保留 70 个唯一 MP3;
- 4 个内容重复项按音频哈希跳过，下载、解码和校验失败为 0;
- 9 个仍有足够候选的分类各增加 10 项;
- 合并目录从 1038 增加到 1108;
- 1108 个 resource ID、对象键、MD5 和 SHA-256 均唯一;
- 1108 个文件全部通过存在性、大小、MD5、SHA-256 和 FFprobe MP3 校验;
- 全库总字节数为 255,746,234 bytes（约 243.9 MiB）。

分类会重叠，因此 9 个分类各增加 10 项不等于 90 个文件。例如新增的“鬼畜
加速笑声”同时属于热门、网感口播和笑声，但只存储一个经过校验的 MP3。

### 分类采集结果

| 分类 | 可选候选 | 目标 | 尝试 | 新增 | 来源耗尽 |
|---|---:|---:|---:|---:|---|
| 热门 | 22 | 10 | 11 | 10 | 否 |
| 最新 | 78 | 10 | 10 | 10 | 否 |
| 转场 | 0 | 0 | 0 | 0 | 是 |
| 网感口播🔥 | 31 | 10 | 10 | 10 | 否 |
| 热梗语录 | 0 | 0 | 0 | 0 | 是 |
| 笑声 | 71 | 10 | 10 | 10 | 否 |
| 尴尬 | 0 | 0 | 0 | 0 | 是 |
| 震惊 | 0 | 0 | 0 | 0 | 是 |
| 提示音 | 0 | 0 | 0 | 0 | 是 |
| 抽象 | 25 | 10 | 10 | 10 | 否 |
| 综艺感 | 126 | 10 | 10 | 10 | 否 |
| 知识科普 | 0 | 0 | 0 | 0 | 是 |
| 机械 | 3 | 3 | 3 | 0 | 是，3 项均重复 |
| BGM | 0 | 0 | 0 | 0 | 是 |
| 魔法 | 24 | 10 | 10 | 10 | 否 |
| 打斗 | 0 | 0 | 0 | 0 | 是 |
| 美食 | 0 | 0 | 0 | 0 | 是 |
| 动物 | 0 | 0 | 0 | 0 | 是 |
| 环境音 | 29 | 10 | 11 | 10 | 否 |
| 悬疑 | 11 | 10 | 10 | 10 | 否 |

`转场`、`热梗语录`、`尴尬`、`震惊`、`提示音`、`知识科普`、`BGM`、
`打斗`、`美食` 和 `动物` 没有新的签名候选。`机械` 只有 3 个候选，全部与
已有音频内容重复。本批没有复制旧文件、改分类或混入其他来源凑满 10 项。

当前 20 个分类计数如下。计数允许跨分类重叠:

| 分类 | 当前项数 | 分类 | 当前项数 |
|---|---:|---|---:|
| 热门 | 146 | 网感口播🔥 | 82 |
| 综艺感 | 94 | 魔法 | 69 |
| 知识科普 | 31 | 转场 | 78 |
| 笑声 | 78 | 打斗 | 46 |
| 尴尬 | 16 | 最新 | 121 |
| 热梗语录 | 59 | 震惊 | 29 |
| 抽象 | 62 | 提示音 | 50 |
| 机械 | 49 | 悬疑 | 70 |
| BGM | 36 | 美食 | 53 |
| 动物 | 59 | 环境音 | 71 |

### Supabase 发布

- 私有 bucket: `sound-effects-lab`;
- 上传 70 个新增对象，共 16,238,069 bytes;
- 70 个对象全部从私有 bucket 回读，大小和 SHA-256 全部匹配;
- bucket 当前为 1108 个唯一 MP3 / 255,746,234 bytes;
- 不可变生产 manifest:
  `jianying/2026-08-22/manifest.batch-07.json`;
- manifest SHA-256:
  `d8f47e5c4dfa3b24b1e8b7b345231a6f367aed34f9fe5356c8df47f5558dad43`;
- 切换前的 1038 项 manifest 已备份为
  `jianying/2026-08-22/manifest.1038.bak.json`;
- Worker version: `35d42262-0dee-47d8-86ec-e04d9d431622`;
- 白名单 API 返回 20 分类 / 1108 项，未认证请求返回 401;
- 新增“鬼畜加速笑声”经签名接口下载 96,813 bytes，SHA-256 与 manifest 匹配。

兼容用 staging、legacy、canonical 和 pinned manifest 均已更新。License server
固定读取 Batch-07 的不可变对象键，避免覆盖同名对象时遇到 CDN 旧缓存。

### QCut 本地备份

独立于剪映缓存的 QCut 文件备份位于:

- `/Users/peter/Documents/QCut/Exports/jianying-sfx-batch-07-2026-08-22`:
  70 个新增 MP3、增量映射、完整 1108 项映射和采集校验报告;
- `/Users/peter/Documents/QCut/Exports/jianying-sfx-lab-batch-07-2026-08-22`:
  完整本地/私有 manifest，以及切换前的 1038 项 manifest 备份。

QCut 应用自己的完整离线包也已更新，不依赖
`~/Movies/JianyingPro/User Data/Cache/music`:

- `qcut-sound-effects-lab-offline/packs`:1108 项账号绑定完成记录;
- `qcut-asset-resources/files`:当前 manifest 对应 1108 个 Blob;
- 1108 个 Blob 总计 255,746,234 bytes，1108 个唯一 SHA-256;
- 缺失 0、大小错误 0、哈希错误 0，本批 70/70 全部命中;
- `persistentStorage: true`;
- 整页断网重载后仍显示 1108 项、“离线目录”和 `已离线 · 243.9 MB`;
- 断网搜索并试听本批新增“鬼畜加速笑声”，播放器到 `0:02 / 0:03`，
  远端音效资源请求为 0。

### 验证

- Web 离线链路:6 个测试文件，36 个测试通过;
- license server 音效实验室路由:10 个测试通过;
- license server TypeScript `tsc --noEmit` 通过;
- 启用音效实验室的 Electron production build 通过;
- 生产 Worker、白名单 manifest、签名下载和完整 bucket 对象清单均回查通过;
- 真实 Electron 和浏览器断网 E2E 均通过。

截图证据:

- [1108 项线上目录与更新入口](./evidence/14-batch-07-update-available.png)
- [1108 项 QCut 完整离线包](./evidence/15-batch-07-local-pack-1108-installed.png)
- [断网重载后的 1108 项离线目录](./evidence/16-batch-07-offline-1108-catalog.png)
- [断网播放 Batch-07 新音效](./evidence/17-batch-07-offline-new-sound-playing.png)

### 下一子任务

1. 对 1108 项运行响度、峰值、静音头尾、损坏帧和主观重复 QA。
2. 把真实账号生产 smoke test 做成显式 opt-in E2E，默认 CI 不下载 243.9 MiB。
3. 在正式打包安装版再跑一次冷下载、退出重开和断网试听。
4. 为来源耗尽的分类另建明确标注来源的 QCut 自有、CC0、AI 或另行授权层。
5. 公开发行前替换所有受限的剪映内部参照音频。

## English

Batch-07 started from the 1,038-item Batch-06 catalog and attempted to collect
10 real Jianying reference sounds for every category that still exposed new
signed candidates. It enumerated 384 candidates, attempted 74 unique resource
IDs, retained 70 unique MP3 files, skipped four content duplicates, and had
zero download, decode, or validation failures.

Nine categories gained 10 items each. The result is 70 files rather than 90
because one resource can belong to several categories. Ten categories exposed
no new candidate. Mechanical exposed three candidates, but all three duplicated
audio already in the catalog. Existing files were not copied, relabelled, or
mixed with another source to pad the target.

The complete catalog now contains 1,108 unique MP3 files totaling 255,746,234
bytes (243.9 MiB). Only the 70 new objects were uploaded to the private
`sound-effects-lab` bucket, and every object passed remote byte-size and
SHA-256 readback. The production Worker reads immutable
`jianying/2026-08-22/manifest.batch-07.json`; its allowlisted API returns 20
categories / 1,108 items, unauthenticated access returns 401, and a signed
download of the new `鬼畜加速笑声` item matched the manifest exactly.

QCut also owns two independent local copies. The export directories retain the
70-file source delta, complete 1,108-item mappings and manifests, validation
reports, and the previous 1,038-item manifest. The application offline pack
contains exactly 1,108 account-bound Blobs, 1,108 unique SHA-256 values, zero
missing or mismatched resources, and the same 255,746,234-byte total. After a
full offline reload, QCut restored all 1,108 items and played the new sound with
zero remote asset requests.

The focused Web run passed 36 tests across six files, the license-server route
passed 10 tests, TypeScript passed, and the enabled Electron production build
passed. Production API, bucket, signed-download, Electron, cache-integrity, and
offline-playback checks all passed.

These files remain restricted third-party references for private parity work.
The private bucket and offline pack are not approved public distribution
content.
