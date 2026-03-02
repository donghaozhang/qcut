/**
 * Remotion Export Engine
 *
 * Specialized export engine that handles Remotion elements by pre-rendering
 * them to frame sequences and compositing with QCut canvas content.
 *
 * Export phases:
 * 1. Analyzing - Identify Remotion elements and calculate frame requirements
 * 2. Pre-rendering - Render Remotion components to frame sequences
 * 3. Compositing - Merge QCut canvas with Remotion frames
 * 4. Encoding - Encode final video
 * 5. Cleanup - Remove temporary files
 *
 * @module lib/remotion/export-engine-remotion
 */

import { ExportEngine } from "@/lib/export/export-engine";
import type { ExportSettings, ExportProgress } from "@/types/export";
import type {
	TimelineTrack,
	TimelineElement,
	RemotionElement,
} from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import {
	RemotionPreRenderer,
	createPreRenderer,
	estimateTotalFrames,
	getElementsForPreRender,
	type PreRenderResult,
	type PreRenderProgressCallback,
} from "./pre-renderer";
import {
	FrameCompositor,
	createCompositor,
	computeLayerOrder,
	getVisibleRemotionElements,
	type CompositeLayer,
} from "./compositor";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";

// ============================================================================
// Types
// ============================================================================

/**
 * Export phases for Remotion-enabled export
 */
export type RemotionExportPhase =
	| "idle"
	| "analyzing"
	| "prerendering"
	| "compositing"
	| "encoding"
	| "cleanup"
	| "complete"
	| "error";

/**
 * Detailed progress for Remotion export
 */
export interface RemotionExportProgress {
	/** Current phase */
	phase: RemotionExportPhase;
	/** Overall progress 0-100 */
	overallProgress: number;
	/** Phase-specific progress 0-100 */
	phaseProgress: number;
	/** Human-readable status message */
	statusMessage: string;
	/** Current element being processed */
	currentElement?: string;
	/** Frames completed in current phase */
	framesCompleted?: number;
	/** Total frames in current phase */
	totalFrames?: number;
	/** Estimated time remaining in seconds */
	estimatedTimeRemaining?: number;
}

/**
 * Configuration for Remotion export
 */
export interface RemotionExportConfig {
	/** Output directory for temporary frames */
	tempDir: string;
	/** Image format for pre-rendered frames */
	frameFormat: "png" | "jpeg";
	/** JPEG quality (0-100) */
	frameQuality: number;
	/** Whether to keep temp files after export */
	keepTempFiles: boolean;
	/** Maximum concurrent render threads */
	concurrency: number;
}

/**
 * Progress callback for Remotion export
 */
export type RemotionExportProgressCallback = (
	progress: RemotionExportProgress
) => void;

// ============================================================================
// Constants
// ============================================================================

/**
 * Get a cross-platform temp directory path.
 * In Electron, callers should override this via remotionConfig.tempDir
 * using app.getPath('temp') from the main process via IPC.
 */
function getDefaultTempDir(): string {
	// Check if we're in a Windows-like environment
	if (
		typeof navigator !== "undefined" &&
		navigator.platform?.startsWith("Win")
	) {
		return "C:\\Users\\Public\\AppData\\Local\\Temp\\qcut-remotion-export";
	}
	// Default Unix path — callers should override via remotionConfig.tempDir
	// using app.getPath('temp') from the main process via IPC
	return "/tmp/qcut-remotion-export";
}

export const DEFAULT_REMOTION_EXPORT_CONFIG: RemotionExportConfig = {
	tempDir: getDefaultTempDir(),
	frameFormat: "jpeg",
	frameQuality: 90,
	keepTempFiles: false,
	concurrency: 4,
};

/**
 * Phase weights for overall progress calculation
 * Total should equal 100
 */
const PHASE_WEIGHTS: Record<RemotionExportPhase, number> = {
	idle: 0,
	analyzing: 5,
	prerendering: 40,
	compositing: 35,
	encoding: 15,
	cleanup: 5,
	complete: 0,
	error: 0,
};

// ============================================================================
// RemotionExportEngine Class
// ============================================================================

/**
 * Export engine with Remotion element support
 *
 * Extends the base ExportEngine to handle Remotion elements by:
 * 1. Pre-rendering Remotion components to frame sequences
 * 2. Compositing pre-rendered frames with QCut canvas
 * 3. Encoding the final composited video
 */
