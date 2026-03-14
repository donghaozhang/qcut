/**
 * Subtitle style presets and CLI style resolution.
 *
 * @module electron/native-pipeline/subtitle/style-presets
 */

import type { SubtitleStyle } from "./subtitle-types.js";
import { resolveSubtitleStyle } from "./subtitle-types.js";

/** Named subtitle style presets */
export const SUBTITLE_PRESETS: Record<string, Partial<SubtitleStyle>> = {
	default: {},
	cinematic: {
		fontFamily: "Georgia",
		fontSize: 56,
		fontColor: "#ffffff",
		outlineColor: "#1a1a1a",
		outlineWidth: 1,
		shadowColor: "#000000",
		shadowOffset: { x: 2, y: 2 },
		bold: false,
		position: { align: "bottom", x: 50, y: 60 },
	},
	bold: {
		fontFamily: "Arial",
		fontSize: 64,
		fontColor: "#ffffff",
		bold: true,
		outlineColor: "#000000",
		outlineWidth: 4,
		shadowOffset: { x: 2, y: 2 },
		position: { align: "bottom", x: 50, y: 80 },
	},
	minimal: {
		fontFamily: "Helvetica Neue",
		fontSize: 40,
		fontColor: "#ffffff",
		outlineWidth: 0,
		outlineColor: "#000000",
		backgroundColor: "#000000",
		bgOpacity: 0.5,
		shadowOffset: { x: 0, y: 0 },
		position: { align: "bottom", x: 50, y: 90 },
	},
	karaoke: {
		fontFamily: "Arial",
		fontSize: 52,
		fontColor: "#ffff00",
		bold: true,
		outlineColor: "#000000",
		outlineWidth: 3,
		position: { align: "top", x: 50, y: 20 },
	},
	news: {
		fontFamily: "Arial",
		fontSize: 44,
		fontColor: "#ffffff",
		bold: false,
		outlineWidth: 0,
		backgroundColor: "#000000",
		bgOpacity: 0.7,
		shadowOffset: { x: 0, y: 0 },
		position: { align: "bottom", x: 50, y: 90 },
	},
};

/** List of valid preset names */
export const PRESET_NAMES = Object.keys(SUBTITLE_PRESETS);

/** Parse a JSON string of style overrides */
export function parseStyleOverrides(json: string): Partial<SubtitleStyle> {
	const parsed = JSON.parse(json);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Style overrides must be a JSON object");
	}
	return parsed as Partial<SubtitleStyle>;
}

/**
 * Resolve a SubtitleStyle from CLI arguments.
 * Priority: overrides > preset > defaults
 */
export function resolveStyleFromCLI(
	preset?: string,
	overridesJson?: string
): SubtitleStyle {
	let base: Partial<SubtitleStyle> = {};

	if (preset) {
		const presetStyle = SUBTITLE_PRESETS[preset];
		if (!presetStyle) {
			throw new Error(
				`Unknown preset "${preset}". Available: ${PRESET_NAMES.join(", ")}`
			);
		}
		base = { ...presetStyle };
	}

	if (overridesJson) {
		const overrides = parseStyleOverrides(overridesJson);
		base = {
			...base,
			...overrides,
		};
		if (base.position || overrides.position) {
			base.position = {
				...base.position,
				...overrides.position,
			} as SubtitleStyle["position"];
		}
		if (base.shadowOffset || overrides.shadowOffset) {
			base.shadowOffset = {
				...base.shadowOffset,
				...overrides.shadowOffset,
			} as SubtitleStyle["shadowOffset"];
		}
	}

	return resolveSubtitleStyle(base);
}
