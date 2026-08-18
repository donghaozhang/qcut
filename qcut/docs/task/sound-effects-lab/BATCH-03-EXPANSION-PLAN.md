# 音效实验室 Batch-03 扩采与补齐方案

日期: 2026-08-15
现状基线: 382 个音效 / 20 个分类（catalog `jianying-sfx-reference-2026-08-01`）
定位: 剪映参照目录，仅限内部对标（internal-reference, redistribution prohibited）

## 0. 执行记录（2026-08-15 当晚完成，档位 A+B ✅）

**结果：382 → 914 个音效（+532），20 分类，200 MB，已上线并在客户端验证。**
catalog `jianying-sfx-reference-2026-08-15`；尴尬 16、震惊 29、知识科普 31、
BGM 36、打斗 46 已达剪映确认全量；热门 114、最新 101（UI 计数按跨类标签）。

- Phase A：computer-use 驱动剪映逐类点击+滚动，20 类全部刷新签名
  （新鲜池 918，唯一新增 536）。
- Phase B：`collect-batch-03.ts`（本目录同名文件的落地版在
  `~/Documents/QCut/Exports/jianying-sfx-batch-03-2026-08-15/`）下载 532、
  内容重复跳过 4、失败 0。
- Phase C：合并 map 914 全唯一；`--catalog-date 2026-08-15` 生成双 manifest。
- Phase D：supabase CLI 上传 914 资产至 `jianying/2026-08-15/assets/`，
  manifest 双写（canonical 新 key + 覆盖钉死 key，旧版备份
  `manifest.2026-08-01.bak.json`），回读字节一致。
- Phase E：重启 QCut，实验室侧栏显示 全部分类 914，分类计数齐全。

**实操踩坑（下次 batch 直接照抄解法）：**

1. `http_cache.timestamp` 是 **UTC**，判断新鲜度别用本地时间。
2. **bun:sqlite 在本环境（沙箱）里打不开任何数据库**（连 bun spawn 的
   sqlite3 子进程也一样）。解法：外层 shell 直接
   `sqlite3 -json -readonly <snapshot.db> < card-query.sql > cards-*.json`
   预导出，采集脚本只读 JSON。剪映持有的活库先 `.backup` 快照再查。
3. 剪映客户端对 <1 小时内的分页有内存缓存，重复点击不会重新请求
   （即不刷新 http_cache 行）——热门/最新如果当天已浏览过，签名时间以
   首次浏览为准。
4. 多数分类滚 3 屏只触发第 1 页（50 条）；要拿第 2 页以上需要更长的滚动
   （C 档全量时注意）。
5. supabase CLI 必须在 **linked 目录**（`packages/db/`）运行；
   `storage cp -r <dir> ss:///bucket/prefix` 是把目录内文件平铺到 prefix 下；
   `cp` **不覆盖**（409 KeyAlreadyExists），覆盖 = 先 `rm`（有交互确认，
   `echo y |`）再 `cp`；bucket 的 MIME 白名单会拒掉非 audio/json。
6. batch 枚举有 **两处**要加 "03"：`scripts/build-local-sound-effects-lab-manifest.ts`
   （commit `21b7d9918`）和客户端
   `apps/web/src/lib/audio/local-sound-effects-manifest.ts`（commit
   `6fb792fdc`）。漏掉客户端那处的表现是：manifest 校验失败 → 实验室入口
   静默消失（fail-closed），无报错弹窗。
7. `bun run electron` 必须从仓库根跑；cwd 在 packages/db 时 `electron .`
   只会打印 usage。

剩余工作：C 档（云端全量，12 类翻页到底）。缺口复测见第 1 节。

> **2026-08-17 更新**：batch-04 已把缓存里签名未过期的 24 条采完，
> 库存 914 → **938**。翻页仍需人工（9 种自动化手段全部实测无效）。
> 增量上传方式、三个"静默失败"上限的修复、以及不产生 404 窗口的切换做法，
> 见 [BATCH-04-RECORD.md](BATCH-04-RECORD.md) —— **下一批开工前先读那份**。

## 1. 现状与缺口（2026-08-17 复测）

