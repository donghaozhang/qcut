import type {
	VideoMask,
	VideoSource,
	VideoTransition,
	VideoVisual,
} from "./ffmpeg/types";
import {
	DEFAULT_VIDEO_COLOR_SETTINGS,
	normalizeVideoColorSettings,
} from "./ffmpeg/color-settings";
import { buildVideoColorFilter } from "./ffmpeg/color-filter";
import { buildVideoColorFilterGraph } from "./ffmpeg/color-filter-graph";
import { buildChromaKeyFilterGraph } from "./ffmpeg/chroma-key-filter";
import { buildCustomCutoutExpression } from "./ffmpeg/custom-cutout-expression";
import { buildNumericKeyframeExpression } from "./ffmpeg/keyframe-expression";
import { buildMaskStrokeFilterGraph } from "./ffmpeg/mask-stroke-filter";
import {
	buildXfadeTransitionFilter,
	prepareTransitionSource,
} from "./ffmpeg/transition-filter";
import {
	composePreparedVisualLayers,
	type PreparedVisualLayer,
} from "./ffmpeg/visual-layer-compositor";
import { buildVideoFitFilter } from "./ffmpeg/video-fit-filter";
import {
	buildVideoEnhancementFilter,
	DEFAULT_VIDEO_ENHANCEMENTS,
} from "./ffmpeg/video-enhancement-filter";
import {
	buildEffectMotionExpressions,
	hasEffectMotionProperty,
} from "./ffmpeg/effect-motion-expression";
import {
	buildEffectAudioReactiveExpression,
	hasEffectAudioReactiveProperty,
} from "./ffmpeg/effect-audio-reactive-expression";
import type {
	EffectCompositeRenderStage,
	EffectOverlayRenderStage,
	EffectPersonTrackingRenderStage,
} from "./ffmpeg/effect-render-types";

const DEFAULT_ADJUSTMENTS: NonNullable<VideoVisual["adjustments"]> = {
	brightness: 0,
	contrast: 0,
	saturation: 0,
	temperature: 0,
	tint: 0,
	sharpness: 0,
	fade: 0,
	vignette: 0,
};

const DEFAULT_MASK: NonNullable<VideoVisual["mask"]> = {
	id: "mask-1",
	name: "Mask 1",
	enabled: true,
	type: "none",
	blendMode: "add",
	centerX: 0.5,
	centerY: 0.5,
	width: 0.8,
	height: 0.8,
	rotation: 0,
	feather: 0,
	roundness: 0,
	expansion: 0,
	opacity: 1,
	maintainAspectRatio: false,
	invert: false,
};

const DEFAULT_CHROMA_KEY: NonNullable<VideoVisual["chromaKey"]> = {
	enabled: false,
	color: "#00ff00",
	similarity: 0.2,
	blend: 0.1,
	shadow: 0,
	cleanup: 0,
	spill: 0,
};

const DEFAULT_CUSTOM_CUTOUT: NonNullable<VideoVisual["customCutout"]> = {
	enabled: false,
	applyStrokes: true,
	strokes: [],
	status: "idle",
};

const DEFAULT_VISUAL: VideoVisual = {
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
	animationInType: "none",
	animationInDuration: 0.5,
	animationOutType: "none",
	animationOutDuration: 0.5,
	comboAnimationType: "none",
	comboAnimationIntensity: 0.5,
	adjustments: DEFAULT_ADJUSTMENTS,
	color: DEFAULT_VIDEO_COLOR_SETTINGS,
	mask: DEFAULT_MASK,
	masks: [],
	customCutout: DEFAULT_CUSTOM_CUTOUT,
	chromaKey: DEFAULT_CHROMA_KEY,
	enhancements: DEFAULT_VIDEO_ENHANCEMENTS,
	keyframeFps: 30,
};

interface VideoTimelineFilterResult {
	filterSteps: string[];
	outputLabel: string;
	segmentCount: number;
}

export interface VideoTimelineLayer {
	outputLabel: string;
	trackOrder?: number;
	elementOrder?: number;
	sourceIndex: number;
	startTime: number;
	endTime: number;
	blendMode: VideoVisual["blendMode"];
}

export interface VideoTimelineLayerFilterResult {
	filterSteps: string[];
	layers: VideoTimelineLayer[];
	segmentCount: number;
}

function ffmpegColor(color: string): string {
	const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
	return match ? `0x${match[1]}` : "black";
}

export function buildVideoKeyframeExpression({
	visual,
	property,
	fallback,
	timeVariable = "T",
}: {
	visual: VideoVisual;
	property: string;
	fallback: number;
	timeVariable?: string;
}): string {
	return buildNumericKeyframeExpression({
		keyframes: visual.keyframes?.[property],
		fps: visual.keyframeFps,
		fallback,
		timeVariable,
	});
}

