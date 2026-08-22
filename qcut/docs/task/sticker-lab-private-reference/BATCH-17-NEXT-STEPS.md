# Sticker Lab 第 17 批收尾与下一步实施清单

<!-- markdownlint-disable MD013 -->

**状态：** 本地参照采集已冻结；第 17 批已验收；未启动第 18 批

**日期：** 2026-08-23

**本地库存核验基线：** `275f42ad8`

**P0 实施起点：** `8290f3a13`

**相关说明：** [Sticker Lab 私有剪映参照目录](./README.md)

## 1. 这份文档要解决什么

本轮已经完成第 17 批剪映贴纸的本地参照采集和质量收尾。下一阶段不应继续机械下载更多素材，而应先回答三个问题：

1. 本地参照证据怎样冻结、复核和恢复，而不把第三方素材或签名信息带入 Git；
2. 怎样把已经观察到的分类、动画和交互规律转化为 QCut 原创或明确授权的贴纸；
3. Sticker Lab 在扩大素材规模前，还需要补齐哪些权限、缓存、限流和真实环境验证。

本文只记录后续执行计划，不注册新 catalog、不上传素材、不修改产品行为。

## 2. 已确认的当前基线

### 2.1 本地参照库存

本地私有目录现有 17 个已验收批次：

| 指标 | 当前值 |
| --- | ---: |
| 批次数 | 17 |
| 贴纸总数 | 2,768 |
| GIF | 2,161 |
| PNG | 607 |
| 素材总字节数 | 3,996,230,670 B |
| 全局唯一资源 ID | 2,768 |
| 全局唯一预览 SHA-256 | 2,768 |

最终第 17 批目录名为 `jianying-2026-08-22-batch-17-v3`：

| 指标 | 当前值 |
| --- | ---: |
| 输出分类 | 40 |
| 常规分类 | 39 × 4 |
| `运动` 分类 | 3 |
| 本批总数 | 159 |
| GIF / PNG | 122 / 37 |
| 本批字节数 | 247,852,429 B |

第 17 批最终验收满足：

- 159/159 文件通过 MIME magic、尺寸、字节数和 SHA-256 校验；
- 159/159 manifest 条目与 downloader report 元数据一致；
- 与前 16 批资源 ID 零重复，预览 SHA-256 零重复；
- 联系表逐格检查完成；错类、整块不透明黑底及错误替换项已进入本地拒绝台账；
- manifest 和 report 不含 URL，签名 URL 临时目录已删除；
- 被淘汰的 v1、v2 候选已移入本机废纸篓，v3 是唯一有效版本。

以上数字是 2026-08-22 的冻结快照。原始 manifest、report、联系表、拒绝台账和素材文件必须继续留在仓库外；后续不得把它们复制进 fixture、测试快照或文档附件。

### 2.2 当前产品只注册前三批

`packages/editor-core/src/sticker-lab/private-catalogs.ts` 当前只注册：

- `jianying-2026-07-31`；
- `jianying-2026-08-01-batch-2`；
- `jianying-2026-08-01-batch-3`。

因此当前产品最多加载 504 个私有参照贴纸，三批合计约 829 MiB。第 4–17 批共 2,264 个贴纸没有注册到产品，也不应因为本地采集完成就自动注册或上传。

## 3. 不可突破的边界

后续所有 PR 和本地操作都必须遵守以下边界：

1. 已冻结前三批维持现有私有对象；除此之外，剪映 PNG、GIF、视频、字体、shader、包文件、提取帧、签名 URL 和原始 manifest/report 不进入 Git、安装包、任何对象存储、发布物或宣传物；
2. 参照目录只用于内部观察分类、动画、时间行为和交互，不等于获得素材再分发权；
3. 产品素材必须是 QCut 原创，或具有可核验的再分发与商业使用授权；
4. 分类归属只证明目录发现结果，不能证明实际运行时；动画等价性必须来自单贴纸、全画布、同一时间点的运行时取证；
5. 后续若恢复采集，必须使用全部 17 个最终 manifest 作为去重基线，并传入完整本地拒绝台账；
6. 任何 signed URL 只允许存在于一次下载所需的临时目录，成功或失败后都要删除；
7. 未经新的明确决定，不启动第 18 批。

