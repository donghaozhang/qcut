import { ExportEngine } from "./export-engine";
import { ExportSettings } from "@/types/export";
import { TimelineElement, TimelineTrack } from "@/types/timeline";
import { MediaItem } from "@/stores/media-store";
import { WebCodecsDetector, CodecSupport } from "./webcodecs-detector";

// Progress callback type
type ProgressCallback = (progress: number, status: string) => void;

// WebCodecs-specific configuration
interface WebCodecsConfig {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  keyFrameInterval: number;
  acceleration: 'prefer-hardware' | 'prefer-software';
}

// Frame processing state
interface FrameProcessingState {
  encoder: VideoEncoder | null;
  frameCount: number;
  keyFrameInterval: number;
  isKeyFrame: boolean;
  encodedChunks: EncodedVideoChunk[];
  outputBuffer: ArrayBuffer[];
}

// WebCodecs-based export engine for maximum performance
export class WebCodecsExportEngine extends ExportEngine {
  private webCodecsConfig: WebCodecsConfig | null = null;
  private processingState: FrameProcessingState;
  private detector: WebCodecsDetector;
  private bestCodec: CodecSupport | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    settings: ExportSettings,
    tracks: TimelineTrack[],
    mediaItems: MediaItem[],
    totalDuration: number
  ) {
    super(canvas, settings, tracks, mediaItems, totalDuration);
    
    this.detector = WebCodecsDetector.getInstance();
    this.processingState = {
      encoder: null,
      frameCount: 0,
      keyFrameInterval: 30, // Key frame every 30 frames (1 sec at 30fps)
      isKeyFrame: false,
      encodedChunks: [],
      outputBuffer: []
    };
    
    this.initializeWebCodecs();
  }

  // Initialize WebCodecs configuration
  private async initializeWebCodecs(): Promise<void> {
    try {
      // Ensure WebCodecs support is detected
      const support = await this.detector.detectSupport();
      
      if (!support.supported) {
        throw new Error('WebCodecs not supported');
      }

      // Get best codec for our export settings
      this.bestCodec = this.detector.getBestEncoder(
        this.settings.width,
        this.settings.height,
        this.getFrameRate()
      );

      if (!this.bestCodec) {
        throw new Error('No suitable WebCodecs encoder found');
      }

      // Configure WebCodecs settings
      this.webCodecsConfig = {
        codec: this.bestCodec.codec,
        width: this.settings.width,
        height: this.settings.height,
        bitrate: this.getVideoBitrate(),
        framerate: this.getFrameRate(),
        keyFrameInterval: 30,
        acceleration: this.bestCodec.hardware ? 'prefer-hardware' : 'prefer-software'
      };

      // Setup offscreen canvas for better performance
      this.setupOffscreenCanvas();

      console.log('WebCodecsExportEngine initialized:', {
        codec: this.bestCodec.codec,
        hardware: this.bestCodec.hardware,
        resolution: `${this.settings.width}x${this.settings.height}`
      });

    } catch (error) {
      console.error('WebCodecs initialization failed:', error);
      throw error;
    }
  }

  // Setup offscreen canvas
  private setupOffscreenCanvas(): void {
    if (typeof OffscreenCanvas !== 'undefined') {
      this.offscreenCanvas = new OffscreenCanvas(
        this.settings.width,
        this.settings.height
      );
      this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    }
  }

  // Setup VideoEncoder
  private async setupVideoEncoder(): Promise<void> {
    if (!this.webCodecsConfig) {
      throw new Error('WebCodecs not initialized');
    }

    return new Promise((resolve, reject) => {
      try {
        this.processingState.encoder = new VideoEncoder({
          output: (chunk, metadata) => {
            this.handleEncodedChunk(chunk, metadata);
          },
          error: (error) => {
            console.error('VideoEncoder error:', error);
            reject(error);
          }
        });

        const config = {
          codec: this.webCodecsConfig.codec,
          width: this.webCodecsConfig.width,
          height: this.webCodecsConfig.height,
          bitrate: this.webCodecsConfig.bitrate,
          framerate: this.webCodecsConfig.framerate,
          acceleration: this.webCodecsConfig.acceleration
        };

        this.processingState.encoder.configure(config);
        
        console.log('VideoEncoder configured:', config);
        resolve();

      } catch (error) {
        reject(error);
      }
    });
  }

  // Handle encoded video chunks
  private handleEncodedChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata): void {
    this.processingState.encodedChunks.push(chunk);
    
    // Copy chunk data to buffer for final video creation
    const buffer = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(buffer);
    this.processingState.outputBuffer.push(buffer);
  }

  // Override main export method
  async export(progressCallback?: ProgressCallback): Promise<Blob> {
    if (this.isExporting) {
      throw new Error('Export already in progress');
    }

    this.isExporting = true;
    this.abortController = new AbortController();

    try {
      // Initialize WebCodecs encoder
      await this.setupVideoEncoder();
      
      const totalFrames = this.calculateTotalFrames();
      const frameTime = 1 / this.getFrameRate();
      
      progressCallback?.(0, 'Starting WebCodecs export...');
      
      // Reset processing state
      this.processingState.frameCount = 0;
      this.processingState.encodedChunks = [];
      this.processingState.outputBuffer = [];

      // Render and encode each frame
      for (let frame = 0; frame < totalFrames; frame++) {
        // Check if export was cancelled
        if (this.abortController.signal.aborted) {
          throw new Error('Export cancelled by user');
        }

        const currentTime = frame * frameTime;
        
        // Render frame to canvas/offscreen canvas
        await this.renderFrame(currentTime);
        
        // Create VideoFrame from canvas
        const videoFrame = await this.createVideoFrame();
        
        // Determine if this should be a key frame
        this.processingState.isKeyFrame = 
          frame % this.processingState.keyFrameInterval === 0;
        
        // Encode frame
        await this.encodeFrame(videoFrame, frame);
        
        // Clean up frame
        videoFrame.close();
        
        // Update progress
        const progress = (frame / totalFrames) * 90; // Reserve 10% for finalization
        const status = `Encoding frame ${frame + 1} of ${totalFrames} (WebCodecs)`;
        progressCallback?.(progress, status);
        
        // Allow UI updates
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      progressCallback?.(95, 'Finalizing WebCodecs video...');
      
      // Finalize encoding
      await this.finalizeEncoding();
      
      // Create final video blob
      const videoBlob = await this.createVideoBlob();
      
      progressCallback?.(100, 'WebCodecs export complete!');
      
      return videoBlob;
      
    } catch (error) {
      this.cleanup();
      throw error;
    } finally {
      this.isExporting = false;
    }
  }

  // Create VideoFrame from current canvas content
  private async createVideoFrame(): Promise<VideoFrame> {
    const sourceCanvas = this.offscreenCanvas || this.canvas;
    
    try {
      // Create VideoFrame from canvas
      const videoFrame = new VideoFrame(sourceCanvas, {
        timestamp: this.processingState.frameCount * (1000000 / this.getFrameRate()), // microseconds
        duration: 1000000 / this.getFrameRate() // microseconds
      });
      
      return videoFrame;
    } catch (error) {
      console.error('Failed to create VideoFrame:', error);
      throw error;
    }
  }

  // Encode a single frame
  private async encodeFrame(videoFrame: VideoFrame, frameIndex: number): Promise<void> {
    if (!this.processingState.encoder) {
      throw new Error('VideoEncoder not initialized');
    }

    return new Promise((resolve, reject) => {
      try {
        this.processingState.encoder!.encode(videoFrame, {
          keyFrame: this.processingState.isKeyFrame
        });
        
        this.processingState.frameCount++;
        resolve();
        
      } catch (error) {
        reject(error);
      }
    });
  }

  // Finalize encoding process
  private async finalizeEncoding(): Promise<void> {
    if (!this.processingState.encoder) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Flush encoder to get remaining frames
        this.processingState.encoder!.flush().then(() => {
          resolve();
        }).catch(reject);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  // Create final video blob from encoded chunks
  private async createVideoBlob(): Promise<Blob> {
    if (this.processingState.outputBuffer.length === 0) {
      throw new Error('No encoded frames available');
    }

    try {
      // For now, create a simple container
      // In a full implementation, you'd create proper MP4/WebM container
      const totalSize = this.processingState.outputBuffer.reduce(
        (sum, buffer) => sum + buffer.byteLength, 0
      );
      
      const combinedBuffer = new Uint8Array(totalSize);
      let offset = 0;
      
      for (const buffer of this.processingState.outputBuffer) {
        combinedBuffer.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }
      
      // Create blob with appropriate MIME type
      const mimeType = this.getMimeTypeForCodec(this.webCodecsConfig!.codec);
      return new Blob([combinedBuffer], { type: mimeType });
      
    } catch (error) {
      console.error('Failed to create video blob:', error);
      throw error;
    }
  }

  // Get MIME type for codec
  private getMimeTypeForCodec(codec: string): string {
    if (codec.includes('avc1') || codec.includes('h264')) {
      return 'video/mp4';
    } else if (codec.includes('vp09') || codec.includes('vp9')) {
      return 'video/webm';
    } else if (codec.includes('vp8')) {
      return 'video/webm';
    } else if (codec.includes('av01')) {
      return 'video/mp4'; // AV1 in MP4
    }
    return 'video/mp4'; // Default fallback
  }

  // Override renderFrame to use offscreen canvas if available
  async renderFrame(currentTime: number): Promise<void> {
    const renderCtx = this.offscreenCtx || this.ctx;
    const renderCanvas = this.offscreenCanvas || this.canvas;

    // Check for cancellation
    if (this.isExportCancelled()) {
      throw new Error('Export cancelled by user');
    }

    // Use parent's render logic but with our canvas
    const originalCtx = this.ctx;
    const originalCanvas = this.canvas;
    
    // Temporarily switch context for rendering
    if (this.offscreenCtx && this.offscreenCanvas) {
      (this as any).ctx = this.offscreenCtx;
      (this as any).canvas = this.offscreenCanvas;
    }
    
    try {
      // Call parent render method
      await super.renderFrame(currentTime);
      
      // Copy to main canvas if using offscreen
      if (this.offscreenCanvas && originalCtx !== this.offscreenCtx) {
        originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
        originalCtx.drawImage(this.offscreenCanvas, 0, 0);
      }
    } finally {
      // Restore original context
      (this as any).ctx = originalCtx;
      (this as any).canvas = originalCanvas;
    }
  }

  // Enhanced cleanup
  cleanup(): void {
    if (this.processingState.encoder) {
      try {
        this.processingState.encoder.close();
      } catch (error) {
        console.warn('Error closing VideoEncoder:', error);
      }
      this.processingState.encoder = null;
    }

    // Clean up video frames
    this.processingState.encodedChunks.forEach(chunk => {
      try {
        // EncodedVideoChunk doesn't have explicit cleanup in the current API
      } catch (error) {
        console.warn('Error cleaning up chunk:', error);
      }
    });

    this.processingState.encodedChunks = [];
    this.processingState.outputBuffer = [];
    this.processingState.frameCount = 0;

    // Clean up offscreen canvas
    if (this.offscreenCanvas) {
      this.offscreenCanvas = null;
      this.offscreenCtx = null;
    }
  }

  // Override cancel to include WebCodecs cleanup
  cancel(): void {
    super.cancel();
    this.cleanup();
  }

  // Get performance metrics
  getWebCodecsMetrics() {
    return {
      codec: this.bestCodec?.codec || 'unknown',
      hardwareAcceleration: this.bestCodec?.hardware || false,
      framesEncoded: this.processingState.frameCount,
      chunksCreated: this.processingState.encodedChunks.length,
      isActive: this.processingState.encoder?.state === 'configured'
    };
  }

  // Check if WebCodecs is actually being used
  isUsingWebCodecs(): boolean {
    return this.webCodecsConfig !== null && this.processingState.encoder !== null;
  }
}