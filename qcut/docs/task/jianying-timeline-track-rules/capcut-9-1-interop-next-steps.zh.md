# CapCut 9.1 草稿互操作下一步实施清单

<!-- markdownlint-disable MD013 -->

**状态：** 可执行计划  
**日期：** 2026-08-05  
**代码核验基线：** `490a48033e`  
**上位设计：** [剪映与 QCut 双向草稿兼容具体实现方案](./jianying-qcut-bidirectional-implementation-plan.zh.md)

## 1. 这一步到底要交付什么

下一阶段不以“完整复刻剪映全部草稿能力”为目标。第一项可发布里程碑应收敛为：

> 使用本机真实 CapCut 9.1 创建的受控草稿，经同一套 UI/CLI 导入链路，把视频、音频和声明支持的静态文字可靠导入 QCut；QCut 重启后项目仍完整，来源草稿未被修改，所有不支持内容都明确显示为 downgrade、opaque 或 blocked。

这个里程碑只开放 **CapCut 9.1 → QCut 单向导入**。以下能力不能混入首个 9.1 PR：

- QCut 编辑后写回原 CapCut 9.1 草稿；
- QCut 新建项目直接导出为 CapCut 9.1；
- 动态文字、多样式文字、文字模板和文字关键帧；
- 复杂调色、曲线、HSL、蒙版关键帧和混合模式；
- 未经单独验证的专有转场、滤镜、特效和资源包；
- compound/subdraft、multicam 和跨草稿引用；
- 任何加密绕过、私有 dylib 运行时调用或付费资源复制。

## 2. 当前已经具备的基础

截至代码核验基线，以下基础不需要重写：

- `DraftInteropDocumentV1`、capability、issue、provenance 和 unknown ownership 模型已经存在；
- importer 已采用 `inspect → plan → commit`，并具有计划过期、CAS consume、来源变化和重放保护；
- 资源解析已经具有 hash 优先、同名冲突、许可阻断、并发限制和 symlink/TOCTOU 防护；
- renderer 已具有 staging、readback verification、journal、rollback 和重启恢复；
- Electron UI、CLI 和 desktop inbox 已共享同一个 import bundle；
- CapCut 8.1 核心视频/音频导入已经标记为 `stable`；
- 8.1 静态单样式文字和原生 dissolve 已有导入 mapper；
- 静态文字、LUT、静态蒙版和原生 dissolve 已有部分 QCut → CapCut 8.1 导出映射；
- E2E 已有语义 diff、QCut 持久化核验、逐帧、预览帧、音频和 receipt contract；
- 10,000 片段纯数据管线测试已经存在。

当前的明确边界是：

- profile registry 只注册 synthetic plaintext 5.9 和 CapCut 8.1；
- CapCut 8.1 只有 `import: stable`，`sameProfileWriteback: none`，`realAppVerified: false`；
- 9.1 收据会被 8.1 写回验证器主动拒绝；
- import normalizer 只调用 8.1 静态文字和原生 dissolve mapper；
- filter/adjustment 仍为 opaque；
- 当前 100 GB 测试是逻辑文件清单，不是真实 100 GB 端到端导入；
- asset resolution cache 只在单次解析中使用，不是跨会话持久缓存。

## 3. 长期模块边界

### 3.1 Profile 只描述版本事实

新增的 9.1 profile 只能包含由真实样本和真实 App 行为证明的内容：

```text
packages/editor-core/src/jianying-draft/
  capcut-9-1-profile.ts              # 9.1 常量、版本和文件指纹
  profiles/capcut-9-1.ts             # capability 与 production 状态
  profiles/index.ts                  # 注册 profile
  import/profile-detection.ts        # 共享检测逻辑，禁止仅凭文件名命中
```

不要复制整份 8.1 profile 后直接改版本号。9.1 的 app metadata、schema/new_version、top-level key set、文件镜像和保存行为必须分别取证。

### 3.2 Mapper 按功能拆分

第二个真实 profile 加入后，应引入轻量 mapper registry，避免在 `normalize.ts` 中继续堆版本条件：

