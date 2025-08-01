# Export Button Implementation Tasks

## Overview
Implementation tasks for video export functionality, broken down into <3 minute tasks.
Only **Required** (MVP) and **Advanced** (future enhancements) categories.

### 🔄 Reusable Components & Files Summary:

**From Our Codebase (qcut/apps/web/src/):**
1. **`components/delete-project-dialog.tsx`** - Dialog structure and patterns
2. **`components/rename-project-dialog.tsx`** - Input validation patterns
3. **`components/editor/preview-panel.tsx`** - Canvas setup and rendering
4. **`components/editor-header.tsx`** - Button styling and placement
5. **`components/editor/media-panel/export-all-button.tsx`** - Export handler patterns
6. **`components/ui/radio-group.tsx`** - Radio group component
7. **`components/ui/progress.tsx`** - Progress bar component
8. **`stores/media-store.ts`** - Zustand store patterns
9. **`stores/timeline-store.ts`** - getTotalDuration() method
10. **`stores/text2image-store.ts`** - History array pattern
11. **`types/timeline.ts`** - Type definition patterns
12. **`lib/zip-manager.ts`** - createDownloadLink function
13. **`lib/ffmpeg-utils.ts`** - Class structure patterns
14. **`hooks/use-toast.ts`** - Error notification patterns

**From Reference Version (docs/completed/reference-version/):**
1. **`export-dialog.tsx`** - Complete implementation reference
2. **`export-engine-factory.ts`** - Factory pattern
3. **`export-engine-optimized.ts`** - Optimization techniques
4. **`memory-monitor.ts`** - Memory calculation formulas
5. **`pages/editor/project/[project_id].tsx`** - Dialog integration pattern

---

## 📋 Required Tasks (MVP - 5 Core Files)

### 1. Type Definitions (3 min) ✅ COMPLETED
**Target**: `qcut/apps/web/src/types/export.ts` (NEW FILE)
**Reference**: `qcut/apps/web/src/types/timeline.ts` (for type patterns)
```typescript
// Create export enums and interfaces
- [x] Create ExportFormat enum (MP4 only for MVP)
- [x] Create ExportQuality enum (HIGH, MEDIUM, LOW) 
- [x] Create ExportSettings interface
- [x] Create ExportProgress interface
// Borrow: Enum patterns and interface structure from timeline.ts
```
**Implementation Notes:**
- Added QUALITY_RESOLUTIONS and QUALITY_SIZE_ESTIMATES constants
- Added helper functions: isValidFilename() and getDefaultFilename()
- MVP focuses on MP4 only, with placeholders for future formats

### 2. Export Store Setup (3 min) ✅ COMPLETED
**Target**: `qcut/apps/web/src/stores/export-store.ts` (NEW FILE)
**Reference**: `qcut/apps/web/src/stores/media-store.ts` (for store patterns)
```typescript
// Create Zustand store for export state
- [x] Create store with isDialogOpen state
- [x] Add settings state (format, quality, filename)
- [x] Add progress state (isExporting, progress, status)
- [x] Add actions (setDialogOpen, updateSettings, updateProgress)
// Borrow: Zustand store structure, devtools setup from media-store.ts
```
**Implementation Notes:**
- Used devtools middleware for debugging
- Auto-updates resolution when quality changes
- Added error state and resetExport action
- Uses factory functions for default values

### 3. Export Button in Header (2 min) ✅ COMPLETED
**Target**: `qcut/apps/web/src/components/editor-header.tsx` (MODIFY)
**Reference**: Same file - look at export-all button implementation
```typescript
// Add export button that opens dialog
- [x] Import useExportStore
- [x] Add Export button with Download icon
- [x] Add onClick handler to setDialogOpen(true)
- [x] Style button to match existing buttons
// Borrow: Button styling and placement from existing export-all button
```
**Implementation Notes:**
- Updated existing Export button (was previously Rick Roll placeholder)
- Imported useExportStore and setDialogOpen action
- Button already had proper styling and Download icon

### 4. Dialog Integration in Editor (2 min) ✅ COMPLETED
**Target**: `qcut/apps/web/src/routes/editor.$project_id.tsx` (MODIFY)
**Reference**: `docs/completed/reference-version/.../[project_id].tsx` (for pattern)
```typescript
// Show export dialog when open
- [x] Import ExportDialog component
- [x] Import useExportStore for isDialogOpen
- [x] Replace PropertiesPanel with ExportDialog when isDialogOpen
- [x] Test dialog opens/closes properly
// Borrow: Conditional rendering pattern from reference version
```
**Implementation Notes:**
- Created placeholder ExportDialog component for testing
- Added conditional rendering: `{isDialogOpen ? <ExportDialog /> : <PropertiesPanel />}`
- Dialog replaces properties panel when open (as in reference version)
- Export button now opens dialog, close button works

