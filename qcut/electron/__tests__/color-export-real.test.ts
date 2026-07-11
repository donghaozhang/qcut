import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";
import { DEFAULT_VIDEO_COLOR_SETTINGS } from "../ffmpeg/color-settings";
import type { VideoVisual } from "../ffmpeg/types";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const fixturePath = path.resolve(
	__dirname,
	"../../apps/web/src/test/e2e/fixtures/media/sample-video.mp4"
);
const tempDir = path.resolve(__dirname, "../../.tmp/color-export-real-test");

function fullColorVisual({
	wheelMode,
}: {
	wheelMode: "tonal" | "lift-gamma-gain";
}): VideoVisual {
	const color = structuredClone(DEFAULT_VIDEO_COLOR_SETTINGS);
	color.basic = {
		...color.basic,
		exposure: -0.3,
		highlights: -18,
		shadows: 24,
		vibrance: 32,
		grain: 8,
	};
	color.lut = {
		enabled: true,
		presetId: "test",
		name: "Native export test",
		intensity: 72,
		skinProtection: 45,
		cube: {
			size: 2,
			domainMin: [0, 0, 0],
			domainMax: [1, 1, 1],
			values: [
				0, 0, 0, 1, 0.08, 0, 0.04, 1, 0, 1, 1, 0.04, 0, 0.04, 1, 1, 0.08, 1,
				0.04, 1, 1, 1, 1, 1,
			],
		},
	};
	color.hsl.enabled = true;
	color.hsl.ranges = {
		red: { hue: 18, saturation: 28, luminance: 0 },
	};
	color.curves.enabled = true;
	color.curves.master = [
		{ id: "black", x: 0, y: 0 },
		{ id: "middle", x: 0.5, y: 0.62 },
		{ id: "white", x: 1, y: 1 },
	];
	color.secondaryCurves.enabled = true;
	color.secondaryCurves.hueVsSaturation.samples = Array.from(
		{ length: 257 },
		(_, index) =>
			0.5 + Math.max(0, 1 - Math.abs(index / 256 - 240 / 360) * 8) * 0.2
	);
	color.wheels.enabled = true;
	color.wheels.mode = wheelMode;
	color.wheels.shadows = { x: -0.18, y: 0.12, luminance: 8 };
	color.smart = {
		enabled: true,
		intensity: 70,
		autoWhiteBalance: true,
		autoTone: true,
		status: "ready",
		correction: {
			exposure: -0.4,
			contrast: -12,
			temperature: 10,
			tint: -4,
			saturation: -8,
		},
	};
	color.mask = { enabled: true, maskIds: ["grade-1"], invert: false };
	color.management = {
		enabled: true,
		inputSpace: "display-p3",
		workingSpace: "acescg",
		outputSpace: "rec709",
		toneMapping: "aces",
		peakNits: 1_000,
	};
	color.keyframes = {
		"basic.exposure": [
			{ id: "exposure-start", frame: 0, value: 0.6, easing: "linear" },
			{ id: "exposure-end", frame: 30, value: -0.3, easing: "linear" },
		],
		"basic.vibrance": [
			{ id: "vibrance-start", frame: 0, value: 0, easing: "linear" },
			{ id: "vibrance-end", frame: 30, value: 32, easing: "easeInOut" },
		],
		"basic.sharpness": [
			{ id: "sharpness-start", frame: 0, value: 0, easing: "linear" },
			{ id: "sharpness-end", frame: 30, value: 30, easing: "easeOut" },
		],
		"lut.intensity": [
			{ id: "lut-start", frame: 0, value: 20, easing: "linear" },
			{ id: "lut-end", frame: 30, value: 72, easing: "easeInOut" },
		],
		"lut.skinProtection": [
			{ id: "skin-start", frame: 0, value: 0, easing: "linear" },
			{ id: "skin-end", frame: 30, value: 45, easing: "linear" },
		],
		"hsl.red.hue": [
			{ id: "hue-start", frame: 0, value: 0, easing: "linear" },
			{ id: "hue-end", frame: 30, value: 18, easing: "easeIn" },
		],
		"hsl.red.saturation": [
			{ id: "hsl-sat-start", frame: 0, value: 0, easing: "linear" },
			{ id: "hsl-sat-end", frame: 30, value: 28, easing: "linear" },
		],
		"curves.mix": [
			{ id: "curve-start", frame: 0, value: 0, easing: "linear" },
			{ id: "curve-end", frame: 30, value: 100, easing: "easeInOut" },
		],
		"secondaryCurves.mix": [
			{ id: "secondary-start", frame: 0, value: 25, easing: "linear" },
			{ id: "secondary-end", frame: 30, value: 100, easing: "easeInOut" },
		],
		"wheels.shadows.x": [
			{ id: "wheel-x-start", frame: 0, value: 0, easing: "linear" },
			{ id: "wheel-x-end", frame: 30, value: -0.18, easing: "linear" },
		],
		"wheels.shadows.y": [
			{ id: "wheel-y-start", frame: 0, value: 0, easing: "linear" },
			{ id: "wheel-y-end", frame: 30, value: 0.12, easing: "linear" },
		],
		"wheels.shadows.luminance": [
			{ id: "wheel-luma-start", frame: 0, value: 0, easing: "linear" },
			{ id: "wheel-luma-end", frame: 30, value: 8, easing: "linear" },
		],
		"wheels.balance": [
			{ id: "balance-start", frame: 0, value: -20, easing: "linear" },
			{ id: "balance-end", frame: 30, value: 20, easing: "linear" },
		],
	};
	color.curveShapeKeyframes = {
		"curves.master": [
			{
				id: "rgb-shape-start",
				frame: 0,
				points: [
					{ id: "black", x: 0, y: 0 },
					{ id: "middle", x: 0.5, y: 0.5 },
					{ id: "white", x: 1, y: 1 },
				],
				easing: "linear",
			},
			{
				id: "rgb-shape-end",
				frame: 30,
				points: color.curves.master.map((point) => ({ ...point })),
				easing: "easeInOut",
			},
		],
		"secondaryCurves.hueVsSaturation": [
			{
				id: "secondary-shape-start",
				frame: 0,
				points: [
					{ id: "start", x: 0, y: 0.5 },
					{ id: "end", x: 1, y: 0.5 },
				],
				samples: new Array<number>(257).fill(0.5),
				easing: "linear",
			},
			{
				id: "secondary-shape-end",
				frame: 30,
				points: color.secondaryCurves.hueVsSaturation.points.map((point) => ({
					...point,
				})),
				samples: [...color.secondaryCurves.hueVsSaturation.samples],
				easing: "easeInOut",
			},
		],
	};

	return {
		x: 0,
		y: 0,
		rotation: 0,
		scaleX: 1,
		scaleY: 1,
		flipHorizontal: false,
		flipVertical: false,
		opacity: 1,
		blendMode: "normal",
		fitMode: "cover",
		crop: { top: 0, right: 0, bottom: 0, left: 0 },
		perspective: {
			topLeftX: 0,
			topLeftY: 0,
			topRightX: 1,
			topRightY: 0,
			bottomRightX: 1,
			bottomRightY: 1,
			bottomLeftX: 0,
			bottomLeftY: 1,
		},
		color,
		masks: [
			{
				id: "grade-1",
				name: "Grade mask 1",
				enabled: true,
				type: "ellipse",
				blendMode: "add",
				centerX: 0.5,
				centerY: 0.5,
				width: 0.65,
				height: 0.65,
				rotation: 0,
				feather: 0.12,
				roundness: 0,
				expansion: 0,
				opacity: 1,
				maintainAspectRatio: false,
				invert: false,
			},
		],
		keyframeFps: 30,
	};
}