数据来源：剪映专业版本机缓存
`~/Movies/JianyingPro/User Data/Cache/ressdk_db/{4504805502666160584,515395108782262524}/rp.db`
的 `http_cache` 表（`/artist/v1/effect/get_resources_by_category_id_*_audio_jianyingpro_*` 分页响应，
当前共 31 条分页响应、1,028 张唯一卡片）。

- 分类覆盖 20/20，不缺类；缺的全部是**每类深度**。
- 已收 **914** 条。本机缓存池里还有 **114 条已知条目**没采（都能点名道姓）。
- 20 类中 **8 类已翻到 `has_more=false`**（列表总量已确认），**12 类只有第 1 页**
  （50 条封顶、仍 `has_more=true`），真实深度未知。

每类明细（"剪映列表"= 按请求分页归属统计的该分类列表长度；`>` 前缀 = 未探底）：

| 分类 | category_id | 剪映列表 | 列表内已收 | 缺口 | 已翻到 |
|---|---|---:|---:|---:|---|
| 热门 | 10892 | 150 | 149 | 1 | offset 150 ✅ |
| 最新 | 5914796 | 183 | 100 | 83 | offset 200 ✅ |
| 转场 | 10899 | 83 | 53 | 27 | offset 83 ✅ |
| 尴尬 | 5914403 | 16 | 16 | 0 ✅ | 探底 |
| 震惊 | 5914404 | 29 | 29 | 0 ✅ | 探底 |
| 知识科普 | 5914406 | 35 | 35 | 0 ✅ | 探底 |
| BGM | 10897 | 36 | 36 | 0 ✅ | 探底 |
| 打斗 | 10902 | 46 | 46 | 0 ✅ | 探底 |
| 网感口播🔥 | 5914402 | >52 | 51 | 1 | 仅第 1 页 |
| 机械 | 10896 | >50 | 47 | 3 | 仅第 1 页 |
| 热梗语录 | 5914764 | >50 | 50 | 0 | 仅第 1 页 |
| 笑声 | 10894 | >50 | 50 | 0 | 仅第 1 页 |
| 提示音 | 5914405 | >50 | 50 | 0 | 仅第 1 页 |
| 抽象 | 5914365 | >50 | 50 | 0 | 仅第 1 页 |
| 综艺感 | 10895 | >50 | 50 | 0 | 仅第 1 页 |
| 魔法 | 10901 | >50 | 50 | 0 | 仅第 1 页 |
| 美食 | 10903 | >50 | 50 | 0 | 仅第 1 页 |
| 动物 | 10904 | >50 | 50 | 0 | 仅第 1 页 |
| 环境音 | 10905 | >50 | 50 | 0 | 仅第 1 页 |
| 悬疑 | 10907 | >50 | 50 | 0 | 仅第 1 页 |

（"库内"口径与上表不同：manifest 按卡片自带的 `category_ids` 归类，跨类条目会
被多次计入，所以侧栏分类计数会大于这里的"列表内已收"。）

**缺口结论：**

1. **已知具体条目：114 条**（最新 83、转场 27、机械 3、热门 1）。其中 109 条来自
   2026-08-01 的分页，签名已死（见下节），必须重新浏览才能下载。
2. **深度未知：12 类**。唯一探到底的真实分类是转场（83）；其余已探底的真实分类
   都在 16–46 之间、根本没撑满 50。所以这 12 类每类真实总量大概率在 80–150，
   据此估计**还差 400–900 条**，全库上限约 **1,400–1,900**。
   （热门 150 / 最新 183 是跨类聚合位，不代表单类深度。）

### 签名有效期（2026-08-17 实测）

分页响应里的 `download_info.url` 有两种 host，TTL 差一个数量级：

| host | 到期参数 | 实测 TTL | 现在还能下吗 |
|---|---|---|---|
| `v*-artist.vlabvod.com` | 路径段十六进制时间戳 | **7 天** | 08-01 的链接返回 403 |
| `lf26-faceu-file-sign.bytecdn.com` | `x-expires` | **1 年** | 08-15 的链接 206 正常 |

大多数卡片走 vlabvod，所以"当天浏览、当天采集"这条铁律不变。

