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
import { computeCursorSwayRotation } from "./cursor-sway";

export interface CursorRenderConfig {
	dotRadius: number;
	dotColor: number;
	dotAlpha: number;
	smoothingFactor: number;
	motionBlur: number;
	clickBounce: number;
	sway: number;
	cursorStyle: "dot" | "macos-arrow" | "macos-pointer" | "hidden";
}

export const DEFAULT_CURSOR_CONFIG: CursorRenderConfig = {
	dotRadius: 28,
	dotColor: 0xffffff,
	dotAlpha: 0.95,
	smoothingFactor: 0.18,
	motionBlur: 0,
	clickBounce: 1,
	sway: 0,
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
	private springRotation: SpringState;
	private swaySpringConfig: SpringConfig;
	private prevSmoothedX = 0;
	private prevSmoothedY = 0;
	private cursorGraphics: PIXI.Graphics;
	private cursorSprite: PIXI.Sprite | null = null;
	private lastTimeMs = -1;
	private clickStartMs = -1;
	private wasPressed = false;
	private loadToken = 0;
	private destroyed = false;

	constructor(stage: PIXI.Container, config: CursorRenderConfig) {
		this.stage = stage;
		this.config = config;
		this.springConfig = getCursorSpringConfig(config.smoothingFactor);
		this.springX = createSpringState();
		this.springY = createSpringState();
		this.springRotation = createSpringState();
		// Sway rotation spring: reduced damping (0.9x) and mass (0.8x) for natural wobble
		const baseSwayConfig = getCursorSpringConfig(config.smoothingFactor);
		this.swaySpringConfig = {
			stiffness: baseSwayConfig.stiffness,
			damping: baseSwayConfig.damping * 0.9,
			mass: baseSwayConfig.mass * 0.8,
		};
		this.cursorGraphics = new PIXI.Graphics();
		this.stage.addChild(this.cursorGraphics);

		if (config.cursorStyle !== "dot" && config.cursorStyle !== "hidden") {
			this.loadCursorSprite(config.cursorStyle);
		}
	}

	private loadCursorSprite(style: string): void {
		const dataUrl = CURSOR_ASSETS[style];
		if (!dataUrl) return;

		const token = ++this.loadToken;
		PIXI.Assets.load(dataUrl)
			.then((texture: PIXI.Texture) => {
				if (this.destroyed || token !== this.loadToken) return;
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
			if (this.cursorSprite) this.cursorSprite.visible = false;
			return;
		}

		// Convert absolute coords to canvas-relative
		const canvasPos = telemetryToCanvas(
			point,
			telemetry.captureRect,
			canvasWidth,
			canvasHeight
		);

		// Spring smoothing — reset on seeks or long gaps
		const rawDt = this.lastTimeMs >= 0 ? (timeMs - this.lastTimeMs) / 1000 : 0;
		this.lastTimeMs = timeMs;

		if (rawDt < 0 || rawDt > 0.5) {
			// Seek or long stall: snap springs to target
			this.springX = { value: canvasPos.x, velocity: 0, initialized: true };
			this.springY = { value: canvasPos.y, velocity: 0, initialized: true };
		} else {
			this.springX = stepSpring(
				this.springX,
				canvasPos.x,
				this.springConfig,
				rawDt
			);
			this.springY = stepSpring(
				this.springY,
				canvasPos.y,
				this.springConfig,
				rawDt
			);
		}

		const smoothX = this.springX.value;
		const smoothY = this.springY.value;

		// Sway rotation
		let swayRotation = 0;
		if (this.config.sway > 0 && rawDt > 0) {
			const dx = smoothX - this.prevSmoothedX;
			const dy = smoothY - this.prevSmoothedY;
			const targetRotation = computeCursorSwayRotation({
				dx,
				dy,
				deltaMs: rawDt * 1000,
				sway: this.config.sway,
			});
			this.springRotation = stepSpring(
				this.springRotation,
				targetRotation,
				this.swaySpringConfig,
				rawDt
			);
			swayRotation = this.springRotation.value;
		}
		this.prevSmoothedX = smoothX;
		this.prevSmoothedY = smoothY;

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
					// Recover from squeeze back to 1.0 (matches export renderer formula)
					bounceScale =
						1 -
						0.15 *
							this.config.clickBounce *
							(1 - clamp01((t - mid) / (1 - mid)));
				}
			} else {
				this.clickStartMs = -1;
			}
		}

		// Scale cursor size relative to canvas width
		const scaleFactor = canvasWidth / REFERENCE_WIDTH;
		const radius = this.config.dotRadius * scaleFactor * bounceScale;

		this.cursorGraphics.clear();

		if (this.config.cursorStyle === "dot" || !this.cursorSprite) {
			// Draw dot cursor
			this.cursorGraphics.circle(smoothX, smoothY, radius);
			this.cursorGraphics.fill({
				color: this.config.dotColor,
				alpha: this.config.dotAlpha,
			});

			// Click ring — show during entire bounce animation (matches export renderer)
			if (this.clickStartMs >= 0) {
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
			this.cursorSprite.rotation = swayRotation;
		}
	}

	updateConfig(config: Partial<CursorRenderConfig>): void {
		const prevStyle = this.config.cursorStyle;
		Object.assign(this.config, config);
		if (config.smoothingFactor !== undefined) {
			this.springConfig = getCursorSpringConfig(config.smoothingFactor);
			const base = this.springConfig;
			this.swaySpringConfig = {
				stiffness: base.stiffness,
				damping: base.damping * 0.9,
				mass: base.mass * 0.8,
			};
		}
		// Rebuild sprite when cursor style changes
		if (config.cursorStyle !== undefined && config.cursorStyle !== prevStyle) {
			if (this.cursorSprite) {
				this.cursorSprite.destroy();
				this.cursorSprite = null;
			}
			if (config.cursorStyle !== "dot" && config.cursorStyle !== "hidden") {
				this.loadCursorSprite(config.cursorStyle);
			}
		}
	}

	destroy(): void {
		this.destroyed = true;
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
		if (timeMs < points[0].t) return { point: null, nextPoint: null };

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
