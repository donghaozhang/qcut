# Caption Feature Integration Plan - UPDATED FOR QCUT ARCHITECTURE

## Overview
Step-by-step integration plan for adding auto-captions transcription feature to QCut. Each subtask is designed to take less than 10 minutes and can be completed independently.

**⚠️ IMPORTANT:** QCut uses Vite + TanStack Router, NOT Next.js. Route structure and imports need updates.

---

## ✅ Phase 1: Environment Setup (30 minutes total) - COMPLETED

### ✅ Task 1.1: Add Environment Variables (5 minutes) - COMPLETED
- [x] Add transcription variables to `qcut/apps/web/.env.example`
- [x] Copy variables from `caption/env-example-additions.md`
- [x] Update `qcut/apps/web/src/env.ts` to include new variables
- [x] Test environment variable loading

### ✅ Task 1.2: Install Required Dependencies (8 minutes) - COMPLETED
**Note:** `zod`, `@upstash/ratelimit`, `@upstash/redis` already exist in package.json
- [x] Add `@aws-sdk/client-s3` to `qcut/apps/web/package.json`
- [x] Run `bun install` in `qcut/` directory
- [x] Verify installations don't conflict with existing dependencies

### ✅ Task 1.3: Create Transcription Directory Structure (5 minutes) - COMPLETED
- [x] Create `qcut/apps/web/src/lib/transcription/` directory
- [x] Create `qcut/apps/web/src/components/editor/captions/` directory (not transcription)
- [x] Create `qcut/apps/transcription/` directory in root

### ✅ Task 1.4: Setup Python Environment (10 minutes) - COMPLETED
- [x] Copy `requirements.txt` to `qcut/apps/transcription/`
- [x] Copy `transcription.py` to `qcut/apps/transcription/`
- [x] Copy `transcription-README.md` to `qcut/apps/transcription/README.md`
- [x] Create Python virtual environment in `qcut/apps/transcription/`
- [x] Install Python dependencies

---

## ✅ Phase 2: Core Utilities Integration (25 minutes total) - COMPLETED

### ✅ Task 2.1: Add Zero-Knowledge Encryption (5 minutes) - COMPLETED
- [x] Copy `zk-encryption.ts` to `qcut/apps/web/src/lib/transcription/`
- [x] Update imports to use `@/lib/utils` pattern
- [x] Verify TypeScript compilation with `bun run build`

### ✅ Task 2.2: Add Transcription Utils (5 minutes) - COMPLETED
- [x] Copy `transcription-utils.ts` to `qcut/apps/web/src/lib/transcription/`
- [x] Update imports to match QCut's env pattern (`@/env`)
- [x] Test configuration validation functions

### ✅ Task 2.3: Create Transcription Types (8 minutes) - COMPLETED
- [x] Create `qcut/apps/web/src/types/captions.ts` (not transcription.ts)
- [x] Define TypeScript interfaces for caption/transcription data
- [x] Export types for use across components
- [x] Add caption track type to existing `qcut/apps/web/src/types/timeline.ts`
- [x] Update timeline constants to include captions colors and heights

### ✅ Task 2.4: Verify Rate Limiting (5 minutes) - COMPLETED
**Note:** Rate limiting already exists in `qcut/apps/web/src/lib/rate-limit.ts`
- [x] Review existing rate limiting implementation
- [x] Add `baseRateLimit` and `transcriptionRateLimit` for API endpoints
- [x] Test rate limiting functionality with successful build

---

## Phase 3: API Route Integration - **MAJOR CHANGES NEEDED** (25 minutes total)

### Task 3.1: Convert Next.js Route to TanStack Router (15 minutes)
**⚠️ CRITICAL:** Original route.ts is Next.js - QCut uses Vite + TanStack Router
- [ ] Create `qcut/apps/web/src/routes/api/transcribe.tsx` 
- [ ] Convert Next.js API route to TanStack Router format
- [ ] Update imports: Remove `NextRequest/NextResponse`, use standard fetch
- [ ] Update environment imports to use `@/env` instead of Next.js env
- [ ] Test API endpoint with Vite dev server