## 2. 采集原理与两个关键约束

1. **元数据在 rp.db，音频靠签名 URL 下载。** 分页响应里每张卡带
   `$.common_attr.download_info.url`（vlabvod.com CDN 签名地址）。
   batch-02 的 `collect-batch-02.ts` 正是用 `json_extract` 从 `http_cache`
   拉出这些行然后直接 `fetch` 下载的（策略 `isolated-card-download`）。
2. **签名会过期（实测 2026-08-01 缓存的 URL 于 08-15 已 403）。**
   所以流程必须是：**当天先在剪映里浏览目标分类刷新缓存 → 当天立刻跑采集脚本**。
   隔天再跑就只能重新浏览。另外剪映的 effect 缓存文件只在首次下载时落盘，
   靠翻库存文件补不了新音效——必须走浏览+下载。

## 3. 目标口径（三档，建议按顺序执行）

| 档位 | 内容 | 新增 | 完成后总量 |
|---|---|---:|---:|
| A. 收齐已确认全量的 4 个小类 | 震惊/知识科普/BGM/打斗 补满 | +66 | 448 |
| B. 每类对齐 50（一页深度） | 15 个大类各补到 50 | +450（条目口径） | ≈898（唯一资源因跨类重复会少一些） |
| C. 云端全量 | 剩下 12 类滚动到 `has_more=false` | 估 +500~1,000（含已知的 114） | 1,400~1,900 |

- A+B 的全部元数据本机已有，只需刷新签名即可下载；预计体积 ~220 MiB
  （现库 80.7 MiB × 2.7），单文件仍远低于 bucket 50 MiB 限制。
- C 档需要逐类滚动到底（热门/最新可能 3–4 页以上），浏览工作量最大，放最后。

## 4. Batch-03 操作步骤

### Phase A — 浏览刷新缓存（当天完成）

1. 打开剪映专业版 → 任意草稿 → 顶部 `音频` → 左栏 `音效库`。
2. 逐个点击目标分类，向下滚动到需要的深度：
   - 档位 A/B：每类滚 1–2 屏（确保前 50 张卡的分页响应进缓存）;
   - 档位 C：滚到底（列表不再加载新卡）。
3. 每类停留 ~2 秒等分页请求落库。可手动，也可用 cliclick 自动化
   （本仓库 jianying-reference skill 记录了坐标点击方法）。
4. 验证缓存已刷新（时间戳应为今天）：

```bash
for db in ~/Movies/JianyingPro/User\ Data/Cache/ressdk_db/*/rp.db; do
  sqlite3 "$db" "SELECT COUNT(*), MAX(timestamp) FROM http_cache
    WHERE url LIKE '%get_resources_by_category_id%audio%';"
done
```

   注意：上面只是聚合速览——一条无关的新行也能让它看起来"新鲜"。
   逐类判定请用文末附录脚本（按分类统计 cached 数与 `has_more`），
   任何目标分类 cached 数不足、或该分类最新 `timestamp`（UTC）早于
   采集当天，都视为 Phase A 未完成。

### Phase B — 当天运行采集脚本

以 `~/Documents/QCut/Exports/jianying-sfx-batch-02-2026-08-01/collect-batch-02.ts`
为模板复制出 `collect-batch-03.ts`（同目录规范：
`~/Documents/QCut/Exports/jianying-sfx-batch-03-<date>/`），需要改三处：

1. `CATEGORY_TARGETS`：按第 1 节表格设置每类目标数（档位 A/B 时
   小类填确认总量、大类填 50）。
2. **去重基线**：载入 batch-01+02 的
   `combined-title-file-map.json`，按 `resourceId` 和 `contentMd5`
   双键跳过已收条目（batch-02 已有 `skippedContentDuplicateCount` 逻辑，保留）。
3. 输出 `batch-03-title-file-map.json`。

脚本行为（沿用 batch-02，不要另起炉灶）：
`json_extract` 拉卡片行 → `fetch` 签名 URL（带重试）→ 落盘
`<contentMd5>.mp3` → ffprobe 校验 `audio/mpeg` → 写映射
（`mappingStrategy: "isolated-card-download"`, `confidence: "exact"`）。

