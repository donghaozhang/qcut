import { describe, expect, it, vi } from "vitest";
import { resolveAnimatedTextElement } from "@/lib/text/text-element-animation";
import type { TextElement, TimelineTrack } from "@/types/timeline";
import { resolveTextRasterCrop } from "../text-raster-bounds";
import {
	extractTextRasterSources,
	type CreateTextRasterFrameCanvas,
} from "../text-raster-sources";

function animatedText({
	duration = 1,
}: {
	duration?: number;
} = {}): TextElement {
	return {
		id: "animated-title",
		name: "Animated title",
		type: "text",
		content: "Cropped animated title",
		startTime: 0,
		duration,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 72,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		width: 640,
		height: 180,
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		blendMode: "normal",
		animationType: "none",
		textAnimations: {
			schemaVersion: 1,
			entrance: {
				timing: { duration: 0.5, delay: 0, easing: "easeOut" },
				sequence: {
					unit: "all",
					order: "forward",
					staggerRatio: 0,
					seed: 1,
				},
				target: "text",
				effect: { kind: "fade", minimumOpacity: 0 },
			},
		},
	};
}

function textTracks({
	element,
	trackingTarget,
}: {
	element: TextElement;
	trackingTarget?: TimelineTrack["elements"][number];
}): TimelineTrack[] {
	const tracks: TimelineTrack[] = [];
	if (trackingTarget) {
		tracks.push({
			id: "media-track",
			type: "media",
			order: 1,
			elements: [trackingTarget],
		} as TimelineTrack);
	}
	tracks.push({
		id: "text-track",
		type: "text",
		order: 0,
		elements: [element],
	} as TimelineTrack);
	return tracks;
}

function saveFrameMock() {
	return vi.fn(
		async ({
			sequenceId,
		}: {
			sessionId: string;
			sequenceId: string;
			frameIndex: number;
			imageData: Uint8Array;
		}) => ({
			success: true,
			patternPath: `/tmp/${sequenceId}/f_%05d.png`,
		})
	);
}

function canvasFactory({
	created,
	translate,
}: {
	created: Array<{ width: number; height: number }>;
	translate: ReturnType<typeof vi.fn>;
}): CreateTextRasterFrameCanvas {
	return ({ width, height }) => {
		created.push({ width, height });
		const context = {
			clearRect: vi.fn(),
			save: vi.fn(),
			translate,
			restore: vi.fn(),
		} as unknown as OffscreenCanvasRenderingContext2D;
		return {
			width,
			height,
			getContext: () => context,
			convertToBlob: async () =>
				new Blob([new Uint8Array([137, 80, 78, 71])], {
					type: "image/png",
				}),
		};
	};
}

