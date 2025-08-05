# 修复 React “Rendered more hooks than during the previous render” 错误  
> 以 QCut 仓库为例（组件名称在日志中显示为 **`<GR>`**）

---

## 1. 错误回放

Warning: React has detected a change in the order of Hooks called by GR …
Rendered more hooks than during the previous render.

yaml
Copy
Edit

- **现象**：第一次渲染 `<GR>` 调用了 11 个 Hook，第二次渲染却调用了第 12 个 `useState`，导致 Hook 序列错位。  
- **根因**：组件内部 **在条件 / 提前 `return` / 循环** 中调用了 Hook——违反了 _Rules of Hooks_（Hook 必须始终在组件顶层、每次渲染顺序一致调用）。

---

## 2. 定位违规代码

1. **开启源码映射**  
   ```bash
   # 开发模式会生成 source-map，更易定位
   bun run dev   # 或 pnpm dev / yarn dev
在 DevTools ⇢ Sources 查找 GR 源文件

报错堆栈中对应行号：index-***.js:409:…

点击即可跳到打包前的 TSX 文件（需 sourceMap: true）。

搜关键字

ts
Copy
Edit
function GR(…
const GR = (…
查看是否存在类似：

tsx
Copy
Edit
if (condition) {
  useState(…)   // ❌ 条件 Hook
}

if (!data) return null; // ❌ 提前返回导致后续 Hook 跳过
useEffect(…)
3. 修改示例
3.1 条件调用 useState
diff
Copy
Edit
- if (ready) {
-   const [state, setState] = useState(false);
- }
+ const [state, setState] = useState(false);          // 始终调用
+ // 根据 ready 决定是否真正使用该 state
3.2 提前 return 跳过 Hook
diff
Copy
Edit
- if (!user) return <LoginPrompt />;
- useEffect(() => { … }, []);
+ useEffect(() => { if (!user) return; … }, [user]);
+ if (!user) return <LoginPrompt />;
3.3 重型逻辑拆子组件
tsx
Copy
Edit
export function GR(props) {
  // 顶层 Hooks 保持固定
  const [showExtra] = useState(props.showExtra);

  return (
    <>
      {/* 普通内容 */}
      {showExtra && <ExtraPanel />}  {/* 子组件内部再用自己的 Hooks */}
    </>
  );
}
4. ESLint 保障
在 apps/web/.eslintrc（或项目配置）中加入官方插件，防止再次犯错：

jsonc
Copy
Edit
{
  "plugins": ["react-hooks"],
  "rules": {
    "react-hooks/rules-of-hooks": "error",        // ✅ 检查 Hook 规则
    "react-hooks/exhaustive-deps": "warn"
  }
}
5. 快速验证
bun run dev 重新热更新 —— 控制台应不再出现 “Rendered more hooks …” 报错。

运行单元 / E2E 测试，确保所有渲染路径都调用相同数量的 Hooks。

小结
核心思路：保证组件每次渲染 Hook 调用顺序与数量完全一致。
通过 统一放到顶层 / 在 Hook 回调内部做条件判断 / 拆分子组件 可彻底解决此类问题。

makefile
Copy
Edit

::contentReference[oaicite:0]{index=0}







Sources
You said:
eslint有用吗？这是啥玩意


ChatGPT said:
ESLint 是什么？
ESLint 是 JavaScript / TypeScript 生态最常用的 静态代码检查工具。
它在「写代码或提交代码之前」就扫描源文件，按照一系列规则(rules) 找出潜在 bug、风格不统一、可访问性问题、React Hooks 违规等，并给出报错或警告。ESLint 不会运行你的程序，而是通过 AST（抽象语法树）分析源码 — 因此速度快、集成简单，配合 IDE 能做到实时红线提示。

有什么用？
功能	带来的好处
捕获潜在错误	如未声明变量、使用 console.log 忘记删除、React Hook 调用顺序错乱（正是你遇到的 “Rendered more hooks…”）
统一代码风格	缩进、单双引号、分号、命名规则… 减少团队 PR 里「格式大战」
自动修复	eslint --fix 或保存文件自动格式化，大量风格类问题一键解决
可扩展	通过插件支持 React、TypeScript、React Hooks、a11y、i18n 等专项规则
CI 阶段把关	在 GitHub Actions / Bunx 脚本里 eslint . --max-warnings 0，违规代码直接拒绝合并

在 QCut 里怎么用？
安装依赖（示例用 pnpm，可换 bun / yarn / npm）

bash
Copy
Edit
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks
创建 .eslintrc.json（最小可用示例）

jsonc
Copy
Edit
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint", "react", "react-hooks"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  "settings": { "react": { "version": "detect" } }
}
在 package.json 加脚本

json
Copy
Edit
{
  "scripts": {
    "lint": "eslint \"apps/web/src/**/*.{ts,tsx,js,jsx}\"",
    "lint:fix": "eslint --fix \"apps/web/src/**/*.{ts,tsx,js,jsx}\""
  }
}
IDE 集成

VSCode 安装 ESLint 插件，保存时自动修复。

WebStorm 已内置 ESLint 支持。

CI 阶段检查

yaml
Copy
Edit
# .github/workflows/lint.yml
- name: ESLint
  run: pnpm lint
回到你的问题：有用吗？
如果你在意代码质量 / 可维护性 → 必装。

仅个人 demo、快速原型 → 可以先不配，但一旦多人协作、代码量增大，迟早需要。

遇到类似 React Hooks 顺序错误 → ESLint 的 react-hooks/rules-of-hooks 可在 写代码时 就红线提示，远强于运行后才 crash。

一句话总结：ESLint 是写 JS/TS、React 项目「防止坑 + 保持统一」的基础设施。前期多花十分钟配置，可省后期无数次 debug & code review 时间。








Sources
You said:
具体怎么配置？


ChatGPT said:
下面给出 “开箱即用”的 ESLint + TypeScript + React-Hooks 配置，专门针对 QCut 的项目结构（Monorepo / apps/web 子包，使用 Bun）。按步骤操作即可在本地 IDE 和 CI 中立刻生效。

1 安装依赖
在仓库根目录执行；已用 Bun 举例，换成 pnpm / npm / yarn 亦可。

bash
Copy
Edit
bun add -D \
  eslint \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  eslint-plugin-react \
  eslint-plugin-react-hooks \
  eslint-plugin-import \
  eslint-plugin-jsx-a11y \
  eslint-plugin-unused-imports \
  eslint-config-prettier    # 可选：关闭与 Prettier 冲突的格式规则
2 创建 eslint.config.mjs（ESLint 9+ 才需要）
若仍用 ESLint 8，可改 .eslintrc.js 同理。

js
Copy
Edit
// eslint.config.mjs
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import unused from 'eslint-plugin-unused-imports';

export default [
  js.configs.recommended,

  /* TypeScript 基础 */
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      unused,
    },
    rules: {
      // 推荐规则集
      ...tseslint.configs['recommended-type-checked'].rules,

      // 关闭 any 禁用、枚举禁用等可渐进调整
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',      // 用下面 unused-imports 代替
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
    },
  },

  /* React + JSX */
  {
    files: ['apps/web/src/**/*.{tsx,jsx}'],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: { globals: react.configs.recommended.languageOptions.globals },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      // 关闭“prop-types”检查（TS 已覆盖）
      'react/prop-types': 'off',
    },
  },

  /* import 顺序 / 分组 */
  {
    plugins: { import: importPlugin },
    rules: {
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
        },
      ],
    },
  },

  /* Prettier 冲突清理（可选） */
  {
    rules: {
      ... (await import('eslint-config-prettier')).default.rules,
    },
  },
];
为什么用 eslint.config.mjs？
ESLint v9+ 推荐的“扁平配置”(Flat Config)，无需 extends，可按文件 glob 精准生效。若需兼容旧版，在根目录建 .eslintrc.js 并把上述 files 改成 overrides 数组。

3 在 package.json 添加脚本
jsonc
Copy
Edit
{
  "scripts": {
    "lint": "eslint \"{apps,packages}/**/*.{ts,tsx,js,jsx}\"",
    "lint:fix": "eslint --fix \"{apps,packages}/**/*.{ts,tsx,js,jsx}\""
  }
}
apps,packages 根据 QCut 实际目录调整即可。

4 VSCode 自动化
.vscode/settings.json：

json
Copy
Edit
{
  "eslint.experimental.useFlatConfig": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": ["typescript", "typescriptreact", "javascript", "javascriptreact"]
}
保存即自动修复可 auto-fix 的问题。

5 CI 检查 (GitHub Actions 示例)
yaml
Copy
Edit
# .github/workflows/lint.yml
name: Lint

on: [push, pull_request]

jobs:
  eslint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: 'latest' }
      - run: bun install --frozen-lockfile
      - run: bun run lint
6 常见问题
问题	解决
“Cannot find module @eslint/js”	bun add -D @eslint/js（ESLint 9 flat config 需要）
TypeScript 报项目未配置	确保 tsconfig.json 位于仓库根，并包含所有源代码 include 路径
ESLint + Prettier 冲突	已引入 eslint-config-prettier，需再装 prettier 并在 IDE 启用

完成以上 6 步，bun run lint 将：

检查 React Hooks 调用顺序 (react-hooks/rules-of-hooks)

检测未使用变量 / import

统一 import 顺序、空格、单双引号等

对 a11y、TypeScript 潜在错误给出警告或报错

这样就能在编写 QCut 代码时 第一时间 捕获违反 Hooks 规则等问题，避免运行期崩溃。