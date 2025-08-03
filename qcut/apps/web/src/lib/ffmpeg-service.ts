import { FFmpeg } from '@ffmpeg/ffmpeg';
import { initFFmpeg, isFFmpegReady } from './ffmpeg-utils';

export class FFmpegService {
  private ffmpeg: FFmpeg | null = null;

  constructor(private onProgress?: (progress: number, message: string) => void) {}

  async initialize(): Promise<void> {    
    console.log('[FFmpeg Service] Initializing...');
    
    // Use the ffmpeg-utils which already handles Electron properly and singleton management
    this.ffmpeg = await initFFmpeg();
    
    console.log('[FFmpeg Service] Initialized successfully');
  }

  async encodeFramesToVideo(
    frames: Blob[],
    fps: number,
    format: string
  ): Promise<Blob> {
    // Ensure FFmpeg is ready, re-initialize if needed
    if (!isFFmpegReady() || !this.ffmpeg) {
      console.log('🎬 FFmpeg not ready, initializing...');
      await this.initialize();
    }
    
    if (!this.ffmpeg || !isFFmpegReady()) {
      throw new Error('FFmpeg initialization failed - instance not ready for encoding');
    }
    
    console.log(`🎬 Starting video encoding: ${frames.length} frames at ${fps}fps to ${format}`);
    
    // Add progress during encoding
    this.ffmpeg!.on('progress', ({ progress, time }) => {
      const percent = 90 + (progress * 10); // 90-100% range
      this.onProgress?.(percent, `Encoding video... ${Math.round(progress * 100)}%`);
    });
    
    // Write frames to FFmpeg file system
    for (let i = 0; i < frames.length; i++) {
      const frameData = await frames[i].arrayBuffer();
      const frameName = `frame${i.toString().padStart(5, '0')}.png`;
      await this.ffmpeg.writeFile(frameName, new Uint8Array(frameData));
      
      if (i % 30 === 0) {
        console.log(`[FFmpeg] Written ${i + 1}/${frames.length} frames`);
      }
    }
    
    // Encode video
    const outputFile = `output.${format}`;
    await this.runFFmpegCommand(fps, format, outputFile);
    
    // Read output
    const data = await this.ffmpeg.readFile(outputFile);
    const videoBlob = new Blob([data], { type: `video/${format}` });
    
    // Cleanup
    await this.cleanup();
    
    return videoBlob;
  }

  private async runFFmpegCommand(
    fps: number,
    format: string,
    outputFile: string
  ): Promise<void> {
    const args = this.getFFmpegArgs(fps, format, outputFile);
    
    console.log('[FFmpeg] Running command:', args.join(' '));
    
    await this.ffmpeg!.exec(args);
  }

  private getFFmpegArgs(fps: number, format: string, outputFile: string): string[] {
    const baseArgs = [
      '-framerate', fps.toString(),
      '-pattern_type', 'sequence',
      '-i', 'frame%05d.png',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '23'
    ];
    
    // Format-specific settings
    if (format === 'mp4') {
      baseArgs.push('-movflags', '+faststart');
    } else if (format === 'webm') {
      baseArgs[baseArgs.indexOf('libx264')] = 'libvpx-vp9';
      baseArgs.push('-b:v', '1M');
    }
    
    baseArgs.push(outputFile);
    return baseArgs;
  }

  private async cleanup(): Promise<void> {
    // Remove all frame files
    const files = await this.ffmpeg!.listDir('/');
    for (const file of files) {
      if (file.name.startsWith('frame') || file.name.startsWith('output')) {
        await this.ffmpeg!.deleteFile(file.name);
      }
    }
  }
}