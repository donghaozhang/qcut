# FFmpeg CLI Integration Roadmap

## Overview

Integrate native FFmpeg CLI into Electron for **5-10x faster video encoding** compared to FFmpeg.wasm. Native CLI provides hardware acceleration, multi-threading, and industry-standard stability.

**Goal**: Replace FFmpeg.wasm with native CLI for **massive performance gains**

## Performance Comparison

### Current FFmpeg.wasm:
- **Single-threaded** JavaScript + WASM execution
- **Memory copy overhead** between JS and WASM
- **No hardware acceleration** (CPU only)
- Export ratio: ~0.5-1x video duration

### Native FFmpeg CLI:
- **Multi-threaded** C/C++ native execution  
- **Hardware acceleration** (NVENC, VAAPI, QuickSync)
- **Industry standard** stability and compatibility
- **Expected**: 0.1-0.2x video duration (5-10x faster)

## Phase 1: Electron IPC Setup (9 minutes total)

### Task 1.1: Add FFmpeg IPC Handler
**Time**: 3 minutes  
**File**: Create `qcut/electron/ffmpeg-handler.js` (NEW FILE)

```javascript
import { ipcMain } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export function setupFFmpegIPC() {
  ipcMain.handle('export-video-cli', async (event, options) => {
    const { inputDir, outputFile, width, height, fps, quality } = options;
    
    return new Promise((resolve, reject) => {
      // Construct FFmpeg arguments
      const ffmpegPath = getFFmpegPath();
      const args = buildFFmpegArgs(inputDir, outputFile, width, height, fps, quality);
      
      console.log('[FFmpeg CLI] Running:', ffmpegPath, args.join(' '));
      const ffprocess = spawn(ffmpegPath, args);
      
      let stderr = '';
      
      ffprocess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[FFmpeg]', output);
        // Send progress updates to renderer
        event.sender.send('ffmpeg-progress', parseProgress(output));
      });
      
      ffprocess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error('[FFmpeg Error]', data.toString());
      });
      
      ffprocess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, outputFile });
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });
      
      ffprocess.on('error', (error) => {
        reject(new Error(`Failed to start FFmpeg: ${error.message}`));
      });
    });
  });
}

function getFFmpegPath() {
  // Check if FFmpeg is in PATH or use bundled version
  return 'ffmpeg'; // or bundled path like './resources/ffmpeg.exe'
}

function buildFFmpegArgs(inputDir, outputFile, width, height, fps, quality) {
  const qualitySettings = {
    'high': { crf: '18', preset: 'slow' },
    'medium': { crf: '23', preset: 'fast' },
    'low': { crf: '28', preset: 'veryfast' }
  };
  
  const { crf, preset } = qualitySettings[quality] || qualitySettings.medium;
  
  return [
    '-y', // Overwrite output
    '-framerate', String(fps),
    '-i', path.join(inputDir, 'frame-%04d.png'),
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', crf,
    '-vf', `scale=${width}:${height}`,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputFile
  ];
}

function parseProgress(output) {
  // Parse FFmpeg progress from output
  const frameMatch = output.match(/frame=\s*(\d+)/);
  const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
  
  if (frameMatch || timeMatch) {
    return {
      frame: frameMatch ? parseInt(frameMatch[1]) : null,
      time: timeMatch ? timeMatch[1] : null
    };
  }
  return null;
}
```

### Task 1.2: Register IPC Handler
**Time**: 2 minutes  
**File**: Update `qcut/electron/main.js` (EXISTING FILE)

```javascript
// Add to existing file after line 130+
const { setupFFmpegIPC } = require('./ffmpeg-handler.js');

// In app.whenReady() function, add:
app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers(); // existing call
  setupFFmpegIPC(); // Add this line
});
```

### Task 1.3: Add Temp Directory Management  
**Time**: 4 minutes  
**File**: Create `qcut/electron/temp-manager.js` (NEW FILE)

```javascript
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export class TempManager {
  constructor() {
    this.tempDir = path.join(app.getPath('temp'), 'qcut-export');
    this.ensureTempDir();
  }
  
  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }
  
  createExportSession() {
    const sessionId = Date.now().toString();
    const sessionDir = path.join(this.tempDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    return {
      sessionId,
      frameDir: path.join(sessionDir, 'frames'),
      outputDir: path.join(sessionDir, 'output')
    };
  }
  
  cleanup(sessionId) {
    const sessionDir = path.join(this.tempDir, sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }
  
  cleanupOldSessions() {
    // Clean up sessions older than 1 hour
    const cutoff = Date.now() - (60 * 60 * 1000);
    
    if (fs.existsSync(this.tempDir)) {
      const sessions = fs.readdirSync(this.tempDir);
      sessions.forEach(sessionId => {
        const timestamp = parseInt(sessionId);
        if (timestamp < cutoff) {
          this.cleanup(sessionId);
        }
      });
    }
  }
}
```

