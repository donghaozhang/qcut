# Plan: Generation Parameter Persistence

Save full generation settings on every AI-generated clip so it can be re-generated with one click.

**LTX source**: `project.ts` (`GenerationParams` type), `useRegeneration.ts` (param storage)
**Estimated time**: ~10 minutes (2 subtasks)

---

## Subtask 1: Store generation params on media items (~5 min)

When any AI generation completes (gap fill, AI video panel, etc.), persist the full settings on the `MediaItem`.

**What to copy from LTX** (`project.ts` lines 1-30):
```typescript
interface GenerationParams {
  mode: 'text-to-video' | 'image-to-video' | 'text-to-image';
  prompt: string;
  model: string;
  duration?: number;
  resolution?: string;
  fps?: number;
  cameraMotion?: string;
  aspectRatio?: string;
}
```

This type is shared with the Takes System plan (`apps/web/src/types/generation.ts`).

**Files to modify**:
- `apps/web/src/hooks/timeline/use-gap-generation.ts` — in `saveAndInsert()`, add `generationParams` to the media item's metadata:
  ```typescript
  metadata: {
    source: 'gap-generation',
    prompt,
    generationParams: { mode, prompt, model, duration: segment.duration }
  }
  ```
- `apps/web/src/stores/timeline/gap-store.ts` — no changes needed (model already tracked in `GeneratingGap`)

**Test file**: `apps/web/src/hooks/timeline/__tests__/gap-generation-params.test.ts`
- Test: saved media item includes generationParams in metadata
- Test: generationParams contains prompt, model, duration

---

## Subtask 2: Pre-fill modal from stored params (~5 min)

When regenerating a clip, read its `generationParams` and pre-fill the gap generation modal.

**Files to modify**:
- `apps/web/src/components/editor/timeline/gap-generation-modal.tsx` — accept optional `prefillParams` prop
- `apps/web/src/stores/timeline/gap-store.ts` — add `prefillFromParams(params: GenerationParams)` action that sets prompt, model, etc.

**What to copy from LTX** (`useRegeneration.ts` lines 100-130):
- Pattern of reading `asset.generationParams` and passing to generation modal

---

## Reuse Summary

| LTX Code | Lines | Reuse |
|---|---|---|
| `GenerationParams` type definition | 15 | Copy, simplify (drop retake/LoRA) |
| Param storage pattern in asset creation | 10 | Adapt to `MediaItem.metadata` |
| Param read-back for regeneration | 10 | Copy pattern |
| **Total** | **~35 lines** | ~80% direct copy |
