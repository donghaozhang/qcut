# 音效实验室 Batch-04 执行记录

日期: 2026-08-17
结果: **914 → 938**（+24），20 分类，catalog `jianying-sfx-reference-2026-08-15`
桶增量: **+1.9 MiB**（资产总计 281.2 MiB）

## 这一批做了什么

没有做 Phase A（浏览刷签名）。只采了**缓存里签名尚未过期**的那一部分：

- 本机缓存有 114 条未收录卡片，其中 **28 条签名仍然有效**
- 有效的几乎全在 `lf26-faceu-file-sign.bytecdn.com`（**1 年** TTL），
  而绝大多数卡片在 `v*-artist.vlabvod.com`（**7 天** TTL）——这是本轮实测
  出来的新事实，此前只知道"签名会过期"
- 28 条下载后有 4 条内容 md5 撞上已有条目（资源被换 resourceId 重新发布），
  实际新增 **24**

剩余 86 条签名已死，必须等一次真正的 Phase A。

## 三个卡点（下次直接照抄解法）

### 1. 客户端比 license server 严：objectKey 的日期必须等于 catalogId 的日期

license server 的校验是日期无关的：

```
/^jianying\/\d{4}-\d{2}-\d{2}\/assets\/[a-f0-9]{32}\.mp3$/
```

但客户端 `local-sound-effects-manifest.ts` 额外要求
`objectKey` 的日期段 == `catalogId` 末尾的日期，否则整份 manifest 被拒
（错误信息：`Object key must belong to catalog ...`）。

**所以"manifest 混引多个日期前缀"这条路走不通。** 想只传增量，正确做法是
**复用既有 catalog date**：

```bash
bun run build:sound-effects-lab-manifest -- \
  --input  ".../combined-title-file-map.json" \
  --output ".../sound-effects-lab.local.json" \
  --remote-output ".../sound-effects-lab.private.json" \
  --catalog-date 2026-08-15          # ← 沿用旧日期，不要用今天
```

新资产直接追加进 `jianying/2026-08-15/assets/`，914 个既有对象原地复用。
`catalogId` 只参与上面那条一致性校验，不参与任何缓存，复用是安全的。

代价：catalog 日期不再等于采集日期（batch 字段仍然记录真实批次）。
好处：**省掉整库重传**。batch-03 走的是"新日期前缀 + 全量重传"，代价是
`jianying/2026-08-01/assets/` 那 382 个对象至今仍是孤儿（80.7 MiB）。

### 2. 切换钉死 key 不需要 404 窗口

BATCH-03 计划里写的是"先 `rm` 再 `cp`"，中间实验室会短暂消失。
其实 Storage API 的 `x-upsert: true` 就地覆盖，**根本不用先删**：

```
POST /storage/v1/object/sound-effects-lab/jianying/2026-08-01/manifest.json
     x-upsert: true
```

本轮全程钉死 key 一秒都没空过。

### 3. 写完立刻回读会读到缓存

覆盖后马上 GET 同一个 key，返回的是**旧内容**（本轮读到 914 条，
以为切换失败）。判断写入是否成功要看 list 接口里的 `size` 和
`updated_at`；回读校验请加 cache-buster 查询串。

## 顺手修掉的三个上限（都是"静默失败"型）

客户端对 private manifest 的任何校验失败都会被
`use-local-sound-effects-lab.ts` 吞掉（`isAvailable:false, error:null`，
fail-closed），表现是**实验室入口无声消失，没有任何报错**。所以下面每一个
上限撞上去都很难排查：

| 项 | 原值 | 现值 | 撞墙点 |
|---|---|---|---|
| `batch` 枚举 | `z.enum(["01","02","03"])` ×2 处 | `z.string().regex(/^\d{2}$/)` | 每批都要改两处，漏改客户端那处即静默消失 |
| `MAX_REMOTE_MANIFEST_BYTES` | 1 MiB | **4 MiB** | 每条约 860 B，约 1,219 条 |
| `items` / `resources` 条数 | `.max(2_000)` ×3 处 | **`.max(4_000)`** | 2,000 条 |

注意后两个的**顺序会互换**：1 MiB 时是字节数先撞（约 1,219 条），
提到 4 MiB 后变成条数先撞（2,000）。Phase A 估算全库 1,400–1,900，正好
骑在 2,000 上，所以两个都得提。

改动位置：`apps/web/src/lib/audio/local-sound-effects-manifest.ts`
和 `scripts/build-local-sound-effects-lab-manifest.ts`。

## 验证

- 938 条完整性校验（本地文件大小 + SHA-256 对 manifest）全过
- 钉死 key 回读（带 cache-buster）与本地文件 **sha256 一致**，938 条 / 20 分类
- manifest 引用的对象 **0 缺失、0 大小不符**
- 抽 3 条新音效从桶里下载，SHA-256 全部匹配
- `apps/web/src/lib/audio` + `lib/assets` + 音效实验室视图：**37 文件 / 210 测试通过**
- 备份：`jianying/2026-08-15/manifest.914.bak.json`（线上）
  与 `BACKUP-pinned-2026-08-01.json`（本地）

## 工具

`~/Documents/QCut/Exports/jianying-sfx-batch-04-2026-08-17/`（不进 Git）

- `phase-a.py` — Phase A 看板/探测。**结论：翻页无法自动化**，
  9 种手段（AX 滚动条 ×6、Page Down、End、下箭头、拖拽）全部无效，
  详见脚本 docstring 与 `jianying-reference` skill
- `collect-batch-04.py` — 本批采集器，按签名有效期筛选 + 双键去重

## 下一步

1. Phase A 人工翻页（12 类），`phase-a.py watch` 做实时看板
2. 之后照本文第 1 节的"复用 catalog date"方式增量上传
3. `jianying/2026-08-01/assets/` 那 382 个孤儿（80.7 MiB）可以删了 ——
   **注意钉死的 manifest key 就在同一前缀下，只能删 `assets/` 子路径，
   不能 `rm -r jianying/2026-08-01/`**
