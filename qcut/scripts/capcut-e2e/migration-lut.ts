export function createInvertLutColorSettings() {
	const range = { hue: 0, luminance: 0, saturation: 0 };
	const curve = { points: [], samples: [] };
	const wheel = { luminance: 0, x: 0, y: 0 };
	return {
		basic: {
			blacks: 0,
			brightness: 0,
			contrast: 0,
			enabled: false,
			exposure: 0,
			fade: 0,
			grain: 0,
			highlights: 0,
			saturation: 0,
			shadows: 0,
			sharpness: 0,
			temperature: 0,
			tint: 0,
			vibrance: 0,
			vignette: 0,
			whites: 0,
		},
		curves: {
			blue: [],
			enabled: false,
			green: [],
			master: [],
			mix: 100,
			red: [],
		},
		enabled: true,
		filter: { intensity: 0, presetId: "none", presetVersion: 1 },
		hsl: {
			enabled: false,
			ranges: {
				blue: range,
				cyan: range,
				green: range,
				magenta: range,
				orange: range,
				purple: range,
				red: range,
				yellow: range,
			},
		},
		keyframes: {},
		lut: {
			cube: {
				domainMax: [1, 1, 1],
				domainMin: [0, 0, 0],
				size: 2,
				values: [
					1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0,
					0,
				],
			},
			enabled: true,
			intensity: 100,
			name: "QCut 2x2 Invert",
			presetId: "qcut-capcut-e2e-invert",
			skinProtection: 0,
		},
		management: {
			enabled: false,
			inputSpace: "auto",
			outputSpace: "rec709",
			peakNits: 100,
			toneMapping: "aces",
			workingSpace: "rec709-linear",
		},
		mask: { enabled: false, invert: false, maskIds: [] },
		secondaryCurves: {
			enabled: false,
			hueVsHue: curve,
			hueVsLuminance: curve,
			hueVsSaturation: curve,
			luminanceVsSaturation: curve,
			mix: 100,
			saturationVsSaturation: curve,
		},
		smart: {
			autoTone: true,
			autoWhiteBalance: true,
			enabled: false,
			intensity: 100,
			status: "idle",
		},
		wheels: {
			balance: 0,
			enabled: false,
			highlights: wheel,
			midtones: wheel,
			mode: "tonal",
			offset: wheel,
			shadows: wheel,
			strength: 100,
		},
	};
}

export type MigrationLutColorSettings = ReturnType<
	typeof createInvertLutColorSettings
>;
