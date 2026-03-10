import { ExportEngine } from "./export-engine";
import type { ExportSettings, ExportSettingsWithAudio } from "@/types/export";
import { TimelineTrack } from "@/types/timeline";
import { MediaItem } from "@/stores/media/media-store";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { platform } from "@qcut/platform-core";

// Engine types available
export const ExportEngineType = {
	STANDARD: "standard",
	OPTIMIZED: "optimized",
	WEBCODECS: "webcodecs",
	FFMPEG: "ffmpeg",
	CLI: "cli",
	REMOTION: "remotion",
} as const;

export type ExportEngineType =
	(typeof ExportEngineType)[keyof typeof ExportEngineType];

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
	estimatedPerformance: "high" | "medium" | "low";
}

export class ExportEngineFactory {
	private static instance: ExportEngineFactory;
	private capabilities: BrowserCapabilities | null = null;

	// Singleton pattern for factory
	static getInstance(): ExportEngineFactory {
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
			performanceScore: await this.calculatePerformanceScore(),
		};

		this.capabilities = capabilities;
		return capabilities;
	}

	// Get engine recommendation based on capabilities and requirements
	async getEngineRecommendation(
		settings: ExportSettings,
		duration: number,
		complexity: "low" | "medium" | "high" = "medium",
		tracks?: TimelineTrack[]
	): Promise<EngineRecommendation> {
		// Auto-select Remotion engine when timeline contains Remotion elements
		// Check before detectCapabilities() to avoid unnecessary browser API calls
		if (tracks) {
			const hasRemotionElements = tracks.some(
				(t) => t.type === "remotion" && t.elements.length > 0
			);
			if (hasRemotionElements) {
				debugLog(
					"[ExportEngineFactory] 🎬 Remotion engine auto-selected (timeline has Remotion elements)"
				);
				// Use cached capabilities if available, otherwise detect
				const capabilities =
					this.capabilities ?? (await this.detectCapabilities());
				return {
					engineType: ExportEngineType.REMOTION,
					reason:
						"Timeline contains Remotion elements — using Remotion export engine for frame pre-rendering and compositing",
					capabilities,
					estimatedPerformance: "medium",
				};
			}
		}

		const capabilities = await this.detectCapabilities();

		// 🚀 FORCE CLI FFmpeg in Electron - most stable and performant
		// DEBUG OVERRIDE: Allow forcing regular engine for sticker debugging
		const forceRegularEngine =
			localStorage.getItem("qcut_force_regular_engine") === "true";

		console.log("🔍 EXPORT ENGINE DEBUG - Starting engine selection:");
		console.log("  - Force regular engine override:", forceRegularEngine);
		console.log("  - Is Electron environment:", this.isElectron());
		console.log("  - Platform isElectron:", platform().isElectron);
		console.log(
			"  - FFmpeg CLI available:",
			typeof platform().ffmpeg.exportVideoCLI === "function"
		);

		if (forceRegularEngine) {
			debugLog(
				"[ExportEngineFactory] 🔧 DEBUG OVERRIDE: Forcing regular export engine for sticker debugging"
			);
			console.log(
				"⚠️ EXPORT ENGINE: Using regular engine due to debug override"
			);
		}

		if (this.isElectron() && !forceRegularEngine) {
			debugLog(
				"[ExportEngineFactory] 🖥️  Electron detected - using CLI FFmpeg (most stable)"
			);
			console.log(
				"🚀 EXPORT ENGINE SELECTION: CLI FFmpeg chosen for Electron environment"
			);
			console.log("  - Reason: Native FFmpeg provides best performance");
			console.log("  - Expected performance: HIGH");
			return {
				engineType: ExportEngineType.CLI,
				reason:
					"Electron environment - using native CLI FFmpeg for best performance and stability",
				capabilities,
				estimatedPerformance: "high",
			};
		}

		// Calculate memory requirements for browser environments
		const estimatedMemoryGB = this.estimateMemoryRequirements(
			settings,
			duration
		);

		// High-end system with modern APIs (browser only)
		if (
			capabilities.hasWebCodecs &&
			capabilities.deviceMemoryGB >= 16 &&
			capabilities.performanceScore >= 80 &&
			estimatedMemoryGB < capabilities.deviceMemoryGB * 0.4
		) {
			console.log(
				"🚀 EXPORT ENGINE SELECTION: WebCodecs chosen for high-end browser"
			);
			return {
				engineType: ExportEngineType.WEBCODECS,
				reason: "High-performance browser system with WebCodecs support",
				capabilities,
				estimatedPerformance: "high",
			};
		}

		// REMOVED: FFmpeg WASM engine - disabled due to timeout issues
		// Now falls through to Optimized or Standard engine for browsers

		// Browser fallback - optimized engine if available
		if (capabilities.hasOffscreenCanvas && capabilities.hasWorkers) {
			console.log(
				"🚀 EXPORT ENGINE SELECTION: Optimized Canvas chosen for modern browser"
			);
			console.log("  - Reason: Not in Electron, using browser Canvas APIs");
			console.log("  - Has OffscreenCanvas:", capabilities.hasOffscreenCanvas);
			console.log("  - Has Workers:", capabilities.hasWorkers);
			console.log("  ⚠️ NOT USING FFMPEG - Browser environment detected");
			return {
				engineType: ExportEngineType.OPTIMIZED,
				reason: "Browser with modern Canvas APIs",
				capabilities,
				estimatedPerformance: "medium",
			};
		}

		// Final fallback to standard engine for maximum compatibility
		console.log(
			"🚀 EXPORT ENGINE SELECTION: Standard Canvas chosen as final fallback"
		);
		console.log("  - Reason: Limited browser capabilities");
		console.log("  - Performance score:", capabilities.performanceScore);
		console.log("  ⚠️ NOT USING FFMPEG - Using fallback Canvas engine");
		return {
			engineType: ExportEngineType.STANDARD,
			reason: "Using standard engine for maximum browser compatibility",
			capabilities,
			estimatedPerformance:
				capabilities.performanceScore >= 40 ? "medium" : "low",
		};
	}

	// Create engine instance based on recommendation or type
	async createEngine(
		canvas: HTMLCanvasElement,
		settings: ExportSettingsWithAudio,
		tracks: TimelineTrack[],
		mediaItems: MediaItem[],
		totalDuration: number,
		engineType?: ExportEngineType
	): Promise<ExportEngine> {
		console.log("🏗️ EXPORT ENGINE CREATION - Starting engine creation:");
		console.log("  - Requested engine type:", engineType || "auto-select");
		console.log("  - Total duration:", totalDuration);
		console.log("  - Export settings:", settings);

		let selectedEngineType = engineType;
		if (!selectedEngineType) {
			console.log("  - No engine type specified, getting recommendation...");
			const recommendation = await this.getEngineRecommendation(
				settings,
				totalDuration,
				"medium",
				tracks
			);
			selectedEngineType = recommendation.engineType;
			console.log("  - Recommended engine:", selectedEngineType);
			console.log("  - Recommendation reason:", recommendation.reason);
		}

		console.log(
			`🏗️ EXPORT ENGINE CREATION: Creating ${selectedEngineType} engine instance`
		);

		switch (selectedEngineType) {
			case ExportEngineType.OPTIMIZED:
				// Import optimized engine dynamically
				try {
					const { OptimizedExportEngine } = await import(
						"./export-engine-optimized"
					);
					return new OptimizedExportEngine(
						canvas,
						settings,
						tracks,
						mediaItems,
						totalDuration
					);
				} catch (error) {
					debugWarn(
						"Failed to load optimized engine, falling back to standard:",
						error
					);
					return new ExportEngine(
						canvas,
						settings,
						tracks,
						mediaItems,
						totalDuration
					);
				}

			case ExportEngineType.FFMPEG:
				// FFmpeg WASM engine removed - fall back to Standard engine
				console.log(
					"🚀 EXPORT ENGINE CREATION: FFmpeg WASM removed, using Standard engine instead"
				);
				return new ExportEngine(
					canvas,
					settings,
					tracks,
					mediaItems,
					totalDuration
				);

			case ExportEngineType.CLI:
				// Native FFmpeg CLI engine (Electron only)
				console.log(
					"📌 CLI ENGINE SELECTED - Checking Electron availability..."
				);
				if (this.isElectron()) {
					try {
						console.log("✅ Electron detected - Loading CLI FFmpeg engine");
						console.log("  - platform isElectron:", platform().isElectron);
						console.log(
							"  - ffmpeg.exportVideoCLI available:",
							typeof platform().ffmpeg.exportVideoCLI === "function"
						);

						debugLog(
							"[ExportEngineFactory] 🚀 Loading CLI FFmpeg engine for Electron"
						);
						console.log(
							"🏗️ EXPORT ENGINE CREATION: Creating CLI engine with effects support"
						);
						const { CLIExportEngine } = await import("./export-engine-cli");
						console.log("✅ CLI Export Engine module loaded successfully");

						// Get effects store for CLI engine
						const effectsStore = useEffectsStore.getState();
						console.log("📦 Export: Effects store available:", !!effectsStore);

						const cliEngine = new CLIExportEngine(
							canvas,
							settings,
							tracks,
							mediaItems,
							totalDuration,
							effectsStore // NEW: Pass effects store
						);
						console.log(
							"🚀 SUCCESS: CLI FFmpeg engine created and ready to use"
						);
						return cliEngine;
					} catch (error) {
						debugError(
							"[ExportEngineFactory] ❌ Failed to load CLI engine:",
							error
						);
						console.error(
							"❌ CLI ENGINE FAILED: Falling back to Standard Canvas engine"
						);
						console.error(
							"❌ Reason:",
							error instanceof Error ? error.message : String(error)
						);
						console.error("❌ Full error details:", error);
						debugLog(
							"[ExportEngineFactory] 🔄 Falling back to Standard Canvas engine"
						);
						// FFmpeg WASM removed - use Standard engine as fallback
						console.log(
							"⚠️ FALLBACK: Using Standard Canvas engine instead of FFmpeg"
						);
						return new ExportEngine(
							canvas,
							settings,
							tracks,
							mediaItems,
							totalDuration
						);
					}
				} else {
					console.log(
						"🌐 BROWSER ENVIRONMENT: Using Standard Canvas engine (CLI not available in browser)"
					);
					console.log("  - isElectron() returned false");
					console.log("  - platform isElectron:", platform().isElectron);
					console.log("  ⚠️ NOT USING FFMPEG - Browser environment detected");
					debugWarn(
						"[ExportEngineFactory] ⚠️  CLI engine only available in Electron, using Standard engine for browser"
					);
					return new ExportEngine(
						canvas,
						settings,
						tracks,
						mediaItems,
						totalDuration
					);
				}

			case ExportEngineType.WEBCODECS:
				// Future: WebCodecs engine
				debugLog(
					"WebCodecs engine not yet implemented, using optimized engine"
				);
				try {
					const { OptimizedExportEngine } = await import(
						"./export-engine-optimized"
					);
					return new OptimizedExportEngine(
						canvas,
						settings,
						tracks,
						mediaItems,
						totalDuration
					);
				} catch (error) {
					return new ExportEngine(
						canvas,
						settings,
						tracks,
						mediaItems,
						totalDuration
					);
				}

			case ExportEngineType.REMOTION:
				// Remotion export engine for timelines with Remotion elements
				console.log(
					"🎬 REMOTION ENGINE SELECTED - Creating Remotion export engine..."
				);
				try {
					const { RemotionExportEngine, requiresRemotionExport } = await import(
						"../remotion/export-engine-remotion"
					);

					// Verify timeline actually has Remotion elements
					if (!requiresRemotionExport(tracks)) {
						console.log(
							"⚠️ No Remotion elements found, falling back to Standard engine"
						);
						return new ExportEngine(
							canvas,
							settings,
							tracks,
							mediaItems,
							totalDuration
						);
					}

					console.log("✅ Creating Remotion export engine");
					return new RemotionExportEngine(
						canvas,
						settings,
						tracks,
						mediaItems,
						totalDuration
					);
				} catch (error) {
					debugError(
						"[ExportEngineFactory] Failed to load Remotion engine:",
						error
					);
					console.error(
						"❌ Remotion engine failed, falling back to Standard engine"
					);
					return new ExportEngine(
						canvas,
						settings,
						tracks,
						mediaItems,
						totalDuration
					);
				}

			default:
				console.log(
					"🏗️ EXPORT ENGINE CREATION: Creating Standard Canvas engine (default case)"
				);
				return new ExportEngine(
					canvas,
					settings,
					tracks,
					mediaItems,
					totalDuration
				);
		}
	}

	// Browser capability detection methods
	private detectWebCodecs(): boolean {
		return (
			typeof VideoEncoder !== "undefined" &&
			typeof VideoDecoder !== "undefined" &&
			typeof VideoFrame !== "undefined"
		);
	}

	private detectOffscreenCanvas(): boolean {
		return typeof OffscreenCanvas !== "undefined";
	}

	private detectWorkers(): boolean {
		return typeof Worker !== "undefined" && typeof SharedWorker !== "undefined";
	}

	private detectSharedArrayBuffer(): boolean {
		return typeof SharedArrayBuffer !== "undefined";
	}

	private detectDeviceMemory(): number {
		// Use navigator.deviceMemory if available (Chrome/Edge)
		if ("deviceMemory" in navigator) {
			return (navigator as any).deviceMemory;
		}

		// Fallback estimation based on other factors
		const screenPixels = window.screen.width * window.screen.height;
		const isHighRes = screenPixels > 2_073_600; // > 1920x1080
		const hardwareConcurrency = navigator.hardwareConcurrency || 4;

		// Rough estimation
		if (isHighRes && hardwareConcurrency >= 8) {
			return 16; // High-end device
		}
		if (hardwareConcurrency >= 4) {
			return 8; // Mid-range device
		}
		return 4; // Low-end device
	}

	private async detectMaxTextureSize(): Promise<number> {
		try {
			const canvas = document.createElement("canvas");
			const gl =
				canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
			if (gl) {
				return (gl as WebGLRenderingContext).getParameter(
					(gl as WebGLRenderingContext).MAX_TEXTURE_SIZE
				);
			}
		} catch (error) {
			debugWarn("Failed to detect max texture size:", error);
		}
		return 4096; // Safe default
	}

	private detectSupportedCodecs(): string[] {
		const codecs = [
			"video/webm;codecs=vp9",
			"video/webm;codecs=vp8",
			"video/mp4;codecs=h264",
			"video/mp4;codecs=avc1.42E01E",
			"video/quicktime",
		];

		return codecs.filter((codec) => MediaRecorder.isTypeSupported(codec));
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
			const canvas = document.createElement("canvas");
			canvas.width = 1920;
			canvas.height = 1080;
			const ctx = canvas.getContext("2d");

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
					100,
					100
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

	private estimateMemoryRequirements(
		settings: ExportSettings,
		duration: number
	): number {
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

	// FFmpeg WASM export has been removed - this method is deprecated
	static async isFFmpegAvailable(): Promise<boolean> {
		// Always return false as FFmpeg WASM export is disabled
		return false;
	}

	// Check if running in Electron environment
	private isElectron(): boolean {
		const p = platform();
		const isElectron = p.isElectron;

		console.log("🔍 DETAILED ELECTRON DETECTION:");
		console.log("  - platform.isElectron:", isElectron);

		if (isElectron) {
			console.log("  - ffmpeg exists:", !!p.ffmpeg);
			if (p.ffmpeg) {
				console.log("  - exportVideoCLI type:", typeof p.ffmpeg.exportVideoCLI);
			}
		}

		// Check for specific FFmpeg CLI method availability
		const hasFFmpegCLI =
			isElectron && p.ffmpeg && typeof p.ffmpeg.exportVideoCLI === "function";

		console.log(
			`🔍 ENVIRONMENT CHECK: isElectron: ${isElectron}, ffmpeg.exportVideoCLI: ${typeof p.ffmpeg?.exportVideoCLI}`
		);
		console.log(`🔍 ENVIRONMENT CHECK: isElectron result: ${hasFFmpegCLI}`);

		if (!hasFFmpegCLI) {
			console.log("⚠️ NOT DETECTED AS ELECTRON - Missing requirements:");
			if (!isElectron) {
				console.log("  - platform.isElectron is false");
			} else if (!p.ffmpeg) {
				console.log("  - platform.ffmpeg is not defined");
			} else if (typeof p.ffmpeg.exportVideoCLI !== "function") {
				console.log("  - platform.ffmpeg.exportVideoCLI is not a function");
			}
		}

		return hasFFmpegCLI;
	}
}
