import { ExportEngine } from "./export-engine";
import { ExportSettings } from "@/types/export";
import { TimelineElement, TimelineTrack } from "@/types/timeline";
import { MediaItem } from "@/stores/media-store";

// Frame cache entry
interface CachedFrame {
  timestamp: number;
  imageData: ImageData;
  lastUsed: number;
}

// Render batch for optimization
interface RenderBatch {
  startFrame: number;
  endFrame: number;
  elements: Array<{
    element: TimelineElement;
    track: TimelineTrack;
    mediaItem: MediaItem | null;
  }>;
}

// Performance metrics
interface PerformanceMetrics {
  framesRendered: number;
  cacheHits: number;
  cacheMisses: number;
  averageFrameTime: number;
  totalRenderTime: number;
}

// Optimized export engine with caching and performance improvements
export class OptimizedExportEngine extends ExportEngine {
  private frameCache = new Map<string, CachedFrame>();
  private maxCacheSize = 50; // Maximum frames to cache
  private preloadedImages = new Map<string, HTMLImageElement>();
  private offscreenCanvas: OffscreenCanvas | null = null;
  private offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;
  private renderBatches: RenderBatch[] = [];
  private metrics: PerformanceMetrics = {
    framesRendered: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageFrameTime: 0,
    totalRenderTime: 0
  };

  constructor(
    canvas: HTMLCanvasElement,
    settings: ExportSettings,
    tracks: TimelineTrack[],
    mediaItems: MediaItem[],
    totalDuration: number
  ) {
    super(canvas, settings, tracks, mediaItems, totalDuration);
    this.initializeOptimizations();
  }

  // Initialize optimization features
  private initializeOptimizations(): void {
    this.setupOffscreenCanvas();
    this.preloadMediaAssets();
    this.analyzeBatches();
  }

