---
name: codexit
description: Decision matrix for delegating tasks between Claude Code and Codex CLI. Guides when to handle tasks directly vs. delegate to Codex.
---

# Codex Delegation Skill

When to handle tasks yourself vs. delegate to Codex CLI.

## Decision Matrix

### 🟢 DO IT YOURSELF (Claude Code)

Tasks where speed and iteration matter more than perfection:

- **Single-file changes** — component, style, config edits
- **Clear spec tasks** — "add a button that calls X API", "fix this type error"
- **Test writing** — unit tests, E2E tests with existing patterns to follow
- **One-liner fixes** — typo, import, type annotation
- **Docs / comments** — README, JSDoc, inline comments
- **Quick prototypes** — spike something out, will be reviewed anyway
- **CI / config** — package.json, tsconfig, vite config, biome config
- **Tasks under 5 files** — manageable scope, you can hold it in context

### 🔴 DELEGATE TO CODEX

Tasks where stability and deep understanding matter:

- **Cross-cutting refactors (10+ files)** — store splits, API layer changes, module reorganization
- **Architecture changes** — state management migration, routing overhaul, build system changes
- **Critical path code** — payment, auth, data migration, export/import pipeline
- **Complex debugging** — multi-layer call chain bugs, race conditions, memory leaks
- **Large feature implementation (>20min estimate)** — new modules with multiple components + stores + tests
- **Unfamiliar territory** — working in a subsystem you haven't touched before
- **Overnight tasks** — anything you want to "fire and forget" and have working by morning

### 🟡 JUDGMENT CALL

Could go either way — use context to decide:

- **5-10 file changes** → yourself if files are related, Codex if spread across subsystems
- **Bug fixes** → yourself if you can spot it quickly, Codex if root cause is unclear
- **PR review fixes** → yourself for simple ones, Codex for batch fixes across many files

## How to Delegate to Codex

### One-Shot Task

```bash
codex exec --full-auto "Your detailed task description.

Context:
- Branch: $(git branch --show-current)
- Relevant files: [list key files]
- Acceptance criteria: [what 'done' looks like]

Constraints:
- Do not modify files outside of [scope]
- Run 'bunx vitest [relevant test]' to verify
- Commit with conventional commit message"
```

### Large Task (with plan first)

```bash
codex exec --full-auto "Plan and implement [feature].

Step 1: Read these files to understand the current architecture:
- [file1]
- [file2]

Step 2: Create an implementation plan (don't write code yet).
Print the plan and wait for it to look right before proceeding.

Step 3: Implement the plan. After each major change, run:
- 'bun run typecheck' for type safety
- 'bunx vitest [test file]' for tests

Step 4: Commit each logical unit separately with conventional commits.

Constraints:
- Keep Remotion on Zod 3.22.3 (no Zod 4)
- Max 800 lines per file; split if longer
- Don't break existing E2E tests: 'bun run test:e2e'"
```

### Providing Context to Codex

Always include in your prompt:
1. **Current branch** — so it doesn't accidentally work on main
2. **Relevant files** — narrow the search space
3. **Acceptance criteria** — what "done" looks like
4. **Constraints** — what NOT to touch (Remotion versions, specific patterns)
5. **Verification commands** — how to test the changes

### QCut-Specific Constraints (always include)

```
QCut Project Rules:
- Package manager: bun (not npm/yarn)
- Type check: bun run typecheck
- Unit tests: bunx vitest [path]
- E2E tests: bun run test:e2e
- Linting: bunx biome check --write .
- Remotion stays on Zod 3.22.3
- Max 800 lines per file
- Electron main process: electron/main/
- Renderer: src/
- Stores: src/stores/ (Zustand)
```

## Anti-Patterns

❌ **Don't delegate trivial fixes** — spawning Codex for a one-line type fix wastes 2+ minutes of startup
❌ **Don't delegate without context** — "fix the bug" with no file paths = Codex wandering the codebase
❌ **Don't delegate and immediately do it yourself** — pick one, commit to it
❌ **Don't skip verification commands** — Codex should always run typecheck + tests before committing
❌ **Don't let Codex touch unrelated files** — always scope the task explicitly
