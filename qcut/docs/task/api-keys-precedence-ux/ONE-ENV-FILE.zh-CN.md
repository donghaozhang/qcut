# 设计讨论：能否将 QCut 基于文件的两个凭据库合并为一份

- **状态：** 设计 / 讨论 —— 不是实施方案。
- **关联文档：** [TWO-ENV-FILES.md](./TWO-ENV-FILES.md)（今日"两份文件"现状）、[PLAN.md](./PLAN.md)（优先级 UX，issue #283）、[IMPLEMENTATION.md](./IMPLEMENTATION.md)。
- **优先级：** 长期可维护性 > 可扩展性 > 性能 > 短期收益。
- **一句话结论（TL;DR）：** 目前 QCut 的 GUI 会一次写入三个目标 —— Electron 的加密存储，再加上**两份**明文 env 文件（`~/.config/video-ai-studio/credentials.env` 给 AICP、`~/.qcut/.env` 给原生 pipeline CLI）。本文讨论是否值得把这两份 env 文件合并为一份，以及 —— 如果合并 —— 哪种策略（symlink、shim、fork、wrapper）在长期维护上最划算。

---

## 1. 动机 —— 为什么现在重新审视这个拆分

今天的设计已经记录在 [TWO-ENV-FILES.md §1.3](./TWO-ENV-FILES.md)，是**有意为之**（三条结构性理由：词汇表不同、独立运行的契约、AICP 属于外部）。但依然值得重新审视，理由如下：

1. **重复本身是一个正确性风险。** `syncToAicpCredentials`（[`electron/api-key-handler.ts:211-251`](../../../electron/api-key-handler.ts)）和 `syncToQcutEnv`（[`electron/api-key-handler.ts:259-274`](../../../electron/api-key-handler.ts)）是两条独立写路径。一旦其中一条静默失败（两者目前都只是 `console.warn` 并吞掉错误），两份文件就会分叉 —— 此时 4 层优先级链会取 **AICP** 那一侧的值，并打上用户从未要求过的 `shadowedBy: [qcut-env]` 标签。
2. **优先级链的复杂度对用户是可见的。** PR #285 的 UX 工作存在的本身，就是因为 4 层链让人困惑。tier 3 vs tier 4 是四层里最难为之辩护的一层区分 —— 两者都是放在 home 目录下的明文 env 文件，且 key 集合存在重叠。把它们合为一层，能把心智模型从"key 存在哪儿？"（4 个答案）简化为更干净的 3 层链。
3. **key 集合会越来越发散。** AICP 支持 3 个 key，原生 CLI 支持 15 个（见 [`electron/native-pipeline/infra/key-manager.ts:14-30`](../../../electron/native-pipeline/infra/key-manager.ts) 的 `KEY_NAMES`）。每加一家新 provider（参考近期提交 `67e7064e6`、`9190fbd8f` 里加的 GPT-Image-2 / GMI）都会扩大这个差距，并在文档里再多一个 "AICP 看不见这个字段" 的脚注。
4. **文档负担。** 长期维护 TWO-ENV-FILES.md、`api-key-handler.ts` 里的行内注释、UI 上每层的徽章 —— 不合并就永远背着这笔。
5. **磁盘占用很小，但认知占用不小。** 两份文件、两条路径（Windows + Unix）、两套所有权模型。单份文件在 `.gitignore`、备份、迁移和写文档时都更轻。

**反动机（也要摆上桌面）：** 当前设计**能工作**。三写成本很低，status 面板已经能报告 shadow，AICP 的硬编码路径意味着任何纯合并方案要么要 fork、要么要搭桥接 hack。本文讨论的是"这笔交易值不值得做"，**不是**在断言它一定值得。

## 2. 目标 / 预期终局

先假设成功。那么：

