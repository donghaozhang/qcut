import type { VideoMask, VideoSource, VideoVisual } from "./ffmpeg/types";

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
};

const DEFAULT_ENHANCEMENTS: NonNullable<VideoVisual["enhancements"]> = {
	stabilization: 0,
	denoise: 0,
	clarity: 0,
	upscale: 1,
	relight: 0,
	beauty: 0,
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
	mask: DEFAULT_MASK,
	masks: [],
	chromaKey: DEFAULT_CHROMA_KEY,
	enhancements: DEFAULT_ENHANCEMENTS,
	keyframeFps: 30,
};

interface VideoTimelineFilterResult {
	filterSteps: string[];
	outputLabel: string;
	segmentCount: number;
}

function ffmpegColor(color: string): string {
	const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
	return match ? `0x${match[1]}` : "black";
}

function easingExpression(progress: string, easing: string): string {
	if (easing === "easeIn") return `pow(${progress},2)`;
	if (easing === "easeOut") return `1-pow(1-${progress},2)`;
	if (easing === "easeInOut") {
		return `if(lt(${progress},0.5),2*pow(${progress},2),1-pow(-2*${progress}+2,2)/2)`;
	}
	if (easing === "spring") {
		return `${progress}+sin(${progress}*PI)*0.15*(1-${progress})`;
	}
	return progress;
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
	const keyframes = [...(visual.keyframes?.[property] ?? [])].sort(
		(a, b) => a.frame - b.frame
	);
	if (keyframes.length === 0) return String(fallback);
	if (keyframes.length === 1) return String(keyframes[0].value);
	const fps = Math.max(1, visual.keyframeFps || 30);
	const timeAt = (frame: number) => frame / fps;
	let expression = String(keyframes[keyframes.length - 1]?.value ?? fallback);
	for (let index = keyframes.length - 2; index >= 0; index--) {
		const from = keyframes[index];
		const to = keyframes[index + 1];
		const start = timeAt(from.frame);
		const end = timeAt(to.frame);
		const duration = Math.max(0.001, end - start);
		const progress = `(${timeVariable}-${start})/${duration}`;
		const eased = easingExpression(progress, to.easing);
		const value = `(${from.value})+((${to.value})-(${from.value}))*(${eased})`;
		expression = `if(lt(${timeVariable},${end}),${value},${expression})`;
	}
	return `if(lt(${timeVariable},${timeAt(keyframes[0].frame)}),${keyframes[0].value},${expression})`;
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
		mask: { ...DEFAULT_MASK, ...source.visual?.mask },
		masks: source.visual?.masks?.map((mask) => ({
			...DEFAULT_MASK,
			...mask,
		})),
		chromaKey: { ...DEFAULT_CHROMA_KEY, ...source.visual?.chromaKey },
		enhancements: {
			...DEFAULT_ENHANCEMENTS,
			...source.visual?.enhancements,
		},
		keyframes: source.visual?.keyframes,
		keyframeFps: source.visual?.keyframeFps ?? 30,
	};
}

