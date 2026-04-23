# Implementation Checklist: API Keys Precedence UX

> Companion to [PLAN.md](./PLAN.md) — rationale, architecture, and subtask detail live there. This file is the actionable step list. Tick each box as you ship.
>
> **Branch:** `qur-29-api-keys-precedence-ux`
> **Issue:** [#283](https://github.com/Quriosity-agent/qcut/issues/283) · **Linear:** QUR-29
> **Commit prefix:** `refactor(api-keys): …` for ST-1, `test(api-keys): …` for ST-2/6/7, `feat(api-keys): …` for ST-3/4/5.

## Sequencing rules

- Ship ST-1 → ST-2 first (backend contract + its tests). Nothing in the UI compiles against `shadowedBy` until the platform type lands.
- ST-3 can proceed in parallel with ST-4 (different files) once ST-1 types are merged in the working branch.
- ST-5 wires everything through `ApiKeysView`; do it after ST-3 and ST-4 are in place.
- ST-6 tests the components from ST-3/4.
- ST-7 Playwright covers the integrated flow after ST-5.
- ST-8 QA.md checklist + cleanup.

Each subtask = one atomic commit. Keep the branch as one PR.

---

## ST-1 · Extend `KeyStatus` with `shadowedBy` + precedence constant

**Paths** (confirmed against master):

| File | Line | What |
|---|---|---|
| `electron/api-key-handler.ts` | `36` | `interface KeyStatus` — add `shadowedBy: KeySource[]` |
| `electron/api-key-handler.ts` | `41` | `interface ApiKeysStatus` — 8 fields already defined; no structural change but keep alphabetical |
| `electron/api-key-handler.ts` | top (~15) | Add `export const KEY_SOURCE_PRECEDENCE = ["environment", "electron", "aicp-cli", "qcut-env"] as const;` and derive `export type KeySource = typeof KEY_SOURCE_PRECEDENCE[number];` |
| `electron/api-key-handler.ts` | `339` | `getDecryptedApiKeys()` — source of truth for the 4-tier resolution chain; mirror every tier probe into the new `resolveStatus`. |
| `electron/api-key-handler.ts` | `506` | Rewrite `resolveStatus(envVar, appKey, fallbackEnvVar?)`: probe **all four** tiers (env → electron safeStorage → aicp-cli → qcut-env), return `{ set, source, shadowedBy }`. `source` = highest tier with a value. `shadowedBy` = lower tiers that also have a value, in precedence order. |
| `electron/api-key-handler.ts` | `502-536` | IPC handler — unchanged shape, just richer per-field status. |
| `packages/platform-core/src/types/core-api.ts` | `74-80` | `PlatformApiKeysAPI.status()` currently returns `Record<string, { set: boolean; source: string }>`. Replace with a named type that includes `shadowedBy: readonly KeySource[]`. Export `KeySource` here so renderer code can import without dipping into `electron/`. |

**Design note:** the current `resolveStatus` does **not** probe the `qcut-env` tier at all (confirmed by grep — only env var + `storedKeys[appKey]` are checked). This is a latent bug PLAN §6 point 2 calls out; fix it in ST-1 so the status reflects reality.

**Keep `source` values identical to `KeySource` string literals.** Renderer code uses them unmodified for display; rename would cascade.

**Factor the pure logic out** so ST-2 can unit-test without hoisting Electron imports (follow `electron/__tests__/api-key-aicp-fallback.test.ts` pattern):

```ts
// Export this pure helper from api-key-handler.ts (or a new util sibling):
export function computeKeyStatus(presence: {
  env: boolean;
  electron: boolean;
  aicpCli: boolean;
  qcutEnv: boolean;
}): KeyStatus
```

Then the IPC handler just builds the `presence` object per field and delegates.

**Verify:**

```bash
cd electron && bunx tsc --noEmit -p tsconfig.json
cd apps/web && bunx tsc --noEmit -p tsconfig.json
```

**Commit:** `refactor(api-keys): extend KeyStatus with shadowedBy + export precedence constant`

- [ ] ST-1 shipped

---

## ST-2 · Unit-test `shadowedBy` logic

**Path:** `electron/__tests__/api-key-status.test.ts` *(new)*

**Pattern to copy:** `electron/__tests__/api-key-aicp-fallback.test.ts` — imports a pure helper, no Electron main-process boot.

**Cases** (exact expectations — paste these into the `describe` block):

| Presence | `source` | `shadowedBy` | `set` |
|---|---|---|---|
| `env + electron` | `"environment"` | `["electron"]` | `true` |
| `electron + aicp-cli` | `"electron"` | `["aicp-cli"]` | `true` |
| `env + electron + aicp-cli + qcut-env` | `"environment"` | `["electron", "aicp-cli", "qcut-env"]` | `true` |
| `qcut-env only` | `"qcut-env"` | `[]` | `true` |
| none | `"not-set"` | `[]` | `false` |

Plus one snapshot-style assertion that `KEY_SOURCE_PRECEDENCE` equals `["environment", "electron", "aicp-cli", "qcut-env"]` — accidental reorder breaks precedence semantics.

**Run:**

```bash
bunx vitest run electron/__tests__/api-key-status.test.ts
```

**Commit:** `test(api-keys): cover shadowedBy computation and precedence constant`

- [ ] ST-2 shipped

---

## ST-3 · Build `ApiKeysPrecedenceInfo` explainer component

**Path:** `apps/web/src/components/editor/properties-panel/api-keys-precedence-info.tsx` *(new)*

**Mount point:** `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` — insert below the intro block. Current file has `<ApiKeyField` starting at line 137; the intro `<div>` is just above. Mount the new component between the intro and the first field.

**Contract** (replicated from PLAN §ST-3 so this file is self-contained):

- Collapsed by default. Header: "How API key resolution works" + chevron.
- Expanded: numbered list (1-4) in precedence order with one-liner per tier (text from PLAN §ST-3 bullet list — reuse verbatim).
- Footer note: "The first tier with a value wins. Saving here writes to the `app` tier only."
- Uses existing `PropertyGroup` (from `./property-item`) + Tailwind tokens only. No new primitives.
- Pure presentational, no props.

**Pick one disclosure primitive.** Prefer `<details><summary>` for accessibility-first zero-deps (no Radix state). Don't use a custom toggle unless `<details>` styling conflicts with the panel — document the reason in the file header if you go the other way.

**Verify:**

```bash
cd apps/web && bunx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(api-keys): add collapsible precedence explainer`

- [ ] ST-3 shipped

---

## ST-4 · Teach `ApiKeyField` about `shadowedBy`

**Path:** `apps/web/src/components/editor/properties-panel/api-key-field.tsx` (118 lines — stays well under the 800-line cap).

**Edit points:**

| Line | Change |
|---|---|
| `9-23` | Extend `ApiKeyFieldProps` with `shadowedBy?: readonly KeySource[]` and `activeSource?: KeySource` (imported from `@qcut/platform-core`). |
| `24-38` | Thread new props through the destructure. |
| `39-101` | Inside `<PropertyGroup>`, render the warning row **only when** `shadowedBy?.length && value.trim() !== ""`. Copy: `⚠ Saved locally, but the active key comes from <b>{activeSource}</b>. This value will be used only if the {activeSource} source is removed.` |
| `39-101` | If `shadowedBy?.includes("electron") && activeSource !== "electron"`, render muted `Fallback value` chip next to the title. |
| `106-118` | Wrap `KeySourceBadge` in `<Tooltip>` from `@/components/ui/tooltip`. Tooltip content = the same one-liner per tier from ST-3 (extract the strings into a `PRECEDENCE_ONE_LINERS` const shared between ST-3 and ST-4 to avoid duplication). |

**Keep `testId` stable** — existing tests depend on it (none exist yet, but downstream ST-6 relies on predictable IDs).

**Edge case** (explicit, verified by ST-6 test case 3): when `value === ""` and a higher tier is set, do **not** render the warning. Warning appears live as the user types.

**Verify:**

```bash
cd apps/web && bunx tsc --noEmit -p tsconfig.json
npx @biomejs/biome check apps/web/src/components/editor/properties-panel/api-key-field.tsx
```

**Commit:** `feat(api-keys): surface shadow warnings and tooltip on ApiKeyField`

- [ ] ST-4 shipped

---

## ST-5 · Wire shadow state + post-save toast in `ApiKeysView`

**Path:** `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` (300 lines).

**Edit points:**

1. Import the new explainer; mount it between the intro `<div>` and the first `<ApiKeyField>` (≈ line 135).
2. For each of the 8 `<ApiKeyField>` call sites (137, 166, 201, 230, 259, and the three remaining — grep `ApiKeyField` to find them all), pass:
   ```tsx
   shadowedBy={keyStatuses.<field>.shadowedBy}
   activeSource={keyStatuses.<field>.source}
   ```
3. In `saveApiKeys` (after the status refetch), compute `shadowedSaves = 8 fields filter: typed value non-empty AND status.shadowedBy.length > 0`. If `>0`, call `toast({ title: "Saved", description: \`\${n} key(s) are stored but currently overridden by a higher-priority source — see the warnings above.\` })` via `@/hooks/use-toast`.
4. Footer note at line `~293` — append "See *How API key resolution works* above." (Use the same rendered heading text so users can grep-find it.)

**Leave save behavior identical.** Only *surface* changes — any attempt to re-order precedence belongs in a different PR.

**Verify:**

```bash
cd apps/web && bunx tsc --noEmit -p tsconfig.json
npx @biomejs/biome check apps/web/src/components/editor/properties-panel/api-keys-view.tsx
bunx vitest run apps/web/src/components/editor/properties-panel/
```

**Commit:** `feat(api-keys): wire precedence explainer + post-save shadow toast`

- [ ] ST-5 shipped

---

## ST-6 · Unit tests for ApiKeyField + ApiKeysPrecedenceInfo

**Paths (both new):**

- `apps/web/src/components/editor/properties-panel/__tests__/api-key-field.test.tsx`
- `apps/web/src/components/editor/properties-panel/__tests__/api-keys-precedence-info.test.tsx`

(The `__tests__` directory does not exist yet — `mkdir` it.)

**Pattern:** match `apps/web/src/hooks/__tests__/use-toast.test.ts` and `apps/web/src/routes/__tests__/login.test.tsx`. `@testing-library/react` + Vitest. Gate on `import.meta.env.DEV` not required — test env is jsdom per `vitest.config.ts`.

**`api-key-field.test.tsx` cases:**

1. Renders no warning when `shadowedBy` is `undefined` or `[]`.
2. `shadowedBy=["electron"]`, `activeSource="environment"`, `value="abc"` → warning row visible; mentions the word "environment".
3. `value=""` + same shadow props → no warning (regression guard for ST-4 edge case).
4. `KeySourceBadge` with `source="environment"` — tooltip trigger has accessible name matching the tier's one-liner.
5. `Fallback value` chip renders iff `shadowedBy.includes("electron") && activeSource !== "electron"`.

**`api-keys-precedence-info.test.tsx` cases:**

1. Default collapsed — tier labels not visible (assert via `queryByText` returning null, or `aria-hidden`).
2. Click / activate header → all 4 tier labels visible.
3. Exactly one interactive disclosure (one `<summary>` or one `aria-expanded` control).

**Run:**

```bash
cd apps/web && bunx vitest run src/components/editor/properties-panel/__tests__/
```

**Commit:** `test(api-keys): cover ApiKeyField shadow UI + precedence explainer`

- [ ] ST-6 shipped

---

## ST-7 · Playwright smoke

**Path:** `apps/web/tests/e2e/api-keys-precedence.spec.ts` *(new)*

**Pattern to copy:** `apps/web/tests/e2e/remotion-preview.spec.ts` — existing spec that knows how to launch Electron with env. Crib the launcher block verbatim.

**Flow** (one test, six asserts):

1. Launch Electron dev build with `FAL_KEY=test-env-value` via Playwright `env`.
2. Open any project → Properties panel → API Keys tab.
3. Assert `env` badge next to FAL field; hover → tooltip visible with the `environment` one-liner.
4. Type `"user-typed-value"` into FAL input → shadow warning appears mentioning `environment`.
5. Click Save → post-save toast surfaces with `overridden` wording.
6. Expand `How API key resolution works` → all 4 tier labels visible.

**Skip conditions:** if the Electron launcher can't receive env vars (mirrors existing remotion-preview approach), `test.skip()` with a clear reason. Don't ship a flaky gate.

**Run:**

```bash
bun run test:e2e -- tests/e2e/api-keys-precedence.spec.ts
```

(Use `test:e2e:bg` for headless CI.)

**Commit:** `test(api-keys): Playwright smoke for precedence UX`

- [ ] ST-7 shipped

---

## ST-8 · Manual QA checklist + issue close-out

**Path:** `docs/task/api-keys-precedence-ux/QA.md` *(new)*

**Content:** checklist from PLAN §ST-8 verbatim. Include the 8 rows + the four final gates (`bun lint:clean`, `bun check-types`, `bun run test`, `bun run test:e2e:bg`).

**Decision to record in QA.md (flagged by PLAN §ST-8 row 4):** Do we surface lower-priority shadows too (e.g. `app` set + `cli` also set, user edits the `app` field)? PLAN §6 Q1 leans "no — only warn when user's typed value won't be active". **Lock this in writing** in QA.md and in the `ApiKeyField` header comment before ST-4 ships so the intent survives future refactors.

**Issue close-out:**

- [ ] After PR merges: comment on issue #283 with one-paragraph summary + link to the merge commit, then close.

**Commit:** `docs(api-keys): manual QA checklist`

- [ ] ST-8 shipped

---

## Final gates (block the PR until all green)

```bash
bun lint:clean        # biome across the repo
bun check-types       # tsc across workspaces
bun run test          # vitest — all workspaces
bun run test:e2e:bg   # Playwright headless
```

- [ ] Lint clean
- [ ] Types clean
- [ ] Unit tests pass
- [ ] E2E passes (or skipped with justification)
- [ ] QA.md checklist signed
- [ ] Issue #283 closed with summary

---

## Files touched (for PR description copy-paste)

**Modified:**
- `electron/api-key-handler.ts`
- `packages/platform-core/src/types/core-api.ts`
- `apps/web/src/components/editor/properties-panel/api-keys-view.tsx`
- `apps/web/src/components/editor/properties-panel/api-key-field.tsx`

**Created:**
- `apps/web/src/components/editor/properties-panel/api-keys-precedence-info.tsx`
- `apps/web/src/components/editor/properties-panel/__tests__/api-key-field.test.tsx`
- `apps/web/src/components/editor/properties-panel/__tests__/api-keys-precedence-info.test.tsx`
- `electron/__tests__/api-key-status.test.ts`
- `apps/web/tests/e2e/api-keys-precedence.spec.ts`
- `docs/task/api-keys-precedence-ux/QA.md`

**Read-only reference:**
- `electron/__tests__/api-key-aicp-fallback.test.ts` — pure-helper test pattern for ST-2.
- `apps/web/tests/e2e/remotion-preview.spec.ts` — Electron-with-env launcher pattern for ST-7.
- `apps/web/src/hooks/__tests__/use-toast.test.ts` — RTL + Vitest style for ST-6.
