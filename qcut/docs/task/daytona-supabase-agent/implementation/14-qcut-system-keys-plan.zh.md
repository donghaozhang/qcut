# QCut System Keys CLI 计划

## 目标

给 QCut CLI 增加一个更清楚的 key 查看入口：能看出哪些 provider key 已配置、哪些缺失、每个 key 对应能解锁哪些命令能力。

这个主要服务 Daytona Chat Agent 和 sandbox 调试：Codex 在做付费任务或 provider-backed 任务之前，应该能先跑一个安全命令，判断 image、video、audio、LLM、auth、upload 这些能力是否可用。

## 当前状态

CLI 已经有这些底层 secret 命令：

- `qcut system check-keys --json`
- `qcut system get-key --name <KEY> --reveal`
- `qcut system set-key --name <KEY> --value <VALUE>`
- `qcut system delete-key --name <KEY>`
- `qcut system doctor --json --skip-health`

`check-keys` 已经能用，但名字更像内部诊断命令。对用户或 agent 来说，更自然的入口应该是：

```bash
qcut system keys
```

## 建议命令

保留 `check-keys` 保持兼容，同时新增 `keys` 作为面向用户的命令：

```bash
qcut system keys
qcut system keys --json
qcut system keys --configured
qcut system keys --missing
qcut system keys --category image
qcut system keys --category video
qcut system keys --category audio
qcut system keys --category llm
qcut system keys --category auth
```

`qcut system check-keys` 应该复用 `qcut system keys` 的同一个 handler。

## 输出契约

人类可读输出要容易扫：

```text
QCut keys

Configured
  OK  QCUT_AUTH_TOKEN     env       heiF****verm   auth
  OK  FAL_KEY             env       da51****bf5b   image, video
  OK  ELEVENLABS_API_KEY  secret    sk_1****8ab2   audio

Missing
  --  OPENAI_API_KEY      image, llm
  --  REPLICATE_API_TOKEN image, video
```

JSON 输出要足够稳定，方便 Chat Agent 自动判断：

```json
{
  "summary": {
    "configured": 3,
    "missing": 2,
    "total": 5
  },
  "keys": [
    {
      "name": "FAL_KEY",
      "configured": true,
      "source": "env",
      "masked": "da51****bf5b",
      "requiredFor": ["image", "video"]
    },
    {
      "name": "OPENAI_API_KEY",
      "configured": false,
      "source": "none",
      "masked": null,
      "requiredFor": ["image", "llm"]
    }
  ],
  "recommendedNext": [
    "Set OPENAI_API_KEY to enable OpenAI image and LLM-backed commands."
  ]
}
```

## 安全规则

- 默认输出绝不能显示原始 secret 值。
- 不新增 `qcut system keys --reveal`。
- 原始值 reveal 继续只允许用现有的单 key 命令：

```bash
qcut system get-key --name FAL_KEY --reveal
```

- 日志和测试 snapshot 里要做脱敏。
- Chat Agent artifacts 不应该包含原始 key。
- 未来如果 UI 暴露这个能力，也只展示 configured/missing 状态和 masked 值。

## Daytona Chat Agent 流程

在 provider-backed 任务之前，Codex 可以先跑：

```bash
qcut system keys --json
```

然后按结果决定怎么做：

- 如果 `FAL_KEY` 已配置，可以跑 FAL-backed image 任务。
- 如果 `RUNWAY_API_KEY` 或对应 video provider key 已配置，可以跑视频生成。
- 如果必需 key 缺失，Codex 应该直接告诉用户缺哪个 key，而不是继续跑一个必然失败的付费命令。
- 如果 `QCUT_AUTH_TOKEN` 缺失，Codex 应该提前停止并说明 QCut account auth 不可用。

## 实现位置

大概率会改这些文件：

- `electron/native-pipeline/cli/command-groups.ts` —— 在 `system` group 下暴露 `keys`。
- `electron/native-pipeline/cli/command-registry.ts` —— 把 `system keys` 路由到现有 key-check handler。
- `electron/native-pipeline/cli/cli-handlers-admin.ts` —— 规范化 key summary 数据和 filter。
- `electron/native-pipeline/cli/cli-output-formatters.ts` —— 格式化人类可读表格。
- CLI 相关测试 —— 放在现有 system/admin 命令测试附近。

