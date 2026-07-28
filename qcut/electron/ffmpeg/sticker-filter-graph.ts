import type {
	StickerKeyframeProperty,
	StickerPropertyKeyframe,
	StickerSource,
} from "./types";
import { buildNumericKeyframeExpression } from "./keyframe-expression";

export interface StickerFilterGraph {
	filterSteps: string[];
	inputLabel: string;
	x: string;
	y: string;
}

interface StickerAnimationExpressions {
	opacity: string;
	scale: string;
	offsetX: string;
	offsetY: string;
	rotation: string;
}

const DEFAULT_PERSPECTIVE = {
	topLeftX: 0,
	topLeftY: 0,
	topRightX: 1,
	topRightY: 0,
	bottomRightX: 1,
	bottomRightY: 1,
	bottomLeftX: 0,
	bottomLeftY: 1,
} as const;

type StickerPerspective = NonNullable<StickerSource["perspective"]>;

interface NormalizedStickerKeyframe {
	frame: number;
	value: number;
	easing: StickerPropertyKeyframe["easing"];
}

type NormalizedStickerKeyframes = Partial<
	Record<StickerKeyframeProperty, NormalizedStickerKeyframe[]>
>;

const STICKER_KEYFRAME_PROPERTIES = [
	"x",
	"y",
	"width",
	"height",
	"rotation",
	"opacity",
	"topLeftX",
	"topLeftY",
	"topRightX",
	"topRightY",
	"bottomRightX",
	"bottomRightY",
	"bottomLeftX",
	"bottomLeftY",
] as const satisfies readonly StickerKeyframeProperty[];

const PERSPECTIVE_KEYFRAME_PROPERTIES = [
	"topLeftX",
	"topLeftY",
	"topRightX",
	"topRightY",
	"bottomRightX",
	"bottomRightY",
	"bottomLeftX",
	"bottomLeftY",
] as const satisfies readonly StickerKeyframeProperty[];

const STICKER_KEYFRAME_EASINGS = [
	"linear",
	"easeIn",
	"easeOut",
	"easeInOut",
	"spring",
] as const;

const MAX_NORMALIZED_STICKER_CANVAS_SIZE = 4096;

function finiteOr({
	value,
	fallback,
}: {
	value: number | undefined;
	fallback: number;
}): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp({
	value,
	minimum,
	maximum,
}: {
	value: number;
	minimum: number;
	maximum: number;
}): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function formatNumber({ value }: { value: number }): string {
	return Number(value.toFixed(6)).toString();
}

function normalizedKeyframeFps({
	value,
}: {
	value: number | undefined;
}): number {
	return clamp({
		value: finiteOr({ value, fallback: 30 }),
		minimum: 1,
		maximum: 240,
	});
}

function clampKeyframeValue({
	property,
	value,
}: {
	property: StickerKeyframeProperty;
	value: number;
}): number {
	if (property === "width" || property === "height") {
		return Math.max(0, value);
	}
	if (property === "opacity") {
		return clamp({ value, minimum: 0, maximum: 1 });
	}
	if (
		PERSPECTIVE_KEYFRAME_PROPERTIES.some(
			(perspectiveProperty) => perspectiveProperty === property
		)
	) {
		return clamp({ value, minimum: 0, maximum: 1 });
	}
	return value;
}

function normalizeKeyframeEasing({
	easing,
}: {
	easing: string;
}): NormalizedStickerKeyframe["easing"] {
	return STICKER_KEYFRAME_EASINGS.some((candidate) => candidate === easing)
		? (easing as NormalizedStickerKeyframe["easing"])
		: "linear";
}

