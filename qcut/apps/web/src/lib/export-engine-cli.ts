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
    
    // Log original timeline duration
    console.log(`[CLIExportEngine] 📏 Original timeline duration: ${this.totalDuration.toFixed(3)}s`);
    console.log(`[CLIExportEngine] 🎬 Target frames: ${this.calculateTotalFrames()} frames at 30fps`);
    
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
      
      // Log exported video information
      console.log(`[CLIExportEngine] 📦 Exported video size: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`[CLIExportEngine] 🔗 Blob type: ${videoBlob.type}`);
      
      // Calculate and log expected vs actual video duration
      const expectedDuration = this.totalDuration;
      const actualFramesRendered = this.calculateTotalFrames();
      const calculatedDuration = actualFramesRendered / 30; // 30fps
      
      console.log(`[CLIExportEngine] ⏱️  Expected duration: ${expectedDuration.toFixed(3)}s`);
      console.log(`[CLIExportEngine] ⏱️  Calculated duration: ${calculatedDuration.toFixed(3)}s (${actualFramesRendered} frames / 30fps)`);
      console.log(`[CLIExportEngine] 📊 Duration ratio: ${(calculatedDuration / expectedDuration).toFixed(3)}x`);
      
      // Try to get actual video duration from blob
      this.logActualVideoDurationCLI(videoBlob);
      
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
    
    // Note: We'll need to add these methods to electronAPI
    return await (window.electronAPI as any).invoke('create-export-session');
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
    await (window.electronAPI as any).invoke('save-frame', {
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
    
    const result = await (window.electronAPI as any).invoke('export-video-cli', {
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
    const buffer = await (window.electronAPI as any).invoke('read-output-file', outputPath);
    return new Blob([buffer], { type: 'video/mp4' });
  }
  
  private async cleanup(): Promise<void> {
    if (this.sessionId && window.electronAPI) {
      await (window.electronAPI as any).invoke('cleanup-export-session', this.sessionId);
    }
  }
  
  calculateTotalFrames(): number {
    return Math.ceil(this.totalDuration * 30); // 30 fps
  }
  
  // Get actual video duration from blob for debugging (CLI version)
  private logActualVideoDurationCLI(videoBlob: Blob): void {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoBlob);
    
    video.onloadedmetadata = () => {
      const actualDuration = video.duration;
      const expectedDuration = this.totalDuration;
      
      console.log(`[CLIExportEngine] 🎥 Actual video duration: ${actualDuration.toFixed(3)}s`);
      console.log(`[CLIExportEngine] 📈 Timeline vs Video ratio: ${(actualDuration / expectedDuration).toFixed(3)}x`);
      
      if (Math.abs(actualDuration - expectedDuration) > 0.1) {
        console.warn(`[CLIExportEngine] ⚠️  Duration mismatch detected! Expected: ${expectedDuration.toFixed(3)}s, Got: ${actualDuration.toFixed(3)}s`);
      } else {
        console.log(`[CLIExportEngine] ✅ Duration match within tolerance`);
      }
      
      // Cleanup
      URL.revokeObjectURL(url);
    };
    
    video.onerror = () => {
      console.warn(`[CLIExportEngine] ⚠️  Could not determine actual video duration`);
      URL.revokeObjectURL(url);
    };
    
    video.src = url;
  }
}