/**
 * Remotion Pre-renderer
 *
 * Renders Remotion elements to frame sequences before final video export.
 * Supports both Electron-based rendering (via IPC) and browser-based
 * canvas capture as fallback.
 *
 * @module lib/remotion/pre-renderer
 */

import type { RemotionElement } from "@/types/timeline";
import { platform } from "@qcut/platform-core";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for pre-rendering Remotion elements
 */
export interface PreRenderConfig {
	/** Output directory for rendered frames */
	outputDir: string;
	/** Image format for frames */
	format: "png" | "jpeg";
	/** Quality for JPEG (0-100) */
	quality: number;
	/** Number of parallel render threads */
	concurrency: number;
	/** Resolution scale factor (1 = original size) */
	scale: number;
	/** Output width in pixels */
	width: number;
	/** Output height in pixels */
	height: number;
	/** Frames per second */
	fps: number;
}

/**
 * Result of pre-rendering a single element
 */
export interface PreRenderResult {
	/** ID of the rendered element */
	elementId: string;
	/** Map of frame numbers to file paths */
	framePaths: Map<number, string>;
	/** Path to extracted audio (if any) */
	audioPath?: string;
	/** Whether rendering succeeded */
	success: boolean;
	/** Error if rendering failed */
	error?: Error;
	/** Total frames rendered */
	totalFrames: number;
	/** Render duration in milliseconds */
	renderDuration: number;
}

/**
 * Progress callback for rendering
 */
export type PreRenderProgressCallback = (
	elementId: string,
	progress: number,
	currentFrame: number,
	totalFrames: number
) => void;

/**
 * Render mode - determines how frames are captured
 */
export type RenderMode = "electron" | "canvas";

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_PRE_RENDER_CONFIG: Omit<PreRenderConfig, "outputDir"> = {
	format: "jpeg",
	quality: 90,
	concurrency: 4,
	scale: 1,
	width: 1920,
	height: 1080,
	fps: 30,
};

// ============================================================================
// Pre-renderer Class
// ============================================================================

/**
 * Manages pre-rendering of Remotion elements to frame sequences
 */
export class RemotionPreRenderer {
	private config: PreRenderConfig;
	private mode: RenderMode;
	private abortController: AbortController | null = null;

	constructor(config: Partial<PreRenderConfig> & { outputDir: string }) {
		this.config = { ...DEFAULT_PRE_RENDER_CONFIG, ...config };
		this.mode = this.detectRenderMode();
	}

	/**
	 * Detect the appropriate render mode based on environment
	 */
	private detectRenderMode(): RenderMode {
		// Check if Electron API is available
		if (typeof window !== "undefined" && platform().remotion) {
			return "electron";
		}
		return "canvas";
	}