function resolveVisual(source: VideoSource): VideoVisual {
	return {
		...DEFAULT_VISUAL,
		...source.visual,
		crop: { ...DEFAULT_VISUAL.crop, ...source.visual?.crop },
		perspective: {
			...DEFAULT_VISUAL.perspective,
			...source.visual?.perspective,
		},
		adjustments: {
			...DEFAULT_ADJUSTMENTS,
			...source.visual?.adjustments,
		},
		color: normalizeVideoColorSettings({
			color: source.visual?.color,
			adjustments: source.visual?.adjustments,
		}),
		mask: { ...DEFAULT_MASK, ...source.visual?.mask },
		masks: source.visual?.masks?.map((mask) => ({
			...DEFAULT_MASK,
			...mask,
		})),
		customCutout: {
			...DEFAULT_CUSTOM_CUTOUT,
			...source.visual?.customCutout,
			strokes: source.visual?.customCutout?.strokes ?? [],
		},
		chromaKey: { ...DEFAULT_CHROMA_KEY, ...source.visual?.chromaKey },
		enhancements: {
			...DEFAULT_VIDEO_ENHANCEMENTS,
			...source.visual?.enhancements,
		},
		keyframes: source.visual?.keyframes,
		keyframeFps: source.visual?.keyframeFps ?? 30,
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export interface SpeedSample {
	sourceStart: number;
	sourceEnd: number;
	outputStart: number;
	outputEnd: number;
	rate: number;
}

function easingProgress(progress: number, easing: string): number {
	const value = clamp(progress, 0, 1);
	if (easing === "easeIn") return value ** 2;
	if (easing === "easeOut") return 1 - (1 - value) ** 2;
	if (easing === "easeInOut") {
		return value < 0.5 ? 2 * value ** 2 : 1 - (-2 * value + 2) ** 2 / 2;
	}
	if (easing === "spring") {
		return value + Math.sin(value * Math.PI) * 0.15 * (1 - value);
	}
	return value;
}

type SpeedSource = Pick<VideoSource, "playbackRate" | "speedKeyframes">;

function speedAtFrame(source: SpeedSource, frame: number, fps: number): number {
	const fallback = clamp(source.playbackRate ?? 1, 0.1, 8);
	const keyframes = [...(source.speedKeyframes ?? [])].sort(
		(a, b) => a.frame - b.frame
	);
	if (keyframes.length === 0) return fallback;
	if (frame <= keyframes[0].frame) return clamp(keyframes[0].value, 0.1, 8);
	for (let index = 1; index < keyframes.length; index++) {
		const to = keyframes[index];
		if (frame > to.frame) continue;
		const from = keyframes[index - 1];
		const progress = easingProgress(
			(frame - from.frame) / Math.max(1, to.frame - from.frame),
			to.easing
		);
		return clamp(from.value + (to.value - from.value) * progress, 0.1, 8);
	}
	return clamp(keyframes[keyframes.length - 1].value, 0.1, 8);
}

export function buildSpeedSamples(
	source: SpeedSource,
	sourceDuration: number,
	fps: number
): SpeedSample[] {
	const sampleRate = Math.max(1, fps);
	const samples: SpeedSample[] = [];
	let sourceTime = 0;
	let outputTime = 0;
	while (sourceTime < sourceDuration - 1e-9) {
		const step = Math.min(1 / sampleRate, sourceDuration - sourceTime);
		const rate = speedAtFrame(
			source,
			Math.round((sourceTime + step / 2) * sampleRate),
			sampleRate
		);
		const outputStep = step / rate;
		samples.push({
			sourceStart: sourceTime,
			sourceEnd: sourceTime + step,
			outputStart: outputTime,
			outputEnd: outputTime + outputStep,
			rate,
		});
		sourceTime += step;
		outputTime += outputStep;
	}
	return samples;
}

export function outputTimeAtSource(
	samples: SpeedSample[],
	sourceTime: number
): number {
	const sample = samples.find((item) => sourceTime <= item.sourceEnd + 1e-9);
	if (!sample) return samples[samples.length - 1]?.outputEnd ?? 0;
	return (
		sample.outputStart +
		(clamp(sourceTime, sample.sourceStart, sample.sourceEnd) -
			sample.sourceStart) /
			sample.rate
	);
}

function buildSpeedSetptsExpression(samples: SpeedSample[]): string {
	const time = "((PTS-STARTPTS)*TB)";
	let expression = String(samples[samples.length - 1]?.outputEnd ?? 0);
	for (let index = samples.length - 1; index >= 0; index--) {
		const sample = samples[index];
		const value = `${sample.outputStart}+((${time})-${sample.sourceStart})/${sample.rate}`;
		expression = `if(lt(${time},${sample.sourceEnd}),${value},${expression})`;
	}
	return expression;
}

export function buildAdjustmentFilter(visual: VideoVisual): string {
	return buildVideoColorFilter({ visual });
}

function buildMaskKeyframeExpression({
	mask,
	property,
	fallback,
	fps,
}: {
	mask: VideoMask;
	property: string;
	fallback: number;
	fps: number;
}): string {
	return buildNumericKeyframeExpression({
		keyframes: mask.keyframes?.[property],
		fps,
		fallback,
		timeVariable: `(N/${Math.max(1, fps)})`,
	});
}

function polygonMaskExpression({
	points,
	x,
	y,
}: {
	points: Array<{ x: number; y: number }>;
	x: string;
	y: string;
}): string {
	if (points.length < 3) return "0";
	const crossings = points.map((point, index) => {
		const next = points[(index + 1) % points.length];
		const crossesY = `neq(gt(${point.y},${y}),gt(${next.y},${y}))`;
		const edgeX = `${point.x}+(${next.x}-${point.x})*(${y}-${point.y})/((${next.y}-${point.y})+0.000001)`;
		return `((${crossesY})*lt(${x},${edgeX}))`;
	});
	return `mod(${crossings.join("+")},2)`;
}

function starMaskExpression(x: string, y: string): string {
	const points = Array.from({ length: 10 }, (_, index) => {
		const angle = -Math.PI / 2 + (index * Math.PI) / 5;
		const radius = index % 2 === 0 ? 0.5 : 0.22;
		return {
			x: 0.5 + Math.cos(angle) * radius,
			y: 0.5 + Math.sin(angle) * radius,
		};
	});
	return polygonMaskExpression({ points, x, y });
}

function buildSingleMaskExpression(input: VideoMask, fps: number): string {
	const mask = { ...DEFAULT_MASK, ...input };
	const value = (property: string, fallback: number) =>
		buildMaskKeyframeExpression({ mask, property, fallback, fps });
	const centerX = value("centerX", mask.centerX);
	const centerY = value("centerY", mask.centerY);
	const width = `max(0.001,(${value("width", mask.width)})+2*(${value("expansion", mask.expansion ?? 0)}))`;
	const height = `max(0.001,(${value("height", mask.height)})+2*(${value("expansion", mask.expansion ?? 0)}))`;
	const rotation = value("rotation", mask.rotation);
	const angle = `(-(${rotation})*PI/180)`;
	const x = `((X/W-(${centerX}))*cos(${angle})-(Y/H-(${centerY}))*sin(${angle}))`;
	const y = `((X/W-(${centerX}))*sin(${angle})+(Y/H-(${centerY}))*cos(${angle}))`;
	const feather = `max(0,${value("feather", mask.feather)})`;
	let expression: string;
	if (mask.type === "rectangle" || mask.type === "text") {
		const radius = `min(${width},${height})*${value("roundness", mask.roundness ?? 0)}*0.5`;
		const qx = `abs(${x})-(${width})/2+(${radius})`;
		const qy = `abs(${y})-(${height})/2+(${radius})`;
		const distance = `min(max(${qx},${qy}),0)+sqrt(pow(max(${qx},0),2)+pow(max(${qy},0),2))-(${radius})`;
		expression = `if(gt(${feather},0),max(0,min(1,-(${distance})/max(0.000001,${feather}))),lte(${distance},0))`;
	} else if (mask.type === "ellipse") {
		const distance = `sqrt(pow(${x}/((${width})/2),2)+pow(${y}/((${height})/2),2))-1`;
		expression = `if(gt(${feather},0),max(0,min(1,-(${distance})/max(0.000001,${feather}))),lte(${distance},0))`;
	} else if (mask.type === "linear") {
		expression = `if(gt(${feather},0),max(0,min(1,0.5+(${x})/max(0.000001,${feather}))),gte(${x},0))`;
	} else if (mask.type === "mirror") {
		const distance = `abs(${x})-(${width})/2`;
		expression = `if(gt(${feather},0),max(0,min(1,-(${distance})/max(0.000001,${feather}))),lte(${distance},0))`;
	} else if (mask.type === "star") {
		const localX = `(${x})/(${width})+0.5`;
		const localY = `(${y})/(${height})+0.5`;
		expression = starMaskExpression(localX, localY);
	} else if (mask.type === "heart") {
		const localX = `((${x})/((${width})/2))`;
		const localY = `(-(${y})/((${height})/2))`;
		const heart = `pow(pow(${localX},2)+pow(${localY},2)-1,3)-pow(${localX},2)*pow(${localY},3)`;
		expression = `lte(${heart},0)`;
	} else if (mask.type === "pen") {
		const localX = `(${x})/(${width})+0.5`;
		const localY = `(${y})/(${height})+0.5`;
		expression = polygonMaskExpression({
			points: mask.points ?? [],
			x: localX,
			y: localY,
		});
	} else if (mask.type === "person" || mask.type === "object") {
		expression = "0";
	} else {
		expression = "1";
	}
	if (mask.invert) expression = `1-(${expression})`;
	return `(${expression})*(${value("opacity", mask.opacity ?? 1)})`;
}

export function buildVideoMaskExpression(visual: VideoVisual): string {
	const masks = (
		visual.masks?.length
			? visual.masks
			: visual.mask && visual.mask.type !== "none"
				? [visual.mask]
				: []
	).filter((mask) => mask.enabled !== false && mask.type !== "none");
	if (masks.length === 0) return "1";
	let expression = buildSingleMaskExpression(
		masks[0],
		visual.keyframeFps || 30
	);
	for (let index = 1; index < masks.length; index += 1) {
		const mask = masks[index];
		const next = buildSingleMaskExpression(mask, visual.keyframeFps || 30);
		if (mask.blendMode === "subtract") {
			expression = `(${expression})*(1-(${next}))`;
		} else if (mask.blendMode === "intersect") {
			expression = `(${expression})*(${next})`;
		} else {
			expression = `max(${expression},${next})`;
		}
	}
	return expression;
}

function colorGradeMasks(visual: VideoVisual): VideoMask[] {
	if (!visual.color?.mask.enabled) return [];
	const selectedIds = new Set(visual.color.mask.maskIds);
	return (visual.masks ?? []).filter(
		(mask) => mask.id !== undefined && selectedIds.has(mask.id)
	);
}

function buildColorGradeMaskExpression(visual: VideoVisual): string {
	const masks = colorGradeMasks(visual);
	if (masks.length === 0) return "0";
	const expression = buildVideoMaskExpression({
		...visual,
		mask: masks[0],
		masks,
	});
	return visual.color?.mask.invert ? `1-(${expression})` : expression;
}

function visualWithoutColorGradeMasks(visual: VideoVisual): VideoVisual {
	if (!visual.color?.mask.enabled) return visual;
	const selectedIds = new Set(visual.color.mask.maskIds);
	const masks = (visual.masks ?? []).filter(
		(mask) => mask.id === undefined || !selectedIds.has(mask.id)
	);
	return { ...visual, mask: masks[0] ?? DEFAULT_MASK, masks };
}

interface AnimationExpressions {
	x: string;
	y: string;
	scale: string;
	opacity: string;
}

function buildAnimationExpressions({
	visual,
	duration,
	width,
	height,
	timeVariable,
}: {
	visual: VideoVisual;
	duration: number;
	width: number;
	height: number;
	timeVariable: string;
}): AnimationExpressions {
	const inDuration = Math.max(0.05, visual.animationInDuration ?? 0.5);
	const outDuration = Math.max(0.05, visual.animationOutDuration ?? 0.5);
	const enter = `1-pow(1-min(1,max(0,${timeVariable}/${inDuration})),3)`;
	const exit = `1-pow(1-min(1,max(0,(${duration}-${timeVariable})/${outDuration})),3)`;
	const x: string[] = ["0"];
	const y: string[] = ["0"];
	const scale: string[] = ["1"];
	const opacity: string[] = ["1"];
	const apply = (type: VideoVisual["animationInType"], progress: string) => {
		if (type === "fade") opacity.push(`(${progress})`);
		if (type === "slide-left") x.push(`-(1-(${progress}))*${width * 0.25}`);
		if (type === "slide-right") x.push(`(1-(${progress}))*${width * 0.25}`);
		if (type === "slide-up") y.push(`-(1-(${progress}))*${height * 0.25}`);
		if (type === "slide-down") y.push(`(1-(${progress}))*${height * 0.25}`);
		if (type === "zoom-in") scale.push(`0.7+(${progress})*0.3`);
		if (type === "zoom-out") scale.push(`1.3-(${progress})*0.3`);
	};
	apply(visual.animationInType ?? "none", enter);
	apply(visual.animationOutType ?? "none", exit);
	const intensity = clamp(visual.comboAnimationIntensity ?? 0.5, 0, 1);
	if (visual.comboAnimationType === "pulse") {
		scale.push(`1+sin(${timeVariable}*2*PI)*${0.04 * intensity}`);
	}
	if (visual.comboAnimationType === "drift") {
		x.push(`sin(${timeVariable}*PI)*${width * 0.03 * intensity}`);
		y.push(`cos(${timeVariable}*PI*0.75)*${height * 0.02 * intensity}`);
	}
	return {
		x: x.map((value) => `(${value})`).join("+"),
		y: y.map((value) => `(${value})`).join("+"),
		scale: scale.map((value) => `(${value})`).join("*"),
		opacity: opacity.map((value) => `(${value})`).join("*"),
	};
}

function perspectiveChanged(visual: VideoVisual): boolean {
	const defaults = DEFAULT_VISUAL.perspective;
	return Object.entries(defaults).some(
		([key, value]) => visual.perspective[key as keyof typeof defaults] !== value
	);
}

function hasPerspectiveKeyframes(visual: VideoVisual): boolean {
	return Object.keys(DEFAULT_VISUAL.perspective).some(
		(key) => (visual.keyframes?.[key]?.length ?? 0) > 0
	);
}

function buildEffectOverlayFitFilter({
	stage,
	width,
	height,
}: {
	stage: EffectOverlayRenderStage;
	width: number;
	height: number;
}): string {
	if (stage.fit === "stretch") {
		return `scale=${width}:${height},format=rgba`;
	}
	if (stage.fit === "cover") {
		return (
			`scale=${width}:${height}:force_original_aspect_ratio=increase,` +
			`crop=${width}:${height},format=rgba`
		);
	}
	return (
		`scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba,` +
		`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`
	);
}

interface EffectCompositeTile {
	x: number;
	y: number;
	width: number;
	height: number;
	mirror: boolean;
}

function effectCompositeTiles({
	stage,
	width,
	height,
}: {
	stage: EffectCompositeRenderStage;
	width: number;
	height: number;
}): EffectCompositeTile[] {
	const gap = Math.max(0, Math.round(Math.min(width, height) * stage.gap));
	if (stage.layout === "split-horizontal") {
		const tileHeight = Math.max(2, Math.floor((height - gap) / 2));
		return [
			{ x: 0, y: 0, width, height: tileHeight, mirror: false },
			{ x: 0, y: tileHeight + gap, width, height: tileHeight, mirror: false },
		];
	}
	if (stage.layout === "grid") {
		const tileWidth = Math.max(2, Math.floor((width - gap) / 2));
		const tileHeight = Math.max(2, Math.floor((height - gap) / 2));
		return [
			{ x: 0, y: 0, width: tileWidth, height: tileHeight, mirror: false },
			{
				x: tileWidth + gap,
				y: 0,
				width: tileWidth,
				height: tileHeight,
				mirror: false,
			},
			{
				x: 0,
				y: tileHeight + gap,
				width: tileWidth,
				height: tileHeight,
				mirror: false,
			},
			{
				x: tileWidth + gap,
				y: tileHeight + gap,
				width: tileWidth,
				height: tileHeight,
				mirror: false,
			},
		];
	}
	const tileWidth = Math.max(2, Math.floor((width - gap) / 2));
	return [
		{ x: 0, y: 0, width: tileWidth, height, mirror: false },
		{
			x: tileWidth + gap,
			y: 0,
			width: tileWidth,
			height,
			mirror: stage.layout === "mirror",
		},
	];
}

function buildEffectCompositeFilters({
	currentLabel,
	duration,
	fps,
	height,
	segmentIndex,
	source,
	width,
}: {
	currentLabel: string;
	duration: number;
	fps: number;
	height: number;
	segmentIndex: number;
	source: VideoSource;
	width: number;
}): { filterSteps: string[]; outputLabel: string } {
	const program = source.effectRenderProgram;
	if (!program) return { filterSteps: [], outputLabel: currentLabel };
	const filterSteps: string[] = [];
	let outputLabel = currentLabel;
	for (const [stageIndex, stage] of program.stages.entries()) {
		if (stage.kind !== "composite") continue;
		const prefix = `video_${segmentIndex}_effect_composite_${stageIndex}`;
		const tiles = effectCompositeTiles({ stage, width, height });
		const splitLabels = tiles.map((_tile, index) => `${prefix}_copy_${index}`);
		filterSteps.push(
			`[${outputLabel}]split=${tiles.length}${splitLabels.map((label) => `[${label}]`).join("")}`
		);
		const preparedLabels = tiles.map((tile, index) => {
			const scaled = `${prefix}_scaled_${index}`;
			filterSteps.push(
				`[${splitLabels[index]}]scale=${tile.width}:${tile.height}:` +
					`force_original_aspect_ratio=increase,crop=${tile.width}:${tile.height},setsar=1[${scaled}]`
			);
			if (!tile.mirror) return scaled;
			const mirrored = `${prefix}_mirrored_${index}`;
			filterSteps.push(`[${scaled}]hflip[${mirrored}]`);
			return mirrored;
		});
		const background = `${prefix}_background`;
		filterSteps.push(
			`color=c=black:s=${width}x${height}:d=${duration}:r=${fps},format=rgba[${background}]`
		);
		let composedLabel = background;
		for (const [tileIndex, tile] of tiles.entries()) {
			const composed = `${prefix}_tile_${tileIndex}`;
			filterSteps.push(
				`[${composedLabel}][${preparedLabels[tileIndex]}]overlay=` +
					`x=${tile.x}:y=${tile.y}:shortest=1:format=auto[${composed}]`
			);
			composedLabel = composed;
		}
		outputLabel = composedLabel;
	}
	return { filterSteps, outputLabel };
}

function buildEffectOverlayFilters({
	currentLabel,
	duration,
	fps,
	height,
	segmentIndex,
	source,
	width,
}: {
	currentLabel: string;
	duration: number;
	fps: number;
	height: number;
	segmentIndex: number;
	source: VideoSource;
	width: number;
}): { filterSteps: string[]; outputLabel: string } {
	const program = source.effectRenderProgram;
	if (!program) return { filterSteps: [], outputLabel: currentLabel };

	const filterSteps: string[] = [];
	let outputLabel = currentLabel;
	for (const [stageIndex, stage] of program.stages.entries()) {
		if (stage.kind !== "overlay") continue;
		const overlaySource = source.effectOverlaySources?.find(
			(candidate) =>
				candidate.stageIndex === stageIndex &&
				candidate.resourceId === stage.resourceId
		);
		if (overlaySource?.inputIndex === undefined) {
			throw new Error(
				`Missing FFmpeg input for effect overlay ${stage.resourceId} at stage ${stageIndex}`
			);
		}

		const prefix = `video_${segmentIndex}_effect_overlay_${stageIndex}`;
		const prepared = `${prefix}_prepared`;
		filterSteps.push(
			`[${overlaySource.inputIndex}:v]${buildEffectOverlayFitFilter({ stage, width, height })},` +
				`fps=${fps},trim=duration=${duration},setpts=PTS-STARTPTS[${prepared}]`
		);
		let overlayLabel = prepared;
		if (stage.opacity < 1) {
			const alpha = `${prefix}_alpha`;
			filterSteps.push(
				`[${prepared}]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
					`a='${stage.opacity}*alpha(X,Y)'[${alpha}]`
			);
			overlayLabel = alpha;
		}

		const composed = `${prefix}_composed`;
		if (stage.blendMode === "normal") {
			filterSteps.push(
				`[${outputLabel}][${overlayLabel}]overlay=shortest=1:format=auto[${composed}]`
			);
			outputLabel = composed;
			continue;
		}

		const baseOriginal = `${prefix}_base_original`;
		const baseBlend = `${prefix}_base_blend`;
		const overlayBlend = `${prefix}_overlay_blend`;
		const overlayAlpha = `${prefix}_overlay_alpha`;
		const blended = `${prefix}_blended`;
		const mask = `${prefix}_mask`;
		const blendedAlpha = `${prefix}_blended_alpha`;
		filterSteps.push(`[${outputLabel}]split=2[${baseOriginal}][${baseBlend}]`);
		filterSteps.push(
			`[${overlayLabel}]split=2[${overlayBlend}][${overlayAlpha}]`
		);
		filterSteps.push(
			`[${baseBlend}][${overlayBlend}]blend=all_mode=${stage.blendMode}[${blended}]`
		);
		filterSteps.push(`[${overlayAlpha}]alphaextract[${mask}]`);
		filterSteps.push(`[${blended}][${mask}]alphamerge[${blendedAlpha}]`);
		filterSteps.push(
			`[${baseOriginal}][${blendedAlpha}]overlay=shortest=1:format=auto[${composed}]`
		);
		outputLabel = composed;
	}
	return { filterSteps, outputLabel };
}

function buildTimedVideoInput({
	inputLabel,
	prefix,
	source,
	sourceDuration,
	speedSamples,
	speedDuration,
	freezeDuration,
	fps,
}: {
	inputLabel: string;
	prefix: string;
	source: VideoSource;
	sourceDuration: number;
	speedSamples: SpeedSample[];
	speedDuration: number;
	freezeDuration: number;
	fps: number;
}): { filterSteps: string[]; outputLabel: string } {
	const filterSteps: string[] = [];
	const trimStart = Math.max(0, source.trimStart ?? 0);
	let outputLabel = `${prefix}_trimmed`;
	filterSteps.push(
		`[${inputLabel}]trim=start=${trimStart}:duration=${sourceDuration},setpts=PTS-STARTPTS[${outputLabel}]`
	);
	if (source.reverse) {
		const reversed = `${prefix}_reversed`;
		filterSteps.push(`[${outputLabel}]reverse[${reversed}]`);
		outputLabel = reversed;
	}
	const hasSpeedCurve = (source.speedKeyframes?.length ?? 0) > 0;
	const playbackRate = clamp(source.playbackRate ?? 1, 0.1, 8);
	if (hasSpeedCurve || playbackRate !== 1) {
		const sped = `${prefix}_sped`;
		const expression = hasSpeedCurve
			? buildSpeedSetptsExpression(speedSamples)
			: `((PTS-STARTPTS)*TB)/${playbackRate}`;
		filterSteps.push(`[${outputLabel}]setpts='(${expression})/TB'[${sped}]`);
		outputLabel = sped;
	}
	if (freezeDuration <= 0) return { filterSteps, outputLabel };

	const freezeSourceTime = clamp(
		source.freezeFrameTime ?? sourceDuration,
		0,
		sourceDuration
	);
	const freezeStart = outputTimeAtSource(speedSamples, freezeSourceTime);
	const splitA = `${prefix}_freeze_a`;
	const splitB = `${prefix}_freeze_b`;
	const splitC = `${prefix}_freeze_c`;
	const before = `${prefix}_before_freeze`;
	const frozen = `${prefix}_frozen`;
	const after = `${prefix}_after_freeze`;
	const withFreeze = `${prefix}_with_freeze`;
	filterSteps.push(`[${outputLabel}]split=3[${splitA}][${splitB}][${splitC}]`);
	filterSteps.push(
		`[${splitA}]trim=start=0:end=${freezeStart},setpts=PTS-STARTPTS[${before}]`
	);
	filterSteps.push(
		`[${splitB}]trim=start=${freezeStart}:end=${Math.min(speedDuration, freezeStart + 1 / Math.max(1, fps))},` +
			`setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${freezeDuration},trim=duration=${freezeDuration},setpts=PTS-STARTPTS[${frozen}]`
	);
	filterSteps.push(
		`[${splitC}]trim=start=${freezeStart}:end=${speedDuration},setpts=PTS-STARTPTS[${after}]`
	);
	filterSteps.push(
		`[${before}][${frozen}][${after}]concat=n=3:v=1:a=0[${withFreeze}]`
	);
	return { filterSteps, outputLabel: withFreeze };
}

function buildEffectPersonFilters({
	currentLabel,
	freezeDuration,
	fps,
	height,
	segmentIndex,
	source,
	sourceDuration,
	speedDuration,
	speedSamples,
	width,
}: {
	currentLabel: string;
	freezeDuration: number;
	fps: number;
	height: number;
	segmentIndex: number;
	source: VideoSource;
	sourceDuration: number;
	speedDuration: number;
	speedSamples: SpeedSample[];
	width: number;
}): { filterSteps: string[]; outputLabel: string } {
	const stages = (source.effectRenderProgram?.stages ?? []).flatMap(
		(stage, stageIndex) =>
			stage.kind === "person-tracking" ? [{ stage, stageIndex }] : []
	) as Array<{ stage: EffectPersonTrackingRenderStage; stageIndex: number }>;
	if (stages.length === 0)
		return { filterSteps: [], outputLabel: currentLabel };

	const duration = speedDuration + freezeDuration;
	const filterSteps: string[] = [];
	let outputLabel = currentLabel;
	for (const { stage, stageIndex } of stages) {
		const personSource = source.effectPersonSources?.find(
			(candidate) => candidate.stageIndex === stageIndex
		);
		if (personSource?.inputIndex === undefined) {
			throw new Error(`Missing person effect input at stage ${stageIndex}`);
		}
		const prefix = `video_${segmentIndex}_effect_person_${stageIndex}`;
		const timed = buildTimedVideoInput({
			inputLabel: `${personSource.inputIndex}:v`,
			prefix: `${prefix}_source`,
			source,
			sourceDuration,
			speedSamples,
			speedDuration,
			freezeDuration,
			fps,
		});
		filterSteps.push(...timed.filterSteps);
		const fitted = `${prefix}_fitted`;
		filterSteps.push(
			`[${timed.outputLabel}]${buildVideoFitFilter({ fitMode: resolveVisual(source).fitMode, width, height })},` +
				`setsar=1,format=rgba,fps=${fps}[${fitted}]`
		);
		const mask = `${prefix}_mask`;
		filterSteps.push(`[${fitted}]alphaextract[${mask}]`);

		if (stage.treatment === "outline") {
			const inner = `${prefix}_inner`;
			const outer = `${prefix}_outer`;
			const expanded = `${prefix}_expanded`;
			const edge = `${prefix}_edge`;
			const color = `${prefix}_color`;
			const outline = `${prefix}_outline`;
			const composed = `${prefix}_composed`;
			filterSteps.push(`[${mask}]split=2[${inner}][${outer}]`);
			filterSteps.push(
				`[${outer}]dilation,dilation,gblur=sigma=1[${expanded}]`
			);
			filterSteps.push(
				`[${expanded}][${inner}]blend=all_mode=subtract[${edge}]`
			);
			filterSteps.push(
				`color=c=0x22d3ee@1:s=${width}x${height}:d=${duration}:r=${fps},format=rgba[${color}]`
			);
			filterSteps.push(`[${color}][${edge}]alphamerge[${outline}]`);
			filterSteps.push(
				`[${outputLabel}][${outline}]overlay=shortest=1:format=auto[${composed}]`
			);
			outputLabel = composed;
			continue;
		}

		const backgroundInput = `${prefix}_background_input`;
		const foregroundInput = `${prefix}_foreground_input`;
		const background = `${prefix}_background`;
		const foregroundRgba = `${prefix}_foreground_rgba`;
		const foreground = `${prefix}_foreground`;
		const composed = `${prefix}_composed`;
		filterSteps.push(
			`[${outputLabel}]split=2[${backgroundInput}][${foregroundInput}]`
		);
		if (stage.treatment === "spotlight") {
			filterSteps.push(
				`[${backgroundInput}]eq=brightness=-0.28:saturation=0.72[${background}]`
			);
		} else {
			filterSteps.push(
				`[${backgroundInput}]gblur=sigma=12:steps=2[${background}]`
			);
		}
		filterSteps.push(`[${foregroundInput}]format=rgba[${foregroundRgba}]`);
		filterSteps.push(`[${foregroundRgba}][${mask}]alphamerge[${foreground}]`);
		filterSteps.push(
			`[${background}][${foreground}]overlay=shortest=1:format=auto[${composed}]`
		);
		outputLabel = composed;
	}
	return { filterSteps, outputLabel };
}

function buildSegmentFilters({
	source,
	inputIndex,
	segmentIndex,
	width,
	height,
	fps,
	backgroundColor,
	transparentOutput = false,
}: {
	source: VideoSource;
	inputIndex: number;
	segmentIndex: number;
	width: number;
	height: number;
	fps: number;
	backgroundColor: string;
	transparentOutput?: boolean;
}): { steps: string[]; outputLabel: string; duration: number } {
	const visual = resolveVisual(source);
	const trimStart = Math.max(0, source.trimStart ?? 0);
	const sourceDuration = Math.max(
		1 / Math.max(1, fps),
		source.duration - trimStart - Math.max(0, source.trimEnd ?? 0)
	);
	const speedSamples = buildSpeedSamples(source, sourceDuration, fps);
	const speedDuration =
		speedSamples[speedSamples.length - 1]?.outputEnd ?? sourceDuration;
	const freezeDuration = Math.max(0, source.freezeFrameDuration ?? 0);
	const duration = speedDuration + freezeDuration;
	const steps: string[] = [];
	const timedSource = buildTimedVideoInput({
		inputLabel: `${inputIndex}:v`,
		prefix: `video_${segmentIndex}`,
		source,
		sourceDuration,
		speedSamples,
		speedDuration,
		freezeDuration,
		fps,
	});
	steps.push(...timedSource.filterSteps);
	let current = timedSource.outputLabel;

	const fitted = `video_${segmentIndex}_fitted`;
	steps.push(
		`[${current}]${buildVideoFitFilter({ fitMode: visual.fitMode, width, height })},setsar=1,format=rgba[${fitted}]`
	);
	current = fitted;
	const enhancementFilter = buildVideoEnhancementFilter({
		enhancements: visual.enhancements,
		width,
		height,
	});
	if (enhancementFilter) {
		const enhanced = `video_${segmentIndex}_enhanced`;
		steps.push(`[${current}]${enhancementFilter}[${enhanced}]`);
		current = enhanced;
	}
	const chromaGraph = buildChromaKeyFilterGraph({
		inputLabel: current,
		labelPrefix: `video_${segmentIndex}_chroma`,
		chromaKey: visual.chromaKey,
		fps: visual.keyframeFps || fps,
		duration,
	});
	steps.push(...chromaGraph.filterSteps);
	current = chromaGraph.outputLabel;
	if (visual.color?.mask.enabled) {
		const colorBase = `video_${segmentIndex}_color_base`;
		const colorInput = `video_${segmentIndex}_color_input`;
		const gradedMask = `video_${segmentIndex}_color_masked`;
		const adjusted = `video_${segmentIndex}_adjusted`;
		steps.push(`[${current}]split=2[${colorBase}][${colorInput}]`);
		const colorGraph = buildVideoColorFilterGraph({
			visual,
			inputLabel: colorInput,
			labelPrefix: `video_${segmentIndex}_color`,
		});
		steps.push(...colorGraph.filterSteps);
		if (colorGraph.applied) {
			steps.push(
				`[${colorGraph.outputLabel}]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
					`a='alpha(X,Y)*(${buildColorGradeMaskExpression(visual)})'[${gradedMask}]`
			);
			steps.push(
				`[${colorBase}][${gradedMask}]overlay=0:0:format=auto[${adjusted}]`
			);
			current = adjusted;
		} else {
			steps.push(`[${colorInput}]nullsink`);
			current = colorBase;
		}
	} else {
		const colorGraph = buildVideoColorFilterGraph({
			visual,
			inputLabel: current,
			labelPrefix: `video_${segmentIndex}_color`,
		});
		steps.push(...colorGraph.filterSteps);
		current = colorGraph.outputLabel;
	}
	if (source.effectFilter) {
		const effected = `video_${segmentIndex}_effects`;
		steps.push(`[${current}]${source.effectFilter}[${effected}]`);
		current = effected;
	}
	if (
		hasEffectAudioReactiveProperty({
			program: source.effectRenderProgram,
			property: "brightness",
		})
	) {
		const brightness = buildEffectAudioReactiveExpression({
			program: source.effectRenderProgram,
			envelopes: source.effectAudioReactiveEnvelopes,
			property: "brightness",
			timeVariable: "t",
		});
		const reacted = `video_${segmentIndex}_effect_audio_brightness`;
		steps.push(
			`[${current}]eq=brightness='max(-1,min(1,(${brightness})-1))':eval=frame[${reacted}]`
		);
		current = reacted;
	}
	const effectPersonGraph = buildEffectPersonFilters({
		currentLabel: current,
		freezeDuration,
		fps,
		height,
		segmentIndex,
		source,
		sourceDuration,
		speedDuration,
		speedSamples,
		width,
	});
	steps.push(...effectPersonGraph.filterSteps);
	current = effectPersonGraph.outputLabel;
	const effectCompositeGraph = buildEffectCompositeFilters({
		currentLabel: current,
		duration,
		fps,
		height,
		segmentIndex,
		source,
		width,
	});
	steps.push(...effectCompositeGraph.filterSteps);
	current = effectCompositeGraph.outputLabel;
	const effectOverlayGraph = buildEffectOverlayFilters({
		currentLabel: current,
		duration,
		fps,
		height,
		segmentIndex,
		source,
		width,
	});
	steps.push(...effectOverlayGraph.filterSteps);
	current = effectOverlayGraph.outputLabel;
	const crop = visual.crop;
	const left = buildVideoKeyframeExpression({
		visual,
		property: "cropLeft",
		fallback: crop.left,
	});
	const right = buildVideoKeyframeExpression({
		visual,
		property: "cropRight",
		fallback: crop.right,
	});
	const top = buildVideoKeyframeExpression({
		visual,
		property: "cropTop",
		fallback: crop.top,
	});
	const bottom = buildVideoKeyframeExpression({
		visual,
		property: "cropBottom",
		fallback: crop.bottom,
	});
	const mask = buildVideoMaskExpression(visualWithoutColorGradeMasks(visual));
	const customCutout = buildCustomCutoutExpression({
		customCutout: visual.customCutout,
		fps: visual.keyframeFps || fps,
	});
	const cropped = `video_${segmentIndex}_cropped`;
	steps.push(
		`[${current}]geq=` +
			`r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
			`a='alpha(X,Y)*between(X,W*(${left}),W*(1-(${right})))*` +
			`between(Y,H*(${top}),H*(1-(${bottom})))*(${mask})*(${customCutout})'[${cropped}]`
	);
	current = cropped;
	const maskStrokeGraph = buildMaskStrokeFilterGraph({
		inputLabel: current,
		labelPrefix: `video_${segmentIndex}_mask_stroke`,
		visual,
	});
	steps.push(...maskStrokeGraph.filterSteps);
	current = maskStrokeGraph.outputLabel;

	if (perspectiveChanged(visual) || hasPerspectiveKeyframes(visual)) {
		const perspective = `video_${segmentIndex}_perspective`;
		const p = visual.perspective;
		const expr = (
			property: keyof VideoVisual["perspective"],
			fallback: number
		) =>
			buildVideoKeyframeExpression({
				visual,
				property,
				fallback,
				timeVariable: `(on/${Math.max(1, visual.keyframeFps || fps)})`,
			});
		steps.push(
			`[${current}]perspective=` +
				`x0='W*(${expr("topLeftX", p.topLeftX)})':y0='H*(${expr("topLeftY", p.topLeftY)})':` +
				`x1='W*(${expr("topRightX", p.topRightX)})':y1='H*(${expr("topRightY", p.topRightY)})':` +
				`x2='W*(${expr("bottomLeftX", p.bottomLeftX)})':y2='H*(${expr("bottomLeftY", p.bottomLeftY)})':` +
				`x3='W*(${expr("bottomRightX", p.bottomRightX)})':y3='H*(${expr("bottomRightY", p.bottomRightY)})':` +
				`sense=destination:eval=frame[${perspective}]`
		);
		current = perspective;
	}

	if (visual.flipHorizontal) {
		const flipped = `video_${segmentIndex}_hflip`;
		steps.push(`[${current}]hflip[${flipped}]`);
		current = flipped;
	}
	if (visual.flipVertical) {
		const flipped = `video_${segmentIndex}_vflip`;
		steps.push(`[${current}]vflip[${flipped}]`);
		current = flipped;
	}

	const scaleX = buildVideoKeyframeExpression({
		visual,
		property: "scaleX",
		fallback: visual.scaleX,
		timeVariable: "t",
	});
	const scaleY = buildVideoKeyframeExpression({
		visual,
		property: "scaleY",
		fallback: visual.scaleY,
		timeVariable: "t",
	});
	if (
		hasEffectMotionProperty({
			program: source.effectRenderProgram,
			property: "scale",
		}) ||
		hasEffectAudioReactiveProperty({
			program: source.effectRenderProgram,
			property: "scale",
		})
	) {
		const padded = `video_${segmentIndex}_effect_zoom_pad`;
		const zoomed = `video_${segmentIndex}_effect_zoom`;
		const effectZoomMotion = buildEffectMotionExpressions({
			program: source.effectRenderProgram,
			duration,
			width,
			height,
			timeVariable: `(on/${Math.max(1, fps)})`,
		});
		const effectAudioScale = buildEffectAudioReactiveExpression({
			program: source.effectRenderProgram,
			envelopes: source.effectAudioReactiveEnvelopes,
			property: "scale",
			timeVariable: `(on/${Math.max(1, fps)})`,
		});
		steps.push(
			`[${current}]pad=w=iw*2:h=ih*2:x=iw/2:y=ih/2:color=black@0,format=rgba[${padded}]`
		);
		steps.push(
			`[${padded}]zoompan=` +
				`z='2*max(0.5,(${effectZoomMotion.scale})*(${effectAudioScale}))':` +
				`x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
				`d=1:s=${width}x${height}:fps=${fps},format=rgba[${zoomed}]`
		);
		current = zoomed;
	}
	const transformAnimation = buildAnimationExpressions({
		visual,
		duration,
		width,
		height,
		timeVariable: "t",
	});
	const effectTransformMotion = buildEffectMotionExpressions({
		program: source.effectRenderProgram,
		duration,
		width,
		height,
		timeVariable: "t",
	});
	const scaled = `video_${segmentIndex}_scaled`;
	steps.push(
		`[${current}]scale=w='max(2,iw*(${scaleX})*(${transformAnimation.scale}))':` +
			`h='max(2,ih*(${scaleY})*(${transformAnimation.scale}))':eval=frame[${scaled}]`
	);
	current = scaled;

	const rotation = buildVideoKeyframeExpression({
		visual,
		property: "rotation",
		fallback: visual.rotation,
		timeVariable: "t",
	});
	if (
		visual.rotation !== 0 ||
		(visual.keyframes?.rotation?.length ?? 0) > 0 ||
		hasEffectMotionProperty({
			program: source.effectRenderProgram,
			property: "rotation",
		})
	) {
		const rotated = `video_${segmentIndex}_rotated`;
		steps.push(
			`[${current}]rotate=angle='((${rotation})+(${effectTransformMotion.rotation}))*PI/180':ow='hypot(iw,ih)':oh='hypot(iw,ih)':c=none[${rotated}]`
		);
		current = rotated;
	}

	const opacity = buildVideoKeyframeExpression({
		visual,
		property: "opacity",
		fallback: visual.opacity,
	});
	const opacityAnimation = buildAnimationExpressions({
		visual,
		duration,
		width,
		height,
		timeVariable: "T",
	});
	const effectOpacityMotion = buildEffectMotionExpressions({
		program: source.effectRenderProgram,
		duration,
		width,
		height,
		timeVariable: "T",
	});
	const effectAudioOpacity = buildEffectAudioReactiveExpression({
		program: source.effectRenderProgram,
		envelopes: source.effectAudioReactiveEnvelopes,
		property: "opacity",
		timeVariable: "T",
	});
	const alpha = `video_${segmentIndex}_opacity`;
	steps.push(
		`[${current}]format=rgba,geq=` +
			`r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
			`a='alpha(X,Y)*max(0,min(1,(${opacity})*(${opacityAnimation.opacity})*(${effectOpacityMotion.opacity})*(${effectAudioOpacity})))'[${alpha}]`
	);
	current = alpha;

	const foreground = `video_${segmentIndex}_foreground`;
	const transparent = `video_${segmentIndex}_transparent`;
	const x = buildVideoKeyframeExpression({
		visual,
		property: "x",
		fallback: visual.x,
		timeVariable: "t",
	});
	const y = buildVideoKeyframeExpression({
		visual,
		property: "y",
		fallback: visual.y,
		timeVariable: "t",
	});
	steps.push(
		`color=c=black@0:s=${width}x${height}:d=${duration}:r=${fps},format=rgba[${transparent}]`
	);
	steps.push(
		`[${transparent}][${current}]overlay=` +
			`x='(W-w)/2+(${x})+(${transformAnimation.x})+(${effectTransformMotion.x})':` +
			`y='(H-h)/2+(${y})+(${transformAnimation.y})+(${effectTransformMotion.y})':shortest=1:format=auto[${foreground}]`
	);
	if (transparentOutput) {
		const layer = `video_${segmentIndex}_layer`;
		const startTime = Math.max(0, source.startTime);
		steps.push(
			`[${foreground}]fps=${fps},scale=${width}:${height},setsar=1,format=rgba,settb=AVTB,` +
				`setpts=PTS-STARTPTS+${startTime}/TB[${layer}]`
		);
		return { steps, outputLabel: layer, duration };
	}

	const background = `video_${segmentIndex}_background`;
	steps.push(
		`color=c=${ffmpegColor(backgroundColor)}:s=${width}x${height}:d=${duration}:r=${fps},format=rgba[${background}]`
	);
	const composed = `video_${segmentIndex}_composed`;
	if (visual.blendMode === "normal") {
		steps.push(
			`[${background}][${foreground}]overlay=shortest=1:format=auto[${composed}]`
		);
	} else {
		const bgOriginal = `video_${segmentIndex}_bg_original`;
		const bgBlend = `video_${segmentIndex}_bg_blend`;
		const fgBlend = `video_${segmentIndex}_fg_blend`;
		const fgAlpha = `video_${segmentIndex}_fg_alpha`;
		const blended = `video_${segmentIndex}_blended`;
		const mask = `video_${segmentIndex}_mask`;
		const blendedAlpha = `video_${segmentIndex}_blended_alpha`;
		steps.push(`[${background}]split=2[${bgOriginal}][${bgBlend}]`);
		steps.push(`[${foreground}]split=2[${fgBlend}][${fgAlpha}]`);
		steps.push(
			`[${bgBlend}][${fgBlend}]blend=all_mode=${visual.blendMode}[${blended}]`
		);
		steps.push(`[${fgAlpha}]alphaextract[${mask}]`);
		steps.push(`[${blended}][${mask}]alphamerge[${blendedAlpha}]`);
		steps.push(
			`[${bgOriginal}][${blendedAlpha}]overlay=shortest=1:format=auto[${composed}]`
		);
	}
	const normalized = `video_${segmentIndex}_normalized`;
	steps.push(
		`[${composed}]fps=${fps},scale=${width}:${height},setsar=1,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[${normalized}]`
	);
	return { steps, outputLabel: normalized, duration };
}

function buildLayeredVideoTimelineFilters({
	videoSources,
	width,
	height,
	fps,
	totalDuration,
	backgroundColor,
}: {
	videoSources: VideoSource[];
	width: number;
	height: number;
	fps: number;
	totalDuration: number;
	backgroundColor: string;
}): VideoTimelineFilterResult {
	const built = buildVideoTimelineLayers({
		videoSources,
		width,
		height,
		fps,
		totalDuration,
		backgroundColor,
	});
	return composeVideoTimelineLayers({
		built,
		width,
		height,
		fps,
		totalDuration,
		backgroundColor,
		labelPrefix: "video_layer",
	});
}

interface IndexedVideoSource {
	source: VideoSource;
	inputIndex: number;
	segmentIndex: number;
}

interface TransitionRun {
	sources: IndexedVideoSource[];
	transitions: VideoTransition[];
}

function transitionRuns({
	sources,
	transitions,
}: {
	sources: IndexedVideoSource[];
	transitions: VideoTransition[];
}): TransitionRun[] {
	if (sources.length === 0) return [];
	const transitionByFrom = new Map(
		transitions.map((transition) => [transition.fromElementId, transition])
	);
	const sorted = [...sources].sort((left, right) => {
		const timeDifference = left.source.startTime - right.source.startTime;
		return timeDifference !== 0
			? timeDifference
			: (left.source.elementOrder ?? 0) - (right.source.elementOrder ?? 0);
	});
	const runs: TransitionRun[] = [];
	let current: TransitionRun = { sources: [sorted[0]], transitions: [] };

	for (let index = 1; index < sorted.length; index++) {
		const previous = sorted[index - 1];
		const next = sorted[index];
		const transition = previous.source.elementId
			? transitionByFrom.get(previous.source.elementId)
			: undefined;
		if (
			transition &&
			transition.toElementId === next.source.elementId &&
			transition.trackId === next.source.trackId
		) {
			current.sources.push(next);
			current.transitions.push(transition);
			continue;
		}

		runs.push(current);
		current = { sources: [next], transitions: [] };
	}
	runs.push(current);
	return runs;
}

function composeVideoTimelineLayers({
	built,
	width,
	height,
	fps,
	totalDuration,
	backgroundColor,
	labelPrefix,
}: {
	built: VideoTimelineLayerFilterResult;
	width: number;
	height: number;
	fps: number;
	totalDuration: number;
	backgroundColor: string;
	labelPrefix: string;
}): VideoTimelineFilterResult {
	const backgroundLabel = `${labelPrefix}_background`;
	const preparedLayers: PreparedVisualLayer[] = built.layers.map(
		(layer, legacyOrder) => ({
			inputLabel: layer.outputLabel,
			kind: "video",
			trackOrder: layer.trackOrder,
			elementOrder: layer.elementOrder,
			sourceOrder: layer.sourceIndex,
			legacyOrder,
			blendMode: layer.blendMode,
			startTime: layer.startTime,
			endTime: layer.endTime,
		})
	);
	const composed = composePreparedVisualLayers({
		baseLabel: backgroundLabel,
		layers: preparedLayers,
		labelPrefix,
	});
	const filterSteps = [
		`color=c=${ffmpegColor(backgroundColor)}:s=${width}x${height}:d=${totalDuration}:r=${fps},` +
			`format=rgba,settb=AVTB,setpts=PTS-STARTPTS[${backgroundLabel}]`,
		...built.filterSteps,
		...composed.filterSteps,
	];

	const outputLabel = "video_timeline_base";
	filterSteps.push(
		`[${composed.outputLabel}]fps=${fps},scale=${width}:${height},setsar=1,format=yuv420p,settb=AVTB,` +
			`setpts=PTS-STARTPTS[${outputLabel}]`
	);
	return {
		filterSteps,
		outputLabel,
		segmentCount: built.segmentCount,
	};
}

export function buildVideoTimelineLayers({
	videoSources,
	videoTransitions = [],
	inputIndexOffset = 0,
	segmentIndexOffset = 0,
	inputIndexes,
	width,
	height,
	fps,
	totalDuration,
	backgroundColor = "#000000",
}: {
	videoSources: VideoSource[];
	videoTransitions?: VideoTransition[];
	inputIndexOffset?: number;
	segmentIndexOffset?: number;
	inputIndexes?: number[];
	width: number;
	height: number;
	fps: number;
	totalDuration: number;
	backgroundColor?: string;
}): VideoTimelineLayerFilterResult {
	const indexedSources = videoSources.map((source, sourceIndex) => ({
		source,
		inputIndex: inputIndexes?.[sourceIndex] ?? inputIndexOffset + sourceIndex,
		segmentIndex: segmentIndexOffset + sourceIndex,
	}));
	const filterSteps: string[] = [];
	const layers: VideoTimelineLayer[] = [];

	if (videoTransitions.length === 0) {
		const sortedSources = indexedSources.sort((left, right) => {
			const trackDifference =
				(right.source.trackOrder ?? Number.MAX_SAFE_INTEGER) -
				(left.source.trackOrder ?? Number.MAX_SAFE_INTEGER);
			if (trackDifference !== 0) return trackDifference;
			const elementDifference =
				(left.source.elementOrder ?? 0) - (right.source.elementOrder ?? 0);
			if (elementDifference !== 0) return elementDifference;
			const timeDifference = left.source.startTime - right.source.startTime;
			return timeDifference !== 0
				? timeDifference
				: left.inputIndex - right.inputIndex;
		});

		for (let layerIndex = 0; layerIndex < sortedSources.length; layerIndex++) {
			const { source, inputIndex, segmentIndex } = sortedSources[layerIndex];
			const segment = buildSegmentFilters({
				source,
				inputIndex,
				segmentIndex,
				width,
				height,
				fps,
				backgroundColor,
				transparentOutput: true,
			});
			filterSteps.push(...segment.steps);
			const startTime = Math.max(0, source.startTime);
			layers.push({
				outputLabel: segment.outputLabel,
				trackOrder: source.trackOrder,
				elementOrder: source.elementOrder,
				sourceIndex: inputIndex,
				startTime,
				endTime: Math.min(totalDuration, startTime + segment.duration),
				blendMode: resolveVisual(source).blendMode,
			});
		}

		return { filterSteps, layers, segmentCount: videoSources.length };
	}

	const sourcesByTrack = new Map<string, IndexedVideoSource[]>();
	for (const indexed of indexedSources) {
		const trackKey = indexed.source.trackId ?? "__default_video_track__";
		const trackSources = sourcesByTrack.get(trackKey) ?? [];
		trackSources.push(indexed);
		sourcesByTrack.set(trackKey, trackSources);
	}
	const orderedTracks = [...sourcesByTrack.entries()].sort(
		([, left], [, right]) =>
			(right[0]?.source.trackOrder ?? Number.MAX_SAFE_INTEGER) -
			(left[0]?.source.trackOrder ?? Number.MAX_SAFE_INTEGER)
	);
	let runIndex = 0;

	for (const [trackId, trackSources] of orderedTracks) {
		const trackTransitions = videoTransitions.filter(
			(transition) => transition.trackId === trackId
		);
		const runs = transitionRuns({
			sources: trackSources,
			transitions: trackTransitions,
		});

		for (const run of runs) {
			const builtSegments = run.sources.map(
				({ source, inputIndex, segmentIndex }, index) => {
					const preparation = prepareTransitionSource({
						source,
						previousTransition: run.transitions[index - 1],
						nextTransition: run.transitions[index],
					});
					const segment = buildSegmentFilters({
						source: preparation.source,
						inputIndex,
						segmentIndex,
						width,
						height,
						fps,
						backgroundColor,
						transparentOutput: true,
					});
					filterSteps.push(...segment.steps);
					return { source, inputIndex, segment, preparation };
				}
			);
			const preparedLabels: string[] = [];
			for (let index = 0; index < builtSegments.length; index++) {
				const built = builtSegments[index];
				const startPad = built.preparation.leadingPad;
				const stopPad = built.preparation.trailingPad;
				const preparedLabel = `video_transition_prepared_${runIndex}_${index}`;
				const preparedDuration = built.segment.duration + startPad + stopPad;
				filterSteps.push(
					`[${built.segment.outputLabel}]format=gbrap,setpts=PTS-STARTPTS,` +
						`tpad=start_mode=clone:start_duration=${startPad}:stop_mode=clone:stop_duration=${stopPad},` +
						`trim=duration=${preparedDuration},setpts=PTS-STARTPTS[${preparedLabel}]`
				);
				preparedLabels.push(preparedLabel);
			}

			const firstBuilt = builtSegments[0];
			const lastBuilt = builtSegments[builtSegments.length - 1];
			const runStart = Math.max(0, firstBuilt.source.startTime);
			const lastVisibleDuration =
				lastBuilt.segment.duration -
				lastBuilt.preparation.handleBefore -
				lastBuilt.preparation.handleAfter;
			const runEnd = Math.min(
				totalDuration,
				lastBuilt.source.startTime + lastVisibleDuration
			);
			let runOutput = preparedLabels[0];
			for (let index = 0; index < run.transitions.length; index++) {
				const transition = run.transitions[index];
				const nextSource = builtSegments[index + 1].source;
				const offset = Math.max(
					0,
					nextSource.startTime - runStart - transition.duration / 2
				);
				const transitioned = `video_transition_xfade_${runIndex}_${index}`;
				const xfade = buildXfadeTransitionFilter({ transition });
				filterSteps.push(
					`[${runOutput}][${preparedLabels[index + 1]}]xfade=` +
						`transition=${xfade.transition}:duration=${transition.duration}:` +
						`offset=${offset}:expr='${xfade.expression}'[${transitioned}]`
				);
				runOutput = transitioned;
			}

			const timedRun = `video_transition_run_${runIndex}`;
			filterSteps.push(
				`[${runOutput}]trim=duration=${Math.max(1 / Math.max(1, fps), runEnd - runStart)},` +
					`fps=${fps},scale=${width}:${height},setsar=1,format=rgba,settb=AVTB,` +
					`setpts=PTS-STARTPTS+${runStart}/TB[${timedRun}]`
			);
			layers.push({
				outputLabel: timedRun,
				trackOrder: firstBuilt.source.trackOrder,
				elementOrder: firstBuilt.source.elementOrder,
				sourceIndex: firstBuilt.inputIndex,
				startTime: runStart,
				endTime: runEnd,
				blendMode: resolveVisual(firstBuilt.source).blendMode,
			});
			runIndex++;
		}
	}

	return { filterSteps, layers, segmentCount: videoSources.length };
}

function buildTransitionedLayeredVideoTimelineFilters({
	videoSources,
	videoTransitions,
	width,
	height,
	fps,
	totalDuration,
	backgroundColor,
}: {
	videoSources: VideoSource[];
	videoTransitions: VideoTransition[];
	width: number;
	height: number;
	fps: number;
	totalDuration: number;
	backgroundColor: string;
}): VideoTimelineFilterResult {
	const built = buildVideoTimelineLayers({
		videoSources,
		videoTransitions,
		width,
		height,
		fps,
		totalDuration,
		backgroundColor,
	});
	return composeVideoTimelineLayers({
		built,
		width,
		height,
		fps,
		totalDuration,
		backgroundColor,
		labelPrefix: "video_transition_layer",
	});
}

export function buildVideoTimelineFilters({
	videoSources,
	videoTransitions = [],
	width,
	height,
	fps,
	totalDuration,
	backgroundColor = "#000000",
}: {
	videoSources: VideoSource[];
	videoTransitions?: VideoTransition[];
	width: number;
	height: number;
	fps: number;
	totalDuration: number;
	backgroundColor?: string;
}): VideoTimelineFilterResult {
	if (videoTransitions.length > 0) {
		return buildTransitionedLayeredVideoTimelineFilters({
			videoSources,
			videoTransitions,
			width,
			height,
			fps,
			totalDuration,
			backgroundColor,
		});
	}
	if (videoSources.some((source) => Number.isFinite(source.trackOrder))) {
		return buildLayeredVideoTimelineFilters({
			videoSources,
			width,
			height,
			fps,
			totalDuration,
			backgroundColor,
		});
	}

	const sorted = [...videoSources].sort((a, b) => a.startTime - b.startTime);
	const filterSteps: string[] = [];
	const labels: string[] = [];
	let cursor = 0;
	let segmentIndex = 0;
	for (let inputIndex = 0; inputIndex < sorted.length; inputIndex++) {
		const source = sorted[inputIndex];
		if (source.startTime > cursor + 1 / Math.max(1, fps)) {
			const gapDuration = source.startTime - cursor;
			const gap = `video_gap_${segmentIndex++}`;
			filterSteps.push(
				`color=c=${ffmpegColor(backgroundColor)}:s=${width}x${height}:d=${gapDuration}:r=${fps},format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[${gap}]`
			);
			labels.push(gap);
			cursor = source.startTime;
		}
		const segment = buildSegmentFilters({
			source,
			inputIndex,
			segmentIndex: segmentIndex++,
			width,
			height,
			fps,
			backgroundColor,
		});
		filterSteps.push(...segment.steps);
		labels.push(segment.outputLabel);
		cursor = Math.max(cursor, source.startTime) + segment.duration;
	}
	if (totalDuration > cursor + 1 / Math.max(1, fps)) {
		const gap = `video_gap_${segmentIndex++}`;
		filterSteps.push(
			`color=c=${ffmpegColor(backgroundColor)}:s=${width}x${height}:d=${totalDuration - cursor}:r=${fps},format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[${gap}]`
		);
		labels.push(gap);
	}
	if (labels.length === 1) {
		return {
			filterSteps,
			outputLabel: labels[0],
			segmentCount: labels.length,
		};
	}
	const outputLabel = "video_timeline_base";
	filterSteps.push(
		`${labels.map((label) => `[${label}]`).join("")}concat=n=${labels.length}:v=1:a=0[${outputLabel}]`
	);
	return { filterSteps, outputLabel, segmentCount: labels.length };
}
