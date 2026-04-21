# Plan: AI Panel `selectedModels` Tab Isolation

**Status**: Proposed
**Estimated time**: ~60–90 minutes (mechanical but touches ~10 files)
**Risk**: Low — change is a shape refactor on a single piece of state, with no new logic

---

## Background

### The bug this fixes

When the user has a text-to-video (T2V) model selected in the **Text** tab, then switches to the **Upscale** tab and clicks Generate, the console shows:

```
🎬 [1/2] Processing model: gmi_seedance_2_0_fast_260128_t2v  (upscale tab)
  ⚠️ Skipping model - Unknown upscale model: gmi_seedance_2_0_fast_260128_t2v
🎬 [2/2] Processing model: topaz_video_upscale               (upscale tab)
❌ GENERATION FAILED: Topaz Video Upscale not yet implemented
```

Two distinct problems are entangled here; this plan addresses the first (state leakage). Topaz not being implemented is a separate fix.

### Root cause

`apps/web/src/components/editor/media-panel/views/ai/index.tsx:68–70` declares a single shared `selectedModels` state used by all five tabs (text / image / avatar / upscale / angles):

```ts
const [selectedModels, setSelectedModels] = useState<string[]>([
  "gmi_seedance_2_0_fast_260128_t2v",
]);
```

`index.tsx:94–105` tries to re-seed defaults on tab switch:

```ts
const defaults: Partial<Record<typeof activeTab, string>> = {
  text: "gmi_seedance_2_0_fast_260128_t2v",
  image: "sora2_image_to_video_pro",
  avatar: "kling_avatar_v2_pro",
  // ❌ upscale and angles are missing
};
const def = defaults[activeTab];
if (def) setSelectedModels([def]);
```

Because `upscale` and `angles` are absent, `setSelectedModels` is never called when switching to those tabs — so whatever was selected in the previous tab bleeds through. The Upscale tab UI then appends its own selections, producing a cross-tab mix like `["gmi_seedance_2_0_fast_260128_t2v", "topaz_video_upscale"]`. At generation time `routeUpscaleHandler` iterates the whole array and each element triggers either "Unknown upscale model" or a hard throw.

### Why the current shape is the wrong shape

A single `string[]` implies "the globally selected set." In reality each tab has its own catalogue and its own semantics. The correct model is:

> Each tab owns its own selected-models list. Tabs never read each other's selections.

With that invariant, cross-tab contamination is *structurally impossible* — not just "prevented by a defaults table we hope someone remembers to update."

### Goals

1. **Physical isolation** — a bug like this cannot recur even if a future developer adds a new tab.
2. **Preserve user intent across tab switches** — if the user carefully picks three T2V models in the Text tab, pops into Upscale briefly, then comes back, their three models should still be there (currently they are wiped to the single default).
3. **Delete the `defaults` map** — remove a brittle maintenance point.
4. **Zero regression** for the active-tab's behavior — generation, capabilities, cost calc, and can-generate checks must continue to see the same array they see today, just sourced differently.

### Non-goals (explicitly out of scope)

- Implementing Topaz upscale.
- Rewriting multi-model generation semantics.
- Persisting `selectedModelsByTab` across reloads (keep as in-memory `useState` like today).
- Refactoring the 5 tab-state hooks (`useTextTabState`, etc.) beyond the prop they already accept.

---

## Target architecture

### New state shape

```ts
// apps/web/src/components/editor/media-panel/views/ai/index.tsx

import type { AIActiveTab } from "./types/ai-types";

const TAB_DEFAULT_MODELS: Record<AIActiveTab, string[]> = {
  text:    ["gmi_seedance_2_0_fast_260128_t2v"],
  image:   ["sora2_image_to_video_pro"],
  avatar:  ["kling_avatar_v2_pro"],
  upscale: ["bytedance_video_upscaler"],   // first real upscale model
  angles:  [/* see §Open question below */],
};

const [selectedModelsByTab, setSelectedModelsByTab] =
  useState<Record<AIActiveTab, string[]>>(TAB_DEFAULT_MODELS);

// Derived value consumed everywhere downstream
const selectedModels = selectedModelsByTab[activeTab];

// Helper for children that currently call setSelectedModels
const setSelectedModels = useCallback(
  (next: string[] | ((prev: string[]) => string[])) => {
    setSelectedModelsByTab((byTab) => {
      const prevArr = byTab[activeTab];
      const nextArr = typeof next === "function" ? next(prevArr) : next;
      return { ...byTab, [activeTab]: nextArr };
    });
  },
  [activeTab]
);
```