export class RemotionExportEngine extends ExportEngine {
	private remotionConfig: RemotionExportConfig;
	private preRenderer: RemotionPreRenderer | null = null;
	private compositor: FrameCompositor | null = null;
	private preRenderResults: Map<string, PreRenderResult> = new Map();
	private remotionElements: RemotionElement[] = [];
	private progressCallback: RemotionExportProgressCallback | null = null;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: used in multiple export methods
	private currentPhase: RemotionExportPhase = "idle";

	constructor(
		canvas: HTMLCanvasElement,
		settings: ExportSettings,
		tracks: TimelineTrack[],
		mediaItems: MediaItem[],
		totalDuration: number,
		remotionConfig?: Partial<RemotionExportConfig>
	) {
		super(canvas, settings, tracks, mediaItems, totalDuration);

		this.remotionConfig = {
			...DEFAULT_REMOTION_EXPORT_CONFIG,
			...remotionConfig,
		};

		// Initialize compositor with export dimensions
		this.compositor = createCompositor(settings.width, settings.height);

		debugLog(
			`[RemotionExportEngine] Initialized with ${settings.width}x${settings.height} @ ${this.getFrameRate()}fps`
		);
	}

	/**
	 * Check if timeline contains Remotion elements
	 */
	hasRemotionElements(): boolean {
		return this.getRemotionElements().length > 0;
	}

	/**
	 * Get all Remotion elements from tracks
	 */
	private getRemotionElements(): RemotionElement[] {
		const elements: RemotionElement[] = [];

		for (const track of this.tracks) {
			for (const element of track.elements) {
				if (element.type === "remotion") {
					elements.push(element as RemotionElement);
				}
			}
		}

		return elements;
	}

	/**
	 * Main export method with Remotion support
	 */
	async exportWithRemotion(
		progressCallback?: RemotionExportProgressCallback
	): Promise<Blob> {
		this.progressCallback = progressCallback || null;

		try {
			// Phase 1: Analyzing
			await this.analyzePhase();

			// Check if we have Remotion elements
			if (this.remotionElements.length === 0) {
				debugLog(
					"[RemotionExportEngine] No Remotion elements found, using standard export"
				);
				// Fall back to standard export
				return await this.export((progress, status) => {
					this.updateProgress("encoding", progress, status);
				});
			}

			// Phase 2: Pre-rendering Remotion elements
			await this.preRenderPhase();

			// Phase 3: Compositing (returns the encoded video blob)
			const blob = await this.compositingPhase();

			// Phase 4: Encoding (handled by base class in compositingPhase)

			// Phase 5: Cleanup
			await this.cleanupPhase();

			this.updateProgress("complete", 100, "Export complete!");

			return blob;
		} catch (error) {
			this.currentPhase = "error";
			debugError("[RemotionExportEngine] Export failed:", error);
			this.updateProgress(
				"error",
				0,
				`Export failed: ${error instanceof Error ? error.message : String(error)}`
			);
			throw error;
		}
	}

	/**
	 * Phase 1: Analyze timeline for Remotion elements
	 */
	private async analyzePhase(): Promise<void> {
		this.currentPhase = "analyzing";
		this.updateProgress("analyzing", 0, "Analyzing timeline...");

		// Collect Remotion elements
		this.remotionElements = this.getRemotionElements();

		debugLog(
			`[RemotionExportEngine] Found ${this.remotionElements.length} Remotion elements`
		);

		// Calculate total frames to pre-render
		const totalPreRenderFrames = estimateTotalFrames(
			this.remotionElements,
			this.getFrameRate()
		);

		debugLog(
			`[RemotionExportEngine] Total frames to pre-render: ${totalPreRenderFrames}`
		);

		// Initialize pre-renderer if we have Remotion elements
		if (this.remotionElements.length > 0) {
			this.preRenderer = createPreRenderer(this.remotionConfig.tempDir, {
				format: this.remotionConfig.frameFormat,
				quality: this.remotionConfig.frameQuality,
				concurrency: this.remotionConfig.concurrency,
				width: this.settings.width,
				height: this.settings.height,
				fps: this.getFrameRate(),
			});
		}

		this.updateProgress("analyzing", 100, "Analysis complete");
	}