```text
packages/editor-core/src/jianying-draft/import/
  profile-mapper-registry.ts         # profile + feature -> mapper
  capcut-9-1-text-mapper.ts          # 只处理已验证的文字子集
  capcut-9-1-transition-mapper.ts    # 只处理已验证的转场身份
  capcut-9-1-mask-mapper.ts          # 后续独立交付
  capcut-9-1-color-mapper.ts         # 后续独立交付
  capcut-9-1-keyframe-mapper.ts      # 后续独立交付
```

共享的语义解析可以提取到无版本名称的 helper；原始字段、资源身份和验证条件仍保留在 profile mapper 中。一个 mapper 只负责一个 feature domain。

### 3.3 Runtime 不感知具体版本

以下运行时应继续消费 profile contract 和通用 bundle，不增加 `if (version === "9.1")`：

```text
packages/jianying-draft-import/src/
electron/jianying-draft-import-*.ts
electron/native-pipeline/editor/editor-handlers-jianying-import.ts
apps/web/src/hooks/import/use-jianying-draft-import.ts
apps/web/src/lib/jianying-draft/qcut-import-transaction.ts
```

只有 profile detection、raw/profile mapper 和 profile-specific evidence validator 可以知道 9.1 的具体结构。

## 4. 实施顺序

### C91-001：冻结本机 9.1 证据基线

**目标：** 先回答“本机 9.1 草稿是否仍有合法可读明文结构”，再写 parser。

使用 disposable account/store 创建以下单变量工程：

1. 空工程；
2. 单视频工程；
3. 视频加独立音频；
4. 视频加一段静态纯色文字；
5. 两段相邻视频加一个 dissolve；
6. 单视频加静态矩形或椭圆蒙版；
7. 单视频加自定义 LUT；
8. 单文字位置或透明度关键帧；
9. 单 compound/subdraft，仅用于判断文件 ownership，不进入首个 import 范围。

每个工程执行：

```text
create
  -> close
  -> inventory/hash
  -> open
  -> save
  -> close
  -> inventory/hash
  -> reopen
  -> native export
  -> final inventory/hash
```

需要记录：

- App short version、bundle version、bundle id 和 Developer ID 签名；
- 操作系统、架构、地区版本和 disposable store 标识；
- 文件相对路径、分类、尺寸和 SHA-256；
- 哪些文件是明文 JSON、opaque、encrypted、backup、active mirror 或 cache；
- 单变量操作前后的 semantic JSON diff；
- open/save/reopen 进程代际；
- 导出设置、输出媒体 SHA-256 和时长；
- 不包含绝对用户路径的脱敏 receipt。

**本地证据目录：** 放在仓库外，例如 `~/Documents/QCut-Evidence/CapCut-9.1/`。  
**允许提交：** 脱敏 manifest、无个人路径的最小 sanitized fixture、测试代码。  
**禁止提交：** CapCut 二进制、完整用户草稿、缓存资源、字体、媒体 payload、账号数据和 key store。

**完成条件：** 至少获得 empty、video、audio、static-text 四个 case 的可复现 inventory 和 open/save/reopen 结果，并明确 content 是 plaintext、opaque 还是 encrypted。

**停止条件：** 如果核心 content 只有 encrypted/opaque 版本，且不存在 App 正常生成的合法明文 backup/subdraft，则 9.1 保持 inspect-only；不得通过注入、patch 或调用私有 crypto 绕过。

### C91-002：新增 candidate profile 与严格检测

**主要文件：**

```text
packages/editor-core/src/jianying-draft/capcut-9-1-profile.ts
packages/editor-core/src/jianying-draft/profiles/capcut-9-1.ts
packages/editor-core/src/jianying-draft/profiles/index.ts
packages/editor-core/src/jianying-draft/import/profile-detection.ts
packages/editor-core/src/__tests__/capcut-9-1-profile.test.ts
packages/editor-core/src/__tests__/profile-detection.test.ts
```

初始 capability 必须保守：

```ts
capabilities: {
  inspect: "candidate",
  import: "none",
  sameProfileWriteback: "none",
  crossProfileExport: "none",
  realAppVerified: false,
}
```