### Why the `setSelectedModels` wrapper matters

Every call site today (`toggleModel`, AIModelSelectionGrid, tabs content, etc.) uses the simple `(next) => setSelectedModels(next)` signature. Keeping that signature means **no changes anywhere downstream** — only the owner (`index.tsx`) sees the new shape. This is what makes the blast radius small.

### What gets deleted

- `index.tsx:94–105` — the whole `prevTabRef` + `defaults` + `useEffect` block goes. Initialization of per-tab defaults now happens once in `useState`, not on every tab switch.

---

## Subtasks

### Subtask 1 — Introduce per-tab state shape (owner file only)

**Files**
- `apps/web/src/components/editor/media-panel/views/ai/index.tsx`

**Changes**
1. Add `TAB_DEFAULT_MODELS` constant (see §Target architecture). Keep it colocated in `index.tsx` for now; if we extract later it lives next to `AI_MODELS` in `constants/ai-constants.ts`.
2. Replace the `selectedModels` useState at `index.tsx:68–70` with `selectedModelsByTab`.
3. Derive `const selectedModels = selectedModelsByTab[activeTab];` immediately after `activeTab` is computed (after line 90).
4. Add the `setSelectedModels` `useCallback` wrapper that writes back to `selectedModelsByTab[activeTab]`.
5. Delete the `prevTabRef` + `defaults` + tab-switch `useEffect` at `index.tsx:92–105`. The per-tab defaults are now seeded by the initial state, so no runtime reset is needed.

**Acceptance**
- File still compiles.
- `selectedModels` identifier still exists with type `string[]` — all existing downstream references (`index.tsx:126, 127, 143, 160, 176, 298, 331, 493, 511, 519, 535`) keep working untouched.
- `setSelectedModels` identifier still exists with the same call signature.

**Est. time**: 15 min

---

### Subtask 2 — Verify no downstream file needs changes

**Purpose**: This refactor is deliberately designed so the tab components, generation hook, capabilities memo, and tab-state hooks do **not** change. This subtask confirms that by audit.

**Files to audit** (read-only pass — no edits unless the audit surfaces a surprise):
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-model-selection-grid.tsx`
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-tabs-content.tsx`
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-model-settings-panel.tsx`
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-actions-section.tsx`
- `apps/web/src/components/editor/media-panel/views/ai/components/ai-validation-messages.tsx`
- `apps/web/src/components/editor/media-panel/views/ai/tabs/ai-text-tab.tsx`
- `apps/web/src/components/editor/media-panel/views/ai/tabs/ai-image-tab.tsx`
- `apps/web/src/components/editor/media-panel/views/ai/tabs/ai-avatar-tab.tsx`
- `apps/web/src/components/editor/media-panel/views/ai/tabs/ai-upscale-tab.tsx`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation-core.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation-state.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation-can-generate.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-generation-helpers.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-text-tab-state.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-image-tab-state.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-panel-effects.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-cost-calculation.ts`
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-polling.ts`

**Acceptance**
- Confirm each file only consumes `selectedModels: string[]` or `setSelectedModels(next)` — never assumes it spans tabs.
- If any file does something cross-tab-ish (e.g. reads `selectedModels` while expecting a specific tab), flag it here and design a fix in Subtask 2b.

**Est. time**: 20 min (grep + targeted read)

---

### Subtask 3 — Decide `angles` tab default

The `angles` tab wasn't in the original `defaults` map, so its historical "default" was "whatever the previous tab had." The correct default needs a brief look at the Angles UI to see which model it treats as primary.

**Files**
- `apps/web/src/components/editor/media-panel/views/ai/tabs/ai-angles-tab.tsx` (read to find the canonical model id)
- `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-angles-tab-state.ts` (read)

**Output**
- Pick one model id and set `angles: [<id>]` in `TAB_DEFAULT_MODELS`.
- If the angles tab truly has no "default" (e.g. it requires user picking a source video first), `angles: []` is acceptable — the Generate button is already gated by `can-generate` checks.

**Est. time**: 10 min

---

### Subtask 4 — Unit tests

