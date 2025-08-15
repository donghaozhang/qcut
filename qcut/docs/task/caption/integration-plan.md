# Caption Feature Integration Plan

## Overview
Step-by-step integration plan for adding auto-captions transcription feature to QCut. Each subtask is designed to take less than 10 minutes and can be completed independently.

---

## Phase 1: Environment Setup (30 minutes total)

### Task 1.1: Add Environment Variables (5 minutes)
- [ ] Add transcription variables to `apps/web/.env.example`
- [ ] Copy variables from `env-example-additions.md`
- [ ] Test environment variable loading

### Task 1.2: Install Required Dependencies (8 minutes)
- [ ] Add `zod` to package.json if not present
- [ ] Add rate limiting dependencies (`@upstash/ratelimit`, `@upstash/redis`)
- [ ] Run `bun install` to install new dependencies
- [ ] Verify installations

### Task 1.3: Create Transcription Directory Structure (5 minutes)
- [ ] Create `apps/web/src/lib/transcription/` directory
- [ ] Create `apps/web/src/components/editor/transcription/` directory
- [ ] Create `apps/transcription/` directory in root

### Task 1.4: Setup Python Environment (10 minutes)
- [ ] Copy `requirements.txt` to `apps/transcription/`
- [ ] Copy `transcription.py` to `apps/transcription/`
- [ ] Copy `transcription-README.md` to `apps/transcription/README.md`
- [ ] Create Python virtual environment
- [ ] Install Python dependencies

---

## Phase 2: Core Utilities Integration (25 minutes total)

### Task 2.1: Add Zero-Knowledge Encryption (5 minutes)
- [ ] Copy `zk-encryption.ts` to `apps/web/src/lib/transcription/`
- [ ] Verify TypeScript compilation
- [ ] Test encryption utility functions

### Task 2.2: Add Transcription Utils (5 minutes)
- [ ] Copy `transcription-utils.ts` to `apps/web/src/lib/transcription/`
- [ ] Update import paths if needed
- [ ] Test configuration validation functions

### Task 2.3: Create Transcription Types (8 minutes)
- [ ] Create `apps/web/src/types/transcription.ts`
- [ ] Define TypeScript interfaces for transcription data
- [ ] Export types for use across components

### Task 2.4: Add Rate Limiting Configuration (7 minutes)
- [ ] Create rate limiting utility in `apps/web/src/lib/rate-limit.ts`
- [ ] Configure Redis connection
- [ ] Test rate limiting functionality

---

## Phase 3: API Integration (20 minutes total)

### Task 3.1: Create Transcription API Route (8 minutes)
- [ ] Create `apps/web/src/app/api/transcribe/` directory
- [ ] Copy `route.ts` to the directory
- [ ] Update import paths for our project structure
- [ ] Test API endpoint creation

### Task 3.2: Add Cloudflare R2 Integration (7 minutes)
- [ ] Install `@aws-sdk/client-s3` if not present
- [ ] Create R2 client utility in `apps/web/src/lib/storage/`
- [ ] Test R2 connection and file operations

### Task 3.3: Test API Route (5 minutes)
- [ ] Start development server
- [ ] Test `/api/transcribe` endpoint with Postman/curl
- [ ] Verify error handling and validation

---

## Phase 4: UI Components Integration (35 minutes total)

### Task 4.1: Add Language Selection Component (8 minutes)
- [ ] Copy `language-select.tsx` to `apps/web/src/components/ui/`
- [ ] Update import paths for our UI library
- [ ] Add to component exports

### Task 4.2: Create Transcription Panel (10 minutes)
- [ ] Create `apps/web/src/components/editor/transcription/transcription-panel.tsx`
- [ ] Design basic UI for transcription controls
- [ ] Add language selection integration

### Task 4.3: Add Upload Progress Component (8 minutes)
- [ ] Create upload progress indicator
- [ ] Add file encryption status display
- [ ] Integrate with transcription panel

### Task 4.4: Create Captions Display Component (9 minutes)
- [ ] Create component to display transcribed captions
- [ ] Add timeline synchronization
- [ ] Style captions overlay for video preview

---

## Phase 5: Timeline Integration (30 minutes total)

### Task 5.1: Add Caption Track Type (5 minutes)
- [ ] Update `apps/web/src/types/timeline.ts`
- [ ] Add caption track interface
- [ ] Update timeline store types

### Task 5.2: Create Caption Timeline Track (10 minutes)
- [ ] Create caption-specific timeline track component
- [ ] Add caption editing capabilities
- [ ] Integrate with existing timeline

### Task 5.3: Add Caption Store (8 minutes)
- [ ] Create `apps/web/src/stores/caption-store.ts`
- [ ] Add caption management functions
- [ ] Integrate with project store

### Task 5.4: Timeline Caption Rendering (7 minutes)
- [ ] Add caption rendering to timeline tracks
- [ ] Implement caption timing display
- [ ] Add caption editing controls

---

## Phase 6: Media Panel Integration (25 minutes total)

### Task 6.1: Add Transcription Tab to Media Panel (8 minutes)
- [ ] Update media panel to include transcription tab
- [ ] Add transcription panel to tab content
- [ ] Style transcription controls

### Task 6.2: Audio Extraction Integration (10 minutes)
- [ ] Add audio extraction from video files
- [ ] Integrate with FFmpeg utilities
- [ ] Handle audio file preparation for transcription

### Task 6.3: Transcription Process UI (7 minutes)
- [ ] Add transcription start/stop controls
- [ ] Display transcription progress
- [ ] Handle transcription results

---

## Phase 7: Export Integration (15 minutes total)

### Task 7.1: Add Caption Export Formats (8 minutes)
- [ ] Add SRT subtitle format export
- [ ] Add VTT subtitle format export
- [ ] Integrate with export engine

### Task 7.2: Export Dialog Integration (7 minutes)
- [ ] Update export dialog to include caption options
- [ ] Add caption burn-in option
- [ ] Test caption export functionality

---

## Phase 8: Testing & Polish (20 minutes total)

### Task 8.1: End-to-End Testing (10 minutes)
- [ ] Test complete transcription workflow
- [ ] Verify caption synchronization
- [ ] Test export with captions

### Task 8.2: Error Handling & UX (5 minutes)
- [ ] Add loading states for transcription
- [ ] Add error messages for failed transcriptions
- [ ] Add success notifications

### Task 8.3: Performance Optimization (5 minutes)
- [ ] Optimize large audio file handling
- [ ] Add transcription caching
- [ ] Test with various file formats

---

## Deployment Tasks (15 minutes total)

### Task 9.1: Modal Deployment (8 minutes)
- [ ] Set up Modal account and secrets
- [ ] Deploy transcription.py to Modal
- [ ] Test deployed transcription service

### Task 9.2: Environment Configuration (7 minutes)
- [ ] Set up Cloudflare R2 bucket
- [ ] Configure production environment variables
- [ ] Test production transcription workflow

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