describe("animated text raster crop and budgets", () => {
	it("renders into a crop far smaller than a 4K project while keeping project-space coordinates", async () => {
		const created: Array<{ width: number; height: number }> = [];
		const translate = vi.fn();
		const renderFrame = vi.fn();
		const result = await extractTextRasterSources({
			tracks: textTracks({ element: animatedText() }),
			sessionId: "session",
			canvasWidth: 3840,
			canvasHeight: 2160,
			fps: 10,
			api: { saveEffectSequenceFrame: saveFrameMock() },
			createCanvas: canvasFactory({ created, translate }),
			renderFrame,
			logger: vi.fn(),
		});

		expect(created).toHaveLength(1);
		expect(created[0].width).toBeLessThan(1_000);
		expect(created[0].height).toBeLessThan(500);
		expect(created[0].width * created[0].height).toBeLessThan(
			3840 * 2160 * 0.05
		);
		expect(renderFrame.mock.calls[0][0].canvas).toEqual({
			width: 3840,
			height: 2160,
		});
		expect(translate).toHaveBeenCalledWith(-result[0].x, -result[0].y);
		expect(result[0].x).toBeGreaterThan(0);
		expect(result[0].y).toBeGreaterThan(0);
	});

	it("unions sampled tracking, keyframed position, and rotated geometry", () => {
		const element = animatedText();
		element.trackingTargetId = "target";
		element.trackingRotation = true;
		element.keyframes = {
			x: [
				{ id: "x0", frame: 0, value: -500, easing: "linear" },
				{ id: "x1", frame: 9, value: 500, easing: "linear" },
			],
			rotation: [
				{ id: "r0", frame: 0, value: 0, easing: "linear" },
				{ id: "r1", frame: 9, value: 45, easing: "linear" },
			],
		};
		const trackingTarget = {
			id: "target",
			name: "Target",
			type: "media",
			mediaId: "media",
			startTime: 0,
			duration: 1,
			trimStart: 0,
			trimEnd: 0,
			x: 120,
			y: 80,
			width: 640,
			height: 360,
			rotation: 15,
			opacity: 1,
			volume: 1,
		} as TimelineTrack["elements"][number];
		const tracks = textTracks({ element, trackingTarget });
		const crop = resolveTextRasterCrop({
			job: { element, startTime: 0, frameCount: 10 },
			tracks,
			canvasWidth: 3840,
			canvasHeight: 2160,
			fps: 10,
		});
		const first = resolveAnimatedTextElement({
			element,
			tracks,
			currentTime: 0,
			fps: 10,
		});
		const last = resolveAnimatedTextElement({
			element,
			tracks,
			currentTime: 0.9,
			fps: 10,
		});

		for (const resolved of [first, last]) {
			const centerX = 1920 + resolved.x;
			const centerY = 1080 + resolved.y;
			const radians = (resolved.rotation * Math.PI) / 180;
			const halfWidth =
				Math.abs(Math.cos(radians)) * 320 + Math.abs(Math.sin(radians)) * 90;
			const halfHeight =
				Math.abs(Math.sin(radians)) * 320 + Math.abs(Math.cos(radians)) * 90;
			expect(crop.x).toBeLessThan(centerX - halfWidth);
			expect(crop.x + crop.width).toBeGreaterThan(centerX + halfWidth);
			expect(crop.y).toBeLessThan(centerY - halfHeight);
			expect(crop.y + crop.height).toBeGreaterThan(centerY + halfHeight);
		}
		expect(crop.width).toBeGreaterThan(1_500);
		expect(crop.width).toBeLessThan(3_840);
	});

	it("keeps italic and large-glyph metric overhang at a project edge", () => {
		const element = animatedText();
		element.content = "𝑾😀";
		element.fontStyle = "italic";
		element.fontSize = 200;
		element.width = 400;
		element.height = 240;
		element.x = -1820;
		const crop = resolveTextRasterCrop({
			job: { element, startTime: 0, frameCount: 10 },
			tracks: textTracks({ element }),
			canvasWidth: 3840,
			canvasHeight: 2160,
			fps: 10,
		});

		expect(crop.x).toBe(0);
		expect(crop.x + crop.width).toBeGreaterThanOrEqual(372);
		expect(crop.height).toBeGreaterThanOrEqual(380);
	});

	it("reserves overscan for orbit, blur, glow, stroke, hearts, and laser", () => {
		const element = animatedText();
		element.strokeWidth = 20;
		element.glowOpacity = 1;
		element.glowBlur = 30;
		element.shadowOpacity = 1;
		element.shadowBlur = 20;
		element.shadowOffsetX = 40;
		element.textAnimations = {
			schemaVersion: 1,
			entrance: {
				timing: { duration: 0.3, delay: 0, easing: "linear" },
				sequence: {
					unit: "all",
					order: "forward",
					staggerRatio: 0,
					seed: 1,
				},
				target: "text",
				effect: {
					kind: "heart",
					direction: "up",
					distance: { value: 0.3, unit: "boxHeight" },
					hiddenScale: 0.5,
					color: "#ff0000",
					particleCount: 8,
					spread: 1,
					seed: 1,
				},
			},
			loop: {
				timing: { duration: 0.3, delay: 0, easing: "linear" },
				sequence: {
					unit: "all",
					order: "forward",
					staggerRatio: 0,
					seed: 1,
				},
				target: "text",
				effect: {
					kind: "orbit",
					rotation: "clockwise",
					turns: 1,
					radius: { value: 0.4, unit: "boxWidth" },
					fade: false,
				},
				repeat: { mode: "restart", gap: 0, phaseOffset: 0 },
			},
			exit: {
				timing: { duration: 0.3, delay: 0, easing: "linear" },
				sequence: {
					unit: "all",
					order: "forward",
					staggerRatio: 0,
					seed: 1,
				},
				target: "text",
				effect: {
					kind: "laser",
					direction: "right",
					color: "#00ffff",
					thicknessPx: 8,
					glowPx: 30,
					trail: 1,
					fade: true,
				},
			},
		};
		const crop = resolveTextRasterCrop({
			job: { element, startTime: 0, frameCount: 10 },
			tracks: textTracks({ element }),
			canvasWidth: 3840,
			canvasHeight: 2160,
			fps: 10,
		});

		expect(crop.width).toBeGreaterThan(1_700);
		expect(crop.height).toBeGreaterThan(1_400);
		expect(crop.width).toBeLessThan(3_840);
		expect(crop.height).toBeLessThanOrEqual(2_160);

		const blurElement = animatedText();
		const entrance = blurElement.textAnimations?.entrance;
		if (!entrance) throw new Error("Expected entrance animation fixture");
		blurElement.textAnimations = {
			schemaVersion: 1,
			entrance: {
				...entrance,
				effect: { kind: "blur", radiusPx: 80, fade: true },
			},
		};
		const blurCrop = resolveTextRasterCrop({
			job: { element: blurElement, startTime: 0, frameCount: 10 },
			tracks: textTracks({ element: blurElement }),
			canvasWidth: 3840,
			canvasHeight: 2160,
			fps: 10,
		});
		expect(blurCrop.width).toBeGreaterThan(1_200);
		expect(blurCrop.height).toBeGreaterThan(700);
	});

	it("rejects frame and pixel budgets before writing sequence files", async () => {
		const saveEffectSequenceFrame = saveFrameMock();
		const base = {
			tracks: textTracks({ element: animatedText() }),
			sessionId: "session",
			canvasWidth: 3840,
			canvasHeight: 2160,
			fps: 10,
			api: { saveEffectSequenceFrame },
			createCanvas: canvasFactory({ created: [], translate: vi.fn() }),
			renderFrame: vi.fn(),
			logger: vi.fn(),
		};
		await expect(
			extractTextRasterSources({
				...base,
				limits: { maxFrames: 9 },
			})
		).rejects.toThrow("frame budget exceeded");
		await expect(
			extractTextRasterSources({
				...base,
				limits: { maxPixelsPerFrame: 10 },
			})
		).rejects.toThrow("pixel budget exceeded");
		await expect(
			extractTextRasterSources({
				...base,
				limits: { maxPixelFrames: 100 },
			})
		).rejects.toThrow("pixel-frame budget exceeded");
		expect(saveEffectSequenceFrame).not.toHaveBeenCalled();
	});

	it("stops an in-flight bake before saving after its AbortController fires", async () => {
		const controller = new AbortController();
		const saveEffectSequenceFrame = saveFrameMock();
		await expect(
			extractTextRasterSources({
				tracks: textTracks({ element: animatedText() }),
				sessionId: "session",
				canvasWidth: 3840,
				canvasHeight: 2160,
				fps: 10,
				api: { saveEffectSequenceFrame },
				createCanvas: canvasFactory({ created: [], translate: vi.fn() }),
				renderFrame: () => controller.abort(),
				logger: vi.fn(),
				shouldCancel: () => controller.signal.aborted,
			})
		).rejects.toThrow("Export cancelled by user");
		expect(saveEffectSequenceFrame).not.toHaveBeenCalled();
	});

	it("honors cancellation during geometry sampling before saving frames", async () => {
		const saveEffectSequenceFrame = saveFrameMock();
		let checks = 0;
		await expect(
			extractTextRasterSources({
				tracks: textTracks({ element: animatedText() }),
				sessionId: "session",
				canvasWidth: 3840,
				canvasHeight: 2160,
				fps: 10,
				api: { saveEffectSequenceFrame },
				createCanvas: canvasFactory({ created: [], translate: vi.fn() }),
				renderFrame: vi.fn(),
				logger: vi.fn(),
				shouldCancel: () => {
					checks += 1;
					return checks >= 4;
				},
			})
		).rejects.toThrow("Export cancelled by user");
		expect(saveEffectSequenceFrame).not.toHaveBeenCalled();
	});
});