## Phase 2: CLI Export Engine (12 minutes total)

### Task 2.1: Create CLI Export Engine
**Time**: 4 minutes  
**File**: Create `qcut/apps/web/src/lib/export-engine-cli.ts` (NEW FILE)

```typescript
import { ExportEngine } from './export-engine';
import { ExportSettings } from '@/types/export';
import { TimelineTrack } from '@/types/timeline';
import { MediaItem } from '@/stores/media-store';

export type ProgressCallback = (progress: number, message: string) => void;

export class CLIExportEngine extends ExportEngine {
  private sessionId: string | null = null;
  private frameDir: string | null = null;
  
  async export(progressCallback?: ProgressCallback): Promise<Blob> {
    console.log('[CLIExportEngine] Starting CLI export...');
    
    // Create export session
    progressCallback?.(5, 'Setting up export session...');
    const session = await this.createExportSession();
    this.sessionId = session.sessionId;
    this.frameDir = session.frameDir;
    
    try {
      // Pre-load videos (our optimization)
      progressCallback?.(10, 'Pre-loading videos...');
      await this.preloadAllVideos();
      
      // Render frames to disk
      progressCallback?.(15, 'Rendering frames...');
      await this.renderFramesToDisk(progressCallback);
      
      // Export with FFmpeg CLI
      progressCallback?.(85, 'Encoding with FFmpeg CLI...');
      const outputFile = await this.exportWithCLI(progressCallback);
      
      // Read result and cleanup
      progressCallback?.(95, 'Reading output...');
      const videoBlob = await this.readOutputFile(outputFile);
      
      progressCallback?.(100, 'Export completed!');
      return videoBlob;
      
    } finally {
      // Always cleanup temp files
      if (this.sessionId) {
        await this.cleanup();
      }
    }
  }
  
  private async createExportSession() {
    // Use existing Electron API structure
    if (!window.electronAPI) {
      throw new Error('CLI export only available in Electron');
    }
    return await window.electronAPI.invoke('create-export-session');
  }
  
  private async renderFramesToDisk(progressCallback?: ProgressCallback): Promise<void> {
    const totalFrames = this.calculateTotalFrames();
    const frameTime = 1 / 30; // fps
    
    console.log(`[CLI] Rendering ${totalFrames} frames to disk...`);
    
    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Export cancelled');
      }
      
      const currentTime = frame * frameTime;
      
      // Render frame to canvas
      await this.renderFrame(currentTime);
      
      // Save frame to disk
      const framePath = `frame-${frame.toString().padStart(4, '0')}.png`;
      await this.saveFrameToDisk(framePath);
      
      // Progress update (15% to 80% for frame rendering)
      const progress = 15 + (frame / totalFrames) * 65;
      progressCallback?.(progress, `Rendering frame ${frame + 1}/${totalFrames}`);
    }
    
    console.log(`[CLI] Rendered ${totalFrames} frames to ${this.frameDir}`);
  }
  
  private async saveFrameToDisk(frameName: string): Promise<void> {
    if (!window.electronAPI) {
      throw new Error('CLI export only available in Electron');
    }
    
    // Convert canvas to base64
    const dataUrl = this.canvas.toDataURL('image/png');
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    
    // Save via IPC using existing API structure
    await window.electronAPI.invoke('save-frame', {
      sessionId: this.sessionId,
      frameName,
      data: base64Data
    });
  }
  
  private async exportWithCLI(progressCallback?: ProgressCallback): Promise<string> {
    if (!window.electronAPI) {
      throw new Error('CLI export only available in Electron');
    }
    
    // Note: Progress updates would need to be added to electronAPI
    // For now, use basic invoke without progress tracking
    
    const result = await window.electronAPI.invoke('export-video-cli', {
      sessionId: this.sessionId,
      width: this.canvas.width,
      height: this.canvas.height,
      fps: 30,
      quality: this.settings.quality || 'medium'
    });
    
    return result.outputFile;
  }
  
  private async readOutputFile(outputPath: string): Promise<Blob> {
    if (!window.electronAPI) {
      throw new Error('CLI export only available in Electron');
    }
    const buffer = await window.electronAPI.invoke('read-output-file', outputPath);
    return new Blob([buffer], { type: 'video/mp4' });
  }
  
  private async cleanup(): Promise<void> {
    if (this.sessionId && window.electronAPI) {
      await window.electronAPI.invoke('cleanup-export-session', this.sessionId);
    }
  }
}
```

