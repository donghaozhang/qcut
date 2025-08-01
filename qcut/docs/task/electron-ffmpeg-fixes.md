# Electron FFmpeg Quick Fixes - Task Breakdown

## Task 1: Fix FFmpeg WebAssembly Path Configuration (2 minutes)
**File:** `src/lib/ffmpeg-utils.ts` or FFmpeg store configuration
**Goal:** Update hardcoded FFmpeg path from `C:/ffmpeg/` to use bundled assets
**Action:** 
- Find FFmpeg initialization code
- Change path to relative/bundled location
- Test that FFmpeg loads without 404 errors

## Task 2: Bundle FFmpeg WASM Files in Build (3 minutes)
**File:** `vite.config.ts` or build configuration
**Goal:** Include FFmpeg WebAssembly files in the build output
**Action:**
- Add FFmpeg WASM files to Vite's public assets
- Ensure they're copied to dist folder during build
- Verify files exist in `apps/web/dist/` after build

## Task 3: Update Content Security Policy for Media (2 minutes)
**File:** `electron/main.js`
**Goal:** Allow blob: URLs for media playback
**Action:**
- Add `webSecurity: false` is already done, but may need CSP headers
- Test if additional CSP configuration needed
- Verify video blob URLs load correctly

## Task 4: Test FFmpeg Initialization (1 minute)
**Goal:** Verify FFmpeg loads without errors
**Action:**
- Open developer tools in Electron app
- Check console for FFmpeg-related errors
- Confirm no 404 errors for ffmpeg-core.js

## Task 5: Test Video Import Functionality (2 minutes)
**Goal:** Verify video files can be imported and processed
**Action:**
- Try importing a small test video file
- Check if video thumbnail generates
- Verify video appears in media panel

## Task 6: Test Basic Video Processing (3 minutes)
**Goal:** Ensure FFmpeg can process video operations
**Action:**
- Add video to timeline
- Try basic operations (trim, cut)
- Check if processing completes without errors

## Expected Results After Completion
- ✅ No FFmpeg 404 errors in console
- ✅ Video files import successfully 
- ✅ Video thumbnails generate
- ✅ Basic video processing works
- ✅ Media playback works with blob URLs

## Priority Order
1. Task 1 (FFmpeg path fix) - **CRITICAL**
2. Task 2 (Bundle WASM files) - **CRITICAL**  
3. Task 3 (CSP for media) - **HIGH**
4. Task 4 (Test initialization) - **MEDIUM**
5. Task 5 (Test import) - **MEDIUM**
6. Task 6 (Test processing) - **LOW**

## Time Estimate: 13 minutes total