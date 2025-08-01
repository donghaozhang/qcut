import { ExportSettings, ExportProgress } from "@/types/export";
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

// Progress callback type
type ProgressCallback = (progress: number, status: string) => void;

// Export engine for rendering timeline to video
export class ExportEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: ExportSettings;
  private tracks: TimelineTrack[];
  private mediaItems: MediaItem[];
  private totalDuration: number;
  private fps: number = 30; // Fixed framerate for now
  
  // MediaRecorder properties
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;
  private isExporting: boolean = false;
  
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
    
    const ctx = canvas.getContext("2d");
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

    this.tracks.forEach((track) => {
      track.elements.forEach((element) => {
        if (element.hidden) return;
        
        const elementStart = element.startTime;
        const elementEnd = element.startTime + (element.duration - element.trimStart - element.trimEnd);

        if (currentTime >= elementStart && currentTime < elementEnd) {
          let mediaItem = null;
          if (element.type === "media" && element.mediaId !== "test") {
            mediaItem = this.mediaItems.find((item) => item.id === element.mediaId) || null;
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
    
    // Sort elements by track order (render bottom to top)
    const sortedElements = activeElements.sort((a, b) => a.track.order - b.track.order);

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
    if (!mediaItem.url) return;

    try {
      if (mediaItem.type === "image") {
        await this.renderImage(element, mediaItem);
      } else if (mediaItem.type === "video") {
        await this.renderVideo(element, mediaItem, timeOffset);
      }
    } catch (error) {
      console.warn(`Failed to render media element ${element.id}:`, error);
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
      
      img.onerror = () => reject(new Error(`Failed to load image: ${mediaItem.url}`));
      img.src = mediaItem.url!;
    });
  }

  // Render video element (placeholder - needs video element synchronization)
  private async renderVideo(
    element: TimelineElement, 
    mediaItem: MediaItem, 
    timeOffset: number
  ): Promise<void> {
    // For now, we'll create a placeholder that shows video info
    // TODO: Implement proper video frame extraction
    this.ctx.fillStyle = "#333333";
    this.ctx.fillRect(50, 50, 200, 100);
    
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "16px Arial";
    this.ctx.fillText("Video Element", 60, 80);
    this.ctx.fillText(`Time: ${timeOffset.toFixed(2)}s`, 60, 100);
    this.ctx.fillText(`File: ${mediaItem.name}`, 60, 120);
  }

  // Render text elements
  private renderTextElement(element: TimelineElement): void {
    if (element.type !== "text") return;

    const textData = element.textData;
    if (!textData || !textData.content.trim()) return;

    // Set text properties
    this.ctx.fillStyle = textData.color || "#ffffff";
    this.ctx.font = `${textData.fontSize || 24}px ${textData.fontFamily || "Arial"}`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";

    // Position text (using element position or defaults)
    const x = element.x || 50;
    const y = element.y || 50;

    // Simple text rendering (no word wrap for now)
    this.ctx.fillText(textData.content, x, y);
  }

  // Calculate element bounds based on element properties and media dimensions
  private calculateElementBounds(element: TimelineElement, mediaWidth: number, mediaHeight: number) {
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
    
    // Apply element transformations if available
    return {
      x: element.x || x,
      y: element.y || y,
      width: element.width || width,
      height: element.height || height
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

  // Setup MediaRecorder for canvas capture
  private setupMediaRecorder(): void {
    if (this.mediaRecorder) {
      return; // Already set up
    }

    // Get canvas stream
    const stream = this.canvas.captureStream(this.fps);
    
    // Configure MediaRecorder options based on quality
    const options: MediaRecorderOptions = {
      mimeType: 'video/webm;codecs=vp9', // VP9 for better compression
      videoBitsPerSecond: this.getVideoBitrate()
    };

    // Fallback to VP8 if VP9 not supported
    if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
      options.mimeType = 'video/webm;codecs=vp8';
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
  private getVideoBitrate(): number {
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
    
    try {
      // Setup and start recording
      this.setupMediaRecorder();
      this.startRecording();
      
      const totalFrames = this.calculateTotalFrames();
      const frameTime = 1 / this.fps; // Time per frame in seconds
      
      progressCallback?.(0, 'Starting export...');
      
      // Render each frame
      for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame * frameTime;
        
        // Render frame to canvas
        await this.renderFrame(currentTime);
        
        // Update progress
        const progress = (frame / totalFrames) * 100;
        const status = `Rendering frame ${frame + 1} of ${totalFrames}`;
        progressCallback?.(progress, status);
        
        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      progressCallback?.(95, 'Finalizing video...');
      
      // Stop recording and get final blob
      const videoBlob = await this.stopRecording();
      
      progressCallback?.(100, 'Export complete!');
      
      return videoBlob;
      
    } catch (error) {
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
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.isExporting = false;
    this.isRecording = false;
  }

  // Check if export is in progress
  isExportInProgress(): boolean {
    return this.isExporting;
  }

  // Download video blob - adapted from zip-manager.ts downloadZipSafely
  async downloadVideo(blob: Blob, filename: string): Promise<void> {
    // Ensure filename has proper extension
    const finalFilename = filename.endsWith('.webm') ? filename : `${filename}.webm`;
    
    // Use modern File System Access API if available
    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: finalFilename,
          types: [{
            description: 'Video files',
            accept: { 'video/webm': ['.webm'] }
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