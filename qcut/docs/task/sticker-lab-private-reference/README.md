# Sticker Lab — 私有剪映参照目录

贴纸实验室有三种素材来源：

| 来源 | manifest | 存储前缀 | 可见性 |
|---|---|---|---|
| QCut 原创（公开） | 随包分发 `sticker-lab/qcut-original-*.json` | `catalogs/qcut-original-*/assets/` | 预览：所有登录用户；原图：白名单 |
| 剪映参照（冻结远端） | 仅存于私有 bucket | `jianying/<catalog>/assets/` | manifest、预览、原图全部仅白名单 |
| 剪映参照（本地开发机） | 仓库外本地 v1/v2 manifest/report | 不上传；默认 `~/Movies/QCut Sticker Lab` | 桌面内部参照；禁止二次分发 |

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

## 冻结政策

**2026-08-23 决策：现有远端前三批保留并冻结；新增参照只允许留在授权开发机。**

- 共享 registry 必须继续只包含上表三个 catalog；冻结项不做常规覆盖、复制或替换；
- 第 4–18 批只保留为仓库外的本地参照证据，不生成产品 manifest/object key，
  不注册、不上传；
- 第 18 批已在新的明确决定下完成本地验收；不启动第 19 批，未来采集仍默认只允许
  本地审计；
- 仓库中的 prepare/publisher 是历史工具，不构成上传或再分发授权；不得用它把第
  4–18 批或新采集的第三方参照发布到任何云存储；
- 下一阶段只从观察结果提炼 clean-room QCut 原创，或使用具有可核验再分发与商业
  使用授权的素材。

运行时 entitlement 只控制授权人员读取已经冻结的前三批，不代表允许上传、复制、
宣传、公开导出或把参照素材转成产品资产。完整库存、UI/CLI 用法与后续工程清单见
[本地 UI 与 CLI](./LOCAL-UI-CLI.md) 和
[第 17 批历史收尾清单](./BATCH-17-NEXT-STEPS.md)。

## 安全边界

这些素材来自剪映目录，逐项权利归属和再分发授权未经核验，**只作为内部对标参照使用**：

- 新采集的第三方参照素材及其原始或产品化 manifest、报告、联系表、签名 URL 和
  素材派生图均不进 Git、安装包、对象存储、发布物或宣传物；
- 现有 bucket `sticker-lab` 必须保持 private，不得公开当前冻结对象；
- 私有 catalog selector 与剪映参照 object key 必须命中共享固定 registry，不能把
  用户输入直接拼成 Supabase 路径；
- 客户端缓存条目标记 `commercialUse: "restricted"`，不得出现在发行物、宣传物
  或公开导出中；
- 普通用户请求私有 manifest、缩略图或原图均得到 403；鉴权在 catalog 校验之前，
  不泄露 selector 是否存在；
- Sticker Lab 的 200/302/400/401/403/404/502，以及以后增加的 429 响应均必须带
  `Cache-Control: no-store`。

## Entitlement 配置与迁移

| 环境变量 | 作用 | `*` 语义 |
|---|---|---|
| `STICKER_LAB_ORIGINAL_ALLOWED_USER_IDS` | QCut 原创完整素材 | 可有意开放给所有已登录用户 |
| `STICKER_LAB_PRIVATE_REFERENCE_ALLOWED_USER_IDS` | 冻结前三批的 manifest、缩略图和原图 | 禁止；任意 `*` token 使整份配置 fail-closed |
| `STICKER_LAB_ALLOWED_USER_IDS` | 旧部署迁移 fallback | 已弃用；私有层仍拒绝 `*` |

三个变量都是逗号分隔的 QCut user ID。新变量使用空串或纯空白时明确 fail-closed；
只有对应新变量完全未定义时才回退旧变量，不能用旧配置绕过显式空值。旧变量中的
显式 user ID 可在迁移期保持两层兼容；旧变量为 `*` 时只开放原创完整素材，三个
私有入口仍返回 403。

部署迁移顺序：

1. 先把两个新变量配置为 Worker secret；allowlist 不进入公开的 Wrangler `[vars]`；
2. 部署后分别验证原创 wildcard/显式 ID、私有显式 ID、私有 wildcard 拒绝和未知
   catalog 不泄露；
3. 验证通过后删除旧 `STICKER_LAB_ALLOWED_USER_IDS` secret。

变量在请求处理期间读取，不能在模块加载时缓存；Cloudflare Worker 会先把 request
env 同步到 `process.env`。未登录、未配置、空配置、非白名单和私有 wildcard 一律
fail-closed，受拒请求不得调用 Supabase。

## 本地参照审计

第 4–18 批的 manifest、report、素材、联系表和拒绝台账继续留在授权开发机的仓库
外目录。当前本地基线为 18 批、43 个分类、2,924 项、4,249,707,252 B，详细契约见
[本地 UI 与 CLI](./LOCAL-UI-CLI.md)。审计和桌面桥只能读取本地文件，必须避免生成或
保留 signed URL，且不得把第三方素材复制进测试 fixture。任何后续 PR 都不得以
“private bucket”或“只有白名单可见”替代 provenance 与再分发授权判断。