1. **磁盘上只有一份文件**保存 QCut 的明文凭据。候选路径见 §4。
2. **AICP 继续能独立跑通。** 从终端调用 `aicp set-key FAL_KEY …`、`aicp gen image …` 依旧能读写凭据 —— 那些从不打开 QCut GUI 的用户不会被挂掉。
3. **优先级链从 4 层塌缩为 3 层**（`environment` → `electron` → `file`）—— 两个文件层消失一层，`shadowedBy` 报告也失去它最常见的"假阳性"配对（tier 3 + tier 4 都被 QCut 自己的保存 handler 写成了同一个值）。
4. **迁移是自动的。** 当前在一份或两份文件里存有 key 的用户，重启后 key 依旧完整，无需任何手动操作。
5. **对外部调用者行为不变。** 任何直接读 `~/.config/video-ai-studio/credentials.env` 的程序（Claude Code 的 skill、用户自己的脚本）都要继续能跑 —— 要么读真实文件，要么走一个透明转发。

**非目标（明确排除）：**

- 不移除 Electron 的 safeStorage 加密层 —— 这层对 GUI 来说仍然是权威来源。
- 不把 `process.env` 的最高优先级地位取消。
- 不改 AICP 的 key 词汇表（还是 3 个），也不改原生 pipeline 的（还是 15 个）。
- 不迁移到数据库 / 钥匙串 / 操作系统级凭据存储 —— 那是另一场讨论。

## 3. 架起 AICP 这座桥的策略选项

AICP 的凭据路径写死在 `electron/resources/bin/aicp/<platform>/aicp` 的 Python 二进制里。任何合并方案必须回答：**合并之后，AICP 还怎么找到它的 key？** 按侵入性由低到高排了四种策略：

### 3.1 Symlink（侵入性最低）

升级后第一次启动时，把 `~/.config/video-ai-studio/credentials.env` 建为一个 **symlink**，指向合一后的标准文件（例如 `~/.qcut/.env`）。两条路径解析到同一个 inode；AICP 感知不到变化。

- **优点：** AICP 零改动。对外部脚本透明。可回滚（删掉 symlink 就回到旧状态）。`api-key-handler.ts` 里写路径也收敛到一条。
- **缺点：**
  - **Windows 的 symlink UAC 痛点。** Windows 下 `fs.symlink` 要么需要开启 Developer Mode，要么要管理员权限 —— 否则需要 NTFS junction 绕开。junction 只对目录有效，对文件不行 —— 所以 Windows 下要么降级成**硬链接**（只能在同一卷），要么干脆换别的策略。
  - **key 集合不匹配。** `~/.qcut/.env` 里有 15 个 key，其中 12 个对 AICP 来说是未知字段（无害但吵 —— 而 AICP 的 `aicp set-key` 流程在重写文件时**是否是"增量保留"而非"覆盖重写"** 需要验证：如果不是 additive，就会在 AICP 这一侧把未知行吃掉）。
  - **会让高级用户感到意外**：他们可能本来手动编辑了自己的 `credentials.env`；升级后那个文件变成了指向别处的符号链接，他们之前的编辑就不见了。
- **结论：** 有诱惑力，但在 Windows 上脆弱，升级时有丢数据风险。**不推荐作为主策略。**

### 3.2 Shim 文件（AICP 路径是镜像而非 symlink）

两份文件仍保留在磁盘上，但把其中一份定为**标准源（canonical source）**，另一份作为**每次源变更时都重新生成的镜像**。AICP 直接写 `credentials.env`；QCut 读两边并以标准源为准。

- **优点：** 没有 symlink 的可移植性问题；AICP 通过 `aicp set-key` 写入的值能保留；Windows 安全。
- **缺点：** **这基本就是今天的状态** —— 两份文件，由 QCut 同步。这个策略只是把 `syncToAicpCredentials` 改名叫"镜像生成"而已。文件数并没有真的减少，只是换了说法。
- **结论：** 不是真合并。跳过。

### 3.3 给 AICP 二进制包一层 wrapper（推荐）

把对 `electron/resources/bin/aicp/<platform>/aicp` 的直接调用替换成一个薄薄的 wrapper（Unix 下是 shell 脚本、Windows 下是 `.cmd`、或者通过 `bun run` 跑一个 TS 脚本），它负责：

1. 从 `~/.qcut/.env` 读出 QCut 的 3 个 AICP 相关 key，导出到环境变量。
2. `exec` 真正的 AICP 二进制。

