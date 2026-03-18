# Plan: Color Labels on Clips and Assets — IMPLEMENTED

Add 8-color visual labels to timeline clips and media items for quick organization, following LTX-Desktop's pattern.

> **Status**: Implemented
> **Files created**: `apps/web/src/types/generation.ts` (COLOR_LABELS)
> **Files modified**: `packages/editor-core/src/types/timeline.ts` (colorLabel on BaseTimelineElement), `apps/web/src/components/editor/timeline/timeline-element.tsx` (color label submenu + visual dot)

**LTX source**: `ClipContextMenu.tsx` (color label section), `project.ts` (`Asset.colorLabel`)
**Estimated time**: ~20 minutes (3 subtasks)

---

## Subtask 1: Add colorLabel to data model (~5 min)

**What to copy from LTX** (`project.ts`):
- `Asset.colorLabel?: string` — one of 8 colors or undefined
- `TimelineClip.colorLabel?: string` — same, per-clip override

**Colors** (from LTX):
```typescript
const COLOR_LABELS = [
  { value: 'violet', color: '#8b5cf6' },
  { value: 'blue', color: '#3b82f6' },
  { value: 'green', color: '#22c55e' },
  { value: 'yellow', color: '#eab308' },
  { value: 'red', color: '#ef4444' },
  { value: 'rose', color: '#f43f5e' },
  { value: 'orange', color: '#f97316' },
  { value: 'mango', color: '#fb923c' },
] as const;
```

**Files to modify**:
- `packages/editor-core/src/types/timeline.ts` — add `colorLabel?: string` to `BaseTimelineElement`
- `apps/web/src/stores/media/media-store-types.ts` — add `colorLabel?: string` to `MediaItem`
- `apps/web/src/constants/timeline-constants.ts` — add `COLOR_LABELS` array

---

## Subtask 2: Color label in clip context menu (~8 min)

**What to copy from LTX** (`ClipContextMenu.tsx` lines 564-610):
- Color label submenu with 8 colored circles + "No Label" option
- Click sets `colorLabel` on the element
- Multi-clip: apply same label to all selected

**Files to modify**:
- `apps/web/src/components/editor/timeline/timeline-element.tsx` — add color label submenu:
  ```tsx
  <ContextMenuSub>
    <ContextMenuSubTrigger>Color Label</ContextMenuSubTrigger>
    <ContextMenuSubContent>
      <ContextMenuItem onClick={() => setLabel(null)}>
        No Label
      </ContextMenuItem>
      {COLOR_LABELS.map(({ value, color }) => (
        <ContextMenuItem key={value} onClick={() => setLabel(value)}>
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="ml-2 capitalize">{value}</span>
        </ContextMenuItem>
      ))}
    </ContextMenuSubContent>
  </ContextMenuSub>
  ```
- `apps/web/src/stores/timeline/timeline-store-crud.ts` — add `updateElementColorLabel(trackId, elementId, colorLabel)` action

---

## Subtask 3: Visual color indicator on timeline clips (~7 min)

Show a small colored dot or left-border on clips that have a color label.

**Files to modify**:
- `apps/web/src/components/editor/timeline/timeline-element.tsx` — in the element render:
  ```tsx
  {element.colorLabel && (
    <div
      className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full"
      style={{ backgroundColor: COLOR_LABELS.find(c => c.value === element.colorLabel)?.color }}
    />
  )}
  ```

**Test file**: `apps/web/src/components/editor/timeline/__tests__/color-labels.test.tsx`
- Test: color dot renders when colorLabel is set
- Test: color dot hidden when no label
- Test: context menu sets label correctly

---

## Reuse Summary

| LTX Code | Lines | Reuse |
|---|---|---|
| Color constants array | 10 | Copy verbatim |
| Color label submenu JSX | 25 | Copy, swap to Radix ContextMenuSub |
| Batch apply logic | 15 | Copy pattern, adapt to Zustand |
| Visual indicator | 8 | Copy positioning, adapt to QCut element |
| **Total** | **~58 lines** | ~70% direct copy |
