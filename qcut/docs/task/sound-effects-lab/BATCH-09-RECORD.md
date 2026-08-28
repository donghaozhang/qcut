# Batch-09: Original Gap Integration / 原始缺口接入

Date / 日期: 2026-08-27 (Australia/Melbourne)
Branch / 分支: `codex/sound-effects-lab-finalize`

## 中文

### 范围与结果

本批按用户“接入 QCut、上传 Supabase”的要求，将已核验的 314 个剪映原始资源
ID 加入现有私有音效实验室。保留 Batch-01 至 Batch-08 的全部条目，不用原音
替换 CC0，不开放 bucket，不把原音加入 Git 或安装包。

| 指标 | 结果 |
|---|---:|
| 完整目录条目 / 唯一资源 ID | 1736 / 1736 |
| 唯一音频 / object key / SHA-256 | 1731 / 1731 / 1731 |
| 分类 | 20 |
| 剪映受限参照 / Freesound CC0 | 1422 / 314 |
| VIP 标记 | 773 |
| 新增原始资源 ID | 314 |
| 新增上传音频 / 复用已有音频 | 309 / 5 |
| 新增上传大小 | 36,160,352 bytes |
| 全量 QCut 本地备份 | 316,060,647 bytes (301.4 MiB) |
| 本机当前剪映 ID 覆盖 | 1411 / 1411 |
| 保留的历史剪映 ID | 11 |

“1411/1411”只针对当前两份本机资源数据库，不代表剪映在线音效库全量。

### 五个同音频别名

以前按哈希去重会丢掉以下真实资源 ID。现在保留独立卡片，缓存和上传按音频
object key 去重，不伪造新音频、不重复占用离线包容量。

| 新资源 ID | 新卡片 | 已有资源 ID |
|---|---|---|
| `6896679424402394376` | 键盘打字长音效2 | `6896679376260205837` |
| `6896679424402410760` | 打字 | `6896679424402427144` |
| `6896679477816937736` | 咔嚓，拍照声8 | `6896679477816970504` |
| `6896681823808670989` | Earthquake fissure | `6896681876925205768` |
| `7065209898841214245` | 可爱bibibi | `6978401360236612877` |

资源 ID、numeric ID 仍必须唯一。共享音频必须有一致的 MD5、SHA-256、大小、
MIME 和授权边界，否则客户端拒绝整个清单。所有旧 numeric ID 和不可变音频
object key 都保持不变。

### 私有发布与兼容

Bucket: `sound-effects-lab`，`public=false`，原有两个测试账号白名单不变。
Worker: `b0c53757-fa28-412a-8894-43e04456c2f7`。

| API | Supabase object key | 条目数 |
|---|---|---:|
| `/api/sound-effects-lab/private-manifest` | `qcut/2026-08-27/manifest.batch-09.legacy.json` | 1731 |
| `/api/sound-effects-lab/private-manifest/enriched` | `qcut/2026-08-27/manifest.batch-09.enriched.json` | 1731 |
| `/api/sound-effects-lab/private-manifest/enriched?includeAliases=1` | `qcut/2026-08-27/manifest.batch-09.json` | 1736 |

旧客户端拒绝重复哈希，因此未显式请求别名的客户端拿到去重兼容目录。旧版
`/private-manifest` 还省略新版剪映元数据字段，避免 strict schema 拒绝。
新客户端保留 314 个新增卡片。三份目录均为无本机路径的 schema v2。

上传使用不可变新键，先验证并备份旧线上清单，然后上传 309 个新对象并逐个
回读，复核 5 个已有对象，最后发布三份清单。没有覆盖旧音频或旧不可变清单。
本次上传和回读耗时 39.489 秒，仅为本机本次网络实测，不是 SLA。

真实生产验证:

- 三种目录: 授权请求 200，内容 SHA-256 与本地构建完全一致;匿名请求 401。
- 新 VIP 原音“俏皮明亮配乐2”和共享别名“键盘打字长音效2”: 签名接口 302，
  下载 200，大小及 SHA-256 匹配，签名有效期 600 秒。
- 匿名音频 API 返回 401，公开 Supabase URL 无法下载，非法 object key 返回 400。
- 非白名单拒绝覆盖路由单测;本批没有使用其他账号的 token 做真实 403 测试。

### QCut 本地备份

独立于剪映缓存的完整备份:

```text
/Users/peter/Documents/QCut/Exports/qcut-sfx-lab-batch-09-2026-08-27/
  payloads/                                  1731 original MP3 files
  combined-title-file-map.enriched.json       1736 source records
  sound-effects-lab.local.json                local schema v1
  sound-effects-lab.private.json              full schema v2
  sound-effects-lab.private.enriched-unique.json
  sound-effects-lab.private.legacy.json
  build-report.json
  audio-qa-report.json
  asset-upload-report.json
  publish-report.json
  production-verification.json
  pre-publish-backup/
```