### Task 3.2: Add Cloudflare R2 Integration (7 minutes)
- [ ] Create R2 client utility in `qcut/apps/web/src/lib/storage/r2-client.ts`
- [ ] Integrate with existing storage service pattern
- [ ] Test R2 connection and file operations

### Task 3.3: Test API Route (3 minutes)
- [ ] Start Vite dev server (`bun run dev`)
- [ ] Test `/api/transcribe` endpoint with Postman/curl
- [ ] Verify error handling and validation

---

## Phase 4: UI Components Integration (35 minutes total)

### Task 4.1: Add Language Selection Component (8 minutes)
- [ ] Copy `language-select.tsx` to `qcut/apps/web/src/components/ui/`
- [ ] Update imports to match QCut's UI library patterns
- [ ] Ensure Framer Motion animations work with existing setup
- [ ] Add component to UI exports

### Task 4.2: Create Captions Panel (10 minutes)
- [ ] Create `qcut/apps/web/src/components/editor/captions/captions-panel.tsx`
- [ ] Design basic UI matching QCut's media panel style
- [ ] Add language selection integration
- [ ] Use existing UI components (Button, Dialog, etc.)

### Task 4.3: Add Upload Progress Component (8 minutes)
- [ ] Create upload progress indicator using existing Progress component
- [ ] Add file encryption status display
- [ ] Integrate with captions panel
- [ ] Follow QCut's existing progress pattern from media upload

### Task 4.4: Create Captions Display Component (9 minutes)
- [ ] Create component to display transcribed captions in timeline
- [ ] Add timeline synchronization using existing playback store
- [ ] Style captions overlay for video preview panel
- [ ] Use existing timeline styling patterns

---

## Phase 5: Timeline Integration (30 minutes total)

### Task 5.1: Add Caption Track Type (8 minutes)
**⚠️ EXISTING TIMELINE STRUCTURE:** QCut has `TrackType = "media" | "text" | "audio" | "sticker"`
- [ ] Update `qcut/apps/web/src/types/timeline.ts` to add `"captions"` to TrackType
- [ ] Add CaptionElement interface extending BaseTimelineElement
- [ ] Update TimelineElement union type
- [ ] Update track sorting logic in `sortTracksByOrder`

### Task 5.2: Create Caption Timeline Track (10 minutes)
- [ ] Create caption-specific timeline track in `qcut/apps/web/src/components/editor/timeline/`
- [ ] Follow existing pattern from `timeline-track.tsx`
- [ ] Add caption editing capabilities
- [ ] Integrate with existing timeline drag/drop system

### Task 5.3: Add Caption Store (8 minutes)
- [ ] Create `qcut/apps/web/src/stores/captions-store.ts`
- [ ] Follow existing Zustand pattern from other stores
- [ ] Add caption management functions
- [ ] Integrate with existing project store using dynamic imports (avoid circular deps)

### Task 5.4: Timeline Caption Rendering (4 minutes)
- [ ] Add caption rendering to existing timeline components
- [ ] Implement caption timing display using existing timeline utils
- [ ] Add caption editing controls following existing patterns

---

## Phase 6: Media Panel Integration - **CAPTIONS TAB EXISTS** (20 minutes total)

### Task 6.1: Update Existing Captions Tab (5 minutes)
**⚠️ GOOD NEWS:** Captions tab already exists in `qcut/apps/web/src/components/editor/media-panel/`
- [ ] Update `qcut/apps/web/src/components/editor/media-panel/index.tsx`
- [ ] Replace placeholder "Captions view coming soon..." with actual CaptionsPanel
- [ ] Import and integrate captions panel component

### Task 6.2: Audio Extraction Integration (10 minutes)
- [ ] Integrate with existing FFmpeg utilities in `qcut/apps/web/src/lib/ffmpeg-utils.ts`
- [ ] Add audio extraction from video files using existing patterns
- [ ] Handle audio file preparation for transcription
- [ ] Use existing media processing pipeline