## 4. P0：发布规则冲突已解决，技术收口继续

2026-08-23 已统一政策：现有前三批保持运行时现状并冻结；第 4–17 批以及以后新采集的剪映参照只允许留在仓库外本地，不上传、不注册、不转成产品目录。README 是这项政策的唯一真相源，仓库中的历史 publisher 不构成上传授权。

当前必须继续执行以下边界：

- 不发布第 4–17 批；
- 不扩展 `PRIVATE_STICKER_CATALOG_IDS`；
- 不为这些批次生成远端 object key；
- 不把本地 manifest 转换为产品 manifest；
- 不以“只有白名单用户可见”替代素材授权判断。

### 4.1 已落地的决策与边界

1. 现有前三批保留并冻结，registry 不扩展；
2. 冻结前三批是历史运行时例外；第 4–17 批及以后新增的第三方参照只允许本地观察，不能以 private bucket 或白名单替代再分发授权；
3. QCut 原创完整素材与内部参照使用独立环境变量和 entitlement；
4. 私有 entitlement 只接受显式 user ID，配置中出现任意 `*` token 都 fail-closed；
5. 两个新变量只有在未定义时才回退旧变量；显式空值不能被旧配置绕过；
6. Sticker Lab 路由的成功、重定向、参数错误、鉴权失败和上游失败响应统一 `Cache-Control: no-store`；
7. 允许进入产品目录的下一批素材必须是 clean-room QCut 原创，或具有可核验证据的再分发与商业使用授权。

### 4.2 P0 剩余完成条件

- 仓库文档、运行时行为和本地工作流继续保持一致；
- 未配置明确 entitlement 时，代码 fail-closed；
- 已加入项目的私有参照在保存、重开、撤权和导出时有明确且 fail-closed 的规则；
- 注销、账号切换和撤权会使旧 IndexedDB、object URL、MediaStore 与时间线副本失效；
- 签名接口限流和真实 Worker/private storage smoke test 完成。

### 4.3 后续批次接入路径已暂停

当前 `scripts/sticker-lab-private-catalog/prepare.ts` 要求每一批的分类数量、顺序、ID 和标签与前序批次完全一致。真实本地目录已经发生分类新增、移除、耗尽和重排：早期批次为 42 类，后续批次逐步变为 41 类和 40 类，17 批的分类并集为 43 类。因此第 4–17 批不是“加 14 个 registry ID”就能安全接入，现有 prepare 会按设计拒绝它们。

当前政策下不要为解决该兼容问题而修改 publisher。如果未来出现新的明确授权和政策例外，仍需先单独设计并测试以下一种方案：

1. 保留严格同拓扑，把不同分类世代拆成互不混合的 catalog family；或
2. 改为稀疏分类兼容：同一 category ID 的标签必须一致，但允许分类新增、缺失和重排，并为客户端规定确定性的合并顺序。

无论选哪种方案，跨批资源 ID、object key 和 SHA-256 重复仍必须 fail-closed，不能为了接入旧数据而放宽。该技术设计只有在新的明确决策允许上传后才执行；当前本地私有路线不需要修改发布器。

### 4.4 明确项目与时间线中的私有参照生命周期

当前私有卡片可以还原为 `File`，随后进入 MediaStore、项目和时间线。清除 IndexedDB 只能删除下载缓存，不能删除已经复制进项目的数据，也不能自动阻止导出。因此 P0 必须明确以下一种产品策略：

1. 私有参照只允许预览，不能加入时间线、保存或导出；或
2. 允许内部测试加入时间线，但所有派生 MediaItem 和 timeline element 都携带不可丢失的 restricted-reference 标记，保存、重开和导出必须重新验证 entitlement。

