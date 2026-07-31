import type {
	AudioBusEffectsSettings,
	AudioKeyframeProperty,
	AudioCompressorSettings,
	AudioCoverSettings,
	AudioDenoiseSettings,
	AudioEchoSettings,
	AudioEqualizerSettings,
	AudioLimiterSettings,
	AudioLoudnessSettings,
	AudioLyricsSettings,
	AudioLyricsWord,
	AudioParametricEqBand,
	AudioParametricEqualizerSettings,
	AudioPitchSettings,
	AudioRepairSettings,
	AudioReverbSettings,
	AudioSeparationSettings,
	AudioTelephoneSettings,
	AudioVoiceConversionSettings,
	AudioVoiceEnhanceSettings,
	ColorBasicSettings,
	ColorKeyframeProperty,
	ColorCubeLut,
	ColorCurvePoint,
	ColorCurveShapeKeyframe,
	ColorCurveShapeProperty,
	ColorCurvesSettings,
	ColorFilterApplication,
	ColorGradeMaskSettings,
	ColorHslRangeSettings,
	ColorHslSettings,
	ColorLutSettings,
	ColorManagementSettings,
	ColorPropertyKeyframe,
	ColorSecondaryCurve,
	ColorSecondaryCurvesSettings,
	ColorSmartSettings,
	ColorWheelSettings,
	ColorWheelsSettings,
	CompoundMediaClip,
	MediaAdjustments,
	MediaAudioSettings,
	MediaChromaKey,
	MediaChromaKeyKeyframeProperty,
	MediaColorSettings,
	MediaCompound,
	MediaCrop,
	MediaCustomCutout,
	MediaCustomCutoutPoint,
	MediaCustomCutoutStroke,
	MediaElement,
	MediaEnhancements,
	MediaMask,
	MediaMaskKeyframeProperty,
	MediaMaskPoint,
	MediaMaskStroke,
	MediaMaskTracking,
	MediaPerspective,
	MediaKeyframeProperty,
	MediaPropertyKeyframe,
} from "@qcut/editor-core";
import {
	assertNoUnknownKeys,
	assertOptionalBoolean,
	assertOptionalFiniteNumber,
	getArray,
	getBoolean,
	getFiniteNumber,
	getRecord,
	getString,
	type JsonValue,
	validationIssue,
} from "./runtime-json.js";
import {
	createAllowedKeySet,
	validateRecordOfArrays,
} from "./snapshot-runtime-helpers.js";

const AUDIO_STEM_NAMES = new Set([
	"vocals",
	"instrumental",
	"drums",
	"bass",
	"other",
	"guitar",
	"piano",
]);
const MAX_COLOR_CUBE_SIZE = 32;

const MEDIA_ELEMENT_KEYS = createAllowedKeySet<MediaElement>({
	keys: {
		adjustments: true,
		animationInDuration: true,
		animationInType: true,
		animationOutDuration: true,
		animationOutType: true,
		audio: true,
		audioDenoise: true,
		audioFadeIn: true,
		audioFadeOut: true,
		audioNormalize: true,
		audioPan: true,
		blendMode: true,
		chromaKey: true,
		color: true,
		colorLabel: true,
		comboAnimationIntensity: true,
		comboAnimationType: true,
		compound: true,
		crop: true,
		customCutout: true,
		duration: true,
		effectChains: true,
		effectIds: true,
		effects: true,
		enhancements: true,
		fitMode: true,
		flipHorizontal: true,
		flipVertical: true,
		frameInterpolation: true,
		freezeFrameDuration: true,
		freezeFrameTime: true,
		groupId: true,
		height: true,
		hidden: true,
		id: true,
		keyframes: true,
		maintainAspectRatio: true,
		mask: true,
		masks: true,
		mediaId: true,
		name: true,
		opacity: true,
		perspective: true,
		playbackRate: true,
		preservePitch: true,
		reverse: true,
		rotation: true,
		scaleX: true,
		scaleY: true,
		speedKeyframes: true,
		startTime: true,
		templateBinding: true,
		trimEnd: true,
		trimStart: true,
		type: true,
		volume: true,
		width: true,
		x: true,
		y: true,
	},
});
const MEDIA_ADJUSTMENT_KEYS = createAllowedKeySet<MediaAdjustments>({
	keys: {
		brightness: true,
		contrast: true,
		fade: true,
		saturation: true,
		sharpness: true,
		temperature: true,
		tint: true,
		vignette: true,
	},
});
const MEDIA_CROP_KEYS = createAllowedKeySet<MediaCrop>({
	keys: { bottom: true, left: true, right: true, top: true },
});
const MEDIA_PERSPECTIVE_KEYS = createAllowedKeySet<MediaPerspective>({
	keys: {
		bottomLeftX: true,
		bottomLeftY: true,
		bottomRightX: true,
		bottomRightY: true,
		topLeftX: true,
		topLeftY: true,
		topRightX: true,
		topRightY: true,
	},
});
const MEDIA_PROPERTY_KEYFRAME_KEYS = createAllowedKeySet<MediaPropertyKeyframe>(
	{
		keys: {
			easing: true,
			frame: true,
			id: true,
			value: true,
		},
	}
);
const MEDIA_KEYFRAME_PROPERTIES = createAllowedKeySet<
	Record<MediaKeyframeProperty, unknown>
>({
	keys: {
		bottomLeftX: true,
		bottomLeftY: true,
		bottomRightX: true,
		bottomRightY: true,
		cropBottom: true,
		cropLeft: true,
		cropRight: true,
		cropTop: true,
		opacity: true,
		rotation: true,
		scaleX: true,
		scaleY: true,
		topLeftX: true,
		topLeftY: true,
		topRightX: true,
		topRightY: true,
		x: true,
		y: true,
	},
});
const MEDIA_MASK_KEYFRAME_PROPERTIES = createAllowedKeySet<
	Record<MediaMaskKeyframeProperty, unknown>
>({
	keys: {
		centerX: true,
		centerY: true,
		expansion: true,
		feather: true,
		height: true,
		opacity: true,
		rotation: true,
		roundness: true,
		width: true,
	},
});
const MEDIA_CHROMA_KEYFRAME_PROPERTIES = createAllowedKeySet<
	Record<MediaChromaKeyKeyframeProperty, unknown>