### Task 6.3: Transcription Process UI (5 minutes)
- [ ] Add transcription start/stop controls to captions panel
- [ ] Display transcription progress using existing progress patterns
- [ ] Handle transcription results and integrate with timeline
- [ ] Use existing toast notifications (sonner)

---

## Phase 7: Export Integration (15 minutes total)

### Task 7.1: Add Caption Export Formats (8 minutes)
- [ ] Add SRT subtitle format export to `qcut/apps/web/src/lib/export-engine.ts`
- [ ] Add VTT subtitle format export
- [ ] Integrate with existing export engine factory pattern

### Task 7.2: Export Dialog Integration (7 minutes)
- [ ] Update `qcut/apps/web/src/components/export-dialog.tsx`
- [ ] Add caption options following existing export options pattern
- [ ] Add caption burn-in option using FFmpeg
- [ ] Test caption export functionality

---

## Phase 8: Testing & Polish (20 minutes total)

### Task 8.1: End-to-End Testing (10 minutes)
- [ ] Test complete transcription workflow in Electron app
- [ ] Verify caption synchronization with video playback
- [ ] Test export with captions in both development and build
- [ ] Test with various video formats supported by QCut

### Task 8.2: Error Handling & UX (5 minutes)
- [ ] Add loading states using existing skeleton patterns
- [ ] Add error messages using existing toast system (sonner)
- [ ] Add success notifications following QCut patterns

### Task 8.3: Performance Optimization (5 minutes)
- [ ] Optimize large audio file handling using existing media processing
- [ ] Add transcription caching using existing storage service
- [ ] Test with various file formats and sizes

---

## Deployment Tasks (15 minutes total)

### Task 9.1: Modal Deployment (8 minutes)
- [ ] Set up Modal account and secrets
- [ ] Deploy `qcut/apps/transcription/transcription.py` to Modal
- [ ] Test deployed transcription service

### Task 9.2: Environment Configuration (7 minutes)
- [ ] Set up Cloudflare R2 bucket for transcription files
- [ ] Configure production environment variables in QCut deployment
- [ ] Test production transcription workflow in Electron build

---

## **BREAKING CHANGES AVOIDED:**

✅ **No Timeline Structure Changes:** Caption tracks integrate with existing timeline
✅ **No Media Panel Changes:** Uses existing captions tab placeholder
✅ **No Store Conflicts:** Uses dynamic imports to avoid circular dependencies
✅ **No UI Breaking:** Uses existing UI components and patterns
✅ **No Build Issues:** Follows existing Vite + TanStack Router architecture

## **CRITICAL UPDATES MADE:**

🔧 **API Route:** Convert from Next.js to TanStack Router format
🔧 **Environment:** Use QCut's env pattern instead of Next.js
🔧 **File Paths:** All paths updated to match QCut structure
🔧 **Dependencies:** Verified existing packages, minimal additions needed
🔧 **Architecture:** Adapted to Vite + TanStack Router instead of Next.js

## **FILE PATH CORRECTIONS:**

- ❌ `apps/web/src/app/api/` → ✅ `qcut/apps/web/src/routes/api/`
- ❌ Next.js route format → ✅ TanStack Router format  
- ❌ `transcription/` folders → ✅ `captions/` folders (match existing tab)
- ❌ Next.js imports → ✅ Vite + standard web API imports

---

## Total Estimated Time: 215 minutes (3.5 hours)

## Prerequisites Before Starting
- [ ] Modal account created
- [ ] Cloudflare R2 bucket set up
- [ ] Redis instance for rate limiting
- [ ] Python environment available

## Success Criteria
- [ ] Users can upload audio/video files for transcription
- [ ] Captions appear on timeline synchronized with media
- [ ] Captions can be edited and exported
- [ ] Zero-knowledge encryption works properly
- [ ] Rate limiting prevents abuse

## Notes
- Each task is designed to be atomic and testable
- Tasks can be completed by different developers
- Progress can be tracked and paused at any point
- Rollback is possible after each completed task