function buildFitFilter(
	fitMode: VideoVisual["fitMode"],
	width: number,
	height: number
): string {
	if (fitMode === "contain") {
		return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
	}
	if (fitMode === "fill") return `scale=${width}:${height}`;
	return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
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

function buildAdjustmentFilter(visual: VideoVisual): string {
	const values: NonNullable<VideoVisual["adjustments"]> = {
		...DEFAULT_ADJUSTMENTS,
		...visual.adjustments,
	};
	const fade = clamp(values.fade, 0, 100) / 100;
	const brightness = clamp(values.brightness / 100 + fade * 0.06, -1, 1);
	const contrast = clamp(1 + values.contrast / 100 - fade * 0.25, 0, 3);
	const saturation = clamp(1 + values.saturation / 100 - fade * 0.15, 0, 3);
	const filters = [
		`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
	];
	if (values.temperature !== 0 || values.tint !== 0) {
		filters.push(
			`colorbalance=rs=${clamp(values.temperature / 200, -0.5, 0.5)}:` +
				`bs=${clamp(-values.temperature / 200, -0.5, 0.5)}:` +
				`gm=${clamp(values.tint / 200, -0.5, 0.5)}`
		);
	}
	if (values.sharpness > 0) {
		filters.push(`unsharp=5:5:${clamp(values.sharpness / 50, 0, 2)}`);
	}
	if (values.vignette > 0) {
		filters.push(`vignette=angle=PI/4*${clamp(values.vignette / 100, 0, 1)}`);
	}
	return filters.join(",");
}

function buildEnhancementFilter(
	visual: VideoVisual,
	width: number,
	height: number
): string {
	const values = { ...DEFAULT_ENHANCEMENTS, ...visual.enhancements };
	const filters: string[] = [];
	if (values.stabilization > 0) {
		const radius =
			Math.ceil((clamp(values.stabilization, 0, 100) / 100) * 4) * 16;
		filters.push(`deshake=rx=${radius}:ry=${radius}:edge=mirror`);
	}
	if (values.denoise > 0 || values.beauty > 0) {
		const strength = clamp(values.denoise + values.beauty * 0.35, 0, 100);
		filters.push(
			`hqdn3d=${1 + strength * 0.04}:${1 + strength * 0.03}:${2 + strength * 0.06}:${2 + strength * 0.045}`
		);
	}
	if (values.clarity > 0) {
		filters.push(`unsharp=5:5:${clamp(values.clarity / 50, 0, 2)}`);
	}
	if (values.upscale > 1) {
		filters.push(
			`scale=iw*${values.upscale}:ih*${values.upscale}:flags=lanczos`,
			`scale=${width}:${height}:flags=lanczos`
		);
	}
	if (values.relight !== 0 || values.beauty > 0) {
		const relight = clamp(values.relight, -100, 100);
		const beauty = clamp(values.beauty, 0, 100);
		filters.push(
			`eq=brightness=${relight / 500 + beauty / 2000}:gamma=${clamp(1 + relight / 250, 0.5, 2)}:saturation=${1 + beauty / 1000}`
		);
	}
	return filters.join(",");
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
	const keyframes = [...(mask.keyframes?.[property] ?? [])].sort(
		(a, b) => a.frame - b.frame
	);
	if (keyframes.length === 0) return String(fallback);
	if (keyframes.length === 1) return String(keyframes[0].value);
	const time = `(N/${Math.max(1, fps)})`;
	const timeAt = (frame: number) => frame / Math.max(1, fps);
	let expression = String(keyframes[keyframes.length - 1].value);
	for (let index = keyframes.length - 2; index >= 0; index -= 1) {
		const from = keyframes[index];
		const to = keyframes[index + 1];
		const start = timeAt(from.frame);
		const end = timeAt(to.frame);
		const progress = `(${time}-${start})/${Math.max(0.001, end - start)}`;
		const eased = easingExpression(progress, to.easing);
		const value = `(${from.value})+((${to.value})-(${from.value}))*(${eased})`;
		expression = `if(lt(${time},${end}),${value},${expression})`;
	}
	return `if(lt(${time},${timeAt(keyframes[0].frame)}),${keyframes[0].value},${expression})`;
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

function buildSegmentFilters({
	source,
	inputIndex,
	segmentIndex,
	width,
	height,
	fps,
	backgroundColor,
}: {
	source: VideoSource;
	inputIndex: number;
	segmentIndex: number;
	width: number;
	height: number;
	fps: number;
	backgroundColor: string;
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
	let current = `video_${segmentIndex}_trimmed`;
	steps.push(
		`[${inputIndex}:v]trim=start=${trimStart}:duration=${sourceDuration},setpts=PTS-STARTPTS[${current}]`
	);
	if (source.reverse) {
		const reversed = `video_${segmentIndex}_reversed`;
		steps.push(`[${current}]reverse[${reversed}]`);
		current = reversed;
	}
	const hasSpeedCurve = (source.speedKeyframes?.length ?? 0) > 0;
	const playbackRate = clamp(source.playbackRate ?? 1, 0.1, 8);
	if (hasSpeedCurve || playbackRate !== 1) {
		const sped = `video_${segmentIndex}_sped`;
		const expression = hasSpeedCurve
			? buildSpeedSetptsExpression(speedSamples)
			: `((PTS-STARTPTS)*TB)/${playbackRate}`;
		steps.push(`[${current}]setpts='(${expression})/TB'[${sped}]`);
		current = sped;
	}
	if (freezeDuration > 0) {
		const freezeSourceTime = clamp(
			source.freezeFrameTime ?? sourceDuration,
			0,
			sourceDuration
		);
		const freezeStart = outputTimeAtSource(speedSamples, freezeSourceTime);
		const splitA = `video_${segmentIndex}_freeze_a`;
		const splitB = `video_${segmentIndex}_freeze_b`;
		const splitC = `video_${segmentIndex}_freeze_c`;
		const before = `video_${segmentIndex}_before_freeze`;
		const frozen = `video_${segmentIndex}_frozen`;
		const after = `video_${segmentIndex}_after_freeze`;
		const withFreeze = `video_${segmentIndex}_with_freeze`;
		steps.push(`[${current}]split=3[${splitA}][${splitB}][${splitC}]`);
		steps.push(
			`[${splitA}]trim=start=0:end=${freezeStart},setpts=PTS-STARTPTS[${before}]`
		);
		steps.push(
			`[${splitB}]trim=start=${freezeStart}:end=${Math.min(speedDuration, freezeStart + 1 / Math.max(1, fps))},` +
				`setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${freezeDuration},trim=duration=${freezeDuration},setpts=PTS-STARTPTS[${frozen}]`
		);
		steps.push(
			`[${splitC}]trim=start=${freezeStart}:end=${speedDuration},setpts=PTS-STARTPTS[${after}]`
		);
		steps.push(
			`[${before}][${frozen}][${after}]concat=n=3:v=1:a=0[${withFreeze}]`
		);
		current = withFreeze;
	}

	const fitted = `video_${segmentIndex}_fitted`;
	steps.push(
		`[${current}]${buildFitFilter(visual.fitMode, width, height)},setsar=1,format=rgba[${fitted}]`
	);
	current = fitted;
	const enhancementFilter = buildEnhancementFilter(visual, width, height);
	if (enhancementFilter) {
		const enhanced = `video_${segmentIndex}_enhanced`;
		steps.push(`[${current}]${enhancementFilter}[${enhanced}]`);
		current = enhanced;
	}
	const chromaKey = { ...DEFAULT_CHROMA_KEY, ...visual.chromaKey };
	if (chromaKey.enabled) {
		const keyed = `video_${segmentIndex}_chroma_keyed`;
		steps.push(
			`[${current}]chromakey=${ffmpegColor(chromaKey.color)}:${clamp(chromaKey.similarity, 0.01, 1)}:${clamp(chromaKey.blend, 0, 1)}[${keyed}]`
		);
		current = keyed;
	}
	const adjustmentFilter = buildAdjustmentFilter(visual);
	if (adjustmentFilter) {
		const adjusted = `video_${segmentIndex}_adjusted`;
		steps.push(`[${current}]${adjustmentFilter}[${adjusted}]`);
		current = adjusted;
	}
	if (source.effectFilter) {
		const effected = `video_${segmentIndex}_effects`;
		steps.push(`[${current}]${source.effectFilter}[${effected}]`);
		current = effected;
	}
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
	const mask = buildVideoMaskExpression(visual);
	const cropped = `video_${segmentIndex}_cropped`;
	steps.push(
		`[${current}]geq=` +
			`r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
			`a='alpha(X,Y)*between(X,W*(${left}),W*(1-(${right})))*` +
			`between(Y,H*(${top}),H*(1-(${bottom})))*(${mask})'[${cropped}]`
	);
	current = cropped;

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
	const transformAnimation = buildAnimationExpressions({
		visual,
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
	if (visual.rotation !== 0 || (visual.keyframes?.rotation?.length ?? 0) > 0) {
		const rotated = `video_${segmentIndex}_rotated`;
		steps.push(
			`[${current}]rotate=angle='(${rotation})*PI/180':ow='hypot(iw,ih)':oh='hypot(iw,ih)':c=none[${rotated}]`
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
	const alpha = `video_${segmentIndex}_opacity`;
	steps.push(
		`[${current}]format=rgba,geq=` +
			`r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
			`a='alpha(X,Y)*max(0,min(1,(${opacity})*(${opacityAnimation.opacity})))'[${alpha}]`
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
			`x='(W-w)/2+(${x})+(${transformAnimation.x})':` +
			`y='(H-h)/2+(${y})+(${transformAnimation.y})':shortest=1:format=auto[${foreground}]`
	);

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

export function buildVideoTimelineFilters({
	videoSources,
	width,
	height,
	fps,
	totalDuration,
	backgroundColor = "#000000",
}: {
	videoSources: VideoSource[];
	width: number;
	height: number;
	fps: number;
	totalDuration: number;
	backgroundColor?: string;
}): VideoTimelineFilterResult {
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