skill 和用户调用的是这个 wrapper（`aicp set-key …`、`aicp gen image …`）。AICP 通过 `process.env` 看到 key —— 而它**本来就把 env 当作比自己凭据文件更高优先级的来源**。凭据文件不再作为 QCut 管理的 key 的"真实源"。

- **优点：**
  - **AICP 二进制一行不动。** 不 fork、不需要对上游做事。
  - **单一标准文件**（`~/.qcut/.env`）—— QCut 只往这一个地方写。
  - **`aicp set-key` 依然能工作** —— 它写入的是 `credentials.env`，QCut 的 wrapper 在下一次调用时会同时读两边（合并 env），所以一个只用 AICP CLI 的用户完全感觉不到变化。
  - **Windows 安全** —— 不需要 symlink。
- **缺点：**
  - **调用路径要换。** 任何**直接调用打包好的二进制**（绕过 wrapper）的脚本或 skill，都会失去这道桥。需要 grep 全部 `aicp` 调用点（`aicp/<platform>/aicp` 和 `resources/bin/aicp`）做审计。
  - **仍有两个写者。** 用户跑 `aicp set-key` 就会写 `credentials.env`；QCut 写的是 `~/.qcut/.env`。两边都可读，但"我应该编辑哪里"的答案变长了："都行，读的时候合并，但 GUI 只写 `~/.qcut/.env`。"
  - **启动开销。** wrapper 每次调用 AICP 时都要读 `~/.qcut/.env`。忽略不计（<5 ms），但值得一提。
- **结论：** **推荐。** 长期维护性最好。AICP 不动，外部工作流不断，QCut 得到了一个标准文件。

### 3.4 Fork AICP / 自行维护一个打补丁的构建

改 AICP 里硬编码的凭据路径，让它读 `~/.qcut/.env`（或接受一个 `QCUT_ENV` 覆盖）。发一个打补丁的构建，替换掉 `electron/resources/bin/aicp/` 里的二进制。

- **优点：** 真的只剩一份文件、真的只剩一个写者。心智模型最干净。
- **缺点：**
  - **长期成本。** AICP 每发一个上游版本，我们都要重新打补丁。如果 AICP 持续开发，这就是长期的税。
  - **和"独立运行契约"冲突。** 一个只读 `~/.qcut/.env` 的打补丁 AICP 已经不是通用的 AICP 二进制了 —— 把它放到非 QCut 的环境里跑会挂。
  - **需要足够的所有权。** 我们得对 AICP 有足够控制力才能持续打补丁。今天这点不明（TWO-ENV-FILES.md §1.3 说它是 "external, we vendor it"）。
- **结论：** 如果我们愿意长期维护这个补丁，它是最好的终局。否则推荐 **3.3**。

### 3.5 决策矩阵

| 策略 | 工作量 | 风险 | Windows 支持 | AICP 上游兼容性 | 是否真正统一写者 |
|---|---|---|---|---|---|
| 3.1 Symlink | 低 | 中（Windows 脆弱） | 差 | 完全 | 是 |
| 3.2 Mirror | 低 | 低 | 完全 | 完全 | **否 —— 与今天相同** |
| 3.3 Wrapper *（推荐）* | 中 | 低 | 完全 | 完全 | 大部分（AICP CLI 仍写自己的文件；GUI 只写标准文件） |
| 3.4 Fork | 高 | 中（补丁漂移） | 完全 | **上游更新可能破** | 是 |

推荐：**现在落地 3.3（wrapper）**，若未来 AICP 上游配合，再把 3.4（fork）作为备选。

## 4. 合并后的单文件位置

三个候选。只谈权衡，尚未决定。

### 4.1 `~/.qcut/.env` *（现状赢家）*

- **优点：** 已经存在。已经由 `key-manager.ts` 管理。原生 CLI 已经在读。15 key 的词汇表已经支持。
- **缺点：** 是个"隐藏"目录，没遵循 XDG base —— 在 Linux 上不跟 `$XDG_CONFIG_HOME`。不是外部文档最常引用的那条路径（AICP 的文档指向 `~/.config/video-ai-studio/credentials.env`）。
- **结论：** 迁移成本最低的选择。大概率是对的答案。

