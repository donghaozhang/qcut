import type { BackgroundConfig } from "./wallpapers";
import type { CursorRenderConfig } from "./cursor-renderer";
import type { ZoomRegion, ConnectedTransition } from "./zoom-region-utils";
import { findConnectedTransitions } from "./zoom-region-utils";
import type {
	CursorTelemetryData,
	CursorTelemetryPoint,
} from "@/types/electron/cursor-telemetry";
import {
	drawBackground,
	drawRoundedVideoFrame,
} from "./canvas-background-renderer";
import {
	drawCursor,
	drawCursorWithMotionBlur,
	getClickAnimProgress,
} from "./canvas-cursor-renderer";
import { computeZoomTransform } from "./zoom-transform";
import {
	type SpringState,
	type SpringConfig,
	getCursorSpringConfig,
	stepSpring,
	createSpringState,
} from "./motion-smoothing";
import { computeCursorSwayRotation } from "./cursor-sway";
import { buildLoopedCursorTelemetry } from "./cursor-loop";
import { playbackTimeToRealTime, type SpeedRegion } from "./speed-regions";
import { drawSquircleClipPath } from "./squircle";
import {
	getWebcamOverlayRect,
	type WebcamOverlayConfig,
} from "@/stores/webcam-overlay-store";
import { drawArrow, drawCircle, drawRectangle } from "./figure-paths";
import type { FigureAnnotation } from "@/stores/figure-annotations-store";
import {
	createZoomMotionBlurState,
	computeZoomMotionBlur,
	type ZoomMotionBlurState,
} from "./zoom-motion-blur";

export interface ExportCompositorConfig {
	background: BackgroundConfig;
	cursorConfig: CursorRenderConfig;
	zoomRegions: ZoomRegion[];
	telemetry: CursorTelemetryData | null;
	outputWidth: number;
	outputHeight: number;

	/** Cursor loop mode — smooth return to start for seamless loops */
	cursorLoopMode?: boolean;
	/** Total video duration in ms (required for cursor loop) */
	totalDurationMs?: number;

	/** Speed regions for playback speed control */
	speedRegions?: SpeedRegion[];

	/** Webcam overlay configuration */
	webcamConfig?: WebcamOverlayConfig;
	/** Webcam video element (must be playing) */
	webcamVideo?: HTMLVideoElement;

	/** Figure annotations (arrows, circles, rectangles) */
	figureAnnotations?: FigureAnnotation[];

	/** Zoom motion blur intensity (0–1, default 0 = off) */
	zoomMotionBlur?: number;
}

/**
 * Composites all screen recording enhancements for export.
 * Draws background, zoom-transformed video, cursor overlay,
 * webcam bubble, and figure annotations frame-by-frame.
 */
export class ScreenRecordingExportCompositor {
	private config: ExportCompositorConfig;
	private springX: SpringState;
	private springY: SpringState;
	private springRotation: SpringState;
	private swaySpringConfig: SpringConfig;
	private prevSmoothedX = 0;
	private prevSmoothedY = 0;
	private lastTimeMs = -1;
	private clickStartMs = -1;
	private wasPressed = false;
	private processedTelemetry: CursorTelemetryPoint[] | null = null;
	private connectedTransitions: ConnectedTransition[];
	private zoomBlurState: ZoomMotionBlurState;
	private captureRect: { x: number; y: number; width: number; height: number } | null;

	constructor(config: ExportCompositorConfig) {
		this.config = config;
		this.captureRect = config.telemetry?.captureRect ?? null;
		this.springX = createSpringState();
		this.springY = createSpringState();
		this.springRotation = createSpringState();

		// Sway spring: reduced damping/mass for natural wobble
		const baseSpring = getCursorSpringConfig(
			config.cursorConfig.smoothingFactor
		);
		this.swaySpringConfig = {
			stiffness: baseSpring.stiffness,
			damping: baseSpring.damping * 0.9,
			mass: baseSpring.mass * 0.8,
		};

		// Pre-process telemetry for cursor loop mode
		if (config.cursorLoopMode && config.telemetry && config.totalDurationMs) {
			this.processedTelemetry = buildLoopedCursorTelemetry(
				config.telemetry.points,
				config.totalDurationMs
			);
		}

		// Pre-compute connected zoom transitions
		this.connectedTransitions = findConnectedTransitions(config.zoomRegions);

		// Zoom motion blur state
		this.zoomBlurState = createZoomMotionBlurState();
	}

