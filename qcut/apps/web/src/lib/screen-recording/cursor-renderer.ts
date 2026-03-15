import * as PIXI from "pixi.js";
import type { CursorTelemetryData } from "@/types/electron/cursor-telemetry";
import {
	type SpringState,
	type SpringConfig,
	getCursorSpringConfig,
	stepSpring,
	createSpringState,
} from "./motion-smoothing";
import { CURSOR_ASSETS } from "./cursor-assets";
import { clamp01 } from "./math-utils";

export interface CursorRenderConfig {
	dotRadius: number;
	dotColor: number;
	dotAlpha: number;
	smoothingFactor: number;
	motionBlur: number;
	clickBounce: number;
	cursorStyle: "dot" | "macos-arrow" | "macos-pointer" | "hidden";
}

export const DEFAULT_CURSOR_CONFIG: CursorRenderConfig = {
	dotRadius: 28,
	dotColor: 0xffffff,
	dotAlpha: 0.95,
	smoothingFactor: 0.18,
	motionBlur: 0,
	clickBounce: 1,
	cursorStyle: "dot",
};

const CLICK_BOUNCE_DURATION_MS = 150;
const REFERENCE_WIDTH = 1920;

/**
 * PixiJS-based cursor renderer for preview panel overlay.
 * Renders a smooth cursor driven by telemetry data.
 */
export class CursorRenderer {
	private stage: PIXI.Container;
	private config: CursorRenderConfig;
	private springConfig: SpringConfig;
	private springX: SpringState;
	private springY: SpringState;
	private cursorGraphics: PIXI.Graphics;
	private cursorSprite: PIXI.Sprite | null = null;
	private lastTimeMs = -1;
	private clickStartMs = -1;
	private wasPressed = false;

	constructor(stage: PIXI.Container, config: CursorRenderConfig) {
		this.stage = stage;
		this.config = config;
		this.springConfig = getCursorSpringConfig(config.smoothingFactor);
		this.springX = createSpringState();
		this.springY = createSpringState();
		this.cursorGraphics = new PIXI.Graphics();
		this.stage.addChild(this.cursorGraphics);

		if (config.cursorStyle !== "dot" && config.cursorStyle !== "hidden") {
			this.loadCursorSprite(config.cursorStyle);
		}
	}

	private loadCursorSprite(style: string): void {
		const dataUrl = CURSOR_ASSETS[style];
		if (!dataUrl) return;

		PIXI.Assets.load(dataUrl)
			.then((texture: PIXI.Texture) => {
				this.cursorSprite = new PIXI.Sprite(texture);
				this.cursorSprite.anchor.set(0, 0);
				this.stage.addChild(this.cursorSprite);
			})
			.catch(() => {
				// Fallback to dot if sprite fails to load
			});
	}

	update(
		timeMs: number,
		telemetry: CursorTelemetryData,
		canvasWidth: number,
		canvasHeight: number
	): void {
		if (this.config.cursorStyle === "hidden") {
			this.cursorGraphics.clear();
			if (this.cursorSprite) this.cursorSprite.visible = false;
			return;
		}

		const { point, nextPoint } = this.findPoints(timeMs, telemetry);
		if (!point) {
			this.cursorGraphics.clear();
			return;
		}

		// Convert absolute coords to canvas-relative
		const canvasPos = telemetryToCanvas(
			point,
			telemetry.captureRect,
			canvasWidth,
			canvasHeight
		);

		// Spring smoothing
		const dt = this.lastTimeMs >= 0 ? (timeMs - this.lastTimeMs) / 1000 : 0;
		this.lastTimeMs = timeMs;

		this.springX = stepSpring(
			this.springX,
			canvasPos.x,
			this.springConfig,
			dt
		);
		this.springY = stepSpring(
			this.springY,
			canvasPos.y,
			this.springConfig,
			dt
		);

		const smoothX = this.springX.value;
		const smoothY = this.springY.value;

		// Click bounce animation
		const isPressed = point.p;
		if (isPressed && !this.wasPressed) {
			this.clickStartMs = timeMs;
		}
		this.wasPressed = isPressed;

		let bounceScale = 1;
		if (this.clickStartMs >= 0 && this.config.clickBounce > 0) {
			const elapsed = timeMs - this.clickStartMs;
			if (elapsed < CLICK_BOUNCE_DURATION_MS) {
				const t = elapsed / CLICK_BOUNCE_DURATION_MS;
				// Scale down then back up: 1 → 0.85 → 1
				const mid = 0.3;
				if (t < mid) {
					bounceScale = 1 - 0.15 * this.config.clickBounce * (t / mid);
				} else {
					bounceScale =
						0.85 * this.config.clickBounce +
						0.15 *
							this.config.clickBounce *
							clamp01((t - mid) / (1 - mid));
					bounceScale =
						1 - (1 - bounceScale) * (1 - clamp01((t - mid) / (1 - mid)));
				}
			} else {
				this.clickStartMs = -1;
			}
		}

		// Scale cursor size relative to canvas width
		const scaleFactor = canvasWidth / REFERENCE_WIDTH;
		const radius = this.config.dotRadius * scaleFactor * bounceScale;

		this.cursorGraphics.clear();

		if (
			this.config.cursorStyle === "dot" ||
			(!this.cursorSprite && this.config.cursorStyle !== "hidden")
		) {
			// Draw dot cursor
			this.cursorGraphics.circle(smoothX, smoothY, radius);
			this.cursorGraphics.fill({
				color: this.config.dotColor,
				alpha: this.config.dotAlpha,
			});

			// Click ring
			if (isPressed) {
				this.cursorGraphics.circle(smoothX, smoothY, radius * 1.5);
				this.cursorGraphics.stroke({
					color: this.config.dotColor,
					alpha: this.config.dotAlpha * 0.4,
					width: 2 * scaleFactor,
				});
			}
		}

		if (this.cursorSprite) {
			this.cursorSprite.visible = true;
			this.cursorSprite.x = smoothX;
			this.cursorSprite.y = smoothY;
			this.cursorSprite.scale.set(scaleFactor * bounceScale);
			this.cursorSprite.alpha = this.config.dotAlpha;
		}
	}

	updateConfig(config: Partial<CursorRenderConfig>): void {
		Object.assign(this.config, config);
		if (config.smoothingFactor !== undefined) {
			this.springConfig = getCursorSpringConfig(config.smoothingFactor);
		}
	}

	destroy(): void {
		this.cursorGraphics.destroy();
		if (this.cursorSprite) {
			this.cursorSprite.destroy();
		}
	}

	private findPoints(
		timeMs: number,
		telemetry: CursorTelemetryData
	): {
		point: (typeof telemetry.points)[0] | null;
		nextPoint: (typeof telemetry.points)[0] | null;
	} {
		const { points } = telemetry;
		if (points.length === 0) return { point: null, nextPoint: null };

		// Binary search for the point just before timeMs
		let low = 0;
		let high = points.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if (points[mid].t <= timeMs) {
				low = mid;
			} else {
				high = mid - 1;
			}
		}

		return {
			point: points[low],
			nextPoint: low + 1 < points.length ? points[low + 1] : null,
		};
	}
}

function telemetryToCanvas(
	point: { x: number; y: number },
	captureRect: { x: number; y: number; width: number; height: number },
	canvasWidth: number,
	canvasHeight: number
): { x: number; y: number } {
	const rx = (point.x - captureRect.x) / captureRect.width;
	const ry = (point.y - captureRect.y) / captureRect.height;
	return { x: rx * canvasWidth, y: ry * canvasHeight };
}