  // Set up offscreen canvas for better performance
  private setupOffscreenCanvas(): void {
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        this.offscreenCanvas = new OffscreenCanvas(
          this.canvas.width,
          this.canvas.height
        );
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        console.log('OptimizedExportEngine: OffscreenCanvas initialized');
      } catch (error) {
        console.warn('OptimizedExportEngine: OffscreenCanvas not available:', error);
      }
    }
  }

  // Preload all media assets for faster rendering
  private async preloadMediaAssets(): Promise<void> {
    const imagePromises: Promise<void>[] = [];

    for (const mediaItem of this.mediaItems) {
      if (mediaItem.type === 'image' && mediaItem.url) {
        const promise = new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            this.preloadedImages.set(mediaItem.id, img);
            resolve();
          };
          img.onerror = () => {
            console.warn(`Failed to preload image: ${mediaItem.url}`);
            resolve(); // Continue even if one image fails
          };
          img.src = mediaItem.url!;
        });
        imagePromises.push(promise);
      }
    }

    try {
      await Promise.all(imagePromises);
      console.log(`OptimizedExportEngine: Preloaded ${this.preloadedImages.size} images`);
    } catch (error) {
      console.warn('OptimizedExportEngine: Some images failed to preload:', error);
    }
  }

  // Analyze timeline to create optimized render batches
  private analyzeBatches(): void {
    const totalFrames = this.calculateTotalFrames();
    const batchSize = 30; // Process 30 frames at a time

    for (let startFrame = 0; startFrame < totalFrames; startFrame += batchSize) {
      const endFrame = Math.min(startFrame + batchSize, totalFrames);
      const batch: RenderBatch = {
        startFrame,
        endFrame,
        elements: []
      };

      // Find elements active in this batch timespan
      const startTime = startFrame / this.getFrameRate();
      const endTime = endFrame / this.getFrameRate();

      this.tracks.forEach(track => {
        track.elements.forEach(element => {
          if (element.hidden) return;

          const elementStart = element.startTime;
          const elementEnd = element.startTime + 
            (element.duration - element.trimStart - element.trimEnd);

          // Check if element overlaps with batch timespan
          if (elementStart < endTime && elementEnd > startTime) {
            const mediaItem = element.type === 'media' && element.mediaId !== 'test'
              ? this.mediaItems.find(item => item.id === element.mediaId) || null
              : null;

            batch.elements.push({ element, track, mediaItem });
          }
        });
      });

      this.renderBatches.push(batch);
    }

    console.log(`OptimizedExportEngine: Created ${this.renderBatches.length} render batches`);
  }

  // Override renderFrame with caching and optimization
  async renderFrame(currentTime: number): Promise<void> {
    const frameStartTime = performance.now();
    const cacheKey = this.getFrameCacheKey(currentTime);

    // Check if export was cancelled (access parent's abortController through protected method)
    if (this.isExportCancelled()) {
      throw new Error('Export cancelled by user');
    }

    // Check cache first
    const cached = this.frameCache.get(cacheKey);
    if (cached) {
      cached.lastUsed = Date.now();
      this.restoreFromCache(cached.imageData);
      this.metrics.cacheHits++;
      return;
    }

    // Render frame using optimized pipeline
    await this.renderFrameOptimized(currentTime);

    // Cache the result if cache has space
    if (this.frameCache.size < this.maxCacheSize) {
      this.cacheCurrentFrame(cacheKey);
    } else {
      this.evictOldestFrame();
      this.cacheCurrentFrame(cacheKey);
    }

    this.metrics.cacheMisses++;
    this.metrics.framesRendered++;
    
    const frameTime = performance.now() - frameStartTime;
    this.updatePerformanceMetrics(frameTime);
  }

  // Optimized frame rendering pipeline
  private async renderFrameOptimized(currentTime: number): Promise<void> {
    const renderCtx = this.offscreenCtx || this.ctx;
    const renderCanvas = this.offscreenCanvas || this.canvas;

    // Clear canvas
    renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
    
    // Fill with background color
    renderCtx.fillStyle = "#000000";
    renderCtx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);

    // Get active elements with optimized lookup
    const activeElements = this.getActiveElementsOptimized(currentTime);
    
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

    // Batch render similar elements
    const imageBatch: Array<{element: TimelineElement, mediaItem: MediaItem}> = [];
    const textBatch: TimelineElement[] = [];

    for (const { element, mediaItem } of sortedElements) {
      if (element.type === "media" && mediaItem && mediaItem.type === "image") {
        imageBatch.push({ element, mediaItem });
      } else if (element.type === "text") {
        textBatch.push(element);
      }
      // Handle other types individually for now
      else if (element.type === "media" && mediaItem && mediaItem.type === "video") {
        await this.renderVideoElementOptimized(element, mediaItem, currentTime - element.startTime, renderCtx);
      }
    }

    // Batch render images
    if (imageBatch.length > 0) {
      await this.renderImageBatch(imageBatch, renderCtx);
    }

    // Batch render text
    if (textBatch.length > 0) {
      this.renderTextBatch(textBatch, renderCtx);
    }

    // Copy from offscreen canvas to main canvas if using offscreen
    if (this.offscreenCanvas && this.offscreenCtx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.offscreenCanvas, 0, 0);
    }
  }

  // Optimized active elements lookup
  private getActiveElementsOptimized(currentTime: number) {
    const activeElements: Array<{
      element: TimelineElement;
      track: TimelineTrack;
      mediaItem: MediaItem | null;
    }> = [];

    // Find which batch this time falls into for optimization
    const frameNumber = Math.floor(currentTime * this.getFrameRate());
    const batch = this.renderBatches.find(b => 
      frameNumber >= b.startFrame && frameNumber < b.endFrame
    );

    const elementsToCheck = batch ? batch.elements : this.getAllElements();

    for (const { element, track, mediaItem } of elementsToCheck) {
      if (element.hidden) continue;
      
      const elementStart = element.startTime;
      const elementEnd = element.startTime + 
        (element.duration - element.trimStart - element.trimEnd);

      if (currentTime >= elementStart && currentTime < elementEnd) {
        activeElements.push({ element, track, mediaItem });
      }
    }

    return activeElements;
  }

  // Get all elements (fallback when batches don't work)
  private getAllElements() {
    const allElements: Array<{
      element: TimelineElement;
      track: TimelineTrack;
      mediaItem: MediaItem | null;
    }> = [];

    this.tracks.forEach(track => {
      track.elements.forEach(element => {
        let mediaItem = null;
        if (element.type === "media" && element.mediaId !== "test") {
          mediaItem = this.mediaItems.find(item => item.id === element.mediaId) || null;
        }
        allElements.push({ element, track, mediaItem });
      });
    });

    return allElements;
  }

  // Batch render images for better performance
  private async renderImageBatch(
    imageBatch: Array<{element: TimelineElement, mediaItem: MediaItem}>,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ): Promise<void> {
    for (const { element, mediaItem } of imageBatch) {
      const preloadedImg = this.preloadedImages.get(mediaItem.id);
      if (preloadedImg) {
        const bounds = this.calculateElementBounds(element, preloadedImg.width, preloadedImg.height);
        ctx.drawImage(preloadedImg, bounds.x, bounds.y, bounds.width, bounds.height);
      } else {
        // Fallback to regular loading
        await this.renderImageElement(element, mediaItem, ctx);
      }
    }
  }

  // Batch render text elements
  private renderTextBatch(
    textBatch: TimelineElement[],
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ): void {
    // Group by similar styling to reduce context changes
    const styleGroups = new Map<string, TimelineElement[]>();

    for (const element of textBatch) {
      if (element.type !== "text") continue;
      
      const styleKey = `${element.fontFamily}-${element.fontSize}-${element.color}`;
      if (!styleGroups.has(styleKey)) {
        styleGroups.set(styleKey, []);
      }
      styleGroups.get(styleKey)!.push(element);
    }

    // Render each style group
    for (const [styleKey, elements] of styleGroups) {
      const firstElement = elements[0];
      if (firstElement.type !== "text") continue;

      // Set style once for the group
      ctx.fillStyle = firstElement.color || "#ffffff";
      ctx.font = `${firstElement.fontSize || 24}px ${firstElement.fontFamily || "Arial"}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      // Render all elements with this style
      for (const element of elements) {
        if (element.type !== "text" || !element.content?.trim()) continue;
        const x = element.x || 50;
        const y = element.y || 50;
        ctx.fillText(element.content, x, y);
      }
    }
  }

  // Optimized image rendering
  private async renderImageElement(
    element: TimelineElement,
    mediaItem: MediaItem,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ): Promise<void> {
    if (!mediaItem.url) return;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        try {
          const bounds = this.calculateElementBounds(element, img.width, img.height);
          ctx.drawImage(img, bounds.x, bounds.y, bounds.width, bounds.height);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error(`Failed to load image: ${mediaItem.url || 'unknown'}`));
      img.src = mediaItem.url || '';
    });
  }

  // Optimized video rendering (placeholder for future enhancement)
  private async renderVideoElementOptimized(
    element: TimelineElement,
    mediaItem: MediaItem,
    timeOffset: number,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  ): Promise<void> {
    if (!mediaItem.url) return;

    try {
      const video = document.createElement('video');
      video.src = mediaItem.url;
      video.crossOrigin = 'anonymous';
      
      // Wait for video to load
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video'));
      });
      
      // Seek to the correct time
      video.currentTime = timeOffset + element.trimStart;
      
      // Wait for seek to complete
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
      
      // Calculate bounds
      const { x, y, width, height } = this.calculateElementBounds(
        element, 
        video.videoWidth, 
        video.videoHeight
      );
      
      // Draw video frame to canvas
      ctx.drawImage(video, x, y, width, height);
      
      // Clean up
      video.remove();
      
    } catch (error) {
      console.error('Failed to render video:', error);
    }
  }

  // Frame caching methods
  private getFrameCacheKey(currentTime: number): string {
    // Create cache key based on time and active elements
    const frameNumber = Math.floor(currentTime * this.getFrameRate());
    return `frame_${frameNumber}`;
  }

  private cacheCurrentFrame(cacheKey: string): void {
    try {
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.frameCache.set(cacheKey, {
        timestamp: Date.now(),
        imageData: imageData,
        lastUsed: Date.now()
      });
    } catch (error) {
      console.warn('Failed to cache frame:', error);
    }
  }

  private restoreFromCache(imageData: ImageData): void {
    this.ctx.putImageData(imageData, 0, 0);
  }

  private evictOldestFrame(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, cached] of this.frameCache) {
      if (cached.lastUsed < oldestTime) {
        oldestTime = cached.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.frameCache.delete(oldestKey);
    }
  }

  // Performance metrics
  private updatePerformanceMetrics(frameTime: number): void {
    this.metrics.totalRenderTime += frameTime;
    this.metrics.averageFrameTime = this.metrics.totalRenderTime / this.metrics.framesRendered;
  }

  // Get performance metrics
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  // Clear cache (useful for memory management)
  clearCache(): void {
    this.frameCache.clear();
    this.metrics.cacheHits = 0;
    this.metrics.cacheMisses = 0;
  }

  // Cleanup resources
  cleanup(): void {
    this.clearCache();
    this.preloadedImages.clear();
    if (this.offscreenCanvas) {
      // OffscreenCanvas doesn't need explicit cleanup but clear reference
      this.offscreenCanvas = null;
      this.offscreenCtx = null;
    }
  }
}