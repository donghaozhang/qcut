# 方案：API Keys UX —— 解释优先级并在保存被屏蔽时提示

- **Issue：** [#283 — API Keys UX: explain key source precedence and warn when saved local keys may not take effect](https://github.com/Quriosity-agent/qcut/issues/283)
- **Linear：** QUR-29
- **优先级：** 长期可维护性 > 可扩展性 > 性能 > 短期收益
- **总预估：** 约 3.5–4 小时（远超 20 分钟，下面拆成多个子任务）

---

## 1. 问题描述

API Keys 页面（Properties 面板 → API Keys 标签）允许用户粘贴并保存本地密钥，但后端是通过 **四级优先级链** 来解析某个 key 的 *生效* 值的。于是用户完全可能在 UI 里保存了一个 key，而应用在运行时却使用着另一个完全不同的 key，且看不到任何提示说明「保存被屏蔽了」。

**解析顺序（见 `electron/api-key-handler.ts:339`）：**

1. `process.env.*` —— 环境变量（优先级最高）
2. Electron `safeStorage` —— 用户在本页编辑的「app」存储
3. AICP CLI 存储 —— `~/.config/video-ai-studio/credentials.env`
4. QCut 原生 CLI 存储 —— `~/.qcut/.env`（优先级最低）

**当前 UX 的不足**（`apps/web/src/components/editor/properties-panel/api-keys-view.tsx:130`）：

- `KeySourceBadge` 展示 `env` / `app` / `cli`，但从不解释它们分别是什么、哪个胜出。
- 输入框始终可编辑，Save 始终可用 —— 没有任何信号告诉用户「这次保存对生效 key 无效」。
- 没有书面化的优先级顺序，没有按字段的屏蔽警告，保存后也没有「已保存但被覆盖」的 toast。
- 底部备注只写了「保存后请重启应用」，却没说 *什么时候这还不够*（例如 shell 里设置了环境变量）。

## 2. 目标 / 期望行为

1. **面板顶部内联的优先级说明** —— 一个可折叠区块，首次使用也能看懂。
2. **按字段的屏蔽警告** —— 当保存 / 正在输入的本地值不会是生效 key（因为更高优先级源已设置）时显示。
3. **带 tooltip 的来源徽章** —— 悬停 `env` / `app` / `cli` 徽章时解释「这就是当前生效值的来源」，而不只是个标签。
4. **保存后反馈** —— 如果用户点了 Save，而该层级处于被屏蔽状态，则以 toast / 内联警告提示：保存已持久化但未生效。
5. **解析器行为不变** —— 优先级保持原样；本次只改 UX 与状态展示。

**明确不做的事项（非目标）：**

- 不改四级优先级的顺序。
- 不自动删除环境变量或改 shell 的 rc 文件。
- 不阻止保存 —— 保存的值仍是一个合法的降级值；我们只是做解释。

## 3. 架构选择（长期支持）

| 决策 | 选择 | 备选 | 理由 |
|---|---|---|---|
| 优先级顺序的唯一事实源 | 在 `electron/api-key-handler.ts` 中以单一 `export const KEY_SOURCE_PRECEDENCE` 存在，通过 status IPC payload 再导出到渲染端 | UI 里写死顺序 | 顺序变更时 UI 自动同步；只有一处需要审计。 |
| UI 如何得知某字段被屏蔽 | 后端 `api-keys:status` 返回 `{ set, source, shadowedBy?: KeySource[] }` —— UI 不自己重建优先级 | UI 比较 env/app/cli 的存在标志 | 让后端拥有这条链；避免两个进程之间出现漂移。 |
| 被屏蔽字段的视觉处理 | 保留输入可编辑，在标签上方加一行警告 + 「Fallback value」标签 | 禁用输入框 | 禁用会让用户无法在移除环境变量之前预先准备好一个 key。可编辑 + 清晰标签契合 issue 里「clearly label it as a fallback」方案。 |
| 优先级说明组件 | 新建文件 `api-keys-precedence-info.tsx`（可折叠，懒展开） | 在 `api-keys-view.tsx` 内联 JSX | 保持 `api-keys-view.tsx` 在 CLAUDE.md 800 行上限以内；未来设置页可复用。 |
| 测试策略 | 用 Vitest 单测 status 形态 + 解析逻辑；用 React Testing Library 测 UI 状态；一个 Playwright 冒烟 | 只做 E2E | 单测能低成本抓住优先级回归；E2E 一次性验证集成。 |

## 4. 文件地图

**要修改的文件：**

- `electron/api-key-handler.ts` —— 扩展 `KeyStatus` 形态，计算 `shadowedBy`，导出优先级常量。
- `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` —— 渲染优先级说明，串接屏蔽状态，展示保存后提示。
- `apps/web/src/components/editor/properties-panel/api-key-field.tsx` —— 接收 `shadowedBy`，渲染警告行，给 `KeySourceBadge` 加 tooltip。
- `packages/platform-core/src/types/core-api.ts` —— 扩展 `PlatformApiKeysAPI` 的 status 返回类型。

**要新建的文件：**

- `apps/web/src/components/editor/properties-panel/api-keys-precedence-info.tsx` —— 可折叠的说明组件。
- `apps/web/src/components/editor/properties-panel/__tests__/api-key-field.test.tsx` —— 屏蔽 UI 状态的单测。
- `apps/web/src/components/editor/properties-panel/__tests__/api-keys-precedence-info.test.tsx` —— 说明组件的单测。
- `electron/__tests__/api-key-status.test.ts` —— `shadowedBy` 计算与优先级常量的单测。
- `apps/web/tests/e2e/api-keys-precedence.spec.ts` —— Playwright 冒烟，覆盖三种可见状态。

**只读参考：**

- `apps/web/src/components/editor/properties-panel/property-item.tsx` —— `PropertyGroup` 容器模式。
- `electron/__tests__/api-key-aicp-fallback.test.ts` —— 现有的优先级单测写法。

---

## 5. 子任务

每个子任务都可独立 review，并作为一次提交落盘。

### ST-1 · 扩展 `KeyStatus`，加入 `shadowedBy` + 导出优先级常量（约 25 分钟）

**文件：**
- `electron/api-key-handler.ts`（修改）
- `packages/platform-core/src/types/core-api.ts`（修改 —— `PlatformApiKeysAPI.status` 返回类型）

**改动：**
1. 在 `api-key-handler.ts` 顶部附近新增 `export const KEY_SOURCE_PRECEDENCE = ["environment", "electron", "aicp-cli", "qcut-env"] as const;`。`KeySource` 从它派生出来，这样将来调序只要改一行。
2. 重写 `resolveStatus`（当前位于 `api-key-handler.ts:506`），使其：
   - 对 *每一级* 都做存在性探测（而不是只找第一个非空值）。
   - 返回 `{ set, source, shadowedBy: KeySource[] }`：`source` 是有值的最高优先级层；`shadowedBy` 列出同样有值、但优先级更低的层（这些就是用户可能以为在生效、实际却没生效的那些）。
   - 特殊情况：`qcut-env` 层需要自己的存在性检测 —— 当前 `resolveStatus` 里根本没有这一层。加上它，与 `getDecryptedApiKeys` 对齐。
3. 更新 `KeyStatus` 和 `ApiKeysStatus` 的 TypeScript 接口。
4. 更新 `core-api.ts` 中 `PlatformApiKeysAPI.status` 的返回类型签名，让渲染端 TS 拿到新形态。

**为什么要先做这一步：** 下游所有 UI 子任务都依赖这个新的 status 形态。

---

### ST-2 · 为 `shadowedBy` 逻辑写单测（约 20 分钟）

**文件：**
- `electron/__tests__/api-key-status.test.ts`（新建）

**用例：**
1. `env + electron` 都有值 → `source: "environment"`，`shadowedBy: ["electron"]`。
2. `electron + aicp-cli` 都有值 → `source: "electron"`，`shadowedBy: ["aicp-cli"]`。
3. 四级全部有值 → `source: "environment"`，`shadowedBy: ["electron", "aicp-cli", "qcut-env"]`，按优先级顺序排列。
4. 只有 `qcut-env` 有值 → `source: "qcut-env"`，`shadowedBy: []`。
5. 什么都没有 → `source: "not-set"`，`shadowedBy: []`，`set: false`。
6. `KEY_SOURCE_PRECEDENCE` 数组形态 —— 做一个快照测试，保证意外调序会被抓到。

**模式：** 参考 `electron/__tests__/api-key-aicp-fallback.test.ts` —— 它直接复用解析逻辑，避免把 Electron 的 import 拖进测试环境。status 解析做法类似（把纯函数抽成可测工具函数，或直接导出）。

---

### ST-3 · 构建 `ApiKeysPrecedenceInfo` 说明组件（约 30 分钟）

**文件：**
- `apps/web/src/components/editor/properties-panel/api-keys-precedence-info.tsx`（新建）
- `apps/web/src/components/editor/properties-panel/api-keys-view.tsx`（修改 —— 挂在介绍 `<div>`（第 132 行）下方）

**组件契约：**
- 默认折叠，标题 "How API key resolution works" + 折叠箭头。
- 展开后显示带编号的优先级列表，每一级一句话说明：
  - `env` —— "Set in your shell or `.env` — highest priority."
  - `app` —— "Saved on this page via Save API Keys."
  - `cli` —— "Set by the `aicp` CLI (`~/.config/video-ai-studio/credentials.env`)."
  - `qcut-env` —— "Set via the QCut native CLI (`~/.qcut/.env`)."
- 底部备注：「The first tier with a value wins. Saving here writes to the `app` tier only.」
- 使用已有的 `PropertyGroup` / Tailwind token —— 不引入新的设计基元。
- 纯展示型，v1 不需要任何 props。

**为什么单独拆文件：** 让 `api-keys-view.tsx` 聚焦；将来 Settings 对话框里可直接复用。

---

### ST-4 · 让 `ApiKeyField` 支持 `shadowedBy`（约 40 分钟）

**文件：**
- `apps/web/src/components/editor/properties-panel/api-key-field.tsx`（修改）

**改动：**
1. 新增 props：
   ```ts
   shadowedBy?: readonly KeySource[];
   activeSource?: KeySource;
   ```
2. 当 `shadowedBy` 非空 *且* 当前输入值非空时，在描述下方渲染一行内联警告：
   > ⚠ Saved locally, but the active key comes from **{activeSource}**. This value will be used only if the {activeSource} source is removed.
3. 如果 `shadowedBy` 包含 `"electron"` 但 `activeSource !== "electron"`，在标签旁追加一个灰色的 `Fallback value` 标签，让用户一眼看到。
4. 把 `KeySourceBadge` 包进 `<Tooltip>`（已有的 `@/components/ui/tooltip`）—— 悬停即显示 ST-3 中的一行说明。
5. 保证 `testId` 保持稳定 —— 测试依赖它。

**边缘情况：** 当 `value === ""` 且更高级源已设置时，*不要* 显示警告（此时还没有任何东西能被屏蔽）。用户一旦开始输入，警告应实时出现。

---

### ST-5 · 在 `ApiKeysView` 里串接屏蔽状态 + 保存后反馈（约 25 分钟）

**文件：**
- `apps/web/src/components/editor/properties-panel/api-keys-view.tsx`（修改）

**改动：**
1. 读取 `keyStatuses[field].shadowedBy`，并传给每一个 `<ApiKeyField>`。
2. 在 `saveApiKeys` 里，status 刷新后，统计有多少已保存字段落到了被屏蔽状态（`shadowedBy` 非空 且 该字段有用户输入值）。若大于 0，通过 `@/hooks/use-toast` 弹一个 toast：
   > "Saved. N key(s) are stored but currently overridden by a higher-priority source — see the warnings above."
3. 更新底部备注（第 293 行），交叉引用说明组件：「See *How API key resolution works* above.」

**保存行为保持不变** —— 这是纯展示层的改动。

---

### ST-6 · 单测 —— `ApiKeyField` 屏蔽 UI 与说明组件（约 35 分钟）

**文件：**
- `apps/web/src/components/editor/properties-panel/__tests__/api-key-field.test.tsx`（新建）
- `apps/web/src/components/editor/properties-panel/__tests__/api-keys-precedence-info.test.tsx`（新建）

**用例（`api-key-field.test.tsx`）：**
1. 没有 `shadowedBy` → 不渲染警告行。
2. `shadowedBy=["electron"]`，`activeSource="environment"`，`value="abc"` → 渲染警告行，并包含 "environment"。
3. `value=""` 且存在 shadow → 不渲染警告行（没东西可屏蔽）。
4. `KeySourceBadge` 传入 `source="environment"` —— tooltip 触发器具备可访问名。
5. `shadowedBy` 包含 `"electron"` 且当前生效源不是 `electron` 时，渲染 `Fallback value` 标签。

**用例（`api-keys-precedence-info.test.tsx`）：**
1. 默认折叠 —— 详情内容不在 DOM 中，或 `aria-hidden`。
2. 点击 header → 展开；四个层级的标签全部可见。
3. 有且仅有一个开关（`<details>` 或带 `aria-expanded` 的按钮）—— 只有一个可交互的折叠切换。

**模式：** 参考 `apps/web/src/hooks/__tests__/use-toast.test.ts` / `routes/__tests__/login.test.tsx` —— `@testing-library/react` + Vitest。

---

### ST-7 · Playwright 冒烟测试（约 25 分钟）

**文件：**
- `apps/web/tests/e2e/api-keys-precedence.spec.ts`（新建）

**流程：**
1. 通过 `env` 注入 `FAL_KEY=test-env-value` 启动 Electron dev 构建。
2. 打开项目 → Properties 面板 → API Keys 标签。
3. 断言 FAL 字段旁出现 `env` 徽章，悬停出现 tooltip 内容。
4. 向 FAL 输入框输入新值 → 断言屏蔽警告出现，并提到 `environment`。
5. 点击 Save → 断言「overridden」toast 出现。
6. 展开优先级说明块 → 断言四级标签全部可见。

**跳过条件：** 通过一个判断来 gate：Electron 启动器能否传递环境变量（对齐现有 `remotion-preview.spec.ts` 写法）。

---

### ST-8 · 手工 QA 清单 + 文档更新（约 15 分钟）

**文件：**
- `docs/task/api-keys-precedence-ux/QA.md`（新建 —— 只是清单，非面向用户的文档）

**清单条目：**
- [ ] 没有环境变量、没有 app 存储、没有 CLI → 每个字段显示 `not set`，无警告、无徽章。
- [ ] 只有 app 存储设置 → `app` 徽章，无警告。
- [ ] env + app 同时设置 → `env` 徽章，`Fallback value` 标签，输入时出现警告。
- [ ] app + cli 同时设置 → `app` 徽章，输入时出现警告（「lower-priority `cli` tier has a value but is shadowed by `app`」 —— 或者我们决定不展示这个方向；在 ST-4 里二选一并在此记录）。
- [ ] 保存一个被屏蔽的字段 → toast 每次保存触发一次，而非每个字段触发。
- [ ] 折叠态的优先级说明在面板重新打开时保持折叠（还没有持久化展开状态 —— v1 可接受）。
- [ ] 键盘操作：说明开关可通过 Tab 到达，Enter 可展开。
- [ ] `bun lint:clean` + `bun check-types` + `bun run test` 全绿。

---

## 6. 风险与未决问题

1. **是否要对更低优先级的屏蔽也给出警告？** 例如用户在 `app` 里保存，而 `cli` 也有一个被忽略的值。当前方案：不做 —— 只在 *用户输入的值* 不会生效时警告。若用户反馈困惑，再回来重审。
2. **`resolveStatus` 当前缺少 `qcut-env`。** ST-1 会补上它 —— 当作一个潜在 bug 修复，捆绑在本次工作里。在此明确标注，让 reviewer 知道这是有意纳入范围。
3. **Electron 下的 Tooltip 行为。** 需确认 `@/components/ui/tooltip` 在面板侧边栏里不会遇到 Radix portal 的问题（应该没问题 —— properties-panel 其他地方已经在用）。
4. **Beta key 分发（issue 评论提到）。** 不在本方案范围内 —— 那是关于打包一个 key 的独立问题，与 UX 无关。

## 7. 发布

- 每个子任务各开一个 PR 会让 reviewer 频繁切换；改成一个 PR，按上面 ST 的顺序做原子提交。
- Commit 前缀约定：ST-3–5 用 `feat(api-keys): …`，ST-1 用 `refactor(api-keys): …`，ST-2/6/7 用 `test(api-keys): …`。
- 无 feature flag —— 纯 UX 改动，与现有 status payload 向后兼容（UI 容忍 `shadowedBy` 缺失）。

## 8. 完成定义（Definition of Done）

- ST-1 至 ST-8 全部合入。
- `bun lint:clean`、`bun check-types`、`bun run test`、`bun run test:e2e:bg` 全部通过。
- `QA.md` 里的手工 QA 清单签字确认。
- Issue #283 关闭，附一条简短摘要评论并链接 PR。
