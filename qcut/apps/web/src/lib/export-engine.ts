import { ExportSettings, ExportProgress, FORMAT_INFO } from "@/types/export";
import { TimelineElement, TimelineTrack } from "@/types/timeline";
import { MediaItem } from "@/stores/media-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useMediaStore } from "@/stores/media-store";

// Interface for active elements at a specific time
interface ActiveElement {
  element: TimelineElement;
  track: TimelineTrack;
  mediaItem: MediaItem | null;
}

// Advanced progress info
interface AdvancedProgressInfo {
  currentFrame: number;
  totalFrames: number;
  encodingSpeed: number;
  processedFrames: number;
  elapsedTime: number;
  averageFrameTime: number;
  estimatedTimeRemaining: number;
}

// Progress callback type
type ProgressCallback = (progress: number, status: string, advancedInfo?: AdvancedProgressInfo) => void;

// Export engine for rendering timeline to video
export class ExportEngine {
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected settings: ExportSettings;
  protected tracks: TimelineTrack[];
  protected mediaItems: MediaItem[];
  protected totalDuration: number;
  protected fps: number = 30; // Fixed framerate for now
  
  // MediaRecorder properties
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;
  protected isExporting: boolean = false;
  protected abortController: AbortController | null = null;
  
  // Video element cache for performance
  private videoCache = new Map<string, HTMLVideoElement>();
  
  constructor(
    canvas: HTMLCanvasElement,
    settings: ExportSettings,
    tracks: TimelineTrack[],
    mediaItems: MediaItem[],
    totalDuration: number
  ) {
    this.canvas = canvas;
    this.settings = settings;
    this.tracks = tracks;
    this.mediaItems = mediaItems;
    this.totalDuration = totalDuration;
    
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }
    this.ctx = ctx;
    