	/** Get the effective telemetry points (looped or original) */
	private getTelemetryPoints(): CursorTelemetryPoint[] | null {
		if (this.processedTelemetry) return this.processedTelemetry;
		return this.config.telemetry?.points ?? null;
	}

	renderFrame(
		ctx: CanvasRenderingContext2D,
		videoFrame: CanvasImageSource,
		timeMs: number
	): void {
		const { outputWidth, outputHeight, background, cursorConfig } = this.config;

		// Speed region time remapping: convert output time to source time
		const sourceTimeMs = this.config.speedRegions?.length
			? playbackTimeToRealTime(this.config.speedRegions, timeMs)
			: timeMs;

		// Step 1: Draw background
		if (background.type !== "none") {
			drawBackground(ctx, background, outputWidth, outputHeight);
		}

		// Step 2: Compute zoom transform (with connected transitions)
		const zoom = computeZoomTransform(
			sourceTimeMs,
			this.config.zoomRegions,
			outputWidth,
			outputHeight,
			this.connectedTransitions
		);

		// Step 2b: Zoom motion blur
		const zoomBlurAmount = this.config.zoomMotionBlur ?? 0;
		if (zoomBlurAmount > 0) {
			const blur = computeZoomMotionBlur(
				this.zoomBlurState,
				zoom.translateX,
				zoom.translateY,
				zoom.scale,
				sourceTimeMs,
				outputWidth,
				outputHeight,
				zoomBlurAmount
			);
			if (blur.magnitude > 0.5) {
				ctx.filter = `blur(${Math.min(blur.magnitude, 8)}px)`;
			}
		}

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

		// Step 4: Draw cursor overlay (inside zoom transform context)
		if (this.getTelemetryPoints() && cursorConfig.cursorStyle !== "hidden") {
			this.renderCursor(
				ctx,
				sourceTimeMs,
				background.type !== "none" ? background.padding : 0
			);
		}

		ctx.restore();

		// Reset zoom motion blur filter
		ctx.filter = "none";

		// Step 5: Draw webcam overlay (outside zoom context)
		this.renderWebcamOverlay(ctx, zoom.scale);

		// Step 6: Draw figure annotations (outside zoom context)
		this.renderFigureAnnotations(ctx, sourceTimeMs);
	}

	private renderCursor(
		ctx: CanvasRenderingContext2D,
		timeMs: number,
		padding = 0
	): void {
		const { cursorConfig, outputWidth, outputHeight } = this.config;
		const videoW = outputWidth - padding * 2;
		const videoH = outputHeight - padding * 2;

		const points = this.getTelemetryPoints();
		if (!points || points.length === 0) return;

		const captureRect = this.captureRect;
		if (!captureRect) return;

		// Don't render cursor before the first telemetry event
		if (timeMs < points[0].t) return;

		// Binary search for current point
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
		this.springX = stepSpring(
			this.springX,
			padding + rx * videoW,
			springConfig,
			dt
		);
		this.springY = stepSpring(
			this.springY,
			padding + ry * videoH,
			springConfig,
			dt
		);

		// Sway rotation
		let swayRotation = 0;
		if (cursorConfig.sway > 0 && dt > 0) {
			const dx = this.springX.value - this.prevSmoothedX;
			const dy = this.springY.value - this.prevSmoothedY;
			const target = computeCursorSwayRotation({
				dx,
				dy,
				deltaMs: dt * 1000,
				sway: cursorConfig.sway,
			});
			this.springRotation = stepSpring(
				this.springRotation,
				target,
				this.swaySpringConfig,
				dt
			);
			swayRotation = this.springRotation.value;
		}
		// Save previous position for motion blur before updating
		const prevX = this.prevSmoothedX;
		const prevY = this.prevSmoothedY;
		this.prevSmoothedX = this.springX.value;
		this.prevSmoothedY = this.springY.value;

		// Click tracking
		if (point.p && !this.wasPressed) {
			this.clickStartMs = timeMs;
		}
		this.wasPressed = point.p;

		const clickProgress = getClickAnimProgress(timeMs, this.clickStartMs);

		if (cursorConfig.motionBlur > 0) {
			drawCursorWithMotionBlur(
				ctx,
				this.springX.value,
				this.springY.value,
				prevX,
				prevY,
				cursorConfig,
				clickProgress,
				outputWidth,
				swayRotation
			);
		} else {
			drawCursor(
				ctx,
				this.springX.value,
				this.springY.value,
				cursorConfig,
				clickProgress,
				outputWidth,
				swayRotation
			);
		}
	}

