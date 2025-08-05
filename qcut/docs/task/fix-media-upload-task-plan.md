# Fix Media Upload Bug - Task Plan

## Overview

This task plan addresses the FFmpeg WebAssembly initialization failures that prevent media upload and processing functionality. The plan is divided into subtasks of 5 minutes or less with specific file paths for each change.

## Task Breakdown

### **Phase 1: Resource Bundling (HIGH Priority - 30 min)**

#### **Task 1.1: Verify FFmpeg Resources Exist** (3 min)
- **Description**: Check if FFmpeg WebAssembly files are present in the source
- **Files to Check**:
  - `apps/web/public/ffmpeg/ffmpeg-core.js`
  - `apps/web/public/ffmpeg/ffmpeg-core.wasm`
  - `apps/web/public/ffmpeg/ffmpeg-core.d.ts`
- **Action**: Verify file existence and sizes
- **Success Criteria**: All required FFmpeg files present and non-empty

#### **Task 1.2: Update Package.json Build Configuration** (4 min)
- **File to Modify**: `package.json`
- **Section**: Lines 37-60 (electron-builder configuration)
- **Changes**:
  ```json
  "extraResources": [
    {
      "from": "electron/resources/",
      "to": "resources/",
      "filter": [
        "ffmpeg.exe",
        "*.dll"
      ]
    },
    {
      "from": "apps/web/public/ffmpeg/",
      "to": "ffmpeg/",
      "filter": [
        "ffmpeg-core.js",
        "ffmpeg-core.wasm",
        "ffmpeg-core.d.ts"
      ]
    }
  ]
  ```
- **Success Criteria**: FFmpeg WebAssembly files included in build resources

#### **Task 1.3: Update Vite Configuration for Asset Copying** (5 min)
- **File to Modify**: `apps/web/vite.config.ts`
- **Section**: Public directory and asset handling configuration
- **Changes**:
  ```typescript
  export default defineConfig({
    // ... existing config
    publicDir: 'public',
    build: {
      // ... existing build config
      rollupOptions: {
        external: ['ffmpeg-core.js', 'ffmpeg-core.wasm']
      }
    },
    assetsInclude: ['**/*.wasm']
  })
  ```
- **Success Criteria**: Vite properly copies FFmpeg files to dist directory

#### **Task 1.4: Verify Dist Directory Structure** (3 min)
- **Files to Check After Build**:
  - `apps/web/dist/ffmpeg/ffmpeg-core.js`
  - `apps/web/dist/ffmpeg/ffmpeg-core.wasm`
- **Action**: Run build and verify files are copied to dist
- **Command**: `cd qcut && bun run build`
- **Success Criteria**: FFmpeg files present in dist/ffmpeg/ directory

### **Phase 2: Protocol Handler Fix (HIGH Priority - 25 min)**

#### **Task 2.1: Read Current Electron Main Process** (2 min)
- **File to Read**: `electron/main.js`
- **Section**: Lines 200-250 (protocol handler registration)
- **Action**: Understand current app:// protocol implementation
- **Focus**: How `app://ffmpeg/*` URLs are currently handled

#### **Task 2.2: Fix App Protocol Handler for FFmpeg** (8 min)
- **File to Modify**: `electron/main.js`
- **Section**: Protocol handler registration
- **Changes**:
  ```javascript
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    
    // Handle FFmpeg resources specifically
    if (url.pathname.startsWith('/ffmpeg/')) {
      const filename = url.pathname.replace('/ffmpeg/', '');
      const ffmpegPath = path.join(__dirname, 'resources', 'ffmpeg', filename);
      
      if (fs.existsSync(ffmpegPath)) {
        return net.fetch(`file://${ffmpegPath}`);
      }
    }
    
    // Existing handler logic for other resources
    // ... rest of current implementation
  });
  ```
- **Success Criteria**: `app://ffmpeg/ffmpeg-core.js` resolves to actual file

#### **Task 2.3: Add FFmpeg Path Helper Functions** (5 min)
- **File to Modify**: `electron/preload.js`
- **Changes**:
  ```javascript
  const { contextBridge, ipcRenderer } = require('electron');

  contextBridge.exposeInMainWorld('electronAPI', {
    // ... existing API
    
    // Add FFmpeg resource helpers
    getFFmpegResourcePath: (filename) => 
      ipcRenderer.invoke('get-ffmpeg-resource-path', filename),
    
    checkFFmpegResource: (filename) => 
      ipcRenderer.invoke('check-ffmpeg-resource', filename)
  });
  ```
- **Success Criteria**: Preload API provides FFmpeg resource access

