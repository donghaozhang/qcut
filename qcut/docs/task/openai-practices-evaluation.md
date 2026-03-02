# OpenAI Agent 实践 → QCut 适用性评估

> 逐条验证三个建议是否属实、是否适用于 QCut 当前状态

---

## 1. 结构化 AGENTS.md → 按需读取知识库

**结论: 部分属实，改进空间有限**

| 声明 | 实际情况 |
|------|----------|
| "QCut 已经在用" | CLAUDE.md 只有 **164 行**，已经很精简 |
| "可以拆成 docs/architecture/ 等" | `docs/technical/architecture/` 已存在（4 个文件） |
| "Claude Code 做任务时不用塞上下文" | CLAUDE.md 已通过链接指向 docs/（如 testing-guide.md） |

**当前 docs/ 结构：**
```
docs/
├── reference/           # 3 files — 代码标准、a11y 规则、测试指南
├── technical/           # 22 files — 架构、AI、测试、工作流
│   ├── architecture/    # 4 files — 已经存在！
│   ├── ai/              # 8+ files — AI 模型文档
│   └── testing/         # 2 files — E2E + 基础设施
├── task/                # 40 files — 活跃任务
├── completed/           # 716 files — 历史存档
├── pr-comments/         # 1,951 files — PR 追踪
└── releases/            # 50+ files — 发布记录
```

**评估：**
- CLAUDE.md 本身已经是"目录"形式，164 行很合理，没有"塞一大堆上下文"的问题
- `docs/technical/` 已经按主题分目录，和建议的 `docs/architecture/` + `docs/designs/` 本质相同
- 真正的问题不是缺少结构，而是 `docs/completed/` 有 716 个文件、`docs/pr-comments/` 有 1,951 个文件 — 这些历史文件可以考虑归档清理
- **可行优化**：把 `docs/reference/code-quality-rules.md` 的规则嵌入 linter 配置（见第 2 点）

**优先级：低** — 当前结构已经够用

---

## 2. 错误消息嵌修复指令 → Linter 自动引导修复

**结论: 属实，这是一个真实的缺口**

| 声明 | 实际情况 |
|------|----------|
| "linter 报错里写'怎么修'" | QCut 用 **Biome**（非 ESLint），无自定义规则消息 |
| "IPC 边界可以加规则" | **完全没有** IPC/Electron 边界的 lint 规则 |
| "Agent 读到错就自动改" | Biome 的默认报错消息不含项目特定修复指引 |

**当前 Lint 配置：**
- 主项目：`biome.jsonc`，使用 `ultracite/react` 预设
- qagent 子包：独立 `eslint.config.js`（安全规则 + TypeScript strict）
- IPC 边界（`window.electronAPI` ~937 处调用）完全靠**人工 review** 维护

**可行实施方案：**

```jsonc
// biome.jsonc — 添加 noRestrictedImports 或 Biome 自定义诊断
// Biome 目前不支持自定义消息，但可以通过以下方式实现：

// 方案 A：用 ESLint no-restricted-syntax 规则（需要在根级别加 ESLint）
// 方案 B：写 pre-commit hook 脚本检查违规模式
// 方案 C：等 Biome 支持 custom diagnostics（roadmap 中）
```

**具体可做的规则示例：**
1. **禁止 renderer 直接 import electron 模块** → 引导用 `window.electronAPI`
2. **禁止 `process.env` 在 client 代码中使用** → 引导用 `import.meta.env`（CLAUDE.md 已写但没有 lint 规则）
3. **禁止 `any` 类型** → Biome 已有但设为 off，可以 warn 并附说明

**优先级：中** — 投入产出比高，但需要评估 Biome vs ESLint 的取舍

---

## 3. CDP 截图验证 UI → Agent 视觉判断

**结论: 属实，基础设施已有，但缺关键一步**

| 声明 | 实际情况 |
|------|----------|
| "QCut Electron 可以用 CDP 截图" | Playwright 已能截图，**不需要**直接用 CDP |
| "e2e 测试时截图" | `screenshot-helper.ts` 已实现 4 种截图函数 |
| "Agent 看到截图判断 UI 对不对" | **未实现** — 截图只用于人工查看，没有 AI 视觉验证 |
| "比纯文本断言靠谱" | 当前全部用 `expect(locator).toBeVisible()` 等文本断言 |

**当前 E2E 能力（已有）：**
- Playwright + Electron 自定义 fixture
- 22 个 E2E 测试文件
- 自动视频录制（2 FPS），每个测试生成 MP4
- 截图工具：`captureScreenshot()`、`captureElementScreenshot()`、`captureTestStep()`、`captureErrorScreenshot()`
- 失败时自动截图 + trace

**缺失（未实现）：**
- 无视觉回归测试（`toHaveScreenshot()` / `toMatchSnapshot()` 均未使用）
- 无基线图片对比
- 无 AI 视觉验证（把截图发给 LLM 判断 UI 正确性）
- 无 Percy / Applitools 等第三方视觉测试集成

**可行实施路径：**

```
Level 1 (简单): 启用 Playwright toHaveScreenshot()
  → 自动生成基线截图，后续跑测试时像素对比
  → 零成本，内置功能

Level 2 (中等): AI 视觉验证
  → 截图 → 发给 Gemini/Claude Vision → 判断 UI 是否正常
  → 适合 layout 回归检测，但速度慢、成本高

Level 3 (高级): Agent 自修复循环
  → 测试失败 → 截图 → AI 分析 → 自动提 PR 修复
  → 这就是 OpenAI Codex 在做的事
```

**优先级：中高** — Level 1 几乎零成本，建议立即启用

---

## 总结

| 建议 | 属实？ | 适用？ | 优先级 | 建议动作 |
|------|--------|--------|--------|----------|
| 1. 结构化知识库 | 部分 | 低 | 低 | 维持现状，清理历史文件 |
| 2. Lint 嵌修复指引 | 是 | 是 | 中 | 先加 `process.env` 和 IPC 边界检查 |
| 3. 截图视觉验证 | 是 | 是 | 中高 | 先启用 `toHaveScreenshot()`，后续加 AI |
