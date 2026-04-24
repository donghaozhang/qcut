# Implementation Plan: Collapse Two File-Based Credential Stores Into One

> **Status: SHIPPED via PR [#286](https://github.com/Quriosity-agent/qcut/pull/286).** Branch `single-env-file-plan`. Commits `58a63369` → `d75bbe73` deliver ST-0 through ST-7. ST-8 (beta-window follow-up) remains scheduled for T+1 and T+2 releases. See § 5 Definition of Done for the per-subtask checklist.

- **Source design doc:** [ONE-ENV-FILE.md](./ONE-ENV-FILE.md) (design / discussion). This doc is the executable counterpart.
- **Companion docs:** [TWO-ENV-FILES.md](./TWO-ENV-FILES.md) (current two-file state), [PLAN.md](./PLAN.md) / [IMPLEMENTATION.md](./IMPLEMENTATION.md) (precedence UX, PR #285).
- **Priority axis (from CLAUDE.md):** long-term maintainability > scalability > performance > short-term gains.
- **Total estimate:** ~4.5 focused coding hours across 8 subtasks (each ≤ 45 min), plus one release-cycle beta window.
- **Chosen strategy:** ONE-ENV-FILE.md §3.5 recommendation — **wrapper script around AICP binary (3.3) + keep `~/.qcut/.env` as canonical file (4.1)**. Fork path (3.4) remains a future option if AICP upstream cooperates.
- **Pre-work gate:** ST-0 (audit) must complete and prove ≤ 10 direct AICP call sites before ST-2 onward. If the audit finds > 10, escalate to re-evaluate strategy 3.4.

---

## 0. Feature Summary

Unify QCut's two file-based credential stores (`~/.config/video-ai-studio/credentials.env` + `~/.qcut/.env`) into a single canonical `~/.qcut/.env`. AICP reads QCut-managed keys via an env-injecting wrapper around its binary instead of its own credentials file. Collapses the precedence chain from 4 tiers to 3.

### Before → After

| | Today | After |
|---|---|---|
| On-disk canonical file (QCut-managed) | two files (tier 3 + tier 4) | one file (`~/.qcut/.env`) |
| Precedence tiers | `environment → electron → aicp-cli → qcut-env` | `environment → electron → file` |
| AICP binary invocation | direct spawn of `electron/resources/bin/aicp/<platform>/aicp` | `runAicp()` helper that injects env from `~/.qcut/.env` |
| `syncToAicpCredentials` | writes 3 keys to AICP file on every GUI save | **removed** (AICP reads env now) |
| `syncToQcutEnv` | writes 8 keys to `~/.qcut/.env` | renamed → `syncToEnvFile`, sole writer |
| UI `KeySourceBadge` variants | `env / electron / aicp-cli / qcut-env` | `env / electron / file` |

### Out of scope

- Removing encrypted safeStorage tier.
- Eliminating `process.env` as highest tier.
- Changing AICP or native-pipeline key vocabularies.
- Moving to OS keychain.

---

## 1. Subtask Breakdown

Every subtask is scoped to ≤ 45 minutes of focused coding. Order matters: ST-0 unblocks ST-2; ST-3 depends on ST-2; ST-4 depends on ST-3; UI/docs/regression cleanly parallel-izable after ST-4.

### Dependency graph

```
ST-0 (audit, 30m)
  │
  ▼
ST-1 (canonical file contract, 20m) ── parallel with ST-0 in practice
  │
  ▼
ST-2 (AICP wrapper, 45m)
  │
  ▼
ST-3 (migration routine, 30m)
  │
  ▼
ST-4 (collapse precedence chain, 45m)
  │
  ├──▶ ST-5 (UI simplification, 30m)
  ├──▶ ST-6 (doc updates, 30m)
  └──▶ ST-7 (regression + smoke, 30m)
           │
           ▼
        ST-8 (beta window across one release; remove migration toast after)
```

---

## ST-0 — Audit AICP call sites *(30 min, investigation only)*

**Goal:** Answer ONE-ENV-FILE.md §7.2. Catalogue every direct spawn of the AICP binary. If more than 10 distinct call sites exist across code we do not own (bundled skills), stop and re-evaluate strategy 3.4.

**Deliverable:** a bullet list appended at the bottom of this doc under § A, one line per hit: `path:line — direct | via-helper | via-skill-config`.

**Grep targets:**

- `electron/**/*.ts`
- `resources/default-skills/**/*.md`
- `resources/default-skills/**/*.ts`
- `apps/web/src/**/*.ts`
- `apps/web/src/**/*.tsx`
- `packages/**/*.ts`

**Commands:**

```bash
rg --no-heading -n 'resources[/\\]bin[/\\]aicp|aicp[/\\](darwin|linux|win32)[/\\]aicp' \
   electron \
   resources \
   apps \
   packages
```

**Files expected to surface (prior knowledge; confirm):**

- `electron/api-key-handler.ts` (AICP path constant)
- `electron/claude/*-handler.ts` (some AICP spawn sites)
- `electron/native-pipeline/**/*.ts` (pipeline shell-outs)
- `resources/default-skills/ai-content-pipeline/Skill.md`
- `resources/default-skills/qcut-toolkit/ai-content-pipeline/SKILL.md`

**Acceptance criteria:**

- Every hit classified as one of: `direct-spawn`, `helper-call`, `skill-docs-only`, `test-fixture`.
- Count of `direct-spawn` hits ≤ 10. If not, post a comment in PR linking this doc and re-scope before ST-2.

**No tests** — investigation phase.

---

## ST-1 — Canonical file contract *(20 min)*

**Goal:** Before touching call sites, lock down the semantics of `~/.qcut/.env` as *the* QCut-managed credential file. Nothing functional changes yet — this is a documentation + type-level seam.

**Files to modify:**

- `electron/native-pipeline/infra/key-manager.ts`
  - Add JSDoc block at top of file stating: "Canonical QCut credential file. Single source of truth for file-based credentials per docs/task/api-keys-precedence-ux/ONE-ENV-FILE.md §2. AICP reads these via runAicp() wrapper, not via its own credentials.env."
  - No code change.

- `electron/api-key-status.ts`
  - Extend the existing mirror-notice JSDoc (added in PR #285) to include: "Post ONE-ENV-FILE implementation, tier `aicp-cli` and `qcut-env` will collapse to `file`. See docs/task/api-keys-precedence-ux/ONE-ENV-FILE-IMPLEMENTATION.md ST-4."

**Acceptance criteria:**

- Both files compile (`bun check-types` in `electron/`).
- PR description links the canonical file contract.

**No tests** — docstring-only change.

---

## ST-2 — Introduce AICP wrapper *(45 min)*

**Goal:** Centralise AICP invocation. Every call site routes through one helper that injects `~/.qcut/.env` keys into the child process env.

**Files to create:**

- `electron/native-pipeline/infra/aicp-wrapper.ts`
  - Exports `runAicp(args: string[], opts?: { cwd?: string; stdio?: "inherit" | "pipe" }): Promise<{ stdout: string; stderr: string; code: number }>`.
  - Resolves binary path (reuse existing resolver — do NOT duplicate; audit uses in ST-0 to find it; likely `resolveAicpBinary()` somewhere in `electron/claude/` or `electron/native-pipeline/`).
  - Reads file-based keys via `loadEnvFile()` from `electron/native-pipeline/infra/key-manager.ts:206`.
  - Spawns with `{ env: { ...loadedKeys, ...process.env } }` — **loaded keys first, process.env wins** (preserves precedence: shell env beats file).
  - Exports `getAicpKeyNames(): readonly string[]` — the 3 env names AICP understands (FAL_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY). Centralises the AICP vocabulary used by both the wrapper and the migration routine (ST-3).

**Files to modify:**

- Every `direct-spawn` hit from ST-0 — replace `spawn('/path/to/aicp', args, ...)` with `import { runAicp } from '@/electron/native-pipeline/infra/aicp-wrapper'` + `await runAicp(args, { cwd })`.

**Tests to create:**

- `electron/native-pipeline/infra/__tests__/aicp-wrapper.test.ts`
  - **Test case 1** — env injection: point fake binary at a shell script echoing `$FAL_KEY`. Populate `~/.qcut/.env` via `setKey('FAL_KEY', 'from-file')` in a temp HOME. Unset `process.env.FAL_KEY`. Assert stdout is `from-file`.
  - **Test case 2** — process.env precedence: same setup, but also set `process.env.FAL_KEY = 'from-env'`. Assert stdout is `from-env`.
  - **Test case 3** — missing file: delete `~/.qcut/.env`. Run wrapper. Assert it does not throw, runs AICP with only `process.env`.
  - **Test case 4** — exit code propagation: fake binary exits 3. Assert resolved `code === 3` and rejection semantics match the existing spawn helpers.
  - Uses the temp-HOME pattern from `electron/__tests__/api-key-status.test.ts`.
  - Fake-binary fixtures under `electron/native-pipeline/infra/__tests__/fixtures/fake-aicp.sh` + `.cmd` for Windows parity.

**Acceptance criteria:**

- All 4 tests pass.
- `bun check-types` in `electron/` clean.
- Audit list from ST-0 annotated with wrapper-migration status per line.

---

## ST-3 — Migration routine *(30 min)*

**Goal:** On first launch of the unified-file build, copy any QCut-relevant keys from the old AICP credentials file into `~/.qcut/.env` if not already present. Idempotent via marker file.

**Files to modify:**

- `electron/api-key-handler.ts`
  - Add `migrateToSingleEnvFile(): Promise<void>` near top of file, exported for testability.
  - Wire call into `setupApiKeyIPC()` **before** the existing startup sync block (current lines 398–409 per TWO-ENV-FILES.md references).
  - Marker path: `path.join(app.getPath('userData'), '.env-file-unified')`.
  - Body: for each AICP-relevant field (FAL_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY via `getAicpKeyNames()` from ST-2), if `getKey(envName)` returns empty AND the old `credentials.env` has a value, call `setKey(envName, value)`. Write marker file with ISO timestamp when done.

**Files to create:**

- `electron/__tests__/api-key-migration.test.ts`
  - **Test case 1** — fresh migration: temp HOME with only `~/.config/video-ai-studio/credentials.env` containing `FAL_KEY=abc`. Run `migrateToSingleEnvFile()`. Assert `~/.qcut/.env` now contains `FAL_KEY=abc` and marker file exists.
  - **Test case 2** — idempotent: invoke twice; assert second call is a no-op (`fs.stat(marker).mtime` unchanged).
  - **Test case 3** — non-clobber: prime `~/.qcut/.env` with `FAL_KEY=preexisting`; old file has `FAL_KEY=abc`. Migrate. Assert `~/.qcut/.env` still has `preexisting`.
  - **Test case 4** — only AICP-vocabulary keys migrate: old file has `CUSTOM_KEY=xyz`; assert it's not copied.
  - **Test case 5** — marker absent on legacy HOME: if marker never created (fresh install), migration proceeds.

**Acceptance criteria:**

- All 5 tests pass.
- Marker file persists across QCut restarts (manually verified).
- `bun check-types` clean.

---

## ST-4 — Collapse precedence chain to 3 tiers *(45 min)*

**Goal:** Drop the `aicp-cli` vs `qcut-env` distinction throughout the codebase. Rename to a single `file` tier.

**Files to modify:**

- `electron/api-key-status.ts`
  - Update `KEY_SOURCE_PRECEDENCE` to `["environment", "electron", "file"] as const`.
  - Update `KeySource` type.
  - Update `KeyPresence` interface: replace `aicpCli` + `qcutEnv` with single `file` boolean.
  - Update `computeKeyStatus()` — drop one tier's logic.

- `electron/api-key-handler.ts`
  - Merge `loadAicpCredentials()` + `loadQcutEnvKeys()` into a single `loadFileKeys()`. During beta, `loadFileKeys` reads both and merges (qcut-env wins) to keep tolerant of users still writing to AICP file; remove AICP read after one release.
  - Delete `syncToAicpCredentials()` (lines 211–251).
  - Rename `syncToQcutEnv()` → `syncToEnvFile()` (lines 259–274).
  - Update `AICP_REVERSE_MAP` — keep, but rename to `AICP_VOCAB` (semantics: "keys AICP understands"; no longer tied to writing credentials.env).
  - Simplify `getDecryptedApiKeys()` fallback chain to 3 lookups.

- **Mirror updates** (per api-key-status.ts:4-13 cross-rootDir mirror notice):
  - `packages/platform-core/src/types/core-api.ts` — update `KEY_SOURCE_PRECEDENCE` export + `KeySource` type + mirror-notice JSDoc.
  - `electron/preload-types/supporting-types.ts` — update type aliases.

**Tests to update:**

- `electron/__tests__/api-key-status.test.ts`
  - Update snapshot to reflect 3-tier precedence.
  - Update table-driven tests for `computeKeyStatus` — replace (env, electron, aicp, qcut) 4-tuples with (env, electron, file) 3-tuples.

- `electron/__tests__/api-key-aicp-fallback.test.ts`
  - Rename file → `api-key-file-fallback.test.ts`.
  - Update test names: "AICP fallback" → "file fallback".
  - Scenarios: (a) only file set → resolved source === `'file'`; (b) file + electron set → electron wins; (c) file + environment set → environment wins.

- `electron/__tests__/api-key-injection.test.ts`
  - Update expected env injection ordering.

**Tests to create:**

- None new — all coverage already exists at the tier boundary, only the scenarios shrink.

**Acceptance criteria:**

- `bun check-types` in both `apps/web/` and `electron/` clean.
- Full `bun run test` suite green.
- Snapshot diff reviewed in PR.

---

## ST-5 — UI simplification *(30 min)*

**Goal:** Match PR #285's precedence UX to the new 3-tier model.

**Files to modify:**

- `apps/web/src/components/editor/properties-panel/api-keys-view.tsx`
  - `AICP_SYNCED_FIELDS` constant — delete or convert to `AICP_VOCAB_FIELDS` (still used by toast copy "synced to AICP via env wrapper"; see ST-6 for wording).
  - Save handler toast description: keep the first sentence (destinations), drop the AICP-specific sentence (AICP reads env directly now), keep shadow warning sentence (unchanged).
  - Remove `"aicp-cli"` handling from any source-label switch statement.

- `apps/web/src/components/editor/properties-panel/api-key-field.tsx`
  - `KeySourceBadge` variants — collapse `aicp-cli` + `qcut-env` branches into `file`.
  - `shadowedBy` array can now contain at most one entry (`"file"`), not two.
  - Fallback chip gate (`value.trim() !== ""`) — unchanged; keeps Devin's fix from PR #285.

- `apps/web/src/components/editor/properties-panel/api-keys-precedence-info.tsx` (if present per PLAN.md §4; else in api-keys-view.tsx)
  - Update copy to describe 3 tiers instead of 4.
  - Update inline code references (`~/.config/video-ai-studio/credentials.env` → remove; only `~/.qcut/.env` remains).

**Tests to update:**

- `apps/web/src/components/editor/properties-panel/__tests__/api-keys-view.test.tsx` (create if not present)
  - Assert precedence info renders 3 tier rows (env, electron, file).
  - Assert toast description on save contains the single file path.
  - Assert shadowedBy badge renders `"file"` not `"qcut-env"` / `"aicp-cli"`.

- `apps/web/src/components/editor/properties-panel/__tests__/api-key-field.test.tsx` (create if not present)
  - Assert `KeySourceBadge` renders correct label per source literal.
  - Assert fallback chip hidden when value is empty.

**Acceptance criteria:**

- Snapshot-equivalent tests pass.
- Manual verification: open QCut, save a key, confirm toast + precedence info copy reflect 3 tiers.
- `bun lint:clean` passes.

---

## ST-6 — Doc updates *(30 min)*

**Goal:** Make the docs reflect the single-file reality. Preserve historical context.

**Files to modify:**

- `docs/task/api-keys-precedence-ux/TWO-ENV-FILES.md`
  - Prepend a banner at line 1: `> **Superseded by [ONE-ENV-FILE-IMPLEMENTATION.md](./ONE-ENV-FILE-IMPLEMENTATION.md)** — historical record of the pre-unification design. Kept in place because the migration routine relies on the logic described below.`
  - Do NOT delete content — migration routine depends on understanding the old paths.

- `docs/task/api-keys-precedence-ux/TWO-ENV-FILES.zh-CN.md` *(if created — check current state)*
  - Same banner, Chinese.

- `docs/task/api-keys-precedence-ux/IMPLEMENTATION.md`
  - Add a "Post-unification addendum" section at the bottom: "After ONE-ENV-FILE implementation, the precedence UX operates on 3 tiers; the 4-tier copy in §X was accurate at time of PR #285 and remains historically valid."

- `docs/task/api-keys-precedence-ux/PLAN.md`
  - Add brief cross-ref to `ONE-ENV-FILE-IMPLEMENTATION.md` near the tier table.

- `CLAUDE.md`
  - In the Environment Variables section, add one line below the existing `GMI_API_KEY` line: "File-based credentials for all of the above live in `~/.qcut/.env` (single source of truth — see docs/task/api-keys-precedence-ux/ONE-ENV-FILE-IMPLEMENTATION.md)."

- `resources/default-skills/ai-content-pipeline/Skill.md`
  - Clarify credential section: "QCut manages AICP-relevant keys (FAL, Gemini, OpenRouter) via `~/.qcut/.env`. AICP's own `credentials.env` remains the destination of manual `aicp set-key` writes; QCut's env wrapper merges both at read time."

- `resources/default-skills/native-cli/SKILL.md`
  - Verify storage section — it already correctly states `~/.qcut/.env`. No change expected but confirm during review.

**Tests:** none (docs-only).

**Acceptance criteria:**

- All referenced files have the cross-link to this implementation plan.
- `rg "tier 3|tier 4|aicp-cli|qcut-env" docs/ apps/ electron/` surfaces no stale references outside historical docs and migration code.

---

## ST-7 — Regression + smoke *(30 min)*

**Goal:** Catch regressions before merge.

**Commands (run from the repository root):**

```bash
bun check-types
bun lint:clean
bun run test
```

**Manual smoke tests (document outcome in PR):**

1. **Clean profile smoke.**
   - Delete `~/.qcut/.env`, `~/.config/video-ai-studio/credentials.env`, `${userData}/api-keys.json`, `${userData}/.env-file-unified`.
   - Launch QCut (dev: `bun run electron:dev`).
   - Save a key in GUI.
   - Confirm `~/.qcut/.env` has the key; `credentials.env` does NOT exist or is untouched.
   - Confirm toast shows single destination.

2. **Legacy AICP-only user smoke.**
   - Prime `~/.config/video-ai-studio/credentials.env` with `FAL_KEY=legacy-aicp`. Remove `~/.qcut/.env`, `${userData}/.env-file-unified`.
   - Launch QCut.
   - Confirm migration toast fires once.
   - Confirm `~/.qcut/.env` now has `FAL_KEY=legacy-aicp`.
   - Confirm marker file exists.
   - Restart QCut; confirm no second migration toast.

3. **AICP CLI end-to-end smoke.**
   - In terminal: `aicp set-key FAL_KEY=manual-cli` (writes to AICP's credentials.env).
   - Launch QCut.
   - Confirm GUI shows the key with source label `file` (via the merge logic in `loadFileKeys`).

4. **Wrapper env-injection smoke.**
   - Invoke any AICP-dependent skill (e.g., `ai-content-pipeline`) from Claude Code.
   - Confirm it completes with keys sourced from `~/.qcut/.env`.

**Tests to create:**

- None at this stage. Coverage added in ST-2 through ST-5.

**Acceptance criteria:**

- All three commands exit 0.
- All four smoke scenarios pass.
- Smoke results pasted into PR description.

---

## ST-8 — Beta window + post-release cleanup *(no coding; spans one release)*

**Goal:** Monitor the migration in the wild before tightening the code.

**Timeline:**

- T+0: ship ST-0 through ST-7. Migration toast active.
- T+1 release (~2 weeks): if no crash reports or migration-error issues, remove the migration toast (keep the routine — it's cheap and covers late upgraders).
  - File: `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` — conditional toast removal (follow-up PR).
- T+2 releases (~4 weeks): stop reading AICP's `credentials.env` from `loadFileKeys()` in `electron/api-key-handler.ts`. Migration is one-shot and the merge path can be removed.

**Tests to update at T+2:**

- `electron/__tests__/api-key-migration.test.ts` — add a "legacy file ignored after marker" test.

**Acceptance criteria:**

- Zero new issues tagged `migration` or `credentials` in the beta window.
- Zero regressions in PR review from Devin / CodeRabbit on follow-up PRs.

---

## 2. Long-Term Maintainability Considerations

Per CLAUDE.md priority axis — these are the reasons each ST is scoped the way it is:

1. **ST-0 gating** — an audit-first approach prevents a wrapper strategy from silently breaking direct callers we didn't know about. Long-term, single source of spawns is cheaper than scattered spawns.
2. **ST-1 docstring contract** — future maintainers reading `key-manager.ts` immediately see the unification rationale instead of discovering it archaeologically.
3. **ST-2 vocabulary centralisation (`getAicpKeyNames()`)** — removes the duplication between wrapper and migration routine. Adding a new AICP-supported key in the future means one edit, not two.
4. **ST-3 idempotent marker** — avoids "flag-day" failures that require user intervention after an OS reinstall. A user copying their `.config/video-ai-studio/` dir to a new machine still gets migrated cleanly.
5. **ST-4 mirror-notice enforcement** — the JSDoc that already exists (from PR #285 work) is extended, not replaced. Keeps the 3-way type duplication auditable.
6. **ST-5 toast simplification** — less UI surface to translate/localise to Chinese going forward (IMPLEMENTATION.zh-CN.md only needs a small diff).
7. **ST-6 superseded-banner on TWO-ENV-FILES.md** — we keep history instead of destroying it. A future engineer debugging migration edge cases has the original design intact.
8. **ST-7 & ST-8 split** — don't batch cleanup with initial ship. Separate PRs shrink blast radius of each merge.

---

## 3. Risk Register

| # | Risk | Mitigation | Owner |
|---|---|---|---|
| R1 | AICP binary writes to `credentials.env` non-additively, wiping migrated values | ST-0 empirical test before ST-3; `~/.qcut/.env` never depends on AICP writes | QCut dev |
| R2 | Claude Code skill runtime strips env when spawning children | Add `passThroughEnv: true` equivalent; test wrapper under realistic skill invocation in ST-7 smoke #4 | QCut dev |
| R3 | Windows symlink / junction complications | None — strategy 3.3 avoids symlinks entirely | N/A |
| R4 | User downgrades to pre-unification build | Marker file inert for old code; both files still exist; old 4-tier chain resolves correctly. Verified in ST-8 T+0 smoke | QCut dev |
| R5 | External scripts directly reading `credentials.env` expect QCut to keep writing it | Keep `credentials.env` writable by AICP CLI (`aicp set-key`); only remove QCut's writes. External scripts reading QCut-managed keys should switch to `~/.qcut/.env` — noted in ST-6 docs | Docs |
| R6 | Migration routine fails silently (disk full, permission denied) | ST-3 tests cover non-clobber; add telemetry hook in follow-up (out of scope for this plan) | Future work |

---

## 4. Rollback Plan

Each subtask is independently revertable by commit.

- **If ST-2 ships broken:** revert the wrapper commit. All call sites fall back to direct spawn. AICP still reads its own `credentials.env` (triple-write hasn't been removed yet at this point — that's ST-4).
- **If ST-3 ships broken:** revert migration commit. Marker file untouched on users who haven't upgraded; users who migrated already have keys in both files (safe).
- **If ST-4 ships broken (most invasive):** revert the precedence-collapse commit. Requires coordinated revert on `electron/` and the two mirror files. Restore `syncToAicpCredentials` + 4-tier enum. Tests in `api-key-aicp-fallback.test.ts` (now renamed) also need to be restored.
- **If ST-5 ships broken:** revert UI commit; 3-tier backend still works, UI just displays slightly stale labels.
- **Full rollback:** revert ST-2 through ST-5 in reverse order. Migration data (keys now in `~/.qcut/.env`) is preserved — it's just that QCut resumes reading both files via the 4-tier chain.

Do NOT delete the AICP `credentials.env` during rollback; it's the fallback for the unmigrated path.

---

## 5. Definition of Done

- [x] ST-0 audit complete; 1 direct AICP spawn site documented in § A below (well under the ≤ 10 gate). Shipped in `58a63369`.
- [x] ST-1 canonical docstrings land in `key-manager.ts` and `api-key-status.ts`. Shipped in `58a63369`.
- [x] ST-2 env-injection centralised at `electron/api-key-vocabulary.ts` + refactored `buildSpawnEnvironment()` (see § A.4 for why no new `aicp-wrapper.ts` was needed). 9 passing unit tests at `electron/__tests__/command-builder-env.test.ts`. Shipped in `e88e9384`.
- [x] ST-3 `migrateToSingleEnvFile()` + 7 passing unit tests at `electron/__tests__/api-key-migration.test.ts`. Marker file verified across idempotence + non-clobber scenarios. Shipped in `7d7e8d36`.
- [x] ST-4 precedence chain is 3 tiers across `electron/api-key-status.ts`, `packages/platform-core/src/types/core-api.ts`, `electron/preload-types/supporting-types.ts`. Snapshot test updated. Shipped in `3bc3b3d7`.
- [x] ST-5 UI renders 3-tier precedence info. `KeySourceBadge` collapses to 3 labels. 9 component tests across api-key-field + api-keys-precedence-info pass. Save toast copy rewritten. Shipped in `d07fb319`.
- [x] ST-6 TWO-ENV-FILES.md banner added. CLAUDE.md env section updated. `ai-content-pipeline/Skill.md` + `native-cli/SKILL.md` clarified. Shipped in `5f6363e7`.
- [x] ST-7 `bun x tsc --noEmit` (electron + apps/web + scripts) clean; `bun run lint:clean` clean (5 infos for unrelated preexisting `docs/` parse skips); `bun run test` 5423/5423 non-skipped tests pass. 24 timeline-store errors verified preexisting on master via git stash. Biome-format sweep shipped in `d75bbe73`.
- [ ] ST-8 scheduled: follow-up PR queued on calendar for T+1 release (toast removal) and T+2 release (drop AICP file read).

---

## A. ST-0 Audit Results *(completed 2026-04-24)*

**Grep invocation:**

```bash
rg --no-heading -n 'resources[/\\]bin[/\\]aicp|aicp[/\\](darwin|linux|win32)[/\\]aicp' electron resources apps packages
rg --no-heading -n "getBinaryPath\(" electron apps packages
rg --no-heading -n 'spawn\(|execFile\(|spawnSync\(' electron/ai-pipeline-handler electron/claude
```

### A.1 Direct-spawn hits (runtime code)

| # | Location | Classification | Notes |
|---|---|---|---|
| 1 | `electron/main.ts:765` | `direct-spawn` | `qcut set-key` / `check-keys` / `delete-key` CLI — intentionally passes stdio-inherit to AICP with NO env injection. This is a deliberate pass-through to AICP's own key-management flow; wrapping it would break the user's expectation that `qcut set-key` writes to AICP's own `credentials.env`. **Keep as-is.** |
| 2 | `electron/ai-pipeline-handler/pipeline-manager.ts:228` | `via-env-builder` | Already calls `buildSpawnEnvironment()` (`electron/ai-pipeline-handler/command-builder.ts:115-138`) which injects `FAL_KEY`, `FAL_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY` from `getDecryptedApiKeys()`. **This is effectively the wrapper ST-2 proposes.** |

**Total direct-spawn: 1** (below the ≤ 10 gate). ST-2 can proceed.

### A.2 Non-runtime hits

- **Skill docs (6 hits):**
  - `resources/default-skills/qcut-toolkit/ai-content-pipeline/SKILL.md:34,74,75`
  - `resources/default-skills/ai-content-pipeline/Skill.md:34,74,75`
- **Test fixtures / mocks:**
  - `electron/__tests__/api-key-injection.test.ts:50,210` — mock path strings.
  - `electron/__tests__/binary-manager.test.ts:93,94,157,170,175,180,191,195,200,218` — `BinaryManager` unit tests.
  - `electron/__tests__/ai-pipeline-handler.test.ts:55,193,239,266,296,331` — pipeline handler mocks.
  - `electron/__tests__/api-key-aicp-fallback.test.ts:207,212` — fallback semantics (affected by ST-4).
- **Upstream AICP repo (vendored):** `packages/video-agent-skill/**/*` — AICP's own tests and spec. Not QCut's code; out of scope.
- **ps-output mock:** `packages/qagent/packages/web/src/lib/__tests__/cli-sessions.test.ts:125` — literal string in a `ps` output fixture; not a spawn site.

### A.3 Helper / resolver

- `electron/binary-manager.ts:426` — `BinaryManager.getBinaryPath()`. **Already a single resolver.** No duplication to consolidate.
- `electron/ai-pipeline-handler/environment.ts:20,115` — `getBundledConfig()` + `detectEnvironment()` build the `PipelineConfig` consumed by pipeline-manager. Correct layering; no refactor needed.

### A.4 Conclusions reshaping downstream subtasks

1. **ST-2 scope shrinks.** No new `aicp-wrapper.ts` module is needed — `buildSpawnEnvironment()` already exists and works. ST-2 becomes: (a) confirm `buildSpawnEnvironment` covers AICP's 3-key vocabulary (`FAL_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`) and drop any fields AICP does not understand, (b) add the 4 unit tests from §ST-2 targeting `command-builder.ts`, (c) centralize `getAicpKeyNames()` to remove duplication between `buildSpawnEnvironment` and `AICP_REVERSE_MAP`.
2. **`electron/main.ts:765` remains a direct spawn by design.** The `qcut set-key` CLI is a pass-through by contract. Document this in ST-1 docstrings; do not wrap.
3. **Dev-mode `system aicp` path** (`environment.ts:107-118`) also does not go through `buildSpawnEnvironment` during version detection (only during `execute()`). Version detection reads no keys, so this is safe to leave alone. Note in ST-1 docs.

---

## 6. See Also

- [ONE-ENV-FILE.md](./ONE-ENV-FILE.md) — design rationale for this implementation.
- [TWO-ENV-FILES.md](./TWO-ENV-FILES.md) — current two-file design (soon to be superseded).
- [PLAN.md](./PLAN.md) / [IMPLEMENTATION.md](./IMPLEMENTATION.md) — prior precedence UX work (PR #285).
- `electron/api-key-handler.ts` — save-time sync; target of ST-4.
- `electron/api-key-status.ts` — precedence constant; target of ST-4.
- `electron/native-pipeline/infra/key-manager.ts` — canonical file reader/writer; target of ST-1 docstring, ST-2 consumer.
- `docs/completed/ai-pipeline/robust-fal-key-cli-implementation.md` — historical 3-tier → 4-tier context.