检测至少组合 app metadata、schema/new_version、top-level key containment 和文件布局。9.1 与 8.1 证据冲突时返回 ambiguous，不得按最高版本猜测。

**完成条件：** exact 9.1、exact 8.1、9.1/8.1 ambiguous、缺 app metadata、错误 new_version、encrypted 和 filename-only fixtures 全部有测试；注册 profile 不自动获得写权限。

### C91-003：验证 raw graph 兼容范围

**主要文件：**

```text
packages/editor-core/src/jianying-draft/import/raw-types.ts
packages/editor-core/src/jianying-draft/import/graph-reader.ts
packages/editor-core/src/jianying-draft/import/validation.ts
packages/editor-core/src/__tests__/raw-draft-graph.test.ts
packages/editor-core/src/__tests__/raw-draft-normalize.test.ts
```

把 sanitized 9.1 fixture 送入现有 reader。只在现有 reader 无法表达必要字段时扩展 `raw-types.ts`。未知材料桶继续保持 unknown/opaque，不为追求零 warning 把未知字段加入支持范围。

重点核对：

- tracks、segments、materials 的 ID/ref 关系；
- source/target timerange 的单位和半开区间语义；
- video/audio material 的 duration、path、hash 和类型；
- extra material refs 的机械伴随项；
- root timeline、child timeline 和 compound 引用是否分离；
- 8.1 reader regression 是否保持不变。

**完成条件：** video/audio fixture 可以 deterministic normalize，重复 ID、悬空引用、非法时间和未知桶仍产生稳定 issue；无路径进入语义文档或 snapshot。

### C91-004：引入 profile mapper registry

**目标：** 支持第二个真实 profile，同时保持 normalizer 可扫描和可扩展。

**主要文件：**

```text
packages/editor-core/src/jianying-draft/import/profile-mapper-registry.ts
packages/editor-core/src/jianying-draft/import/normalize.ts
packages/editor-core/src/jianying-draft/import/index.ts
packages/editor-core/src/__tests__/profile-mapper-registry.test.ts
```

Registry 只处理纯函数选择，不读取磁盘、不访问 Electron。没有注册 mapper 的 feature 必须返回现有 downgrade/opaque/blocked 结果，不得静默跳过。

**完成条件：** 8.1 snapshot 不变；9.1 未注册 feature 明确降级；重复注册和未知 profile fail-closed；normalizer 不出现按版本扩散的大型条件分支。

### C91-005：打通 9.1 核心视频/音频导入

优先复用通用 video/audio normalization、asset resolver、bundle builder 和 renderer transaction。只有真实字段差异才进入 9.1 adapter。

验证链路：

```text
9.1 source snapshot
  -> exact profile detection
  -> raw graph validation
  -> DraftInteropDocumentV1
  -> asset resolution
  -> QCutImportBundleV1
  -> renderer staging/publish
  -> project/timeline/media readback
  -> QCut restart/reload
```

**主要测试：**

```text
packages/editor-core/src/__tests__/raw-draft-normalize.test.ts
packages/jianying-draft-import/src/__tests__/asset-resolver.test.ts
packages/jianying-draft-import/src/__tests__/import-session.test.ts
packages/jianying-draft-import/src/__tests__/import-bundle.test.ts
apps/web/src/lib/storage/__tests__/import-transaction.test.ts
```

**完成条件：** 真实 9.1 video/audio case 零 blocker 导入；媒体 SHA-256、时长、轨道类型、片段位置和项目画布通过双读；QCut 重启后再次通过；来源草稿所有文件 hash 不变。

### C91-006：增加静态单样式文字

**主要文件：**

```text
packages/editor-core/src/jianying-draft/import/capcut-9-1-text-mapper.ts
packages/editor-core/src/__tests__/capcut-9-1-text-import.test.ts
```

第一版只支持一个 style run 覆盖完整 UTF-16 文本范围，映射以下字段：

- 文本内容；
- 字体 family 与可解释 fallback；
- font size；
- fill color 和 global alpha；
- horizontal alignment；
- 静态 position、scale 和 rotation；
- 有证据时的基础 stroke/shadow。

