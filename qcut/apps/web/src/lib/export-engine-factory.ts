import { ExportEngine } from "./export-engine";
import { ExportSettings } from "@/types/export";
import { TimelineTrack } from "@/types/timeline";
import { MediaItem } from "@/stores/media-store";

// Engine types available
export enum ExportEngineType {
  STANDARD = "standard",
  OPTIMIZED = "optimized",
  WEBCODECS = "webcodecs"
}

// Browser capability detection results
export interface BrowserCapabilities {
  hasWebCodecs: boolean;
  hasOffscreenCanvas: boolean;
  hasWorkers: boolean;
  hasSharedArrayBuffer: boolean;
  deviceMemoryGB: number;
  maxTextureSize: number;
  supportedCodecs: string[];
  performanceScore: number; // 0-100 scale
}

// Engine recommendation based on capabilities
export interface EngineRecommendation {
  engineType: ExportEngineType;
  reason: string;
  capabilities: BrowserCapabilities;
  estimatedPerformance: 'high' | 'medium' | 'low';
}

export class ExportEngineFactory {
  private static instance: ExportEngineFactory;
  private capabilities: BrowserCapabilities | null = null;

  // Singleton pattern for factory
  public static getInstance(): ExportEngineFactory {
    if (!ExportEngineFactory.instance) {
      ExportEngineFactory.instance = new ExportEngineFactory();
    }
    return ExportEngineFactory.instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  // Detect browser capabilities
  async detectCapabilities(): Promise<BrowserCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    const capabilities: BrowserCapabilities = {
      hasWebCodecs: this.detectWebCodecs(),
      hasOffscreenCanvas: this.detectOffscreenCanvas(),
      hasWorkers: this.detectWorkers(),
      hasSharedArrayBuffer: this.detectSharedArrayBuffer(),
      deviceMemoryGB: this.detectDeviceMemory(),
      maxTextureSize: await this.detectMaxTextureSize(),
      supportedCodecs: this.detectSupportedCodecs(),
      performanceScore: await this.calculatePerformanceScore()
    };

    this.capabilities = capabilities;
    return capabilities;
  }

