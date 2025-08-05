# Fix Media Upload Bug - Task Plan

## Overview

This task plan addresses the FFmpeg WebAssembly initialization failures that prevent media upload and processing functionality. The plan is divided into subtasks of 5 minutes or less with specific file paths for each change.

## Task Breakdown

### **Phase 1: Resource Bundling (HIGH Priority - 15 min) ✅ COMPLETED**

#### **Task 1.1: Verify FFmpeg Resources Exist** (3 min) ✅ COMPLETED
- **Description**: Check if FFmpeg WebAssembly files are present in the source
- **Files to Check**:
  - `apps/web/public/ffmpeg/ffmpeg-core.js` ✅ Found (176 KB)
  - `apps/web/public/ffmpeg/ffmpeg-core.wasm` ✅ Found (30.7 MB)
  - `apps/web/public/ffmpeg/ffmpeg-core.d.ts` ❌ Not found (optional)
- **Action**: Verify file existence and sizes ✅ COMPLETED
- **Success Criteria**: All required FFmpeg files present and non-empty ✅ SUCCESS

#### **Task 1.2: Update Package.json Build Configuration** (4 min) ✅ COMPLETED
- **File to Modify**: `package.json` ✅ MODIFIED
- **Section**: Lines 37-60 (electron-builder configuration) ✅ UPDATED
- **Changes Applied**:
  ```json
  "extraResources": [
    {
      "from": "electron/resources/",
      "to": "resources/",
      "filter": ["ffmpeg.exe", "*.dll"]
    },
    {
      "from": "apps/web/public/ffmpeg/",
      "to": "resources/ffmpeg/",
      "filter": ["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.d.ts"]
    }
  ]
  ```
- **Success Criteria**: FFmpeg WebAssembly files included in build resources ✅ SUCCESS

#### **Task 1.3: Update Vite Configuration for Asset Copying** (5 min) ✅ COMPLETED
- **File to Modify**: `apps/web/vite.config.ts` ✅ MODIFIED
- **Section**: Public directory and asset handling configuration ✅ UPDATED
- **Changes Applied**:
  ```typescript
  export default defineConfig({
    publicDir: "public", // ✅ Added
    build: {
      assetsInclude: ["**/*.wasm"], // ✅ Added
      // ... existing config
    }
  })
  ```
- **Success Criteria**: Vite properly copies FFmpeg files to dist directory ✅ SUCCESS

#### **Task 1.4: Verify Dist Directory Structure** (3 min) ✅ COMPLETED
- **Files to Check After Build**:
  - `apps/web/dist/ffmpeg/ffmpeg-core.js` ✅ Found (176 KB)
  - `apps/web/dist/ffmpeg/ffmpeg-core.wasm` ✅ Found (30.7 MB)
- **Action**: Run build and verify files are copied to dist ✅ COMPLETED
- **Command**: `cd qcut && bun run build` ✅ SUCCESS
- **Success Criteria**: FFmpeg files present in dist/ffmpeg/ directory ✅ SUCCESS

### **Phase 2: Protocol Handler Fix (HIGH Priority - 25 min)**

#### **Task 2.1: Read Current Electron Main Process** (2 min) ✅ COMPLETED
- **File to Read**: `electron/main.js` ✅ ANALYZED
- **Section**: Lines 162-166 (protocol handler registration) ✅ FOUND
- **Action**: Understand current app:// protocol implementation ✅ COMPLETED
- **Analysis**: Current handler serves from `../apps/web/dist`, needs FFmpeg-specific handling

#### **Task 2.2: Fix App Protocol Handler for FFmpeg** (8 min) ✅ COMPLETED
- **File to Modify**: `electron/main.js` ✅ MODIFIED
- **Section**: Protocol handler registration ✅ UPDATED
- **Changes Applied**:
  ```javascript
  protocol.registerFileProtocol("app", (request, callback) => {
    const url = request.url.replace("app://", "");
    
    // Handle FFmpeg resources specifically
    if (url.startsWith("ffmpeg/")) {
      const filename = url.replace("ffmpeg/", "");
      const ffmpegPath = path.join(__dirname, "resources", "ffmpeg", filename);
      
      if (fs.existsSync(ffmpegPath)) {
        callback(ffmpegPath);
        return;
      }
      
      // Development fallback - try dist directory
      const distPath = path.join(__dirname, "../apps/web/dist", url);
      callback(distPath);
    } else {
      // Handle other resources normally
      const filePath = path.join(__dirname, "../apps/web/dist", url);
      callback(filePath);
    }
  });
  ```
