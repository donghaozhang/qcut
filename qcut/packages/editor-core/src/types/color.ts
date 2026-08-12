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

export type ColorDualLutSettings =
	| {
			skinCube: ColorCubeLut;
			maskKind: "skin-tone-v1";
	  }
	| {
			skinCube: ColorCubeLut;
			maskKind: "skin-segmentation-v1";
			resourceId: string;
	  };

export interface ColorLutSettings {
	enabled: boolean;
	presetId: string;
	name: string;
	intensity: number;
	skinProtection: number;
	cube?: ColorCubeLut;
	dual?: ColorDualLutSettings;
}

/**
 * Long-tail per-pass texture semantics. Structurally mirrors
 * `JianyingFilterLabPassTraits` in electron/jianying-filter-lab-contract.ts
 * (the contract's compile-time parity guard asserts assignability); keep
 * the two in sync. Absent fields mean the full-resolution RGBA8 defaults
 * every currently verified recipe uses.
 */
export interface ColorMultiPassTraits {
	scale?: 1 | 0.5 | 0.25;
	pixelFormat?: "rgba8" | "float16" | "float32";
	mipLevels?: number;
	edgeMode?: "clamp" | "repeat" | "mirror";
	intensityCurve?:
		| { kind: "linear" }
		| { kind: "piecewise"; points: [number, number][] };
	timeVarying?: boolean;
}

export type ColorMultiPassOperation =
	| ({
			kind: "sharpen";
			amount: number;
	  } & ColorMultiPassTraits)
	| ({
			kind: "bilateral-blur";
			radius: number;
			threshold: number;
	  } & ColorMultiPassTraits)
	| ({
			kind: "fog-blend";
			radius: number;
			amount: number;
	  } & ColorMultiPassTraits)
	| ({
			kind: "vignette";
			amount: number;
			softness: number;
	  } & ColorMultiPassTraits)
	| ({
			kind: "grain-noise";
			amount: number;
			size: number;
			seed: number;
	  } & ColorMultiPassTraits)
	| ({
			kind: "light-leak";
			amount: number;
			color: [number, number, number];
			centerX: number;
			centerY: number;
			radius: number;
			speed: number;
	  } & ColorMultiPassTraits)
	| ({
			kind: "bloom";
			threshold: number;
			radius: number;
			amount: number;
	  } & ColorMultiPassTraits)
	| ({
			kind: "chromatic-aberration";
			offset: number;
			angle: number;
	  } & ColorMultiPassTraits)
	| ({
			kind: "lens-distortion";
			distortion: number;
			centerX: number;
			centerY: number;
	  } & ColorMultiPassTraits)
	| ({
			kind: "lut";
			cube: ColorCubeLut;
			intensity: number;
	  } & ColorMultiPassTraits);

/** Ordered spatial and colour passes reconstructed from a cached effect package. */
export interface ColorMultiPassSettings {
	enabled: boolean;
	presetId: string;
	name: string;
	intensity: number;
	fidelity: "structural" | "native-local";
	nativeEffect?: {
		provider: "jianying-local-effect-v1";
		resourceId: string;
		version: string;
	};
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
