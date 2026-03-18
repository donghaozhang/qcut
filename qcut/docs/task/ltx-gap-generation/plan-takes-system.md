# Plan: Takes / Regeneration System — IMPLEMENTED

Reuse LTX-Desktop's multi-take pattern so users can regenerate AI clips and browse between versions without losing previous ones.

> **Status**: Implemented
> **Files created**: `apps/web/src/types/generation.ts` (MediaTake type)
> **Files modified**: `apps/web/src/stores/media/media-store-types.ts` (addTake/deleteTake/setActiveTake), `apps/web/src/stores/media/media-store.ts` (take actions impl), `apps/web/src/hooks/timeline/use-gap-generation.ts` (stores takes on creation), `apps/web/src/components/editor/timeline/timeline-element.tsx` (take navigation in context menu)

**LTX source**: `useRegeneration.ts`, `use-retake.ts`, `ClipContextMenu.tsx`
**Estimated time**: ~35 minutes (4 subtasks)

---

## Subtask 1: Extend MediaItem with takes + generationParams (~8 min)

Add fields to store multiple versions and the generation settings used.

**What to copy from LTX** (`frontend/types/project.ts`):
- `AssetTake` type → `MediaTake`
- `GenerationParams` type → `GenerationParams`
- `Asset.takes[]` and `Asset.activeTakeIndex` → same on `MediaItem.metadata`

```typescript
// New types to add
interface MediaTake {
  url: string;
  localPath?: string;
  createdAt: number;
}

interface GenerationParams {
  mode: 'text-to-video' | 'image-to-video' | 'text-to-image';
  prompt: string;
  model: string;
  duration?: number;
  resolution?: string;
  cameraMotion?: string;
}
```

**Files to modify**:
- `apps/web/src/stores/media/media-store-types.ts` — add `takes?: MediaTake[]`, `activeTakeIndex?: number`, `generationParams?: GenerationParams` to `MediaItem`

**Files to create**:
- `apps/web/src/types/generation.ts` — shared `MediaTake` and `GenerationParams` types (used by media store, gap store, context menu)

**Test file**: `apps/web/src/stores/__tests__/media-takes.test.ts`
- Test: takes array serialization/deserialization
- Test: activeTakeIndex bounds validation

---

## Subtask 2: Add take management actions to media store (~10 min)

Store operations for appending takes, switching active take, deleting takes.

**What to copy from LTX** (`useRegeneration.ts` lines 60-90):
- `addTakeToAsset()` → `addTake(mediaId, take)`
- `deleteTakeFromAsset()` → `deleteTake(mediaId, takeIndex)`
- Active take switching logic

```typescript
// New store actions
addTake: (projectId: string, mediaId: string, take: MediaTake) => void;
deleteTake: (projectId: string, mediaId: string, takeIndex: number) => void;
setActiveTake: (projectId: string, mediaId: string, takeIndex: number) => void;
```

**Files to modify**:
- `apps/web/src/stores/media/media-store-types.ts` — add action types to MediaStore interface
- `apps/web/src/stores/media/media-store.ts` — implement the 3 actions

**Test file**: `apps/web/src/stores/__tests__/media-takes.test.ts`
- Test: addTake appends to array, updates activeTakeIndex
- Test: deleteTake removes correct take, adjusts index
- Test: setActiveTake clamps to valid range
- Test: actions persist via save

---

## Subtask 3: Take navigation in context menu (~10 min)

Add "Take: 2/5" with prev/next/delete buttons to the clip context menu for AI-generated clips.

**What to copy from LTX** (`ClipContextMenu.tsx` lines 500-540):
- Take navigation UI: `<< Take: X/Y >>` with arrows
- Conditional rendering: only show for clips with `takes.length > 1`
- Delete current take button

**Files to modify**:
- `apps/web/src/components/editor/timeline/timeline-element.tsx` — add "AI Takes" section to context menu after existing items

**Logic** (adapted from LTX `handleClipTakeChange`):
```typescript
// When switching take:
// 1. Get mediaItem from store
// 2. Calculate new index (clamp to 0..takes.length-1)
// 3. Call setActiveTake(projectId, mediaId, newIndex)
// 4. Update the element's source URL to the new take
```

**Test file**: `apps/web/src/components/editor/timeline/__tests__/take-navigation.test.tsx`
- Test: take section hidden when takes.length <= 1
- Test: prev/next buttons cycle correctly
- Test: delete take triggers store action

---

## Subtask 4: Wire gap generation to create takes (~7 min)

When gap generation produces a video, store it as a take on the media item. Regenerating the same gap appends a new take instead of creating a new clip.

**Files to modify**:
- `apps/web/src/hooks/timeline/use-gap-generation.ts` — in `saveAndInsert()`:
  - Store `generationParams` on the MediaItem
  - If regenerating an existing gap-fill clip, append take instead of creating new media

**What to copy from LTX** (`useRegeneration.ts` lines 110-145):
- Pattern of checking if asset already has takes, appending new one
- Updating clip's `takeIndex` after regeneration

---

## Reuse Summary

| LTX Code | Lines | Reuse |
|---|---|---|
| `AssetTake` + `GenerationParams` types | 30 | Copy, simplify (drop retake/LoRA fields) |
| `addTakeToAsset` / `deleteTakeFromAsset` logic | 40 | Adapt to Zustand pattern |
| Take navigation UI in context menu | 40 | Copy JSX, swap to Radix ContextMenu |
| Regeneration → append take flow | 35 | Adapt to FAL.ai + media store |
| **Total** | **~145 lines** | ~50% direct copy |