>({
	keys: {
		blend: true,
		cleanup: true,
		shadow: true,
		similarity: true,
		spill: true,
	},
});
const AUDIO_KEYFRAME_PROPERTIES = createAllowedKeySet<
	Record<AudioKeyframeProperty, unknown>
>({
	keys: {
		compressorRatio: true,
		compressorThresholdDb: true,
		denoiseAmount: true,
		echoMix: true,
		eqHighGainDb: true,
		eqLowGainDb: true,
		eqMidGainDb: true,
		fadeIn: true,
		fadeOut: true,
		pan: true,
		pitchSemitones: true,
		reverbMix: true,
		voiceClarity: true,
		voicePresence: true,
		voiceWarmth: true,
		volumeDb: true,
	},
});

const COLOR_SETTINGS_KEYS = createAllowedKeySet<MediaColorSettings>({
	keys: {
		basic: true,
		curveShapeKeyframes: true,
		curves: true,
		enabled: true,
		filter: true,
		hsl: true,
		keyframes: true,
		lut: true,
		management: true,
		mask: true,
		secondaryCurves: true,
		smart: true,
		wheels: true,
	},
});
const COLOR_FILTER_KEYS = createAllowedKeySet<ColorFilterApplication>({
	keys: { intensity: true, presetId: true, presetVersion: true },
});
const COLOR_BASIC_KEYS = createAllowedKeySet<ColorBasicSettings>({
	keys: {
		blacks: true,
		brightness: true,
		contrast: true,
		enabled: true,
		exposure: true,
		fade: true,
		grain: true,
		highlights: true,
		saturation: true,
		shadows: true,
		sharpness: true,
		temperature: true,
		tint: true,
		vibrance: true,
		vignette: true,
		whites: true,
	},
});
const COLOR_LUT_KEYS = createAllowedKeySet<ColorLutSettings>({
	keys: {
		cube: true,
		enabled: true,
		intensity: true,
		name: true,
		presetId: true,
		skinProtection: true,
	},
});
const COLOR_CUBE_KEYS = createAllowedKeySet<ColorCubeLut>({
	keys: {
		domainMax: true,
		domainMin: true,
		size: true,
		values: true,
	},
});
const COLOR_HSL_KEYS = createAllowedKeySet<ColorHslSettings>({
	keys: { enabled: true, ranges: true },
});
const COLOR_HSL_RANGE_NAMES = new Set([
	"red",
	"orange",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"magenta",
]);
const COLOR_HSL_RANGE_KEYS = createAllowedKeySet<ColorHslRangeSettings>({
	keys: { hue: true, luminance: true, saturation: true },
});
const COLOR_CURVES_KEYS = createAllowedKeySet<ColorCurvesSettings>({
	keys: {
		blue: true,
		enabled: true,
		green: true,
		master: true,
		mix: true,
		red: true,
	},
});
const COLOR_CURVE_POINT_KEYS = createAllowedKeySet<ColorCurvePoint>({
	keys: { id: true, x: true, y: true },
});
const COLOR_SECONDARY_CURVES_KEYS =
	createAllowedKeySet<ColorSecondaryCurvesSettings>({
		keys: {
			enabled: true,
			hueVsHue: true,
			hueVsLuminance: true,
			hueVsSaturation: true,
			luminanceVsSaturation: true,
			mix: true,
			saturationVsSaturation: true,
		},
	});
const COLOR_SECONDARY_CURVE_KEYS = createAllowedKeySet<ColorSecondaryCurve>({
	keys: { points: true, samples: true },
});
const COLOR_WHEELS_KEYS = createAllowedKeySet<ColorWheelsSettings>({
	keys: {
		balance: true,
		enabled: true,
		highlights: true,
		midtones: true,
		mode: true,
		offset: true,
		shadows: true,
		strength: true,
	},
});
const COLOR_WHEEL_KEYS = createAllowedKeySet<ColorWheelSettings>({
	keys: { luminance: true, x: true, y: true },
});
const COLOR_SMART_KEYS = createAllowedKeySet<ColorSmartSettings>({
	keys: {
		autoTone: true,
		autoWhiteBalance: true,
		correction: true,
		enabled: true,
		error: true,
		intensity: true,
		referenceName: true,
		status: true,
	},
});
const COLOR_SMART_CORRECTION_KEYS = new Set([
	"exposure",
	"contrast",
	"temperature",
	"tint",
	"saturation",
]);
const COLOR_MASK_KEYS = createAllowedKeySet<ColorGradeMaskSettings>({
	keys: { enabled: true, invert: true, maskIds: true },
});
const COLOR_MANAGEMENT_KEYS = createAllowedKeySet<ColorManagementSettings>({
	keys: {
		enabled: true,
		inputSpace: true,
		outputSpace: true,
		peakNits: true,
		toneMapping: true,
		workingSpace: true,
	},
});
const COLOR_PROPERTY_KEYFRAME_KEYS = createAllowedKeySet<ColorPropertyKeyframe>(
	{
		keys: {
			easing: true,
			frame: true,
			id: true,
			value: true,
		},
	}
);
const COLOR_CURVE_SHAPE_KEYFRAME_KEYS =
	createAllowedKeySet<ColorCurveShapeKeyframe>({
		keys: {
			easing: true,
			frame: true,
			id: true,
			points: true,
			samples: true,
		},
	});
const COLOR_KEYFRAME_PROPERTIES = createAllowedKeySet<
	Record<ColorKeyframeProperty, unknown>
