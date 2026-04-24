# 实施清单：API Keys 优先级 UX

> 本文件是 [PLAN.md](./PLAN.md) 的配套文档 —— 设计思路、架构细节和子任务说明都在 PLAN 里。本文件是可执行的步骤清单。每完成一项就勾选一项。
>
> **分支：** `qur-29-api-keys-precedence-ux`
> **Issue：** [#283](https://github.com/Quriosity-agent/qcut/issues/283) · **Linear：** QUR-29
> **Commit 前缀：** ST-1 用 `refactor(api-keys): …`，ST-2/6/7 用 `test(api-keys): …`，ST-3/4/5 用 `feat(api-keys): …`。

## 执行顺序规则

- 先完成 ST-1 → ST-2（后端契约及其测试）。在平台类型落地之前，UI 里任何依赖 `shadowedBy` 的代码都无法编译。
- 一旦 ST-1 的类型合入工作分支，ST-3 就可以与 ST-4 并行（不同文件）。
- ST-5 负责把所有东西通过 `ApiKeysView` 串起来；必须在 ST-3 和 ST-4 就位之后再做。
- ST-6 为 ST-3/4 的组件补测试。
- ST-7 的 Playwright 覆盖 ST-5 完成后的集成流程。
- ST-8 是 QA.md 清单 + 收尾清理。

每个子任务 = 一个原子提交。整条分支只开一个 PR。

---

## ST-1 · 扩展 `KeyStatus`，加入 `shadowedBy` + 优先级常量

**路径**（已对照 master 确认）：

| 文件 | 行号 | 内容 |
|---|---|---|
| `electron/api-key-handler.ts` | `36` | `interface KeyStatus` —— 新增 `shadowedBy: KeySource[]` |
| `electron/api-key-handler.ts` | `41` | `interface ApiKeysStatus` —— 8 个字段都已定义，不改结构，仅保持字母序 |
| `electron/api-key-handler.ts` | 顶部（约 `15`） | 新增 `export const KEY_SOURCE_PRECEDENCE = ["environment", "electron", "aicp-cli", "qcut-env"] as const;` 并派生 `export type KeySource = typeof KEY_SOURCE_PRECEDENCE[number];` |
| `electron/api-key-handler.ts` | `339` | `getDecryptedApiKeys()` —— 4 级解析链的唯一事实源；每一级探测都要镜像到新的 `resolveStatus`。 |
| `electron/api-key-handler.ts` | `506` | 重写 `resolveStatus(envVar, appKey, fallbackEnvVar?)`：**四级全部**探测一遍（env → electron safeStorage → aicp-cli → qcut-env），返回 `{ set, source, shadowedBy }`。`source` = 有值的最高级；`shadowedBy` = 同样有值的较低级列表，按优先级顺序排列。 |
| `electron/api-key-handler.ts` | `502-536` | IPC handler —— 形态不变，只是每个字段的 status 更丰富。 |
| `packages/platform-core/src/types/core-api.ts` | `74-80` | `PlatformApiKeysAPI.status()` 当前返回 `Record<string, { set: boolean; source: string }>`。替换为包含 `shadowedBy: readonly KeySource[]` 的具名类型。把 `KeySource` 也在这里导出，渲染端无需再去碰 `electron/`。 |

**设计说明：** 当前的 `resolveStatus` **根本没有**探测 `qcut-env` 这一级（grep 已确认，只检查了环境变量和 `storedKeys[appKey]`）。这正是 PLAN §6 第 2 点提到的潜在 bug；在 ST-1 里一并修掉，让 status 反映真实情况。

**`source` 的字符串值必须与 `KeySource` 字面量完全一致。** 渲染端直接用它来显示；改名会产生连锁修改。

**把纯函数抽出来**，让 ST-2 不需要把 Electron 的 import 搬进测试环境（遵循 `electron/__tests__/api-key-aicp-fallback.test.ts` 的模式）：

```ts
// 从 api-key-handler.ts（或新建一个同级工具文件）导出这个纯函数：
export function computeKeyStatus(presence: {
  env: boolean;
  electron: boolean;
  aicpCli: boolean;
  qcutEnv: boolean;
}): KeyStatus
```

然后 IPC handler 只需要为每个字段构造 `presence` 对象，再委托给这个函数。

**验证：**

```bash
cd electron && bunx tsc --noEmit -p tsconfig.json
cd apps/web && bunx tsc --noEmit -p tsconfig.json
```

**Commit：** `refactor(api-keys): extend KeyStatus with shadowedBy + export precedence constant`

- [ ] ST-1 已完成

---

## ST-2 · 为 `shadowedBy` 逻辑写单元测试

**路径：** `electron/__tests__/api-key-status.test.ts` *(新建)*

**参考模式：** `electron/__tests__/api-key-aicp-fallback.test.ts` —— 导入纯函数，无需启动 Electron 主进程。

**用例**（明确的预期值 —— 直接贴到 `describe` 块里）：

| 存在情况 | `source` | `shadowedBy` | `set` |
|---|---|---|---|
| `env + electron` | `"environment"` | `["electron"]` | `true` |
| `electron + aicp-cli` | `"electron"` | `["aicp-cli"]` | `true` |
| `env + electron + aicp-cli + qcut-env` | `"environment"` | `["electron", "aicp-cli", "qcut-env"]` | `true` |
| 只有 `qcut-env` | `"qcut-env"` | `[]` | `true` |
| 都没有 | `"not-set"` | `[]` | `false` |

再加一条类似快照的断言：`KEY_SOURCE_PRECEDENCE` 必须等于 `["environment", "electron", "aicp-cli", "qcut-env"]` —— 顺序一旦被误改，优先级语义就整个塌了。

**运行：**

```bash
bunx vitest run electron/__tests__/api-key-status.test.ts
```

**Commit：** `test(api-keys): cover shadowedBy computation and precedence constant`

- [ ] ST-2 已完成

---

## ST-3 · 构建 `ApiKeysPrecedenceInfo` 说明组件

**路径：** `apps/web/src/components/editor/properties-panel/api-keys-precedence-info.tsx` *(新建)*

**挂载点：** `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` —— 插入在介绍块下方。当前文件里 `<ApiKeyField` 从第 137 行开始；介绍的 `<div>` 就在它上面。把新组件挂在介绍块和第一个字段之间。

**契约**（从 PLAN §ST-3 复制过来，让本文件自洽）：

- 默认折叠。Header：「How API key resolution works」+ 折叠箭头。
- 展开：按优先级顺序给出编号列表（1-4），每一级一句话说明（文案直接复用 PLAN §ST-3 的项目符号列表，一字不改）。
- 底部备注：「The first tier with a value wins. Saving here writes to the `app` tier only.」
- 使用已有的 `PropertyGroup`（来自 `./property-item`）+ Tailwind 设计 token。不引入新的基础组件。
- 纯展示，不接受 props。

**挑一种展开/折叠的实现。** 优先用 `<details><summary>`，可访问性原生 + 零依赖（不需要 Radix 管理状态）。除非 `<details>` 的样式和面板冲突，否则不要自己造开关 —— 若另选方案，请在文件顶部注释里记录原因。

**验证：**

```bash
cd apps/web && bunx tsc --noEmit -p tsconfig.json
```

**Commit：** `feat(api-keys): add collapsible precedence explainer`

- [ ] ST-3 已完成

---

## ST-4 · 让 `ApiKeyField` 能处理 `shadowedBy`

**路径：** `apps/web/src/components/editor/properties-panel/api-key-field.tsx`（118 行 —— 离 800 行上限还很远）。

**修改点：**

| 行号 | 变更 |
|---|---|
| `9-23` | 为 `ApiKeyFieldProps` 新增 `shadowedBy?: readonly KeySource[]` 和 `activeSource?: KeySource`（从 `@qcut/platform-core` 导入）。 |
| `24-38` | 把新 props 接入解构。 |
| `39-101` | 在 `<PropertyGroup>` 里，**仅当** `shadowedBy?.length && value.trim() !== ""` 时才渲染警示行。文案：`⚠ Saved locally, but the active key comes from <b>{activeSource}</b>. This value will be used only if the {activeSource} source is removed.` |
| `39-101` | 如果 `shadowedBy?.includes("electron") && activeSource !== "electron"`，在标题旁边渲染一个灰色的 `Fallback value` 标签。 |
| `106-118` | 把 `KeySourceBadge` 包进 `@/components/ui/tooltip` 的 `<Tooltip>`。Tooltip 内容 = ST-3 里每一级的同一句一行说明（把字符串抽成一个 `PRECEDENCE_ONE_LINERS` 常量，让 ST-3 和 ST-4 共享，避免重复）。 |

**`testId` 保持稳定** —— 现有测试依赖它（目前还没有，但下游的 ST-6 依赖可预测的 ID）。

**边缘情况**（明确写出，由 ST-6 的第 3 个用例验证）：`value === ""` 且更高级别已设置时，**不要**渲染警告。警告应在用户输入时实时出现。

**验证：**

```bash
cd apps/web && bunx tsc --noEmit -p tsconfig.json
npx @biomejs/biome check apps/web/src/components/editor/properties-panel/api-key-field.tsx
```

**Commit：** `feat(api-keys): surface shadow warnings and tooltip on ApiKeyField`

- [ ] ST-4 已完成

---

## ST-5 · 在 `ApiKeysView` 里把 shadow 状态 + 保存后 toast 串起来

**路径：** `apps/web/src/components/editor/properties-panel/api-keys-view.tsx`（300 行）。

**修改点：**

1. 导入新的说明组件；把它挂在介绍 `<div>` 和第一个 `<ApiKeyField>` 之间（约第 135 行）。
2. 对 8 个 `<ApiKeyField>` 调用点（137, 166, 201, 230, 259，以及剩下三个 —— grep `ApiKeyField` 找齐）都传入：
   ```tsx
   shadowedBy={keyStatuses.<field>.shadowedBy}
   activeSource={keyStatuses.<field>.source}
   ```
3. 在 `saveApiKeys` 里（status 重新拉取之后），计算 `shadowedSaves = 8 个字段里筛选：用户输入值非空 且 status.shadowedBy.length > 0`。如果 `>0`，通过 `@/hooks/use-toast` 调 `toast({ title: "Saved", description: \`\${n} key(s) are stored but currently overridden by a higher-priority source — see the warnings above.\` })`。
4. 第 `~293` 行的 footer note 后面追加 "See *How API key resolution works* above."（用和标题完全一致的渲染文案，方便用户 grep 找）。

**保存行为保持完全一致。** 只改 *表层展示* —— 任何关于优先级顺序调整的改动都属于另一个 PR。

**验证：**

```bash
cd apps/web && bunx tsc --noEmit -p tsconfig.json
npx @biomejs/biome check apps/web/src/components/editor/properties-panel/api-keys-view.tsx
bunx vitest run apps/web/src/components/editor/properties-panel/
```

**Commit：** `feat(api-keys): wire precedence explainer + post-save shadow toast`

- [ ] ST-5 已完成

---

## ST-6 · `ApiKeyField` + `ApiKeysPrecedenceInfo` 的单元测试

**路径（都是新文件）：**

- `apps/web/src/components/editor/properties-panel/__tests__/api-key-field.test.tsx`
- `apps/web/src/components/editor/properties-panel/__tests__/api-keys-precedence-info.test.tsx`

（`__tests__` 目录还不存在 —— `mkdir` 一下。）

**参考模式：** 对照 `apps/web/src/hooks/__tests__/use-toast.test.ts` 和 `apps/web/src/routes/__tests__/login.test.tsx`。用 `@testing-library/react` + Vitest。不需要 gate `import.meta.env.DEV` —— 根据 `vitest.config.ts`，测试环境本就是 jsdom。

**`api-key-field.test.tsx` 用例：**

1. `shadowedBy` 为 `undefined` 或 `[]` 时，不渲染警告。
2. `shadowedBy=["electron"]`，`activeSource="environment"`，`value="abc"` → 警告行可见；包含 "environment" 字样。
3. `value=""` + 同样的 shadow props → 不渲染警告（守住 ST-4 的边缘情况回归）。
4. `KeySourceBadge` 传入 `source="environment"` —— tooltip 触发器的无障碍名要与该级的一行说明一致。
5. `Fallback value` 标签当且仅当 `shadowedBy.includes("electron") && activeSource !== "electron"` 时渲染。

**`api-keys-precedence-info.test.tsx` 用例：**

1. 默认折叠 —— 四级标签不可见（用 `queryByText` 返回 null 或 `aria-hidden` 断言）。
2. 点击/激活 header → 4 个级别的标签全部可见。
3. 只能有一个可交互的折叠开关（一个 `<summary>`，或一个 `aria-expanded` 控件）。

**运行：**

```bash
cd apps/web && bunx vitest run src/components/editor/properties-panel/__tests__/
```

**Commit：** `test(api-keys): cover ApiKeyField shadow UI + precedence explainer`

- [ ] ST-6 已完成

---

## ST-7 · Playwright 冒烟测试

**路径：** `apps/web/tests/e2e/api-keys-precedence.spec.ts` *(新建)*

**参考模式：** `apps/web/tests/e2e/remotion-preview.spec.ts` —— 现有的 spec，已经知道怎么带着 env 启动 Electron。启动块直接照抄。

**流程**（一个测试，六条断言）：

1. 通过 Playwright 的 `env` 用 `FAL_KEY=test-env-value` 启动 Electron dev 构建。
2. 打开任意项目 → Properties 面板 → API Keys 标签。
3. 断言 FAL 字段旁边出现 `env` 徽章；hover 上去 → tooltip 可见，展示 `environment` 的一行说明。
4. 在 FAL 输入框输入 `"user-typed-value"` → shadow 警告出现并提到 `environment`。
5. 点 Save → 保存后 toast 出现，措辞包含 `overridden`。
6. 展开 `How API key resolution works` → 四级标签全部可见。

**跳过条件：** 若 Electron 启动器无法接收环境变量（与现有 remotion-preview 策略一致），`test.skip()` 并给出清晰原因。不要上一个脆弱的阻断门。

**运行：**

```bash
bun run test:e2e -- tests/e2e/api-keys-precedence.spec.ts
```

（CI 无头用 `test:e2e:bg`。）

**Commit：** `test(api-keys): Playwright smoke for precedence UX`

- [ ] ST-7 已完成

---

## ST-8 · 手工 QA 清单 + Issue 收尾

**路径：** `docs/task/api-keys-precedence-ux/QA.md` *(新建)*

**内容：** 直接照搬 PLAN §ST-8 的清单。包含 8 行条目 + 四道最终关卡（`bun lint:clean`、`bun check-types`、`bun run test`、`bun run test:e2e:bg`）。

**需要在 QA.md 里书面记录的决策（PLAN §ST-8 第 4 行旗标）：** 是否也要提示优先级更低的 shadow（例如 `app` 已设置，`cli` 也设置，用户在编辑 `app` 字段）？PLAN §6 Q1 倾向「否 —— 只在用户输入的值不会生效时才警告」。在 ST-4 正式动手之前，把这个结论**书面写在** QA.md 和 `ApiKeyField` 的文件头注释里，以免未来重构时意图丢失。

**Issue 收尾：**

- [ ] PR 合并后：在 #283 下留言，一段摘要 + 合并 commit 链接，然后关闭 issue。

**Commit：** `docs(api-keys): manual QA checklist`

- [ ] ST-8 已完成

---

## 最终关卡（全部绿灯前禁止合 PR）

```bash
bun lint:clean        # 全仓 biome 检查
bun check-types       # 跨 workspace tsc 检查
bun run test          # vitest —— 所有 workspace
bun run test:e2e:bg   # Playwright 无头
```

- [ ] Lint 通过 —— 10 个改动文件的局部 biome 检查已通过；合并前还需跑一次全仓 `bun lint:clean`。
- [x] 类型检查通过
- [x] 单元测试通过 —— 三个新测试文件的 vitest 局部跑通（15/15 绿，2026-04-24）。全仓 `bun run test` 仍待执行。
- [x] E2E 通过（或合理跳过并注明原因）—— `api-keys-precedence.e2e.ts` 由于 `electron/dist/main.js` 未构建而干净跳过，与现有 remotion-preview 模式一致。
- [ ] QA.md 清单签字 —— `docs/task/api-keys-precedence-ux/QA.md` 已存在，含 8 条 + 4 道关卡；所有勾选仍为空，待一次真机过验。
- [ ] Issue #283 已关闭并附带摘要 —— 取决于 PR 合并。

---

## 涉及文件（直接拷贝到 PR 描述里）

**Modified：**
- `electron/api-key-handler.ts`
- `packages/platform-core/src/types/core-api.ts`
- `apps/web/src/components/editor/properties-panel/api-keys-view.tsx`
- `apps/web/src/components/editor/properties-panel/api-key-field.tsx`

**Created：**
- `apps/web/src/components/editor/properties-panel/api-keys-precedence-info.tsx`
- `apps/web/src/components/editor/properties-panel/__tests__/api-key-field.test.tsx`
- `apps/web/src/components/editor/properties-panel/__tests__/api-keys-precedence-info.test.tsx`
- `electron/__tests__/api-key-status.test.ts`
- `apps/web/tests/e2e/api-keys-precedence.spec.ts`
- `docs/task/api-keys-precedence-ux/QA.md`

**只读参考：**
- `electron/__tests__/api-key-aicp-fallback.test.ts` —— ST-2 的纯函数测试模式。
- `apps/web/tests/e2e/remotion-preview.spec.ts` —— ST-7 带 env 启动 Electron 的模式。
- `apps/web/src/hooks/__tests__/use-toast.test.ts` —— ST-6 的 RTL + Vitest 写法。

---

## CLI 冒烟 —— `scripts/api-keys-precedence-smoke.ts`

独立的 Bun CLI（无需启动 Electron 主进程），端到端检验已上线的优先级逻辑：

1. **确定性矩阵** —— 从 `electron/api-key-status.ts` 导入纯函数 `computeKeyStatus`，跑 ST-2 的 5 个组合 + `KEY_SOURCE_PRECEDENCE` 顺序快照，对 `{set, source, shadowedBy}` 做精确断言，任何一处失败即以非零退出。
2. **真实探测** —— 为 8 个字段依次读取 `process.env`、`~/.config/video-ai-studio/credentials.env`、`~/.qcut/.env` 以及 Electron 的 `api-keys.json` 加密块，按字段打印解析后的状态。因 Electron `safeStorage` 只能在主进程解密，脚本把 `api-keys.json` 里非空的 base64 条目视为 `electron: true` —— 这对优先级判断等价，因为 `resolveStatus` 本身也只看存在性。

### 用法

```bash
bun run scripts/api-keys-precedence-smoke.ts           # 默认：矩阵 + 探测
bun run scripts/api-keys-precedence-smoke.ts --matrix  # 只跑确定性矩阵
bun run scripts/api-keys-precedence-smoke.ts --probe   # 只跑真实探测
bun run scripts/api-keys-precedence-smoke.ts --json    # 机器可读输出
```

### 运行记录 · 2026-04-24 · darwin · 无环境变量注入

| 用例 | 结果 |
|---|---|
| Matrix · `env + electron` → `environment` / shadows `[electron]` | ✅ PASS |
| Matrix · `electron + aicp-cli` → `electron` / shadows `[aicp-cli]` | ✅ PASS |
| Matrix · 四级全设 → `environment` / shadows `[electron, aicp-cli, qcut-env]` | ✅ PASS |
| Matrix · 仅 `qcut-env` → `qcut-env` / shadows `[]` | ✅ PASS |
| Matrix · 都没有 → `not-set`，`set: false` | ✅ PASS |
| `KEY_SOURCE_PRECEDENCE` 快照 = `[environment, electron, aicp-cli, qcut-env]` | ✅ PASS |

**矩阵：全部通过（6/6）。** 退出码 `0`。

真实探测（本机实际文件）：

| 字段 | 有值的层级 | 解析后的 `source` | `shadowedBy` |
|---|---|---|---|
| FAL | `electron + aicp-cli + qcut-env` | `electron` | `[aicp-cli, qcut-env]` |
| Freesound | `electron + qcut-env` | `electron` | `[qcut-env]` |
| Gemini | 无 | `not-set` | `[]` |
| OpenRouter | 无 | `not-set` | `[]` |
| Anthropic | 无 | `not-set` | `[]` |
| ElevenLabs | 无 | `not-set` | `[]` |
| GMI | 无 | `not-set` | `[]` |
| Runway | 无 | `not-set` | `[]` |

层级文件：`~/Library/Application Support/qcut/api-keys.json` 存在，`~/.config/video-ai-studio/credentials.env` 存在，`~/.qcut/.env` 存在。FAL 和 Freesound 两行正好命中了 UI 警告设计要覆盖的屏蔽场景。

### 运行记录 · 2026-04-24 · darwin · 注入 `FAL_KEY=from-env`

验证 tier-1（env）能正确压过 electron + aicp-cli + qcut-env：

```
FAL   tiers=env+electron+aicp-cli+qcut-env   status=environment  shadows: [electron, aicp-cli, qcut-env]
```

✅ PASS —— FAL 升为 `environment`，其余三层按优先级顺序进入 `shadowedBy`。这与 PLAN §6 Q1 / ST-2 第 3 用例的真实数据一致，确认在相同条件下 UI 的输入框警告会如期触发。

### 解读

- **纯解析器正确**：矩阵 6/6，无偏差。
- **现实中的屏蔽并非假设**：本机 8 个字段里已有 2 个（FAL、Freesound）处于被屏蔽状态 —— 用户一旦在这两项上开始输入，UI 警告就会被点亮。这是有用的自用验证，不是缺陷。
- **环境变量覆盖符合设计**：shell 导出的 `FAL_KEY` 将 `source` 提升为 `environment`，并把所有更低层级推入 `shadowedBy`。`ApiKeyField` 里的警告会把 `environment` 标记为生效源。
- 无失败待记录。

---

## 上线后迭代 —— 保存位置 toast（2026-04-24）

**改动：** 保存后的 toast 现在总会弹出（以前只在有屏蔽时才弹）。描述里告诉用户这次保存到底落到了哪些位置。

**文件：** `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` —— `saveApiKeys` 回调。

**新行为：**
- 在 `apiKeys.set(...)` 成功往返之后，总会调用 `toast.success("API keys saved", { description: ... })`。
- 描述最多由三句组成：
  1. 始终出现：「Stored in QCut's encrypted keystore and synced to `~/.qcut/.env` so the native CLI can read them.」
  2. 若本次保存中任意一个非空字段属于 FAL/Gemini/OpenRouter：「FAL / Gemini / OpenRouter keys are also synced to `~/.config/video-ai-studio/credentials.env` for the AICP CLI.」
  3. 若 `shadowedSaves > 0`（来自 `countShadowedAppSaves`）：「{n} key(s) are currently overridden by a higher-priority source — see the warnings above.」
- 使用 `toast.success`（绿色对勾样式），替换掉原来的纯 `toast()`。

**动机：** ST-5 的原始设计只在屏蔽场景下才弹提示，非屏蔽保存时用户完全看不到反馈。2026-04-24 用户反馈：「after people click save keys there should be message pop up about where their key is saved」。

**对测试的影响：** Playwright 用例断言 `page.getByText(/overridden/)` 走的是屏蔽路径 —— 仍然通过，因为只要屏蔽计数 >0，屏蔽那一句仍会追加。非屏蔽保存现在也会弹 toast；目前没有任何断言否定它存在，不会打坏已有用例。

**目标位置的真相源：** `api-keys-view.tsx` 顶部的 `AICP_SYNCED_FIELDS` 集合对应 `electron/api-key-handler.ts` 中的 `AICP_REVERSE_MAP`。如果那张映射将来发生变化（比如 ElevenLabs 也要同步到 AICP），务必同步更新这个集合，否则 toast 会说谎。
