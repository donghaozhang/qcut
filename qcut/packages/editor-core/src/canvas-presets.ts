/**
 * Canvas ratio catalog shared by the preview ratio menu, the first-media
 * auto-canvas snap and the `qcut editor project update-settings --ratio` CLI.
 *
 * Electron cannot import this package at runtime, so
 * electron/native-pipeline/editor/canvas-presets.ts mirrors the catalog and
 * electron/__tests__/canvas-presets-mirror.test.ts pins the two in sync.
 *
 * @module @qcut/editor-core/canvas-presets
 */

import type { CanvasPreset, CanvasSize } from "./types/editor.js";

/**
 * Landscape section first, then portrait, matching the layout editors expect.
 * Every dimension is even so H.264/yuv420p export never sees an odd size;
 * "5.8寸" is the 9:19.5 phone-screen ratio at even dimensions rather than the
 * native 1125×2436 panel.
 */
export const DEFAULT_CANVAS_PRESETS: readonly CanvasPreset[] = [
	{
		badgeKey: "editor.preview.ratioBadgeXigua",
		group: "landscape",
		height: 1080,
		name: "16:9",
		width: 1920,
	},
	{ group: "landscape", height: 1080, name: "4:3", width: 1440 },
	{ group: "landscape", height: 816, name: "2.35:1", width: 1920 },
	{ group: "landscape", height: 960, name: "2:1", width: 1920 },
	{ group: "landscape", height: 1038, name: "1.85:1", width: 1920 },
	{
		badgeKey: "editor.preview.ratioBadgeDouyin",
		group: "portrait",
		height: 1920,
		name: "9:16",
		width: 1080,
	},
	{ group: "portrait", height: 1440, name: "3:4", width: 1080 },
	{
		aliases: ["5.8寸", "5.8-inch", "5.8inch", "5.8"],
		group: "portrait",
		height: 2340,
		name: "9:19.5",
		nameKey: "editor.preview.ratio58Inch",
		width: 1080,
	},
	{ group: "portrait", height: 1080, name: "1:1", width: 1080 },
	{ group: "portrait", height: 2160, name: "1:2", width: 1080 },
];

/**
 * How far (in width/height ratio units) a media ratio may sit from a preset
 * and still snap to it. The catalog is dense enough that anything looser
 * captures ratios editors treat as distinct (4:5 vs 3:4 differ by 0.05).
 */
export const CANVAS_PRESET_MATCH_TOLERANCE = 0.02;

/**
 * Pick the preset closest to `aspectRatio`; when none is within tolerance,
 * return an exact-ratio custom size at 1920 wide (landscape) or 1080 tall.
 */
export function findBestCanvasPreset(
	aspectRatio: number,
	presets: readonly CanvasPreset[] = DEFAULT_CANVAS_PRESETS
): CanvasSize {
	let bestMatch = presets[0];
	let smallestDifference = Math.abs(
		aspectRatio - bestMatch.width / bestMatch.height
	);
	for (const preset of presets) {
		const difference = Math.abs(aspectRatio - preset.width / preset.height);
		if (difference < smallestDifference) {
			smallestDifference = difference;
			bestMatch = preset;
		}
	}

	if (smallestDifference > CANVAS_PRESET_MATCH_TOLERANCE) {
		if (aspectRatio > 1) {
			return { width: 1920, height: roundToEven(1920 / aspectRatio) };
		}
		return { width: roundToEven(1080 * aspectRatio), height: 1080 };
	}
	return { width: bestMatch.width, height: bestMatch.height };
}

/** 4:2:0 encoders reject odd sizes, so custom canvases round to even. */
function roundToEven(value: number): number {
	return Math.max(2, Math.round(value / 2) * 2);
}

function normalizeCanvasPresetName(name: string): string {
	return name.trim().toLowerCase().replace(/：/g, ":").replace(/\s+/g, "");
}

/** Resolve a preset by its display name or one of its aliases (e.g. 5.8寸). */
export function findCanvasPresetByName(
	name: string,
	presets: readonly CanvasPreset[] = DEFAULT_CANVAS_PRESETS
): CanvasPreset | undefined {
	const wanted = normalizeCanvasPresetName(name);
	if (!wanted) return undefined;
	return presets.find(
		(preset) =>
			normalizeCanvasPresetName(preset.name) === wanted ||
			(preset.aliases ?? []).some(
				(alias) => normalizeCanvasPresetName(alias) === wanted
			)
	);
}