#### **Task 2.4: Add IPC Handlers for FFmpeg Resources** (5 min)
- **File to Modify**: `electron/main.js`
- **Section**: IPC handler registration
- **Changes**:
  ```javascript
  // Add IPC handlers for FFmpeg resources
  ipcMain.handle('get-ffmpeg-resource-path', (event, filename) => {
    const ffmpegPath = path.join(__dirname, 'resources', 'ffmpeg', filename);
    return ffmpegPath;
  });

  ipcMain.handle('check-ffmpeg-resource', (event, filename) => {
    const ffmpegPath = path.join(__dirname, 'resources', 'ffmpeg', filename);
    return fs.existsSync(ffmpegPath);
  });
  ```
- **Success Criteria**: IPC handlers return correct FFmpeg file paths

#### **Task 2.5: Add Fallback Resource Resolution** (5 min)
- **File to Modify**: `apps/web/src/lib/ffmpeg-utils.ts`
- **Section**: Lines 50-80 (FFmpeg initialization logic)
- **Changes**:
  ```typescript
  const getFFmpegResourceUrl = async (filename: string): Promise<string> => {
    // Try app:// protocol first
    try {
      const appUrl = `app://ffmpeg/${filename}`;
      const response = await fetch(appUrl);
      if (response.ok) {
        return appUrl;
      }
    } catch (error) {
      console.warn(`App protocol failed for ${filename}:`, error);
    }

    // Fallback to HTTP server
    try {
      const httpUrl = `http://localhost:8080/ffmpeg/${filename}`;
      const response = await fetch(httpUrl);
      if (response.ok) {
        return httpUrl;
      }
    } catch (error) {
      console.warn(`HTTP fallback failed for ${filename}:`, error);
    }

    throw new Error(`Could not resolve FFmpeg resource: ${filename}`);
  };
  ```
- **Success Criteria**: Multiple fallback strategies for resource loading

### **Phase 3: Enhanced Error Handling (MEDIUM Priority - 15 min)**

#### **Task 3.1: Improve FFmpeg Initialization Error Handling** (5 min)
- **File to Modify**: `apps/web/src/lib/ffmpeg-utils.ts`
- **Section**: FFmpeg initialization function
- **Changes**:
  ```typescript
  const initFFmpeg = async (): Promise<boolean> => {
    try {
      console.log('[FFmpeg Utils] 🔧 initFFmpeg called');
      
      // Check if resources are available
      const coreJsUrl = await getFFmpegResourceUrl('ffmpeg-core.js');
      const coreWasmUrl = await getFFmpegResourceUrl('ffmpeg-core.wasm');
      
      console.log(`[FFmpeg Utils] 📁 Resource URLs resolved:`, {
        js: coreJsUrl,
        wasm: coreWasmUrl
      });

      // Continue with FFmpeg initialization...
      
    } catch (error) {
      console.error('[FFmpeg Utils] ❌ Resource resolution failed:', error);
      return false;
    }
  };
  ```
- **Success Criteria**: Detailed error logging for debugging

#### **Task 3.2: Add Media Store Error Handling** (5 min)
- **File to Modify**: `apps/web/src/stores/media-store.ts`
- **Section**: Media processing functions
- **Changes**:
  ```typescript
  // Add error handling for FFmpeg failures
  const processMediaFile = async (file: File) => {
    try {
      // Try FFmpeg processing first
      const result = await ffmpegProcess(file);
      return result;
    } catch (ffmpegError) {
      console.warn('FFmpeg processing failed, using fallback:', ffmpegError);
      
      // Fallback to basic processing
      return await basicFileProcessing(file);
    }
  };
  ```
- **Success Criteria**: Graceful fallback when FFmpeg fails

#### **Task 3.3: Add SharedArrayBuffer Detection and Warning** (5 min)
- **File to Modify**: `apps/web/src/lib/ffmpeg-utils.ts`
- **Section**: Environment detection
- **Changes**:
  ```typescript
  // Add SharedArrayBuffer detection
  const checkEnvironment = () => {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    const hasWorker = typeof Worker !== 'undefined';
    
    console.log('[FFmpeg Utils] 🧪 Environment check:', {
      SharedArrayBuffer: hasSharedArrayBuffer,
      Worker: hasWorker,
      isElectron: window.electronAPI !== undefined
    });

    if (!hasSharedArrayBuffer) {
      console.warn('[FFmpeg Utils] ⚠️ SharedArrayBuffer not available - performance may be degraded');
    }

    return { hasSharedArrayBuffer, hasWorker };
  };
  ```
- **Success Criteria**: Clear environment diagnostics

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