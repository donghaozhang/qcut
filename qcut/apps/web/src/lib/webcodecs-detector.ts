// WebCodecs API detection and capability reporting

export interface WebCodecsSupportInfo {
  supported: boolean;
  version?: string;
  features: {
    videoEncoder: boolean;
    videoDecoder: boolean;
    videoFrame: boolean;
    encodedVideoChunk: boolean;
    decodedVideoChunk: boolean;
  };
  hardwareAcceleration: {
    available: boolean;
    encoders: string[];
    decoders: string[];
  };
  supportedCodecs: {
    encode: CodecSupport[];
    decode: CodecSupport[];
  };
  limitations: string[];
  performanceScore: number; // 0-100 scale
}

export interface CodecSupport {
  codec: string;
  profile?: string;
  level?: string;
  hardware: boolean;
  maxResolution?: {
    width: number;
    height: number;
  };
  maxFramerate?: number;
  supportScore: number; // 0-100, higher = better support
}

// Common codec configurations to test
const TEST_CODECS = [
  // H.264 variants
  { codec: 'avc1.42001E', name: 'H.264 Baseline' }, // 480p baseline
  { codec: 'avc1.42401E', name: 'H.264 Constrained Baseline' },
  { codec: 'avc1.4D401E', name: 'H.264 Main' }, // 720p main
  { codec: 'avc1.64001E', name: 'H.264 High' }, // 1080p high
  
  // VP9 variants
  { codec: 'vp09.00.10.08', name: 'VP9 Profile 0' }, // 8-bit
  { codec: 'vp09.01.20.08.01', name: 'VP9 Profile 1' },
  { codec: 'vp09.02.10.10.01.09.16.09.01', name: 'VP9 Profile 2 10-bit' },
  
  // VP8
  { codec: 'vp8', name: 'VP8' },
  
  // AV1 (next-gen)
  { codec: 'av01.0.04M.08', name: 'AV1 Main' },
  { codec: 'av01.0.05M.08', name: 'AV1 High' },
  
  // HEVC/H.265 (limited browser support)
  { codec: 'hev1.1.6.L93.B0', name: 'HEVC Main' },
  { codec: 'hvc1.1.6.L93.B0', name: 'HEVC Main (hvc1)' }
];

export class WebCodecsDetector {
  private static instance: WebCodecsDetector;
  private detectionCache: WebCodecsSupportInfo | null = null;
  private detectionPromise: Promise<WebCodecsSupportInfo> | null = null;

  // Singleton pattern
  public static getInstance(): WebCodecsDetector {
    if (!WebCodecsDetector.instance) {
      WebCodecsDetector.instance = new WebCodecsDetector();
    }
    return WebCodecsDetector.instance;
  }

  private constructor() {}

  // Main detection method
  async detectSupport(): Promise<WebCodecsSupportInfo> {
    // Return cached result if available
    if (this.detectionCache) {
      return this.detectionCache;
    }

    // Return existing promise if detection is in progress
    if (this.detectionPromise) {
      return this.detectionPromise;
    }

    // Start detection
    this.detectionPromise = this.performDetection();
    const result = await this.detectionPromise;
    
    // Cache the result
    this.detectionCache = result;
    return result;
  }

