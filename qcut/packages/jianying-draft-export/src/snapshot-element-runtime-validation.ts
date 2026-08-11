import type {
	AdjustmentElement,
	AnimatedParameter,
	AudioLyricsWord,
	CaptionElement,
	EffectAudioCompanion,
	EffectChain,
	EffectElement,
	EffectInstance,
	EffectKeyframe,
	EffectParameters,
	EffectTimelineRange,
	HyperframesElement,
	HyperframesVariableDefinition,
	MarkdownElement,
	MediaAdjustments,
	MediaColorSettings,
	MediaPerspective,
	MediaPropertyKeyframe,
	RemotionElement,
	StickerElement,
	StickerKeyframeProperty,
	StickerMotionTracking,
	StickerTrackingAnchor,
	SubtitleStyle,
	TextElement,
	TextFontAssetReference,
	TextKeyframeProperty,
	TextPropertyKeyframe,
	TimelineElement,
} from "@qcut/editor-core";
import {
	assertNoUnknownKeys,
	assertOptionalBoolean,
	assertOptionalFiniteNumber,
	assertStringLiteral,
	getArray,
	getBoolean,
	getFiniteNumber,
	getRecord,
	getString,
	type JsonValue,
	validationIssue,
} from "./runtime-json.js";
import { validateMediaElement } from "./snapshot-media-runtime-validation.js";
import {
	createAllowedKeySet,
	validateRecordOfArrays,
} from "./snapshot-runtime-helpers.js";

const ELEMENT_TYPES = new Set([
	"media",
	"effect",
	"text",
	"sticker",
	"adjustment",
	"captions",
	"remotion",
	"hyperframes",
	"markdown",
]);

type CommonTimelineElement = Pick<TimelineElement, keyof TimelineElement>;

const COMMON_ELEMENT_KEYS = createAllowedKeySet<CommonTimelineElement>({
	keys: {
		colorLabel: true,
		duration: true,
		effectChains: true,
		effectIds: true,
		effects: true,
		groupId: true,
		height: true,
		hidden: true,
		id: true,
		name: true,
		rotation: true,
		startTime: true,
		templateBinding: true,
		trimEnd: true,
		trimStart: true,
		type: true,
		width: true,
		x: true,
		y: true,
	},
});

function createElementAllowedKeySet<T extends TimelineElement>({
	keys,
}: {
	keys: Record<Exclude<keyof T, keyof TimelineElement> & string, true>;
}): ReadonlySet<string> {
	return new Set([...COMMON_ELEMENT_KEYS, ...Object.keys(keys)]);
}

const TEXT_ELEMENT_KEYS = createElementAllowedKeySet<TextElement>({
	keys: {
		animationDelay: true,
		animationDuration: true,
		animationType: true,
		backgroundColor: true,
		backgroundOpacity: true,
		backgroundPadding: true,
		backgroundRadius: true,
		blendMode: true,
		color: true,
		content: true,
		curve: true,
		fontAsset: true,
		fontFamily: true,
		fontSize: true,
		fontStyle: true,
		fontWeight: true,
		glowBlur: true,
		glowColor: true,
		glowOpacity: true,
		keyframes: true,
		letterSpacing: true,
		lineHeight: true,
		opacity: true,
		shadowBlur: true,
		shadowColor: true,
		shadowOffsetX: true,
		shadowOffsetY: true,
		shadowOpacity: true,
		strokeColor: true,
		strokeOpacity: true,
		strokeWidth: true,
		textAlign: true,
		textAnimations: true,
		textDecoration: true,
		trackingOffsetX: true,
		trackingOffsetY: true,
		trackingRotation: true,
		trackingTargetId: true,
		verticalAlign: true,
	},
});
const TEXT_FONT_ASSET_KEYS = createAllowedKeySet<TextFontAssetReference>({
	keys: {
		assetId: true,
		cssFamily: true,
		familyName: true,
		fullName: true,
		kind: true,
		postscriptName: true,
		source: true,
	},
});
const STICKER_ELEMENT_KEYS = createElementAllowedKeySet<StickerElement>({
	keys: {
		animationInDuration: true,
		animationInType: true,
		animationLoopIntensity: true,
		animationLoopType: true,
		animationOutDuration: true,
		animationOutType: true,
		keyframes: true,
		maintainAspectRatio: true,
		mediaId: true,
		opacity: true,
		perspective: true,
		stickerId: true,
		tracking: true,
		zIndex: true,
	},
});
const CAPTION_ELEMENT_KEYS = createElementAllowedKeySet<CaptionElement>({
	keys: {
		confidence: true,
		language: true,
		source: true,
		style: true,
		text: true,
		words: true,
	},
});
const ADJUSTMENT_ELEMENT_KEYS = createElementAllowedKeySet<AdjustmentElement>({
	keys: {
		adjustments: true,
		color: true,
		masks: true,
		opacity: true,
	},
});
const EFFECT_ELEMENT_KEYS = createElementAllowedKeySet<EffectElement>({
	keys: { effect: true, targetElementId: true },
});
const REMOTION_ELEMENT_KEYS = createElementAllowedKeySet<RemotionElement>({
	keys: {
		componentId: true,
		componentPath: true,
		opacity: true,
		props: true,
		renderMode: true,
		scale: true,
	},
});
const HYPERFRAMES_ELEMENT_KEYS = createElementAllowedKeySet<HyperframesElement>(
	{
		keys: {
			compositionHeight: true,
			compositionId: true,
			compositionWidth: true,
			durationIsEstimated: true,
			fps: true,
			opacity: true,
			projectPath: true,
			renderMode: true,
			scale: true,
			sourcePath: true,
			variableDefinitions: true,
			variableValues: true,
		},
	}
);
const MARKDOWN_ELEMENT_KEYS = createElementAllowedKeySet<MarkdownElement>({
	keys: {
		backgroundColor: true,
		fontFamily: true,
		fontSize: true,
		markdownContent: true,
		opacity: true,
		padding: true,
		scrollMode: true,
		scrollSpeed: true,
		textColor: true,
		theme: true,
	},
});

