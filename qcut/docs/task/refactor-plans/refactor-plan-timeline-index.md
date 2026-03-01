# Refactor Plan: timeline/index.tsx

**File**: `apps/web/src/components/editor/timeline/index.tsx`
**Current Lines**: 953
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Imports | 1-43 | UI, stores, hooks, components, constants |
| Store selectors | 45-96 | 18 Zustand selectors, media hook, word filtering |
| Refs & state init | 98-149 | DOM refs, mouse tracking, zoom, drag, frame cache |
| Dimension calculations | 123-132 | Dynamic width from zoom/duration |
| Scroll sync refs | 135-143 | Multiple scroll refs for horizontal/vertical sync |
| Playhead & selection | 152-189 | Playhead ruler hook, selection box hook |
| Click/mouse handlers | 191-325 | handleTimelineMouseDown, handleTimelineContentClick |
| Duration/scroll effects | 327-413 | Duration calc effect, scroll sync with 6 listeners |
| Loading/error states | 415-431 | Media store error/loading handling |
| **JSX return** | **433-951** | **519 lines - main render block** |
| → Toolbar | 433-442 | TimelineToolbar |
| → Playhead/snap | 449-473 | TimelinePlayhead, SnapIndicator |
| → Ruler/markers | 474-763 | Time markers, bookmarks, AI words, silence gaps (~290 lines) |
| → Tracks area | 765-949 | Track labels, tracks with ContextMenu, effects |

---

## Proposed Split

```
timeline/
├── index.tsx                           (~250 lines) Main orchestrator
├── timeline-ruler.tsx                  (~290 lines) Ruler + all markers
├── timeline-tracks-area.tsx            (~185 lines) Tracks container + context menu
├── hooks/
│   ├── use-timeline-scroll-sync.ts     (~95 lines)  Scroll synchronization
│   ├── use-timeline-click-handler.ts   (~135 lines) Click-to-seek + mouse tracking
│   └── use-timeline-dimensions.ts      (~30 lines)  Dynamic sizing calculations
└── index.ts                            (~10 lines)  Barrel export
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `index.tsx` (refactored) | 250 | Store selectors, refs, hook calls, loading/error, layout shell |
| `timeline-ruler.tsx` | 290 | Ruler container, time intervals, bookmark/AI word/silence markers |
| `timeline-tracks-area.tsx` | 185 | Track labels sidebar, tracks with ContextMenu, effects timeline |
| `use-timeline-scroll-sync.ts` | 95 | Scroll refs setup, 6 event listeners, throttle logic |
| `use-timeline-click-handler.ts` | 135 | handleTimelineMouseDown, handleTimelineContentClick, click vs drag |
| `use-timeline-dimensions.ts` | 30 | Dynamic width calc, timeline buffer, total height |
| **Total** | **~985** | Includes import/export overhead |

## Migration Steps

1. Extract `hooks/use-timeline-dimensions.ts` (no dependencies)
2. Extract `hooks/use-timeline-scroll-sync.ts` (refs + event listeners)
3. Extract `hooks/use-timeline-click-handler.ts` (mouse handlers)
4. Extract `timeline-ruler.tsx` (ruler + all marker types as component)
5. Extract `timeline-tracks-area.tsx` (tracks + context menu + effects)
6. Refactor `index.tsx` to compose sub-components and hooks
7. Create barrel `index.ts`
8. Update parent component imports
