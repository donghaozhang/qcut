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
}