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
**Key Initialization Flow** (Lines 41-100):
- Project loading with race condition prevention
- Concurrent load handling
- Project validation

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

**Session 1** - [Date]:
- Test sticker store persistence across project loads
- Monitor console for storage-related errors
- Check timing of component mounts vs data loading

**Session 2** - [Date]:
- Investigate media item creation and sticker association
- Test sticker visibility calculation
- Verify canvas rendering pipeline

## Resolution Steps

1. [ ] Add comprehensive debug logging to all sticker-related stores and components
2. [ ] Test sticker persistence across development and production environments  
3. [ ] Implement proper loading states for sticker preview components
4. [ ] Add error boundaries around sticker rendering
5. [ ] Create sticker preview validation utilities
6. [ ] Update sticker documentation with integration patterns