	private renderWebcamOverlay(
		ctx: CanvasRenderingContext2D,
		zoomDepth: number
	): void {
		const { webcamConfig, webcamVideo, outputWidth, outputHeight } =
			this.config;
		if (!webcamConfig?.enabled || !webcamVideo) return;

		const rect = getWebcamOverlayRect(
			webcamConfig,
			outputWidth,
			outputHeight,
			zoomDepth
		);

		ctx.save();

		// Shadow — must be drawn before clip() to be visible outside the shape
		if (webcamConfig.shadow > 0 && webcamConfig.roundness > 0) {
			ctx.shadowColor = `rgba(0, 0, 0, ${webcamConfig.shadow / 200})`;
			ctx.shadowBlur = (webcamConfig.shadow / 100) * 20;
			ctx.shadowOffsetY = (webcamConfig.shadow / 100) * 4;
			drawSquircleClipPath(ctx, {
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
				radius: webcamConfig.roundness,
			});
			ctx.fillStyle = "rgba(0,0,0,1)";
			ctx.fill();
			// Reset shadow so it doesn't double-apply on the video draw
			ctx.shadowColor = "transparent";
			ctx.shadowBlur = 0;
			ctx.shadowOffsetY = 0;
		} else if (webcamConfig.shadow > 0) {
			ctx.shadowColor = `rgba(0, 0, 0, ${webcamConfig.shadow / 200})`;
			ctx.shadowBlur = (webcamConfig.shadow / 100) * 20;
			ctx.shadowOffsetY = (webcamConfig.shadow / 100) * 4;
		}

		// Squircle clip path
		if (webcamConfig.roundness > 0) {
			drawSquircleClipPath(ctx, {
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
				radius: webcamConfig.roundness,
			});
			ctx.clip();
		}

		ctx.globalAlpha = webcamConfig.opacity;

		// Mirror
		if (webcamConfig.mirror) {
			ctx.translate(rect.x + rect.width, rect.y);
			ctx.scale(-1, 1);
			ctx.drawImage(webcamVideo, 0, 0, rect.width, rect.height);
		} else {
			ctx.drawImage(webcamVideo, rect.x, rect.y, rect.width, rect.height);
		}

		ctx.restore();
	}

	private renderFigureAnnotations(
		ctx: CanvasRenderingContext2D,
		timeMs: number
	): void {
		const annotations = this.config.figureAnnotations;
		if (!annotations || annotations.length === 0) return;

		const { outputWidth, outputHeight } = this.config;

		const visible = annotations
			.filter((a) => timeMs >= a.startMs && timeMs <= a.endMs)
			.sort((a, b) => a.zIndex - b.zIndex);

		for (const a of visible) {
			const px = (a.x / 100) * outputWidth;
			const py = (a.y / 100) * outputHeight;
			const pw = (a.width / 100) * outputWidth;
			const ph = (a.height / 100) * outputHeight;

			ctx.save();
			ctx.globalAlpha = a.opacity;

			if (a.rotation !== 0) {
				ctx.translate(px + pw / 2, py + ph / 2);
				ctx.rotate((a.rotation * Math.PI) / 180);
				ctx.translate(-(px + pw / 2), -(py + ph / 2));
			}

			if (a.type === "arrow" && a.arrowDirection) {
				drawArrow({
					ctx,
					direction: a.arrowDirection,
					x: px,
					y: py,
					width: pw,
					height: ph,
					strokeColor: a.strokeColor,
					strokeWidth: a.strokeWidth,
				});
			} else if (a.type === "circle") {
				drawCircle({
					ctx,
					x: px,
					y: py,
					width: pw,
					height: ph,
					strokeColor: a.strokeColor,
					strokeWidth: a.strokeWidth,
					fillColor: a.fillColor,
					fillOpacity: a.fillOpacity,
				});
			} else if (a.type === "rectangle") {
				drawRectangle({
					ctx,
					x: px,
					y: py,
					width: pw,
					height: ph,
					strokeColor: a.strokeColor,
					strokeWidth: a.strokeWidth,
					fillColor: a.fillColor,
					fillOpacity: a.fillOpacity,
				});
			}

			ctx.restore();
		}
	}

	destroy(): void {
		// No resources to clean up for canvas-based renderer
	}
}