  // Get engine recommendation based on capabilities and requirements
  async getEngineRecommendation(
    settings: ExportSettings,
    duration: number,
    complexity: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<EngineRecommendation> {
    const capabilities = await this.detectCapabilities();
    
    // Calculate memory requirements
    const estimatedMemoryGB = this.estimateMemoryRequirements(settings, duration);
    
    // High-end system with modern APIs
    if (capabilities.hasWebCodecs && 
        capabilities.deviceMemoryGB >= 16 && 
        capabilities.performanceScore >= 80 &&
        estimatedMemoryGB < capabilities.deviceMemoryGB * 0.4) {
      return {
        engineType: ExportEngineType.WEBCODECS,
        reason: 'High-performance system with WebCodecs support',
        capabilities,
        estimatedPerformance: 'high'
      };
    }

    // Mid-range system - use optimized engine if available
    if (capabilities.hasOffscreenCanvas && 
        capabilities.hasWorkers &&
        capabilities.deviceMemoryGB >= 8 &&
        capabilities.performanceScore >= 60) {
      return {
        engineType: ExportEngineType.OPTIMIZED,
        reason: 'Good performance system with modern Canvas APIs',
        capabilities,
        estimatedPerformance: 'medium'
      };
    }

    // Default to standard engine for compatibility
    return {
      engineType: ExportEngineType.STANDARD,
      reason: 'Using standard engine for maximum compatibility',
      capabilities,
      estimatedPerformance: capabilities.performanceScore >= 40 ? 'medium' : 'low'
    };
  }

  // Create engine instance based on recommendation or type
  async createEngine(
    canvas: HTMLCanvasElement,
    settings: ExportSettings,
    tracks: TimelineTrack[],
    mediaItems: MediaItem[],
    totalDuration: number,
    engineType?: ExportEngineType
  ): Promise<ExportEngine> {
    if (!engineType) {
      const recommendation = await this.getEngineRecommendation(settings, totalDuration);
      engineType = recommendation.engineType;
    }

    switch (engineType) {
      case ExportEngineType.OPTIMIZED:
        // Import optimized engine dynamically
        try {
          const { OptimizedExportEngine } = await import('./export-engine-optimized');
          return new OptimizedExportEngine(canvas, settings, tracks, mediaItems, totalDuration);
        } catch (error) {
          console.warn('Failed to load optimized engine, falling back to standard:', error);
          return new ExportEngine(canvas, settings, tracks, mediaItems, totalDuration);
        }

      case ExportEngineType.WEBCODECS:
        // Future: WebCodecs engine
        console.log('WebCodecs engine not yet implemented, using optimized engine');
        try {
          const { OptimizedExportEngine } = await import('./export-engine-optimized');
          return new OptimizedExportEngine(canvas, settings, tracks, mediaItems, totalDuration);
        } catch (error) {
          return new ExportEngine(canvas, settings, tracks, mediaItems, totalDuration);
        }

      case ExportEngineType.STANDARD:
      default:
        return new ExportEngine(canvas, settings, tracks, mediaItems, totalDuration);
    }
  }

  // Browser capability detection methods
  private detectWebCodecs(): boolean {
    return typeof VideoEncoder !== 'undefined' && 
           typeof VideoDecoder !== 'undefined' &&
           typeof VideoFrame !== 'undefined';
  }

  private detectOffscreenCanvas(): boolean {
    return typeof OffscreenCanvas !== 'undefined';
  }

  private detectWorkers(): boolean {
    return typeof Worker !== 'undefined' && typeof SharedWorker !== 'undefined';
  }

  private detectSharedArrayBuffer(): boolean {
    return typeof SharedArrayBuffer !== 'undefined';
  }

  private detectDeviceMemory(): number {
    // Use navigator.deviceMemory if available (Chrome/Edge)
    if ('deviceMemory' in navigator) {
      return (navigator as any).deviceMemory;
    }
    
    // Fallback estimation based on other factors
    const screenPixels = window.screen.width * window.screen.height;
    const isHighRes = screenPixels > 2073600; // > 1920x1080
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    
    // Rough estimation
    if (isHighRes && hardwareConcurrency >= 8) {
      return 16; // High-end device
    } else if (hardwareConcurrency >= 4) {
      return 8; // Mid-range device
    } else {
      return 4; // Low-end device
    }
  }

  private async detectMaxTextureSize(): Promise<number> {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        return (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).MAX_TEXTURE_SIZE);
      }
    } catch (error) {
      console.warn('Failed to detect max texture size:', error);
    }
    return 4096; // Safe default
  }

  private detectSupportedCodecs(): string[] {
    const codecs = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8', 
      'video/mp4;codecs=h264',
      'video/mp4;codecs=avc1.42E01E',
      'video/quicktime'
    ];

    return codecs.filter(codec => MediaRecorder.isTypeSupported(codec));
  }

  private async calculatePerformanceScore(): Promise<number> {
    let score = 0;

    // Base score from hardware concurrency (0-30 points)
    const cores = navigator.hardwareConcurrency || 4;
    score += Math.min(cores * 3, 30);

    // Device memory score (0-25 points)
    const memoryGB = this.detectDeviceMemory();
    score += Math.min(memoryGB * 3, 25);

    // Canvas performance test (0-25 points)
    const canvasScore = await this.testCanvasPerformance();
    score += canvasScore;

    // Modern API support (0-20 points)
    if (this.detectWebCodecs()) score += 8;
    if (this.detectOffscreenCanvas()) score += 6;
    if (this.detectWorkers()) score += 4;
    if (this.detectSharedArrayBuffer()) score += 2;

    return Math.min(score, 100);
  }

  private async testCanvasPerformance(): Promise<number> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(10); // Low score if no 2D context
        return;
      }

      const startTime = performance.now();
      
      // Simple performance test - draw many rectangles
      for (let i = 0; i < 1000; i++) {
        ctx.fillStyle = `hsl(${i % 360}, 50%, 50%)`;
        ctx.fillRect(
          Math.random() * canvas.width,
          Math.random() * canvas.height,
          100, 100
        );
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Score based on performance (faster = higher score)
      // Under 50ms = 25 points, over 200ms = 5 points
      const score = Math.max(5, Math.min(25, 25 - (duration - 50) * 0.2));
      resolve(Math.round(score));
    });
  }

  private estimateMemoryRequirements(settings: ExportSettings, duration: number): number {
    // Simple memory estimation in GB
    const pixelsPerFrame = settings.width * settings.height;
    const bytesPerFrame = pixelsPerFrame * 4; // RGBA
    const framesPerSecond = 30;
    const totalFrames = duration * framesPerSecond;
    
    // Estimate buffer overhead (2x for double buffering + overhead)
    const estimatedBytes = bytesPerFrame * 2.5;
    return estimatedBytes / (1024 * 1024 * 1024); // Convert to GB
  }

  // Get current capabilities (cached)
  getCurrentCapabilities(): BrowserCapabilities | null {
    return this.capabilities;
  }

  // Force refresh capabilities
  async refreshCapabilities(): Promise<BrowserCapabilities> {
    this.capabilities = null;
    return this.detectCapabilities();
  }
}