	/**
	 * Phase 2: Pre-render all Remotion elements
	 */
	private async preRenderPhase(): Promise<void> {
		this.currentPhase = "prerendering";
		this.updateProgress(
			"prerendering",
			0,
			"Pre-rendering Remotion elements..."
		);

		if (!this.preRenderer || this.remotionElements.length === 0) {
			debugLog("[RemotionExportEngine] No elements to pre-render");
			return;
		}

		const totalElements = this.remotionElements.length;
		let completedElements = 0;

		// Pre-render each element
		for (const element of this.remotionElements) {
			if (this.isExportCancelled()) {
				throw new Error("Export cancelled");
			}

			this.updateProgress(
				"prerendering",
				(completedElements / totalElements) * 100,
				`Pre-rendering: ${element.name || element.id}`
			);

			const progressCallback: PreRenderProgressCallback = (
				elementId,
				progress,
				currentFrame,
				totalFrames
			) => {
				const elementProgress =
					(completedElements + progress / 100) / totalElements;
				this.updateProgress(
					"prerendering",
					elementProgress * 100,
					`Pre-rendering ${element.name || element.id}: frame ${currentFrame}/${totalFrames}`
				);
			};

			const result = await this.preRenderer.preRenderElement(
				element,
				progressCallback
			);

			if (!result.success) {
				debugWarn(
					`[RemotionExportEngine] Failed to pre-render ${element.id}:`,
					result.error
				);
				// Continue with other elements, but log the failure
			}

			this.preRenderResults.set(element.id, result);
			completedElements++;
		}

		debugLog(
			`[RemotionExportEngine] Pre-rendered ${this.preRenderResults.size} elements`
		);
		this.updateProgress("prerendering", 100, "Pre-rendering complete");
	}

	/**
	 * Phase 3: Composite frames and encode video
	 */
	private async compositingPhase(): Promise<Blob> {
		this.currentPhase = "compositing";
		this.updateProgress("compositing", 0, "Compositing frames...");

		// Override the base class renderFrame to include Remotion compositing
		const originalRenderFrame = this.renderFrame.bind(this);

		// Create a custom render function that composites Remotion frames
		this.renderFrame = async (currentTime: number): Promise<void> => {
			// First, render QCut elements (video, images, text, etc.)
			await originalRenderFrame(currentTime);

			// Then composite Remotion elements on top
			await this.compositeRemotionFrames(currentTime);
		};

		// Use base class export with custom progress
		let blob: Blob;
		try {
			blob = await this.export((progress, status) => {
				// Map encoding progress to compositing phase
				const phaseProgress = progress * 0.9; // Reserve 10% for finalization
				this.updateProgress("compositing", phaseProgress, status);
			});
		} finally {
			// Restore original render function even if export fails
			this.renderFrame = originalRenderFrame;
		}

		this.updateProgress("compositing", 100, "Compositing complete");

		// Transition to encoding phase feedback
		this.currentPhase = "encoding";
		this.updateProgress("encoding", 100, "Encoding complete");

		return blob;
	}

	/**
	 * Composite Remotion frames onto the canvas at current time
	 */
	private async compositeRemotionFrames(currentTime: number): Promise<void> {
		if (!this.compositor) return;

		const frame = Math.floor(currentTime * this.getFrameRate());

		// Get visible Remotion elements at this time
		const visibleElements = getVisibleRemotionElements(
			this.remotionElements,
			currentTime
		);

		if (visibleElements.length === 0) return;

		// Build frame map from pre-rendered results
		const remotionFrames = new Map<string, string>();

		for (const element of visibleElements) {
			const result = this.preRenderResults.get(element.id);
			if (!result || !result.success) continue;

			// Calculate which frame of this element to use
			const elementStart = element.startTime + element.trimStart;
			const elementFrame = Math.floor(
				(currentTime - elementStart) * this.getFrameRate()
			);

			const framePath = result.framePaths.get(elementFrame);
			if (framePath) {
				remotionFrames.set(element.id, framePath);
			}
		}

		// Compute layer order
		const layers = computeLayerOrder(
			this.getAllElements(),
			this.tracks,
			frame,
			this.getFrameRate()
		);

		// Filter to only Remotion layers that we have frames for
		const remotionLayers = layers.filter(
			(layer) =>
				layer.source === "remotion" && remotionFrames.has(layer.elementId)
		);

		if (remotionLayers.length === 0) return;

		// Composite Remotion frames onto the canvas
		// Note: We're drawing directly to the export canvas, not creating a new composite
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;

		for (const layer of remotionLayers) {
			if (!layer.visible) continue;

			const framePath = remotionFrames.get(layer.elementId);
			if (!framePath) continue;

			// Load and draw the pre-rendered frame
			await this.drawRemotionFrame(ctx, framePath, layer);
		}
	}