以下情况继续 blocked：material animation、common keyframes、keyframe refs、多 style run、模板资源、逐字动画和无法解析的字体资源。

**完成条件：** sanitized fixture 单测、真实 9.1 QCut preview 截图、QCut 导出帧与 CapCut reference 的阈值比较均通过后，才从 blocked 升到 downgrade 或 exact。

### C91-007：增加已验证的原生 dissolve

**主要文件：**

```text
packages/editor-core/src/jianying-draft/import/capcut-9-1-transition-mapper.ts
packages/editor-core/src/jianying-draft/transition-validation.ts
packages/editor-core/src/__tests__/capcut-9-1-transition-import.test.ts
```

不要以标题“叠化”或 basename 判断身份。至少绑定真实 material metadata、resource id/hash、相邻片段关系和持续时间语义。无法证明是同一个原生 dissolve 时输出 unknown+downgrade。

**完成条件：** touching segments、无后继片段、超长持续时间、错误 resource identity 和真实 dissolve fixture 均有测试；转场窗口加入 E2E sample plan。

### C91-008：复用现有 UI 和 CLI

不新增另一套 9.1 命令。现有命令应直接显示检测到的 profile 和 capability：

```bash
qcut editor jianying-import inspect --draft "/path/to/draft" --json
qcut editor jianying-import plan --draft "/path/to/draft" --json
qcut editor jianying-import commit --plan-token "<token>" --accept-warning "<fingerprint>"
```

**主要文件：**

```text
electron/native-pipeline/cli/command-registry-editor-jianying-import.ts
electron/native-pipeline/editor/editor-handlers-jianying-import.ts
electron/jianying-draft-import-contract.ts
apps/web/src/hooks/import/use-jianying-draft-import.ts
apps/web/src/components/import-dialog/jianying-draft-import-card.tsx
```

UI 必须显示 profile、支持范围、blocked feature、资源状态和来源只读保证。CLI JSON 输出必须稳定，不包含绝对来源路径。

**完成条件：** UI 和 CLI 对同一目录生成相同 request/issue fingerprints；warning 未接受时均不能 commit；9.1 不支持项可见且不会被静默删除。

### C91-009：真实 App E2E 与 import capability 晋级

新增 9.1 收据生产与验证，不修改历史 8.1 收据：

```text
scripts/capcut-e2e/capcut-9-1-app-profile.ts
scripts/capcut-e2e/capcut-9-1-import-verification.ts
scripts/capcut-e2e/receipts/capcut-9.1.x-core-media-import-YYYY-MM-DD.json
scripts/capcut-e2e/receipts/capcut-9.1.x-qcut-import-verification-YYYY-MM-DD.json
scripts/__tests__/capcut-e2e-capcut-9-1-*.test.ts
```

Receipt 至少绑定：

- 精确 App 版本和签名；
- 来源 profile 和 source snapshot SHA-256；
- QCut build identity；
- document、plan、bundle 和 persisted snapshot digest；
- 媒体 SHA-256、轨道、片段、画布和 FPS；
- QCut reload 结果；
- 来源目录前后 inventory 相同；
- evidence 文件之间的 SHA-256 引用；
- `pass | fail | unverified` verdict 和明确原因。

只有 receipt 为 `pass`，并且 profile-specific 测试、typecheck 和生产构建通过后，才把 9.1 profile 改为：

```ts
capabilities: {
  inspect: "candidate",
  import: "stable",
  sameProfileWriteback: "none",
  crossProfileExport: "none",
  realAppVerified: false,
}
```

这里的 `realAppVerified` 仍保持 false，因为它要求 writeback/native-export 等更完整证据，不能由单向 import receipt 代替。

## 5. MVP 之后的功能扩展

每个功能严格执行同一流程：**单变量真实草稿 → raw diff → mapper → capability → unit test → QCut preview/export → CapCut reference 对比 → receipt → profile 晋级**。