**New test file**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/__tests__/tab-isolation.test.tsx`

**Cases** (React Testing Library over `AiView` with a minimal render, or a dedicated hook extracted for testability — see §Open question 2):

1. **Initial defaults per tab** — each of the five tabs starts with the expected default model.
2. **Cross-tab independence on selection** — selecting `"flashvsr_video_upscaler"` on the Upscale tab must NOT change what the Text tab reports.
3. **Preservation across tab switches** — select `["modelA", "modelB"]` on Text; switch to Upscale; switch back to Text; list is still `["modelA", "modelB"]` (this is the behavior improvement over the current code).
4. **Upscale tab never sees T2V models** — after the bug-repro sequence (seed Text default, switch to Upscale, select Topaz), the Upscale tab's selectedModels array contains only upscale ids. This is the regression test for the reported bug.
5. **`setSelectedModels` functional form** — passing `(prev) => [...prev, id]` updates only the active tab's slice.

**Contract test update** (if needed)
- `apps/web/src/components/editor/media-panel/views/ai/hooks/__tests__/use-ai-generation-contract.test.ts` — confirm the contract still expects `selectedModels: string[]` and does not inadvertently assume a specific shape.

**Est. time**: 30 min

---

### Subtask 5 — Manual smoke test (Electron dev)

Not automated, but required before landing.

**Commands**
```
bun run electron:dev
```

**Steps**
1. Open AI panel, Text tab — confirm Seedance Fast 260128 is preselected, Generate works.
2. Switch to Image tab — confirm Sora2 i2v preselected.
3. Switch to Avatar — confirm Kling Avatar v2 Pro.
4. Switch to Upscale — confirm a real upscale model is preselected (not a T2V).
5. On Upscale: toggle ByteDance upscaler; click Generate with a sample video. No "Unknown upscale model" warnings in console.
6. Bug-repro sequence: on Text tab select a T2V model → switch to Upscale → select Topaz alongside → ensure the UI only shows upscale models selected (T2V id is NOT in the array) and the Generate path does not mention the T2V model.
7. Back-and-forth between tabs preserves user selections.

**Est. time**: 10 min

---

## File-by-file summary

| File | Change | Subtask |
|------|--------|---------|
| `apps/web/src/components/editor/media-panel/views/ai/index.tsx` | State shape + delete tab-switch reset effect | 1 |
| `apps/web/src/components/editor/media-panel/views/ai/tabs/ai-angles-tab.tsx` | Read-only audit | 3 |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/use-ai-angles-tab-state.ts` | Read-only audit | 3 |
| All other files listed in Subtask 2 | Read-only audit | 2 |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/__tests__/tab-isolation.test.tsx` | **NEW** | 4 |
| `apps/web/src/components/editor/media-panel/views/ai/hooks/__tests__/use-ai-generation-contract.test.ts` | Possibly light edit | 4 |

Total write-affected files: **1 production file + 1 new test file (+ 1 contract test touch if needed)**. That's the blast radius.

---

## Long-term-support rationale

Per the CLAUDE.md priority order (maintainability > scalability > performance > short-term gains):

- **Maintainability**: removes a hidden coupling (shared state across semantically distinct tabs) and removes a brittle `defaults` map that silently mis-behaves when a contributor adds a new tab. The invariant "each tab owns its models" is enforced by the type.
- **Scalability**: adding a sixth tab in the future is a one-line change to `TAB_DEFAULT_MODELS` — no runtime effect to remember.
- **Short-term tempation**: the fastest patch would be adding `upscale` and `angles` to the `defaults` map. Rejected because it leaves the tab-switch effect (which wipes multi-model selections on every tab switch) as a latent UX bug and keeps the shared-state coupling.

---

## Open questions

1. **`angles` default** — needs a glance at the angles tab to pick the right model id (Subtask 3).
2. **Hook extraction for testability** — two options:
   - (a) Test against `AiView` render. Simple but the AiView has ~60 props worth of dependencies to mock.
   - (b) Extract `useSelectedModelsByTab(activeTab)` into its own file (`hooks/use-selected-models-by-tab.ts`). Clean, isolated, easy to unit test. Slight scope creep but arguably the right home for this state.
   - **Recommendation**: (b). Extra ~30 lines of hook, buys us a focused test surface, zero runtime cost.
3. **Persistence** — should per-tab selections survive a reload? Not today (the state is `useState`). Leaving as in-memory for this PR; a follow-up can persist to `panel-store` if users complain.

---

## Rollout

Single PR. No feature flag — the refactor's observable behavior differs from the current code only in two user-visible ways, both intentional and welcome:

1. Switching between tabs no longer resets the active tab's model selection to the default.
2. The Upscale tab's default model is a real upscale model, not a leftover from a previous tab.

---

## Related / references

- Bug report and root-cause trace: see conversation `2026-04-21` — user report "when I upscale video why it call video generation model".
- Adjacent refactor plan (index.tsx structural split): `docs/task/refactor-plans/refactor-plan-ai-index.md` — this tab-isolation change should land **before** that bigger split so the new state shape is the one being carried forward.