### 4.2 `~/.config/video-ai-studio/credentials.env`

- **优点：** 本来就是 AICP 在找的位置；选用它可让 symlink 策略（3.1）变得很自然。
- **缺点：** 这个名字是 AICP 的，不是 QCut 的。复用它会让"到底这份文件是 QCut 的还是 AICP 的"变得模糊。如果 AICP 后续分叉并在自己的节奏上重写这份文件，QCut 可能覆盖用户手动编辑的内容。
- **结论：** 避开 —— 从产品品牌的角度看路径不对劲。

### 4.3 `~/.config/qcut/credentials.env`（XDG 合规）

- **优点：** Linux 下遵循 XDG。QCut 拥有权清晰。完全干净的切换。
- **缺点：** **迁移成本最大** —— 今天的两份文件都不在这个路径下。会破坏所有已经硬编码 `~/.qcut/.env` 的用户脚本。
- **结论：** 对一个全新产品来说是对的。但鉴于 `~/.qcut/.env` 已经广泛存在，churn 不划算。

**推荐：4.1 —— 继续以 `~/.qcut/.env` 为标准文件。**

## 5. 对 4 层优先级链的影响

今天（[`electron/api-key-status.ts:14-19`](../../../electron/api-key-status.ts)）：

```ts
export const KEY_SOURCE_PRECEDENCE = [
    "environment",
    "electron",
    "aicp-cli",
    "qcut-env",
] as const;
```

在策略 3.3（wrapper）下，链塌缩为 3 层：

```ts
export const KEY_SOURCE_PRECEDENCE = [
    "environment",
    "electron",
    "file",        // 原 "aicp-cli" + "qcut-env"
] as const;
```

下游影响：

- **[`electron/api-key-status.ts`](../../../electron/api-key-status.ts)** —— `KEY_SOURCE_PRECEDENCE`、`KeyPresence`、`computeKeyStatus` 都去掉 `aicpCli` 与 `qcutEnv` 的区分。`KeyPresence` 变为 `{ env, electron, file }`。
- **[`electron/api-key-handler.ts`](../../../electron/api-key-handler.ts)** —— `loadAicpCredentials` 与 `loadQcutEnvKeys` 合并为单一 `loadFileKeys()`。`syncToAicpCredentials` 删除（AICP 现在通过 wrapper 从 env 读）。`syncToQcutEnv` 保持原名或改名为 `syncToEnvFile`。`getDecryptedApiKeys` 每个 provider 的回退链各少一层。
- **镜像常量**（按 `api-key-status.ts:4-13` 的说明）：
  - `packages/platform-core/src/types/core-api.ts`
  - `electron/preload-types/supporting-types.ts`
  - `electron/__tests__/api-key-status.test.ts` 的快照断言能捕获漂移 —— 作为本次改动的一部分需要更新。
- **UI**（[`apps/web/src/components/editor/properties-panel/api-keys-view.tsx`](../../../apps/web/src/components/editor/properties-panel/api-keys-view.tsx) 以及 `api-key-field.tsx`）—— `KeySourceBadge` 少一个变体；PR #285 的 "shadowed by" 说明文案简化。

**净效果：** 层数更少、面积更小、文档更轻。#285 落地的优先级 UX 仍然适用；只是要解释的情形少了一种。

## 6. 对现有用户的迁移路径

要迁移的有三类人群：

1. **GUI 用户（最常见）。** 他们两份文件本来就是同步的，因为每次 GUI 保存都会三写。升级后：QCut 不再读 `~/.config/video-ai-studio/credentials.env` 上的 QCut 管理 key（AICP wrapper 只读 env 了）；GUI 只写 `~/.qcut/.env`。**无需用户做任何事。**
2. **只用 AICP CLI 的用户。** 他们只在 `credentials.env` 里有值。升级后，Electron 启动迁移（见下）会把 QCut 关心的 key（FAL / Gemini / OpenRouter）从 `credentials.env` 拷贝到 `~/.qcut/.env`（仅当后者缺失时）。他们继续用 `aicp set-key` 也不受影响 —— AICP 二进制还是拥有 `credentials.env` 给自己写。
3. **手动编辑 `~/.qcut/.env` 的高级用户。** 本来就是标准文件；无需迁移。

