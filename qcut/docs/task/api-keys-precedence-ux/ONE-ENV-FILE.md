# Design Discussion: Collapsing QCut's Two File-Based Credential Stores Into One

- **Status:** Design / discussion — not an implementation plan.
- **Companion docs:** [TWO-ENV-FILES.md](./TWO-ENV-FILES.md) (today's two-file reality), [PLAN.md](./PLAN.md) (precedence UX, issue #283), [IMPLEMENTATION.md](./IMPLEMENTATION.md).
- **Priority:** Long-term maintainability > scalability > performance > short-term gains.
- **TL;DR:** Today QCut's GUI triple-writes the user's keys into an encrypted Electron store plus **two** plain-text env files (`~/.config/video-ai-studio/credentials.env` for AICP, `~/.qcut/.env` for the native pipeline CLI). This doc examines whether it's worth collapsing the two env files into one, and — if so — which strategy (symlink, shim, fork, wrapper) has the best long-term maintenance profile.

---

## 1. Motivation — Why Revisit the Split?

Today's design is documented in [TWO-ENV-FILES.md §1.3](./TWO-ENV-FILES.md) and is deliberate (three structural reasons: different vocabularies, standalone operation, AICP is external). The reasons it's worth revisiting anyway:

1. **Duplication is a correctness risk.** `syncToAicpCredentials` ([`electron/api-key-handler.ts:211-251`](../../../electron/api-key-handler.ts)) and `syncToQcutEnv` ([`electron/api-key-handler.ts:259-274`](../../../electron/api-key-handler.ts)) are two separate write paths. If one fails silently (both currently `console.warn` and swallow), the two files can diverge — and the 4-tier precedence chain then picks the *AICP* value with a `shadowedBy: [qcut-env]` label the user never asked for.
2. **Precedence chain complexity is user-visible.** The PR #285 UX work exists specifically because the 4-tier chain is confusing. Tier 3 vs tier 4 is the least-defensible distinction of the four — both are plain-text env files in the home directory with overlapping key sets. Collapsing them to one tier simplifies the mental model from "where is the key stored?" (4 answers) to a cleaner 3-tier chain.
3. **Key-set drift.** AICP supports 3 keys, the native CLI supports 15 (see `KEY_NAMES` in [`electron/native-pipeline/infra/key-manager.ts:14-30`](../../../electron/native-pipeline/infra/key-manager.ts)). Every new provider (see the recent GPT-Image-2 / GMI additions in commits `67e7064e6`, `9190fbd8f`) widens the gap and adds another "AICP can't see this" asterisk to the docs.
4. **Docs burden.** Maintaining TWO-ENV-FILES.md, the inline comments in `api-key-handler.ts`, and the per-tier badges in the UI is overhead we carry forever unless we unify.
5. **On-disk footprint is small, but cognitive footprint isn't.** Two files, two paths (Windows + Unix), two different ownership models. A single file is easier to `.gitignore`, back up, migrate, and document.

**Counter-motivation (worth stating):** the current design *works*. The triple-write is cheap, the status surface already reports shadowing, and AICP's hard-coded path means a pure-unification project buys us a better UX at the cost of either a fork or a bridging hack. This doc is about whether that trade is worth making — not an assertion that it is.

## 2. Goal / Expected End State

Assume success. Then:

1. **One file** on disk holds QCut's plain-text credentials. Candidate paths discussed in §4.
2. **AICP still works standalone.** `aicp set-key FAL_KEY …` and `aicp gen image …` invoked from a terminal still read and write credentials successfully — users who never open the QCut GUI are not broken.
3. **The precedence chain collapses to 3 tiers** (`environment` → `electron` → `file`) — one of the two file-based tiers disappears, and the `shadowedBy` report loses its most common false-positive pair (tier 3 + tier 4 set to identical values by QCut's own save handler).
4. **Migration is automatic.** Existing users with values in either or both files end up with their keys intact on next launch, with no manual action required.
5. **No behaviour change for external callers.** Anything reading `~/.config/video-ai-studio/credentials.env` directly (Claude Code skills, user scripts) keeps working — either via the real file or a transparent redirection.

**Non-goals (explicit):**

- Not removing the encrypted Electron safeStorage tier — that stays authoritative for the GUI.
- Not eliminating `process.env` as the highest-priority tier.
- Not changing AICP's key vocabulary (still 3 keys) or the native pipeline's (still 15).
- Not moving to a database / keychain / OS credential store — separate conversation.

## 3. Strategy Options for Bridging AICP

AICP's credential path is hard-coded in the Python binary shipped at `electron/resources/bin/aicp/<platform>/aicp`. Any unification must answer: **how does AICP still find its keys?** Four strategies, ordered by invasiveness:

### 3.1 Symlink (least invasive)

On first launch after upgrade, create `~/.config/video-ai-studio/credentials.env` as a **symlink** pointing at the canonical single file (e.g. `~/.qcut/.env`). Both paths resolve to the same inode; AICP sees no change.

- **Pros:** Zero code change in AICP. Transparent to external scripts. Reversible (delete the symlink to roll back). One write path in `api-key-handler.ts`.
- **Cons:**
  - **Windows symlink UAC pain.** Windows requires Developer Mode or admin elevation for `fs.symlink` to succeed without an NTFS junction workaround. Junctions work for directories but not files — so on Windows we'd need a **hard link** (same-volume only) or a different strategy entirely.
  - **Key-set mismatch.** `~/.qcut/.env` contains 15 keys; AICP ignores 12 of them (harmless but messy — AICP's `aicp set-key` flow rewrites the file and could strip unknown lines if AICP's writer is not additive — needs verification).
  - **Surprising for power users** who have their own `credentials.env` they edit manually — on upgrade, that file becomes a symlink pointing elsewhere and their separate edits vanish.
- **Verdict:** Tempting but fragile on Windows and risks data loss on upgrade. Not recommended as the primary strategy.

### 3.2 Shim file (AICP's path is a mirror, not a symlink)

Keep both files on disk but make one the *canonical source* and the other a **generated mirror** that's regenerated every time the canonical file changes. AICP writes to `credentials.env` directly; QCut reads both and reconciles with the canonical file winning.

- **Pros:** No symlink portability issue. AICP's writes via `aicp set-key` are preserved. Windows-safe.
- **Cons:** **This is essentially what we have today** — two files, kept in sync by QCut. All this strategy does is rename `syncToAicpCredentials` as "mirror generation." Doesn't actually reduce file count; only reframes it.
- **Verdict:** Not a real unification. Skip.

### 3.3 Wrapper script around the AICP binary (recommended)

Replace the direct invocation of `electron/resources/bin/aicp/<platform>/aicp` with a thin wrapper (shell script on Unix, `.cmd` on Windows, or a TS script via `bun run`) that:

1. Exports QCut's 3 AICP-relevant keys from `~/.qcut/.env` into the environment.
2. `exec`s the real AICP binary.

The wrapper is what skills and users invoke (`aicp set-key …`, `aicp gen image …`). AICP sees the keys via `process.env`, which it already supports as a higher-priority source than its own credentials file. The credentials file stops being the source of truth for QCut-managed keys.

- **Pros:**
  - **AICP binary untouched.** No fork, no upstream work.
  - **One canonical file** (`~/.qcut/.env`) — the only place QCut writes.
  - **`aicp set-key` still works** — it writes to `credentials.env`, and QCut's wrapper reads from both on the next invocation (merged env), so a user who only uses the AICP CLI never notices.
  - **Windows-safe** — no symlinks required.
- **Cons:**
  - **Invocation path changes.** Any script or skill that invokes the bundled binary directly (bypassing the wrapper) loses this bridge. Needs an audit of all `aicp` call sites (grep `aicp/<platform>/aicp` and `resources/bin/aicp`).
  - **Two writers still exist.** Users running `aicp set-key` write to `credentials.env`; QCut writes to `~/.qcut/.env`. Both are readable, but the "where do I edit?" question gets a longer answer: "either, we merge at read time, but the GUI only writes to `~/.qcut/.env`."
  - **Startup cost.** The wrapper reads `~/.qcut/.env` on every AICP invocation. Negligible (<5 ms) but worth noting.
- **Verdict:** **Recommended.** Best maintenance profile. Leaves AICP untouched, keeps external workflows functional, and gives QCut a single canonical file.

### 3.4 Fork AICP / vendor a patched build

Change AICP's hard-coded credential path to read from `~/.qcut/.env` (or accept a `QCUT_ENV` override). Publish a patched build and swap it into `electron/resources/bin/aicp/`.

- **Pros:** Truly one file, truly one writer. Cleanest mental model.
- **Cons:**
  - **Ongoing cost.** Every AICP upstream release requires re-patching. If AICP is actively developed, this is a permanent tax.
  - **Conflicts with "standalone operation" guarantee.** A patched AICP that only reads `~/.qcut/.env` is no longer a general-purpose AICP binary — you couldn't drop it into a non-QCut install without breaking.
  - **Requires ownership.** We need enough control over AICP to patch it. Unclear today (TWO-ENV-FILES.md §1.3 calls it "external, we vendor it").
- **Verdict:** Best end-state if we're willing to own the patch. Otherwise recommend **3.3**.

### 3.5 Decision matrix

| Strategy | Effort | Risk | Windows support | AICP upstream compatibility | Unified writer |
|---|---|---|---|---|---|
| 3.1 Symlink | Low | Medium (Windows fragile) | Poor | Full | Yes |
| 3.2 Mirror | Low | Low | Full | Full | **No — same as today** |
| 3.3 Wrapper *(recommended)* | Medium | Low | Full | Full | Mostly (AICP CLI writes to its own file; GUI only writes to canonical) |
| 3.4 Fork | High | Medium (patch drift) | Full | **Broken on upstream updates** | Yes |

Recommendation: **ship 3.3 (wrapper) now**, keep 3.4 (fork) as a future option if AICP upstream cooperates.

## 4. Target Single-File Location

Three candidates. Discussed on trade-offs, not yet decided.

### 4.1 `~/.qcut/.env` *(status-quo winner)*

- **Pros:** Already exists. Already managed by `key-manager.ts`. Native CLI already reads it. 15-key vocabulary already supported.
- **Cons:** "Hidden" dir without an XDG base — doesn't follow `$XDG_CONFIG_HOME` on Linux. Not the file external docs reference most often (AICP docs point at `~/.config/video-ai-studio/credentials.env`).
- **Verdict:** Lowest-migration-risk choice. Likely the right answer.

### 4.2 `~/.config/video-ai-studio/credentials.env`

- **Pros:** Already the place AICP looks; a symlink strategy (3.1) becomes trivial.
- **Cons:** Named after AICP, not QCut. Re-using it makes it unclear whether QCut "owns" it or AICP does. If AICP later diverges and rewrites this file on its own schedule, QCut could overwrite the user's manual edits.
- **Verdict:** Avoid — the path's branding is wrong for the product QCut has become.

### 4.3 `~/.config/qcut/credentials.env` (XDG-compliant)

- **Pros:** Follows XDG on Linux. Clear QCut ownership. Clean break.
- **Cons:** **Biggest migration cost** — neither today's file exists at this path. Would break any user script that already hardcodes `~/.qcut/.env`.
- **Verdict:** Correct for a greenfield product. Not worth the churn given we already have `~/.qcut/.env` in the wild.

**Recommendation: 4.1 — keep `~/.qcut/.env` as the canonical file.**

## 5. Impact on the 4-Tier Precedence Chain

Today ([`electron/api-key-status.ts:14-19`](../../../electron/api-key-status.ts)):

```ts
export const KEY_SOURCE_PRECEDENCE = [
    "environment",
    "electron",
    "aicp-cli",
    "qcut-env",
] as const;
```

Under strategy 3.3 (wrapper), the chain collapses to 3 tiers:

```ts
export const KEY_SOURCE_PRECEDENCE = [
    "environment",
    "electron",
    "file",        // was "aicp-cli" + "qcut-env"
] as const;
```

Downstream impact:

- **[`electron/api-key-status.ts`](../../../electron/api-key-status.ts)** — `KEY_SOURCE_PRECEDENCE`, `KeyPresence`, `computeKeyStatus` all drop the `aicpCli` vs `qcutEnv` distinction. `KeyPresence` becomes `{ env, electron, file }`.
- **[`electron/api-key-handler.ts`](../../../electron/api-key-handler.ts)** — `loadAicpCredentials` and `loadQcutEnvKeys` unify into a single `loadFileKeys()`. `syncToAicpCredentials` deletes (AICP reads from env now, via the wrapper). `syncToQcutEnv` keeps its name or renames to `syncToEnvFile`. `getDecryptedApiKeys` drops one tier from each provider's fallback chain.
- **Mirrored constants** (per the comment in `api-key-status.ts:4-13`):
  - `packages/platform-core/src/types/core-api.ts`
  - `electron/preload-types/supporting-types.ts`
  - The snapshot assertion in `electron/__tests__/api-key-status.test.ts` catches drift — it will need updating as part of this change.
- **UI** ([`apps/web/src/components/editor/properties-panel/api-keys-view.tsx`](../../../apps/web/src/components/editor/properties-panel/api-keys-view.tsx) and `api-key-field.tsx`) — the `KeySourceBadge` loses one variant. The "shadowed by" explainer from PR #285 simplifies.

**Net effect:** fewer tiers, smaller surface area, easier docs. The precedence UX work shipped in #285 still applies; it just has one fewer case to explain.

## 6. Migration Path for Existing Users

Three populations to migrate:

1. **GUI users (most common).** They already have both files in sync because every GUI save triple-writes. Post-upgrade: QCut ignores `~/.config/video-ai-studio/credentials.env` for QCut-managed keys (AICP wrapper reads env only); GUI writes only to `~/.qcut/.env`. **No action needed.**
2. **AICP-only CLI users.** They have values in `credentials.env` only. Post-upgrade, the Electron startup migration (see below) copies any QCut-relevant keys (FAL / Gemini / OpenRouter) from `credentials.env` into `~/.qcut/.env` if missing. Their direct `aicp set-key` usage keeps working because the AICP binary still owns `credentials.env` for its own writes.
3. **Power users who manually edit `~/.qcut/.env`.** Already canonical; no action needed.

### 6.1 One-time migration routine

On first launch of the unified-file build, run in `setupApiKeyIPC()`:

```ts
async function migrateToSingleEnvFile(): Promise<void> {
    const marker = path.join(app.getPath("userData"), ".env-file-unified");
    if (fs.existsSync(marker)) return;        // already migrated

    const aicpKeys = loadAicpCredentials();   // existing helper
    for (const [field, envName] of Object.entries(AICP_REVERSE_MAP)) {
        const existing = getKey(envName);     // from key-manager.ts
        const fromAicp = aicpKeys[field as keyof ApiKeys];
        if (!existing && fromAicp) {
            setKey(envName, fromAicp);        // copies into ~/.qcut/.env
        }
    }

    fs.writeFileSync(marker, new Date().toISOString());
}
```

- **Idempotent via marker file** — safe if the user downgrades and re-upgrades.
- **Never overwrites an existing `~/.qcut/.env` value** — conservative merge.
- **Leaves `credentials.env` intact** — AICP CLI keeps writing to it; QCut just stops depending on it being in sync.

### 6.2 Deprecation signal

The precedence panel UI should, for one release, show a soft "Migrating credential store — your keys have been copied to `~/.qcut/.env`" toast on first launch after the upgrade. After one release, remove the toast; the migration routine itself stays indefinitely (it's cheap and covers long-dormant users).

## 7. Open Questions

1. **Does AICP's binary write additive?** If a user runs `aicp set-key FAL_KEY=…`, does AICP rewrite `credentials.env` preserving other lines, or clobber? Determines whether strategy 3.1 (symlink) is safe even setting Windows aside. **Answer needed before committing to a strategy.**
2. **How many internal call sites invoke the AICP binary directly (bypassing any wrapper)?** Audit: `grep -r "aicp/<platform>/aicp\|resources/bin/aicp" electron/ resources/` and every `Skill.md` under `resources/default-skills/`. Strategy 3.3 only works if we can route all of them through the wrapper.
3. **Does Claude Code's skill runtime preserve env when invoking `aicp`?** If it spawns the binary with an empty env (e.g. for sandbox reasons), the wrapper's env export won't reach AICP. Needs empirical test before shipping.
4. **Should the wrapper live in the bundled `resources/bin/` or in `electron/native-pipeline/`?** Affects packaging (code-signing, EXE build inclusion, Windows PATH).
5. **What happens on downgrade?** A user on the unified build runs 2026.05 for a week, then downgrades to 2026.04. Both files still exist; the 4-tier chain resolves them correctly. No data loss expected, but worth verifying the marker file's presence on the older build is inert (it should be — older code won't check for it).
6. **Rename the `qcut-env` source literal to just `file`?** Per §5, if the tier collapses, the literal probably should too — but that's an additional rename that touches the mirrored constants in three places. Defer or bundle?

## 8. If We Proceed — Implementation Subtasks

This section exists to answer "what would it take?" — not to signal agreement to build. Each subtask is scoped to roughly 20–45 minutes. Total rough estimate: ~4–5h (well over 20 min per CLAUDE.md convention → broken down below).

### 8.1 Subtask A — Audit AICP call sites *(30 min, investigation-only)*

**Goal:** Answer open question 7.2.

- **Grep targets:** `electron/`, `resources/default-skills/`, `apps/web/src/`, `packages/`.
- **Deliverable:** A bullet list of every location that spawns the AICP binary + whether it goes through a single helper or directly `spawn()`s the path.
- **Files to check (expected hits):**
  - `electron/claude/*-handler.ts`
  - `resources/default-skills/ai-content-pipeline/Skill.md`
  - `resources/default-skills/qcut-toolkit/ai-content-pipeline/SKILL.md`
  - Any `electron/native-pipeline/**/*.ts` that shells out.
- **No tests.** Pure reconnaissance.

### 8.2 Subtask B — Introduce AICP wrapper *(45 min)*

**Goal:** Centralise AICP invocation; make every caller go through a single helper that prepends env from `~/.qcut/.env`.

- **New file:** `electron/native-pipeline/infra/aicp-wrapper.ts` — exports `runAicp(args: string[], opts?: { cwd?: string }): Promise<{ stdout; stderr; code }>`. Internally reads keys via `loadEnvFile()` from [`key-manager.ts:206`](../../../electron/native-pipeline/infra/key-manager.ts) and spawns the binary with `{ env: { ...process.env, ...loadedKeys } }`.
- **Callers to update:** every site found in subtask A.
- **Existing binary resolver:** there should already be a helper that resolves `electron/resources/bin/aicp/<platform>/aicp` — reuse it; do not duplicate.
- **Tests:** `electron/native-pipeline/infra/__tests__/aicp-wrapper.test.ts`
  - Uses a fake binary (shell script echoing env) to assert env is populated from `~/.qcut/.env` when `process.env` is unset.
  - Asserts `process.env` wins over the file when both are set (preserves today's precedence).

### 8.3 Subtask C — Migration routine *(30 min)*

**Goal:** Ship §6.1 and §6.2.

- **Modify:** [`electron/api-key-handler.ts`](../../../electron/api-key-handler.ts) — add `migrateToSingleEnvFile()`, call from `setupApiKeyIPC()` before the existing startup sync block at lines 398–409.
- **Marker file:** `userData/.env-file-unified`.
- **Tests:** `electron/__tests__/api-key-migration.test.ts`
  - Populate a temp HOME with only `credentials.env` set → assert `~/.qcut/.env` gains the three AICP-compatible keys after migration.
  - Assert idempotence — second call is a no-op (marker present).
  - Assert non-clobber — if `~/.qcut/.env` already has a value, migration does not overwrite.

### 8.4 Subtask D — Collapse precedence chain to 3 tiers *(45 min)*

**Goal:** Drop the tier 3 vs tier 4 distinction throughout.

- **Modify:** [`electron/api-key-status.ts`](../../../electron/api-key-status.ts) — rename `aicp-cli` + `qcut-env` to `file`; update `KeyPresence`, `computeKeyStatus`.
- **Modify:** [`electron/api-key-handler.ts`](../../../electron/api-key-handler.ts) — unify `loadAicpCredentials` + `loadQcutEnvKeys` into `loadFileKeys`; delete `syncToAicpCredentials`; rename `syncToQcutEnv` → `syncToEnvFile`; simplify `getDecryptedApiKeys` fallback chains.
- **Mirror to:**
  - `packages/platform-core/src/types/core-api.ts`
  - `electron/preload-types/supporting-types.ts`
- **Tests:**
  - Update `electron/__tests__/api-key-status.test.ts` snapshot.
  - Update `electron/__tests__/api-key-aicp-fallback.test.ts` — the "AICP fallback" becomes "file fallback".
  - Update `electron/__tests__/api-key-injection.test.ts` as needed.

### 8.5 Subtask E — UI simplification *(30 min)*

**Goal:** Match PR #285's precedence UX to the collapsed 3-tier model.

- **Modify:** [`apps/web/src/components/editor/properties-panel/api-keys-view.tsx`](../../../apps/web/src/components/editor/properties-panel/api-keys-view.tsx) — drop one badge variant; update the `api-keys-precedence-info.tsx` copy (per PLAN.md §4) to say three tiers instead of four.
- **Modify:** `apps/web/src/components/editor/properties-panel/api-key-field.tsx` — `shadowedBy` array can now contain at most one entry (`file`), not two.
- **Tests:**
  - `apps/web/src/components/editor/properties-panel/__tests__/api-keys-view.test.tsx` (add or extend) — assert the precedence info renders 3 tiers.

### 8.6 Subtask F — Doc updates *(30 min)*

- **Modify:** [`docs/task/api-keys-precedence-ux/TWO-ENV-FILES.md`](./TWO-ENV-FILES.md) — prepend a "Superseded by ONE-ENV-FILE.md" banner (but leave the doc in place for history).
- **Modify:** [`CLAUDE.md`](../../../CLAUDE.md) — env vars section already lists the correct vars; add a one-line note that file-based credentials live in `~/.qcut/.env` (single source).
- **Modify:** [`resources/default-skills/ai-content-pipeline/Skill.md`](../../../resources/default-skills/ai-content-pipeline/Skill.md) — clarify that QCut reads keys from `~/.qcut/.env`; AICP's own `credentials.env` is only for direct `aicp set-key` usage.
- **Modify:** [`resources/default-skills/native-cli/SKILL.md`](../../../resources/default-skills/native-cli/SKILL.md) — already correct; double-check the storage section.
- **No tests** (docs-only).

### 8.7 Subtask G — Regression pass *(30 min)*

- `bun check-types` on `apps/web/` and `electron/`.
- `bun lint:clean`.
- `bun run test` — full vitest pass, with focus on the renamed tests from Subtask D.
- Manual smoke: fresh profile (delete `~/.qcut/`, `~/.config/video-ai-studio/`, and `userData/api-keys.json`) → open GUI → save a key → confirm `~/.qcut/.env` has it and `credentials.env` does **not** (unless AICP wrote it).
- Manual smoke: from terminal, `aicp set-key FAL_KEY=…` → launch QCut → confirm the key shows in the GUI via the file tier.

### 8.8 Subtask H — Migration beta *(spans one release cycle)*

- Ship subtasks A–G behind no flag (the migration is idempotent and safe).
- After one release, remove the first-launch migration toast (Subtask C §6.2).
- Keep the migration routine itself indefinitely.

### 8.9 Total estimate

~4–4.5 hours of focused coding, plus one release cycle for the beta period. Breaks down into 8 subtasks each ≤ 45 min, consistent with the /planit convention.

## 9. Recommendation

Proceed with strategy 3.3 (wrapper) + target 4.1 (keep `~/.qcut/.env`), **after** answering open questions §7.1–§7.3 via the Subtask A audit and a one-hour empirical test. Do not start coding Subtasks B–G until the audit confirms the call-site count is manageable.

If the audit surfaces >10 direct AICP invocations across skills we don't own, re-evaluate — at that point strategy 3.4 (fork) may become cheaper long-term than threading every caller through a wrapper.

## 10. See Also

- [TWO-ENV-FILES.md](./TWO-ENV-FILES.md) — why we have two files today.
- [PLAN.md](./PLAN.md) — precedence UX (PR #285).
- [`electron/api-key-handler.ts`](../../../electron/api-key-handler.ts) — save-time sync.
- [`electron/api-key-status.ts`](../../../electron/api-key-status.ts) — precedence chain constant.
- [`electron/native-pipeline/infra/key-manager.ts`](../../../electron/native-pipeline/infra/key-manager.ts) — `~/.qcut/.env` reader/writer; `loadEnvFile()` env injection.
- [`docs/completed/ai-pipeline/robust-fal-key-cli-implementation.md`](../../completed/ai-pipeline/robust-fal-key-cli-implementation.md) — historical context for the 3-tier → 4-tier growth.
