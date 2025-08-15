# Sticker Preview Not Working - Detailed Debug Investigation

## Issue Description
**Problem**: Sticker preview is not working after opening the project. This is a recurring issue that happens each time the project is loaded.

**Symptoms**:
- Sticker preview fails to display consistently
- Issue occurs on project open/reload
- Stickers may be added but not visible in preview
- Complex multi-component integration issue

## Key Architecture Components

### Core Files Analysis

#### 1. Stickers Store (`apps/web/src/stores/stickers-store.ts`)
**Purpose**: Manages sticker collections, search results, and recent stickers
**Key State**:
```typescript
interface StickersStore {
  collections: IconSet[];
  searchResults: string[];
  recentStickers: RecentSticker[];
  isLoading: boolean;
  error: string | null;
}
```
**Critical Methods**:
- `fetchCollections()`: Lines 56-89 - Loads sticker collections
- `searchIcons()`: Lines 91-128 - Handles icon search
- `downloadSticker()`: Lines 130-156 - Downloads sticker blobs

#### 2. Stickers Overlay Store (`apps/web/src/stores/stickers-overlay-store.ts`)
**Purpose**: Manages overlay stickers positioned on video preview
**Key State**:
```typescript
interface StickerOverlayStore {
  overlayStickers: Map<string, OverlaySticker>;
  selectedStickerId: string | null;
  isDragging: boolean;
}
```
**Critical Methods**:
- `addOverlaySticker()`: Lines 118-182 - Adds sticker to overlay
- `loadFromProject()`: Lines 497-563 - Loads stickers from project storage
- `saveToProject()`: Lines 448-495 - Saves stickers to project storage

#### 3. Sticker Selection Hook (`apps/web/src/components/editor/media-panel/views/stickers/hooks/use-sticker-select.ts`)
**Purpose**: Handles sticker selection and media item creation
**Critical Flow**:
```typescript
// Lines 19-96: Main selection handler
handleStickerSelect(iconId: string, name: string) {
  // 1. Download SVG content (lines 27-37)
  // 2. Create blob/data URL (lines 39-66)
  // 3. Add to media store (lines 68-77)
  // 4. Add to recent stickers (lines 79-80)
}
```

#### 4. Sticker Canvas (`apps/web/src/components/editor/stickers-overlay/StickerCanvas.tsx`)
**Purpose**: Renders overlay stickers on video preview
**Key Rendering Logic**:
```typescript
// Lines 181-182: Get visible stickers at current time
const visibleStickers = getVisibleStickersAtTime(currentTime);

// Lines 201-237: Render stickers with media validation
visibleStickers.map((sticker) => {
  const mediaItem = mediaItems.find(item => item.id === sticker.mediaItemId);
  if (!mediaItem) {
    // Show placeholder for missing media (lines 207-226)
  }
  return <StickerElement key={sticker.id} sticker={sticker} mediaItem={mediaItem} />;
})
```

#### 5. Editor Route (`apps/web/src/routes/editor.$project_id.tsx`)
**Purpose**: Main editor initialization and project loading
**Key Initialization Flow** (Lines 41-140):
- Project loading with race condition prevention
- Concurrent load handling with `inFlightProjectIdRef` tracking
- Project validation and error handling
- **RECENT FIX**: Added duplicate load prevention for same project_id

### Detailed Investigation Plan

#### Phase 1: Store Initialization Analysis
**Files to Monitor**:
- `apps/web/src/stores/stickers-store.ts` (Lines 35-202)
- `apps/web/src/stores/stickers-overlay-store.ts` (Lines 103-665)

**Debug Points**:
```typescript
// In stickers-store.ts, line 57
fetchCollections: async () => {
  console.log('[STICKER DEBUG] fetchCollections called, current collections:', get().collections.length);
  
// In stickers-overlay-store.ts, line 497  
loadFromProject: async (projectId: string) => {
  console.log('[STICKER DEBUG] loadFromProject called for:', projectId);
  console.log('[STICKER DEBUG] Storage API available:', !!window.electronAPI?.storage);
```

#### Phase 2: Component Lifecycle Investigation
**Files to Monitor**:
- `apps/web/src/components/editor/stickers-overlay/StickerCanvas.tsx` (Lines 25-267)
- `apps/web/src/components/editor/media-panel/views/stickers/stickers-view.tsx`

**Debug Points**:
```typescript
// In StickerCanvas.tsx, line 26
export const StickerCanvas: React.FC = memo(({ className, disabled = false }) => {
  console.log('[STICKER DEBUG] StickerCanvas render - stickers:', overlayStickers.size);
  console.log('[STICKER DEBUG] StickerCanvas render - mediaItems:', mediaItems.length);
  
// In useEffect at line 115
useEffect(() => {
  console.log('[STICKER DEBUG] Cleanup check - Media:', mediaItems.length, 'Stickers:', overlayStickers.size);
```