function normalizeStickerKeyframes({
	sticker,
	fps,
}: {
	sticker: StickerSource;
	fps: number;
}): NormalizedStickerKeyframes {
	const normalized: NormalizedStickerKeyframes = {};
	const clipDuration = Math.max(
		0,
		finiteOr({ value: sticker.endTime, fallback: 0 }) -
			finiteOr({ value: sticker.startTime, fallback: 0 })
	);
	const maximumFrame = Math.max(0, Math.round(clipDuration * fps));
	for (const property of STICKER_KEYFRAME_PROPERTIES) {
		const byFrame = new Map<number, NormalizedStickerKeyframe>();
		for (const keyframe of sticker.keyframes?.[property] ?? []) {
			if (
				!Number.isFinite(keyframe.frame) ||
				!Number.isFinite(keyframe.value)
			) {
				continue;
			}
			const frame = clamp({
				value: Math.round(keyframe.frame),
				minimum: 0,
				maximum: maximumFrame,
			});
			byFrame.set(frame, {
				frame,
				value: clampKeyframeValue({
					property,
					value: keyframe.value,
				}),
				easing: normalizeKeyframeEasing({ easing: keyframe.easing }),
			});
		}
		const keyframes = [...byFrame.values()].sort(
			(left, right) => left.frame - right.frame
		);
		if (keyframes.length > 0) normalized[property] = keyframes;
	}
	return normalized;
}

function hasStickerKeyframes({
	keyframes,
}: {
	keyframes: NormalizedStickerKeyframes;
}): boolean {
	return STICKER_KEYFRAME_PROPERTIES.some(
		(property) => (keyframes[property]?.length ?? 0) > 0
	);
}

function buildStickerKeyframeExpression({
	keyframes,
	fps,
	fallback,
	timeVariable,
}: {
	keyframes: NormalizedStickerKeyframe[] | undefined;
	fps: number;
	fallback: number;
	timeVariable: string;
}): string {
	if (!keyframes || keyframes.length === 0) {
		return formatNumber({ value: fallback });
	}
	if (keyframes.length === 1) {
		return formatNumber({ value: keyframes[0].value });
	}
	if (keyframes.some(({ easing }) => easing !== "linear")) {
		return buildNumericKeyframeExpression({
			keyframes,
			fps,
			fallback,
			timeVariable,
		});
	}

	const timeAt = ({ frame }: { frame: number }) => frame / fps;
	let expression = formatNumber({
		value: keyframes[keyframes.length - 1].value,
	});
	for (let index = keyframes.length - 2; index >= 0; index -= 1) {
		const from = keyframes[index];
		const to = keyframes[index + 1];
		const start = timeAt({ frame: from.frame });
		const end = timeAt({ frame: to.frame });
		const duration = Math.max(1 / fps, end - start);
		const progress =
			`((${timeVariable})-${formatNumber({ value: start })})/` +
			formatNumber({ value: duration });
		const value =
			`${formatNumber({ value: from.value })}+` +
			`((${formatNumber({ value: to.value })})-(${formatNumber({ value: from.value })}))*(${progress})`;
		expression =
			`if(lt(${timeVariable},${formatNumber({ value: end })}),` +
			`${value},${expression})`;
	}

	return `if(lt(${timeVariable},${formatNumber({
		value: timeAt({ frame: keyframes[0].frame }),
	})}),${formatNumber({ value: keyframes[0].value })},${expression})`;
}

function keyframedPropertyExpression({
	keyframes,
	property,
	fps,
	fallback,
	timeVariable,
}: {
	keyframes: NormalizedStickerKeyframes;
	property: StickerKeyframeProperty;
	fps: number;
	fallback: number;
	timeVariable: string;
}): string {
	return buildStickerKeyframeExpression({
		keyframes: keyframes[property],
		fps,
		fallback,
		timeVariable,
	});
}

function escapeExpression({ expression }: { expression: string }): string {
	return expression.replace(/,/g, "\\,");
}

function maximumDimensionPixels({
	keyframes,
	fallback,
	canvasShortSide,
}: {
	keyframes: NormalizedStickerKeyframe[] | undefined;
	fallback: number;
	canvasShortSide: number;
}): number {
	if (!keyframes || keyframes.length === 0) return fallback;
	return keyframes.reduce(
		(maximum, keyframe) =>
			Math.max(maximum, (keyframe.value * canvasShortSide) / 100),
		fallback
	);
}

function normalizedStickerCanvasSize({
	keyframes,
	width,
	height,
	canvasShortSide,
}: {
	keyframes: NormalizedStickerKeyframes;
	width: number;
	height: number;
	canvasShortSide: number;
}): number {
	const maximumWidth = maximumDimensionPixels({
		keyframes: keyframes.width,
		fallback: width,
		canvasShortSide,
	});
	const maximumHeight = maximumDimensionPixels({
		keyframes: keyframes.height,
		fallback: height,
		canvasShortSide,
	});
	return Math.ceil(
		clamp({
			value: Math.max(width, height, maximumWidth, maximumHeight),
			minimum: 1,
			maximum: MAX_NORMALIZED_STICKER_CANVAS_SIZE,
		})
	);
}