### 5. Basic Export Canvas (2 min) ✅ COMPLETED
**Target**: `qcut/apps/web/src/components/export-canvas.tsx` (NEW FILE)
**Reference**: `qcut/apps/web/src/components/editor/preview-panel.tsx`
```typescript
// Canvas component - adapt from preview-panel.tsx
- [x] Copy canvas setup pattern from preview-panel
- [x] Simplify to just canvas element with ref
- [x] Use canvasSize from useEditorStore (already exists!)
- [x] Hide with CSS (position: absolute, visibility: hidden)
// Borrow: Canvas ref setup, dimension handling from preview-panel.tsx
```
**Implementation Notes:**
- Created ExportCanvas component with forwardRef pattern
- Uses useExportStore settings for canvas dimensions
- Auto-updates canvas size when settings change
- Properly hidden with CSS (position: absolute, visibility: hidden)
- Exposes getCanvas() and updateDimensions() methods via ref

### 6. Export Dialog UI - Part 1 (2 min) ✅ COMPLETED
**Target**: `qcut/apps/web/src/components/export-dialog.tsx` (NEW FILE)
**Reference**: `qcut/apps/web/src/components/delete-project-dialog.tsx`
```typescript
// Dialog setup - copy pattern from delete-project-dialog.tsx
- [x] Copy Dialog component structure from delete-project-dialog
- [x] Change title to "Export Video"
- [x] Keep same Dialog, DialogContent, DialogHeader imports
- [x] Use same onOpenChange pattern for closing
// Borrow: Complete dialog structure, imports, close button pattern
```
**Implementation Notes:**
- Built complete export dialog with full UI implementation
- Quality selection radio group (1080p/720p/480p)
- Filename input with validation
- Export details card showing resolution, size, duration
- Progress tracking with Progress component
- Error and warning alerts
- Export button with proper disabled states
- Canvas ref integration ready for export engine

### 7. Export Dialog UI - Part 2 (3 min) ✅ COMPLETED
**Target**: `qcut/apps/web/src/components/export-dialog.tsx` (CONTINUE)
**Reference**: `qcut/apps/web/src/components/ui/radio-group.tsx` (component)
```typescript
// Quality selection radio group
- [x] Add quality radio group (1080p, 720p, 480p)
- [x] Connect to local state
- [x] Show resolution info (1920×1080, etc.)
- [x] Update export store on change
// Borrow: RadioGroup component usage patterns
```
**Implementation Notes:**
- Quality radio group implemented with ExportQuality enum values
- Shows descriptive labels: "1080p (High Quality) - 1920×1080"
- Connected to local state with handleQualityChange function
- Updates export store settings when quality changes
- Uses QUALITY_RESOLUTIONS mapping for resolution display

### 8. Export Dialog UI - Part 3 (3 min) ✅ COMPLETED
**Target**: `qcut/apps/web/src/components/export-dialog.tsx` (CONTINUE)
**Reference**: `qcut/apps/web/src/components/rename-project-dialog.tsx` (input pattern)
```typescript
// Filename input
- [x] Add filename input field
- [x] Add validation for special characters
- [x] Show .mp4 extension
- [x] Display validation errors
// Borrow: Input validation pattern from rename-project-dialog
```
**Implementation Notes:**
- Filename input with controlled state (handleFilenameChange)
- Validation using isValidFilename() helper function
- Red border styling when invalid filename
- Shows .mp4 extension as static text next to input
- Error message displays forbidden characters: < > : " / \ | ? *
- Updates export store settings on change

### 9. Export Dialog UI - Part 4 (3 min) ✅ COMPLETED
**Target**: `qcut/apps/web/src/components/export-dialog.tsx` (CONTINUE)
**Reference**: `qcut/apps/web/src/components/ui/progress.tsx` (component)
```typescript
// Export button and progress
- [x] Add Export Video button
- [x] Add progress bar component
- [x] Show progress percentage
- [x] Disable button during export
// Borrow: Progress component usage, button disabled state patterns
```
**Implementation Notes:**
- Export button with Download icon, changes text to "Exporting..." when active
- Button disabled when: exporting, invalid filename, or timeline empty
- Progress component shows percentage and status text
- Progress card only visible during export (conditional rendering)
- Progress value connected to export store progress state

