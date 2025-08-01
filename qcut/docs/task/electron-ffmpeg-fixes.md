# Electron FFmpeg Quick Fixes - Task Breakdown

## ✅ GOOD NEWS: FFmpeg Files Already Configured Correctly!

**Discovery:** After reviewing source files:
- ✅ FFmpeg files exist in `apps/web/public/ffmpeg/` (ffmpeg-core.js, ffmpeg-core.wasm)
- ✅ Path configuration in `ffmpeg-utils.ts:29` uses `/ffmpeg` (correct relative path)
- ✅ Files should be bundled automatically by Vite from public folder

## Task 1: Verify FFmpeg Files in Build Output (1 minute)
**File:** Check `apps/web/dist/ffmpeg/` folder
**Goal:** Confirm FFmpeg WASM files exist in build output
**Action:** 
- Check if `apps/web/dist/ffmpeg/ffmpeg-core.js` exists
- Check if `apps/web/dist/ffmpeg/ffmpeg-core.wasm` exists
- If missing, copy from public folder

## Task 2: Fix Electron File Protocol Path Resolution (2 minutes)
**File:** `electron/main.js` - loadFile path
**Goal:** Ensure Electron correctly serves files from dist folder
**Action:**
- Verify `mainWindow.loadFile()` path points to correct index.html
- Check if static files are served correctly in production
- Test accessing `/ffmpeg/ffmpeg-core.js` in Electron

## Task 3: Fix CSP Headers for Blob URLs (2 minutes)
**File:** `electron/main.js` webPreferences
**Goal:** Allow blob: and data: URLs for media playback
**Action:**
- Current: `webSecurity: false` should allow everything
- Issue might be CSP meta tags in HTML
- Try adding explicit CSP allowlist if needed

## Task 4: Test FFmpeg File Access (1 minute)
**Goal:** Verify Electron can access FFmpeg files via file:// protocol
**Action:**
- Check browser console for 404 errors on ffmpeg-core.js
- Try accessing `file:///path/to/dist/ffmpeg/ffmpeg-core.js` directly
- Confirm FFmpeg initialization doesn't fail

## Task 5: Debug toBlobURL Function (2 minutes)
**File:** `src/lib/ffmpeg-utils.ts:32-33`
**Goal:** Ensure toBlobURL works in Electron file:// environment
**Action:**
- Add console.logs to see what URLs are generated
- Check if toBlobURL works with file:// base URLs
- May need to modify for Electron environment

## ROOT CAUSE ANALYSIS:
**The real issue:** Electron `file://` protocol + `toBlobURL()` function incompatibility
- FFmpeg files exist and are configured correctly
- The `toBlobURL` function may not work with `file://` protocol
- Need to adapt FFmpeg loading for Electron environment

## Expected Results After Completion
- ✅ FFmpeg files accessible in Electron
- ✅ No 404 errors for ffmpeg-core.js  
- ✅ Video files import and process correctly
- ✅ Blob URLs work for media playback

## Priority Order
1. Task 1 (Verify files in build) - **HIGH**
2. Task 2 (Fix Electron file serving) - **CRITICAL**  
3. Task 5 (Debug toBlobURL) - **CRITICAL**
4. Task 3 (CSP for media) - **MEDIUM**
5. Task 4 (Test file access) - **LOW**

## Time Estimate: 8 minutes total (reduced from 13)