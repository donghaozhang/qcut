# Refactor Plan: remotion-store.ts

**File**: `apps/web/src/stores/ai/remotion-store.ts`
**Current Lines**: 919
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Imports & module header | 1-39 | Zustand, types, utilities |
| Initial state | 40-63 | initialSyncState, initialState constants |
| Store implementation | 69-750 | Main Zustand store (~681 lines) |
| → Initialization | 76-129 | initialize() |
| → Component registry | 131-158 | register/unregister/get components |
| → Instance management | 160-260 | create/destroy/update instances |
| → Playback control | 262-342 | seek/play/pause/setPlaybackRate |
| → Sync | 344-418 | syncToGlobalFrame, syncPlayState, updateActiveElements |
| → Render queue | 420-488 | add/update/cancel/clear render jobs |
| → Error handling | 490-532 | addError, clearErrors |
| → Sequence analysis | 534-580 | analysis result management |
| → Folder import | 582-732 | importFromFolder, refreshFolder (~150 lines) |
| → Cleanup | 734-748 | reset() |
| Selectors | 752-808 | 9 selector functions |
| Hooks | 811-877 | 8 custom React hooks |
| Store initialization | 879-892 | initializeRemotionStore() |
| Debug helper | 894-918 | __REMOTION_DEBUG__ window object |

---

## Proposed Split

Use Zustand action-creator pattern to split the store body:

```
stores/ai/remotion/
├── store.ts                        (~120 lines) Store creation + init + reset
├── selectors.ts                    (~60 lines)  All selector functions
├── hooks.ts                        (~70 lines)  All custom React hooks
├── debug.ts                        (~30 lines)  Debug helpers
├── actions/
│   ├── registry-actions.ts         (~35 lines)  Component registry CRUD
│   ├── instance-actions.ts         (~110 lines) Instance management
│   ├── playback-actions.ts         (~85 lines)  Playback control
│   ├── sync-actions.ts             (~85 lines)  Sync state management
│   ├── render-queue-actions.ts     (~75 lines)  Render job management
│   ├── error-actions.ts            (~45 lines)  Error handling
│   ├── analysis-actions.ts         (~50 lines)  Sequence analysis
│   └── folder-import-actions.ts    (~160 lines) Folder operations
└── index.ts                        (~25 lines)  Barrel re-export
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `store.ts` | 120 | Zustand create, initial state, initialize(), reset(), compose actions |
| `selectors.ts` | 60 | 9 selector functions |
| `hooks.ts` | 70 | 8 custom React hooks |
| `debug.ts` | 30 | __REMOTION_DEBUG__ window object |
| `actions/registry-actions.ts` | 35 | register/unregister/get component(s) |
| `actions/instance-actions.ts` | 110 | create/destroy/update/setPlayerRef/getInstance |
| `actions/playback-actions.ts` | 85 | seek/play/pause/setPlaybackRate |
| `actions/sync-actions.ts` | 85 | syncToGlobalFrame, syncPlayState, updateActiveElements |
| `actions/render-queue-actions.ts` | 75 | add/update/cancel/clear render jobs |
| `actions/error-actions.ts` | 45 | addError, clearErrors |
| `actions/analysis-actions.ts` | 50 | set/get/clear analysis, analyzeComponentSource |
| `actions/folder-import-actions.ts` | 160 | importFromFolder, refreshFolder, removeFolder, getImportedFolders |
| **Total** | **~945** | Includes import/export overhead |

## Action Creator Pattern

Each action module exports a factory function:

```typescript
// actions/registry-actions.ts
export function createRegistryActions(set: SetFn, get: GetFn) {
  return {
    registerComponent: (def) => { ... },
    unregisterComponent: (id) => { ... },
  };
}
```

Composed in `store.ts`:

```typescript
export const useRemotionStore = create<RemotionStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,
    ...createRegistryActions(set, get),
    ...createInstanceActions(set, get),
    // ...
  }))
);
```

## Migration Steps

1. Create `stores/ai/remotion/` directory
2. Extract `selectors.ts` and `hooks.ts` (standalone, no changes needed)
3. Extract `debug.ts` (standalone)
4. Create action factory files, starting with simplest (registry, errors)
5. Work through remaining actions in dependency order
6. Create `store.ts` composing all action factories
7. Create barrel `index.ts`
8. Update imports: `@/stores/ai/remotion-store` → `@/stores/ai/remotion`
