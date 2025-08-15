# Sound Library Integration - Subtasks Breakdown

## Overview
This document outlines small, incremental subtasks for integrating the sound library feature into OpenCut. Each task is designed to take **less than 10 minutes** and **won't break existing functionality**.

## Prerequisites
- All sound files already fetched in `/docs/task/sound/` folder ✅
- Working on `feature/sound-library-integration` branch ✅
- Environment has Freesound API key configured (will be set up in Phase 1)
- **IMPORTANT**: All file paths verified against current codebase structure ✅

---

## Phase 1: Foundation & Types (30 minutes total)

### Task 1.1: Add Sound Types to Main Codebase (5 minutes)
**Objective**: Copy type definitions to main source
**Files**: `sounds.ts` → `apps/web/src/types/sounds.ts`
```bash
# Copy the types file
cp docs/task/sound/sounds.ts apps/web/src/types/sounds.ts
```
**Risk**: ⭐ Low - Only adds new types, doesn't modify existing code
**Test**: `bun run build` should pass

### Task 1.2: Add Environment Variable for Freesound API (3 minutes)
**Objective**: Add Freesound API key to environment configuration
**Files**: `apps/web/src/env.ts`
```typescript
// Add to env.ts (in the env object)
FREESOUND_API_KEY: import.meta.env.VITE_FREESOUND_API_KEY || "",
```
**Risk**: ⭐ Low - Optional environment variable, follows existing pattern
**Test**: Check env doesn't break, API key loads correctly

