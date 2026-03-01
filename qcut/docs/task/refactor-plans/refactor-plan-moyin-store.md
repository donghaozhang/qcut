# Refactor Plan: moyin-store.ts

**File**: `apps/web/src/stores/moyin/moyin-store.ts`
**Current Lines**: 902
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Imports | 1-47 | Zustand, types, sub-module functions |
| Type definitions | 49-167 | MoyinStep, GenerationStatus, MoyinState, MoyinActions (~119 lines) |
| Initial state | 169-209 | initialState constant |
| Helper functions | 211-238 | patchShot, snapshot, selectAdjacentItem |
| Store implementation | 240-876 | All store actions (~636 lines) |
| → Basic setters | 240-249 | Simple state setters |
| → API/parsing | 251-444 | parseScript, generateScript, checkApiKeyStatus |
| → Character CRUD | 446-461 | add/update/remove character |
| → Scene CRUD | 463-475 | add/update/remove scene |
| → Shot CRUD | 476-486 | add/update/remove shot |
| → Shot generation | 488-635 | Image/video generation, batch operations |
| → Episode CRUD | 636-656 | add/update/remove episode |
| → Duplication | 647-673 | duplicate episode/scene/shot |
| → Reordering | 675-686 | reorder shots/scenes |
| → Selection/deletion | 688-723 | toggle/clear/delete selection |
| → Enhancement | 728-764 | enhanceCharacters, enhanceScenes, analyzeCharacterStages |
| → Analysis/generation | 766-846 | generateStoryboard, splitAndApplyStoryboard |
| → Undo/redo | 848-855 | undo, redo |
| → Persistence | 857-875 | save/load/export/import |
| Auto-save subscription | 878-886 | Debounced state persistence |
| Event listener | 888-901 | CLI parsed script listener |

---

## Proposed Split

```
stores/moyin/
├── moyin-store.ts                     (~120 lines) Store creation + subscriptions
├── moyin-store-types.ts               (~120 lines) All types and interfaces
├── moyin-store-state.ts               (~50 lines)  Initial state + helper functions
├── moyin-store-actions-crud.ts        (~120 lines) Character/Scene/Shot/Episode CRUD
├── moyin-store-actions-generation.ts  (~280 lines) Parsing, generation, calibration
├── moyin-store-actions-editing.ts     (~150 lines) Selection, duplication, reordering, undo
└── index.ts                           (~15 lines)  Barrel re-export
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `moyin-store.ts` (refactored) | 120 | Zustand create, compose actions, auto-save, event listener |
| `moyin-store-types.ts` | 120 | MoyinStep, GenerationStatus, CalibrationStatus, PipelineStep, MoyinState, MoyinActions, MoyinStore |
| `moyin-store-state.ts` | 50 | initialState, patchShot, snapshot, selectAdjacentItem |
| `moyin-store-actions-crud.ts` | 120 | Character/Scene/Shot/Episode add/update/remove |
| `moyin-store-actions-generation.ts` | 280 | parseScript, generateScript, generateShotImage/Video, generateStoryboard, enhance*, analyze* |
| `moyin-store-actions-editing.ts` | 150 | Selection, duplication, reordering, style/profile, undo/redo, persistence |
| `index.ts` | 15 | Re-export store and public types |
| **Total** | **~855** | Includes import/export overhead |

## Migration Steps

1. Extract `moyin-store-types.ts` (no dependencies)
2. Extract `moyin-store-state.ts` (depends on types)
3. Extract `moyin-store-actions-crud.ts` (depends on state, types)
4. Extract `moyin-store-actions-generation.ts` (depends on external imports)
5. Extract `moyin-store-actions-editing.ts` (depends on state, types)
6. Refactor `moyin-store.ts` to compose all action modules
7. Create barrel `index.ts`
8. Update all consuming imports
