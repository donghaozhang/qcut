# Electron EXE Build Plan

## Current Issue
Electron-builder is failing with "Unexpected end of JSON input" error during dependency analysis. This is a common issue with complex monorepo setups and certain dependencies.

## Quick Fix Tasks (Each ~3 minutes)

### Task 1: Clean Build Environment (2 minutes)
**Goal:** Clear any corrupted build cache
**Actions:**
- Delete `node_modules` and reinstall: `rm -rf node_modules && bun install`
- Clear electron-builder cache: `npx electron-builder install-app-deps`
- Remove any existing `dist-electron` folder

### Task 2: Simplify Build Configuration (3 minutes)
**File:** `package.json` build section
**Goal:** Create minimal working build config
**Actions:**
- Remove complex file patterns that might cause parsing issues
- Simplify to basic configuration
- Test with portable build first (no installer)

### Task 3: Fix Dependency Issues (3 minutes)
**Goal:** Exclude problematic dependencies from build
**Actions:**
- Add `asarUnpack` for FFmpeg WASM files
- Exclude dev dependencies from build
- Handle monorepo structure properly

### Task 4: Alternative Build Method (2 minutes)
**Goal:** Use direct electron-packager if electron-builder fails
**Actions:**
- Install electron-packager as backup: `bun add -D electron-packager`
- Create simple packager script
- Generate portable EXE without installer

## Detailed Solutions

### Option A: Fix Current electron-builder Setup

```json
{
  "build": {
    "appId": "com.opencut.app",
    "productName": "OpenCut",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "electron/",
      "apps/web/dist/",
      "!node_modules/"
    ],
    "extraMetadata": {
      "main": "electron/main.js"
    },
    "asarUnpack": [
      "apps/web/dist/ffmpeg/"
    ],
    "win": {
      "target": "portable"
    }
  }
}
```

### Option B: Use electron-packager (Simpler)

```bash
# Install packager
bun add -D electron-packager

# Build command
npx electron-packager . OpenCut --platform=win32 --arch=x64 --out=dist-packager --overwrite
```

### Option C: Manual Packaging (Fallback)

1. Copy Electron binaries manually
2. Replace app.asar with our built files
3. Create standalone executable

## Expected Outcomes

- **Option A Success:** Full installer with proper Windows integration
- **Option B Success:** Portable EXE file ready to run
- **Option C Success:** Manual EXE that works but requires more setup

## Time Estimates

- **Total time:** 10-15 minutes
- **Quick win:** Option B (electron-packager) - 5 minutes
- **Full solution:** Option A (fixed electron-builder) - 10 minutes
- **Fallback:** Option C (manual) - 15 minutes

## Priority Order

1. **Task 1** (Clean environment) - **CRITICAL**
2. **Task 4** (Try electron-packager) - **HIGH** (fastest path to EXE)
3. **Task 2** (Fix electron-builder) - **MEDIUM** (better long-term)
4. **Task 3** (Handle dependencies) - **LOW** (only if needed)

## Success Criteria

✅ Generate working Windows EXE file  
✅ EXE launches OpenCut video editor  
✅ All features work (FFmpeg, file handling, etc.)  
✅ File size reasonable (<200MB)  

## Files to Modify

- `package.json` (build configuration)
- Possibly create new `electron-packager.js` script
- May need to adjust `electron/main.js` paths for packaged app