复制前后重新计算 MD5/SHA-256。全部载荷在 QCut 自己的 `payloads/` 中，删除
剪映缓存不会删除这份备份。日常“离线下载”另外写入 QCut 的 IndexedDB，不依赖
这个采集目录。备份和远程清单只供现有私有工作流，未改成可公开再分发资源。

### 验证与警告

- 本地 1736/1736 条目通过文件存在、字节数、MD5/SHA-256、FFprobe 时长及
  FFmpeg 全解码检查，失败 0。共有 1731 份唯一载荷、5 个明确的共享别名。
- 222 条有音频质量提示: 220 条 near-clipping，3 条低采样率，其中 1 条重叠。
  保留原音频，不自动归一化或重采样。
- 新增 314 条中有 15 条“目录 metadata MD5 与当前 URL 音频不一致”的既有提示。
  实际下载文件、缓存文件名 MD5、SHA-256 已验证;这些条目没有被冒充为
  `metadata-md5` 匹配，保留资源映射及提示。
- 11 个历史资源 ID 在当前剪映数据库中找不到元数据，原有文件和 ID 保留。
- Web/脚本 12 个文件、73 个测试通过;license server 音效路由 20 个测试通过。
  覆盖新旧清单解析、同音频别名、冲突哈希/授权拒绝、缓存容量/删除及上传去重。
- Web TypeScript + production build、license server TypeScript、16 个相关文件
  Biome 检查和 `git diff --check` 通过。构建仅有现有路由/chunk/dynamic import 警告。
- 第一轮真实 Electron E2E 通过，用时约 4 分 48 秒。随后修复窄面板中标题被
  统计信息挤掉的问题。最终重启/导出专项通过，用时 19.4 秒，业务步骤
  18.311 秒;最终整包离线专项通过，用时约 4.5 分钟，业务步骤 266.677 秒。
  两个场景分别从新的隔离 user-data 启动，未预填缓存。

### Electron 证据

测试直接运行本分支 Electron production build (`app://.`)，使用真实生产白名单
账号和 Supabase 音频，不使用伪造 manifest、音频响应或预填离线缓存。

1. 页面显示 1736 条目、20 类、314 可复用、1422 受限、773 VIP。
2. 搜索新增 VIP 原音“俏皮明亮配乐2”，最终原生 HTMLAudio 播放到 0.843 秒，
   `duration=8.808`、`readyState=4`、无错误、来源为校验后的本地 Blob。
3. 从空缓存点击“离线下载”，确认 1731 个唯一 Blob，完成记录保留 1736 个条目，
   总大小 316,060,647 bytes，最终本次冷下载用时 253.012 秒。
4. Playwright `setOffline(true)` 后整页重载，恢复“离线目录”;同一原音播放到
   0.840 秒，共享别名“键盘打字长音效2”也能播放，远端音效请求为 0。
5. 独立重启/导出测试验证 CC0 收藏、收藏夹、加入时间线、结束 Electron 进程后
   重开的恢复和最终导出。最终生成 5 秒 H.264 + AAC 48 kHz MP4，126,354
   bytes。FFprobe 复核音视频轨道，FFmpeg 全解码无错误，音频 mean/max volume
   为 -25.3/-5.9 dB，非静音。
6. 截图发现标题挤压，已将标题和授权统计分行。排版复测有一次在 Vite 构建
   结束前启动而超时;已调整启动顺序，并把启动失败后的进程清理纳入 `finally`。
7. 后续复测先在重启、后在冷启动阶段遇到 `firstWindow` 超时。诊断实例持有
   正确的隔离 user-data 和实例锁，但主进程卡在启动 `ffprobe-static -version`
   的过程中，子进程处于 `U` 状态。这个工作树缺少标准 staged binaries。
   执行仓库 `stage-ffmpeg-binaries`，校验并准备 Darwin ARM64 FFmpeg/FFprobe
   8.1.2 后，重启/导出专项恢复通过。未删除隔离属性、修改系统安全设置或停止
   用户已有 QCut 进程。
8. 测试分成独立“整包离线”和“重启导出”场景，最终两项分别复跑通过，后者
   失败不再删除前者报告。退出优先调用 Electron 正常关闭并等待进程退出，
   10 秒后才强制清理测试进程。

复跑时先完成构建和标准运行时准备，再启动 Electron，不同时改写 `dist/`:

```sh
FFMPEG_STAGE_TARGETS=darwin-arm64 bun run stage-ffmpeg-binaries
# In apps/web/: bun run build; wait for successful completion.
QCUT_RUN_PRIVATE_SFX_E2E=1 bunx --no-install playwright test \
  apps/web/src/test/e2e/sound-effects-lab-private.e2e.ts \
  --project=electron --reporter=line
```

截图目录: [`evidence/batch-09/`](./evidence/batch-09/)。