重点是 `keys` 和 `check-keys` 复用一个 handler，避免两个命令以后行为漂移。

## 测试计划

用真实本地配置跑：

```bash
bun electron/native-pipeline/cli/cli.ts system keys
bun electron/native-pipeline/cli/cli.ts system keys --json
bun electron/native-pipeline/cli/cli.ts system keys --missing --json
bun electron/native-pipeline/cli/cli.ts system keys --configured --json
bun electron/native-pipeline/cli/cli.ts system check-keys --json
```

期望行为：

- `system keys` 和 `system check-keys` 使用同一份底层状态。
- `--missing` 只返回缺失 key。
- `--configured` 只返回已配置 key。
- 默认人类输出在 Daytona terminal 里可读。
- JSON 输出可以被 Chat Agent 脚本稳定解析。
- 除非用户显式调用 `get-key --reveal`，否则不会出现原始 key 值。

## 验收标准

- `qcut system keys` 存在并被文档记录。
- 现有 `qcut system check-keys` 保持兼容。
- Chat Agent 能调用 `qcut system keys --json` 并根据 configured/missing provider 分支。
- 测试覆盖 configured、missing、过滤、JSON、masked human output。
- 不存在批量 reveal secret 的路径。

## 下一步子任务

更新 Chat Agent runtime prompt，让 Codex 在付费 provider 工作前先跑 `qcut system keys --json`。

## 实现状态 - 2026-05-16

已实现。

改动文件：

- `electron/native-pipeline/cli/cli-key-report.ts` —— 共享 key report builder、能力分类、过滤和 recommended next steps。
- `electron/native-pipeline/cli/cli-handlers-admin.ts` —— `check-keys` 现在返回共享 report shape，并支持过滤。
- `electron/native-pipeline/cli/command-groups.ts` —— 新增 `qcut system keys`。
- `electron/native-pipeline/cli/command-registry.ts` —— 文档化 `keys`，并给 `keys` / `check-keys` 增加过滤 flags。
- `electron/native-pipeline/cli/cli-runner/handler-map.ts` —— `keys` 和 `check-keys` 走同一个 handler。
- `electron/native-pipeline/cli/cli-output-formatters.ts` —— 增加人类可读的 configured/missing 表格。
- `electron/native-pipeline/cli/__tests__/cli-key-report.test.ts` —— 覆盖 summary、能力分类、过滤和参数校验。

验证命令：

```bash
bunx vitest run electron/native-pipeline/cli/__tests__/cli-key-report.test.ts electron/native-pipeline/cli/__tests__/cli-handlers-system-doctor.test.ts
bunx tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --types node electron/native-pipeline/cli/cli-key-report.ts
bun electron/native-pipeline/cli/cli.ts system keys
bun electron/native-pipeline/cli/cli.ts system keys --json
bun electron/native-pipeline/cli/cli.ts system keys --missing --json
bun electron/native-pipeline/cli/cli.ts system keys --configured --json
bun electron/native-pipeline/cli/cli.ts system keys --category image --json
bun electron/native-pipeline/cli/cli.ts system check-keys --json
bun electron/native-pipeline/cli/cli.ts keys --json
bun electron/native-pipeline/cli/cli.ts system keys --configured --missing --json
bun electron/native-pipeline/cli/cli.ts system --help
bun electron/native-pipeline/cli/cli.ts system keys --help --json
```

本地观察到的 key summary：

- `7` configured
- `9` missing
- `16` total
- `--missing` 只返回缺失 key。
- `--configured` 只返回已配置 key。
- `--category image` 只返回 image 能力相关 key。
- `system check-keys --json` 保持兼容，并且现在也带同样的 summary / `requiredFor` 数据。
- 冲突参数 `--configured --missing` 会返回错误。

类型检查说明：

- 针对新增 `cli-key-report.ts` 的窄类型检查通过。
- 更宽的临时 CLI 类型检查仍会遇到仓库既有、无关的错误，位置在 `cli-handlers-replicate.ts`、`vimax-cli-handlers/kling-element-orchestrator.ts` 和 `infra/api-caller.ts`。
