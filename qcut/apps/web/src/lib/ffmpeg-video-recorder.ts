import { ExportSettings } from "@/types/export";
import { encodeImagesToVideo, ImageFrame, initFFmpeg } from "@/lib/ffmpeg-utils-encode";

export interface FFmpegVideoRecorderOptions {
  fps: number;
  settings: ExportSettings;
}

/**
 * Offline video recorder that collects PNG frames and encodes
 * them into a video using FFmpeg.wasm.
 */
export class FFmpegVideoRecorder {
  private fps: number;
  private settings: ExportSettings;
  private frames: ImageFrame[] = [];
  private ffmpegReady = false;

  constructor(options: FFmpegVideoRecorderOptions) {
    this.fps = options.fps;
    this.settings = options.settings;
  }

  async startRecording(): Promise<void> {
    console.log("🚀 FFmpegVideoRecorder: Starting recording and initializing FFmpeg...");
    
    try {
      // Initialize FFmpeg early to catch any loading issues
      await initFFmpeg();
      this.ffmpegReady = true;
      console.log("✅ FFmpeg WASM loaded successfully");
    } catch (error) {
      console.error("❌ Failed to load FFmpeg WASM:", error);
      throw new Error(`Failed to initialize FFmpeg WASM: ${error}`);
    }
    
    this.frames = [];
  }

  async addFrame(dataUrl: string, index: number): Promise<void> {
    if (!this.ffmpegReady) {
      throw new Error("FFmpeg not initialized. Call startRecording() first.");
    }
    
    const base64 = dataUrl.split(",", 2)[1];
    // Convert base64 to Uint8Array
    const binaryString = atob(base64);
    const len = binaryString.length;
    const data = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      data[i] = binaryString.charCodeAt(i);
    }
    const name = `frame-${String(index).padStart(5, "0")}.png`;
    this.frames.push({ name, data });
  }

  async stopRecording(): Promise<Blob> {
    if (!this.ffmpegReady) {
      throw new Error("FFmpeg not initialized. Call startRecording() first.");
    }
    
    console.log(`🎬 Encoding ${this.frames.length} frames to video...`);
    
    try {
      // Map ExportFormat to supported FFmpeg formats
      const format = this.settings.format === 'webm' ? 'webm' : 'mp4'; // MOV maps to MP4
      
      const blob = await encodeImagesToVideo(this.frames, {
        fps: this.fps,
        format,
      });
      console.log("✅ Video encoding completed successfully");
      this.frames = [];
      return blob;
    } catch (error) {
      console.error("❌ Video encoding failed:", error);
      throw new Error(`Video encoding failed: ${error}`);
    }
  }

  setAudioStream(_stream: MediaStream | null): void {
    // Audio not yet supported for FFmpeg path
    console.log("Audio stream set - not yet supported in FFmpeg WASM export");
  }

  cleanup(): void {
    this.frames = [];
    this.ffmpegReady = false;
  }
}

export const isFFmpegExportEnabled = (): boolean => {
  // Enable FFmpeg WASM export by default
  return true;
};