在策略确定前，默认按更严格的 preview-only 目标设计。若选择第二种，撤权后至少要做到：现有 object URL 失效、项目中的受限副本不可预览或导出、用户收到明确提示，并提供只删除受限副本而不损坏其他项目内容的恢复路径。

## 5. P1：冻结并可重复审计本地证据

这一阶段只整理本地证据，不向产品导入素材。

### 5.1 建立本地 canonical index

在仓库外生成一个不含 URL 的本地索引，至少记录：

- 17 个最终批次目录名；
- 每批 manifest/report 的 SHA-256；
- 每批分类数、GIF/PNG 数、素材字节数；
- verifier 的成功时间和错误数组；
- 联系表人工复核状态；
- 拒绝台账 SHA-256；
- 被淘汰候选的状态和可恢复位置。

不要把资源 ID 列表、绝对用户路径或素材派生图提交到仓库。Git 中只保留这种聚合后的任务说明。

### 5.2 增加本地只读总审计

审计脚本或命令应对所有最终 report 执行：

1. 批次计数等于 17；
2. report 的 `validationPassed` 全部为 `true`；
3. report 选择数等于 manifest 条目数；
4. 全局资源 ID 数等于 2,768；
5. 全局 SHA-256 数等于 2,768；
6. 所有文件都位于各自私有批次目录内；
7. manifest/report 中 URL 和签名参数命中数为 0；
8. 没有残留 `downloads-*` checkpoint 或 URL-bearing scratch。

### 5.3 P1 完成条件

- 任意一台授权开发机都能按同一流程验证本地快照；
- 审计失败会给出批次、资源和失败规则，不静默跳过；
- 审计只读，不会清缓存、修改 manifest 或重新下载素材；
- Git 工作树中不存在参照素材、联系表、原始元数据或 signed URL。

## 6. P2：把观察结果转成 clean-room 原创规格

下一项有产品价值的工作不是第 18 批，而是从 17 批参照中提炼原创规格。

### 6.1 建立分类优先级矩阵

先按用户使用价值、实现成本和风险选一个小规模 pilot。建议第一轮只覆盖 5 类，每类 10 个原创素材：

1. 指示：箭头、圈选、强调、手势；
2. 情绪：惊讶、开心、无语、生气；
3. 互动：点赞、关注、评论、提示；
4. 边框：拍立得、科技框、柔和装饰框；
5. 闪闪/炸开：星光、烟花、强调爆点。

矩阵只记录抽象能力，不复制具体角色、IP、文案、配色组合或画面构图。每个候选规格应包含：

- 功能名称与使用场景；
- 静态、循环 GIF、序列或其他运行时类型；
- 画布占比、锚点、透明区域和安全边距；
- 循环时长、帧率、入场、稳定段、退出和 seek 行为；
- 浅色、深色背景可读性；
- 原创设计约束和明确禁止模仿的元素；
- 来源、作者、授权和商业使用 provenance。

### 6.2 原创资产验收标准

每个原创贴纸至少满足：

- 视觉设计不依赖剪映素材、提取帧或描摹；
- 来源和授权字段完整；
- 透明通道正确，无整块黑底、白底或不可见主体；
- GIF 循环无末帧卡顿，任意 seek 后状态稳定；
- 单文件不超过 25 MiB；
- 单分类不超过 128 MiB；
- 单 catalog 不超过 512 MiB；
- 生成文件和 manifest SHA-256 一致；
- 联系表与至少一个真实时间线样例通过人工复核。

### 6.3 Pilot 完成条件

- 5 类 × 10 个，共 50 个原创或明确授权素材；
- 每个素材都有 provenance，不使用模糊的“AI 生成”作为授权说明；
- manifest 通过现有严格 schema、大小预算和重复校验；
- 素材进入 QCut 后可预览、加入时间线、seek、保存、重启恢复和导出；
- 未把 3.99 GB 本地参照目录复制或打包进产品。

