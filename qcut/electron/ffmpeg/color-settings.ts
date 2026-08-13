export interface VideoColorPropertyKeyframe {
	id: string;
	frame: number;
	value: number;
	easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
}

export interface VideoColorCurveShapeKeyframe {
	id: string;
	frame: number;
	points: Array<{ id: string; x: number; y: number }>;
	samples?: number[];
	easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
}

export interface VideoColorBasicSettings {
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

export interface VideoColorMultiPassTraits {
	scale?: 1 | 0.5 | 0.25;
	pixelFormat?: "rgba8" | "float16" | "float32";
	mipLevels?: number;
	edgeMode?: "clamp" | "repeat" | "mirror";
	intensityCurve?:
		| { kind: "linear" }
		| { kind: "piecewise"; points: [number, number][] };
	timeVarying?: boolean;
}

export type VideoColorMultiPassOperation =
	| ({ kind: "sharpen"; amount: number } & VideoColorMultiPassTraits)
	| ({
			kind: "bilateral-blur";
			radius: number;
			threshold: number;
	  } & VideoColorMultiPassTraits)
	| ({
			kind: "fog-blend";
			radius: number;
			amount: number;
	  } & VideoColorMultiPassTraits)
	| ({
			kind: "vignette";
			amount: number;
			softness: number;
	  } & VideoColorMultiPassTraits)
	| ({
			kind: "grain-noise";
			amount: number;
			size: number;
			seed: number;
	  } & VideoColorMultiPassTraits)
	| ({
			kind: "light-leak";
			amount: number;
			color: [number, number, number];
			centerX: number;
			centerY: number;
			radius: number;
			speed: number;
	  } & VideoColorMultiPassTraits)
	| ({
			kind: "bloom";
			threshold: number;
			radius: number;
			amount: number;
	  } & VideoColorMultiPassTraits)
	| ({
			kind: "chromatic-aberration";
			offset: number;
			angle: number;
	  } & VideoColorMultiPassTraits)
	| ({
			kind: "lens-distortion";
			distortion: number;
			centerX: number;
			centerY: number;
	  } & VideoColorMultiPassTraits)
	| ({
			kind: "lut";
			cube: {
				size: number;
				domainMin: [number, number, number];
				domainMax: [number, number, number];
				values: number[];
			};
			intensity: number;
	  } & VideoColorMultiPassTraits);

export interface VideoColorMultiPassSettings {
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
	passes: VideoColorMultiPassOperation[];
}

export interface VideoColorCube {
	size: number;
	domainMin: [number, number, number];
	domainMax: [number, number, number];
	values: number[];
}

export type VideoSecondaryCurveName =
	| "hueVsSaturation"
	| "hueVsHue"
	| "hueVsLuminance"
	| "luminanceVsSaturation"
	| "saturationVsSaturation";

export interface VideoSecondaryCurve {
	points: Array<{ id: string; x: number; y: number }>;
	samples: number[];
}

export interface VideoColorSettings {
	enabled: boolean;
	filter: {
		presetId: string;
		presetVersion: number;
		intensity: number;
	};
	basic: VideoColorBasicSettings;
	lut: {
		enabled: boolean;
		presetId: string;
		name: string;
		intensity: number;
		skinProtection: number;
		cube?: VideoColorCube;
		dual?:
			| {
					skinCube: VideoColorCube;
					maskKind: "skin-tone-v1";
			  }
			| {
					skinCube: VideoColorCube;
					maskKind: "skin-segmentation-v1";
					resourceId: string;
			  };
	};
	multiPass?: VideoColorMultiPassSettings;
	hsl: {
		enabled: boolean;
		ranges: Record<
			string,
			{ hue: number; saturation: number; luminance: number }
		>;
	};
	curves: {
		enabled: boolean;
		mix: number;
		master: Array<{ id: string; x: number; y: number }>;
		red: Array<{ id: string; x: number; y: number }>;
		green: Array<{ id: string; x: number; y: number }>;
		blue: Array<{ id: string; x: number; y: number }>;
	};
	secondaryCurves: {
		enabled: boolean;
		mix: number;
		hueVsSaturation: VideoSecondaryCurve;
		hueVsHue: VideoSecondaryCurve;
		hueVsLuminance: VideoSecondaryCurve;
		luminanceVsSaturation: VideoSecondaryCurve;
		saturationVsSaturation: VideoSecondaryCurve;
	};
	wheels: {
		enabled: boolean;
		mode: "tonal" | "lift-gamma-gain";
		strength: number;
		shadows: { x: number; y: number; luminance: number };
		midtones: { x: number; y: number; luminance: number };
		highlights: { x: number; y: number; luminance: number };
		offset: { x: number; y: number; luminance: number };
		balance: number;
	};
	smart: {
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
	};
	mask: { enabled: boolean; maskIds: string[]; invert: boolean };
	management: {
		enabled: boolean;
		inputSpace: string;
		workingSpace: "rec709-linear" | "acescg";
		outputSpace: string;
		toneMapping: "none" | "reinhard" | "hable" | "aces";
		peakNits: number;
	};
	keyframes?: Partial<Record<string, VideoColorPropertyKeyframe[]>>;
	curveShapeKeyframes?: Partial<Record<string, VideoColorCurveShapeKeyframe[]>>;
}

const DEFAULT_CURVE = [
	{ id: "black", x: 0, y: 0 },
	{ id: "white", x: 1, y: 1 },
];

const DEFAULT_SECONDARY_CURVE_POINTS = [
	{ id: "start", x: 0, y: 0.5 },
	{ id: "end", x: 1, y: 0.5 },
];

const DEFAULT_SECONDARY_CURVE = {
	points: DEFAULT_SECONDARY_CURVE_POINTS,
	samples: new Array<number>(257).fill(0.5),
};

export const VIDEO_SECONDARY_CURVE_NAMES: VideoSecondaryCurveName[] = [
	"hueVsSaturation",
	"hueVsHue",
	"hueVsLuminance",
	"luminanceVsSaturation",
	"saturationVsSaturation",
];

export const DEFAULT_VIDEO_COLOR_SETTINGS: VideoColorSettings = {
	enabled: true,
	filter: { presetId: "none", presetVersion: 1, intensity: 100 },
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
		name: "None",
		intensity: 100,
		skinProtection: 0,
	},
	hsl: { enabled: false, ranges: {} },
	curves: {
		enabled: false,
		mix: 100,
		master: DEFAULT_CURVE,
		red: DEFAULT_CURVE,
		green: DEFAULT_CURVE,
		blue: DEFAULT_CURVE,
	},
	secondaryCurves: {
		enabled: false,
		mix: 100,
		hueVsSaturation: structuredClone(DEFAULT_SECONDARY_CURVE),
		hueVsHue: structuredClone(DEFAULT_SECONDARY_CURVE),
		hueVsLuminance: structuredClone(DEFAULT_SECONDARY_CURVE),
		luminanceVsSaturation: structuredClone(DEFAULT_SECONDARY_CURVE),
		saturationVsSaturation: structuredClone(DEFAULT_SECONDARY_CURVE),
	},
	wheels: {
		enabled: false,
		mode: "tonal",
		strength: 100,
		shadows: { x: 0, y: 0, luminance: 0 },
		midtones: { x: 0, y: 0, luminance: 0 },
		highlights: { x: 0, y: 0, luminance: 0 },
		offset: { x: 0, y: 0, luminance: 0 },
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
	keyframes: {},
	curveShapeKeyframes: {},
};

export function normalizeVideoColorSettings({
	color,
	adjustments,
}: {
	color: VideoColorSettings | undefined;
	adjustments:
		| {
				brightness: number;
				contrast: number;
				saturation: number;
				temperature: number;
				tint: number;
				sharpness: number;
				fade: number;
				vignette: number;
		  }
		| undefined;
}): VideoColorSettings {
	const legacy = adjustments ?? {
		brightness: 0,
		contrast: 0,
		saturation: 0,
		temperature: 0,
		tint: 0,
		sharpness: 0,
		fade: 0,
		vignette: 0,
	};
	return {
		...DEFAULT_VIDEO_COLOR_SETTINGS,
		...color,
		filter: {
			...DEFAULT_VIDEO_COLOR_SETTINGS.filter,
			...color?.filter,
		},
		basic: {
			...DEFAULT_VIDEO_COLOR_SETTINGS.basic,
			...legacy,
			...color?.basic,
		},
		lut: { ...DEFAULT_VIDEO_COLOR_SETTINGS.lut, ...color?.lut },
		multiPass: color?.multiPass
			? {
					...color.multiPass,
					nativeEffect: color.multiPass.nativeEffect
						? { ...color.multiPass.nativeEffect }
						: undefined,
					passes: color.multiPass.passes.map((pass) =>
						pass.kind === "lut"
							? {
									...pass,
									cube: {
										...pass.cube,
										values: [...pass.cube.values],
									},
								}
							: { ...pass }
					),
				}
			: undefined,
		hsl: {
			...DEFAULT_VIDEO_COLOR_SETTINGS.hsl,
			...color?.hsl,
			ranges: { ...color?.hsl?.ranges },
		},
		curves: { ...DEFAULT_VIDEO_COLOR_SETTINGS.curves, ...color?.curves },
		secondaryCurves: {
			...DEFAULT_VIDEO_COLOR_SETTINGS.secondaryCurves,
			...color?.secondaryCurves,
			...Object.fromEntries(
				VIDEO_SECONDARY_CURVE_NAMES.map((name) => [
					name,
					{
						points: (
							color?.secondaryCurves?.[name]?.points ??
							DEFAULT_SECONDARY_CURVE_POINTS
						).map((point) => ({ ...point })),
						samples: [
							...(color?.secondaryCurves?.[name]?.samples ??
								DEFAULT_SECONDARY_CURVE.samples),
						],
					},
				])
			),
		},
		wheels: {
			...DEFAULT_VIDEO_COLOR_SETTINGS.wheels,
			...color?.wheels,
			shadows: {
				...DEFAULT_VIDEO_COLOR_SETTINGS.wheels.shadows,
				...color?.wheels?.shadows,
			},
			midtones: {
				...DEFAULT_VIDEO_COLOR_SETTINGS.wheels.midtones,
				...color?.wheels?.midtones,
			},
			highlights: {
				...DEFAULT_VIDEO_COLOR_SETTINGS.wheels.highlights,
				...color?.wheels?.highlights,
			},
			offset: {
				...DEFAULT_VIDEO_COLOR_SETTINGS.wheels.offset,
				...color?.wheels?.offset,
			},
		},
		smart: {
			...DEFAULT_VIDEO_COLOR_SETTINGS.smart,
			...color?.smart,
			correction: color?.smart?.correction
				? { ...color.smart.correction }
				: undefined,
		},
		mask: { ...DEFAULT_VIDEO_COLOR_SETTINGS.mask, ...color?.mask },
		management: {
			...DEFAULT_VIDEO_COLOR_SETTINGS.management,
			...color?.management,
		},
		keyframes: color?.keyframes,
		curveShapeKeyframes: Object.fromEntries(
			Object.entries(color?.curveShapeKeyframes ?? {}).map(
				([property, keyframes]) => [
					property,
					keyframes?.map((keyframe) => ({
						...keyframe,
						points: keyframe.points.map((point) => ({ ...point })),
						samples: keyframe.samples ? [...keyframe.samples] : undefined,
					})),
				]
			)
		),
	};
}