const TEMPLATE_BINDING_KEYS = new Set([
	"instanceId",
	"templateId",
	"templateVersion",
	"slotId",
	"aspectRatio",
	"instanceStartTime",
]);
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
const TEXT_PROPERTY_KEYFRAME_KEYS = createAllowedKeySet<TextPropertyKeyframe>({
	keys: {
		easing: true,
		frame: true,
		id: true,
		value: true,
	},
});
const TEXT_KEYFRAME_PROPERTIES = createAllowedKeySet<
	Record<TextKeyframeProperty, unknown>
>({
	keys: {
		fontSize: true,
		opacity: true,
		rotation: true,
		x: true,
		y: true,
	},
});
const STICKER_KEYFRAME_PROPERTIES = createAllowedKeySet<
	Record<StickerKeyframeProperty, unknown>
>({
	keys: {
		bottomLeftX: true,
		bottomLeftY: true,
		bottomRightX: true,
		bottomRightY: true,
		height: true,
		opacity: true,
		rotation: true,
		topLeftX: true,
		topLeftY: true,
		topRightX: true,
		topRightY: true,
		width: true,
		x: true,
		y: true,
	},
});
const SUBTITLE_STYLE_KEYS = createAllowedKeySet<SubtitleStyle>({
	keys: {
		animationDelay: true,
		animationDuration: true,
		animationType: true,
		backgroundColor: true,
		bgOpacity: true,
		bold: true,
		fontColor: true,
		fontFamily: true,
		fontOpacity: true,
		fontSize: true,
		highlightColor: true,
		highlightScale: true,
		italic: true,
		karaokeMode: true,
		letterSpacing: true,
		lineSpacing: true,
		outlineColor: true,
		outlineWidth: true,
		position: true,
		shadowColor: true,
		shadowOffset: true,
		textAlign: true,
		underline: true,
		upcomingColor: true,
	},
});
const SUBTITLE_SHADOW_OFFSET_KEYS = new Set(["x", "y"]);
const SUBTITLE_POSITION_KEYS = new Set(["align", "x", "y"]);
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
const STICKER_TRACKING_KEYS = createAllowedKeySet<StickerMotionTracking>({
	keys: {
		anchor: true,
		followScale: true,
		mode: true,
		targetElementId: true,
		targetMaskId: true,
	},
});
const STICKER_TRACKING_ANCHOR_KEYS = createAllowedKeySet<StickerTrackingAnchor>(
	{
		keys: {
			centerX: true,
			centerY: true,
			height: true,
			width: true,
		},
	}
);
const HYPERFRAMES_VARIABLE_DEFINITION_KEYS =
	createAllowedKeySet<HyperframesVariableDefinition>({
		keys: {
			default: true,
			description: true,
			id: true,
			label: true,
			max: true,
			maxLength: true,
			min: true,
			options: true,
			placeholder: true,
			step: true,
			type: true,
			unit: true,
		},
	});
const HYPERFRAMES_VARIABLE_OPTION_KEYS = new Set(["label", "value"]);

