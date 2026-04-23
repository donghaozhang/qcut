# Plan: API Keys UX — Explain Precedence & Warn on Shadowed Saves

- **Issue:** [#283 — API Keys UX: explain key source precedence and warn when saved local keys may not take effect](https://github.com/Quriosity-agent/qcut/issues/283)
- **Linear:** QUR-29
- **Priority:** Long-term maintainability > scalability > performance > short-term gains
- **Total estimate:** ~3.5–4h (well over 20 min → broken into subtasks below)

---

## 1. Problem Statement

The API Keys page (Properties panel → API Keys tab) lets users paste and save local keys, but the backend resolves a key's *effective* value via a **4-tier precedence chain**. A user can therefore save a key in the UI and still see the app use a completely different key at runtime, with no indication that the save was shadowed.

**Resolution order (see `electron/api-key-handler.ts:339`):**

1. `process.env.*` — environment variables (highest priority)
2. Electron `safeStorage` — the "app" store users edit on this page
3. AICP CLI store — `~/.config/video-ai-studio/credentials.env`
4. QCut native CLI store — `~/.qcut/.env` (lowest priority)

**Current UX gaps** (`apps/web/src/components/editor/properties-panel/api-keys-view.tsx:130`):

- `KeySourceBadge` shows `env` / `app` / `cli` but never explains what those mean or which wins.
- Input is always editable, Save is always enabled — no signal that the save is a no-op for the active key.
- No written precedence order, no per-field shadow warning, no after-save "your save is stored but overridden" toast.
- Footer note says "Restart the application after saving" but never says *when* that is insufficient (e.g. env var set in shell).

## 2. Goal / Expected Behavior

1. **Inline precedence explanation** at the top of the panel — one collapsible block, readable by first-time users.
2. **Per-field shadow warning** when a saved / being-typed local value will not be the effective key because a higher-priority source is set.
3. **Promoted source badge** with tooltip — hovering the `env` / `app` / `cli` chip explains *this is where the active value comes from*, not just a label.
4. **Post-save feedback** — if the user clicks Save and the saved tier is shadowed, surface a toast / inline warning that the save is persisted but not active.
5. **No behavior change in the resolver** — precedence stays identical; this is purely a UX + status-surface change.

**Non-goals (explicit):**

- Not changing the 4-tier resolution order.
- Not auto-deleting env vars or editing shell rc files.
- Not blocking saves — the saved value remains a legitimate fallback; we only explain.

## 3. Architecture Choices (long-term support)

| Decision | Chosen | Alternative | Reason |
|---|---|---|---|
| Source of truth for precedence order | Single exported constant `KEY_SOURCE_PRECEDENCE` in `electron/api-key-handler.ts`, re-exported to renderer via the status IPC payload | Hardcode order in UI | UI stays in sync when order changes; one place to audit. |
| How UI learns a field is shadowed | Backend `api-keys:status` returns `{ set, source, shadowedBy?: KeySource[] }` — UI does not reconstruct precedence | UI compares env/app/cli presence flags | Backend owns the chain; avoids drift between processes. |
| Visual pattern for shadowed field | Keep input editable, add warning row + "Fallback value" tag above label | Disable input | Disabling loses the ability to pre-stage a key before removing env var. Editable + labeled matches the issue's "clearly label it as a fallback" option. |
| Precedence info component | New file `api-keys-precedence-info.tsx` (collapsible, lazy-expanded) | Inline JSX in `api-keys-view.tsx` | Keeps `api-keys-view.tsx` under the 800-line CLAUDE.md rule; reusable in future settings pages. |
| Test strategy | Vitest unit for status shape + resolver logic; React Testing Library for UI state; one Playwright smoke | Only E2E | Unit tests catch precedence regressions cheaply; E2E proves the integration once. |

## 4. File Map

**Files to modify:**

- `electron/api-key-handler.ts` — extend `KeyStatus` shape, compute `shadowedBy`, export precedence constant.
- `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` — render precedence info, wire shadow state, surface post-save warning.
- `apps/web/src/components/editor/properties-panel/api-key-field.tsx` — accept `shadowedBy`, render warning row, add tooltip to `KeySourceBadge`.
- `packages/platform-core/src/types/core-api.ts` — extend `PlatformApiKeysAPI` status return type.

**Files to create:**

- `apps/web/src/components/editor/properties-panel/api-keys-precedence-info.tsx` — collapsible explainer component.
- `apps/web/src/components/editor/properties-panel/__tests__/api-key-field.test.tsx` — unit tests for shadow UI state.
- `apps/web/src/components/editor/properties-panel/__tests__/api-keys-precedence-info.test.tsx` — unit tests for explainer.
- `electron/__tests__/api-key-status.test.ts` — unit tests for `shadowedBy` computation and precedence constant.
- `apps/web/tests/e2e/api-keys-precedence.spec.ts` — Playwright smoke covering the three visible states.

**Reference (read-only):**

- `apps/web/src/components/editor/properties-panel/property-item.tsx` — `PropertyGroup` container pattern.
- `electron/__tests__/api-key-aicp-fallback.test.ts` — existing pattern for precedence unit tests.

---

## 5. Subtasks

Each subtask is independently reviewable and ships as its own commit.

### ST-1 · Extend `KeyStatus` with `shadowedBy` + export precedence constant (~25 min)

**Files:**
- `electron/api-key-handler.ts` (edit)
- `packages/platform-core/src/types/core-api.ts` (edit — `PlatformApiKeysAPI.status` return type)

**Changes:**
1. Add `export const KEY_SOURCE_PRECEDENCE = ["environment", "electron", "aicp-cli", "qcut-env"] as const;` near the top of `api-key-handler.ts`. Derive `KeySource` from it so any reordering is one-line.
2. Rewrite `resolveStatus` (currently `api-key-handler.ts:506`) to:
   - Probe *every* tier for presence (not just find the first non-empty).
   - Return `{ set, source, shadowedBy: KeySource[] }` where `source` is the highest-precedence tier that has a value and `shadowedBy` lists any *lower*-precedence tiers that also have a value (these are the ones the user might expect to be active but aren't).
   - Special case: `qcut-env` tier needs its own presence check — currently missing from `resolveStatus` entirely. Add it to match `getDecryptedApiKeys`.
3. Update `KeyStatus` and `ApiKeysStatus` TypeScript interfaces.
4. Update `PlatformApiKeysAPI.status` return-type signature in `core-api.ts` so renderer TS picks up the new shape.

**Why this first:** every UI subtask downstream depends on this status shape.

---

### ST-2 · Unit-test the `shadowedBy` logic (~20 min)

**Files:**
- `electron/__tests__/api-key-status.test.ts` (new)

**Cases:**
1. `env + electron` set → `source: "environment"`, `shadowedBy: ["electron"]`.
2. `electron + aicp-cli` set → `source: "electron"`, `shadowedBy: ["aicp-cli"]`.
3. All four tiers set → `source: "environment"`, `shadowedBy: ["electron", "aicp-cli", "qcut-env"]` in precedence order.
4. Only `qcut-env` set → `source: "qcut-env"`, `shadowedBy: []`.
5. Nothing set → `source: "not-set"`, `shadowedBy: []`, `set: false`.
6. `KEY_SOURCE_PRECEDENCE` array shape — a snapshot test so accidental reorders are caught.

**Pattern:** follow `electron/__tests__/api-key-aicp-fallback.test.ts` — it replicates parsing logic directly to avoid hoisting Electron imports. Do the same for status resolution (extract the pure function to a testable helper, or export it).

---

### ST-3 · Build `ApiKeysPrecedenceInfo` explainer (~30 min)

**Files:**
- `apps/web/src/components/editor/properties-panel/api-keys-precedence-info.tsx` (new)
- `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` (edit — mount below the intro `<div>` at line 132)

**Component contract:**
- Collapsed by default with label "How API key resolution works" and a chevron.
- Expanded content shows numbered precedence list with short one-liner per tier:
  - `env` — "Set in your shell or `.env` — highest priority."
  - `app` — "Saved on this page via Save API Keys."
  - `cli` — "Set by the `aicp` CLI (`~/.config/video-ai-studio/credentials.env`)."
  - `qcut-env` — "Set via the QCut native CLI (`~/.qcut/.env`)."
- Footer note: "The first tier with a value wins. Saving here writes to the `app` tier only."
- Uses existing `PropertyGroup` / Tailwind tokens — no new design primitives.
- Pure presentational, no props required for v1.

**Why a separate file:** keeps `api-keys-view.tsx` focused; easier to reuse in the forthcoming Settings dialog.

---

### ST-4 · Teach `ApiKeyField` about `shadowedBy` (~40 min)

**Files:**
- `apps/web/src/components/editor/properties-panel/api-key-field.tsx` (edit)

**Changes:**
1. Add props:
   ```ts
   shadowedBy?: readonly KeySource[];
   activeSource?: KeySource;
   ```
2. If `shadowedBy` is non-empty *and* the current typed value is non-empty, render an inline warning row below the description:
   > ⚠ Saved locally, but the active key comes from **{activeSource}**. This value will be used only if the {activeSource} source is removed.
3. If `shadowedBy` includes `"electron"` but `activeSource !== "electron"`, append a muted tag `Fallback value` next to the label so the user knows at a glance.
4. Upgrade `KeySourceBadge` to wrap in a `<Tooltip>` (existing `@/components/ui/tooltip`) — hover reveals the one-liner from ST-3.
5. Make sure `testId` remains stable — tests rely on it.

**Edge case:** when `value === ""` and a higher source is set, do *not* show the warning (nothing to shadow yet). When the user starts typing, the warning appears live.

---

### ST-5 · Wire shadow state in `ApiKeysView` + post-save feedback (~25 min)

**Files:**
- `apps/web/src/components/editor/properties-panel/api-keys-view.tsx` (edit)

**Changes:**
1. Read `keyStatuses[field].shadowedBy` and pass to every `<ApiKeyField>`.
2. In `saveApiKeys`, after the status refetch, compute how many saved fields landed in a shadowed state (`shadowedBy` non-empty AND field has a typed value). If any, show a toast via `@/hooks/use-toast`:
   > "Saved. N key(s) are stored but currently overridden by a higher-priority source — see the warnings above."
3. Update the footer note (line 293) to cross-link the explainer: "See *How API key resolution works* above."

**Keep the save behavior unchanged** — this is a surface-only change.

---

### ST-6 · Unit tests — `ApiKeyField` shadow UI & explainer (~35 min)

**Files:**
- `apps/web/src/components/editor/properties-panel/__tests__/api-key-field.test.tsx` (new)
- `apps/web/src/components/editor/properties-panel/__tests__/api-keys-precedence-info.test.tsx` (new)

**Cases (`api-key-field.test.tsx`):**
1. No `shadowedBy` → no warning row rendered.
2. `shadowedBy=["electron"]`, `activeSource="environment"`, `value="abc"` → warning row visible mentioning "environment".
3. `value=""` + shadow present → warning row NOT rendered (nothing to shadow).
4. `KeySourceBadge` with `source="environment"` wraps tooltip trigger with accessible name.
5. `Fallback value` tag renders when `shadowedBy` includes `"electron"` and active source is not `electron`.

**Cases (`api-keys-precedence-info.test.tsx`):**
1. Collapsed by default — detail content not in DOM or `aria-hidden`.
2. Click header → expands; all four tier labels visible.
3. Has a single disclosure (`<details>` or button + `aria-expanded`) — one interactive toggle.

**Pattern:** follow `apps/web/src/hooks/__tests__/use-toast.test.ts` / `routes/__tests__/login.test.tsx` style — `@testing-library/react` + Vitest.

---

### ST-7 · Playwright smoke (~25 min)

**Files:**
- `apps/web/tests/e2e/api-keys-precedence.spec.ts` (new)

**Flow:**
1. Launch Electron dev build with `FAL_KEY=test-env-value` injected via `env`.
2. Open project → Properties panel → API Keys tab.
3. Assert `env` badge renders next to FAL field and tooltip content appears on hover.
4. Type a new value into the FAL input → assert the shadow warning appears mentioning `environment`.
5. Click Save → assert the "overridden" toast surfaces.
6. Expand the precedence info block → assert all four tier labels are visible.

**Skip conditions:** gate the spec behind a check that Electron launcher can pass env vars (mirrors existing `remotion-preview.spec.ts` style).

---

### ST-8 · Manual QA checklist + doc update (~15 min)

**Files:**
- `docs/task/api-keys-precedence-ux/QA.md` (new — checklist only, not a user-facing doc)

**Checklist items:**
- [ ] No env vars, no app store, no CLI → every field shows `not set`, no warnings, no badge.
- [ ] Only app store set → `app` badge, no warning.
- [ ] env + app both set → `env` badge, `Fallback value` tag, warning row on typing.
- [ ] app + cli both set → `app` badge, warning on typing ("lower-priority `cli` tier has a value but is shadowed by `app`" — OR we decide this direction isn't surfaced; pick one in ST-4 and document here).
- [ ] Save with shadowed field → toast fires once per save, not per field.
- [ ] Collapsed precedence info remains collapsed on panel reopen (no sticky expanded state yet — acceptable for v1).
- [ ] Keyboard nav: explainer toggle is reachable via Tab, Enter expands.
- [ ] `bun lint:clean` + `bun check-types` + `bun run test` all green.

---

## 6. Risks & Open Questions

1. **Should we warn on lower-priority shadows?** e.g. user saves in `app`, but `cli` also has a value that's being ignored. Current plan: no — only warn when the *user's typed value* won't be active. Revisit if users report confusion.
2. **`qcut-env` currently missing from `resolveStatus`.** ST-1 adds it — treat as a latent bug fix bundled with this work. Flagged explicitly so reviewer knows it's intentional scope.
3. **Tooltip behavior in Electron.** Confirm `@/components/ui/tooltip` works without Radix portal issues in the panel sidebar (should — used elsewhere in properties-panel).
4. **Beta key distribution (mentioned in issue comments).** Out of scope for this plan — separate concern about bundling a key, not about UX.

## 7. Rollout

- One PR per subtask would thrash the reviewer; instead, one PR with atomic commits following the ST order above.
- Commit prefix convention: `feat(api-keys): …` for ST-3–5, `refactor(api-keys): …` for ST-1, `test(api-keys): …` for ST-2/6/7.
- No feature flag — UX-only, backward-compatible with existing status payload (UI tolerates missing `shadowedBy`).

## 8. Definition of Done

- All subtasks ST-1 through ST-8 merged.
- `bun lint:clean`, `bun check-types`, `bun run test`, `bun run test:e2e:bg` all pass.
- Manual QA checklist in `QA.md` signed off.
- Issue #283 closed with a short summary comment linking to the PR.
