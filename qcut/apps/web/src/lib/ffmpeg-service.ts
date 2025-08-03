import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private loaded = false;

  constructor(private onProgress?: (progress: number, message: string) => void) {}

  async initialize(): Promise<void> {
    if (this.loaded) return;
    
    console.log('[FFmpeg] Initializing...');
    this.ffmpeg = new FFmpeg();
    
    const paths = await this.getFFmpegPaths();
    await this.ffmpeg.load(paths);
    
    this.loaded = true;
    console.log('[FFmpeg] Initialized successfully');
  }

  private async getFFmpegPaths() {
    // Always use local files we copied to public/ffmpeg
    const baseURL = '/ffmpeg';
    console.log('[FFmpeg] Using local files from:', baseURL);
    
    return {
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    };
  }

  async encodeFramesToVideo(
    frames: Blob[],
    fps: number,
    format: string
  ): Promise<Blob> {
    if (!this.ffmpeg || !this.loaded) {
      throw new Error('FFmpeg not initialized');
    }
    
    console.log(`[FFmpeg] Encoding ${frames.length} frames at ${fps}fps to ${format}`);
    
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