### 6.1 一次性迁移流程

统一文件版本首次启动时，在 `setupApiKeyIPC()` 里运行：

```ts
async function migrateToSingleEnvFile(): Promise<void> {
    const marker = path.join(app.getPath("userData"), ".env-file-unified");
    if (fs.existsSync(marker)) return;        // 已迁移

    const aicpKeys = loadAicpCredentials();   // 已有 helper
    for (const [field, envName] of Object.entries(AICP_REVERSE_MAP)) {
        const existing = getKey(envName);     // 来自 key-manager.ts
        const fromAicp = aicpKeys[field as keyof ApiKeys];
        if (!existing && fromAicp) {
            setKey(envName, fromAicp);        // 写入 ~/.qcut/.env
        }
    }

    fs.writeFileSync(marker, new Date().toISOString());
}
```

- **通过 marker 文件保证幂等** —— 用户降级再升级也安全。
- **绝不覆盖 `~/.qcut/.env` 中已有的值** —— 保守合并。
- **不动 `credentials.env`** —— AICP CLI 还能继续写它；QCut 只是不再依赖它与自己保持同步。

### 6.2 过渡期提示

优先级面板 UI 在**仅一个版本**的时间窗口内，首次启动后显示一条柔和的 "正在迁移凭据存储 —— 您的 key 已复制到 `~/.qcut/.env`" toast。一个版本后移除提示；迁移例程本身长期保留（成本低，覆盖那些长期沉睡的用户）。

## 7. 未决问题

1. **AICP 二进制的写入是 additive 吗？** 用户跑 `aicp set-key FAL_KEY=…` 时，AICP 是增量改写 `credentials.env`（保留其他行）还是整体覆盖？决定了即使撇开 Windows 问题，策略 3.1（symlink）是否安全。**在选定策略前需要确认。**
2. **有多少内部调用点是直接启动 AICP 二进制（绕过任何 wrapper）？** 审计：`grep -r "aicp/<platform>/aicp\|resources/bin/aicp" electron/ resources/`，以及 `resources/default-skills/` 下的每一份 `Skill.md`。策略 3.3 只有在能把所有调用路由到 wrapper 时才工作。
3. **Claude Code 的 skill 运行时在调用 `aicp` 时会保留 env 吗？** 如果它为了沙箱原因用空 env 启动二进制，wrapper 导出的 env 就到不了 AICP。**发布前需要做实证测试。**
4. **wrapper 应该放在打包的 `resources/bin/` 里还是 `electron/native-pipeline/` 下？** 影响打包（代码签名、EXE 构建是否包含、Windows PATH）。
5. **降级会发生什么？** 用户在统一版本上运行 2026.05 一周后，降级回 2026.04。两份文件都还在；4 层链会正确解析。不会丢数据，但要验证 marker 文件对旧版本是惰性的（应该是 —— 旧代码不会检查它）。
6. **`qcut-env` 这个字面量要不要改名为 `file`？** 按 §5，既然层合并了，字面量大概也该合；但这又会多一次重命名，要同步到 3 个镜像文件。延后还是一起做？

## 8. 若确定要做 —— 实施子任务

本节是用来回答 "要做的话需要多少工作" —— **不是同意开工的信号**。每个子任务大致 20–45 分钟。粗略估计总共 ~4–5h（大大超出 CLAUDE.md 20 分钟规约 → 下面拆开）。

### 8.1 子任务 A —— 审计 AICP 调用点 *（30 分钟，仅调查）*

**目标：** 回答未决问题 7.2。

- **Grep 范围：** `electron/`、`resources/default-skills/`、`apps/web/src/`、`packages/`。
- **交付：** 一份 bullet list —— 每一处 spawn AICP 二进制的位置，以及它是经过统一 helper 还是直接 `spawn()` 路径。
- **预期命中：**
  - `electron/claude/*-handler.ts`
  - `resources/default-skills/ai-content-pipeline/Skill.md`
  - `resources/default-skills/qcut-toolkit/ai-content-pipeline/SKILL.md`
  - `electron/native-pipeline/**/*.ts` 里任何 shell-out 调用。
