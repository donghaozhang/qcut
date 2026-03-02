# OpenAI Agent Practices → QCut Applicability Evaluation

> Verifying each suggestion against QCut's current state: is it true, and is it applicable?

---

## 1. Structured AGENTS.md → On-Demand Knowledge Base

**Verdict: Partially true, limited room for improvement**

| Claim | Reality |
|-------|---------|
| "QCut is already doing this" | CLAUDE.md is only **164 lines** — already lean |
| "Split into docs/architecture/ etc." | `docs/technical/architecture/` already exists (4 files) |
| "Avoid stuffing context for Claude Code" | CLAUDE.md already links to docs/ (e.g., testing-guide.md) |

**Current docs/ structure:**
```
docs/
├── reference/           # 3 files — code standards, a11y rules, testing guide
├── technical/           # 22 files — architecture, AI, testing, workflows
│   ├── architecture/    # 4 files — already exists!
│   ├── ai/              # 8+ files — AI model docs
│   └── testing/         # 2 files — E2E + infrastructure
├── task/                # 40 files — active tasks
├── completed/           # 716 files — historical archive
├── pr-comments/         # 1,951 files — PR tracking
└── releases/            # 50+ files — release notes
```

**Assessment:**
- CLAUDE.md is already a "table of contents" style file — 164 lines is reasonable, no context bloat
- `docs/technical/` is already organized by topic, essentially the same as the proposed `docs/architecture/` + `docs/designs/`
- The real issue isn't missing structure — it's that `docs/completed/` has 716 files and `docs/pr-comments/` has 1,951 files — these historical files could be archived/cleaned up
- **Viable optimization**: Embed rules from `docs/reference/code-quality-rules.md` into linter config (see point 2)

**Priority: Low** — current structure is sufficient

---

## 2. Embed Fix Instructions in Error Messages → Linter-Guided Auto-Repair

**Verdict: True — this is a real gap**

| Claim | Reality |
|-------|---------|
| "Linter errors include how to fix" | QCut uses **Biome** (not ESLint) — no custom rule messages |
| "IPC boundary rules can be added" | **Zero** IPC/Electron boundary lint rules exist |
| "Agent reads the error and auto-fixes" | Biome's default error messages contain no project-specific fix guidance |

**Current lint configuration:**
- Main project: `biome.jsonc` using `ultracite/react` preset
- qagent subpackage: separate `eslint.config.js` (security rules + TypeScript strict)
- IPC boundaries (`window.electronAPI` ~937 call sites) enforced **entirely by manual review**

**Viable implementation approaches:**

```jsonc
// biome.jsonc — add noRestrictedImports or Biome custom diagnostics
// Biome doesn't currently support custom messages, but alternatives exist:

// Option A: Use ESLint no-restricted-syntax rules (requires adding ESLint at root level)
// Option B: Write pre-commit hook scripts to check for violation patterns
// Option C: Wait for Biome custom diagnostics support (on their roadmap)
```

**Concrete rules that could be added:**
1. **Ban renderer from directly importing electron modules** → guide toward `window.electronAPI`
2. **Ban `process.env` in client code** → guide toward `import.meta.env` (documented in CLAUDE.md but no lint rule)
3. **Ban `any` types** → Biome has this rule but it's set to off — could enable as warn with explanation

**Priority: Medium** — high ROI, but requires evaluating Biome vs ESLint trade-offs

---

## 3. CDP Screenshot Verification → Agent Visual Judgment

**Verdict: True — infrastructure exists, but missing the key piece**

| Claim | Reality |
|-------|---------|
| "QCut Electron can use CDP for screenshots" | Playwright already captures screenshots — **no need** for direct CDP |
| "Screenshot during e2e tests" | `screenshot-helper.ts` implements 4 screenshot functions |
| "Agent sees screenshot and judges if UI is correct" | **Not implemented** — screenshots only for manual review, no AI visual verification |
| "More reliable than text assertions" | Currently all assertions use `expect(locator).toBeVisible()` etc. |

**Current E2E capabilities (already in place):**
- Playwright + Electron custom fixtures
- 22 E2E test files
- Automatic video recording (2 FPS), each test generates an MP4
- Screenshot utilities: `captureScreenshot()`, `captureElementScreenshot()`, `captureTestStep()`, `captureErrorScreenshot()`
- Automatic screenshot + trace on failure

**Missing (not implemented):**
- No visual regression testing (`toHaveScreenshot()` / `toMatchSnapshot()` both unused)
- No baseline image comparison
- No AI visual verification (sending screenshots to an LLM to judge UI correctness)
- No Percy / Applitools or other third-party visual testing integration

**Viable implementation path:**

```
Level 1 (Simple): Enable Playwright toHaveScreenshot()
  → Auto-generates baseline screenshots, pixel-compares on subsequent runs
  → Zero cost, built-in feature

Level 2 (Moderate): AI visual verification
  → Screenshot → send to Gemini/Claude Vision → judge if UI looks correct
  → Good for layout regression detection, but slow and costly

Level 3 (Advanced): Agent self-repair loop
  → Test fails → screenshot → AI analysis → auto-create PR with fix
  → This is what OpenAI Codex is doing
```

**Priority: Medium-High** — Level 1 is nearly zero cost, recommended to enable immediately

---

## Summary

| Suggestion | True? | Applicable? | Priority | Recommended Action |
|------------|-------|-------------|----------|--------------------|
| 1. Structured knowledge base | Partially | Low | Low | Keep current structure, clean up historical files |
| 2. Lint with fix instructions | Yes | Yes | Medium | Add `process.env` and IPC boundary checks first |
| 3. Screenshot visual verification | Yes | Yes | Medium-High | Enable `toHaveScreenshot()` first, add AI later |
