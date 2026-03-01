# Refactor Plan: moyin-view.test.tsx

**File**: `apps/web/src/components/editor/media-panel/views/moyin/__tests__/moyin-view.test.tsx`
**Current size**: 1204 lines
**Goal**: Split into focused test files, each under 800 lines

## Current Structure Analysis

The file has a large mock setup section (~330 lines) followed by test suites:

| Lines | Section | Test Count |
|-------|---------|------------|
| 1-330 | Mock setup (icons, UI components, modules) | - |
| 331-344 | Imports + `resetStore` helper | - |
| 356-397 | `MoyinView` — Split Panel Layout | 5 tests |
| 403-519 | `ScriptInput` — Import/Create Tabs + Config | 14 tests |
| 525-559 | `CharacterList — Search` | 3 tests |
| 565-591 | `SceneList — Search` | 2 tests |
| 597-648 | `ShotBreakdown — View Toggle` | 2 tests |
| 654-726 | `GenerateActions — Export & Stats` | 3 tests |
| 732-754 | `Context Menus — Duplicate` | 3 tests |
| 760-805 | `Accessibility — Aria Labels` | 4 tests |
| 811-842 | `Skeleton Loaders` | 3 tests |
| 846-901 | `ShotBreakdown — Multi-Select` | 3 tests |
| 907-980 | `StructurePanel — Keyboard Shortcuts` | 4 tests |
| 984-1059 | `ShotBreakdown — Filter & Search` | 6 tests |
| 1063-1132 | `StructurePanel — Tab Badges` + `Keyboard Hints` | 3 tests |
| 1136-1183 | `MoyinView — Contextual Details` + `Empty States` | 3 tests |
| 1187-1204 | `StructurePanel — Tab ARIA Attributes` | 2 tests |

## Proposed Split

All test files share the same mock setup. Extract mocks into a shared file.

### 1. `__tests__/moyin-test-setup.ts` (~340 lines) — shared mocks
- All `vi.mock()` calls for lucide-react, UI components, modules
- `resetStore()` helper
- Component imports (MoyinView, ScriptInput, etc.)
- Not a test file

### 2. `__tests__/moyin-view.test.tsx` (~280 lines) — core component tests
- `MoyinView` — Split Panel Layout (5 tests)
- `ScriptInput` — Import/Create Tabs + Config (14 tests)
- `MoyinView — Contextual Details Header` (2 tests)

### 3. `__tests__/moyin-lists.test.tsx` (~250 lines) — list component tests
- `CharacterList — Search` (3 tests)
- `SceneList — Search` (2 tests)
- `GenerateActions — Export & Stats` (3 tests)
- `Context Menus — Duplicate` (3 tests)
- `Skeleton Loaders` (3 tests)

### 4. `__tests__/moyin-shots.test.tsx` (~350 lines) — shot breakdown tests
- `ShotBreakdown — View Toggle` (2 tests)
- `ShotBreakdown — Multi-Select` (3 tests)
- `ShotBreakdown — Filter & Search` (6 tests)

### 5. `__tests__/moyin-structure.test.tsx` (~250 lines) — structure panel tests
- `StructurePanel — Keyboard Shortcuts` (4 tests)
- `StructurePanel — Tab Badges` (2 tests)
- `StructurePanel — Keyboard Hints` (1 test)
- `StructurePanel — Empty State Hints` (1 test)
- `StructurePanel — Tab ARIA Attributes` (2 tests)
- `Accessibility — Aria Labels` (4 tests)

## Estimated Line Counts

| File | Lines |
|------|-------|
| `moyin-test-setup.ts` | ~340 |
| `moyin-view.test.tsx` | ~280 |
| `moyin-lists.test.tsx` | ~250 |
| `moyin-shots.test.tsx` | ~350 |
| `moyin-structure.test.tsx` | ~250 |

## Barrel Re-export Strategy

No barrel needed. Each test file imports from `./moyin-test-setup`:
```ts
import { resetStore, MoyinView, ScriptInput, ... } from './moyin-test-setup';
```

**Note**: `vi.mock()` calls must be at the top of each test file (Vitest requirement). The setup file should export a `setupMocks()` function or the mocks should be duplicated via a shared import pattern. Vitest's `vi.mock()` is hoisted, so the shared file pattern works if mocks are declared at module scope in the setup file and the setup file is imported before component imports.
