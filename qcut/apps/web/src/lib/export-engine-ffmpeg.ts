import { ExportEngine } from './export-engine';
import { FFmpegService } from './ffmpeg-service';
import { ExportSettings } from '@/types/export';
import { TimelineTrack } from '@/types/timeline';
import { MediaItem } from '@/stores/media-store';

export type ProgressCallback = (progress: number, message: string) => void;

export class FFmpegExportEngine extends ExportEngine {
  private ffmpegService: FFmpegService;
  private frameBlobs: Blob[] = [];
  
  constructor(
    canvas: HTMLCanvasElement,
    settings: ExportSettings,
    tracks: TimelineTrack[],
    mediaItems: MediaItem[],
    totalDuration: number
  ) {
    super(canvas, settings, tracks, mediaItems, totalDuration);
    this.ffmpegService = new FFmpegService();
  }
  
  async export(progressCallback?: ProgressCallback): Promise<Blob> {
    console.log('[FFmpegExportEngine] Starting FFmpeg export...');
    
    // Create FFmpeg service with progress callback
    this.ffmpegService = new FFmpegService(progressCallback);
    
    // Initialize FFmpeg
    progressCallback?.(5, 'Initializing FFmpeg...');
    await this.ffmpegService.initialize();
    
    // Pre-load videos (our optimization)
    progressCallback?.(10, 'Pre-loading videos...');
    await this.preloadAllVideos();
    
    // Render frames to blobs instead of MediaRecorder
    progressCallback?.(15, 'Rendering frames...');
    await this.renderFramesToBlobs(progressCallback);
    
    // Encode with FFmpeg
    progressCallback?.(90, 'Encoding video with FFmpeg...');
    const videoBlob = await this.ffmpegService.encodeFramesToVideo(
      this.frameBlobs,
      30, // fps
      this.settings.format
    );
    
    progressCallback?.(100, 'Export completed!');
    console.log('[FFmpegExportEngine] Export completed successfully');
    
    return videoBlob;
  }

  private async renderFramesToBlobs(progressCallback?: ProgressCallback): Promise<void> {
    const totalFrames = this.calculateTotalFrames();
    const frameTime = 1 / 30; // fps
    
    console.log(`[FFmpeg] Collecting ${totalFrames} frames for encoding...`);
    
    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Export cancelled');
      }
      
      const currentTime = frame * frameTime;
      
      // Render frame (using our optimized method)
      await this.renderFrame(currentTime);
      
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve) => {
        this.canvas.toBlob((blob) => {
          resolve(blob!);
        }, 'image/png');
      });
      
      this.frameBlobs.push(blob);
      
      // Progress update (15% to 85% for frame rendering)
      const progress = 15 + (frame / totalFrames) * 70;
      progressCallback?.(progress, `Rendering frame ${frame + 1}/${totalFrames}`);
      
      // Log progress every 30 frames
      if (frame % 30 === 0) {
        console.log(`[FFmpeg] Rendered ${frame + 1}/${totalFrames} frames`);
      }
    }
    
    console.log(`[FFmpeg] Collected ${this.frameBlobs.length} frames`);
  }

  calculateTotalFrames(): number {
    return Math.ceil(this.totalDuration * 30); // 30 fps
  }
}