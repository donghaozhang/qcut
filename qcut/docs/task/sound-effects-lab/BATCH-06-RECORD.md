# Sound Effects Lab Batch-06 / 音效实验室 Batch-06

Date / 日期: 2026-08-22

Branch / 分支: `codex/sound-effects-offline-pack`

PR: [#424](https://github.com/Quriosity-agent/qcut/pull/424)

## 中文

### 本批结果

本批以 Batch-05 的 995 项目录为基线，再次枚举剪映音效目录的 20 个分类:

- 找到 427 个签名有效且尚未收录的分类候选;
- 尝试 47 个唯一 resource ID，保留 43 个唯一 MP3;
- 4 个内容重复项按音频哈希跳过，下载、解码和校验失败为 0;
- 合并目录从 995 增加到 1038;
- 1038 个 resource ID、对象键、MD5 和 SHA-256 均唯一;
- 1038 个文件全部通过存在性、大小、MD5、SHA-256 和 FFprobe MP3 校验;
- 全库总字节数为 239,508,165 bytes（约 228.4 MiB）。

### 分类增量

分类计数会重叠，因为一个真实音效可以同时属于多个分类，但文件只保存一份。

| 分类 | 可选候选 | 新增 | 来源耗尽 |
|---|---:|---:|---|
| 热门 | 33 | 11 | 否 |
| 最新 | 83 | 5 | 否 |
| 转场 | 0 | 0 | 是 |
| 网感口播🔥 | 36 | 5 | 否 |
| 热梗语录 | 4 | 4 | 是 |
| 笑声 | 76 | 5 | 否 |
| 尴尬 | 0 | 0 | 是 |
| 震惊 | 0 | 0 | 是 |
| 提示音 | 4 | 4 | 是 |
| 抽象 | 30 | 5 | 否 |
| 综艺感 | 131 | 5 | 否 |
| 知识科普 | 0 | 0 | 是 |
| 机械 | 3 | 0 | 是，3 项均与已有音频重复 |
| BGM | 0 | 0 | 是 |
| 魔法 | 29 | 5 | 否 |
| 打斗 | 0 | 0 | 是 |
| 美食 | 0 | 0 | 是 |
| 动物 | 0 | 0 | 是 |
| 环境音 | 34 | 5 | 否 |
| 悬疑 | 16 | 5 | 否 |

11 个分类取得 4–11 个真实新增项。`转场`、`尴尬`、`震惊`、`知识科普`、
`机械`、`BGM`、`打斗`、`美食` 和 `动物` 没有可保留的唯一新音频，因此
保持真实的 0，没有复制旧文件、改分类或混入其他来源凑数。

### Supabase 发布

- 私有 bucket: `sound-effects-lab`;
- 仅上传 43 个新增对象，共 18,980,717 bytes;
- 43 个对象全部从私有 bucket 回读，大小和 SHA-256 全部匹配;
- bucket 当前为 1038 个 MP3 / 239,508,165 bytes;
- 不可变生产 manifest:
  `jianying/2026-08-22/manifest.batch-06.json`;
- manifest SHA-256:
  `57a46c0065f047574af86b83c1b5be9bbdf7673ca7077ded97f92266606e8a37`;
- 切换前的 995 项 manifest 已备份为
  `jianying/2026-08-22/manifest.995.bak.json`;
- Worker version: `970b2941-ac80-43d9-a151-d686d220245f`;
- 白名单 API 返回 20 分类 / 1038 项，未认证请求返回 401;
- 新增“笑出眼泪‘哎呀妈呀’”经签名接口下载 96,813 bytes，SHA-256
  与 manifest 匹配。

覆盖旧 `manifest.json` 后，Supabase CDN 的无查询参数读取曾短暂返回旧的 995
项内容。发布器现在用 cache-busting 回读验证，license server 改为固定读取
Batch-06 的不可变对象键，避免生产目录受覆盖缓存影响。兼容用 legacy、canonical
和 pinned manifest 也已更新。

### QCut 本地备份

独立本地采集备份位于:

- `/Users/peter/Documents/QCut/Exports/jianying-sfx-batch-06-2026-08-22`;
- `/Users/peter/Documents/QCut/Exports/jianying-sfx-lab-batch-06-2026-08-22`;
- 切换生产前的 995 项 manifest:
  `production-manifest-before-995.json`。

QCut 自己的离线包也已从 995 项更新到 1038 项，不依赖剪映缓存:

- `qcut-sound-effects-lab-offline/packs`:1038 项账号绑定完成记录;
- `qcut-asset-resources/files`:当前 manifest 对应 1038 个 Blob;
- 1038 个 Blob 总计 239,508,165 bytes，1038 个唯一 SHA-256;
- 缺失 0、大小错误 0、哈希错误 0，本批 43/43 全部命中;
- `persistentStorage: true`;
- 整页断网重载后仍显示 1038 项、“离线目录”和 `已离线 · 228.4 MB`;
- 断网搜索并试听本批新增“笑出眼泪‘哎呀妈呀’”，播放器到
  `0:02 / 0:03`，远端音效资源请求为 0。

### 验证

- Web 离线链路:6 个测试文件，36 个测试通过;
- license server 音效实验室路由:10 个测试通过;
- license server TypeScript `tsc --noEmit` 通过;
- 启用音效实验室的 Electron production build 通过;
- 生产 Worker、白名单 manifest、签名下载和 bucket 对象清单均真实回查通过。

截图证据:

- [1038 项线上目录与更新入口](./evidence/10-batch-06-update-available.png)
- [1038 项 QCut 完整离线包](./evidence/11-batch-06-local-pack-1038-installed.png)
- [断网重载后的 1038 项离线目录](./evidence/12-batch-06-offline-1038-catalog.png)
- [断网播放 Batch-06 新音效](./evidence/13-batch-06-offline-new-sound-playing.png)

### 下一子任务

1. 对 1038 项运行响度、峰值、静音头尾、损坏帧和主观重复 QA。
2. 把真实账号生产 smoke test 做成显式 opt-in E2E，默认 CI 不下载 228.4 MiB。
3. 在正式打包安装版再跑一次冷下载、退出重开和断网试听。
4. 为 9 个已耗尽分类另建明确标注来源的 QCut 自有、CC0、AI 或另行授权层;
   不能把其他来源伪装成剪映参照。
5. 公开发行前替换所有受限的剪映内部参照音频。

## English

Batch-06 re-enumerated all 20 Jianying sound-effect categories from the
995-item baseline. It attempted 47 unique resource IDs, retained 43 unique MP3
files, skipped four content duplicates, and had zero download, decode, or
validation failures. The catalog now contains 1,038 unique sounds totaling
239,508,165 bytes (228.4 MiB).

Eleven categories gained 4–11 real items. Nine categories had no retainable
unique candidate; Mechanical exposed three cards, but all three duplicated
audio already in the catalog. No existing file was copied, relabelled, or
mixed with another source to pad a category.

Only the 43 new objects were uploaded to the private `sound-effects-lab`
bucket. Every object passed remote size and SHA-256 readback. The production
Worker now reads the immutable
`jianying/2026-08-22/manifest.batch-06.json` object, which avoids stale CDN
responses observed when overwriting the legacy manifest key. The allowlisted
API returns 20 categories / 1,038 items, unauthenticated access returns 401,
and a signed download of a new Batch-06 item matched its manifest hash.

QCut owns a complete local copy independent of the Jianying cache. The current
account record contains 1,038 items and maps exactly to 1,038 local Blobs,
1,038 unique SHA-256 values, zero missing resources, and the same
239,508,165-byte total. After an offline page reload, QCut restored the full
catalog and played the new three-second `笑出眼泪“哎呀妈呀”` item without an
asset request.

These files remain restricted third-party references for private parity work.
The private bucket and offline pack are not approved public distribution
content.