## 7. P3：在扩容前补齐安全和缓存生命周期

### 7.1 Entitlement 与现有响应 no-store（已完成）

主要文件：

```text
packages/license-server/src/routes/sticker-lab.ts
packages/license-server/src/services/user-id-allowlist.ts
packages/license-server/src/routes/sticker-lab.test.ts
packages/license-server/src/services/user-id-allowlist.test.ts
packages/license-server/.env.example
```

2026-08-23 已完成：

1. 原创完整素材与内部第三方参照分别使用 `STICKER_LAB_ORIGINAL_ALLOWED_USER_IDS` 和 `STICKER_LAB_PRIVATE_REFERENCE_ALLOWED_USER_IDS`；
2. 私有参照使用显式 ID checker，任意 `*` token 使整份配置 fail-closed；
3. 两个新变量只有在未定义时才回退 `STICKER_LAB_ALLOWED_USER_IDS`，显式空值保持 fail-closed；
4. private asset/thumbnail 先按 `jianying/` namespace 分流并鉴权，再检查 registry；
5. signed redirect、manifest，以及现有 200/302/400/401/403/404/502 路径统一由路由级 middleware 设置 `no-store`。

测试已覆盖原创 wildcard、私有 wildcard 与混合 wildcard 拒绝、显式空值、旧配置迁移、三个私有入口、catalog oracle 和受拒请求不调用 Supabase。429 尚不存在；接入 7.3 的真实限流器后，必须补三条路由的 429、`Retry-After`、`no-store` 与 Supabase 零调用测试。

### 7.2 撤权和注销时清理缓存

主要文件：

```text
apps/web/src/lib/assets/asset-resource-cache.ts
apps/web/src/lib/stickers/local-sticker-reference.ts
apps/web/src/components/editor/media-panel/views/stickers/components/local-sticker-reference-item.tsx
apps/web/src/components/editor/media-panel/views/stickers/hooks/use-local-sticker-catalog.ts
apps/web/src/components/user-avatar.tsx
```

任务：

1. 在读取 private IndexedDB 命中项之前验证当前登录态和当前 entitlement；允许短 TTL 和 single-flight，但不能只在 cache miss 时取 token；
2. 现有 object key 已经隔离 catalog；下一步应把用户身份和 entitlement generation 纳入缓存授权元数据与定向清理条件，而不是重复增加 catalog 前缀；
3. `useLocalStickerCatalog` 必须监听账号、会话和 entitlement generation；注销、账号切换、manifest 403 或 entitlement 变化时立即清空私有目录和对应缓存，不能等待 source prop 变化；
4. 接入 `pruneAssetResourceCache`，设置明确的 Sticker Lab 总预算和 LRU 策略；
5. 遇到 `QuotaExceededError` 时先 prune，再最多重试一次；配额仍不足则显示可恢复错误，不留下半写入记录；
6. 保护当前正在预览或加入时间线的资源，正常并发加载不能被 prune 误删。

### 7.3 给签名接口增加限流

主要文件：

```text
packages/license-server/src/routes/sticker-lab.ts
packages/license-server/src/middleware/rate-limit.ts
packages/license-server/src/routes/sticker-lab.test.ts
```

任务：

1. 对 manifest、thumbnail 和原图签名分别设置合理限额；
2. 限流键至少包含用户身份和路由，不能直接复用当前 AI proxy 的 module-global `Map`；多 Worker isolate 下应使用可共享、可过期的持久限流状态；
3. 正常的分类并发加载不能被误伤；
4. 429 响应带 `Retry-After` 和可测试的重试信息，不返回存储服务正文，也不调用 Supabase；
5. 限流测试覆盖突发、窗口恢复、不同用户隔离、不同路由隔离和正常 12 卡并发。

### 7.4 清除测试中的“三批”硬编码

