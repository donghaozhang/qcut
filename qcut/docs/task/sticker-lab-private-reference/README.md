# Sticker Lab — 私有剪映参照目录

贴纸实验室有两种素材来源：

| 来源 | manifest | 存储前缀 | 可见性 |
|---|---|---|---|
| QCut 原创（公开） | 随包分发 `sticker-lab/qcut-original-*.json` | `catalogs/qcut-original-*/assets/` | 预览：所有登录用户；原图：白名单 |
| 剪映参照（私有） | 仅存于私有 bucket | `jianying/<catalog>/assets/` | manifest、预览、原图全部仅白名单 |

私有目录采用一批一个 namespace，避免扩容时搬迁或复制已有素材：

| catalog ID | manifest object key | 分类 / 贴纸 | 素材大小 |
|---|---|---:|---:|
| `jianying-2026-07-31` | `jianying/2026-07-31/manifest.json` | 42 / 168 | 293,356,501 B |
| `jianying-2026-08-01-batch-2` | `jianying/2026-08-01-batch-2/manifest.json` | 42 / 168 | 255,803,574 B |
| `jianying-2026-08-01-batch-3` | `jianying/2026-08-01-batch-3/manifest.json` | 42 / 168 | 320,239,679 B |

客户端分别校验每份 manifest，再把同 ID 分类合并为一个视图。因此白名单用户
看到 42 个分类、每类 12 个参照贴纸，共 504 个；任意一批暂时不可用时，其余批次
仍可使用。固定目录注册表在
`packages/editor-core/src/sticker-lab/private-catalogs.ts`，Web 与 license server
共同引用，不能在两端另写一份列表。

## 安全边界

这些素材属于字节跳动及其合作 IP，**只作为内部对标参照使用**：

- 素材和生成后的私有 manifest 都不进 Git、不进安装包；
- bucket `sticker-lab` 必须保持 private；
- manifest、缩略图、原图均经 license server，并要求
  `STICKER_LAB_ALLOWED_USER_IDS` 白名单，未配置时 fail-closed；
- 客户端缓存条目标记 `commercialUse: "restricted"`，不得出现在发行物、宣传物
  或公开导出中；
- catalog selector 与素材 object key 必须命中共享固定注册表，不能把用户输入直接
  拼成 Supabase 路径；
- 普通用户请求私有 manifest 得到 403，面板不渲染私有目录入口。

## 准备与发布新批次

发布工具会重新读取真实文件，核对 manifest/report、realpath、symlink、文件大小、
SHA-256、MIME magic、分类归属和跨批重复，再生成 version 2 私有 manifest。新批次
必须用 `--against-manifest` **恰好提供注册表中排在它之前的每一批**；重复、缺失、
当前批或后续批都会失败，各批分类 ID 与显示名称的顺序也必须一致（`sourcePanel`
只是采集来源描述，可以不同）。输出路径必须在 Git 仓库外。资产带校验元数据上传，
manifest 最后发布；中断后可安全续传，远端同名对象的大小或哈希不一致时会直接失败。
`--max-catalog-bytes` 只能收紧共享的 512 MiB 上限，不能放宽。

先准备并审阅：

```bash
bun run sticker-lab:private-catalog -- \
  --prepare \
  --catalog-id jianying-2026-08-01-batch-2 \
  --manifest /absolute/private/batch/manifest.json \
  --report /absolute/private/batch/report.json \
  --against-manifest /absolute/private/previous-manifest.json \
  --output /absolute/private/staging/jianying-2026-08-01-batch-2.json
```

第三批必须同时对照前两批，不能只给最近一批：

```bash
bun run sticker-lab:private-catalog -- \
  --prepare \
  --catalog-id jianying-2026-08-01-batch-3 \
  --manifest /absolute/private/batch-3/manifest.json \
  --report /absolute/private/batch-3/report.json \
  --against-manifest /absolute/private/staging/jianying-2026-07-31.json \
  --against-manifest /absolute/private/staging/jianying-2026-08-01-batch-2.json \
  --output /absolute/private/staging/jianying-2026-08-01-batch-3.json
```

确认后发布到私有 bucket：

设置好 `SUPABASE_URL` 与 `SUPABASE_SERVICE_KEY` 后执行：

```bash
bun run sticker-lab:private-catalog -- \
  --publish \
  --catalog-id jianying-2026-08-01-batch-2 \
  --manifest /absolute/private/batch/manifest.json \
  --report /absolute/private/batch/report.json \
  --against-manifest /absolute/private/previous-manifest.json \
  --output /absolute/private/staging/jianying-2026-08-01-batch-2.json
```

默认不覆盖远端 manifest。只有经过审阅的有意替换才可传
`--replace-manifest`；本地输出内容不同时同理需显式 `--replace-output`。

首批转换后 manifest 可从历史恢复：

```bash
git show 28d2521d6:qcut/apps/web/public/sticker-lab/jianying-2026-07-31.json
```