function buildNormalizedStickerCanvasInput({
	inputLabel,
	labelPrefix,
	size,
	maintainAspectRatio,
	dynamicWidth,
	dynamicHeight,
}: {
	inputLabel: string;
	labelPrefix: string;
	size: number;
	maintainAspectRatio: boolean;
	dynamicWidth: string;
	dynamicHeight: string;
}): { filterSteps: string[]; inputLabel: string } {
	const normalizedLabel = `${labelPrefix}_normalized`;
	if (!maintainAspectRatio) {
		return {
			filterSteps: [`[${inputLabel}]scale=${size}:${size}[${normalizedLabel}]`],
			inputLabel: normalizedLabel,
		};
	}

	const contentSourceLabel = `${labelPrefix}_normalized_content_source`;
	const canvasSourceLabel = `${labelPrefix}_normalized_canvas_source`;
	const contentLabel = `${labelPrefix}_normalized_content`;
	const canvasLabel = `${labelPrefix}_normalized_canvas`;
	const contentWidth = escapeExpression({
		expression:
			`${size}*min(1,(iw*max(1,${dynamicHeight}))/` +
			`(ih*max(1,${dynamicWidth})))`,
	});
	const contentHeight = escapeExpression({
		expression:
			`${size}*min(1,(max(1,${dynamicWidth})*ih)/` +
			`(max(1,${dynamicHeight})*iw))`,
	});
	return {
		filterSteps: [
			`[${inputLabel}]split=2[${contentSourceLabel}][${canvasSourceLabel}]`,
			`[${contentSourceLabel}]scale=` +
				`w='max(1\\,${contentWidth})':h='max(1\\,${contentHeight})':` +
				`eval=frame[${contentLabel}]`,
			`[${canvasSourceLabel}]scale=${size}:${size},format=rgba,` +
				`colorchannelmixer=aa=0[${canvasLabel}]`,
			`[${canvasLabel}][${contentLabel}]overlay=` +
				`x='(W-w)/2':y='(H-h)/2':shortest=1:format=auto` +
				`[${normalizedLabel}]`,
		],
		inputLabel: normalizedLabel,
	};
}

function clipLocalTimeExpression({
	timeVariable,
	startTime,
}: {
	timeVariable: string;
	startTime: number;
}): string {
	return `max(0,${timeVariable}-${formatNumber({ value: startTime })})`;
}

function animationDuration({ value }: { value: number | undefined }): number {
	return Math.max(0.05, finiteOr({ value, fallback: 0.5 }));
}

function effectiveAnimationDurations({ sticker }: { sticker: StickerSource }): {
	entrance: number;
	exit: number;
	clip: number;
} {
	const clip = Math.max(
		0.001,
		finiteOr({ value: sticker.endTime, fallback: 0 }) -
			finiteOr({ value: sticker.startTime, fallback: 0 })
	);
	const entrance =
		(sticker.animationInType ?? "none") === "none"
			? 0
			: animationDuration({ value: sticker.animationInDuration });
	const exit =
		(sticker.animationOutType ?? "none") === "none"
			? 0
			: animationDuration({ value: sticker.animationOutDuration });
	const combined = entrance + exit;
	if (combined <= clip || combined === 0) return { entrance, exit, clip };
	const ratio = clip / combined;
	return { entrance: entrance * ratio, exit: exit * ratio, clip };
}

function easedProgress({
	time,
	duration,
}: {
	time: string;
	duration: number;
}): string {
	if (duration === 0) return "1";
	return `1-pow(1-min(1,max(0,(${time})/${formatNumber({ value: duration })})),3)`;
}