| 顺序 | 功能 | 首个支持范围 | 主要新增文件 | 未满足时行为 |
| ---: | --- | --- | --- | --- |
| 1 | 静态蒙版 | rectangle、ellipse、静态 feather/rotation | `import/capcut-9-1-mask-mapper.ts` | opaque/blocked |
| 2 | 自定义 LUT | 已解析 cube、静态 intensity | `import/capcut-9-1-color-mapper.ts` | license-restricted/blocked |
| 3 | 富文字 | 多 style run、stroke、shadow | 扩展 `capcut-9-1-text-mapper.ts` | downgrade/blocked |
| 4 | 基础关键帧 | position、scale、rotation、opacity | `import/capcut-9-1-keyframe-mapper.ts` | blocked |
| 5 | 常见原生转场 | 每个 resource identity 独立验证 | 扩展 transition mapper/registry | unknown+downgrade |
| 6 | 调色参数 | exposure/contrast/saturation 等可逆子集 | 扩展 color mapper | opaque |
| 7 | compound/subdraft | parent/child ownership 已验证后再做 | 独立 compound mapper | opaque/blocked |

不要把上述七项放进同一个 PR。每类功能都必须有独立 capability 和独立 receipt，避免一个失败功能拖累已经稳定的核心导入。

## 6. 9.1 同版本写回的前置条件

写回是独立阶段，不是导入 MVP 的自然延伸。开始写回前必须完成：

1. 9.1 核心导入已经 stable；
2. JYR-001 保存事务有 9.1 的文件系统 trace，确认活动镜像、临时文件、fsync 和 rename 边界；
3. JYR-005 unknown sentinel 已经过真实 9.1 save/reopen；
4. JYR-006 sidecar allowlist 已按 9.1 重新取证；
5. source、timeline mirror、backup 和 subdraft ownership 已明确；
6. disposable store、App version、签名和进程代际 receipt producer 可用。

第一版 9.1 写回仍只允许受控 timing patch。删除片段、跨轨移动、替换素材、变速、文字样式、关键帧和结构变化继续 fail-closed。不要把 8.1 的四镜像假设直接复制到 9.1。

只有真实 App 完成 `open → save → quit → reopen → native export`，unknown sentinel 保留、活动镜像一致、backup 未被 QCut 越权修改、视觉/音频门禁通过后，`sameProfileWriteback` 才能从 `none` 晋级。

## 7. 测试与验收命令

### 每个核心改动的窄范围验证

```bash
bunx vitest run packages/editor-core/src/__tests__/capcut-9-1-profile.test.ts
bunx vitest run packages/editor-core/src/__tests__/profile-detection.test.ts
bunx vitest run packages/editor-core/src/__tests__/raw-draft-graph.test.ts
bunx vitest run packages/editor-core/src/__tests__/raw-draft-normalize.test.ts
bunx vitest run packages/jianying-draft-import/src/__tests__/import-session.test.ts
bunx vitest run apps/web/src/lib/storage/__tests__/import-transaction.test.ts
```

### MVP 合并前验证

```bash
bun run check-types
bun run build:web
bun run build:electron
bun run test:capcut:e2e:fixtures
```

还必须执行真实 9.1 UI/CLI 导入、QCut 重启 readback、来源 inventory 对比和 receipt validator。仅 synthetic fixture 或 Vitest 全绿不能把 profile 升为 stable。

## 8. PR 与 commit 拆分

建议使用四个连续 PR，后一个建立在前一个已合并的稳定能力上：

| PR | 范围 | 禁止混入 |
| --- | --- | --- |
| PR-A | C91-001～003：证据、candidate profile、检测、raw graph | mapper、UI、写回 |
| PR-B | C91-004～005：registry、video/audio import | 复杂文字、特效、写回 |
| PR-C | C91-006～008：静态文字、dissolve、UI/CLI | mask/LUT/keyframe、写回 |
| PR-D | C91-009：真实收据、稳定性验证、capability 晋级 | 新 feature |

Commit 默认一个关注点，文件可以独立成立时优先一个文件一个 commit。实现与不可分割的测试、共享 schema 与首个使用者、manifest 与 lockfile 可以组成最小原子 commit。Capability 晋级必须是最后一个独立 commit，便于在证据失效时单独回退。

## 9. 风险与决策门禁