  private async performDetection(): Promise<WebCodecsSupportInfo> {
    const info: WebCodecsSupportInfo = {
      supported: false,
      features: {
        videoEncoder: false,
        videoDecoder: false,
        videoFrame: false,
        encodedVideoChunk: false,
        decodedVideoChunk: false
      },
      hardwareAcceleration: {
        available: false,
        encoders: [],
        decoders: []
      },
      supportedCodecs: {
        encode: [],
        decode: []
      },
      limitations: [],
      performanceScore: 0
    };

    try {
      // Check basic API availability
      info.features.videoEncoder = typeof VideoEncoder !== 'undefined';
      info.features.videoDecoder = typeof VideoDecoder !== 'undefined';
      info.features.videoFrame = typeof VideoFrame !== 'undefined';
      info.features.encodedVideoChunk = typeof EncodedVideoChunk !== 'undefined';
      info.features.decodedVideoChunk = typeof (globalThis as any).DecodedVideoChunk !== 'undefined';

      info.supported = info.features.videoEncoder && 
                      info.features.videoDecoder && 
                      info.features.videoFrame;

      if (!info.supported) {
        info.limitations.push('WebCodecs API not available in this browser');
        return info;
      }

      // Check for origin isolation requirement
      if (!this.checkOriginIsolation()) {
        info.limitations.push('Origin isolation required for optimal performance');
      }

      // Test codec support
      await this.testCodecSupport(info);

      // Test hardware acceleration
      await this.testHardwareAcceleration(info);

      // Calculate performance score
      info.performanceScore = this.calculatePerformanceScore(info);

      // Add any detected limitations
      this.detectLimitations(info);

    } catch (error) {
      console.warn('WebCodecs detection failed:', error);
      info.limitations.push(`Detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return info;
  }

  // Test codec encoding/decoding support
  private async testCodecSupport(info: WebCodecsSupportInfo): Promise<void> {
    const encodeTests = TEST_CODECS.map(async (codecInfo) => {
      try {
        const config = {
          codec: codecInfo.codec,
          width: 1920,
          height: 1080,
          bitrate: 5000000,
          framerate: 30
        };

        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) {
          const codecSupport: CodecSupport = {
            codec: codecInfo.codec,
            hardware: support.config?.acceleration === 'prefer-hardware',
            maxResolution: { width: 1920, height: 1080 },
            maxFramerate: 60,
            supportScore: this.calculateCodecScore(codecInfo.codec, true)
          };
          info.supportedCodecs.encode.push(codecSupport);

          if (codecSupport.hardware) {
            info.hardwareAcceleration.encoders.push(codecInfo.name);
          }
        }
      } catch (error) {
        // Codec not supported, skip
      }
    });

    const decodeTests = TEST_CODECS.map(async (codecInfo) => {
      try {
        const config = {
          codec: codecInfo.codec
        };

        const support = await VideoDecoder.isConfigSupported(config);
        if (support.supported) {
          const codecSupport: CodecSupport = {
            codec: codecInfo.codec,
            hardware: support.config?.acceleration === 'prefer-hardware',
            supportScore: this.calculateCodecScore(codecInfo.codec, false)
          };
          info.supportedCodecs.decode.push(codecSupport);

          if (codecSupport.hardware) {
            info.hardwareAcceleration.decoders.push(codecInfo.name);
          }
        }
      } catch (error) {
        // Codec not supported, skip
      }
    });

    await Promise.all([...encodeTests, ...decodeTests]);
    
    info.hardwareAcceleration.available = 
      info.hardwareAcceleration.encoders.length > 0 || 
      info.hardwareAcceleration.decoders.length > 0;
  }

  // Test hardware acceleration capabilities
  private async testHardwareAcceleration(info: WebCodecsSupportInfo): Promise<void> {
    try {
      // Test with hardware preference
      const hwConfig = {
        codec: 'avc1.42001E',
        width: 1920,
        height: 1080,
        bitrate: 5000000,
        framerate: 30,
        acceleration: 'prefer-hardware' as const
      };

      const hwSupport = await VideoEncoder.isConfigSupported(hwConfig);
      if (hwSupport.supported && hwSupport.config?.acceleration === 'prefer-hardware') {
        info.hardwareAcceleration.available = true;
      }
    } catch (error) {
      // Hardware acceleration test failed
      info.limitations.push('Hardware acceleration test failed');
    }
  }

  // Calculate codec support score
  private calculateCodecScore(codec: string, isEncoder: boolean): number {
    let score = 50; // Base score

    // Modern codecs get higher scores
    if (codec.includes('av01')) score += 30; // AV1
    else if (codec.includes('vp09')) score += 20; // VP9
    else if (codec.includes('avc1')) score += 10; // H.264
    else if (codec.includes('hev1') || codec.includes('hvc1')) score += 25; // HEVC

    // Encoding is generally harder than decoding
    if (isEncoder) score -= 10;

    return Math.min(100, Math.max(0, score));
  }

  // Calculate overall performance score
  private calculatePerformanceScore(info: WebCodecsSupportInfo): number {
    let score = 0;

    // Base support
    if (info.supported) score += 20;

    // Codec support
    score += Math.min(30, info.supportedCodecs.encode.length * 3);
    score += Math.min(20, info.supportedCodecs.decode.length * 2);

    // Hardware acceleration
    if (info.hardwareAcceleration.available) score += 20;
    score += Math.min(10, info.hardwareAcceleration.encoders.length * 2);

    // Penalty for limitations
    score -= info.limitations.length * 5;

    return Math.min(100, Math.max(0, score));
  }

  // Check origin isolation
  private checkOriginIsolation(): boolean {
    try {
      return typeof SharedArrayBuffer !== 'undefined' || 
             (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated);
    } catch {
      return false;
    }
  }

  // Detect various limitations
  private detectLimitations(info: WebCodecsSupportInfo): void {
    // Check for common limitations
    if (info.supportedCodecs.encode.length === 0) {
      info.limitations.push('No encoding codecs supported');
    }

    if (info.supportedCodecs.decode.length === 0) {
      info.limitations.push('No decoding codecs supported');
    }

    if (!info.hardwareAcceleration.available) {
      info.limitations.push('Hardware acceleration not available');
    }

    // Check browser-specific limitations
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('firefox')) {
      info.limitations.push('Firefox WebCodecs support may be limited');
    }

    if (userAgent.includes('safari')) {
      info.limitations.push('Safari WebCodecs support is experimental');
    }

    // Memory limitations
    if (typeof navigator.deviceMemory !== 'undefined' && navigator.deviceMemory < 4) {
      info.limitations.push('Low device memory may impact performance');
    }
  }

  // Get best encoder for given requirements
  getBestEncoder(width: number, height: number, framerate: number = 30): CodecSupport | null {
    if (!this.detectionCache?.supported) {
      return null;
    }

    const suitableCodecs = this.detectionCache.supportedCodecs.encode.filter(codec => {
      const maxRes = codec.maxResolution;
      const maxFps = codec.maxFramerate;
      
      return (!maxRes || (width <= maxRes.width && height <= maxRes.height)) &&
             (!maxFps || framerate <= maxFps);
    });

    if (suitableCodecs.length === 0) {
      return null;
    }

    // Sort by score (higher is better) and prefer hardware acceleration
    return suitableCodecs.sort((a, b) => {
      if (a.hardware !== b.hardware) {
        return a.hardware ? -1 : 1; // Hardware first
      }
      return b.supportScore - a.supportScore; // Higher score first
    })[0];
  }

  // Check if WebCodecs is recommended for given scenario
  isRecommendedFor(width: number, height: number, duration: number): boolean {
    if (!this.detectionCache?.supported) {
      return false;
    }

    // Only recommend for high-quality exports with hardware acceleration
    return this.detectionCache.hardwareAcceleration.available &&
           this.detectionCache.performanceScore >= 70 &&
           (width >= 1920 || height >= 1080) &&
           duration >= 5; // 5+ seconds
  }

  // Force refresh detection (useful for debugging)
  async refreshDetection(): Promise<WebCodecsSupportInfo> {
    this.detectionCache = null;
    this.detectionPromise = null;
    return this.detectSupport();
  }

  // Get cached result (synchronous)
  getCachedSupport(): WebCodecsSupportInfo | null {
    return this.detectionCache;
  }
}