function applyClipAnimation({
	type,
	progress,
	canvasWidth,
	canvasHeight,
	opacity,
	scale,
	x,
	y,
}: {
	type: StickerSource["animationInType"];
	progress: string;
	canvasWidth: number;
	canvasHeight: number;
	opacity: string[];
	scale: string[];
	x: string[];
	y: string[];
}): void {
	if (type === "fade") opacity.push(`(${progress})`);
	if (type === "slide-left") {
		x.push(`-(1-(${progress}))*${formatNumber({ value: canvasWidth * 0.25 })}`);
	}
	if (type === "slide-right") {
		x.push(`(1-(${progress}))*${formatNumber({ value: canvasWidth * 0.25 })}`);
	}
	if (type === "slide-up") {
		y.push(
			`-(1-(${progress}))*${formatNumber({ value: canvasHeight * 0.25 })}`
		);
	}
	if (type === "slide-down") {
		y.push(`(1-(${progress}))*${formatNumber({ value: canvasHeight * 0.25 })}`);
	}
	if (type === "zoom-in") scale.push(`0.7+(${progress})*0.3`);
	if (type === "zoom-out") scale.push(`1.3-(${progress})*0.3`);
}

function buildStickerAnimationExpressions({
	sticker,
	timeVariable,
}: {
	sticker: StickerSource;
	timeVariable: string;
}): StickerAnimationExpressions {
	const durations = effectiveAnimationDurations({ sticker });
	const entranceProgress = easedProgress({
		time: timeVariable,
		duration: durations.entrance,
	});
	const exitProgress = easedProgress({
		time: `${formatNumber({ value: durations.clip })}-(${timeVariable})`,
		duration: durations.exit,
	});
	const canvasWidth = Math.max(
		0,
		finiteOr({ value: sticker.canvasWidth, fallback: sticker.width })
	);
	const canvasHeight = Math.max(
		0,
		finiteOr({ value: sticker.canvasHeight, fallback: sticker.height })
	);
	const opacity: string[] = ["1"];
	const scale: string[] = ["1"];
	const x: string[] = ["0"];
	const y: string[] = ["0"];
	const rotation: string[] = ["0"];
	applyClipAnimation({
		type: sticker.animationInType ?? "none",
		progress: entranceProgress,
		canvasWidth,
		canvasHeight,
		opacity,
		scale,
		x,
		y,
	});
	applyClipAnimation({
		type: sticker.animationOutType ?? "none",
		progress: exitProgress,
		canvasWidth,
		canvasHeight,
		opacity,
		scale,
		x,
		y,
	});

	const intensity = clamp({
		value: finiteOr({ value: sticker.animationLoopIntensity, fallback: 0.5 }),
		minimum: 0,
		maximum: 1,
	});
	const loopType = sticker.animationLoopType ?? "none";
	if (loopType === "pulse" && intensity > 0) {
		scale.push(
			`1+sin((${timeVariable})*2*PI)*${formatNumber({ value: 0.06 * intensity })}`
		);
	}
	if (loopType === "drift" && intensity > 0) {
		x.push(
			`sin((${timeVariable})*2*PI/3)*${formatNumber({ value: canvasWidth * 0.03 * intensity })}`
		);
		y.push(
			`sin((${timeVariable})*4*PI/3)*${formatNumber({ value: canvasHeight * 0.02 * intensity })}`
		);
	}
	if (loopType === "spin" && intensity > 0) {
		rotation.push(
			`(${timeVariable})*${formatNumber({ value: 90 * intensity })}`
		);
	}
	if (loopType === "wobble" && intensity > 0) {
		rotation.push(
			`sin((${timeVariable})*3*PI)*${formatNumber({ value: 8 * intensity })}`
		);
	}
	if (loopType === "bounce" && intensity > 0) {
		y.push(
			`-abs(sin((${timeVariable})*2*PI))*${formatNumber({ value: canvasHeight * 0.04 * intensity })}`
		);
	}
	if (loopType === "blink" && intensity > 0) {
		opacity.push(
			`1-((1-cos((${timeVariable})*4*PI))/2)*${formatNumber({ value: 0.85 * intensity })}`
		);
	}

	return {
		opacity: opacity.map((value) => `(${value})`).join("*"),
		scale: scale.map((value) => `(${value})`).join("*"),
		offsetX: x.map((value) => `(${value})`).join("+"),
		offsetY: y.map((value) => `(${value})`).join("+"),
		rotation: rotation.map((value) => `(${value})`).join("+"),
	};
}