const EFFECT_INSTANCE_KEYS = createAllowedKeySet<EffectInstance>({
	keys: {
		animations: true,
		audioCompanion: true,
		duration: true,
		effectType: true,
		enabled: true,
		id: true,
		name: true,
		parameters: true,
		presetId: true,
		renderProgram: true,
		timelineRange: true,
	},
});
const EFFECT_CHAIN_KEYS = createAllowedKeySet<EffectChain>({
	keys: {
		blendMode: true,
		effects: true,
		id: true,
		name: true,
	},
});
const EFFECT_ANIMATED_PARAMETER_KEYS = createAllowedKeySet<AnimatedParameter>({
	keys: {
		interpolation: true,
		keyframes: true,
		parameter: true,
	},
});
const EFFECT_KEYFRAME_KEYS = createAllowedKeySet<EffectKeyframe>({
	keys: {
		controlPoints: true,
		easing: true,
		time: true,
		value: true,
	},
});
const EFFECT_AUDIO_COMPANION_KEYS = createAllowedKeySet<EffectAudioCompanion>({
	keys: {
		durationSeconds: true,
		gain: true,
		offsetSeconds: true,
		resourceId: true,
	},
});
const EFFECT_TIMELINE_RANGE_KEYS = createAllowedKeySet<EffectTimelineRange>({
	keys: { duration: true, startTime: true },
});
const EFFECT_PARAMETER_KEYS = createAllowedKeySet<EffectParameters>({
	keys: {
		blendMode: true,
		blur: true,
		blurType: true,
		brightness: true,
		brushSize: true,
		bulge: true,
		bulgeRadius: true,
		chromatic: true,
		cinematic: true,
		colorDodge: true,
		contrast: true,
		cool: true,
		dissolve: true,
		dissolveProgress: true,
		dotSize: true,
		dramatic: true,
		edge: true,
		emboss: true,
		fadeIn: true,
		fadeOut: true,
		fisheye: true,
		fisheyeStrength: true,
		gamma: true,
		grain: true,
		grayscale: true,
		halftone: true,
		hue: true,
		invert: true,
		multiply: true,
		oilPainting: true,
		opacity: true,
		overlay: true,
		overlayOpacity: true,
		pencilSketch: true,
		pixelate: true,
		radiance: true,
		ripple: true,
		rotate: true,
		saturation: true,
		scale: true,
		screen: true,
		sepia: true,
		sharpen: true,
		skewX: true,
		skewY: true,
		strokeWidth: true,
		swirl: true,
		twist: true,
		twistAngle: true,
		vignette: true,
		vintage: true,
		warm: true,
		watercolor: true,
		wave: true,
		waveAmplitude: true,
		waveFrequency: true,
		wetness: true,
		wipe: true,
		wipeDirection: true,
		wipeProgress: true,
	},
});
const EFFECT_RENDER_PROGRAM_KEYS = new Set(["version", "stages"]);
const EFFECT_RENDER_WINDOW_KEYS = new Set(["startSeconds", "endSeconds"]);
const EFFECT_RENDER_STAGE_KEYS: Readonly<Record<string, ReadonlySet<string>>> =
	{
		"audio-reactive": new Set([
			"kind",
			"driver",
			"band",
			"property",
			"minimum",
			"maximum",
			"attackMs",
			"releaseMs",
			"window",
		]),
		composite: new Set(["kind", "layout", "copies", "gap", "window"]),
		decoration: new Set(["kind", "variant", "color", "opacity", "window"]),
		distortion: new Set(["kind", "variant", "strength", "window"]),
		filter: new Set(["kind", "window"]),
		motion: new Set(["kind", "intensity", "channels", "window"]),
		overlay: new Set([
			"kind",
			"resourceId",
			"blendMode",
			"opacity",
			"fit",
			"window",
		]),
		particles: new Set([
			"kind",
			"variant",
			"density",
			"speed",
			"color",
			"opacity",
			"window",
		]),
		"person-tracking": new Set([
			"kind",
			"target",
			"treatment",
			"echoVariant",
			"intensity",
			"vignette",
			"stroke",
			"fallback",
			"window",
		]),
	};
const EFFECT_MOTION_CHANNEL_KEYS = new Set([
	"property",
	"waveform",
	"amplitude",
	"frequencyHz",
	"phase",
]);
const EFFECT_PERSON_STROKE_KEYS = new Set(["style", "color", "width", "glow"]);

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
}): void {
	const record = getRecord({ path, value });
	assertKeys({ allowed, path, record });
	for (const [key, entry] of Object.entries(record)) {
		getFiniteNumber({ path: `${path}.${key}`, value: entry });
	}
}