>({
	keys: {
		"basic.blacks": true,
		"basic.brightness": true,
		"basic.contrast": true,
		"basic.exposure": true,
		"basic.fade": true,
		"basic.grain": true,
		"basic.highlights": true,
		"basic.saturation": true,
		"basic.shadows": true,
		"basic.sharpness": true,
		"basic.temperature": true,
		"basic.tint": true,
		"basic.vibrance": true,
		"basic.vignette": true,
		"basic.whites": true,
		"curves.mix": true,
		"hsl.blue.hue": true,
		"hsl.blue.luminance": true,
		"hsl.blue.saturation": true,
		"hsl.cyan.hue": true,
		"hsl.cyan.luminance": true,
		"hsl.cyan.saturation": true,
		"hsl.green.hue": true,
		"hsl.green.luminance": true,
		"hsl.green.saturation": true,
		"hsl.magenta.hue": true,
		"hsl.magenta.luminance": true,
		"hsl.magenta.saturation": true,
		"hsl.orange.hue": true,
		"hsl.orange.luminance": true,
		"hsl.orange.saturation": true,
		"hsl.purple.hue": true,
		"hsl.purple.luminance": true,
		"hsl.purple.saturation": true,
		"hsl.red.hue": true,
		"hsl.red.luminance": true,
		"hsl.red.saturation": true,
		"hsl.yellow.hue": true,
		"hsl.yellow.luminance": true,
		"hsl.yellow.saturation": true,
		"lut.intensity": true,
		"lut.skinProtection": true,
		"secondaryCurves.mix": true,
		"smart.intensity": true,
		"wheels.balance": true,
		"wheels.highlights.luminance": true,
		"wheels.highlights.x": true,
		"wheels.highlights.y": true,
		"wheels.midtones.luminance": true,
		"wheels.midtones.x": true,
		"wheels.midtones.y": true,
		"wheels.offset.luminance": true,
		"wheels.offset.x": true,
		"wheels.offset.y": true,
		"wheels.shadows.luminance": true,
		"wheels.shadows.x": true,
		"wheels.shadows.y": true,
		"wheels.strength": true,
	},
});
const COLOR_CURVE_SHAPE_PROPERTIES = createAllowedKeySet<
	Record<ColorCurveShapeProperty, unknown>
>({
	keys: {
		"curves.blue": true,
		"curves.green": true,
		"curves.master": true,
		"curves.red": true,
		"secondaryCurves.hueVsHue": true,
		"secondaryCurves.hueVsLuminance": true,
		"secondaryCurves.hueVsSaturation": true,
		"secondaryCurves.luminanceVsSaturation": true,
		"secondaryCurves.saturationVsSaturation": true,
	},
});

const MEDIA_AUDIO_KEYS = createAllowedKeySet<MediaAudioSettings>({
	keys: {
		channelMode: true,
		compressor: true,
		cover: true,
		denoise: true,
		echo: true,
		enabled: true,
		equalizer: true,
		fadeIn: true,
		fadeOut: true,
		keyframes: true,
		limiter: true,
		loudness: true,
		lyrics: true,
		pan: true,
		panEnabled: true,
		parametricEqualizer: true,
		pitch: true,
		repair: true,
		reverb: true,
		separation: true,
		telephone: true,
		voiceConversion: true,
		voiceEnhance: true,
		volumeDb: true,
	},
});
const AUDIO_BUS_EFFECT_KEYS = createAllowedKeySet<AudioBusEffectsSettings>({
	keys: {
		compressor: true,
		limiter: true,
		parametricEqualizer: true,
	},
});
const AUDIO_LOUDNESS_KEYS = createAllowedKeySet<AudioLoudnessSettings>({
	keys: {
		analysisError: true,
		analysisStatus: true,
		enabled: true,
		loudnessRange: true,
		measuredLufs: true,
		measuredTruePeakDb: true,
		targetLufs: true,
		truePeakDb: true,
	},
});
const AUDIO_DENOISE_KEYS = createAllowedKeySet<AudioDenoiseSettings>({
	keys: {
		amount: true,
		enabled: true,
		error: true,
		mode: true,
		noiseFloorDb: true,
		processedMediaId: true,
		status: true,
	},
});
const AUDIO_VOICE_ENHANCE_KEYS = createAllowedKeySet<AudioVoiceEnhanceSettings>(
	{
		keys: {
			clarity: true,
			enabled: true,
			presence: true,
			warmth: true,
		},
	}
);
const AUDIO_PITCH_KEYS = createAllowedKeySet<AudioPitchSettings>({
	keys: {
		enabled: true,
		preserveFormants: true,
		semitones: true,
	},
});
const AUDIO_EQUALIZER_KEYS = createAllowedKeySet<AudioEqualizerSettings>({
	keys: {
		enabled: true,
		highGainDb: true,
		lowGainDb: true,
		midGainDb: true,
	},
});
const AUDIO_PARAMETRIC_EQUALIZER_KEYS =
	createAllowedKeySet<AudioParametricEqualizerSettings>({
		keys: {
			bands: true,
			enabled: true,
			highCutHz: true,
			lowCutHz: true,
		},
	});
const AUDIO_PARAMETRIC_BAND_KEYS = createAllowedKeySet<AudioParametricEqBand>({
	keys: {
		enabled: true,
		frequencyHz: true,
		gainDb: true,
		id: true,
		q: true,
		type: true,
	},
});
const AUDIO_COMPRESSOR_KEYS = createAllowedKeySet<AudioCompressorSettings>({
	keys: {
		attackMs: true,
		enabled: true,
		makeupGainDb: true,
		ratio: true,
		releaseMs: true,
		thresholdDb: true,
	},
});
const AUDIO_LIMITER_KEYS = createAllowedKeySet<AudioLimiterSettings>({
	keys: { ceilingDb: true, enabled: true, releaseMs: true },
});
const AUDIO_REVERB_KEYS = createAllowedKeySet<AudioReverbSettings>({
	keys: {
		damping: true,
		enabled: true,
		mix: true,
		roomSize: true,
	},
});
const AUDIO_ECHO_KEYS = createAllowedKeySet<AudioEchoSettings>({
	keys: {
		delayMs: true,
		enabled: true,
		feedback: true,
		mix: true,
	},
});
const AUDIO_TELEPHONE_KEYS = createAllowedKeySet<AudioTelephoneSettings>({
	keys: { enabled: true, mix: true },
});
const AUDIO_REPAIR_KEYS = createAllowedKeySet<AudioRepairSettings>({
	keys: {
		deClick: true,
		deClip: true,
		deEsser: true,
		deHum: true,
		dePlosive: true,
		deReverb: true,
		noiseGate: true,
	},
});
const AUDIO_REPAIR_MODULE_KEYS = {
	deClick: new Set(["enabled", "amount"]),
	deClip: new Set(["enabled", "amount"]),
	deEsser: new Set(["enabled", "amount", "frequencyHz"]),
	deHum: new Set(["enabled", "frequencyHz", "harmonics"]),
	dePlosive: new Set(["enabled", "amount"]),
	deReverb: new Set(["enabled", "amount"]),
	noiseGate: new Set(["enabled", "thresholdDb", "attackMs", "releaseMs"]),
} satisfies Record<keyof AudioRepairSettings, ReadonlySet<string>>;
const AUDIO_SEPARATION_KEYS = createAllowedKeySet<AudioSeparationSettings>({
	keys: {
		enabled: true,
		error: true,
		status: true,
		stemGains: true,
		stemMediaIds: true,
	},
});
const AUDIO_VOICE_CONVERSION_KEYS =
	createAllowedKeySet<AudioVoiceConversionSettings>({
		keys: {
			enabled: true,
			error: true,
			inputMediaId: true,
			model: true,
			provider: true,
			sourceMediaId: true,
			sourceStem: true,
			status: true,
		},
	});