### Task 2.2: Add IPC Methods for Frame Saving
**Time**: 3 minutes  
**File**: Update `qcut/electron/ffmpeg-handler.js` (EXISTING FILE from Task 1.1)

```javascript
import { TempManager } from './temp-manager.js';

const tempManager = new TempManager();

export function setupFFmpegIPC() {
  // Existing export-video-cli handler...
  
  ipcMain.handle('create-export-session', async () => {
    return tempManager.createExportSession();
  });
  
  ipcMain.handle('save-frame', async (event, { sessionId, frameName, data }) => {
    const frameDir = path.join(tempManager.tempDir, sessionId, 'frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }
    
    const framePath = path.join(frameDir, frameName);
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(framePath, buffer);
    
    return framePath;
  });
  
  ipcMain.handle('read-output-file', async (event, outputPath) => {
    return fs.readFileSync(outputPath);
  });
  
  ipcMain.handle('cleanup-export-session', async (event, sessionId) => {
    tempManager.cleanup(sessionId);
  });
}
```

### Task 2.3: Update Export Engine Factory
**Time**: 3 minutes  
**File**: Update `qcut/apps/web/src/lib/export-engine-factory.ts` (EXISTING FILE)

**Current enum** (line 7-12):
```typescript
export enum ExportEngineType {
  STANDARD = "standard",
  OPTIMIZED = "optimized", 
  WEBCODECS = "webcodecs",
  FFMPEG = "ffmpeg"  // Already exists
}
```

**Update required**:
```typescript
// 1. Add CLI engine type to existing enum (around line 11)
export enum ExportEngineType {
  STANDARD = "standard",
  OPTIMIZED = "optimized", 
  WEBCODECS = "webcodecs",
  FFMPEG = "ffmpeg",
  CLI = "cli" // Add this line
}

// 2. Add case to createEngine method switch statement (around line 131)
case ExportEngineType.CLI:
  // Native FFmpeg CLI engine (Electron only)
  if (this.isElectron()) {
    try {
      const { CLIExportEngine } = await import('./export-engine-cli');
      return new CLIExportEngine(canvas, settings, tracks, mediaItems, totalDuration);
    } catch (error) {
      console.warn('Failed to load CLI engine, falling back to FFmpeg WASM:', error);
      // Fallback to FFmpeg WASM
      const { FFmpegExportEngine } = await import('./export-engine-ffmpeg');
      return new FFmpegExportEngine(canvas, settings, tracks, mediaItems, totalDuration);
    }
  } else {
    console.warn('CLI engine only available in Electron, using FFmpeg WASM');
    const { FFmpegExportEngine } = await import('./export-engine-ffmpeg');
    return new FFmpegExportEngine(canvas, settings, tracks, mediaItems, totalDuration);
  }

// 3. Add Electron detection method (around line 320)
private isElectron(): boolean {
  return !!(window as any).electronAPI;
}
```

### Task 2.4: Update Export Dialog UI
**Time**: 2 minutes  
**File**: Update `qcut/apps/web/src/components/export-dialog.tsx` (EXISTING FILE)

**Current state** (around line 64):
```typescript
const [engineType, setEngineType] = useState<'standard' | 'ffmpeg'>('standard');
```

**Updates required**:
```typescript
// 1. Update engine type state (around line 64)
const [engineType, setEngineType] = useState<'standard' | 'ffmpeg' | 'cli'>('standard');

// 2. Update engine selection logic (around line 241)
const selectedEngineType = 
  engineType === 'cli' ? ExportEngineType.CLI :
  engineType === 'ffmpeg' ? ExportEngineType.FFMPEG : 
  ExportEngineType.STANDARD;

// 3. Add Electron detection using existing hook
import { useElectron } from '@/hooks/useElectron';
const { isElectron } = useElectron();

// 4. Update existing RadioGroup UI (around line 630 in Engine Selection card)
<div className="flex items-center space-x-2">
  <RadioGroupItem value="cli" id="cli" />
  <Label htmlFor="cli" className="text-sm cursor-pointer">
    🚀 Native FFmpeg CLI (10x faster)
  </Label>
</div>
```

## Phase 3: FFmpeg Bundling & Distribution (6 minutes total)

### Task 3.1: Bundle FFmpeg Binary
**Time**: 3 minutes  
**File**: Update `qcut/package.json` (EXISTING FILE - root package.json)

**Note**: Download FFmpeg binary to `qcut/electron/resources/ffmpeg.exe` (NEW FILE)

```json
{
  "build": {
    "files": [
      "**/*",
      "!node_modules",
      "resources/ffmpeg.exe" 
    ],
    "extraResources": [
      {
        "from": "resources/",
        "to": "resources/",
        "filter": ["ffmpeg.exe"]
      }
    ]
  }
}
```

**Action**: Download FFmpeg binary to `qcut/electron/resources/ffmpeg.exe`