function validateEffectRenderProgram({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const program = getRecord({ path, value });
	assertKeys({
		allowed: EFFECT_RENDER_PROGRAM_KEYS,
		path,
		record: program,
	});
	const stages = getArray({ path: `${path}.stages`, value: program.stages });
	for (const [index, entry] of stages.entries()) {
		const stagePath = `${path}.stages[${index}]`;
		const stage = getRecord({ path: stagePath, value: entry });
		const kind = getString({ path: `${stagePath}.kind`, value: stage.kind });
		const allowed = EFFECT_RENDER_STAGE_KEYS[kind];
		if (!allowed) {
			throw validationIssue({
				message: `Unsupported effect render stage kind: ${kind}.`,
				path: `${stagePath}.kind`,
			});
		}
		assertKeys({ allowed, path: stagePath, record: stage });
		if (stage.window !== undefined) {
			const windowPath = `${stagePath}.window`;
			const window = getRecord({
				path: windowPath,
				value: stage.window,
			});
			assertKeys({
				allowed: EFFECT_RENDER_WINDOW_KEYS,
				path: windowPath,
				record: window,
			});
		}
		if (kind === "motion") {
			const channels = getArray({
				path: `${stagePath}.channels`,
				value: stage.channels,
			});
			for (const [channelIndex, channelEntry] of channels.entries()) {
				const channelPath = `${stagePath}.channels[${channelIndex}]`;
				const channel = getRecord({
					path: channelPath,
					value: channelEntry,
				});
				assertKeys({
					allowed: EFFECT_MOTION_CHANNEL_KEYS,
					path: channelPath,
					record: channel,
				});
			}
		}
		if (kind === "person-tracking" && stage.stroke !== undefined) {
			const strokePath = `${stagePath}.stroke`;
			const stroke = getRecord({
				path: strokePath,
				value: stage.stroke,
			});
			assertKeys({
				allowed: EFFECT_PERSON_STROKE_KEYS,
				path: strokePath,
				record: stroke,
			});
		}
	}
}

function validateEffectInstance({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const effect = getRecord({ path, value });
	assertKeys({ allowed: EFFECT_INSTANCE_KEYS, path, record: effect });
	const parametersPath = `${path}.parameters`;
	const parameters = getRecord({
		path: parametersPath,
		value: effect.parameters,
	});
	assertKeys({
		allowed: EFFECT_PARAMETER_KEYS,
		path: parametersPath,
		record: parameters,
	});
	if (effect.renderProgram !== undefined) {
		validateEffectRenderProgram({
			path: `${path}.renderProgram`,
			value: effect.renderProgram,
		});
	}
	if (effect.audioCompanion !== undefined) {
		const audioPath = `${path}.audioCompanion`;
		const audio = getRecord({
			path: audioPath,
			value: effect.audioCompanion,
		});
		assertKeys({
			allowed: EFFECT_AUDIO_COMPANION_KEYS,
			path: audioPath,
			record: audio,
		});
	}
	if (effect.timelineRange !== undefined) {
		const rangePath = `${path}.timelineRange`;
		const range = getRecord({
			path: rangePath,
			value: effect.timelineRange,
		});
		assertKeys({
			allowed: EFFECT_TIMELINE_RANGE_KEYS,
			path: rangePath,
			record: range,
		});
	}
	if (effect.animations !== undefined) {
		const animations = getArray({
			path: `${path}.animations`,
			value: effect.animations,
		});
		for (const [animationIndex, entry] of animations.entries()) {
			const animationPath = `${path}.animations[${animationIndex}]`;
			const animation = getRecord({
				path: animationPath,
				value: entry,
			});
			assertKeys({
				allowed: EFFECT_ANIMATED_PARAMETER_KEYS,
				path: animationPath,
				record: animation,
			});
			const keyframes = getArray({
				path: `${animationPath}.keyframes`,
				value: animation.keyframes,
			});
			for (const [keyframeIndex, keyframeEntry] of keyframes.entries()) {
				const keyframePath = `${animationPath}.keyframes[${keyframeIndex}]`;
				const keyframe = getRecord({
					path: keyframePath,
					value: keyframeEntry,
				});
				assertKeys({
					allowed: EFFECT_KEYFRAME_KEYS,
					path: keyframePath,
					record: keyframe,
				});
			}
		}
	}
}

function validateBaseElement({
	element,
	path,
}: {
	element: { [key: string]: JsonValue };
	path: string;
}): string {
	getString({ path: `${path}.id`, value: element.id });
	getString({
		allowEmpty: true,
		path: `${path}.name`,
		value: element.name,
	});
	getFiniteNumber({ path: `${path}.duration`, value: element.duration });
	getFiniteNumber({ path: `${path}.startTime`, value: element.startTime });
	getFiniteNumber({ path: `${path}.trimStart`, value: element.trimStart });
	getFiniteNumber({ path: `${path}.trimEnd`, value: element.trimEnd });
	assertOptionalBoolean({ path: `${path}.hidden`, value: element.hidden });
	for (const key of ["x", "y", "width", "height", "rotation"]) {
		assertOptionalFiniteNumber({
			path: `${path}.${key}`,
			value: element[key],
		});
	}
	if (element.templateBinding !== undefined) {
		const bindingPath = `${path}.templateBinding`;
		const binding = getRecord({
			path: bindingPath,
			value: element.templateBinding,
		});
		assertKeys({
			allowed: TEMPLATE_BINDING_KEYS,
			path: bindingPath,
			record: binding,
		});
	}
	if (element.effects !== undefined) {
		const effects = getArray({
			path: `${path}.effects`,
			value: element.effects,
		});
		for (const [index, effect] of effects.entries()) {
			validateEffectInstance({
				path: `${path}.effects[${index}]`,
				value: effect,
			});
		}
	}
	if (element.effectChains !== undefined) {
		const chains = getArray({
			path: `${path}.effectChains`,
			value: element.effectChains,
		});
		for (const [chainIndex, entry] of chains.entries()) {
			const chainPath = `${path}.effectChains[${chainIndex}]`;
			const chain = getRecord({ path: chainPath, value: entry });
			assertKeys({
				allowed: EFFECT_CHAIN_KEYS,
				path: chainPath,
				record: chain,
			});
			const effects = getArray({
				path: `${chainPath}.effects`,
				value: chain.effects,
			});
			for (const [effectIndex, effect] of effects.entries()) {
				validateEffectInstance({
					path: `${chainPath}.effects[${effectIndex}]`,
					value: effect,
				});
			}
		}
	}
	if (element.effectIds !== undefined) {
		getArray({ path: `${path}.effectIds`, value: element.effectIds });
	}
	return assertStringLiteral({
		allowed: ELEMENT_TYPES,
		path: `${path}.type`,
		value: element.type,
	});
}

function validatePropertyKeyframes({
	allowed,
	path,
	properties,
	value,
}: {
	allowed: ReadonlySet<string>;
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
			assertKeys({ allowed, path: keyframePath, record: keyframe });
		}
	}
}

function validateTextFontAsset({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value === undefined) return;
	const fontAsset = getRecord({ path, value });
	assertKeys({ allowed: TEXT_FONT_ASSET_KEYS, path, record: fontAsset });
	assertStringLiteral({
		allowed: new Set(["local-font"]),
		path: `${path}.kind`,
		value: fontAsset.kind,
	});
	assertStringLiteral({
		allowed: new Set(["jianying-cache"]),
		path: `${path}.source`,
		value: fontAsset.source,
	});
	for (const key of [
		"assetId",
		"cssFamily",
		"familyName",
		"fullName",
		"postscriptName",
	]) {
		getString({ path: `${path}.${key}`, value: fontAsset[key] });
	}
}

function validateTextElement({
	element,
	path,
}: {
	element: { [key: string]: JsonValue };
	path: string;
}): void {
	assertKeys({ allowed: TEXT_ELEMENT_KEYS, path, record: element });
	for (const key of ["content", "fontFamily", "color", "backgroundColor"]) {
		getString({
			allowEmpty: key === "content" || key === "backgroundColor",
			path: `${path}.${key}`,
			value: element[key],
		});
	}
	for (const [key, allowed] of [
		["textAlign", new Set(["left", "center", "right"])],
		["fontWeight", new Set(["normal", "bold"])],
		["fontStyle", new Set(["normal", "italic"])],
		["textDecoration", new Set(["none", "underline", "line-through"])],
	] as const) {
		assertStringLiteral({
			allowed,
			path: `${path}.${key}`,
			value: element[key],
		});
	}
	for (const key of ["fontSize", "x", "y", "rotation", "opacity"]) {
		getFiniteNumber({ path: `${path}.${key}`, value: element[key] });
	}
	validateTextFontAsset({
		path: `${path}.fontAsset`,
		value: element.fontAsset,
	});
	validatePropertyKeyframes({
		allowed: TEXT_PROPERTY_KEYFRAME_KEYS,
		path: `${path}.keyframes`,
		properties: TEXT_KEYFRAME_PROPERTIES,
		value: element.keyframes,
	});
	if (element.textAnimations !== undefined) {
		validateTextAnimations({
			path: `${path}.textAnimations`,
			value: element.textAnimations,
		});
	}
}

function validateStickerElement({
	element,
	path,
}: {
	element: { [key: string]: JsonValue };
	path: string;
}): void {
	assertKeys({ allowed: STICKER_ELEMENT_KEYS, path, record: element });
	getString({ path: `${path}.stickerId`, value: element.stickerId });
	getString({ path: `${path}.mediaId`, value: element.mediaId });
	for (const key of [
		"x",
		"y",
		"width",
		"height",
		"rotation",
		"opacity",
		"animationInDuration",
		"animationOutDuration",
		"animationLoopIntensity",
		"zIndex",
	]) {
		assertOptionalFiniteNumber({
			path: `${path}.${key}`,
			value: element[key],
		});
	}
	validatePropertyKeyframes({
		allowed: MEDIA_PROPERTY_KEYFRAME_KEYS,
		path: `${path}.keyframes`,
		properties: STICKER_KEYFRAME_PROPERTIES,
		value: element.keyframes,
	});
	if (element.perspective !== undefined) {
		validateNumberRecord({
			allowed: MEDIA_PERSPECTIVE_KEYS,
			path: `${path}.perspective`,
			value: element.perspective,
		});
	}
	if (element.tracking !== undefined) {
		const trackingPath = `${path}.tracking`;
		const tracking = getRecord({
			path: trackingPath,
			value: element.tracking,
		});
		assertKeys({
			allowed: STICKER_TRACKING_KEYS,
			path: trackingPath,
			record: tracking,
		});
		const anchorPath = `${trackingPath}.anchor`;
		const anchor = getRecord({
			path: anchorPath,
			value: tracking.anchor,
		});
		assertKeys({
			allowed: STICKER_TRACKING_ANCHOR_KEYS,
			path: anchorPath,
			record: anchor,
		});
	}
}

function validateCaptionWords({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const words = getArray({ path, value });
	for (const [index, entry] of words.entries()) {
		const wordPath = `${path}[${index}]`;
		const word = getRecord({ path: wordPath, value: entry });
		assertKeys({
			allowed: AUDIO_LYRICS_WORD_KEYS,
			path: wordPath,
			record: word,
		});
	}
}

function validateCaptionElement({
	element,
	path,
}: {
	element: { [key: string]: JsonValue };
	path: string;
}): void {
	assertKeys({ allowed: CAPTION_ELEMENT_KEYS, path, record: element });
	getString({
		allowEmpty: true,
		path: `${path}.text`,
		value: element.text,
	});
	getString({ path: `${path}.language`, value: element.language });
	assertStringLiteral({
		allowed: new Set(["imported", "manual", "transcription"]),
		path: `${path}.source`,
		value: element.source,
	});
	assertOptionalFiniteNumber({
		path: `${path}.confidence`,
		value: element.confidence,
	});
	if (element.words !== undefined) {
		validateCaptionWords({
			path: `${path}.words`,
			value: element.words,
		});
	}
	if (element.style === undefined) return;

	const stylePath = `${path}.style`;
	const style = getRecord({ path: stylePath, value: element.style });
	assertKeys({ allowed: SUBTITLE_STYLE_KEYS, path: stylePath, record: style });
	for (const key of [
		"fontFamily",
		"fontColor",
		"outlineColor",
		"shadowColor",
		"backgroundColor",
	]) {
		getString({
			allowEmpty: true,
			path: `${stylePath}.${key}`,
			value: style[key],
		});
	}
	assertStringLiteral({
		allowed: new Set(["left", "center", "right"]),
		path: `${stylePath}.textAlign`,
		value: style.textAlign,
	});
	assertStringLiteral({
		allowed: new Set(["none", "fade", "slide-up", "slide-left"]),
		path: `${stylePath}.animationType`,
		value: style.animationType,
	});
	for (const key of [
		"fontSize",
		"letterSpacing",
		"fontOpacity",
		"outlineWidth",
		"bgOpacity",
		"lineSpacing",
		"animationDuration",
		"animationDelay",
	]) {
		getFiniteNumber({
			path: `${stylePath}.${key}`,
			value: style[key],
		});
	}
	for (const key of ["bold", "italic", "underline"]) {
		getBoolean({
			path: `${stylePath}.${key}`,
			value: style[key],
		});
	}
	const shadowPath = `${stylePath}.shadowOffset`;
	const shadow = getRecord({
		path: shadowPath,
		value: style.shadowOffset,
	});
	assertKeys({
		allowed: SUBTITLE_SHADOW_OFFSET_KEYS,
		path: shadowPath,
		record: shadow,
	});
	const positionPath = `${stylePath}.position`;
	const position = getRecord({
		path: positionPath,
		value: style.position,
	});
	assertKeys({
		allowed: SUBTITLE_POSITION_KEYS,
		path: positionPath,
		record: position,
	});
	assertStringLiteral({
		allowed: new Set(["top", "center", "bottom"]),
		path: `${positionPath}.align`,
		value: position.align,
	});
}

function validateAdjustmentElement({
	element,
	path,
}: {
	element: { [key: string]: JsonValue };
	path: string;
}): void {
	assertKeys({ allowed: ADJUSTMENT_ELEMENT_KEYS, path, record: element });
	if (element.adjustments !== undefined) {
		validateNumberRecord({
			allowed: MEDIA_ADJUSTMENT_KEYS,
			path: `${path}.adjustments`,
			value: element.adjustments,
		});
	}
	if (element.color !== undefined || element.masks !== undefined) {
		// The media validator owns the full color and mask schemas. A synthetic media shell
		// lets adjustment layers share the same strict nested validation.
		validateMediaElement({
			element: {
				...element,
				mediaId: "__adjustment_color_validation__",
				type: "media",
			},
			path,
			validateNestedElement: validateTrackElement,
		});
	}
}

function validateEffectElement({
	element,
	path,
}: {
	element: { [key: string]: JsonValue };
	path: string;
}): void {
	assertKeys({ allowed: EFFECT_ELEMENT_KEYS, path, record: element });
	getString({
		path: `${path}.targetElementId`,
		value: element.targetElementId,
	});
	validateEffectInstance({
		path: `${path}.effect`,
		value: element.effect,
	});
}

function validateRemotionElement({
	element,
	path,
}: {
	element: { [key: string]: JsonValue };
	path: string;
}): void {
	assertKeys({ allowed: REMOTION_ELEMENT_KEYS, path, record: element });
	getRecord({ path: `${path}.props`, value: element.props });
}

function validateHyperframesElement({
	element,
	path,
}: {
	element: { [key: string]: JsonValue };
	path: string;
}): void {
	assertKeys({ allowed: HYPERFRAMES_ELEMENT_KEYS, path, record: element });
	getRecord({
		path: `${path}.variableValues`,
		value: element.variableValues,
	});
	const definitions = getArray({
		path: `${path}.variableDefinitions`,
		value: element.variableDefinitions,
	});
	for (const [index, entry] of definitions.entries()) {
		const definitionPath = `${path}.variableDefinitions[${index}]`;
		const definition = getRecord({
			path: definitionPath,
			value: entry,
		});
		assertKeys({
			allowed: HYPERFRAMES_VARIABLE_DEFINITION_KEYS,
			path: definitionPath,
			record: definition,
		});
		if (definition.options !== undefined) {
			const options = getArray({
				path: `${definitionPath}.options`,
				value: definition.options,
			});
			for (const [optionIndex, optionEntry] of options.entries()) {
				const optionPath = `${definitionPath}.options[${optionIndex}]`;
				const option = getRecord({
					path: optionPath,
					value: optionEntry,
				});
				assertKeys({
					allowed: HYPERFRAMES_VARIABLE_OPTION_KEYS,
					path: optionPath,
					record: option,
				});
			}
		}
	}
}

function validateMarkdownElement({
	element,
	path,
}: {
	element: { [key: string]: JsonValue };
	path: string;
}): void {
	assertKeys({ allowed: MARKDOWN_ELEMENT_KEYS, path, record: element });
}

export function validateTrackElement({
	path,
	value,
}: {
	path: string;
	value: JsonValue;
}): void {
	const element = getRecord({ path, value });
	const type = validateBaseElement({ element, path });
	if (type === "media") {
		validateMediaElement({
			element,
			path,
			validateNestedElement: validateTrackElement,
		});
		return;
	}
	if (type === "text") {
		validateTextElement({ element, path });
		return;
	}
	if (type === "sticker") {
		validateStickerElement({ element, path });
		return;
	}
	if (type === "captions") {
		validateCaptionElement({ element, path });
		return;
	}
	if (type === "adjustment") {
		validateAdjustmentElement({ element, path });
		return;
	}
	if (type === "effect") {
		validateEffectElement({ element, path });
		return;
	}
	if (type === "remotion") {
		validateRemotionElement({ element, path });
		return;
	}
	if (type === "hyperframes") {
		validateHyperframesElement({ element, path });
		return;
	}
	validateMarkdownElement({ element, path });
}

function validateTextAnimations({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const animations = getRecord({ path, value });
	assertKeys({
		allowed: new Set(["schemaVersion", "entrance", "exit", "loop"]),
		path,
		record: animations,
	});
	for (const phaseName of ["entrance", "exit", "loop"]) {
		if (animations[phaseName] === undefined) continue;
		validateTextAnimationPhase({
			isLoop: phaseName === "loop",
			path: `${path}.${phaseName}`,
			value: animations[phaseName],
		});
	}
}

function validateTextAnimationPhase({
	isLoop,
	path,
	value,
}: {
	isLoop: boolean;
	path: string;
	value: JsonValue | undefined;
}): void {
	const phase = getRecord({ path, value });
	assertKeys({
		allowed: new Set([
			"sourcePreset",
			"timing",
			"sequence",
			"target",
			"effect",
			...(isLoop ? ["repeat"] : []),
		]),
		path,
		record: phase,
	});
	for (const [key, allowed] of [
		["sourcePreset", new Set(["id", "version"])],
		["timing", new Set(["duration", "delay", "easing"])],
		["sequence", new Set(["unit", "order", "staggerRatio", "seed", "locale"])],
		["repeat", new Set(["mode", "count", "gap", "phaseOffset"])],
	] as const) {
		if (phase[key] === undefined) continue;
		const nestedPath = `${path}.${key}`;
		const nested = getRecord({ path: nestedPath, value: phase[key] });
		assertKeys({ allowed, path: nestedPath, record: nested });
		if (key === "timing" && typeof nested.easing === "object") {
			const easingPath = `${nestedPath}.easing`;
			const easing = getRecord({
				path: easingPath,
				value: nested.easing,
			});
			const easingType = getString({
				path: `${easingPath}.type`,
				value: easing.type,
			});
			assertKeys({
				allowed:
					easingType === "spring"
						? new Set(["type", "mass", "stiffness", "damping", "velocity"])
						: new Set(["type", "x1", "y1", "x2", "y2"]),
				path: easingPath,
				record: easing,
			});
		}
	}
	validateTextAnimationEffect({
		path: `${path}.effect`,
		value: phase.effect,
	});
}

const TEXT_ANIMATION_EFFECT_KEYS: Readonly<
	Record<string, ReadonlySet<string>>
> = {
	arc: new Set(["kind", "riseEm", "tiltDeg"]),
	blur: new Set(["kind", "direction", "distance", "radiusPx", "fade"]),
	bounce: new Set([
		"kind",
		"direction",
		"distance",
		"hiddenScale",
		"spring",
		"spatialWave",
	]),
	burst: new Set([
		"kind",
		"shape",
		"count",
		"speed",
		"directionDeg",
		"spreadDeg",
		"gravity",
		"lifeRandom",
		"sizeEm",
		"sizeRandom",
		"palette",
		"flutter",
		"rays",
		"seed",
	]),
	fade: new Set(["kind", "minimumOpacity"]),
	flip: new Set(["kind", "maxAngleDeg", "perspective"]),
	fold: new Set(["kind", "minimumScale", "phaseStepDeg"]),
	heart: new Set([
		"kind",
		"direction",
		"distance",
		"hiddenScale",
		"color",
		"particleCount",
		"spread",
		"seed",
	]),
	jitter: new Set(["kind", "steps", "amplitudeX", "amplitudeY"]),
	laser: new Set([
		"kind",
		"direction",
		"color",
		"thicknessPx",
		"glowPx",
		"trail",
		"fade",
	]),
	orbit: new Set([
		"kind",
		"rotation",
		"turns",
		"radius",
		"ring",
		"spin",
		"fade",
	]),
	rotate: new Set([
		"kind",
		"degrees",
		"travelDirection",
		"distance",
		"fade",
		"oscillation",
	]),
	scatter: new Set(["kind", "distance", "flicker", "rotateDeg", "seed"]),
	scale: new Set([
		"kind",
		"shakeEm",
		"hiddenScale",
		"overshoot",
		"fade",
		"axis",
		"pulse",
	]),
	shatter: new Set([
		"kind",
		"tilePx",
		"distortion",
		"gravity",
		"gravityRotDeg",
		"front",
		"frontRotDeg",
		"feather",
	]),
	slide: new Set(["kind", "direction", "distance", "fade"]),
	spiral: new Set(["kind", "turns", "radius", "drop", "fade"]),
	squeeze: new Set(["kind", "amount", "spatialCycles"]),
	tumble: new Set(["kind", "spinDeg", "drop", "fade"]),
	typewriter: new Set(["kind", "reveal", "rhythm", "cursor"]),
};

function validateTextAnimationEffect({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	const effect = getRecord({ path, value });
	const kind = getString({ path: `${path}.kind`, value: effect.kind });
	const allowed = TEXT_ANIMATION_EFFECT_KEYS[kind];
	if (!allowed) {
		throw validationIssue({
			message: `Unsupported text animation effect kind: ${kind}.`,
			path: `${path}.kind`,
		});
	}
	assertKeys({ allowed, path, record: effect });
	for (const key of ["distance", "radius", "drop", "gravity", "speed"]) {
		if (effect[key] === undefined) continue;
		const distancePath = `${path}.${key}`;
		const distance = getRecord({
			path: distancePath,
			value: effect[key],
		});
		assertKeys({
			allowed: new Set(["value", "unit"]),
			path: distancePath,
			record: distance,
		});
	}
	const nestedKeySets = {
		cursor: new Set(["text", "color", "blinkPeriod", "persist"]),
		oscillation: new Set(["cycles", "phaseEasing", "pivot"]),
		pulse: new Set(["cycles", "easing"]),
		rays: new Set(["count", "length"]),
		spatialWave: new Set(["spatialCycles", "phaseOffset"]),
		spring: new Set(["mass", "stiffness", "damping", "velocity"]),
	} satisfies Record<string, ReadonlySet<string>>;
	for (const [key, nestedAllowed] of Object.entries(nestedKeySets)) {
		if (effect[key] === undefined) continue;
		const nestedPath = `${path}.${key}`;
		const nested = getRecord({ path: nestedPath, value: effect[key] });
		assertKeys({
			allowed: nestedAllowed,
			path: nestedPath,
			record: nested,
		});
		if (key === "rays") {
			const lengthPath = `${nestedPath}.length`;
			const length = getRecord({
				path: lengthPath,
				value: nested.length,
			});
			assertKeys({
				allowed: new Set(["value", "unit"]),
				path: lengthPath,
				record: length,
			});
		}
	}
}
