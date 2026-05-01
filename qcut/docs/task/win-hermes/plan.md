# win-hermes build fix implementation plan

> **For Hermes:** Use systematic-debugging first, then implement the smallest fix that makes `bun run build` pass.

**Goal:** Get `bun run build` passing on branch `win-Hermes` and document the result in the same task folder.

**Architecture:** The current failure appears to be an environment/package-resolution problem rather than a feature bug. The first fix should be dependency state reconciliation: verify the declared `@google/genai` dependency is actually installed in `node_modules`, then rerun the build before changing source code. Only if the build still fails after dependency sync should source changes be considered.

**Tech Stack:** Bun workspaces, TypeScript, Electron, Vite, Turbo.

---

### Task 1: Confirm the root cause

**Objective:** Verify that the build failure is caused by missing installed package state, not by a code typo.

**Files:**
- Read: `qcut/package.json`
- Read: `qcut/electron/video-search/gemini-embedding-provider.ts`
- Inspect: `qcut/node_modules/@google/`

**Step 1: Verify dependency declaration**
- Confirm `package.json` declares `@google/genai`.

**Step 2: Verify code import path**
- Confirm `electron/video-search/gemini-embedding-provider.ts` imports `@google/genai` exactly.

**Step 3: Verify installed package state**
- Inspect `node_modules` and confirm whether `@google/genai` is present.

**Expected outcome:** `package.json` declares the dependency, code imports the same package name, but local `node_modules` is missing it.

### Task 2: Sync dependencies with the lockfile

**Objective:** Repair local install state with the smallest possible change.

**Files:**
- Possibly modify: `bun.lock` only if Bun resolves anything unexpected
- No source changes expected

**Step 1: Run dependency sync**
- Run Bun install from `qcut/`.

**Step 2: Re-check installed package state**
- Confirm `node_modules/@google/genai` now exists.

**Expected outcome:** The missing package becomes available locally without changing application code.

### Task 3: Re-run the build

**Objective:** Validate whether dependency sync alone fixes the build.

**Files:**
- No source files expected

**Step 1: Run `bun run build` again**
- Use the working Bun executable for this environment.

**Step 2: Capture the result**
- Save pass/fail status and any next error.

**Expected outcome:** Build passes, or a new failure appears that is later in the pipeline.

### Task 4: Apply code changes only if still required

**Objective:** Keep changes minimal and root-cause-driven.

**Files:**
- Modify only the specific file(s) implicated by any post-install failure
- Add tests if code changes are needed

**Step 1: Inspect the next error carefully**
- Do not guess.

**Step 2: Implement the smallest fix**
- Prefer focused changes over refactors.

**Step 3: Rebuild**
- Confirm the new fix resolves the failure.

### Task 5: Update task docs

**Objective:** Leave a clear record in the same task folder.

**Files:**
- Update: `qcut/docs/task/win-hermes/results.md`
- Keep: `qcut/docs/task/win-hermes/plan.md`

**Step 1: Document root cause**
- Missing installed `@google/genai` package despite dependency declaration.

**Step 2: Document actions taken**
- Dependency sync, rebuild, and any code changes if needed.

**Step 3: Document final verification**
- Include final build command and result.