describe.skipIf(!fs.existsSync(ffmpegPath))(
	"Professional color export - real FFmpeg",
	// Real ffmpeg renders regularly exceed the 5s default testTimeout on CI runners.
	{ timeout: 60_000 },
	() => {
		beforeAll(() => {
			fs.mkdirSync(tempDir, { recursive: true });
		});

		afterAll(() => {
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it.each([
			"tonal",
			"lift-gamma-gain",
		] as const)("renders animated color with %s wheels and a grade mask", (wheelMode) => {
			const outputPath = path.join(tempDir, `complete-color-${wheelMode}.mp4`);
			const args = buildFFmpegArgs({
				inputDir: tempDir,
				outputFile: outputPath,
				width: 320,
				height: 180,
				fps: 30,
				quality: "low",
				duration: 1,
				videoSources: [
					{
						path: fixturePath,
						startTime: 0,
						duration: 1,
						visual: fullColorVisual({ wheelMode }),
					},
				],
			});
			const verboseArgs = [args[0], "-loglevel", "verbose", ...args.slice(1)];
			const result = spawnSync(ffmpegPath, verboseArgs, {
				encoding: "utf8",
				timeout: 60_000,
			});

			expect(result.status, result.stderr).toBe(0);
			expect(result.stderr).toContain("Processing command");
			expect(result.stderr).not.toContain("Function not implemented");
			expect(fs.statSync(outputPath).size).toBeGreaterThan(5_000);
		});
	}
);