- [完整目录](./evidence/batch-09/01-live-catalog-1736.png)
- [新增原音播放中](./evidence/batch-09/02-new-original-playing.png)
- [离线下载进度](./evidence/batch-09/03-offline-download-progress.png)
- [完整离线包](./evidence/batch-09/04-offline-pack-complete.png)
- [断网重载后播放原音](./evidence/batch-09/05-original-playing-offline.png)
- [断网播放共享别名](./evidence/batch-09/06-alias-playing-offline.png)
- [重启后的收藏恢复](./evidence/batch-09/25-restart-persistence.png)
- [导出完成](./evidence/batch-09/26-export-complete.png)

完整机器报告在备份根目录 `sound-effects-lab-offline-e2e-report.json` (离线)、
`sound-effects-lab-e2e-report.json` (重启/导出)、`web-tests.json`、`server-tests.json`。
第一轮报告另存为 `e2e-first-pass-report.json`。测试使用隔离 user-data 并在结束
时清理;长期原始备份保留在 `payloads/`，不随测试删除。

### 后续边界

1. 本批线上 Worker 和私有资源已更新，客户端改动尚未提交、合并或发布正式
   签名安装包。正式安装包的冷下载与断网重启仍需单独验收。
2. 正式公开音效库仍需使用自有、CC0、AI 生成或另行获得再分发授权的音频。
   剪映 VIP 标记不等于 QCut 再分发授权。
3. 15 条目录哈希差异、11 个历史元数据缺口和 222 条质量提示保留待人工复核。
4. 取消下载、磁盘配额不足、缓存被回收和损坏资源恢复仍需专项 E2E。

## English

Batch-09 integrates the 314 verified original Jianying gap IDs into the existing
private Sound Effects Lab. It preserves all previous 1,422 entries, including
314 CC0 sounds. The new catalog contains 1,736 cards, 1,731 unique audio
payloads, 20 categories, 1,422 restricted references, and 773 VIP markers.

Five new card IDs share exact bytes with existing references. QCut keeps their
identities but deduplicates uploads and offline storage by immutable object key.
The remaining 309 audio objects were uploaded and read back with matching byte
sizes and SHA-256. The private bucket and two-account allowlist are unchanged.
No original audio is committed, packaged, or exposed through a public URL.

The new client explicitly requests `enriched?includeAliases=1` and receives all
1,736 cards. Both existing client routes receive a 1,731-item unique-content
view; the legacy route also strips optional enriched source fields. Existing
numeric IDs and audio object keys remain stable.

The full QCut-owned backup is at
`/Users/peter/Documents/QCut/Exports/qcut-sfx-lab-batch-09-2026-08-27/payloads/`.
It contains 1,731 files totaling 316,060,647 bytes and no longer depends on
Jianying's cache. All 1,736 references passed file integrity, duration and full
decode checks. There are 222 quality warnings, 15 retained catalog-MD5 warnings,
and 11 historical metadata gaps; originals were not normalized or resampled.

Production manifests return 200 for the test account and 401 anonymously.
The new VIP sample and a shared alias both follow the real 302-to-200 signed
download path, use a 600-second TTL and match local hashes. Worker version:
`b0c53757-fa28-412a-8894-43e04456c2f7`.

The first real Electron E2E passed in about 4m48s: a cold offline download stored
all 1,731 unique Blobs and the 1,736-entry completion record. After an offline
page reload, both a new VIP original and a shared alias played with zero remote
audio requests. CC0 favorite/folder actions, timeline insertion, process restart
and a five-second H.264/AAC export also passed. Screenshots exposed a narrow
header layout issue, now fixed by separating the title and rights summary.
A follow-up launch overlapped with the build and timed out. Later restart and
cold-start attempts also timed out: the diagnostic instance had the correct
isolated profile and single-instance lock, but startup stalled while launching
the fallback `ffprobe-static -version` child. The worktree lacked staged native
binaries. Running the repository's standard staging script verified and
installed FFmpeg/FFprobe 8.1.2 without changing OS security settings or stopping
the user's QCut instance. The final restart/export scenario then passed in
19.4 seconds (18.311 seconds of recorded workflow), producing a 126,354-byte,
five-second H.264/AAC file. Full decode succeeded, and mean/max audio volume was
-25.3/-5.9 dB. The tests now separate offline and restart/export reports and
wait for process exit before relaunching. The final independent offline test
also passed in about 4.5 minutes (266.677 seconds of recorded workflow). Its
cold download took 253.012 seconds; after offline reload, the new original
advanced to 0.840 seconds with no playback error, and the shared alias also
played with zero remote audio requests. Both scenarios used fresh isolated
profiles. Web/script tests pass 73/73 and route tests pass 20/20, with TypeScript
and production builds passing.

Coverage is 1,411/1,411 currently observed Jianying IDs, not the complete online
Jianying catalog. This is a private integration, not a public redistribution
license or a new signed desktop release.
