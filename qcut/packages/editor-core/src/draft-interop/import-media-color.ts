import type { MediaColorSettings } from "../types/color.js";
import type { QCutImportPlanMediaFilter } from "../jianying-draft/import/qcut-mapping.js";

/**
 * Builds the color settings for an imported media element that carries a
 * fitted filter recipe (L6): the filter application plus a fully neutral
 * grade everywhere else. The renderer re-normalizes stored color against its
 * own defaults, so neutral here must mean "no visual change", never "off".
 */
export function createImportMediaColorSettings({
	filter,
}: {
	filter: QCutImportPlanMediaFilter;
}): MediaColorSettings {
	const neutralRange = { hue: 0, luminance: 0, saturation: 0 };
	const neutralCurve = [
		{ id: "black", x: 0, y: 0 },
		{ id: "white", x: 1, y: 1 },
	];
	const secondaryCurve = { points: [], samples: [] };
	const neutralWheel = { luminance: 0, x: 0, y: 0 };
	return {
		enabled: true,
		filter: {
			presetId: filter.presetId,
			presetVersion: filter.presetVersion,
			intensity: filter.intensity,
		},
		basic: {
			enabled: true,
			exposure: 0,
			brightness: 0,
			contrast: 0,
			highlights: 0,
			shadows: 0,
			whites: 0,
			blacks: 0,
			temperature: 0,
			tint: 0,
			saturation: 0,
			vibrance: 0,
			sharpness: 0,
			fade: 0,
			vignette: 0,
			grain: 0,
		},
		lut: {
			enabled: false,
			presetId: "none",
			name: "无",
			intensity: 100,
			skinProtection: 0,
		},
		hsl: {
			enabled: false,
			ranges: {
				red: { ...neutralRange },
				orange: { ...neutralRange },
				yellow: { ...neutralRange },
				green: { ...neutralRange },
				cyan: { ...neutralRange },
				blue: { ...neutralRange },
				purple: { ...neutralRange },
				magenta: { ...neutralRange },
			},
		},
		curves: {
			enabled: false,
			mix: 100,
			master: neutralCurve.map((point) => ({ ...point })),
			red: neutralCurve.map((point) => ({ ...point })),
			green: neutralCurve.map((point) => ({ ...point })),
			blue: neutralCurve.map((point) => ({ ...point })),
		},
		secondaryCurves: {
			enabled: false,
			mix: 100,
			hueVsSaturation: { ...secondaryCurve },
			hueVsHue: { ...secondaryCurve },
			hueVsLuminance: { ...secondaryCurve },
			luminanceVsSaturation: { ...secondaryCurve },
			saturationVsSaturation: { ...secondaryCurve },
		},
		wheels: {
			enabled: false,
			mode: "tonal",
			strength: 100,
			shadows: { ...neutralWheel },
			midtones: { ...neutralWheel },
			highlights: { ...neutralWheel },
			offset: { ...neutralWheel },
			balance: 0,
		},
		smart: {
			enabled: false,
			intensity: 100,
			autoWhiteBalance: true,
			autoTone: true,
			status: "idle",
		},
		mask: { enabled: false, maskIds: [], invert: false },
		management: {
			enabled: false,
			inputSpace: "auto",
			workingSpace: "rec709-linear",
			outputSpace: "rec709",
			toneMapping: "aces",
			peakNits: 100,
		},
	};
}