### 10. Basic Export Engine - Part 1 (3 min)
**Target**: `qcut/apps/web/src/lib/export-engine.ts` (NEW FILE)
**Reference**: `qcut/apps/web/src/lib/ffmpeg-utils.ts` (for class structure)
```typescript
// Engine setup and initialization
- [ ] Create ExportEngine class
- [ ] Add constructor with canvas, settings
- [ ] Add method to get timeline elements
- [ ] Add method to calculate total frames
// Borrow: Class structure patterns, async method patterns
```

### 11. Basic Export Engine - Part 2 (3 min)
**Target**: `qcut/apps/web/src/lib/export-engine.ts` (CONTINUE)
**Reference**: `qcut/apps/web/src/components/editor/preview-panel.tsx` (rendering)
```typescript
// Frame rendering logic
- [ ] Add renderFrame method
- [ ] Clear canvas and draw elements
- [ ] Handle media elements (images/videos)
- [ ] Handle text elements
// Borrow: Element rendering logic from preview-panel renderElements
```

### 12. Basic Export Engine - Part 3 (3 min)
**Target**: `qcut/apps/web/src/lib/export-engine.ts` (CONTINUE)
**Reference**: MDN MediaRecorder docs / no direct reference in codebase
```typescript
// Video recording setup
- [ ] Add MediaRecorder setup
- [ ] Configure video codec and bitrate
- [ ] Add blob collection array
- [ ] Add start/stop recording methods
// Note: MediaRecorder is standard browser API, no existing usage in codebase
```

### 13. Basic Export Engine - Part 4 (3 min)
**Target**: `qcut/apps/web/src/lib/export-engine.ts` (CONTINUE)
**Reference**: Animation loop patterns from preview rendering
```typescript
// Export loop implementation
- [ ] Add main export loop
- [ ] Render frame by frame
- [ ] Update progress callback
- [ ] Handle completion
// Borrow: requestAnimationFrame patterns, progress calculation logic
```

### 14. Basic Export Engine - Part 5 (2 min) ✨ REUSE OPPORTUNITY
**Target**: `qcut/apps/web/src/lib/export-engine.ts` (CONTINUE)
**Reference**: `qcut/apps/web/src/lib/zip-manager.ts` (download logic)
```typescript
// Download - adapt from zip-manager.ts
- [ ] Create final video blob from MediaRecorder
- [ ] Copy createDownloadLink pattern from zip-manager
- [ ] Change MIME type to video/mp4
- [ ] Clean up blob URLs after download
// Borrow: Entire createDownloadLink function, just change MIME type
```

### 15. Wire Up Export Process (3 min)
**Target**: `qcut/apps/web/src/components/export-dialog.tsx` (CONTINUE)
**Reference**: `qcut/apps/web/src/components/editor/media-panel/export-all-button.tsx`
```typescript
// Connect engine to dialog
- [ ] Import export engine
- [ ] Add handleExport function
- [ ] Get canvas ref and create engine
- [ ] Handle progress updates
// Borrow: Async export handler pattern from export-all-button
```

### 16. Error Handling (3 min)
**Target**: `qcut/apps/web/src/components/export-dialog.tsx` (CONTINUE)
**Reference**: `qcut/apps/web/src/hooks/use-toast.ts` (for notifications)
```typescript
// Basic error handling
- [ ] Add try-catch to export process
- [ ] Show error messages to user
- [ ] Reset progress on error
- [ ] Log errors to console
// Borrow: Toast notification pattern for user feedback
```

### 17. Timeline Duration Check (2 min)
**Target**: `qcut/apps/web/src/components/export-dialog.tsx` (CONTINUE)
**Reference**: `qcut/apps/web/src/stores/timeline-store.ts` (getTotalDuration)
```typescript
// Prevent empty exports
- [ ] Get timeline duration
- [ ] Show warning if timeline empty
- [ ] Disable export button if duration = 0
- [ ] Display duration in UI
// Borrow: Use existing getTotalDuration() from timeline store
```

### 18. Final Testing Checklist (3 min)
```
- [ ] Export button opens dialog
- [ ] Dialog closes with X button
- [ ] Quality selection works
- [ ] Filename validation works
- [ ] Progress bar updates during export
- [ ] Video downloads successfully
- [ ] Errors handled gracefully
```

---

## 🚀 Advanced Tasks (Future Enhancements)

### A1. Memory Warning System (3 min)
**Target**: `qcut/apps/web/src/lib/memory-utils.ts` (NEW FILE)
**Reference**: `docs/completed/reference-version/.../memory-monitor.ts`
```typescript
// Basic memory estimation
- [ ] Calculate estimated memory usage
- [ ] Show warning for large exports
- [ ] Suggest lower quality if needed
// Borrow: Memory calculation formulas from reference version
```