| 风险 | 观察信号 | 决策 |
| --- | --- | --- |
| 9.1 核心 content encrypted | snapshot 分类为 encrypted，无合法明文副本 | 保持 inspect-only，停止 parser/writeback |
| 9.1 与 8.1 指纹重叠 | detection 只有 key set 命中 | 返回 ambiguous，补 App metadata/布局证据 |
| 资源来自私有 package | path/hash 指向 App cache 或需授权包 | license-restricted，不复制、不提交 |
| 保存会改多镜像/sidecar | open/save inventory 出现跨文件变化 | 写回保持 none，先完成 JYR-001/JYR-006 |
| 文字预览接近但导出不同 | preview frame 通过、native export frame 失败 | capability 不得 exact/stable |
| schema 随小版本变化 | 9.1.x fixture 指纹分裂 | 建立 minor-version evidence matrix，不宽泛匹配 |
| 大工程重复 hash 太慢 | hashedBytes 高、cache hit 仅单会话有效 | 单独实现跨会话内容寻址缓存，不塞进 mapper PR |

## 10. 粗略工期

以下估算假设 9.1 存在合法可读的明文核心草稿，且现有 8.1 基础可复用：

| 交付 | 单人集中开发估算 |
| --- | ---: |
| 证据基线与 candidate profile | 2～4 天 |
| 核心视频/音频导入 | 3～5 天 |
| 静态文字、dissolve、UI/CLI 回归 | 3～5 天 |
| 真实 App E2E、收据、修复和 capability 晋级 | 3～6 天 |
| **9.1 单向导入 MVP 合计** | **约 2～4 周** |
| 静态蒙版、LUT、富文字和基础关键帧 | 3～6 周 |
| 9.1 安全写回与真实往返 | 3～6 周以上 |

如果 9.1 core content 已加密，工期不能按普通 schema migration 估算；此时应把交付改为 8.1 稳定导入、9.1 inspect/blocked 诊断和用户可理解的兼容提示。

## 11. 完成定义

### CapCut 9.1 单向导入 MVP 完成

- 9.1 profile 可以 exact detection，不与 8.1 混淆；
- 真实视频、音频和声明支持的静态文字可以通过 UI 与 CLI 导入；
- UI 与 CLI 使用同一 plan/bundle/transaction；
- QCut 重启后 project、timeline、media 和来源 binding 完整；
- 来源草稿 inventory/hash 不变；
- unsupported feature 全部有稳定 issue 和可见状态；
- 没有绝对用户路径、CapCut 私有资源或敏感数据进入 Git/日志/receipt；
- 窄范围测试、typecheck、Web/Electron build 和真实 App receipt 全部通过；
- profile 仅提升 `import: stable`，写回仍保持关闭。

### 完整双向兼容完成

- 至少一个当前真实 App profile 的 same-profile writeback 为 stable；
- unknown subtree、sidecar、mirror 和 subdraft ownership 有真实证据；
- 支持的文字、调色、蒙版、关键帧和转场均有独立 mapper/capability/receipt；
- real app open/save/reopen/native export、语义 diff、逐帧、预览帧和音频比较全部通过；
- 10,000 片段和真实大素材工程达到明确阶段预算；
- 崩溃恢复、跨会话缓存、版本迁移和诊断信息可用于生产支持。

## 12. 立即执行的前五步

1. 在仓库外创建 9.1 disposable evidence store，冻结 App 版本和签名。
2. 生成 empty、video、audio、static-text 四个最小工程并完成 close/open/save/reopen inventory。
3. 根据真实指纹新增 `capcut-9-1-profile.ts` 和 candidate profile，先不开放 import。
4. 将 sanitized video/audio fixture 接入 profile detection、raw graph 和 normalize 测试。
5. 用现有 CLI 跑通 `inspect → plan`；只有 document、资源状态和 issues 符合预期后，才进入 renderer commit 和真实 QCut 导入。

这五步完成后，再决定 9.1 是正常 schema migration、需要 profile adapter，还是只能保持 inspect-only。这个决策必须由真实证据作出，不能由字段名相似度或 8.1 代码可复用程度决定。
