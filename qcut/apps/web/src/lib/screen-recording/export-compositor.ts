import type { BackgroundConfig } from "./wallpapers";
import type { CursorRenderConfig } from "./cursor-renderer";
import type { ZoomRegion } from "./zoom-region-utils";
import type { CursorTelemetryData } from "@/types/electron/cursor-telemetry";
import {
	drawBackground,
	drawRoundedVideoFrame,
} from "./canvas-background-renderer";
import { drawCursor, getClickAnimProgress } from "./canvas-cursor-renderer";
import { computeZoomTransform } from "./zoom-transform";
import {
	type SpringState,
	getCursorSpringConfig,
	stepSpring,
	createSpringState,
} from "./motion-smoothing";

export interface ExportCompositorConfig {
	background: BackgroundConfig;
	cursorConfig: CursorRenderConfig;
	zoomRegions: ZoomRegion[];
	telemetry: CursorTelemetryData | null;
	outputWidth: number;
	outputHeight: number;
}

/**
 * Composites all screen recording enhancements for export.
 * Draws background, zoom-transformed video, and cursor overlay
 * onto the export canvas frame-by-frame.
 */
export class ScreenRecordingExportCompositor {
	private config: ExportCompositorConfig;
	private springX: SpringState;
	private springY: SpringState;
	private lastTimeMs = -1;
	private clickStartMs = -1;
	private wasPressed = false;

	constructor(config: ExportCompositorConfig) {
		this.config = config;
		this.springX = createSpringState();
		this.springY = createSpringState();
	}

	renderFrame(
		ctx: CanvasRenderingContext2D,
		videoFrame: CanvasImageSource,
		timeMs: number
	): void {
		const { outputWidth, outputHeight, background, cursorConfig } = this.config;

		// Step 1: Draw background
		if (background.type !== "none") {
			drawBackground(ctx, background, outputWidth, outputHeight);
		}

		// Step 2: Compute zoom transform
		const zoom = computeZoomTransform(
			timeMs,
			this.config.zoomRegions,
			outputWidth,
			outputHeight
		);

		// Step 3: Draw video frame (with background padding/rounding or direct)
		ctx.save();

		if (zoom.scale > 1.001) {
			ctx.translate(zoom.translateX, zoom.translateY);
			ctx.scale(zoom.scale, zoom.scale);
		}

		if (background.type !== "none") {
			const padding = background.padding;
			const videoX = padding;
			const videoY = padding;
			const videoW = outputWidth - padding * 2;
			const videoH = outputHeight - padding * 2;

			drawRoundedVideoFrame(
				ctx,
				videoFrame,
				videoX,
				videoY,
				videoW,
				videoH,
				background.borderRadius,
				background.shadow
			);
		} else {
			ctx.drawImage(videoFrame, 0, 0, outputWidth, outputHeight);
		}

		ctx.restore();

		// Step 4: Draw cursor overlay
		if (this.config.telemetry && cursorConfig.cursorStyle !== "hidden") {
			this.renderCursor(ctx, timeMs);
		}
	}

	private renderCursor(ctx: CanvasRenderingContext2D, timeMs: number): void {
		const { telemetry, cursorConfig, outputWidth, outputHeight } = this.config;
		if (!telemetry || telemetry.points.length === 0) return;

		// Find current point via binary search
		const { points, captureRect } = telemetry;
		let low = 0;
		let high = points.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if (points[mid].t <= timeMs) low = mid;
			else high = mid - 1;
		}
		const point = points[low];

		// Convert to canvas coordinates
		const rx = (point.x - captureRect.x) / captureRect.width;
		const ry = (point.y - captureRect.y) / captureRect.height;

		// Spring smoothing
		const dt = this.lastTimeMs >= 0 ? (timeMs - this.lastTimeMs) / 1000 : 0;
		this.lastTimeMs = timeMs;

		const springConfig = getCursorSpringConfig(cursorConfig.smoothingFactor);
		this.springX = stepSpring(this.springX, rx * outputWidth, springConfig, dt);
		this.springY = stepSpring(
			this.springY,
			ry * outputHeight,
			springConfig,
			dt
		);

		// Click tracking
		if (point.p && !this.wasPressed) {
			this.clickStartMs = timeMs;
		}
		this.wasPressed = point.p;

		const clickProgress = getClickAnimProgress(timeMs, this.clickStartMs);

		drawCursor(
			ctx,
			this.springX.value,
			this.springY.value,
			cursorConfig,
			clickProgress,
			outputWidth
		);
	}

	destroy(): void {
		// No resources to clean up for canvas-based renderer
	}
}