const AUDIO_COVER_KEYS = createAllowedKeySet<AudioCoverSettings>({
	keys: {
		convertedVocalMediaId: true,
		enabled: true,
		error: true,
		model: true,
		provider: true,
		status: true,
		targetVoiceLabel: true,
	},
});
const AUDIO_LYRICS_KEYS = createAllowedKeySet<AudioLyricsSettings>({
	keys: {
		captionTrackId: true,
		error: true,
		language: true,
		maxWordsPerLine: true,
		sourceFormat: true,
		sourceMediaId: true,
		speakerNames: true,
		status: true,
		text: true,
		words: true,
	},
});
const AUDIO_LYRICS_WORD_KEYS = createAllowedKeySet<AudioLyricsWord>({
	keys: {
		end: true,
		id: true,
		speakerId: true,
		start: true,
		text: true,
		type: true,
	},
});

const MEDIA_MASK_KEYS = createAllowedKeySet<MediaMask>({
	keys: {
		blendMode: true,
		centerX: true,
		centerY: true,
		closed: true,
		enabled: true,
		expansion: true,
		feather: true,
		fontFamily: true,
		fontWeight: true,
		height: true,
		id: true,
		invert: true,
		keyframes: true,
		maintainAspectRatio: true,
		mirrorMode: true,
		name: true,
		opacity: true,
		points: true,
		rotation: true,
		roundness: true,
		sourceMediaId: true,
		stroke: true,
		text: true,
		tracking: true,
		type: true,
		width: true,
	},
});
const MEDIA_MASK_POINT_KEYS = createAllowedKeySet<MediaMaskPoint>({
	keys: {
		handleIn: true,
		handleOut: true,
		id: true,
		x: true,
		y: true,
	},
});
const XY_POINT_KEYS = new Set(["x", "y"]);
const MEDIA_MASK_TRACKING_KEYS = createAllowedKeySet<MediaMaskTracking>({
	keys: {
		anchorFrame: true,
		correctedFrames: true,
		direction: true,
		error: true,
		progress: true,
		source: true,
		status: true,
		totalFrames: true,
		trackedFrames: true,
	},
});
const MEDIA_MASK_STROKE_KEYS = createAllowedKeySet<MediaMaskStroke>({
	keys: {
		color: true,
		glow: true,
		offsetX: true,
		offsetY: true,
		opacity: true,
		style: true,
		width: true,
	},
});
const MEDIA_CUSTOM_CUTOUT_KEYS = createAllowedKeySet<MediaCustomCutout>({
	keys: {
		applyStrokes: true,
		enabled: true,
		error: true,
		generatedFrom: true,
		resultMaskId: true,
		sourceMediaId: true,
		status: true,
		strokes: true,
	},
});
const MEDIA_CUSTOM_CUTOUT_STROKE_KEYS =
	createAllowedKeySet<MediaCustomCutoutStroke>({
		keys: {
			frame: true,
			id: true,
			mode: true,
			points: true,
			size: true,
		},
	});
const MEDIA_CUSTOM_CUTOUT_POINT_KEYS =
	createAllowedKeySet<MediaCustomCutoutPoint>({
		keys: { x: true, y: true },
	});
const MEDIA_CHROMA_KEY_KEYS = createAllowedKeySet<MediaChromaKey>({
	keys: {
		blend: true,
		cleanup: true,
		color: true,
		enabled: true,
		keyframes: true,
		shadow: true,
		similarity: true,
		spill: true,
	},
});
const MEDIA_ENHANCEMENT_KEYS = createAllowedKeySet<MediaEnhancements>({
	keys: {
		beauty: true,
		clarity: true,
		denoise: true,
		relight: true,
		stabilization: true,
		upscale: true,
	},
});
const MEDIA_COMPOUND_KEYS = createAllowedKeySet<MediaCompound>({
	keys: { activeClipId: true, clips: true, kind: true },
});
const COMPOUND_CLIP_KEYS = createAllowedKeySet<CompoundMediaClip>({
	keys: {
		element: true,
		id: true,
		layer: true,
		offset: true,
		sourceTrackId: true,
	},
});

function assertKeys({
	allowed,
	path,
	record,
}: {
	allowed: ReadonlySet<string>;
	path: string;
	record: { [key: string]: JsonValue };
}): void {
	assertNoUnknownKeys({ allowed, path, record });
}

function validateNumberRecord({
	allowed,
	path,
	value,
}: {
	allowed: ReadonlySet<string>;
	path: string;
	value: JsonValue | undefined;
}): { [key: string]: JsonValue } {
	const record = getRecord({ path, value });
	assertKeys({ allowed, path, record });
	for (const [key, entry] of Object.entries(record)) {
		getFiniteNumber({ path: `${path}.${key}`, value: entry });
	}
	return record;
}

function validateStringRecord({
	allowed,
	path,
	value,
}: {
	allowed: ReadonlySet<string>;
	path: string;
	value: JsonValue | undefined;
}): void {
	const record = getRecord({ path, value });
	assertKeys({ allowed, path, record });
	for (const [key, entry] of Object.entries(record)) {
		getString({ path: `${path}.${key}`, value: entry });
	}
}

