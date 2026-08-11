export type ColorHslRangeName =
	| "red"
	| "orange"
	| "yellow"
	| "green"
	| "cyan"
	| "blue"
	| "purple"
	| "magenta";

export interface ColorBasicSettings {
	enabled: boolean;
	exposure: number;
	brightness: number;
	contrast: number;
	highlights: number;
	shadows: number;
	whites: number;
	blacks: number;
	temperature: number;
	tint: number;
	saturation: number;
	vibrance: number;
	sharpness: number;
	fade: number;
	vignette: number;
	grain: number;
}

export interface ColorCubeLut {
	size: number;
	domainMin: [number, number, number];
	domainMax: [number, number, number];
	values: number[];
}

export interface ColorDualLutSettings {
	skinCube: ColorCubeLut;
	/** Deterministic chroma mask; person/face AI remains a separate renderer. */
	maskKind: "skin-tone-v1";
}

export interface ColorLutSettings {
	enabled: boolean;
	presetId: string;
	name: string;
	intensity: number;
	skinProtection: number;
	cube?: ColorCubeLut;
	dual?: ColorDualLutSettings;
}

export type ColorMultiPassOperation =
	| {
			kind: "sharpen";
			amount: number;
	  }
	| {
			kind: "bilateral-blur";
			radius: number;
			threshold: number;
	  }
	| {
			kind: "fog-blend";
			radius: number;
			amount: number;
	  }
	| {
			kind: "vignette";
			amount: number;
			softness: number;
	  }
	| {
			kind: "lut";
			cube: ColorCubeLut;
			intensity: number;
	  };

/** Ordered spatial and colour passes reconstructed from a cached effect package. */
export interface ColorMultiPassSettings {
	enabled: boolean;
	presetId: string;
	name: string;
	intensity: number;
	fidelity: "structural";
	passes: ColorMultiPassOperation[];
}

export interface ColorFilterApplication {
	presetId: string;
	presetVersion: number;
	intensity: number;
}

export interface ColorHslRangeSettings {
	hue: number;
	saturation: number;
	luminance: number;
}

export interface ColorHslSettings {
	enabled: boolean;
	ranges: Record<ColorHslRangeName, ColorHslRangeSettings>;
}

export interface ColorCurvePoint {
	id: string;
	x: number;
	y: number;
}

export interface ColorCurvesSettings {
	enabled: boolean;
	mix: number;
	master: ColorCurvePoint[];
	red: ColorCurvePoint[];
	green: ColorCurvePoint[];
	blue: ColorCurvePoint[];
}

export type ColorSecondaryCurveName =
	| "hueVsSaturation"
	| "hueVsHue"
	| "hueVsLuminance"
	| "luminanceVsSaturation"
	| "saturationVsSaturation";

export interface ColorSecondaryCurve {
	points: ColorCurvePoint[];
	samples: number[];
}

export interface ColorSecondaryCurvesSettings {
	enabled: boolean;
	mix: number;
	hueVsSaturation: ColorSecondaryCurve;
	hueVsHue: ColorSecondaryCurve;
	hueVsLuminance: ColorSecondaryCurve;
	luminanceVsSaturation: ColorSecondaryCurve;
	saturationVsSaturation: ColorSecondaryCurve;
}

export type ColorCurveShapeProperty =
	| `curves.${"master" | "red" | "green" | "blue"}`
	| `secondaryCurves.${ColorSecondaryCurveName}`;

export interface ColorCurveShapeKeyframe {
	id: string;
	frame: number;
	points: ColorCurvePoint[];
	samples?: number[];
	easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
}

export interface ColorWheelSettings {
	x: number;
	y: number;
	luminance: number;
}

export interface ColorWheelsSettings {
	enabled: boolean;
	mode: "tonal" | "lift-gamma-gain";
	strength: number;
	shadows: ColorWheelSettings;
	midtones: ColorWheelSettings;
	highlights: ColorWheelSettings;
	offset: ColorWheelSettings;
	balance: number;
}

export interface ColorSmartSettings {
	enabled: boolean;
	intensity: number;
	autoWhiteBalance: boolean;
	autoTone: boolean;
	status: "idle" | "analyzing" | "ready" | "error";
	correction?: {
		exposure: number;
		contrast: number;
		temperature: number;
		tint: number;
		saturation: number;
	};
	referenceName?: string;
	error?: string;
}

export type ColorSpace =
	| "auto"
	| "srgb"
	| "rec709"
	| "display-p3"
	| "rec2020"
	| "logc3"
	| "slog3"
	| "vlog"
	| "hlg"
	| "pq";

export interface ColorManagementSettings {
	enabled: boolean;
	inputSpace: ColorSpace;
	workingSpace: "rec709-linear" | "acescg";
	outputSpace: ColorSpace;
	toneMapping: "none" | "reinhard" | "hable" | "aces";
	peakNits: number;
}

export interface ColorGradeMaskSettings {
	enabled: boolean;
	maskIds: string[];
	invert: boolean;
}

export type ColorBasicKeyframeProperty = `basic.${Exclude<
	keyof ColorBasicSettings,
	"enabled"
>}`;
export type ColorHslKeyframeProperty =
	`hsl.${ColorHslRangeName}.${keyof ColorHslRangeSettings}`;
export type ColorWheelKeyframeProperty =
	`wheels.${"shadows" | "midtones" | "highlights" | "offset"}.${keyof ColorWheelSettings}`;
export type ColorKeyframeProperty =
	| ColorBasicKeyframeProperty
	| "lut.intensity"
	| "lut.skinProtection"
	| ColorHslKeyframeProperty
	| "curves.mix"
	| "secondaryCurves.mix"
	| ColorWheelKeyframeProperty
	| "wheels.strength"
	| "wheels.balance"
	| "smart.intensity";

export interface ColorPropertyKeyframe {
	id: string;
	frame: number;
	value: number;
	easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
}

export interface MediaColorSettings {
	enabled: boolean;
	filter: ColorFilterApplication;
	basic: ColorBasicSettings;
	lut: ColorLutSettings;
	multiPass?: ColorMultiPassSettings;
	hsl: ColorHslSettings;
	curves: ColorCurvesSettings;
	secondaryCurves: ColorSecondaryCurvesSettings;
	wheels: ColorWheelsSettings;
	smart: ColorSmartSettings;
	mask: ColorGradeMaskSettings;
	management: ColorManagementSettings;
	keyframes?: Partial<Record<ColorKeyframeProperty, ColorPropertyKeyframe[]>>;
	curveShapeKeyframes?: Partial<
		Record<ColorCurveShapeProperty, ColorCurveShapeKeyframe[]>
	>;
}