- **不写测试。** 纯侦察。

### 8.2 子任务 B —— 引入 AICP wrapper *（45 分钟）*

**目标：** 集中 AICP 调用；让每个调用者都走同一个 helper，它会把 `~/.qcut/.env` 的 env 注入到环境变量。

- **新文件：** `electron/native-pipeline/infra/aicp-wrapper.ts` —— 导出 `runAicp(args: string[], opts?: { cwd?: string }): Promise<{ stdout; stderr; code }>`。内部通过 [`key-manager.ts:206`](../../../electron/native-pipeline/infra/key-manager.ts) 的 `loadEnvFile()` 读取 key，以 `{ env: { ...process.env, ...loadedKeys } }` spawn 二进制。
- **需要改动的调用者：** 子任务 A 里找到的所有位置。
- **已有的二进制解析器：** 肯定已经有帮手解析 `electron/resources/bin/aicp/<platform>/aicp` —— 复用，不要重写。
- **测试：** `electron/native-pipeline/infra/__tests__/aicp-wrapper.test.ts`
  - 用一个假二进制（echo 环境的 shell 脚本）断言：`process.env` 为空时，env 来自 `~/.qcut/.env`。
  - 断言 `process.env` 有值时优先于文件（保持今天的优先级）。

### 8.3 子任务 C —— 迁移例程 *（30 分钟）*

**目标：** 落地 §6.1 与 §6.2。

- **修改：** [`electron/api-key-handler.ts`](../../../electron/api-key-handler.ts) —— 添加 `migrateToSingleEnvFile()`，在 `setupApiKeyIPC()` 里，在行 398–409 的启动同步块**之前**调用。
- **Marker 文件：** `userData/.env-file-unified`。
- **测试：** `electron/__tests__/api-key-migration.test.ts`
  - 用一个 temp HOME，只放 `credentials.env` → 断言迁移后 `~/.qcut/.env` 获得三个 AICP 兼容的 key。
  - 断言幂等 —— 第二次调用是 no-op（marker 已存在）。
  - 断言不覆盖 —— 如果 `~/.qcut/.env` 已经有值，迁移不会覆写。

### 8.4 子任务 D —— 把优先级链塌缩到 3 层 *（45 分钟）*

**目标：** 全面去掉 tier 3 vs tier 4 的区分。

- **修改：** [`electron/api-key-status.ts`](../../../electron/api-key-status.ts) —— 把 `aicp-cli` + `qcut-env` 重命名为 `file`；更新 `KeyPresence`、`computeKeyStatus`。
- **修改：** [`electron/api-key-handler.ts`](../../../electron/api-key-handler.ts) —— 合并 `loadAicpCredentials` + `loadQcutEnvKeys` 为 `loadFileKeys`；删 `syncToAicpCredentials`；把 `syncToQcutEnv` 改名为 `syncToEnvFile`；简化 `getDecryptedApiKeys` 的回退链。
- **镜像到：**
  - `packages/platform-core/src/types/core-api.ts`
  - `electron/preload-types/supporting-types.ts`
- **测试：**
  - 更新 `electron/__tests__/api-key-status.test.ts` 的快照。
  - 更新 `electron/__tests__/api-key-aicp-fallback.test.ts` —— "AICP fallback" 变成 "file fallback"。
  - 按需更新 `electron/__tests__/api-key-injection.test.ts`。

### 8.5 子任务 E —— UI 简化 *（30 分钟）*

**目标：** 让 PR #285 的优先级 UX 匹配塌缩后的 3 层模型。