function validateMediaPropertyKeyframes({
	path,
	properties,
	value,
}: {
	path: string;
	properties: ReadonlySet<string>;
	value: JsonValue | undefined;
}): void {
	validateRecordOfArrays({ allowed: properties, path, value });
	if (value === undefined) return;
	const record = getRecord({ path, value });
	for (const [property, entries] of Object.entries(record)) {
		const keyframes = getArray({
			path: `${path}.${property}`,
			value: entries,
		});
		for (const [index, entry] of keyframes.entries()) {
			const keyframePath = `${path}.${property}[${index}]`;
			const keyframe = getRecord({ path: keyframePath, value: entry });
			assertKeys({
				allowed: MEDIA_PROPERTY_KEYFRAME_KEYS,
				path: keyframePath,
				record: keyframe,
			});
			getString({ path: `${keyframePath}.id`, value: keyframe.id });
			getFiniteNumber({
				path: `${keyframePath}.frame`,
				value: keyframe.frame,
			});
			getFiniteNumber({
				path: `${keyframePath}.value`,
				value: keyframe.value,
			});
			getString({
				path: `${keyframePath}.easing`,
				value: keyframe.easing,
			});
		}
	}
}

function validateCurvePoints({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const points = getArray({ path, value });
	for (const [index, entry] of points.entries()) {
		const pointPath = `${path}[${index}]`;
		const point = getRecord({ path: pointPath, value: entry });
		assertKeys({
			allowed: COLOR_CURVE_POINT_KEYS,
			path: pointPath,
			record: point,
		});
		getString({ path: `${pointPath}.id`, value: point.id });
		getFiniteNumber({ path: `${pointPath}.x`, value: point.x });
		getFiniteNumber({ path: `${pointPath}.y`, value: point.y });
	}
}

function validateMediaColor({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value === undefined) return;
	const color = getRecord({ path, value });
	assertKeys({ allowed: COLOR_SETTINGS_KEYS, path, record: color });
	getBoolean({ path: `${path}.enabled`, value: color.enabled });

	const basicPath = `${path}.basic`;
	const basic = getRecord({ path: basicPath, value: color.basic });
	assertKeys({ allowed: COLOR_BASIC_KEYS, path: basicPath, record: basic });
	getBoolean({ path: `${basicPath}.enabled`, value: basic.enabled });
	for (const [key, entry] of Object.entries(basic)) {
		if (key !== "enabled") {
			getFiniteNumber({ path: `${basicPath}.${key}`, value: entry });
		}
	}

	const filterPath = `${path}.filter`;
	const filter = getRecord({ path: filterPath, value: color.filter });
	assertKeys({ allowed: COLOR_FILTER_KEYS, path: filterPath, record: filter });
	getString({
		allowEmpty: true,
		path: `${filterPath}.presetId`,
		value: filter.presetId,
	});
	getFiniteNumber({
		path: `${filterPath}.presetVersion`,
		value: filter.presetVersion,
	});
	getFiniteNumber({
		path: `${filterPath}.intensity`,
		value: filter.intensity,
	});

	const lutPath = `${path}.lut`;
	const lut = getRecord({ path: lutPath, value: color.lut });
	assertKeys({ allowed: COLOR_LUT_KEYS, path: lutPath, record: lut });
	getBoolean({ path: `${lutPath}.enabled`, value: lut.enabled });
	getString({
		allowEmpty: true,
		path: `${lutPath}.presetId`,
		value: lut.presetId,
	});
	getString({
		allowEmpty: true,
		path: `${lutPath}.name`,
		value: lut.name,
	});
	getFiniteNumber({ path: `${lutPath}.intensity`, value: lut.intensity });
	getFiniteNumber({
		path: `${lutPath}.skinProtection`,
		value: lut.skinProtection,
	});
	if (lut.cube !== undefined) {
		const cubePath = `${lutPath}.cube`;
		const cube = getRecord({ path: cubePath, value: lut.cube });
		assertKeys({ allowed: COLOR_CUBE_KEYS, path: cubePath, record: cube });
		const size = getFiniteNumber({
			path: `${cubePath}.size`,
			value: cube.size,
		});
		if (!Number.isSafeInteger(size) || size < 2 || size > MAX_COLOR_CUBE_SIZE) {
			throw validationIssue({
				message: `Expected a LUT cube size from 2 through ${MAX_COLOR_CUBE_SIZE}.`,
				path: `${cubePath}.size`,
			});
		}
		for (const key of ["domainMin", "domainMax"] as const) {
			const entries = getArray({
				path: `${cubePath}.${key}`,
				value: cube[key],
			});
			if (entries.length !== 3) {
				throw validationIssue({
					message: "Expected exactly three channel values.",
					path: `${cubePath}.${key}`,
				});
			}
			for (const [index, entry] of entries.entries()) {
				getFiniteNumber({
					path: `${cubePath}.${key}[${index}]`,
					value: entry,
				});
			}
		}
		const values = getArray({
			path: `${cubePath}.values`,
			value: cube.values,
		});
		const expectedValueCount = size ** 3 * 3;
		if (values.length !== expectedValueCount) {
			throw validationIssue({
				message: `Expected exactly ${expectedValueCount} LUT channel values.`,
				path: `${cubePath}.values`,
			});
		}
		for (const [index, entry] of values.entries()) {
			getFiniteNumber({
				path: `${cubePath}.values[${index}]`,
				value: entry,
			});
		}
	}

	const hslPath = `${path}.hsl`;
	const hsl = getRecord({ path: hslPath, value: color.hsl });
	assertKeys({ allowed: COLOR_HSL_KEYS, path: hslPath, record: hsl });
	const rangesPath = `${hslPath}.ranges`;
	const ranges = getRecord({ path: rangesPath, value: hsl.ranges });
	assertKeys({
		allowed: COLOR_HSL_RANGE_NAMES,
		path: rangesPath,
		record: ranges,
	});
	for (const [rangeName, range] of Object.entries(ranges)) {
		validateNumberRecord({
			allowed: COLOR_HSL_RANGE_KEYS,
			path: `${rangesPath}.${rangeName}`,
			value: range,
		});
	}

	const curvesPath = `${path}.curves`;
	const curves = getRecord({ path: curvesPath, value: color.curves });
	assertKeys({
		allowed: COLOR_CURVES_KEYS,
		path: curvesPath,
		record: curves,
	});
	for (const key of ["master", "red", "green", "blue"]) {
		validateCurvePoints({
			path: `${curvesPath}.${key}`,
			value: curves[key],
		});
	}

	const secondaryPath = `${path}.secondaryCurves`;
	const secondary = getRecord({
		path: secondaryPath,
		value: color.secondaryCurves,
	});
	assertKeys({
		allowed: COLOR_SECONDARY_CURVES_KEYS,
		path: secondaryPath,
		record: secondary,
	});
	for (const key of [
		"hueVsSaturation",
		"hueVsHue",
		"hueVsLuminance",
		"luminanceVsSaturation",
		"saturationVsSaturation",
	]) {
		const curvePath = `${secondaryPath}.${key}`;
		const curve = getRecord({ path: curvePath, value: secondary[key] });
		assertKeys({
			allowed: COLOR_SECONDARY_CURVE_KEYS,
			path: curvePath,
			record: curve,
		});
		validateCurvePoints({
			path: `${curvePath}.points`,
			value: curve.points,
		});
		getArray({ path: `${curvePath}.samples`, value: curve.samples });
	}

	const wheelsPath = `${path}.wheels`;
	const wheels = getRecord({ path: wheelsPath, value: color.wheels });
	assertKeys({
		allowed: COLOR_WHEELS_KEYS,
		path: wheelsPath,
		record: wheels,
	});
	for (const key of ["shadows", "midtones", "highlights", "offset"]) {
		validateNumberRecord({
			allowed: COLOR_WHEEL_KEYS,
			path: `${wheelsPath}.${key}`,
			value: wheels[key],
		});
	}

	const smartPath = `${path}.smart`;
	const smart = getRecord({ path: smartPath, value: color.smart });
	assertKeys({ allowed: COLOR_SMART_KEYS, path: smartPath, record: smart });
	if (smart.correction !== undefined) {
		validateNumberRecord({
			allowed: COLOR_SMART_CORRECTION_KEYS,
			path: `${smartPath}.correction`,
			value: smart.correction,
		});
	}

	const maskPath = `${path}.mask`;
	const mask = getRecord({ path: maskPath, value: color.mask });
	assertKeys({ allowed: COLOR_MASK_KEYS, path: maskPath, record: mask });
	getArray({ path: `${maskPath}.maskIds`, value: mask.maskIds });

	const managementPath = `${path}.management`;
	const management = getRecord({
		path: managementPath,
		value: color.management,
	});
	assertKeys({
		allowed: COLOR_MANAGEMENT_KEYS,
		path: managementPath,
		record: management,
	});

	validateColorKeyframes({
		path: `${path}.keyframes`,
		value: color.keyframes,
	});
	validateColorCurveShapeKeyframes({
		path: `${path}.curveShapeKeyframes`,
		value: color.curveShapeKeyframes,
	});
}

function validateColorKeyframes({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	validateRecordOfArrays({
		allowed: COLOR_KEYFRAME_PROPERTIES,
		path,
		value,
	});
	if (value === undefined) return;
	const record = getRecord({ path, value });
	for (const [property, entries] of Object.entries(record)) {
		const keyframes = getArray({
			path: `${path}.${property}`,
			value: entries,
		});
		for (const [index, entry] of keyframes.entries()) {
			const keyframePath = `${path}.${property}[${index}]`;
			const keyframe = getRecord({ path: keyframePath, value: entry });
			assertKeys({
				allowed: COLOR_PROPERTY_KEYFRAME_KEYS,
				path: keyframePath,
				record: keyframe,
			});
		}
	}
}

function validateColorCurveShapeKeyframes({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	validateRecordOfArrays({
		allowed: COLOR_CURVE_SHAPE_PROPERTIES,
		path,
		value,
	});
	if (value === undefined) return;
	const record = getRecord({ path, value });
	for (const [property, entries] of Object.entries(record)) {
		const keyframes = getArray({
			path: `${path}.${property}`,
			value: entries,
		});
		for (const [index, entry] of keyframes.entries()) {
			const keyframePath = `${path}.${property}[${index}]`;
			const keyframe = getRecord({ path: keyframePath, value: entry });
			assertKeys({
				allowed: COLOR_CURVE_SHAPE_KEYFRAME_KEYS,
				path: keyframePath,
				record: keyframe,
			});
			validateCurvePoints({
				path: `${keyframePath}.points`,
				value: keyframe.points,
			});
		}
	}
}

function validateAudioModule({
	allowed,
	path,
	value,
}: {
	allowed: ReadonlySet<string>;
	path: string;
	value: JsonValue | undefined;
}): { [key: string]: JsonValue } {
	const record = getRecord({ path, value });
	assertKeys({ allowed, path, record });
	getBoolean({ path: `${path}.enabled`, value: record.enabled });
	return record;
}

function validateParametricEqualizer({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const equalizer = validateAudioModule({
		allowed: AUDIO_PARAMETRIC_EQUALIZER_KEYS,
		path,
		value,
	});
	const bands = getArray({ path: `${path}.bands`, value: equalizer.bands });
	for (const [index, entry] of bands.entries()) {
		const bandPath = `${path}.bands[${index}]`;
		const band = getRecord({ path: bandPath, value: entry });
		assertKeys({
			allowed: AUDIO_PARAMETRIC_BAND_KEYS,
			path: bandPath,
			record: band,
		});
	}
}

export function validateAudioBusEffectsSettings({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const effects = getRecord({ path, value });
	assertKeys({ allowed: AUDIO_BUS_EFFECT_KEYS, path, record: effects });
	validateParametricEqualizer({
		path: `${path}.parametricEqualizer`,
		value: effects.parametricEqualizer,
	});
	validateAudioModule({
		allowed: AUDIO_COMPRESSOR_KEYS,
		path: `${path}.compressor`,
		value: effects.compressor,
	});
	validateAudioModule({
		allowed: AUDIO_LIMITER_KEYS,
		path: `${path}.limiter`,
		value: effects.limiter,
	});
}

function validateAudioLyrics({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const lyrics = getRecord({ path, value });
	assertKeys({ allowed: AUDIO_LYRICS_KEYS, path, record: lyrics });
	getString({
		allowEmpty: true,
		path: `${path}.status`,
		value: lyrics.status,
	});
	getString({
		allowEmpty: true,
		path: `${path}.text`,
		value: lyrics.text,
	});
	const words = getArray({ path: `${path}.words`, value: lyrics.words });
	for (const [index, entry] of words.entries()) {
		const wordPath = `${path}.words[${index}]`;
		const word = getRecord({ path: wordPath, value: entry });
		assertKeys({
			allowed: AUDIO_LYRICS_WORD_KEYS,
			path: wordPath,
			record: word,
		});
	}
	if (lyrics.speakerNames !== undefined) {
		const speakers = getRecord({
			path: `${path}.speakerNames`,
			value: lyrics.speakerNames,
		});
		for (const [speakerId, speakerName] of Object.entries(speakers)) {
			getString({
				path: `${path}.speakerNames.${speakerId}`,
				value: speakerName,
			});
		}
	}
	assertOptionalFiniteNumber({
		path: `${path}.maxWordsPerLine`,
		value: lyrics.maxWordsPerLine,
	});
}

function validateMediaAudio({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value === undefined) return;
	const audio = getRecord({ path, value });
	assertKeys({ allowed: MEDIA_AUDIO_KEYS, path, record: audio });
	for (const key of ["enabled", "panEnabled"]) {
		getBoolean({ path: `${path}.${key}`, value: audio[key] });
	}
	for (const key of ["volumeDb", "fadeIn", "fadeOut", "pan"]) {
		getFiniteNumber({ path: `${path}.${key}`, value: audio[key] });
	}
	getString({ path: `${path}.channelMode`, value: audio.channelMode });

	validateAudioModule({
		allowed: AUDIO_LOUDNESS_KEYS,
		path: `${path}.loudness`,
		value: audio.loudness,
	});
	validateAudioModule({
		allowed: AUDIO_DENOISE_KEYS,
		path: `${path}.denoise`,
		value: audio.denoise,
	});
	validateAudioModule({
		allowed: AUDIO_VOICE_ENHANCE_KEYS,
		path: `${path}.voiceEnhance`,
		value: audio.voiceEnhance,
	});
	validateAudioModule({
		allowed: AUDIO_PITCH_KEYS,
		path: `${path}.pitch`,
		value: audio.pitch,
	});
	validateAudioModule({
		allowed: AUDIO_EQUALIZER_KEYS,
		path: `${path}.equalizer`,
		value: audio.equalizer,
	});
	validateParametricEqualizer({
		path: `${path}.parametricEqualizer`,
		value: audio.parametricEqualizer,
	});

	const repairPath = `${path}.repair`;
	const repair = getRecord({ path: repairPath, value: audio.repair });
	assertKeys({
		allowed: AUDIO_REPAIR_KEYS,
		path: repairPath,
		record: repair,
	});
	for (const [moduleName, allowed] of Object.entries(
		AUDIO_REPAIR_MODULE_KEYS
	)) {
		validateAudioModule({
			allowed,
			path: `${repairPath}.${moduleName}`,
			value: repair[moduleName],
		});
	}

	validateAudioModule({
		allowed: AUDIO_COMPRESSOR_KEYS,
		path: `${path}.compressor`,
		value: audio.compressor,
	});
	validateAudioModule({
		allowed: AUDIO_LIMITER_KEYS,
		path: `${path}.limiter`,
		value: audio.limiter,
	});
	validateAudioModule({
		allowed: AUDIO_REVERB_KEYS,
		path: `${path}.reverb`,
		value: audio.reverb,
	});
	validateAudioModule({
		allowed: AUDIO_ECHO_KEYS,
		path: `${path}.echo`,
		value: audio.echo,
	});
	validateAudioModule({
		allowed: AUDIO_TELEPHONE_KEYS,
		path: `${path}.telephone`,
		value: audio.telephone,
	});

	const separation = validateAudioModule({
		allowed: AUDIO_SEPARATION_KEYS,
		path: `${path}.separation`,
		value: audio.separation,
	});
	if (separation.stemMediaIds !== undefined) {
		validateStringRecord({
			allowed: AUDIO_STEM_NAMES,
			path: `${path}.separation.stemMediaIds`,
			value: separation.stemMediaIds,
		});
	}
	if (separation.stemGains !== undefined) {
		validateNumberRecord({
			allowed: AUDIO_STEM_NAMES,
			path: `${path}.separation.stemGains`,
			value: separation.stemGains,
		});
	}
	validateAudioModule({
		allowed: AUDIO_VOICE_CONVERSION_KEYS,
		path: `${path}.voiceConversion`,
		value: audio.voiceConversion,
	});
	validateAudioModule({
		allowed: AUDIO_COVER_KEYS,
		path: `${path}.cover`,
		value: audio.cover,
	});
	validateAudioLyrics({
		path: `${path}.lyrics`,
		value: audio.lyrics,
	});
	validateMediaPropertyKeyframes({
		path: `${path}.keyframes`,
		properties: AUDIO_KEYFRAME_PROPERTIES,
		value: audio.keyframes,
	});
}

function validateMediaMask({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const mask = getRecord({ path, value });
	assertKeys({ allowed: MEDIA_MASK_KEYS, path, record: mask });
	assertOptionalBoolean({ path: `${path}.enabled`, value: mask.enabled });
	if (mask.points !== undefined) {
		const points = getArray({ path: `${path}.points`, value: mask.points });
		for (const [index, entry] of points.entries()) {
			const pointPath = `${path}.points[${index}]`;
			const point = getRecord({ path: pointPath, value: entry });
			assertKeys({
				allowed: MEDIA_MASK_POINT_KEYS,
				path: pointPath,
				record: point,
			});
			for (const handleName of ["handleIn", "handleOut"]) {
				if (point[handleName] !== undefined) {
					validateNumberRecord({
						allowed: XY_POINT_KEYS,
						path: `${pointPath}.${handleName}`,
						value: point[handleName],
					});
				}
			}
		}
	}
	validateMediaPropertyKeyframes({
		path: `${path}.keyframes`,
		properties: MEDIA_MASK_KEYFRAME_PROPERTIES,
		value: mask.keyframes,
	});
	if (mask.tracking !== undefined) {
		const trackingPath = `${path}.tracking`;
		const tracking = getRecord({
			path: trackingPath,
			value: mask.tracking,
		});
		assertKeys({
			allowed: MEDIA_MASK_TRACKING_KEYS,
			path: trackingPath,
			record: tracking,
		});
	}
	if (mask.stroke !== undefined) {
		const strokePath = `${path}.stroke`;
		const stroke = getRecord({ path: strokePath, value: mask.stroke });
		assertKeys({
			allowed: MEDIA_MASK_STROKE_KEYS,
			path: strokePath,
			record: stroke,
		});
	}
}

function validateCustomCutout({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const cutout = getRecord({ path, value });
	assertKeys({ allowed: MEDIA_CUSTOM_CUTOUT_KEYS, path, record: cutout });
	const strokes = getArray({ path: `${path}.strokes`, value: cutout.strokes });
	for (const [index, entry] of strokes.entries()) {
		const strokePath = `${path}.strokes[${index}]`;
		const stroke = getRecord({ path: strokePath, value: entry });
		assertKeys({
			allowed: MEDIA_CUSTOM_CUTOUT_STROKE_KEYS,
			path: strokePath,
			record: stroke,
		});
		const points = getArray({
			path: `${strokePath}.points`,
			value: stroke.points,
		});
		for (const [pointIndex, pointEntry] of points.entries()) {
			const pointPath = `${strokePath}.points[${pointIndex}]`;
			const point = getRecord({ path: pointPath, value: pointEntry });
			assertKeys({
				allowed: MEDIA_CUSTOM_CUTOUT_POINT_KEYS,
				path: pointPath,
				record: point,
			});
		}
	}
}

function validateMediaCompound({
	path,
	validateNestedElement,
	value,
}: {
	path: string;
	validateNestedElement:
		| (({ path, value }: { path: string; value: JsonValue }) => void)
		| undefined;
	value: JsonValue | undefined;
}): void {
	const compound = getRecord({ path, value });
	assertKeys({ allowed: MEDIA_COMPOUND_KEYS, path, record: compound });
	const clips = getArray({ path: `${path}.clips`, value: compound.clips });
	for (const [index, entry] of clips.entries()) {
		const clipPath = `${path}.clips[${index}]`;
		const clip = getRecord({ path: clipPath, value: entry });
		assertKeys({
			allowed: COMPOUND_CLIP_KEYS,
			path: clipPath,
			record: clip,
		});
		const elementPath = `${clipPath}.element`;
		if (validateNestedElement) {
			validateNestedElement({ path: elementPath, value: clip.element });
			continue;
		}
		const element = getRecord({ path: elementPath, value: clip.element });
		validateMediaElement({ element, path: elementPath });
	}
}

export function validateMediaElement({
	element,
	path,
	validateNestedElement,
}: {
	element: { [key: string]: JsonValue };
	path: string;
	validateNestedElement?: ({
		path,
		value,
	}: {
		path: string;
		value: JsonValue;
	}) => void;
}): void {
	assertKeys({ allowed: MEDIA_ELEMENT_KEYS, path, record: element });
	getString({ path: `${path}.mediaId`, value: element.mediaId });
	for (const key of [
		"volume",
		"scaleX",
		"scaleY",
		"opacity",
		"animationInDuration",
		"animationOutDuration",
		"comboAnimationIntensity",
		"audioFadeIn",
		"audioFadeOut",
		"audioDenoise",
		"audioPan",
		"playbackRate",
		"freezeFrameTime",
		"freezeFrameDuration",
	]) {
		assertOptionalFiniteNumber({
			path: `${path}.${key}`,
			value: element[key],
		});
	}
	for (const key of [
		"maintainAspectRatio",
		"flipHorizontal",
		"flipVertical",
		"audioNormalize",
		"reverse",
		"preservePitch",
	]) {
		assertOptionalBoolean({ path: `${path}.${key}`, value: element[key] });
	}
	if (element.adjustments !== undefined) {
		validateNumberRecord({
			allowed: MEDIA_ADJUSTMENT_KEYS,
			path: `${path}.adjustments`,
			value: element.adjustments,
		});
	}
	validateMediaColor({ path: `${path}.color`, value: element.color });
	validateMediaAudio({ path: `${path}.audio`, value: element.audio });
	validateMediaPropertyKeyframes({
		path: `${path}.keyframes`,
		properties: MEDIA_KEYFRAME_PROPERTIES,
		value: element.keyframes,
	});
	if (element.speedKeyframes !== undefined) {
		const keyframes = getArray({
			path: `${path}.speedKeyframes`,
			value: element.speedKeyframes,
		});
		for (const [index, entry] of keyframes.entries()) {
			const keyframePath = `${path}.speedKeyframes[${index}]`;
			const keyframe = getRecord({ path: keyframePath, value: entry });
			assertKeys({
				allowed: MEDIA_PROPERTY_KEYFRAME_KEYS,
				path: keyframePath,
				record: keyframe,
			});
		}
	}
	if (element.crop !== undefined) {
		validateNumberRecord({
			allowed: MEDIA_CROP_KEYS,
			path: `${path}.crop`,
			value: element.crop,
		});
	}
	if (element.perspective !== undefined) {
		validateNumberRecord({
			allowed: MEDIA_PERSPECTIVE_KEYS,
			path: `${path}.perspective`,
			value: element.perspective,
		});
	}
	if (element.mask !== undefined) {
		validateMediaMask({ path: `${path}.mask`, value: element.mask });
	}
	if (element.masks !== undefined) {
		const masks = getArray({ path: `${path}.masks`, value: element.masks });
		for (const [index, mask] of masks.entries()) {
			validateMediaMask({
				path: `${path}.masks[${index}]`,
				value: mask,
			});
		}
	}
	if (element.customCutout !== undefined) {
		validateCustomCutout({
			path: `${path}.customCutout`,
			value: element.customCutout,
		});
	}
	if (element.chromaKey !== undefined) {
		const chromaPath = `${path}.chromaKey`;
		const chroma = getRecord({
			path: chromaPath,
			value: element.chromaKey,
		});
		assertKeys({
			allowed: MEDIA_CHROMA_KEY_KEYS,
			path: chromaPath,
			record: chroma,
		});
		validateMediaPropertyKeyframes({
			path: `${chromaPath}.keyframes`,
			properties: MEDIA_CHROMA_KEYFRAME_PROPERTIES,
			value: chroma.keyframes,
		});
	}
	if (element.enhancements !== undefined) {
		validateNumberRecord({
			allowed: MEDIA_ENHANCEMENT_KEYS,
			path: `${path}.enhancements`,
			value: element.enhancements,
		});
	}
	if (element.compound !== undefined) {
		validateMediaCompound({
			path: `${path}.compound`,
			validateNestedElement,
			value: element.compound,
		});
	}
}
