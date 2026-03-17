# Plan: AI Tools Section in Clip Context Menu

Add a dedicated "AI Tools" section to the timeline clip context menu for AI-generated clips, following LTX-Desktop's pattern.

**LTX source**: `ClipContextMenu.tsx` (lines 470-561)
**Estimated time**: ~15 minutes (2 subtasks)

---

## Subtask 1: Add AI Tools section to context menu (~10 min)

Show AI-specific actions when right-clicking a clip that has `metadata.source === 'gap-generation'` or `metadata.generationParams`.

**Menu items** (from LTX, simplified for QCut):

```
─── AI Tools ──────────────
Regenerate Shot          ⌘R
Take: ◀ 2/3 ▶         [🗑]
Camera Motion       [dolly_in ▼]
───────────────────────────
```

- **Regenerate Shot**: Re-run generation with same prompt/settings, append as new take
- **Take navigation**: Only shown when `takes.length > 1` (depends on Takes System plan)
- **Camera Motion**: Quick-switch preset, re-generates with new motion

**What NOT to copy from LTX** (not applicable to QCut):
- Upscale 2x (QCut uses FAL upscale separately)
- IC-LoRA (local model feature)
- A2V (future feature)

**Files to modify**:
- `apps/web/src/components/editor/timeline/timeline-element.tsx`
  - Import `useAsyncMediaItems` to look up media metadata
  - After existing "Delete" menu item, add separator + AI Tools section
  - Conditionally render only for media elements with generation metadata

**What to copy from LTX** (`ClipContextMenu.tsx` lines 470-500):
- Section separator pattern
- "Regenerate Shot" button with loading state
- Conditional rendering: `if (asset?.generationParams) { ... }`

---

## Subtask 2: Regenerate action handler (~5 min)

When user clicks "Regenerate Shot":
1. Read `generationParams` from the media item
2. Dispatch `gap:generate` event with stored params (reuses existing generation hook)
3. On completion, append result as new take (depends on Takes System)

**Files to modify**:
- `apps/web/src/components/editor/timeline/timeline-element.tsx` — add handler function
- `apps/web/src/hooks/timeline/use-gap-generation.ts` — handle regeneration events (same flow as gap fill, but targets existing clip position)

**Test file**: `apps/web/src/components/editor/timeline/__tests__/ai-context-menu.test.tsx`
- Test: AI section hidden for non-AI clips
- Test: AI section shown for clips with generationParams
- Test: Regenerate dispatches correct event

---

## Reuse Summary

| LTX Code | Lines | Reuse |
|---|---|---|
| AI Tools section JSX + conditional rendering | 50 | Copy structure, swap to Radix components |
| Regenerate handler pattern | 20 | Adapt to CustomEvent dispatch |
| **Total** | **~70 lines** | ~60% direct copy |

## Dependency

This plan is **enhanced by** the Takes System plan (take navigation in menu), but the Regenerate action works standalone — it just creates a new media item instead of appending a take.
