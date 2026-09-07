# PR #465 评审收尾（合并后待办）

记录时间：2026-09-06。

## 背景

[PR #465](https://github.com/Quriosity-agent/qcut/pull/465)（`feat: add independent Metal filters and durable Compose workflows`，
219 个文件、+26589/-297）已于 2026-09-06 10:01 UTC 合并，合并提交 `a089daf9f`，
`master` 随后发布为 `v2026.09.06.2`。分支 `timeline-fixed` 保留（本地实现分支为
`timeline-fixed-prfix`，两者内容一致）。

合并发生在评审收尾之前。CodeRabbit 留下 25 条行内评论，其中 1 条（`color-preview-canvas.tsx`）
在合并前已解决并标记 outdated，其余 24 条逐条评估完毕，但**改动一行都没有落地**：
执行阶段的 agent 全部因会话额度耗尽中断，工作区保持干净。

因此本目录记录的是**合并后仍然待办的工作**，基线是 `master`，不是 PR 分支。

## 结论总表

| 结论 | 条数 | 说明 |
| --- | --- | --- |
| 待修（FIX） | 13 | 已有可直接落地的补丁方案，未应用 |
| 驳回（NOT_APPLICABLE） | 11 | 已核对代码，评论主张不成立或不适用 |

评估方法：每条评论一个只读评估 agent，再由两个独立怀疑视角（正确性、范围与规范）复核，
意见不一致时由第三方裁决。其中 3 条（`3943098763`、`3943098765`、`3943205593`）的裁决 agent
因额度中断未跑完，落地前需要人工再确认一次，见下表标注。

**基线仍然有效**：13 项待修所涉及的目标文件在 `master` 与 PR head `c8ac87f13` 之间逐字节相同，
下列补丁方案可直接对 `master` 应用。

## 一、待修（13 项）

### 1. 独立 Metal 测试套件在 CI 里从未真正执行 · `3943098750`

四个真实 Metal 套件用 `describe.skipIf(process.platform !== "darwin" || process.env.QCUT_INDEPENDENT_METAL_TEST !== "1")` 注册，
而 CI 从不设置该环境变量，macOS job 日志显示 6 个用例始终 skipped。
本 PR 新增的原生渲染路径因此没有被 `bunx vitest run electron/__tests__/` 这道硬门禁覆盖。

改法：换成仓库已有的 macOS-only 写法（见 `person-cutout-metal-matting-blend.test.ts`），
即 `const describeOnMac = process.platform === "darwin" ? describe : describe.skip;`，
每个文件只动两行，套件主体不变。

- `electron/__tests__/qcut-independent-lut.test.ts`
- `electron/__tests__/qcut-hybrid-dual-native.test.ts`
- `electron/__tests__/qcut-hybrid-sharpen.test.ts`
- `electron/__tests__/qcut-independent-graph-native.test.ts`

**不要动** `electron/__tests__/qcut-independent-filter-native.test.ts`：它依赖本机私有剪映缓存里的
SHA 固定 Fog LUT，GitHub runner 上不可能存在，provenance 门禁也禁止提交该文件。

验证：

```bash
bunx vitest run electron/__tests__/qcut-independent-lut.test.ts electron/__tests__/qcut-hybrid-dual-native.test.ts electron/__tests__/qcut-hybrid-sharpen.test.ts electron/__tests__/qcut-independent-graph-native.test.ts
```

### 2. Compose 快照未接收 AbortSignal · `3943098755`

`handleComposeEditorProject` 拿到了 `signal` 并传给 `waitForActiveProject` / `build` / `apply` /
`reopenAndVerify`，唯独 `dependencies.capture(...)` 没传，而 `captureComposeSnapshot` 本身接受
`signal?: AbortSignal`；`discoverComposeGeneratedMedia` 更是完全没有该参数。
兄弟 handler `cli-handlers-compose-editor.ts` 已经传了，属于遗漏而非设计选择。
后果：Ctrl-C 在快照步骤上不会立即停下。

改法：`capture` 调用补 `signal`；`discoverComposeGeneratedMedia` 增加可选 `signal` 参数，
在状态请求前后各做一次 `signal?.throwIfAborted()`（`client.get` 自身不接受 abort 选项）；
`compose-snapshot.ts` 的 `.catch` 里先 `signal?.throwIfAborted()` 再降级为 warning，
避免取消被吞成「discovery unavailable」。

- `electron/native-pipeline/cli/cli-handlers-compose-project.ts`
- `electron/native-pipeline/compose/compose-generated-media.ts`
- `electron/native-pipeline/compose/compose-snapshot.ts`
- 测试：`electron/__tests__/cli-handlers-compose-project.test.ts`、`electron/native-pipeline/compose/__tests__/compose-snapshot.test.ts`

### 3. 目录缓存在并发刷新下会被过期请求清空 · `3943098763`（裁决未完成）

`lut-catalog.ts` 的模块级 `cached` promise 在 `.catch` 里无条件执行 `cached = undefined`。
若请求 A 在飞行中，一个 `refresh: true` 的请求 B 覆盖了 `cached`，随后 A 才失败，
B（可能已成功）会被一并驱逐。渲染进程经 `ipc.ts` 就会传 `refresh: true`，路径可达。

改法：把新建的 promise 先存入局部 `pending`，`.catch` 里改成 `if (cached === pending) cached = undefined;`。
`pending` 需要显式类型标注 `Promise<JianyingFilterCatalogExport>`，否则 TS7022（自引用推导为 any）。
配套在 `qcut-independent-lut.test.ts` 加一条「旧请求晚失败不影响新刷新」的用例。

- `electron/qcut-independent-filter/lut-catalog.ts`
- `electron/__tests__/qcut-independent-lut.test.ts`

### 4. `insert-media-clip` 不校验 assetId · `3943098764`

`validateInsertMediaClip` 检查了 `asset` 是对象、`assetType` 合法，却从不看 `assetId`。
仓库已有 `validateAssetReference`（空串/空白即 `invalid-asset-reference`），
且 filter step、add-sticker、add-sound-effect、text/caption 都调用了它，唯独这里漏掉。
后果：空白 assetId 通过校验，直到 apply 阶段才以运行时异常暴露。

改法：在 `assetType` 校验之后调用 `validateAssetReference`。
`electron/native-pipeline/compose/compose-protocol.ts` 是同一份校验的镜像，必须同步改，
否则镜像一致性测试会失败。

- `packages/editor-core/src/compose/compose-validation.ts`
- `electron/native-pipeline/compose/compose-protocol.ts`
- 测试：`packages/editor-core/src/__tests__/compose-protocol.test.ts`、`electron/__tests__/compose-protocol-mirror.test.ts`

### 5. license-server 用黑名单过滤私有字段 · `3943098765`（裁决未完成）

`packages/license-server/src/routes/compose.ts` 直接把 `body.snapshot` / `body.intent`
原样组成 `input`，只拒绝 `availableResources` 里带 `localPath || cacheKey || provenance` 的条目，
然后整体 `JSON.stringify` 落库到 `compose_jobs.input`。
`validateComposeSnapshot` 只校验取值范围，从不拒绝未知键。
这是公开路由，客户端多塞的任何字段（含本机路径）都会进云端数据库。

改法：改成白名单投影。新增 `packages/editor-core/src/compose/compose-portable-snapshot.ts`
导出 `portableComposeSnapshot`，只保留协议共享字段（project/media/captions/beats/shots/capabilities 的显式字段），
在入库和计算哈希之前做一次投影。

- 新增 `packages/editor-core/src/compose/compose-portable-snapshot.ts`，在 `compose/index.ts` 导出
- `packages/license-server/src/routes/compose.ts`
- 测试：`packages/editor-core/src/__tests__/compose-protocol.test.ts`、`packages/license-server/src/routes/compose.test.ts`

这一项改动面最大（约 7.6k 字符的方案），且裁决 agent 未跑完，建议单独一个提交并先跑
`cd packages/license-server && bunx vitest run --config vitest.config.ts src/routes/compose.test.ts`。

### 6. compose-worker 用尾递归轮询 · `3943098767`

`scripts/compose-worker.ts` 的 `work()` 以 `return work();` 结束。
async 函数中用 pending promise 兑现上一层 promise，会让每轮迭代永久留下一个 pending promise
和一条 reaction 记录，挂在 `main` 里那次 `await work()` 的链上，直到进程退出才释放。
长跑 worker 的内存因此单调增长。

改法：函数体套 `while (true) { ... }`，删掉末尾的 `return work();`。

### 7. 审计脚本没挡住符号链接包根 · `3943205592`

`scripts/audit-independent-filter-backlog.ts` 用 `(await stat(path)).isDirectory()` 选包根，
之后 `readdir(root, { recursive: true })` 只对**条目**判符号链接。
实测（Node 22 / Bun 1.3）`stat(link).isDirectory()` 为 true、`lstat` 为 false，
且 recursive readdir 返回链接目标内容而不标记根本身，作者原本想要的符号链接防护被绕过。

改法：该处 `stat` 换 `lstat`（从 `node:fs/promises` 增加导入，Biome 80 列会把导入拆成多行）。
保留 `stat` 导入，第 71 行仍用它取 LUT 文件大小。

### 8. FFprobe 调用没有超时 · `3943308345`

`scripts/jianying-filter-parity/hybrid-motion-fixture.ts` 第 17 行的 `execFile` 不带 options，
而同一函数里的 FFmpeg 调用带 `{ encoding: "buffer", maxBuffer: 100MB, timeout: 120_000 }`。
`source` 是 `--video` 直接透传的用户路径，ffprobe 接受 URL/FIFO/网络挂载，卡住即永久挂起。

改法：补 `{ timeout: 120_000 }`（Biome 会把参数展开成多行）。
不要动 `real-video-sequence.ts`，那是 PR 之外的既有代码。

### 9 与 10. verify 脚本依赖 cwd 解析 CLI 入口 · `3943098769`、`3943205593`（后者裁决未完成）

两个脚本都用字面量 `"electron/native-pipeline/cli/cli.ts"` 拼 `execFile` 参数，
Bun 按 process.cwd() 解析。在 `qcut/` 之外运行会 `Module not found`：
`verify-independent-filter.ts` 首次调用即中止；
`verify-independent-graph-video.ts` 更隐蔽，错误落进 per-profile 的 try/catch，
每个 graph 记成 `success:false` 写进 video-evidence.json，退出码 1 但原因具有误导性。

改法：两个文件都在 `const exec = promisify(execFile);` 之后加

```ts
const cliEntry = resolve(
	import.meta.dir,
	"../electron/native-pipeline/cli/cli.ts"
);
```

再把参数里的字面量换成 `cliEntry`。`resolve` 两个文件都已从 `node:path` 导入，无需新增 import。

- `scripts/verify-independent-filter.ts`
- `scripts/verify-independent-graph-video.ts`

### 11. batch.json 检查点并发写入 · `3943098779`

`scripts/verify-independent-lut-batch.ts` 以 `limit: 2` 跑 `mapWithConcurrency`，
每个任务先 `results.push(...)`，再 `await session?.dispose()`，之后才读 `results.length` 判断检查点。
两条泳道会观察到同一个长度（尤其最后两张卡），同时对 `batch.json` 发起 writeFile，互相截断。

改法：模块级加 `let checkpoint: Promise<void> = Promise.resolve();`，
把 payload 在入队时同步序列化，然后 `checkpoint = checkpoint.then(() => writeFile(...)); await checkpoint;`。
注意 `checkpoint` 必须在模块作用域，放进任务闭包里串不起来（CodeRabbit 的建议在这一点上是错的）。

### 12 与 13. 研究文档里的本机绝对路径 · `3943205588`、`3943098743`

五个文档共 5 处 `/Users/<用户名>/Downloads/...` 与 `/Volumes/<卷名>/...`：

| 文件 | 行 |
| --- | --- |
| `docs/task/jianying-filter-runtime-research/independent-complex-batch2-2026-09-06.zh.md` | 59 |
| `docs/task/jianying-filter-runtime-research/independent-complex-batch3-2026-09-06.zh.md` | 43 |
| `docs/task/jianying-filter-runtime-research/independent-complex-migration-2026-09-06.zh.md` | 47 |
| `docs/task/jianying-filter-runtime-research/independent-filter-product-2026-09-06.zh.md` | 84 |
| `docs/task/jianying-filter-runtime-research/independent-fog-chain-2026-09-06.zh.md` | 50 |

改法：换成 `$EVIDENCE_ROOT` 或 `<仓库外证据根目录>` 占位符，保留中性目录名与「不入 Git」说明，
使证据仍可定位。**保留** `$HOME/Library/Application Support/QCut/...` 形式的可移植复现路径
（batch2:112、batch3:94-95、fog-chain:150/204），它们不含用户名。

> 这 5 处只是冰山一角。全量扫描发现同类内容在 `master` 上共 61 处、26 个文件，
> 另有私有运行时 UUID、私有包 SHA-256 和逆向偏移地址。详见
> [私有信息审计](private-detail-audit.zh-CN.md)。

## 二、驳回（11 项）

已逐条核对源码，结论是评论主张不成立或不适用。记录在此以免重复讨论。

| 评论 | 位置 | 驳回理由（摘要） |
| --- | --- | --- |
| `3943098725` | `independent-lut-library.tsx:156` | 无 `version` 的卡片到不了该组件：`selectIndependentCatalog` 的三条准入路径都要求 version，合成的 fog 卡另有客户端过滤。加 disabled 是死代码。 |
| `3943098739` | `independent-complex-backlog-2026-09-06.md:14` | `旧目录可用` / `声明依赖`（blit、skin_seg 等）是通用能力元数据，不是私有目录内容；`master` 上已有同样的「资源 ID + 依赖」配对，且 `qcut-independent-invariant.test.ts` 就固化了同一组值。 |
| `3943098744` | `independent-filter-product-2026-09-06.zh.md:3` | `timeline-fixed-prfix` 是真实的本地实现分支名，不是笔误；七个兄弟文档记录一致，`hybrid-dual-lut-batch` 已写明它到 `timeline-fixed` 的映射。 |
| `3943098746` | `independent-fog-chain-2026-09-06.zh.md:71` | 该段属于 README 与 FLP-008 明确允许的 QCut 自撰研究文字，provenance 门禁刻意不做符号内容启发式判断。（注意：这条驳回只针对该处的**行为描述**；同类的 UUID／偏移地址是否继续公开，见私有信息审计。） |
| `3943308340` | `qcut-hybrid-dual-native.test.ts:120` | 现象属实但提案会打断硬门禁：`qcut-independent-filter-native.test.ts` 需要 runner 上不可能存在的私有 Fog LUT，其余套件会在测试期用 `-Werror` 编译 host.mm 并要求 Metal 设备。改用平台门（见待修第 1 项）。 |
| `3943308343` | `qcut-hybrid-sharpen.test.ts:21` | 仓库不存在「禁用位运算」的约定：`biome.jsonc` 无此规则，CLAUDE.md 与规范文档均未提及。该 fixture 有意按位分解 2×2×2 立方索引，三个兄弟 fixture 用同一写法。 |
| `3943098756` | `cli-handlers-filter-lab-independent.ts:106` | 两个分支进入前已被 `supportsIndependentGraph` / `loadIndependentCube` 保证 version 非空；`noNonNullAssertion` 在 `biome.jsonc` 里是关闭的。 |
| `3943098758` | `compose-model-resource-operations.ts:123` | 云模型 sanitizer 有意只认快照目标：`sanitizeBase` 会重铸所有 operation id，放行 pending 目标会产出 sanitize 后不存在的 id，反而被 `validateComposePatch` 拒绝。pending-clip 契约由 `compose-manifest-to-patch.ts` 消费。 |
| `3943098760` | `qcut-compose-provider.ts:54` | 路径不可达：`createQueuedComposeProvider` 在 `remoteTaskId` 缺失时先抛「未提交」或直接跳过 cancel；qcut provider 的 `remoteTaskId` 恒等于 `job.id`。 |
| `3943342274` | `audit-independent-filter-backlog.ts:26` | `otherRendererCount` 并非恒为 0：CPU soft-glow 卡经 `isSoftGlowIdentity` 进入目录但不属于 metalCards，值为 1，正是文档记录的「831 = 830 Metal + 1 CPU」。按建议改会得到 62（未迁移积压），语义错位。 |
| `3943308349` | `hybrid-motion-fixture.ts:75` | 唯一消费者对原生 oracle 与 Metal session 传入同一 `frame.time`，两侧都只把 `timestampSeconds` 当单调 seek 游标而非时域参数；标称时间由 `select=between` + `-fps_mode passthrough` 保证严格递增。 |

## 三、如何续跑

评论导出与任务文件（未入 Git，`.gitignore` 已排除 `docs/pr-comments/`）：

```bash
bash .claude/skills/pr-comments/scripts/export.sh Quriosity-agent/qcut 465
bash .claude/skills/pr-comments/scripts/batch-preprocess.sh docs/pr-comments/pr-465
```

配套修了一处 skill bug（提交 `b6239ca2d`，尚未推送）：新版 CodeRabbit 评论会把
`<details>` 静态分析块放在正文**之前**，原 `preprocess.sh` 在第一个 `<details>` 处截断，
导致任务文件只剩标题、正文全丢。现改为整块删除所有 `<details>` 区间再清 HTML 注释。

落地顺序建议：先做第 12/13 项与私有信息审计（公开仓库、已发版），再做 2/4/5 三项 Compose
正确性问题，最后是脚本与测试门禁类。每个文件一个提交，推送前跑：

```bash
bunx @biomejs/biome check <改动的 ts 文件> && bun check-types
```

线程未解决：24 条评论对应的 GitHub 线程都还开着。修完后用
`bash .claude/skills/pr-comments/scripts/resolve-thread.sh Quriosity-agent/qcut 465 <comment-id> <task-file>` 关闭；
驳回的 11 条不要 resolve，应在线程里回复理由（理由已在上表）。