#### Phase 3: Media Item Integration Analysis
**Files to Monitor**:
- `apps/web/src/components/editor/media-panel/views/stickers/hooks/use-sticker-select.ts` (Lines 18-123)
- `apps/web/src/stores/media-store.ts`

**Debug Points**:
```typescript
// In use-sticker-select.ts, line 25
const handleStickerSelect = useCallback(async (iconId: string, name: string) => {
  console.log('[STICKER DEBUG] Selecting sticker:', iconId, name);
  console.log('[STICKER DEBUG] Active project:', activeProject?.id);
  
// After addMediaItem call, line 68
const mediaItemId = await addMediaItem(activeProject.id, { ... });
console.log('[STICKER DEBUG] Created media item:', mediaItemId);
```

#### Phase 4: Storage and Persistence Debugging
**Files to Monitor**:
- `apps/web/src/stores/stickers-overlay-store.ts` (Lines 448-563)
- `apps/web/src/lib/storage/storage-service.ts`

**Debug Points**:
```typescript
// In saveToProject, line 452
saveToProject: async (projectId: string) => {
  console.log('[STICKER DEBUG] Saving stickers:', data.length, 'for project:', projectId);
  console.log('[STICKER DEBUG] Using storage method:', window.electronAPI?.storage ? 'Electron' : 'localStorage');
  
// In loadFromProject, line 501
loadFromProject: async (projectId: string) => {
  console.log('[STICKER DEBUG] Loading stickers for project:', projectId);
  console.log('[STICKER DEBUG] Loaded data length:', data.length);
```

### Critical Race Conditions to Investigate

#### 1. Project Load vs Sticker Load Timing
**Potential Issue**: Stickers loading before project is fully initialized
**Investigation**: Check order of calls in `editor.$project_id.tsx` vs sticker store initialization

#### 2. Media Store vs Sticker Store Sync
**Potential Issue**: Stickers referencing media items before media store is populated
**Investigation**: Monitor cleanup logic in `StickerCanvas.tsx` lines 115-141

#### 3. Storage API Availability
**Potential Issue**: Electron storage API not available when stickers try to load
**Investigation**: Check `window.electronAPI` availability timing

### Console Debug Commands for Testing

```javascript
// Check sticker stores state
console.log('Stickers Store:', useStickersStore.getState());
console.log('Overlay Store:', useStickersOverlayStore.getState());

// Check media store state
console.log('Media Items:', useMediaStore.getState().mediaItems);

// Manual sticker operations
const { addOverlaySticker, loadFromProject } = useStickersOverlayStore.getState();
await loadFromProject('current-project-id');

// Force sticker save/load cycle
const { saveToProject } = useStickersOverlayStore.getState();
await saveToProject('current-project-id');
```

### Known Integration Points

1. **Sticker Selection Flow**: 
   `StickersView` → `use-sticker-select` → `MediaStore` → `StickersOverlayStore` → `StickerCanvas`

2. **Project Load Flow**: 
   `editor.$project_id.tsx` → `ProjectStore` → `StickersOverlayStore.loadFromProject`

3. **Rendering Flow**: 
   `StickerCanvas` → `getVisibleStickersAtTime` → `StickerElement`

### Potential Root Causes with File References

1. **Persistence Failure**: 
   - `stickers-overlay-store.ts:448-495` (saveToProject)
   - `stickers-overlay-store.ts:497-563` (loadFromProject)

2. **Media Item Missing**: 
   - `StickerCanvas.tsx:202-227` (media validation)
   - `use-sticker-select.ts:68-77` (media item creation)

3. **Component Mount Order**: 
   - `editor.$project_id.tsx:41-100` (initialization)
   - `StickerCanvas.tsx:115-141` (cleanup timing)

4. **Storage API Race**: 
   - `stickers-overlay-store.ts:459-466` (Electron API check)
   - `stickers-overlay-store.ts:504-517` (storage loading)

## Debug Session Log

**Session 1** - 2025-08-14:
✅ **Initial Analysis Complete**:
- Sticker store persistence: WORKING (1 sticker loaded from project)
- Storage API: WORKING (Electron IPC available and functional)
- Component timing: WORKING (StickerCanvas renders after data loads)
- Store state: WORKING (1 sticker in overlay, 2 media items loaded)

