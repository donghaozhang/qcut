# 音效实验室 Batch-03 扩采与补齐方案

日期: 2026-08-15
现状基线: 382 个音效 / 20 个分类（catalog `jianying-sfx-reference-2026-08-01`）
定位: 剪映参照目录，仅限内部对标（internal-reference, redistribution prohibited）

## 1. 现状与缺口（2026-08-15 实测）

数据来源：剪映专业版本机缓存
`~/Movies/JianyingPro/User Data/Cache/ressdk_db/{4504805502666160584,515395108782262524}/rp.db`
的 `http_cache` 表（`/artist/v1/effect/get_resources_by_category_id_*_audio_jianyingpro_*` 分页响应）。

- 剪映音效库面板共 **20 个分类**，我们分类覆盖 20/20，不缺类，缺的是每类深度（目前每类只有第一页 20 个）。
- 本机缓存中可定位到的唯一音效（含标题、resourceId、时长、下载地址等完整元数据）：**1,028 个**。
- 我们已收 382 个，全部在该池内 → **立即可补采 646 个**。
- 20 类里 15 类最后一页仍 `has_more=true`，1,028 只是下界；按热门 ≥150、最新 ≥183 的密度推算，云端全量约 2,000–4,000。

每类明细（"剪映总量"列：无 `>` 前缀 = 缓存已翻到底，总量确认）：

| 分类 | category_id | key | 剪映总量 | 我们 | 缺口 |
|---|---|---|---:|---:|---:|
| 尴尬 | 5914403 | ganga | 16 | 16 | 0 ✅ |
| 震惊 | 5914404 | zhenjing | 29 | 20 | 9 |
| 知识科普 | 5914406 | zhishi | 35 | 20 | 15 |
| BGM | 10897 | 10897 | 36 | 20 | 16 |
| 打斗 | 10902 | 10902 | 46 | 20 | 26 |
| 热门 | 10892 | 10892 | >150 | 20 | ≥130 |
| 最新 | 5914796 | new | >183 | 20 | ≥163 |
| 转场 | 10899 | 10899 | >83 | 20 | ≥63 |
| 网感口播🔥 | 5914402 | wanggan | >51 | 20 | ≥31 |
| 热梗语录 | 5914764 | regeng | >50 | 20 | ≥30 |
| 笑声 | 10894 | 10894 | >50 | 20 | ≥30 |
| 提示音 | 5914405 | tishi | >50 | 20 | ≥30 |
| 抽象 | 5914365 | 抽象 | >50 | 20 | ≥30 |
| 综艺感 | 10895 | zongyi | >50 | 20 | ≥30 |
| 机械 | 10896 | 10896 | >50 | 20 | ≥30 |
| 魔法 | 10901 | 10901 | >50 | 20 | ≥30 |
| 美食 | 10903 | 10903 | >50 | 20 | ≥30 |
| 动物 | 10904 | 10904 | >50 | 20 | ≥30 |
| 环境音 | 10905 | 10905 | >50 | 20 | ≥30 |
| 悬疑 | 10907 | 10907 | >50 | 20 | ≥30 |

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
| B. 每类对齐 50（一页深度） | 15 个大类各补到 50 | ≈+580 | ≈1,030 |
| C. 云端全量 | 每类滚动到 `has_more=false` | 未知（估 +1,000~3,000） | 2,000+ |

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
#    合并键: resourceId；冲突时保留旧条目（内容不可变，md5 相同）
# 2) 生成本地 v1 + 私有 v2 manifest
bun run build:sound-effects-lab-manifest -- \
  --input  "$HOME/Documents/QCut/exports/jianying-sfx-batch-03-<date>/combined-title-file-map.json" \
  --output "$HOME/Documents/QCut/exports/jianying-sfx-lab-<date>/sound-effects-lab.local.json" \
  --remote-output "$HOME/Documents/QCut/exports/jianying-sfx-lab-<date>/sound-effects-lab.private.json" \
  --catalog-date <date>
```

构建脚本会做 schema 校验（zod）、唯一性检查（resourceId / numericId /
objectKey / md5 / sha256）和缺文件检查，任何一项不过直接失败。

### Phase D — 上传与 manifest key 策略

```bash
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
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
  旧 manifest 先另存 `manifest.<旧date>.bak.json` 供回滚。
- **方案 2（正式）**：manifest 传到 `jianying/<新date>/manifest.json`，
  同时把 worker 常量改成新 key 并 `wrangler deploy`。适合顺路做 worker 变更时。

### Phase E — 客户端验证（无需改代码）

客户端完全由 manifest 驱动，分类栏（`sound-effects-lab.tsx` 的
`LabCategoryButton` 数量徽标）会自动反映新数量。验证清单：

1. `bun run electron` 启动 → 音频面板 → 音效实验室；
2. 左栏总数 = 新 manifest 总数（档位 A+B 应为 ~1,030），各分类数量与
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
- [ ] 本文档第 1 节表格更新为采后数字

## 附录：缺口复算脚本

任何时候想重新体检（例如 Phase A 之后确认浏览深度够不够）：

```bash
python3 - <<'EOF'
import sqlite3, json, os, glob
from collections import Counter, defaultdict
CATS = {10892:'热门',5914796:'最新',10899:'转场',5914402:'网感口播',5914764:'热梗语录',
10894:'笑声',5914403:'尴尬',5914404:'震惊',5914405:'提示音',5914365:'抽象',
10895:'综艺感',5914406:'知识科普',10896:'机械',10897:'BGM',10901:'魔法',
10902:'打斗',10903:'美食',10904:'动物',10905:'环境音',10907:'悬疑'}
by_cat = defaultdict(lambda: {'ids': set(), 'has_more': False})
for db in glob.glob(os.path.expanduser('~/Movies/JianyingPro/User Data/Cache/ressdk_db/*/rp.db')):
    conn = sqlite3.connect(db)
    for (url, body) in conn.execute("SELECT url, response_body FROM http_cache WHERE url LIKE '%get_resources_by_category_id%audio%'"):
        try: data = json.loads(body).get('data') or {}
        except Exception: continue
        items = data.get('effect_item_list') or []
        votes = Counter(int(c) for it in items for c in (it.get('common_attr') or {}).get('category_ids') or [] if str(c).isdigit())
        cat = next((c for c,_ in votes.most_common() if c in CATS), None)
        if cat is None: continue
        by_cat[cat]['ids'].update((it.get('common_attr') or {}).get('effect_id') for it in items)
        by_cat[cat]['has_more'] |= bool(data.get('has_more'))
    conn.close()
for cid, name in CATS.items():
    e = by_cat.get(cid)
    if e: print(f"{name}: cached={len(e['ids'])} has_more={e['has_more']}")
    else: print(f"{name}: 未浏览")
EOF
```