- **修改：** [`apps/web/src/components/editor/properties-panel/api-keys-view.tsx`](../../../apps/web/src/components/editor/properties-panel/api-keys-view.tsx) —— 删一个 badge 变体；更新 `api-keys-precedence-info.tsx`（按 PLAN.md §4）的文案，从四层改为三层。
- **修改：** `apps/web/src/components/editor/properties-panel/api-key-field.tsx` —— `shadowedBy` 数组现在最多含一项（`file`），不再是两项。
- **测试：**
  - `apps/web/src/components/editor/properties-panel/__tests__/api-keys-view.test.tsx`（新增或扩展）—— 断言优先级信息渲染为 3 层。

### 8.6 子任务 F —— 文档更新 *（30 分钟）*

- **修改：** [`docs/task/api-keys-precedence-ux/TWO-ENV-FILES.md`](./TWO-ENV-FILES.md) —— 在文档最前面加一条 "Superseded by ONE-ENV-FILE.md" 的横幅（但保留原文以作历史记录）。
- **修改：** [`CLAUDE.md`](../../../CLAUDE.md) —— env vars 章节已经列了正确的变量；加一行说明：基于文件的凭据统一住在 `~/.qcut/.env`（单一来源）。
- **修改：** [`resources/default-skills/ai-content-pipeline/Skill.md`](../../../resources/default-skills/ai-content-pipeline/Skill.md) —— 明确：QCut 从 `~/.qcut/.env` 读 key；AICP 自己的 `credentials.env` 仅用于直接 `aicp set-key`。
- **修改：** [`resources/default-skills/native-cli/SKILL.md`](../../../resources/default-skills/native-cli/SKILL.md) —— 本来就正确;再确认一遍存储位置那一节。
- **无测试**（纯文档）。

### 8.7 子任务 G —— 回归验证 *（30 分钟）*

- 在 `apps/web/` 与 `electron/` 跑 `bun check-types`。
- `bun lint:clean`。
- `bun run test` —— 全量 vitest 通过，重点关注子任务 D 里改名的测试。
- 手工 smoke：清洁 profile（删 `~/.qcut/`、`~/.config/video-ai-studio/`、`userData/api-keys.json`）→ 打开 GUI → 保存一个 key → 确认 `~/.qcut/.env` 有值而 `credentials.env` **没有**（除非 AICP 自己写）。
- 手工 smoke：从终端跑 `aicp set-key FAL_KEY=…` → 启动 QCut → 确认 GUI 里通过 file 层看到该 key。

### 8.8 子任务 H —— 迁移公测期 *（跨一个 release cycle）*

- 子任务 A–G 无 flag 直接发（迁移幂等且安全）。
- 一个版本之后，移除首次启动的迁移 toast（子任务 C §6.2）。
- 迁移例程本身长期保留。

### 8.9 总估时

~4–4.5 小时聚焦编码，加上一个 release cycle 的公测期。拆成 8 个 ≤ 45 分钟的子任务，符合 /planit 的惯例。

## 9. 推荐路径

采用策略 3.3（wrapper）+ 目标 4.1（继续使用 `~/.qcut/.env`），**在**通过子任务 A 的审计 + 一小时实证测试回答完未决问题 §7.1–§7.3 **之后**再动工。没有拿到审计结论前，不要开始编码子任务 B–G。

如果审计发现：我们并不拥有的 skill 里有超过 10 处直接调用 AICP —— 重新评估一下。此时策略 3.4（fork）可能在长期上反而比把每个调用者都走 wrapper 更便宜。

## 10. 另见

- [TWO-ENV-FILES.md](./TWO-ENV-FILES.md) —— 为什么今天有两份文件。
- [PLAN.md](./PLAN.md) —— 优先级 UX（PR #285）。
- [`electron/api-key-handler.ts`](../../../electron/api-key-handler.ts) —— 保存时同步。
- [`electron/api-key-status.ts`](../../../electron/api-key-status.ts) —— 优先级链常量。
- [`electron/native-pipeline/infra/key-manager.ts`](../../../electron/native-pipeline/infra/key-manager.ts) —— `~/.qcut/.env` 的读写器；`loadEnvFile()` env 注入。
- [`docs/completed/ai-pipeline/robust-fal-key-cli-implementation.md`](../../completed/ai-pipeline/robust-fal-key-cli-implementation.md) —— 3 层 → 4 层演进的历史记录。