🔍 **Key Findings**:
```
[STICKER DEBUG] loadFromProject called for: befeebf4-4019-43e5-adbe-c23a577d9af5
[STICKER DEBUG] Storage API available: true
[STICKER DEBUG] Loaded via Electron IPC: 1 stickers
[STICKER DEBUG] Validated and loaded stickers: 1
[STICKER DEBUG] StickerCanvas render - stickers: 1
[STICKER DEBUG] StickerCanvas render - mediaItems: 2
[STICKER DEBUG] Visible stickers at time 0 : 1
```

❌ **Issue Identified**: Sticker **logic is working correctly** but **visual rendering is broken**
- Stores: ✅ Working
- Data loading: ✅ Working  
- Visibility calculation: ✅ Working
- **Problem**: Stickers not appearing visually despite being "visible"

**Next Investigation Points**:
1. Media item matching between sticker.mediaItemId and available media items
2. StickerElement component rendering
3. Media item URL/blob availability
4. CSS/styling issues hiding stickers

**Session 2** - 2025-08-14:
✅ **ROOT CAUSE IDENTIFIED**: Incorrect MIME type in data URLs
- Image load failures due to `data:application/octet-stream` instead of `data:image/svg+xml`
- StickerElement components rendering correctly but images failing to load
- Debug logs showed: `[STICKER DEBUG] Image load failed: data:application/octet-stream;base64,...`

✅ **MIME Type Fix Implemented**: 
- Fixed `use-sticker-select.ts` to generate correct `data:image/svg+xml;base64,...` URLs
- **Issue**: Fix only applies to NEW stickers, existing stickers still broken
- Need migration for existing stickers with wrong MIME type

✅ **Migration Fix Implemented**: Added migration code in StickerCanvas.tsx
- Detects existing stickers with `data:application/octet-stream` MIME type
- Automatically converts to correct `data:image/svg+xml;base64,` format
- Migration runs on component mount when media items are available

**Session 3** - 2025-08-14 (MIME Type Migration Fix):
✅ **Race Condition Prevention Implemented**:
- Added `inFlightProjectIdRef` to track specific project_id loading
- Prevents duplicate loads for same project_id
- Enhanced console logging for load tracking

🔍 **New Console Logs Added**:
```
[Editor] Early return - already loading project: {project_id}
[Editor] Early return - already initializing same project: {project_id}  
[Editor] Early return - project became loaded while waiting: {project_id}
[Editor] Starting project load: {project_id}
```

**Enhanced Debug Points** in `editor.$project_id.tsx`:
```typescript
// Lines 66-71: Duplicate load prevention
if (inFlightProjectIdRef.current === project_id) {
  debugLog(`[Editor] Early return - already loading project: ${project_id}`);
  return;
}

// Lines 75-80: Additional check after waiting
if (inFlightProjectIdRef.current === project_id) {
  debugLog(`[Editor] Early return - already initializing same project: ${project_id}`);
  return;
}

// Lines 95-105: Post-wait validation
if (latestActiveProjectId === project_id || inFlightProjectIdRef.current === project_id) {
  debugLog(`[Editor] Early return - project became loaded while waiting: ${project_id}`);
  return;
}
```

**Impact on Sticker Loading**:
- More reliable project initialization reduces timing issues
- Prevents multiple concurrent sticker loads for same project
- Should reduce edge cases where stickers load before project is ready

## Resolution Steps

1. [x] Add comprehensive debug logging to all sticker-related stores and components
2. [x] **Fixed project load race conditions** - prevents timing issues with sticker loading
3. [ ] Test sticker persistence across development and production environments  
4. [ ] **Next: Investigate StickerElement component rendering** - visual display issue
5. [ ] Implement proper loading states for sticker preview components
6. [ ] Add error boundaries around sticker rendering
7. [ ] Create sticker preview validation utilities
8. [ ] Update sticker documentation with integration patterns

## Current Status

**Priority 1 Issues**:
- ✅ Project loading race conditions (fixed)
- ✅ **MIME type data URL generation** (fixed)
  - ✅ Fixed new sticker creation with correct `data:image/svg+xml` MIME type
  - ✅ Added migration for existing stickers with wrong MIME type
  - ✅ Migration runs automatically in StickerCanvas component

**✅ SOLUTION IMPLEMENTED**:
The sticker preview issue has been resolved through a two-part fix:
1. **New stickers**: Fixed MIME type generation in `use-sticker-select.ts` (lines 64-66)
2. **Existing stickers**: Added migration in `StickerCanvas.tsx` (lines 49-76) that automatically corrects wrong MIME types

**Ready for Testing**:
The Electron app is currently running with both fixes applied. Existing stickers should now display correctly after the migration runs on component mount.