	/**
	 * Draw a pre-rendered Remotion frame to the canvas
	 */
	private async drawRemotionFrame(
		ctx: CanvasRenderingContext2D,
		framePath: string,
		layer: CompositeLayer
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";

			img.onload = () => {
				ctx.save();

				// Apply layer properties
				ctx.globalAlpha = layer.opacity;

				// Apply blend mode
				const blendModeMap: Record<string, GlobalCompositeOperation> = {
					normal: "source-over",
					multiply: "multiply",
					screen: "screen",
					overlay: "overlay",
				};
				ctx.globalCompositeOperation =
					blendModeMap[layer.blendMode] || "source-over";

				// Apply transform if present
				if (layer.transform) {
					const {
						x,
						y,
						scale,
						rotation,
						anchorX = 0.5,
						anchorY = 0.5,
					} = layer.transform;
					const centerX = anchorX * this.canvas.width;
					const centerY = anchorY * this.canvas.height;

					ctx.translate(centerX + x, centerY + y);
					ctx.rotate((rotation * Math.PI) / 180);
					ctx.scale(scale, scale);
					ctx.translate(-centerX, -centerY);
				}

				// Draw the image
				ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);

				ctx.restore();
				resolve();
			};

			img.onerror = () => {
				debugWarn(`[RemotionExportEngine] Failed to load frame: ${framePath}`);
				resolve(); // Don't fail the entire export
			};

			img.src = framePath;
		});
	}

	/**
	 * Get all timeline elements
	 */
	private getAllElements(): TimelineElement[] {
		const elements: TimelineElement[] = [];
		for (const track of this.tracks) {
			elements.push(...track.elements);
		}
		return elements;
	}

	/**
	 * Phase 5: Cleanup temporary files
	 */
	private async cleanupPhase(): Promise<void> {
		this.currentPhase = "cleanup";
		this.updateProgress("cleanup", 0, "Cleaning up...");

		if (!this.remotionConfig.keepTempFiles && this.preRenderer) {
			// Clean up pre-rendered frames
			for (const [elementId] of this.preRenderResults) {
				try {
					await this.preRenderer.cleanup(elementId);
				} catch (error) {
					debugWarn(
						`[RemotionExportEngine] Failed to cleanup ${elementId}:`,
						error
					);
				}
			}
		}

		// Clear results
		this.preRenderResults.clear();

		// Dispose compositor
		if (this.compositor) {
			this.compositor.dispose();
			this.compositor = null;
		}

		this.updateProgress("cleanup", 100, "Cleanup complete");
	}

	/**
	 * Update progress with phase-aware calculation
	 */
	private updateProgress(
		phase: RemotionExportPhase,
		phaseProgress: number,
		statusMessage: string
	): void {
		// Calculate overall progress based on phase weights
		let overallProgress = 0;

		const phases: RemotionExportPhase[] = [
			"analyzing",
			"prerendering",
			"compositing",
			"encoding",
			"cleanup",
		];

		for (const p of phases) {
			if (p === phase) {
				overallProgress += (PHASE_WEIGHTS[p] * phaseProgress) / 100;
				break;
			}
			overallProgress += PHASE_WEIGHTS[p];
		}

		if (phase === "complete") {
			overallProgress = 100;
		}

		const progress: RemotionExportProgress = {
			phase,
			overallProgress: Math.min(overallProgress, 100),
			phaseProgress,
			statusMessage,
		};

		this.progressCallback?.(progress);
	}

	/**
	 * Cancel export and cleanup
	 */
	override cancel(): void {
		super.cancel();

		// Abort pre-renderer if running
		if (this.preRenderer) {
			this.preRenderer.abort();
		}

		// Cleanup on cancel
		this.cleanupPhase().catch((error) => {
			debugWarn("[RemotionExportEngine] Cleanup after cancel failed:", error);
		});
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Remotion export engine
 */
export function createRemotionExportEngine(
	canvas: HTMLCanvasElement,
	settings: ExportSettings,
	tracks: TimelineTrack[],
	mediaItems: MediaItem[],
	totalDuration: number,
	remotionConfig?: Partial<RemotionExportConfig>
): RemotionExportEngine {
	return new RemotionExportEngine(
		canvas,
		settings,
		tracks,
		mediaItems,
		totalDuration,
		remotionConfig
	);
}

/**
 * Check if timeline requires Remotion export engine
 */
export function requiresRemotionExport(tracks: TimelineTrack[]): boolean {
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type === "remotion") {
				return true;
			}
		}
	}
	return false;
}