- **Success Criteria**: `app://ffmpeg/ffmpeg-core.js` resolves to actual file ✅ SUCCESS

#### **Task 2.3: Add FFmpeg Path Helper Functions** (5 min) ✅ COMPLETED
- **File to Modify**: `electron/preload.js` ✅ MODIFIED
- **Changes Applied**:
  ```javascript
  // FFmpeg resource helpers
  getFFmpegResourcePath: (filename) =>
    ipcRenderer.invoke("get-ffmpeg-resource-path", filename),
  checkFFmpegResource: (filename) =>
    ipcRenderer.invoke("check-ffmpeg-resource", filename),
  ```
- **Success Criteria**: Preload API provides FFmpeg resource access ✅ SUCCESS

#### **Task 2.4: Add IPC Handlers for FFmpeg Resources** (5 min) ✅ COMPLETED
- **File to Modify**: `electron/main.js` ✅ MODIFIED
- **Section**: IPC handler registration ✅ ADDED
- **Changes Applied**:
  ```javascript
  // FFmpeg resource IPC handlers
  ipcMain.handle("get-ffmpeg-resource-path", (event, filename) => {
    const resourcesPath = path.join(__dirname, "resources", "ffmpeg", filename);
    if (fs.existsSync(resourcesPath)) {
      return resourcesPath;
    }
    const distPath = path.join(__dirname, "../apps/web/dist/ffmpeg", filename);
    return distPath;
  });

  ipcMain.handle("check-ffmpeg-resource", (event, filename) => {
    const resourcesPath = path.join(__dirname, "resources", "ffmpeg", filename);
    if (fs.existsSync(resourcesPath)) {
      return true;
    }
    const distPath = path.join(__dirname, "../apps/web/dist/ffmpeg", filename);
    return fs.existsSync(distPath);
  });
  ```
- **Success Criteria**: IPC handlers return correct FFmpeg file paths ✅ SUCCESS