部分 registry、license server 和 Web 测试把当前三个 catalog 的请求次数、resolver 数量或数组长度写死。即使当前政策决定保持三批，也应让这些断言从 `PRIVATE_STICKER_CATALOG_IDS.length` 派生：

- 默认 catalog 仍固定为首批，不能因重构变化；
- 未知 catalog 使用确定不存在的测试 ID，不能永久把未来可能使用的 `batch-4` 当作 unknown；
- 在 P0 政策和分类拓扑问题解决前，生产 registry 仍必须恰好保持当前三批；
- 这项重构只移除脆弱测试假设，不构成扩容授权。

### 7.5 P3 完成条件

- 通配符配置不能意外开放第三方参照；
- 撤权后旧 IndexedDB 内容不能继续在 UI 或时间线选择器中使用，项目内受限副本也不能绕过导出策略；
- 浏览大量分类不会无限增长缓存；
- 签名接口抗重复请求，同时正常浏览没有明显退化；
- 对应单元测试和集成测试全部通过。

## 8. P4：补真实 Worker 与私有存储 smoke test

当前单元测试大量依赖 mock，不能替代真实 Cloudflare Worker 与 private Supabase 行为。至少增加一个部署后只读 smoke job，使用专用测试用户；smoke 不打印 token、signed `Location`、素材字节或存储错误正文。

生产只读 smoke 验证矩阵：

| 场景 | 预期 |
| --- | --- |
| 白名单用户逐个读取 registry 中的已知 manifest | 200、`no-store`、catalog ID 精确匹配 |
| 非白名单用户读取 private manifest | 403 |
| 无 token 请求 private manifest | 401 |
| 白名单用户请求未知 catalog | 明确返回 400，不泄露存储正文 |
| 白名单用户请求每批最小的已登记素材 | 302、`no-store`；只在内存中核对 size 和 SHA-256 |

以下破坏性或故障注入场景只在单元测试或隔离 staging 中执行，不能通过修改 production catalog 来制造：

| 场景 | 预期 |
| --- | --- |
| manifest 超过 1 MiB | 服务端拒绝 |
| 单素材 hash/size 不匹配 | 客户端拒绝且不缓存 |
| 一个测试 catalog 故障 | 其余成功 catalog 仍可展示 |
| 注销、账号切换或撤权 | 私有目录和对应缓存不可继续使用 |
| 过期测试 signed URL | 存储端拒绝 |

若故障注入需要专用 smoke catalog，必须使用 QCut 自有的极小 PNG/GIF，并通过测试环境专属 registry、依赖注入或独立 smoke Worker 暴露。它不得加入生产 `PRIVATE_STICKER_CATALOG_IDS`，否则产品客户端会自动枚举和请求它；也不得从本地参照目录复制 fixture。

## 9. P5：产品 E2E 验收

### 9.1 自动化测试

至少运行以下测试集合：

```bash
bunx vitest run \
  packages/editor-core/src/__tests__/sticker-lab-private-catalogs.test.ts \
  apps/web/src/lib/stickers/__tests__/local-sticker-manifest.test.ts \
  apps/web/src/lib/stickers/__tests__/private-sticker-catalog-set.test.ts \
  apps/web/src/lib/stickers/__tests__/local-sticker-reference.test.ts \
  apps/web/src/lib/assets/__tests__/asset-resource-cache.test.ts \
  apps/web/src/components/editor/media-panel/views/stickers/__tests__/use-local-sticker-catalog.test.tsx \
  apps/web/src/components/editor/media-panel/views/stickers/__tests__/local-sticker-reference-panel.test.tsx

bunx vitest run \
  scripts/__tests__/sticker-lab-private-catalog-prepare.test.ts \
  scripts/__tests__/sticker-lab-private-catalog-publisher.test.ts \
  scripts/__tests__/sticker-lab-private-catalog-storage-client.test.ts

(cd packages/license-server && \
  bunx vitest run --config vitest.config.ts \
    src/routes/sticker-lab.test.ts \
    src/services/user-id-allowlist.test.ts \
    src/middleware/rate-limit.test.ts)
```