### Task 1.3: Update Environment Example File (2 minutes)
**Objective**: Document the new environment variable
**Files**: `apps/web/.env.example` (create if doesn't exist)
```bash
# Add to .env.example (or create .env.local for development)
VITE_FREESOUND_API_KEY=your_freesound_api_key_here
```
**Risk**: ⭐ None - Documentation only
**Test**: No testing needed

---

## Phase 2: API Integration (25 minutes total)

### Task 2.1: Create API Route Directory (1 minute)
**Objective**: Set up API route structure
```bash
mkdir -p apps/web/src/app/api/sounds/search
```
**Risk**: ⭐ None - Just creating directories
**Test**: Directory exists

### Task 2.2: Add API Route File (5 minutes)
**Objective**: Copy the Freesound API route
**Files**: `route.ts` → `apps/web/src/app/api/sounds/search/route.ts`
```bash
cp docs/task/sound/route.ts apps/web/src/app/api/sounds/search/route.ts
```
**Risk**: ⭐⭐ Medium - New API endpoint, but isolated
**Test**: Build passes, API endpoint accessible

### Task 2.3: Test API Route Manually (5 minutes)
**Objective**: Verify API works without UI
```bash
# Start dev server
bun dev
# Test in browser or curl
curl "http://localhost:3000/api/sounds/search?q=test"
```
**Risk**: ⭐ Low - Testing only
**Test**: API returns valid JSON response

### Task 2.4: Handle Rate Limiting Dependency (4 minutes)
**Objective**: Ensure API route works with existing rate limiting
**Files**: Check `apps/web/src/lib/rate-limit.ts` exists ✅ (verified exists)
**Action**: API route already imports `baseRateLimit` which exists
**Risk**: ⭐ Low - Rate limiting already implemented and working
**Test**: API route doesn't crash, rate limiting functions

---

## Phase 3: State Management (20 minutes total)

### Task 3.1: Add Sounds Store (7 minutes)
**Objective**: Copy Zustand store for sound management
**Files**: `sounds-store.ts` → `apps/web/src/stores/sounds-store.ts`
```bash
cp docs/task/sound/sounds-store.ts apps/web/src/stores/sounds-store.ts
```
**Risk**: ⭐ Low - New store, doesn't affect existing stores
**Test**: Import store in a component without errors

### Task 3.2: Add Sound Search Hook (8 minutes)
**Objective**: Copy custom hook for search functionality
**Files**: `use-sound-search.ts` → `apps/web/src/hooks/use-sound-search.ts`
```bash
cp docs/task/sound/use-sound-search.ts apps/web/src/hooks/use-sound-search.ts
```
**Risk**: ⭐ Low - New hook, self-contained
**Test**: Hook can be imported without errors

### Task 3.3: Test Store Integration (5 minutes)
**Objective**: Create simple test component to verify store works
**Files**: Create temporary test file
```typescript
// Temporary test in a safe location
import { useSoundsStore } from '@/stores/sounds-store';
```
**Risk**: ⭐ Low - Testing only
**Test**: No console errors when importing

---

## Phase 4: UI Component Preparation (25 minutes total)

### Task 4.1: Check UI Dependencies (5 minutes)
**Objective**: Verify all required UI components exist
**Dependencies**: Button, Input, Tabs, ScrollArea, Dialog, DropdownMenu
**Files**: Check imports in `sounds.tsx`
**Risk**: ⭐ Low - Just checking, not modifying
**Test**: All imports resolve

### Task 4.2: Create Sounds View Directory (2 minutes)
**Objective**: Prepare location for sound component
```bash
# Directory should already exist, but verify
ls apps/web/src/components/editor/media-panel/views/
```
**Risk**: ⭐ None - Directory check
**Test**: Path exists

### Task 4.3: Add Basic Sounds Component Shell (8 minutes)
**Objective**: Create minimal sound component that doesn't break anything
**Files**: Create `apps/web/src/components/editor/media-panel/views/sounds.tsx`
```typescript
export function SoundsView() {
  return (
    <div className="p-4">
      <h3>Sound Library (Coming Soon)</h3>
      <p>Sound search functionality will be available here.</p>
    </div>
  );
}
```
**Risk**: ⭐ Low - Placeholder component
**Test**: Component renders without errors

### Task 4.4: Test Component in Isolation (5 minutes)
**Objective**: Verify component works independently
**Method**: Import and render in a test page
**Risk**: ⭐ Low - Testing only
**Test**: No console errors

### Task 4.5: Check Media Panel Structure (5 minutes)
**Objective**: Understand how to integrate into media panel
**Files**: Examine `apps/web/src/components/editor/media-panel/index.tsx`
**Risk**: ⭐ None - Reading only
**Test**: Understanding gained

---

## Phase 5: Gradual UI Integration (20 minutes total)

### Task 5.1: Add Sounds Tab to Media Panel (8 minutes)
**Objective**: Add tab without breaking existing functionality
**Files**: 
- `apps/web/src/components/editor/media-panel/index.tsx` - Add import and viewMap entry
- `apps/web/src/components/editor/media-panel/store.ts` - Add "sounds" to Tab type
- `apps/web/src/components/editor/media-panel/tabbar.tsx` - Add tab button
```typescript
// 1. Add import to index.tsx
import { SoundsView } from "./views/sounds";

// 2. Add to viewMap in index.tsx
sounds: <SoundsView />,

// 3. Add to Tab type in store.ts
export type Tab = "media" | "audio" | "text" | "stickers" | "effects" | "transitions" | "adjustment" | "ai" | "text2image" | "captions" | "sounds";

// 4. Add tab button to tabbar.tsx
```
**Risk**: ⭐⭐ Medium - Modifying existing UI files, but additive only
**Test**: All existing tabs still work, new tab shows placeholder

### Task 5.2: Test Tab Navigation (3 minutes)
**Objective**: Ensure tab switching works correctly
**Method**: Click through all media panel tabs
**Risk**: ⭐ Low - Testing only
**Test**: No broken navigation

### Task 5.3: Add Real Sounds Component Gradually (9 minutes)
**Objective**: Replace placeholder with actual component in stages
**Method**: Copy sections of `sounds.tsx` one at a time
- First: Basic structure and imports
- Second: Search input
- Third: Results display (mock data first)
**Risk**: ⭐⭐⭐ High - Complex component integration
**Test**: Each stage doesn't break the UI

---

## Phase 6: Feature Activation (15 minutes total)

### Task 6.1: Connect Search to API (7 minutes)
**Objective**: Wire up search functionality to actual API
**Method**: Enable real API calls in the search hook
**Risk**: ⭐⭐ Medium - Live API integration
**Test**: Search returns real results

### Task 6.2: Add Error Handling UI (5 minutes)
**Objective**: Handle API failures gracefully
**Method**: Add error states to component
**Risk**: ⭐ Low - Improves stability
**Test**: App handles no API key gracefully

### Task 6.3: Final Integration Test (3 minutes)
**Objective**: Comprehensive test of sound feature
**Method**: Test full workflow: search → preview → (future: add to timeline)
**Risk**: ⭐ Low - Testing only
**Test**: Feature works end-to-end

---

## Phase 7: Timeline Integration Preparation (10 minutes total)

### Task 7.1: Study Timeline Integration Points (5 minutes)
**Objective**: Understand how to add sounds to timeline
**Files**: Examine `apps/web/src/stores/timeline-store.ts`
**Risk**: ⭐ None - Research only
**Test**: Understanding of timeline structure

### Task 7.2: Plan Sound Import Workflow (5 minutes)
**Objective**: Design how sounds become timeline elements
**Method**: Document the workflow in comments
**Risk**: ⭐ None - Documentation only
**Test**: Clear plan exists

---

## Risk Assessment Legend
- ⭐ **Low Risk**: Very unlikely to break anything
- ⭐⭐ **Medium Risk**: Could cause minor issues, easy to fix
- ⭐⭐⭐ **High Risk**: Might break features, needs careful testing

## Testing Strategy for Each Phase

### Continuous Testing:
1. **After each task**: Run `bun run build`
2. **After each phase**: Run `bun run dev` and test UI
3. **Before commits**: Run `bun run lint:clean`

### Rollback Plan:
```bash
# If something breaks, immediately:
git stash  # Save current work
git checkout HEAD~1  # Go back one commit
# Fix issue, then continue
```

## Success Criteria

### Phase 1-3 Complete:
- ✅ Build passes
- ✅ No TypeScript errors
- ✅ API endpoint responds

### Phase 4-5 Complete:
- ✅ Sound tab appears in media panel
- ✅ All existing functionality still works
- ✅ Basic UI renders without errors

### Phase 6 Complete:
- ✅ Search functionality works
- ✅ Sound previews play
- ✅ Error handling works

### Phase 7 Complete:
- ✅ Plan for timeline integration documented
- ✅ All features integrated and tested

## Time Estimate: ~2.5 hours total
Each phase can be done independently, allowing for breaks and testing between phases.

## Notes for Safety:
1. **Always commit after each successful phase**
2. **Test in development mode before building**
3. **Keep existing functionality as priority #1**
4. **If any task takes longer than 10 minutes, break it down further**
5. **Don't be afraid to revert and try a different approach**

## ⚠️ Critical Safety Checks

### Before Starting:
- ✅ Current codebase uses Vite (not Next.js) - API routes work differently
- ✅ Environment variables use `VITE_` prefix for client access
- ✅ Rate limiting already exists and is compatible
- ✅ All file paths verified against actual codebase structure

### Files That MUST NOT Break:
- `apps/web/src/components/editor/media-panel/index.tsx` (existing tabs)
- `apps/web/src/stores/*` (all existing stores)
- `apps/web/src/env.ts` (environment configuration)

### Red Flags to Watch For:
1. **Build failures** after any change
2. **Existing tabs disappear** or become non-functional
3. **Console errors** when loading the editor
4. **TypeScript errors** in existing files

### Immediate Rollback Triggers:
- Any existing media panel tab stops working
- Timeline functionality breaks
- Audio/video playback fails
- Export functionality affected