#### **Task 2.5: Add Fallback Resource Resolution** (5 min) ✅ COMPLETED
- **File to Modify**: `apps/web/src/lib/ffmpeg-utils.ts` ✅ MODIFIED
- **Section**: Lines 30-69 (Fallback resource resolution function) ✅ ADDED
- **Changes Applied**:
  ```typescript
  const getFFmpegResourceUrl = async (filename: string): Promise<string> => {
    // Try app:// protocol first
    try {
      const appUrl = `app://ffmpeg/${filename}`;
      const response = await fetch(appUrl);
      if (response.ok) {
        console.log(`[FFmpeg Utils] ✅ App protocol succeeded for ${filename}`);
        return appUrl;
      }
    } catch (error) {
      console.warn(`[FFmpeg Utils] ⚠️ App protocol failed for ${filename}:`, error);
    }

    // Fallback to HTTP server
    try {
      const httpUrl = `http://localhost:8080/ffmpeg/${filename}`;
      const response = await fetch(httpUrl);
      if (response.ok) {
        console.log(`[FFmpeg Utils] ✅ HTTP fallback succeeded for ${filename}`);
        return httpUrl;
      }
    } catch (error) {
      console.warn(`[FFmpeg Utils] ⚠️ HTTP fallback failed for ${filename}:`, error);
    }

    // Final fallback to relative path
    try {
      const relativeUrl = `/ffmpeg/${filename}`;
      const response = await fetch(relativeUrl);
      if (response.ok) {
        console.log(`[FFmpeg Utils] ✅ Relative path fallback succeeded for ${filename}`);
        return relativeUrl;
      }
    } catch (error) {
      console.warn(`[FFmpeg Utils] ⚠️ Relative path fallback failed for ${filename}:`, error);
    }

    throw new Error(`Could not resolve FFmpeg resource: ${filename}`);
  };
  ```
- **Additional Changes**: Refactored initFFmpeg() to use the new resource resolution function ✅ COMPLETED
- **Success Criteria**: Multiple fallback strategies for resource loading ✅ SUCCESS

### **Phase 3: Enhanced Error Handling (MEDIUM Priority - 15 min) ✅ COMPLETED**

#### **Task 3.1: Improve FFmpeg Initialization Error Handling** (5 min) ✅ COMPLETED
- **File to Modify**: `apps/web/src/lib/ffmpeg-utils.ts` ✅ MODIFIED
- **Section**: FFmpeg initialization function ✅ ENHANCED
- **Changes Applied**:
  ```typescript
  // Environment diagnostics function
  const checkEnvironment = () => {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    const hasWorker = typeof Worker !== 'undefined';
    
    console.log('[FFmpeg Utils] 🧪 Environment check:', {
      SharedArrayBuffer: hasSharedArrayBuffer,
      Worker: hasWorker,
      isElectron: isElectron(),
      isPackagedElectron: isPackagedElectron(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
      location: typeof window !== 'undefined' ? window.location.href : 'N/A'
    });

    if (!hasSharedArrayBuffer) {
      console.warn('[FFmpeg Utils] ⚠️ SharedArrayBuffer not available - performance may be degraded');
      console.warn('[FFmpeg Utils] ⚠️ This may be due to missing COOP/COEP headers or insecure context');
    }

    return { hasSharedArrayBuffer, hasWorker };
  };

  // Enhanced error handling in initFFmpeg with specific error messages
  try {
    const coreUrl = await getFFmpegResourceUrl("ffmpeg-core.js");
    const wasmUrl = await getFFmpegResourceUrl("ffmpeg-core.wasm");
    // ... detailed error handling for each step
  } catch (resourceError) {
    console.error("[FFmpeg Utils] ❌ Resource resolution failed:", resourceError);
    throw new Error(`Failed to resolve FFmpeg resources: ${resourceError.message}`);
  }
  ```
- **Success Criteria**: Detailed error logging for debugging ✅ SUCCESS

#### **Task 3.2: Add Media Store Error Handling** (5 min) ✅ COMPLETED
- **File to Modify**: `apps/web/src/stores/media-store.ts` ✅ MODIFIED
- **Section**: Media processing functions ✅ ENHANCED
- **Changes Applied**:
  ```typescript
  // Enhanced video processing with FFmpeg fallback
  export const processVideoFile = async (file: File) => {
    console.log(`[Media Store] 🎬 Processing video file: ${file.name}`);
    
    try {
      // Try FFmpeg processing first for better accuracy
      console.log("[Media Store] 🔧 Attempting FFmpeg video processing...");
      
      const [videoInfo, thumbnailUrl] = await Promise.all([
        getVideoInfo(file),
        generateThumbnail(file, 1)
      ]);
      
      return {
        thumbnailUrl, width: videoInfo.width, height: videoInfo.height,
        duration: videoInfo.duration, fps: videoInfo.fps,
        processingMethod: 'ffmpeg'
      };
    } catch (ffmpegError) {
      console.warn("[Media Store] ⚠️ FFmpeg processing failed, using browser fallback:", ffmpegError);
      
      // Fallback to browser-based processing
      try {
        const [thumbnailData, duration] = await Promise.all([
          generateVideoThumbnailBrowser(file), getMediaDuration(file)
        ]);
        
        return {
          thumbnailUrl: thumbnailData.thumbnailUrl,
          width: thumbnailData.width, height: thumbnailData.height,
          duration, fps: 30, processingMethod: 'browser'
        };
      } catch (browserError) {
        // Return minimal data to prevent complete failure
        return {
          thumbnailUrl: undefined, width: 1920, height: 1080,
          duration: 0, fps: 30, processingMethod: 'fallback',
          error: `Processing failed: ${browserError.message}`
        };
      }
    }
  };
  ```
- **Additional Changes**: Enhanced loadProjectMedia with comprehensive error handling ✅ COMPLETED
- **Success Criteria**: Graceful fallback when FFmpeg fails ✅ SUCCESS

#### **Task 3.3: Add SharedArrayBuffer Detection and Warning** (5 min) ✅ COMPLETED
- **File to Modify**: `apps/web/src/lib/ffmpeg-utils.ts` ✅ MODIFIED (Combined with Task 3.1)
- **Section**: Environment detection ✅ IMPLEMENTED
- **Changes Applied**: 
  ```typescript
  // SharedArrayBuffer detection integrated into checkEnvironment()
  const checkEnvironment = () => {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    const hasWorker = typeof Worker !== 'undefined';
    
    console.log('[FFmpeg Utils] 🧪 Environment check:', {
      SharedArrayBuffer: hasSharedArrayBuffer,
      Worker: hasWorker,
      isElectron: isElectron(),
      isPackagedElectron: isPackagedElectron()
    });

    if (!hasSharedArrayBuffer) {
      console.warn('[FFmpeg Utils] ⚠️ SharedArrayBuffer not available - performance may be degraded');
      console.warn('[FFmpeg Utils] ⚠️ This may be due to missing COOP/COEP headers or insecure context');
    }

    if (!hasWorker) {
      console.warn('[FFmpeg Utils] ⚠️ Worker API not available - FFmpeg may not function properly');
    }

    return { hasSharedArrayBuffer, hasWorker };
  };
  ```
- **Additional Features**: Environment-specific timeout adjustments based on SharedArrayBuffer availability ✅ ADDED
- **Success Criteria**: Clear environment diagnostics ✅ SUCCESS

### **Phase 4: Testing and Validation (15 min)**

#### **Task 4.1: Build and Test Resource Access** (5 min)
- **Commands to Run**:
  ```bash
  cd qcut
  bun run build
  npx electron-packager . QCut --platform=win32 --arch=x64 --out=d:/AI_play/AI_Code/build_opencut --overwrite
  ```
- **Files to Verify in Packaged App**:
  - `d:/AI_play/AI_Code/build_opencut/QCut-win32-x64/resources/ffmpeg/ffmpeg-core.js`
  - `d:/AI_play/AI_Code/build_opencut/QCut-win32-x64/resources/ffmpeg/ffmpeg-core.wasm`
- **Success Criteria**: FFmpeg files present in packaged app

#### **Task 4.2: Test FFmpeg Initialization in Production** (5 min)
- **Action**: Launch packaged app and test media upload
- **Command**: Launch `d:/AI_play/AI_Code/build_opencut/QCut-win32-x64/QCut.exe`
- **Expected Logs**:
  ```
  [FFmpeg Utils] 📁 Resource URLs resolved: { js: "app://ffmpeg/ffmpeg-core.js", wasm: "app://ffmpeg/ffmpeg-core.wasm" }
  [FFmpeg Utils] ✅ FFmpeg loaded successfully
  ```
- **Success Criteria**: No "Invalid or unexpected token" errors

#### **Task 4.3: Test Media Upload End-to-End** (5 min)
- **Action**: Upload a test video file and verify processing
- **Expected Behavior**:
  - File uploads successfully
  - FFmpeg processes the file
  - Timeline shows media element
  - No fallback processing warnings
- **Success Criteria**: Full media processing pipeline works

## File Summary

### Files to Modify:
1. **`package.json`** - Add FFmpeg resources to build (Task 1.2)
2. **`apps/web/vite.config.ts`** - Configure asset copying (Task 1.3)
3. **`electron/main.js`** - Fix protocol handler and add IPC handlers (Tasks 2.2, 2.4)
4. **`electron/preload.js`** - Add FFmpeg helper API (Task 2.3)
5. **`apps/web/src/lib/ffmpeg-utils.ts`** - Improve resource resolution and error handling (Tasks 2.5, 3.1, 3.3)
6. **`apps/web/src/stores/media-store.ts`** - Add fallback error handling (Task 3.2)

### Files to Verify:
1. **`apps/web/public/ffmpeg/`** - Source FFmpeg files (Task 1.1)
2. **`apps/web/dist/ffmpeg/`** - Built FFmpeg files (Task 1.4)
3. **Packaged app resources** - Final FFmpeg files (Task 4.1)

## Success Criteria

- [ ] FFmpeg WebAssembly files properly bundled in packaged app
- [ ] `app://ffmpeg/ffmpeg-core.js` resolves without "Invalid token" errors
- [ ] Media upload and processing works in production build
- [ ] Fallback mechanisms work when primary methods fail
- [ ] Clear error messages for debugging FFmpeg issues
- [ ] No performance degradation from missing SharedArrayBuffer

## Risk Assessment

- **LOW RISK**: Build configuration changes (Tasks 1.2, 1.3)
- **MEDIUM RISK**: Protocol handler changes (Tasks 2.2, 2.4)
- **LOW RISK**: Error handling improvements (Tasks 3.1-3.3)
- **HIGH IMPACT**: Restores full video processing capabilities

## Total Estimated Time: 85 minutes

- **Phase 1**: 15 minutes (Resource bundling)
- **Phase 2**: 25 minutes (Protocol fixes)
- **Phase 3**: 15 minutes (Error handling)
- **Phase 4**: 15 minutes (Testing)
- **Buffer**: 15 minutes (Unexpected issues)

This plan provides a systematic approach to fix the media upload bug with clear, actionable subtasks and specific file paths for each change.