License server 必须使用该 package 的独立 Vitest config；不能因为根配置未收集到测试就把“0 tests”当成通过。

### 9.2 手工时间线验证

对一个静态原创贴纸和一个动画原创贴纸分别执行：

1. 登录并打开 Sticker Lab；
2. 切换分类、搜索并等待缩略图加载；
3. 在非零播放头位置加入贴纸；
4. 确认默认持续时间、中心位置和纵横比；
5. seek 到开始前、开始帧、中间帧、循环边界、结束前和结束后；
6. 修改位置、大小、旋转、透明度和持续时间；
7. 保存项目并重启 QCut；
8. 再次核对时间线、预览和缓存行为；
9. 导出视频，检查透明通道、循环、末帧、色彩和尺寸；
10. 注销或撤销 entitlement，确认私有入口和缓存立即失效。

如果 P0 最终仍允许私有参照进入时间线，还必须使用单独的 restricted 测试项目验证：素材加入时间线并保存后撤权，重开项目时受限副本不可继续预览或导出，清理受限副本后其他轨道和媒体保持完整。

### 9.3 P5 完成条件

- 自动化测试没有跳过关键路径或依赖仅在 mock 中成立的行为；
- 静态与动画贴纸都通过真实预览、保存、重启和导出；
- 403、429、离线、过期 URL、损坏文件和配额不足均有明确可恢复反馈；
- 普通用户不会看到内部参照目录；
- 任何测试录像、截图或 fixture 都不包含剪映参照素材。

## 10. 建议的 PR 拆分

不要把政策、缓存、原创素材和 UI 改动塞进一个大 PR。建议按单一职责拆分：

### PR 1：统一政策与 entitlement 边界

- 明确现有三批的去留；
- 拆分原创和内部参照权限；
- 私有参照拒绝 `*`；
- 更新文档和 license server 测试。

### PR 2：缓存生命周期与容量回收

- 按 catalog/entitlement 分 namespace；
- 注销、撤权和 403 清理；
- 接入 LRU prune；
- 增加 IndexedDB 回归测试。

### PR 3：限流与真实 smoke

- Sticker Lab 路由限流；
- 测试 catalog 和部署后 smoke；
- 覆盖 signed redirect 与 partial failure。

### PR 4：50 个原创贴纸 pilot

- provenance 完整的原始设计；
- 生成产物、manifest 和预算校验；
- 分类、搜索、加入时间线和导出 E2E。

每个 PR 都必须保持“一项主要关注点”，并在提交前检查 staged file list，避免把并行工作的未提交文件带入 commit。

## 11. 如果以后恢复第 18 批

恢复采集不是当前任务。只有收到新的明确指令后，才执行以下步骤：

1. 重新打开剪映贴纸面板并刷新当前 catalog，不能沿用旧分类数；
2. 先无 URL 扫描，统计每类在排除 17 批和拒绝台账后的真实余量；
3. 余量不足时按真实数量设置 category override，不能为了凑整伪造数量；
4. 只有开始即时下载时才生成带 URL 的 scratch；
5. 下载到新的不存在目录，不覆盖第 17 批；
6. verifier 必须传入全部 17 个最终 baseline；
7. 创建联系表并逐格复核，错类或坏图进入永久本地拒绝台账后重跑新版本；
8. 验收后删除 URL scratch 和失败 checkpoint；
9. 新批次仍保持本地私有，不注册、不上传。

## 12. 下一位执行者应该先做什么

按顺序只做下面三件事：

1. 完成注销、账号切换、撤权和 403 时的私有缓存及项目副本失效；
2. 给 Sticker Lab 签名接口增加独立限流，并补真实 Worker/private storage 只读 smoke；
3. 从 5 类 × 10 个开始写 clean-room 原创规格和 provenance 模板。

不启动第 18 批，也不把第 4–17 批接入产品；这两项不因上述工程任务完成而自动解禁。