失败处理：单条 403/超时 → 记入 `failures`，Phase A 重新浏览该分类后重跑
（脚本幂等，已下载的按 md5 跳过）。

### Phase C — 合并映射并生成 manifest

```bash
# 1) 合并 batch-01/02/03 → combined-title-file-map.json（新目录）
#    合并键: resourceId；冲突时必须校验 contentMd5/sha256/objectKey 完全
#    一致后才保留旧条目，任何不一致直接让合并失败（fail-closed），
#    禁止静默保留旧条目——资源被重发布时旧音频会悄悄留在 combined map 里
# 2) 生成本地 v1 + 私有 v2 manifest
bun run build:sound-effects-lab-manifest -- \
  --input  "$HOME/Documents/QCut/Exports/jianying-sfx-batch-03-<date>/combined-title-file-map.json" \
  --output "$HOME/Documents/QCut/Exports/jianying-sfx-lab-<date>/sound-effects-lab.local.json" \
  --remote-output "$HOME/Documents/QCut/Exports/jianying-sfx-lab-<date>/sound-effects-lab.private.json" \
  --catalog-date <date>
```

构建脚本会做 schema 校验（zod）、唯一性检查（resourceId / numericId /
objectKey / md5 / sha256）和缺文件检查，任何一项不过直接失败。

### Phase D — 上传与 manifest key 策略

```bash
# 高权限密钥不进命令行也不进 shell 历史：从 0600 的 ~/.qcut/.env
# （仓库密钥的规范存放处）读进当前进程，用完即退出该 shell。
set -a; source ~/.qcut/.env; set +a
bun run upload:sound-effects-lab -- \
  --local-manifest   ".../sound-effects-lab.local.json" \
  --private-manifest ".../sound-effects-lab.private.json"
```

**注意：license server 把私有 manifest 的 object key 钉死为**
`jianying/2026-08-01/manifest.json`
（`packages/license-server/src/routes/sound-effects-lab.ts` 的
`PRIVATE_MANIFEST_OBJECT_KEY`），而音频 key 校验是宽日期的
`^jianying/\d{4}-\d{2}-\d{2}/assets/<md5>\.mp3$`。两个可选方案：

- **方案 1（零部署，推荐）**：新音频上传到 `jianying/<新date>/assets/`，
  但把新 manifest **覆盖写到钉死的 `jianying/2026-08-01/manifest.json`**。
  manifest 内的 objectKey 带新日期，音频 key 正则放行，worker 不用动。
  切换顺序必须避免 404 窗口（`storage cp` 不覆盖，覆盖=先 `rm` 再
  `cp`，期间 license server 对钉死 key 返回 404，客户端入口消失）：
  1. 先把新 manifest 传到临时 key（如
     `jianying/<新date>/manifest.staging.json`）并验证能完整拉取；
  2. 旧 manifest 另存 `manifest.<旧date>.bak.json`；
  3. `rm` 钉死 key 后**立即** `cp` 新 manifest 过去（窗口压到秒级）；
  4. `cp` 失败立即用第 2 步的备份恢复钉死 key。

  另注意：Phase D 上传器带 `x-upsert: true` 写的是
  `jianying/<catalog-date>/manifest.json`，license server 只读钉死 key——
  上传完成后仍要按上面的顺序把 manifest 落到钉死 key（或走方案 2 改
  worker 常量），否则新数据永远不生效。
- **方案 2（正式）**：manifest 传到 `jianying/<新date>/manifest.json`，
  同时把 worker 常量改成新 key 并 `wrangler deploy`。适合顺路做 worker 变更时。

### Phase E — 客户端验证（无需改代码）

客户端完全由 manifest 驱动，分类栏（`sound-effects-lab.tsx` 的
`LabCategoryButton` 数量徽标）会自动反映新数量。验证清单：

1. `bun run electron` 启动 → 音频面板 → 音效实验室；
2. 左栏总数 = 新 manifest 总数（以去重后 manifest 实际条数为准），各分类数量与
   第 1 节目标一致；