    // Set canvas dimensions to match export settings
    this.canvas.width = settings.width;
    this.canvas.height = settings.height;
  }

  // Calculate total number of frames needed for export
  calculateTotalFrames(): number {
    return Math.ceil(this.totalDuration * this.fps);
  }

  // Get active elements at a specific time
  private getActiveElements(currentTime: number): ActiveElement[] {
    const activeElements: ActiveElement[] = [];

    this.tracks.forEach((track, trackIndex) => {
      track.elements.forEach((element, elementIndex) => {
        if (element.hidden) {
          return;
        }
        
        const elementStart = element.startTime;
        const elementEnd = element.startTime + (element.duration - element.trimStart - element.trimEnd);

        if (currentTime >= elementStart && currentTime < elementEnd) {
          let mediaItem = null;
          if (element.type === "media" && element.mediaId !== "test") {
            mediaItem = this.mediaItems.find((item) => item.id === element.mediaId) || null;
            if (!mediaItem) {
              console.warn(`[ExportEngine] Media item not found: ${element.mediaId}`);
            }
          }
          activeElements.push({ element, track, mediaItem });
        }
      });
    });

    return activeElements;
  }

  // Render a single frame at the specified time
  async renderFrame(currentTime: number): Promise<void> {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Fill with background color (black for now)
    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const activeElements = this.getActiveElements(currentTime);
    
    // Sort elements by track type (render bottom to top)
    const sortedElements = activeElements.sort((a, b) => {
      // Text tracks on top
      if (a.track.type === "text" && b.track.type !== "text") return 1;
      if (b.track.type === "text" && a.track.type !== "text") return -1;
      // Audio tracks at bottom
      if (a.track.type === "audio" && b.track.type !== "audio") return -1;
      if (b.track.type === "audio" && a.track.type !== "audio") return 1;
      return 0;
    });

    // Render each active element
    for (const { element, mediaItem } of sortedElements) {
      await this.renderElement(element, mediaItem, currentTime);
    }
  }

  // Render individual element (media or text)
  private async renderElement(
    element: TimelineElement, 
    mediaItem: MediaItem | null, 
    currentTime: number
  ): Promise<void> {
    const elementTimeOffset = currentTime - element.startTime;
    
    if (element.type === "media" && mediaItem) {
      await this.renderMediaElement(element, mediaItem, elementTimeOffset);
    } else if (element.type === "text") {
      this.renderTextElement(element);
    }
  }

  // Render media elements (images/videos)
  private async renderMediaElement(
    element: TimelineElement,
    mediaItem: MediaItem,
    timeOffset: number
  ): Promise<void> {
    if (!mediaItem.url) {
      console.warn(`[ExportEngine] No URL for media item ${mediaItem.id}`);
      return;
    }

    try {
      if (mediaItem.type === "image") {
        await this.renderImage(element, mediaItem);
      } else if (mediaItem.type === "video") {
        await this.renderVideo(element, mediaItem, timeOffset);
      }
    } catch (error) {
      console.error(`[ExportEngine] Failed to render ${element.id}:`, error);
    }
  }

  // Render image element
  private async renderImage(element: TimelineElement, mediaItem: MediaItem): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        try {
          const { x, y, width, height } = this.calculateElementBounds(element, img.width, img.height);
          this.ctx.drawImage(img, x, y, width, height);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        console.error(`[ExportEngine] Failed to load image: ${mediaItem.url}`);
        reject(new Error(`Failed to load image: ${mediaItem.url}`));
      };
      
      img.src = mediaItem.url!;
    });
  }

  // Render video element
  private async renderVideo(
    element: TimelineElement, 
    mediaItem: MediaItem, 
    timeOffset: number
  ): Promise<void> {
    if (!mediaItem.url) {
      console.warn(`[ExportEngine] No URL for video element ${element.id}`);
      return;
    }

    try {
      // Use cached video element or create new one
      let video = this.videoCache.get(mediaItem.url);
      if (!video) {
        video = document.createElement('video');
        video.src = mediaItem.url;
        video.crossOrigin = 'anonymous';
        
        // Wait for video to load
        await new Promise<void>((resolve, reject) => {
          video!.onloadeddata = () => resolve();
          video!.onerror = () => reject(new Error('Failed to load video'));
        });
        
        // Cache the loaded video
        this.videoCache.set(mediaItem.url, video);
      }
      
      // Seek to the correct time
      const seekTime = timeOffset + element.trimStart;
      video.currentTime = seekTime;
      
      // Wait for seek to complete with shorter timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Video seek timeout'));
        }, 100); // Reduced from 1000ms to 100ms
        
        video.onseeked = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
      
      // Shorter delay for frame ready
      await new Promise(resolve => setTimeout(resolve, 20)); // Reduced from 50ms to 20ms
      
      // Calculate bounds
      const { x, y, width, height } = this.calculateElementBounds(
        element, 
        video.videoWidth, 
        video.videoHeight
      );
      
      // Draw video frame to canvas
      this.ctx.drawImage(video, x, y, width, height);
      
    } catch (error) {
      console.error(`[ExportEngine] Failed to render video:`, error);
    }
  }

  // Render text elements
  private renderTextElement(element: TimelineElement): void {
    if (element.type !== "text") return;

    if (!element.content || !element.content.trim()) return;

    // Set text properties
    this.ctx.fillStyle = element.color || "#ffffff";
    this.ctx.font = `${element.fontSize || 24}px ${element.fontFamily || "Arial"}`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";

    // Position text (using element position or defaults)
    const x = element.type === "text" ? (element.x || 50) : 50;
    const y = element.type === "text" ? (element.y || 50) : 50;

    // Simple text rendering (no word wrap for now)
    this.ctx.fillText(element.content, x, y);
  }

  // Calculate element bounds based on element properties and media dimensions
  protected calculateElementBounds(element: TimelineElement, mediaWidth: number, mediaHeight: number) {
    // Default positioning and sizing
    const canvasAspect = this.canvas.width / this.canvas.height;
    const mediaAspect = mediaWidth / mediaHeight;
    
    let width = this.canvas.width;
    let height = this.canvas.height;
    
    // Maintain aspect ratio - fit to canvas
    if (mediaAspect > canvasAspect) {
      // Media is wider - fit to width
      height = width / mediaAspect;
    } else {
      // Media is taller - fit to height  
      width = height * mediaAspect;
    }
    
    // Center the element
    const x = (this.canvas.width - width) / 2;
    const y = (this.canvas.height - height) / 2;
    
    // Apply element transformations if available (text elements have x,y properties)
    const elementX = element.type === "text" ? element.x : undefined;
    const elementY = element.type === "text" ? element.y : undefined;
    
    return {
      x: elementX || x,
      y: elementY || y,
      width: width,
      height: height
    };
  }

  // Get total duration
  getTotalDuration(): number {
    return this.totalDuration;
  }

  // Get frame rate
  getFrameRate(): number {
    return this.fps;
  }

  // Setup MediaRecorder for canvas capture with proper timing
  private setupMediaRecorder(existingStream?: MediaStream): void {
    if (this.mediaRecorder) {
      return; // Already set up
    }

    // Use existing stream if provided, otherwise create a new one
    const stream = existingStream || this.canvas.captureStream(0); // 0 fps = manual frame capture
    
    // Configure MediaRecorder options based on format and quality
    const formatInfo = FORMAT_INFO[this.settings.format];
    let selectedMimeType = formatInfo.mimeTypes[0]; // Default to first option
    
    // Find the first supported MIME type for this format
    for (const mimeType of formatInfo.mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType as any;
        break;
      }
    }
    
    const videoBitrate = this.getVideoBitrate();
    const options: MediaRecorderOptions = {
      mimeType: selectedMimeType as string,
      videoBitsPerSecond: videoBitrate
    };

    // Fallback to WebM if selected format not supported
    if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
      options.mimeType = 'video/webm;codecs=vp8' as string;
    }

    // Create MediaRecorder
    this.mediaRecorder = new MediaRecorder(stream, options);
    
    // Handle data chunks
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    // Handle recording stop
    this.mediaRecorder.onstop = () => {
      this.isRecording = false;
    };
  }

  // Get video bitrate based on quality settings
  protected getVideoBitrate(): number {
    // Bitrates in bits per second
    const bitrates = {
      '1080p': 8000000,  // 8 Mbps
      '720p': 5000000,   // 5 Mbps  
      '480p': 2500000    // 2.5 Mbps
    };
    
    return bitrates[this.settings.quality] || bitrates['720p'];
  }

  // Start recording
  private startRecording(): void {
    if (!this.mediaRecorder) {
      this.setupMediaRecorder();
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
      this.recordedChunks = []; // Clear previous chunks
      this.isRecording = true;
      this.mediaRecorder.start(100); // Record in 100ms chunks
    }
  }

  // Stop recording and return blob
  private stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not initialized'));
        return;
      }

      const totalSize = this.recordedChunks.reduce((total, chunk) => total + chunk.size, 0);
      console.log(`[ExportEngine] Export complete: ${totalSize} bytes, ${this.recordedChunks.length} chunks`);

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        resolve(blob);
      };

      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      } else {
        // Already stopped, create blob immediately
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        resolve(blob);
      }
    });
  }

  // Main export method - renders timeline and captures video
  async export(progressCallback?: ProgressCallback): Promise<Blob> {
    if (this.isExporting) {
      throw new Error('Export already in progress');
    }

    this.isExporting = true;
    this.abortController = new AbortController();
    
    try {
      // Get canvas stream for manual frame capture FIRST
      const stream = this.canvas.captureStream(0);
      const videoTrack = stream.getVideoTracks()[0];
      
      // Setup MediaRecorder with the same stream
      this.setupMediaRecorder(stream);
      this.startRecording();
      
      const totalFrames = this.calculateTotalFrames();
      const frameTime = 1 / this.fps; // Time per frame in seconds
      const startTime = Date.now();
      
      progressCallback?.(0, 'Starting export...');
      
      // Verify stream sync
      if (stream.id !== this.mediaRecorder?.stream?.id) {
        console.warn('[ExportEngine] Stream mismatch detected!');
      }
      
      // Render each frame with advanced progress tracking
      for (let frame = 0; frame < totalFrames; frame++) {
        const frameStartTime = performance.now();
        
        // Check if export was cancelled
        if (this.abortController.signal.aborted) {
          throw new Error('Export cancelled by user');
        }
        
        const currentTime = frame * frameTime;
        
        // Render frame to canvas
        await this.renderFrame(currentTime);
        
        // Smart canvas verification - only check every 10th frame or when needed
        if (frame % 10 === 0 || frame === 0) {
          const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
          const pixels = imageData.data;
          let nonBlackPixels = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 0 || pixels[i + 1] > 0 || pixels[i + 2] > 0) {
              nonBlackPixels++;
            }
          }
          
          if (nonBlackPixels === 0) {
            console.warn(`[ExportEngine] BLACK FRAME at ${frame + 1}!`);
          } else if (frame % 30 === 0) {
            console.log(`[ExportEngine] Frame ${frame + 1}: ${nonBlackPixels} pixels`);
          }
        }
        
        // Manually capture this frame to the stream
        if (videoTrack && 'requestFrame' in videoTrack) {
          (videoTrack as any).requestFrame();
          // Shorter frame capture delay
          await new Promise(resolve => setTimeout(resolve, 20)); // Reduced from 50ms to 20ms
        } else {
          console.warn(`[ExportEngine] Cannot capture frame ${frame + 1}`);
        }
        
        // Calculate advanced progress metrics with performance timing
        const now = Date.now();
        const elapsedTime = (now - startTime) / 1000; // seconds
        const frameProcessingTime = performance.now() - frameStartTime; // milliseconds
        const averageFrameTime = elapsedTime * 1000 / (frame + 1); // milliseconds
        const encodingSpeed = (frame + 1) / elapsedTime; // fps
        
        // Log frame timing every 30 frames
        if (frame % 30 === 0) {
          console.log(`[ExportEngine] Frame ${frame + 1} took ${frameProcessingTime.toFixed(1)}ms`);
        }
        
        // Estimate time remaining
        const remainingFrames = totalFrames - frame - 1;
        const estimatedTimeRemaining = remainingFrames * (averageFrameTime / 1000); // seconds
        
        // Update progress with advanced info
        const progress = (frame / totalFrames) * 95; // Reserve 5% for finalization
        const status = `Rendering frame ${frame + 1} of ${totalFrames} (${encodingSpeed.toFixed(1)} fps)`;
        
        // Call with advanced progress info
        if (progressCallback) {
          progressCallback(progress, status, {
            currentFrame: frame + 1,
            totalFrames,
            encodingSpeed,
            processedFrames: frame + 1,
            elapsedTime,
            averageFrameTime,
            estimatedTimeRemaining
          });
        }
        
        // Minimal UI update delay
        if (frame % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      
      progressCallback?.(95, 'Finalizing video...');
      
      // Stop recording and get final blob
      const videoBlob = await this.stopRecording();
      
      progressCallback?.(100, 'Export complete!');
      
      return videoBlob;
      
    } catch (error) {
      console.error('[ExportEngine] Export failed:', error);
      // Clean up on error
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      this.isExporting = false;
      throw error;
    } finally {
      this.isExporting = false;
    }
  }

  // Cancel export
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    
    this.isExporting = false;
    this.isRecording = false;
    this.recordedChunks = []; // Clear any partial data
  }

  // Check if export is in progress
  isExportInProgress(): boolean {
    return this.isExporting;
  }

  // Check if export was cancelled (protected method for subclasses)
  protected isExportCancelled(): boolean {
    return this.abortController?.signal.aborted || false;
  }

  // Clean up video cache
  private cleanupVideoCache(): void {
    this.videoCache.clear();
  }

  // Download video blob - adapted from zip-manager.ts downloadZipSafely
  async downloadVideo(blob: Blob, filename: string): Promise<void> {
    // Ensure filename has proper extension for the selected format
    const formatInfo = FORMAT_INFO[this.settings.format];
    const extension = formatInfo.extension;
    const finalFilename = filename.endsWith(extension) ? filename : `${filename}${extension}`;
    
    // Use modern File System Access API if available
    if ('showSaveFilePicker' in window) {
      try {
        const mimeType = blob.type || formatInfo.mimeTypes[0];
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: finalFilename,
          types: [{
            description: `${formatInfo.label} files`,
            accept: { [mimeType]: [extension] }
          }]
        });
        
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (error) {
        // Fall back to traditional download if user cancels or API unavailable
      }
    }

    // Traditional download with navigation bug prevention (borrowed from zip-manager.ts)
    const url = URL.createObjectURL(blob);
    
    // Create download in a way that prevents navigation
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      const link = iframeDoc.createElement('a');
      link.href = url;
      link.download = finalFilename;
      iframeDoc.body.appendChild(link);
      link.click();
      iframeDoc.body.removeChild(link);
    }
    
    // Cleanup blob URL after download
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Complete export with download
  async exportAndDownload(
    filename: string, 
    progressCallback?: ProgressCallback
  ): Promise<void> {
    const videoBlob = await this.export(progressCallback);
    await this.downloadVideo(videoBlob, filename);
  }
}