function normalizePerspective({
	perspective,
}: {
	perspective: StickerSource["perspective"];
}): StickerPerspective {
	const coordinate = ({
		value,
		fallback,
	}: {
		value: number | undefined;
		fallback: number;
	}) =>
		clamp({
			value: finiteOr({ value, fallback }),
			minimum: 0,
			maximum: 1,
		});

	return {
		topLeftX: coordinate({
			value: perspective?.topLeftX,
			fallback: DEFAULT_PERSPECTIVE.topLeftX,
		}),
		topLeftY: coordinate({
			value: perspective?.topLeftY,
			fallback: DEFAULT_PERSPECTIVE.topLeftY,
		}),
		topRightX: coordinate({
			value: perspective?.topRightX,
			fallback: DEFAULT_PERSPECTIVE.topRightX,
		}),
		topRightY: coordinate({
			value: perspective?.topRightY,
			fallback: DEFAULT_PERSPECTIVE.topRightY,
		}),
		bottomRightX: coordinate({
			value: perspective?.bottomRightX,
			fallback: DEFAULT_PERSPECTIVE.bottomRightX,
		}),
		bottomRightY: coordinate({
			value: perspective?.bottomRightY,
			fallback: DEFAULT_PERSPECTIVE.bottomRightY,
		}),
		bottomLeftX: coordinate({
			value: perspective?.bottomLeftX,
			fallback: DEFAULT_PERSPECTIVE.bottomLeftX,
		}),
		bottomLeftY: coordinate({
			value: perspective?.bottomLeftY,
			fallback: DEFAULT_PERSPECTIVE.bottomLeftY,
		}),
	};
}

function perspectiveChanged({
	perspective,
}: {
	perspective: StickerPerspective;
}): boolean {
	return Object.entries(DEFAULT_PERSPECTIVE).some(
		([property, value]) =>
			Math.abs(
				perspective[property as keyof typeof DEFAULT_PERSPECTIVE] - value
			) > 1e-6
	);
}