3. 抽 3 类各试听 2 条新增音效（卡片能下载、能播、能加时间线）；
4. `bun x vitest run apps/web/src/components/editor/media-panel/views/__tests__/sound-effects-lab.test.tsx`；
5. license server 侧：非白名单账号请求 manifest 仍 403（fail-closed 不回归）。

## 5. 合规红线（与既有政策一致，不因扩采放宽）

- 全部资源仅限**内部参照对标**，`commercialUse: "restricted"`，禁止分发；
- 音频只进私有 Supabase bucket（`sound-effects-lab`），不进 Git、不进安装包；
- 客户端保持不可收藏、不写最近使用、不可拖拽绕过受控导入；
- 白名单 `SOUND_EFFECTS_LAB_ALLOWED_USER_IDS` 不扩大范围。

## 6. 验收标准

- [ ] Phase A 缓存时间戳为采集当天，目标分类页数达标
- [ ] batch-03 map：`failedCount: 0`，去重后新增数 = 目标数
- [ ] combined map 唯一性：resourceId / contentMd5 无冲突
- [ ] manifest 构建通过全部约束校验
- [ ] Supabase 对象数 = manifest 条目数，上传器最后才写 manifest
- [ ] 客户端五项验证全过（见 Phase E）
- [x] 本文档第 1 节表格更新为采后数字（2026-08-17 复测）

## 附录：缺口复算脚本

任何时候想重新体检（例如 Phase A 之后确认浏览深度够不够）。判定标准：目标分类的
`has_more` 必须是 `False`，或 `deepest_offset` 已达目标深度，且 `last`（UTC）是采集当天。

> 早先版本用 `re.search(r'category_id=(\d+)', url)` 归类，但缓存里的 URL 是
> `..._audio_jianyingpro_beta` 这样的**哈希 key**，根本没有 `category_id` 查询串，
> 所以那版脚本对每一类都输出"未浏览"。下面这版沿用 `card-query.sql` 的
> 首 10 张卡多数票归属，并额外打印分页深度。

```bash
python3 - <<'EOF'
import sqlite3, json, os, glob
from collections import defaultdict
CATS = {'10892':'热门','5914796':'最新','10899':'转场','5914402':'网感口播','5914764':'热梗语录',
'10894':'笑声','5914403':'尴尬','5914404':'震惊','5914405':'提示音','5914365':'抽象',
'10895':'综艺感','5914406':'知识科普','10896':'机械','10897':'BGM','10901':'魔法',
'10902':'打斗','10903':'美食','10904':'动物','10905':'环境音','10907':'悬疑'}
cat = defaultdict(lambda: {'ids': set(), 'pages': {}})
for db in glob.glob(os.path.expanduser('~/Movies/JianyingPro/User Data/Cache/ressdk_db/*/rp.db')):
    # immutable=1 才能读剪映正持有的活库，不用先 .backup 快照。
    conn = sqlite3.connect(f'file:{db}?immutable=1', uri=True)
    for url, body, ts in conn.execute(
        "SELECT url, response_body, timestamp FROM http_cache"
        " WHERE instr(url, '_audio_') > 0 ORDER BY timestamp"):
        data = json.loads(body).get('data') or {}
        items = data.get('effect_item_list') or []
        if not items: continue
        votes = defaultdict(int)
        for it in items[:10]:
            for c in (it.get('common_attr') or {}).get('category_ids') or []:
                if str(c) in CATS: votes[str(c)] += 1
        if not votes: continue
        cid = sorted(votes.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        e = cat[cid]
        e['pages'][data.get('next_offset') or 0] = (bool(data.get('has_more')), ts)
        e['ids'].update(it['common_attr']['id'] for it in items)
    conn.close()
for cid, name in CATS.items():
    e = cat.get(cid)
    if not e:
        print(f"{name}: 未浏览"); continue
    deep = max(e['pages']); more, ts = e['pages'][deep]
    print(f"{name}: cached={len(e['ids'])} pages={sorted(e['pages'])}"
          f" deepest_offset={deep} has_more={more} last={ts}")
EOF
```

对照 manifest 算"还差哪些具体条目"（把 cached 卡片的 `common_attr.id` 与
`sound-effects-lab.private.json` 的 `resourceId` 求差集）即可拿到可点名的补采清单。
