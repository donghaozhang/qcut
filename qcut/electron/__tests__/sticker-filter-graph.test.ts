import { describe, expect, it } from "vitest";
import { buildStickerFilterGraph } from "../ffmpeg/sticker-filter-graph";
import type { StickerPropertyKeyframe, StickerSource } from "../ffmpeg/types";

function stickerSource({
	overrides = {},
}: {
	overrides?: Partial<StickerSource>;
}): StickerSource {
	return {
		id: "sticker-1",
		path: "/tmp/sticker.png",
		x: 100,
		y: 80,
		width: 200,
		height: 100,
		canvasWidth: 1920,
		canvasHeight: 1080,
		startTime: 2,
		endTime: 6,
		zIndex: 1,
		opacity: 1,
		rotation: 0,
		maintainAspectRatio: false,
		...overrides,
	};
}

function keyframe({
	frame,
	value,
	id = `${frame}-${value}`,
	easing = "linear",
}: {
	frame: number;
	value: number;
	id?: string;
	easing?: StickerPropertyKeyframe["easing"];
}): StickerPropertyKeyframe {
	return { id, frame, value, easing };
}

describe("sticker filter graph", () => {
	it("keeps static stickers centered after preparation", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({}),
			labelPrefix: "sticker_0",
		});

		expect(graph.filterSteps).toEqual(["[1:v]scale=200:100[sticker_0_scaled]"]);
		expect(graph.inputLabel).toBe("sticker_0_scaled");
		expect(graph.x).toBe("'200-overlay_w/2+((0))'");
		expect(graph.y).toBe("'130-overlay_h/2+((0))'");
	});

	it("preserves aspect ratio and applies four-corner perspective", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					maintainAspectRatio: true,
					perspective: {
						topLeftX: 0.1,
						topLeftY: 0.2,
						topRightX: 0.9,
						topRightY: 0,
						bottomRightX: 1,
						bottomRightY: 0.9,
						bottomLeftX: 0,
						bottomLeftY: 1,
					},
				},
			}),
			labelPrefix: "sticker_1",
		});

		expect(graph.filterSteps).toContain(
			"[1:v]scale=200:100:force_original_aspect_ratio=decrease[sticker_1_scaled]"
		);
		expect(graph.filterSteps).toContain(
			"[sticker_1_scaled]pad=200:100:(ow-iw)/2:(oh-ih)/2:color=0x00000000[sticker_1_padded]"
		);
		expect(graph.filterSteps.join(";")).toContain(
			"perspective=x0='W*0.1':y0='H*0.2'"
		);
	});

	it("refits aspect-locked content inside each keyframed size", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					maintainAspectRatio: true,
					keyframeFps: 30,
					keyframes: {
						width: [
							keyframe({ frame: 0, value: 20 }),
							keyframe({ frame: 30, value: 40 }),
						],
						height: [
							keyframe({ frame: 0, value: 40 }),
							keyframe({ frame: 30, value: 20 }),
						],
					},
				},
			}),
			labelPrefix: "sticker_aspect_keyframes",
		});
		const filters = graph.filterSteps.join(";");
		const contentScale = graph.filterSteps.find((step) =>
			step.includes("[sticker_aspect_keyframes_normalized_content]")
		);
		const canvasScale = graph.filterSteps.find((step) =>
			step.includes("[sticker_aspect_keyframes_normalized_canvas]")
		);
		const normalizedIndex = graph.filterSteps.findIndex((step) =>
			step.includes("[sticker_aspect_keyframes_normalized]")
		);
		const keyframeScaleIndex = graph.filterSteps.findIndex((step) =>
			step.includes("[sticker_aspect_keyframes_keyframe_scale]")
		);

		expect(graph.filterSteps[0]).toBe(
			"[1:v]fps=30[sticker_aspect_keyframes_fps]"
		);
		expect(filters).not.toContain("sticker_aspect_keyframes_padded");
		expect(filters).toContain(
			"[sticker_aspect_keyframes_fps]split=2" +
				"[sticker_aspect_keyframes_normalized_content_source]" +
				"[sticker_aspect_keyframes_normalized_canvas_source]"
		);
		expect(contentScale).toContain("432*min(1\\,(iw*max(1\\,");
		expect(contentScale).toContain("432*min(1\\,(max(1\\,");
		expect(contentScale).toContain("eval=frame");
		expect(canvasScale).toContain("format=rgba,colorchannelmixer=aa=0");
		expect(canvasScale).toContain("scale=432:432");
		expect(filters).toContain(
			"[sticker_aspect_keyframes_normalized_canvas]" +
				"[sticker_aspect_keyframes_normalized_content]overlay=" +
				"x='(W-w)/2':y='(H-h)/2'"
		);
		expect(keyframeScaleIndex).toBeGreaterThan(normalizedIndex);
		expect(graph.filterSteps[keyframeScaleIndex]).toContain("eval=frame");
	});

	it("warps a fixed normalized canvas before asynchronous aspect-locked scaling", () => {
		const pair = ({ from, to }: { from: number; to: number }) => [
			keyframe({ frame: 0, value: from }),
			keyframe({ frame: 30, value: to }),
		];
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					maintainAspectRatio: true,
					keyframeFps: 30,
					keyframes: {
						width: pair({ from: 20, to: 40 }),
						height: [
							keyframe({ frame: 0, value: 35 }),
							keyframe({ frame: 15, value: 18 }),
							keyframe({ frame: 30, value: 30 }),
						],
						topLeftX: pair({ from: 0, to: 0.08 }),
						topLeftY: pair({ from: 0, to: 0.06 }),
						topRightX: pair({ from: 1, to: 0.94 }),
						topRightY: pair({ from: 0, to: 0.04 }),
						bottomRightX: pair({ from: 1, to: 0.96 }),
						bottomRightY: pair({ from: 1, to: 0.92 }),
						bottomLeftX: pair({ from: 0, to: 0.05 }),
						bottomLeftY: pair({ from: 1, to: 0.95 }),
					},
				},
			}),
			labelPrefix: "sticker_dynamic_perspective",
		});
		const filters = graph.filterSteps.join(";");
		const contentScale = graph.filterSteps.find((step) =>
			step.includes("[sticker_dynamic_perspective_normalized_content]")
		);
		const normalizedCanvas = graph.filterSteps.find((step) =>
			step.includes("[sticker_dynamic_perspective_normalized_canvas]")
		);
		const normalizedIndex = graph.filterSteps.findIndex((step) =>
			step.includes("[sticker_dynamic_perspective_normalized]")
		);
		const perspectiveIndex = graph.filterSteps.findIndex((step) =>
			step.includes("perspective=")
		);
		const keyframeScaleIndex = graph.filterSteps.findIndex((step) =>
			step.includes("_keyframe_scale]")
		);

		expect(contentScale).toContain("432*min(1\\,(iw*max(1\\,");
		expect(contentScale).toContain("432*min(1\\,(max(1\\,");
		expect(normalizedCanvas).toContain(
			"scale=432:432,format=rgba,colorchannelmixer=aa=0"
		);
		expect(filters).toContain(
			"[sticker_dynamic_perspective_normalized_canvas]" +
				"[sticker_dynamic_perspective_normalized_content]overlay=" +
				"x='(W-w)/2':y='(H-h)/2'"
		);
		expect(perspectiveIndex).toBeGreaterThan(normalizedIndex);
		expect(keyframeScaleIndex).toBeGreaterThan(perspectiveIndex);
		expect(graph.filterSteps[perspectiveIndex]).toContain(
			"[sticker_dynamic_perspective_normalized]perspective="
		);
		expect(graph.filterSteps[keyframeScaleIndex]).toContain(
			"[sticker_dynamic_perspective_perspective]scale="
		);
		expect(graph.filterSteps[perspectiveIndex]).toContain("eval=frame");
	});

	it("builds matching entrance, exit, and loop expressions", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					animationInType: "slide-left",
					animationInDuration: 0.5,
					animationOutType: "fade",
					animationOutDuration: 0.75,
					animationLoopType: "pulse",
					animationLoopIntensity: 1,
				},
			}),
			labelPrefix: "sticker_2",
		});
		const filters = graph.filterSteps.join(";");

		expect(filters).toContain("animated_scale");
		expect(filters).toContain("geq=");
		expect(graph.x).toContain("480");
		expect(graph.x).toContain("max(0\\,t-2)");
		expect(filters).toContain("sin((max(0\\,t-2))*2*PI)*0.06");
	});

	it("uses a center-preserving output box for animated rotation", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					rotation: 30,
					animationLoopType: "spin",
					animationLoopIntensity: 0.5,
				},
			}),
			labelPrefix: "sticker_3",
		});

		expect(graph.filterSteps.join(";")).toContain(
			"rotate='(30+((0)+((max(0\\,t-2))*45)))*PI/180'"
		);
		expect(graph.x).toContain("overlay_w/2");
		expect(graph.y).toContain("overlay_h/2");
	});

	it("uses clip-local time for scale, rotation, alpha, and overlay motion", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					startTime: 3.25,
					endTime: 7.25,
					animationInType: "zoom-in",
					animationInDuration: 0.5,
					animationOutType: "fade",
					animationOutDuration: 0.5,
					animationLoopType: "spin",
					animationLoopIntensity: 1,
				},
			}),
			labelPrefix: "sticker_local_time",
		});
		const scaleStep = graph.filterSteps.find((step) =>
			step.includes("animated_scale")
		);
		const rotationStep = graph.filterSteps.find((step) =>
			step.includes("_rotated]")
		);
		const alphaStep = graph.filterSteps.find((step) =>
			step.includes("_alpha]")
		);

		expect(scaleStep).toContain("max(0\\,t-3.25)");
		expect(rotationStep).toContain("max(0\\,t-3.25)");
		expect(alphaStep).toContain("max(0\\,T-3.25)");
	});

	it("uses default coordinates for non-finite perspective values", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					perspective: {
						topLeftX: Number.NaN,
						topLeftY: Number.POSITIVE_INFINITY,
						topRightX: Number.POSITIVE_INFINITY,
						topRightY: Number.NaN,
						bottomRightX: Number.POSITIVE_INFINITY,
						bottomRightY: Number.NEGATIVE_INFINITY,
						bottomLeftX: Number.NaN,
						bottomLeftY: Number.NEGATIVE_INFINITY,
					},
				},
			}),
			labelPrefix: "sticker_invalid_perspective",
		});

		expect(graph.filterSteps).toEqual([
			"[1:v]scale=200:100[sticker_invalid_perspective_scaled]",
		]);
	});

	it("clamps perspective coordinates to the supported unit interval", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					perspective: {
						topLeftX: -2,
						topLeftY: 2,
						topRightX: 5,
						topRightY: -4,
						bottomRightX: -1,
						bottomRightY: 2,
						bottomLeftX: 3,
						bottomLeftY: -3,
					},
				},
			}),
			labelPrefix: "sticker_clamped_perspective",
		});
		const filters = graph.filterSteps.join(";");

		expect(filters).toContain(
			"perspective=x0='W*0':y0='H*1':x1='W*1':y1='H*0':" +
				"x2='W*1':y2='H*0':x3='W*0':y3='H*1'"
		);
		expect(filters).not.toContain("NaN");
		expect(filters).not.toContain("Infinity");
	});

	it("builds all fourteen sticker keyframe properties with verified time variables", () => {
		const pair = ({ from, to }: { from: number; to: number }) => [
			keyframe({ frame: 0, value: from }),
			keyframe({ frame: 30, value: to }),
		];
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					keyframeFps: 30,
					keyframes: {
						x: pair({ from: 25, to: 75 }),
						y: pair({ from: 30, to: 70 }),
						width: pair({ from: 20, to: 40 }),
						height: pair({ from: 15, to: 30 }),
						rotation: pair({ from: 0, to: 90 }),
						opacity: pair({ from: 1, to: 0.25 }),
						topLeftX: pair({ from: 0, to: 0.1 }),
						topLeftY: pair({ from: 0, to: 0.12 }),
						topRightX: pair({ from: 1, to: 0.9 }),
						topRightY: pair({ from: 0, to: 0.08 }),
						bottomRightX: pair({ from: 1, to: 0.95 }),
						bottomRightY: pair({ from: 1, to: 0.9 }),
						bottomLeftX: pair({ from: 0, to: 0.05 }),
						bottomLeftY: pair({ from: 1, to: 0.92 }),
					},
				},
			}),
			labelPrefix: "sticker_keyframes",
		});
		const filters = graph.filterSteps.join(";");
		const fpsIndex = graph.filterSteps.findIndex((step) =>
			step.includes("]fps=30[")
		);
		const keyframeScaleIndex = graph.filterSteps.findIndex((step) =>
			step.includes("_keyframe_scale]")
		);
		const perspectiveIndex = graph.filterSteps.findIndex((step) =>
			step.includes("perspective=")
		);
		const animationScaleIndex = graph.filterSteps.findIndex((step) =>
			step.includes("_animated_scale]")
		);

		expect(fpsIndex).toBeGreaterThan(0);
		expect(perspectiveIndex).toBeGreaterThan(fpsIndex);
		expect(keyframeScaleIndex).toBeGreaterThan(perspectiveIndex);
		expect(animationScaleIndex).toBe(-1);
		expect(filters).toContain("on/30");
		expect(filters).toContain("eval=frame");
		expect(filters).toContain("max(0\\,t-2)");
		expect(filters).toContain("max(0\\,T-2)");
		expect(filters).toContain("_rotated]");
		expect(filters).toContain("_alpha]");
		expect(graph.x).toContain("*1920/100-overlay_w/2");
		expect(graph.y).toContain("*1080/100-overlay_h/2");
	});

	it("sanitizes malformed values while preserving valid out-of-canvas transforms", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					endTime: 3,
					keyframeFps: 1_000,
					keyframes: {
						width: [
							keyframe({ frame: -20, value: 25, id: "width-first" }),
							keyframe({ frame: 0, value: -100, id: "width-last" }),
							keyframe({ frame: 9_999, value: 500 }),
							keyframe({ frame: Number.NaN, value: 50 }),
						],
						x: [
							keyframe({ frame: 0, value: -200 }),
							keyframe({ frame: 240, value: 300 }),
						],
						rotation: [
							keyframe({ frame: 0, value: -720 }),
							keyframe({ frame: 240, value: 900 }),
						],
						opacity: [
							keyframe({ frame: 0, value: -5 }),
							keyframe({ frame: 240, value: 8 }),
							keyframe({ frame: 10, value: Number.POSITIVE_INFINITY }),
						],
						topLeftX: [
							keyframe({ frame: 0, value: -3 }),
							keyframe({ frame: 240, value: 4 }),
						],
					},
				},
			}),
			labelPrefix: "sticker_sanitized",
		});
		const filters = graph.filterSteps.join(";");

		expect(filters).toContain("]fps=240[");
		expect(filters).toContain("0+((500)-(0))");
		expect(filters).toContain("0+((1)-(0))");
		expect(filters).toContain("-720+((900)-(-720))");
		expect(graph.x).toContain("-200+((300)-(-200))");
		expect(filters).not.toContain("-100");
		expect(filters).not.toContain("9999");
		expect(filters).not.toContain("NaN");
		expect(filters).not.toContain("Infinity");
	});

	it("honors keyframes even when the static values are defaults", () => {
		const defaults = [
			keyframe({ frame: 0, value: 0 }),
			keyframe({ frame: 30, value: 0 }),
		];
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					rotation: 0,
					opacity: 1,
					keyframeFps: 30,
					keyframes: {
						x: [
							keyframe({ frame: 0, value: 50 }),
							keyframe({ frame: 30, value: 50 }),
						],
						width: [
							keyframe({ frame: 0, value: 15 }),
							keyframe({ frame: 30, value: 15 }),
						],
						rotation: defaults,
						opacity: [
							keyframe({ frame: 0, value: 1 }),
							keyframe({ frame: 30, value: 1 }),
						],
						topLeftX: defaults,
					},
				},
			}),
			labelPrefix: "sticker_defaults",
		});
		const filters = graph.filterSteps.join(";");

		expect(filters).toContain("]fps=30[");
		expect(filters).toContain("_keyframe_scale]");
		expect(filters).toContain("perspective=");
		expect(filters).toContain("eval=frame");
		expect(filters).toContain("_rotated]");
		expect(filters).toContain("_alpha]");
		expect(graph.x).toContain("*1920/100-overlay_w/2");
	});

	it("normalizes clip and loop animation streams to the project frame rate", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					keyframeFps: 60,
					animationInType: "fade",
					animationInDuration: 0.5,
					animationLoopType: "pulse",
					animationLoopIntensity: 1,
				},
			}),
			labelPrefix: "sticker_animation_fps",
		});

		expect(graph.filterSteps[1]).toBe(
			"[sticker_animation_fps_scaled]fps=60[sticker_animation_fps_fps]"
		);
		expect(graph.filterSteps.join(";")).toContain("max(0\\,t-2)");
		expect(graph.filterSteps.join(";")).toContain("max(0\\,T-2)");
	});

	it("uses exact linear interpolation for authored linear keyframes", () => {
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			sticker: stickerSource({
				overrides: {
					keyframeFps: 30,
					keyframes: {
						x: [
							keyframe({ frame: 0, value: 10 }),
							keyframe({ frame: 15, value: 40 }),
						],
					},
				},
			}),
			labelPrefix: "sticker_linear",
		});

		expect(graph.x).toContain("10+((40)-(10))");
		expect(graph.x).toContain("/0.5");
		expect(graph.x).not.toContain("pow(");
	});

	it("applies nonlinear easing with bounded FFmpeg expressions", () => {
		const expressionMarkers = {
			easeIn: "pow(",
			easeOut: "1-pow(",
			easeInOut: "pow(-2*",
			spring: "sin(",
		} as const;
		for (const [easing, marker] of Object.entries(expressionMarkers) as Array<
			[StickerPropertyKeyframe["easing"], string]
		>) {
			const graph = buildStickerFilterGraph({
				inputLabel: "1:v",
				sticker: stickerSource({
					overrides: {
						keyframeFps: 30,
						endTime: 602,
						keyframes: {
							x: [
								keyframe({ frame: 0, value: 10 }),
								keyframe({ frame: 18_000, value: 40, easing }),
							],
						},
					},
				}),
				labelPrefix: `sticker_${easing}`,
			});

			expect(graph.x).toContain(marker);
			expect(graph.x.length).toBeLessThan(1_000);
		}
	});
});