### Task 3.2: Update Path Detection
**Time**: 2 minutes  
**File**: Update `qcut/electron/ffmpeg-handler.js` (EXISTING FILE from Task 1.1)

```javascript
import { app } from 'electron';

function getFFmpegPath() {
  if (app.isPackaged) {
    // Production: use bundled FFmpeg
    return path.join(process.resourcesPath, 'ffmpeg.exe');
  } else {
    // Development: try system FFmpeg or bundled
    const devPath = path.join(__dirname, 'resources', 'ffmpeg.exe');
    if (fs.existsSync(devPath)) {
      return devPath;
    }
    return 'ffmpeg'; // System PATH
  }
}
```

### Task 3.3: Add Error Handling
**Time**: 1 minute  
**File**: Update `qcut/electron/ffmpeg-handler.js` (EXISTING FILE from Task 1.1)

```javascript
function getFFmpegPath() {
  const ffmpegPath = // ... existing logic
  
  // Verify FFmpeg exists
  if (!fs.existsSync(ffmpegPath) && ffmpegPath !== 'ffmpeg') {
    throw new Error(`FFmpeg not found at: ${ffmpegPath}`);
  }
  
  return ffmpegPath;
}
```

## Expected Performance Results

### Current Performance:
- **MediaRecorder**: 2-3x video duration
- **FFmpeg WASM**: 0.5-1x video duration  

### Target Performance (Native CLI):
- **Native FFmpeg CLI**: 0.1-0.2x video duration
- **Hardware Accelerated**: 0.05-0.1x video duration (with GPU)

### Example:
- **30-second video**:
  - MediaRecorder: ~60-90 seconds
  - FFmpeg WASM: ~15-30 seconds
  - **Native CLI: ~3-6 seconds** ⚡

## Implementation Priority

1. **Phase 1**: Core IPC setup (9 min)
2. **Phase 2**: CLI export engine (12 min) 
3. **Phase 3**: Binary bundling (6 min)

**Total implementation time**: ~27 minutes

## Success Criteria

- [ ] Native FFmpeg CLI integration working in Electron
- [ ] Export performance: <0.2x video duration
- [ ] Progress tracking and error handling
- [ ] Fallback to FFmpeg WASM if CLI unavailable
- [ ] User can choose between CLI, WASM, and MediaRecorder
- [ ] Proper cleanup of temporary files

## Advantages Over WASM

1. **🚀 Performance**: 5-10x faster encoding
2. **🎯 Hardware Acceleration**: GPU encoding support
3. **⚡ Multi-threading**: Full CPU utilization
4. **🛡️ Stability**: Industry-standard FFmpeg CLI
5. **📦 Native**: Direct C/C++ execution, no WASM overhead

## Additional Files to Update

### Task X.1: Update Electron Types
**File**: Update `qcut/apps/web/src/types/electron.d.ts` (EXISTING FILE)
Add FFmpeg CLI methods to ElectronAPI interface:

```typescript
// Add to ElectronAPI interface (around line 42)
// FFmpeg CLI operations
ffmpeg: {
  createExportSession: () => Promise<{ sessionId: string; frameDir: string; outputDir: string }>
  saveFrame: (params: { sessionId: string; frameName: string; data: string }) => Promise<string>
  exportVideoCliA: (params: any) => Promise<{ outputFile: string }>
  readOutputFile: (outputPath: string) => Promise<Buffer>
  cleanupExportSession: (sessionId: string) => Promise<void>
}
```

### Task X.2: Update Preload Script
**File**: Update `qcut/electron/preload.js` (EXISTING FILE)
Add FFmpeg IPC method exposure around line 20+:

```javascript
// Add to existing electronAPI object
ffmpeg: {
  createExportSession: () => ipcRenderer.invoke('create-export-session'),
  saveFrame: (params) => ipcRenderer.invoke('save-frame', params),
  exportVideoCli: (params) => ipcRenderer.invoke('export-video-cli', params),
  readOutputFile: (outputPath) => ipcRenderer.invoke('read-output-file', outputPath),
  cleanupExportSession: (sessionId) => ipcRenderer.invoke('cleanup-export-session', sessionId)
}
```

## Debug Commands

```bash
# Test FFmpeg CLI manually
ffmpeg -y -framerate 30 -i frame-%04d.png -c:v libx264 -preset fast -crf 23 output.mp4

# Check hardware acceleration
ffmpeg -hwaccels

# Monitor process
tasklist | findstr ffmpeg

# Test in QCut temp directory
cd %TEMP%\qcut-export\[sessionId]\frames
ffmpeg -y -framerate 30 -i frame-%04d.png -c:v libx264 -preset fast -crf 23 test.mp4
```