export function buildStickerFilterGraph({
	inputLabel,
	sticker,
	labelPrefix,
}: {
	inputLabel: string;
	sticker: StickerSource;
	labelPrefix: string;
}): StickerFilterGraph {
	const filterSteps: string[] = [];
	const width = Math.max(
		1,
		Math.round(finiteOr({ value: sticker.width, fallback: 1 }))
	);
	const height = Math.max(
		1,
		Math.round(finiteOr({ value: sticker.height, fallback: 1 }))
	);
	const canvasWidth = Math.max(
		1,
		finiteOr({ value: sticker.canvasWidth, fallback: width })
	);
	const canvasHeight = Math.max(
		1,
		finiteOr({ value: sticker.canvasHeight, fallback: height })
	);
	const canvasShortSide = Math.min(canvasWidth, canvasHeight);
	const startTime = Math.max(
		0,
		finiteOr({ value: sticker.startTime, fallback: 0 })
	);
	const keyframeFps = normalizedKeyframeFps({
		value: sticker.keyframeFps,
	});
	const keyframes = normalizeStickerKeyframes({
		sticker,
		fps: keyframeFps,
	});
	const hasKeyframes = hasStickerKeyframes({ keyframes });
	const hasDimensionKeyframes = Boolean(keyframes.width || keyframes.height);
	const hasAnimation =
		(sticker.animationInType ?? "none") !== "none" ||
		(sticker.animationOutType ?? "none") !== "none" ||
		(sticker.animationLoopType ?? "none") !== "none";
	const localLowercaseTime = clipLocalTimeExpression({
		timeVariable: "t",
		startTime,
	});
	const localUppercaseTime = clipLocalTimeExpression({
		timeVariable: "T",
		startTime,
	});
	const localPerspectiveTime =
		`max(0,(on/${formatNumber({ value: keyframeFps })})-` +
		`${formatNumber({ value: startTime })})`;
	const scaledLabel = `${labelPrefix}_scaled`;
	let preparedLabel = inputLabel;
	const perspective = normalizePerspective({
		perspective: sticker.perspective,
	});
	if (sticker.maintainAspectRatio && !hasDimensionKeyframes) {
		const paddedLabel = `${labelPrefix}_padded`;
		filterSteps.push(
			`[${inputLabel}]scale=${width}:${height}:force_original_aspect_ratio=decrease[${scaledLabel}]`
		);
		filterSteps.push(
			`[${scaledLabel}]pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000[${paddedLabel}]`
		);
		preparedLabel = paddedLabel;
	} else if (!sticker.maintainAspectRatio) {
		filterSteps.push(`[${inputLabel}]scale=${width}:${height}[${scaledLabel}]`);
		preparedLabel = scaledLabel;
	}

	if (hasKeyframes || hasAnimation) {
		const fpsLabel = `${labelPrefix}_fps`;
		filterSteps.push(
			`[${preparedLabel}]fps=${formatNumber({ value: keyframeFps })}[${fpsLabel}]`
		);
		preparedLabel = fpsLabel;
	}

	const hasPerspectiveKeyframes = PERSPECTIVE_KEYFRAME_PROPERTIES.some(
		(property) => (keyframes[property]?.length ?? 0) > 0
	);
	const hasPerspective =
		perspectiveChanged({ perspective }) || hasPerspectiveKeyframes;
	let deferredDimensionScale:
		| { filter: string; outputLabel: string }
		| undefined;

	if (hasDimensionKeyframes) {
		const keyframeScaleLabel = `${labelPrefix}_keyframe_scale`;
		const dynamicWidth = keyframes.width
			? `(${keyframedPropertyExpression({
					keyframes,
					property: "width",
					fps: keyframeFps,
					fallback: width,
					timeVariable: localLowercaseTime,
				})})*${formatNumber({ value: canvasShortSide })}/100`
			: formatNumber({ value: width });
		const dynamicHeight = keyframes.height
			? `(${keyframedPropertyExpression({
					keyframes,
					property: "height",
					fps: keyframeFps,
					fallback: height,
					timeVariable: localLowercaseTime,
				})})*${formatNumber({ value: canvasShortSide })}/100`
			: formatNumber({ value: height });
		const dynamicScale =
			`w='max(1\\,${escapeExpression({ expression: dynamicWidth })})':` +
			`h='max(1\\,${escapeExpression({ expression: dynamicHeight })})'`;
		if (hasPerspective || sticker.maintainAspectRatio) {
			const normalizedInput = buildNormalizedStickerCanvasInput({
				inputLabel: preparedLabel,
				labelPrefix,
				size: normalizedStickerCanvasSize({
					keyframes,
					width,
					height,
					canvasShortSide,
				}),
				maintainAspectRatio: sticker.maintainAspectRatio ?? false,
				dynamicWidth,
				dynamicHeight,
			});
			filterSteps.push(...normalizedInput.filterSteps);
			preparedLabel = normalizedInput.inputLabel;
			deferredDimensionScale = {
				filter: dynamicScale,
				outputLabel: keyframeScaleLabel,
			};
		} else {
			filterSteps.push(
				`[${preparedLabel}]scale=${dynamicScale}:` +
					`eval=frame[${keyframeScaleLabel}]`
			);
		}
		if (!deferredDimensionScale) preparedLabel = keyframeScaleLabel;
	}

	if (hasPerspective) {
		const perspectiveLabel = `${labelPrefix}_perspective`;
		const perspectiveExpression = ({
			property,
		}: {
			property: keyof StickerPerspective;
		}) =>
			escapeExpression({
				expression: keyframedPropertyExpression({
					keyframes,
					property,
					fps: keyframeFps,
					fallback: perspective[property],
					timeVariable: localPerspectiveTime,
				}),
			});
		filterSteps.push(
			`[${preparedLabel}]perspective=` +
				`x0='W*${perspectiveExpression({ property: "topLeftX" })}':` +
				`y0='H*${perspectiveExpression({ property: "topLeftY" })}':` +
				`x1='W*${perspectiveExpression({ property: "topRightX" })}':` +
				`y1='H*${perspectiveExpression({ property: "topRightY" })}':` +
				`x2='W*${perspectiveExpression({ property: "bottomLeftX" })}':` +
				`y2='H*${perspectiveExpression({ property: "bottomLeftY" })}':` +
				`x3='W*${perspectiveExpression({ property: "bottomRightX" })}':` +
				`y3='H*${perspectiveExpression({ property: "bottomRightY" })}':` +
				`sense=destination${hasPerspectiveKeyframes ? ":eval=frame" : ""}` +
				`[${perspectiveLabel}]`
		);
		preparedLabel = perspectiveLabel;
	}

	if (deferredDimensionScale) {
		filterSteps.push(
			`[${preparedLabel}]scale=${deferredDimensionScale.filter}:` +
				`eval=frame[${deferredDimensionScale.outputLabel}]`
		);
		preparedLabel = deferredDimensionScale.outputLabel;
	}

	const inputAnimation = buildStickerAnimationExpressions({
		sticker,
		timeVariable: localLowercaseTime,
	});
	if (inputAnimation.scale !== "(1)") {
		const animatedScaleLabel = `${labelPrefix}_animated_scale`;
		const scale = escapeExpression({ expression: inputAnimation.scale });
		filterSteps.push(
			`[${preparedLabel}]scale=w='max(1\\,iw*(${scale}))':h='max(1\\,ih*(${scale}))':eval=frame[${animatedScaleLabel}]`
		);
		preparedLabel = animatedScaleLabel;
	}

	const baseRotation = finiteOr({ value: sticker.rotation, fallback: 0 });
	const rotationKeyframed = (keyframes.rotation?.length ?? 0) > 0;
	if (
		rotationKeyframed ||
		baseRotation !== 0 ||
		inputAnimation.rotation !== "(0)"
	) {
		const rotatedLabel = `${labelPrefix}_rotated`;
		const rotationValue = keyframedPropertyExpression({
			keyframes,
			property: "rotation",
			fps: keyframeFps,
			fallback: baseRotation,
			timeVariable: localLowercaseTime,
		});
		const rotation = escapeExpression({
			expression:
				`${rotationKeyframed ? `(${rotationValue})` : rotationValue}` +
				`+(${inputAnimation.rotation})`,
		});
		filterSteps.push(
			`[${preparedLabel}]rotate='(${rotation})*PI/180':ow='hypot(iw\\,ih)':oh='hypot(iw\\,ih)':c=none[${rotatedLabel}]`
		);
		preparedLabel = rotatedLabel;
	}

	const opacity = clamp({
		value: finiteOr({ value: sticker.opacity, fallback: 1 }),
		minimum: 0,
		maximum: 1,
	});
	const alphaAnimation = buildStickerAnimationExpressions({
		sticker,
		timeVariable: localUppercaseTime,
	}).opacity;
	const opacityKeyframed = (keyframes.opacity?.length ?? 0) > 0;
	if (opacityKeyframed || opacity < 1 || alphaAnimation !== "(1)") {
		const alphaLabel = `${labelPrefix}_alpha`;
		const opacityValue = keyframedPropertyExpression({
			keyframes,
			property: "opacity",
			fps: keyframeFps,
			fallback: opacity,
			timeVariable: localUppercaseTime,
		});
		const alpha = escapeExpression({
			expression:
				`${opacityKeyframed ? `(${opacityValue})` : opacityValue}` +
				`*(${alphaAnimation})`,
		});
		filterSteps.push(
			`[${preparedLabel}]format=rgba,geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='${alpha}*alpha(X\\,Y)'[${alphaLabel}]`
		);
		preparedLabel = alphaLabel;
	}

	const overlayAnimation = buildStickerAnimationExpressions({
		sticker,
		timeVariable: localLowercaseTime,
	});
	const centerX = finiteOr({ value: sticker.x, fallback: 0 }) + width / 2;
	const centerY = finiteOr({ value: sticker.y, fallback: 0 }) + height / 2;
	const centerXExpression = keyframes.x
		? `(${keyframedPropertyExpression({
				keyframes,
				property: "x",
				fps: keyframeFps,
				fallback: centerX,
				timeVariable: localLowercaseTime,
			})})*${formatNumber({ value: canvasWidth })}/100`
		: formatNumber({ value: centerX });
	const centerYExpression = keyframes.y
		? `(${keyframedPropertyExpression({
				keyframes,
				property: "y",
				fps: keyframeFps,
				fallback: centerY,
				timeVariable: localLowercaseTime,
			})})*${formatNumber({ value: canvasHeight })}/100`
		: formatNumber({ value: centerY });
	const x = escapeExpression({
		expression: `${centerXExpression}-overlay_w/2+(${overlayAnimation.offsetX})`,
	});
	const y = escapeExpression({
		expression: `${centerYExpression}-overlay_h/2+(${overlayAnimation.offsetY})`,
	});
	return {
		filterSteps,
		inputLabel: preparedLabel,
		x: `'${x}'`,
		y: `'${y}'`,
	};
}