### A2. Multiple Format Support (3 min)
**Target**: `qcut/apps/web/src/components/export-dialog.tsx` (MODIFY)
**Reference**: MediaRecorder codec options documentation
```typescript
// Add format selection
- [ ] Add format radio group (MP4, WebM, MOV)
- [ ] Update codec selection logic
- [ ] Update file extension display
// Note: Different codecs for different formats in MediaRecorder options
```

### A3. Export Engine Factory (3 min)
**Target**: `qcut/apps/web/src/lib/export-engine-factory.ts` (NEW FILE)
**Reference**: `docs/completed/reference-version/.../export-engine-factory.ts`
```typescript
// Engine selection logic
- [ ] Create factory class
- [ ] Add browser capability detection
- [ ] Select best available engine
// Borrow: Factory pattern and capability detection from reference
```

### A4. Optimized Export Engine (3 min)
**Target**: `qcut/apps/web/src/lib/export-engine-optimized.ts` (NEW FILE)
**Reference**: `docs/completed/reference-version/.../export-engine-optimized.ts`
```typescript
// Performance improvements
- [ ] Extend base export engine
- [ ] Add frame caching
- [ ] Optimize rendering pipeline
// Borrow: Optimization techniques from reference version
```

### A5. Cancel Export Feature (3 min)
**Target**: `qcut/apps/web/src/components/export-dialog.tsx` (MODIFY)
**Reference**: AbortController patterns in modern JS
```typescript
// Allow canceling exports
- [ ] Add cancel button during export
- [ ] Add abort controller to engine
- [ ] Clean up on cancel
// Borrow: AbortController usage pattern
```

### A6. Export Presets (3 min)
**File**: `components/export-dialog.tsx`
```typescript
// Quick export options
- [ ] Add preset buttons (YouTube, Instagram, etc.)
- [ ] Auto-configure resolution/quality
- [ ] Show preset descriptions
```

### A7. WebCodecs Detection (3 min)
**File**: `lib/webcodecs-detector.ts`
```typescript
// Check browser support
- [ ] Detect WebCodecs availability
- [ ] Check codec support
- [ ] Return capability report
```

### A8. Basic WebCodecs Engine (3 min)
**File**: `lib/webcodecs-export-engine.ts`
```typescript
// Modern browser API usage
- [ ] Create WebCodecs-based engine
- [ ] Use VideoEncoder API
- [ ] Handle hardware acceleration
```

### A9. Export History (3 min)
**Target**: `qcut/apps/web/src/stores/export-store.ts` (MODIFY)
**Reference**: `qcut/apps/web/src/stores/text2image-store.ts` (history pattern)
```typescript
// Remember recent exports
- [ ] Add export history array
- [ ] Store recent filenames/settings
- [ ] Add quick re-export feature
// Borrow: History array pattern from text2image-store generationHistory
```

### A10. Advanced Progress Info (3 min)
**File**: `components/export-dialog.tsx`
```typescript
// Detailed progress display
- [ ] Show current frame / total frames
- [ ] Add time remaining estimate
- [ ] Show encoding speed (fps)
```

---

## 📊 Task Summary

### Required Tasks: 18 tasks (avg 2.7 min) = ~45 minutes
- Type definitions and store setup
- UI components and dialog (faster with reuse!)
- Basic export engine
- Error handling and testing

### Advanced Tasks: 10 tasks × 3 min = 30 minutes
- Performance optimizations
- Additional formats
- Modern browser APIs
- Quality of life features

### Total Implementation Time:
- **MVP**: ~1 hour (Required only)
- **Full Featured**: ~1.5 hours (Required + Advanced)

### Development Order:
1. Start with Required tasks 1-4 (setup)
2. Build UI (tasks 5-9)
3. Implement engine (tasks 10-14)
4. Wire everything together (tasks 15-17)
5. Test thoroughly (task 18)
6. Add advanced features as needed

### Notes:
- Each task is designed to be completed in <3 minutes
- Tasks can be done independently by different developers
- Advanced tasks can be added incrementally
- Focus on shipping MVP first, enhance later

### 💡 Key Reuse Opportunities:
1. **Dialog Pattern**: Copy from `delete-project-dialog.tsx` - saves UI setup time
2. **Canvas Logic**: Adapt from `preview-panel.tsx` - already handles dimensions
3. **Download Code**: Use `zip-manager.ts` pattern - proven download logic
4. **Type Structure**: Follow existing patterns in `types/timeline.ts`
5. **Store Pattern**: Copy structure from other Zustand stores
6. **Button Styling**: Match `editor-header.tsx` export-all button

### 📉 Time Savings from Reuse:
- Original estimate: 54 minutes
- With reuse: ~45 minutes (20% faster)
- Less debugging needed (proven patterns)
- Consistent with existing codebase