	/**
	 * Get the current render mode
	 */
	getRenderMode(): RenderMode {
		return this.mode;
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<PreRenderConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Pre-render a single Remotion element
	 */
	async preRenderElement(
		element: RemotionElement,
		onProgress?: PreRenderProgressCallback
	): Promise<PreRenderResult> {
		const startTime = Date.now();
		this.abortController = new AbortController();

		try {
			// Calculate total frames from element duration
			const totalFrames = Math.ceil(
				(element.duration - element.trimStart - element.trimEnd) *
					this.config.fps
			);

			if (totalFrames <= 0) {
				return {
					elementId: element.id,
					framePaths: new Map(),
					success: true,
					totalFrames: 0,
					renderDuration: Date.now() - startTime,
				};
			}

			// Render based on mode
			const framePaths =
				this.mode === "electron"
					? await this.renderWithElectron(element, totalFrames, onProgress)
					: await this.renderWithCanvas(element, totalFrames, onProgress);

			return {
				elementId: element.id,
				framePaths,
				success: true,
				totalFrames,
				renderDuration: Date.now() - startTime,
			};
		} catch (error) {
			return {
				elementId: element.id,
				framePaths: new Map(),
				success: false,
				error: error instanceof Error ? error : new Error(String(error)),
				totalFrames: 0,
				renderDuration: Date.now() - startTime,
			};
		}
	}

	/**
	 * Pre-render multiple Remotion elements
	 */
	async preRenderAll(
		elements: RemotionElement[],
		onProgress?: PreRenderProgressCallback
	): Promise<PreRenderResult[]> {
		const results: PreRenderResult[] = [];

		// Render elements sequentially to manage memory
		for (const element of elements) {
			if (this.abortController?.signal.aborted) {
				results.push({
					elementId: element.id,
					framePaths: new Map(),
					success: false,
					error: new Error("Rendering aborted"),
					totalFrames: 0,
					renderDuration: 0,
				});
				continue;
			}

			const result = await this.preRenderElement(element, onProgress);
			results.push(result);
		}

		return results;
	}

	/**
	 * Render using Electron IPC (preferred for quality)
	 */
	private async renderWithElectron(
		element: RemotionElement,
		totalFrames: number,
		onProgress?: PreRenderProgressCallback
	): Promise<Map<number, string>> {
		const framePaths = new Map<number, string>();
		const electronAPI = platform().remotion;

		if (!electronAPI) {
			throw new Error("Electron Remotion API not available");
		}

		// Register progress listener (IPC-safe event pattern)
		const cleanupProgress = electronAPI.onPreRenderProgress(
			(data: { elementId: string; frame: number }) => {
				if (data.elementId === element.id) {
					onProgress?.(
						element.id,
						(data.frame / totalFrames) * 100,
						data.frame,
						totalFrames
					);
				}
			}
		);

		// Call Electron to render frames
		const result = await electronAPI.preRender({
			elementId: element.id,
			componentId: element.componentId,
			props: element.props,
			outputDir: this.config.outputDir,
			format: this.config.format,
			quality: this.config.quality,
			width: this.config.width,
			height: this.config.height,
			fps: this.config.fps,
			totalFrames,
		});

		// Clean up progress listener
		cleanupProgress();

		// Convert result to Map
		if (result.frames) {
			for (const [frame, path] of Object.entries(result.frames)) {
				framePaths.set(parseInt(frame, 10), path as string);
			}
		}

		return framePaths;
	}

	/**
	 * Render using canvas capture (fallback for browser-only)
	 */
	private async renderWithCanvas(
		element: RemotionElement,
		totalFrames: number,
		onProgress?: PreRenderProgressCallback
	): Promise<Map<number, string>> {
		const framePaths = new Map<number, string>();

		// For canvas rendering, we generate data URLs instead of file paths
		// This is a simplified implementation - real implementation would
		// need to capture frames from the Remotion player

		for (let frame = 0; frame < totalFrames; frame++) {
			if (this.abortController?.signal.aborted) {
				throw new Error("Rendering aborted");
			}

			// Generate a placeholder path (actual implementation would capture from player)
			const dataUrl = await this.captureFrameFromPlayer(element, frame);
			framePaths.set(frame, dataUrl);

			onProgress?.(
				element.id,
				((frame + 1) / totalFrames) * 100,
				frame + 1,
				totalFrames
			);

			// Yield to prevent UI blocking
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		return framePaths;
	}

	/**
	 * Capture a single frame from the Remotion player
	 * This is a placeholder - actual implementation would interface with the player
	 */
	private async captureFrameFromPlayer(
		element: RemotionElement,
		frame: number
	): Promise<string> {
		// Create a canvas for capturing
		const canvas = document.createElement("canvas");
		canvas.width = this.config.width;
		canvas.height = this.config.height;
		const ctx = canvas.getContext("2d");

		if (!ctx) {
			throw new Error("Failed to get canvas context");
		}

		// Fill with transparent (actual implementation would render the Remotion component)
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Return as data URL
		return canvas.toDataURL(
			this.config.format === "png" ? "image/png" : "image/jpeg",
			this.config.quality / 100
		);
	}

	/**
	 * Abort ongoing rendering
	 */
	abort(): void {
		this.abortController?.abort();
	}

	/**
	 * Clean up rendered frames for a session
	 */
	async cleanup(sessionId: string): Promise<void> {
		const electronAPI = platform().remotion;

		if (electronAPI?.cleanup) {
			await electronAPI.cleanup(sessionId);
		}
		// For canvas mode, data URLs are garbage collected automatically
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate total frames for a set of elements
 */
export function estimateTotalFrames(
	elements: RemotionElement[],
	fps: number
): number {
	return elements.reduce((total, element) => {
		const duration = element.duration - element.trimStart - element.trimEnd;
		return total + Math.ceil(duration * fps);
	}, 0);
}

/**
 * Calculate estimated render time based on element complexity
 */
export function estimateRenderTime(
	elements: RemotionElement[],
	fps: number,
	msPerFrame = 50 // Default estimate
): number {
	const totalFrames = estimateTotalFrames(elements, fps);
	return totalFrames * msPerFrame;
}

/**
 * Get elements that need pre-rendering from timeline
 */
export function getElementsForPreRender(
	elements: RemotionElement[],
	startTime: number,
	endTime: number
): RemotionElement[] {
	return elements.filter((element) => {
		const elementStart = element.startTime;
		const elementEnd =
			element.startTime +
			element.duration -
			element.trimStart -
			element.trimEnd;
		// Element overlaps with the export range
		return elementStart < endTime && elementEnd > startTime;
	});
}

/**
 * Create a pre-renderer instance with default config
 */
export function createPreRenderer(
	outputDir: string,
	options?: Partial<PreRenderConfig>
): RemotionPreRenderer {
	return new RemotionPreRenderer({ outputDir, ...options });
}
