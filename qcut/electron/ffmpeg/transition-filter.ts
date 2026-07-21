import type { VideoSource, VideoTransition } from "./types";
import {
	colorSwipeExpression,
	cubeExpression,
	glassRefractionExpression,
	lensFlareExpression,
	motionBlurExpression,
	pageFlipExpression,
	particleDissolveExpression,
	pixelateExpression,
	maskShapeExpression,
	shockwaveExpression,
	vortexExpression,
	textureMaskExpression,
	waterRippleExpression,
} from "./advanced-transition-expressions";
import {
	blendSamples,
	clampedPlaneSample,
	motionBlurPlaneSample,
	planeSample,
	tintPlaneExpression,
	transitionPeakExpression,
	type PlaneSampler,
} from "./transition-expression-utils";

export interface PreparedTransitionSource {
	source: VideoSource;
	handleBefore: number;
	handleAfter: number;
	leadingPad: number;
	trailingPad: number;
	usesSourceHandles: boolean;
}

export interface XfadeTransitionFilter {
	transition: "custom";
	expression: string;
}

function clampPlaybackRate({ rate }: { rate: number | undefined }): number {
	return Math.min(8, Math.max(0.1, rate ?? 1));
}

function hasKeyframes({
	keyframes,
}: {
	keyframes: object | undefined;
}): boolean {
	return Object.values(keyframes ?? {}).some(
		(value) => Array.isArray(value) && value.length > 0
	);
}

function hasTimedVisualState({ source }: { source: VideoSource }): boolean {
	const visual = source.visual;
	if (!visual) return false;
	if (
		visual.animationInType !== undefined &&
		visual.animationInType !== "none"
	) {
		return true;
	}
	if (
		visual.animationOutType !== undefined &&
		visual.animationOutType !== "none"
	) {
		return true;
	}
	if (
		visual.comboAnimationType !== undefined &&
		visual.comboAnimationType !== "none"
	) {
		return true;
	}
	if (hasKeyframes({ keyframes: visual.keyframes })) return true;
	if (hasKeyframes({ keyframes: visual.chromaKey?.keyframes })) return true;
	if (hasKeyframes({ keyframes: visual.mask?.keyframes })) return true;
	return (visual.masks ?? []).some((mask) =>
		hasKeyframes({ keyframes: mask.keyframes })
	);
}

export function canUseTransitionSourceHandles({
	source,
}: {
	source: VideoSource;
}): boolean {
	return (
		!source.reverse &&
		(source.speedKeyframes?.length ?? 0) === 0 &&
		(source.freezeFrameDuration ?? 0) === 0 &&
		!hasTimedVisualState({ source })
	);
}

export function prepareTransitionSource({
	source,
	previousTransition,
	nextTransition,
}: {
	source: VideoSource;
	previousTransition?: VideoTransition;
	nextTransition?: VideoTransition;
}): PreparedTransitionSource {
	const requestedBefore = Math.max(0, (previousTransition?.duration ?? 0) / 2);
	const requestedAfter = Math.max(0, (nextTransition?.duration ?? 0) / 2);
	const usesSourceHandles = canUseTransitionSourceHandles({ source });
	const rate = clampPlaybackRate({ rate: source.playbackRate });
	const availableBefore = Math.max(0, source.trimStart ?? 0);
	const availableAfter = Math.max(0, source.trimEnd ?? 0);
	const sourceHandleBefore = usesSourceHandles
		? Math.min(availableBefore, requestedBefore * rate)
		: 0;
	const sourceHandleAfter = usesSourceHandles
		? Math.min(availableAfter, requestedAfter * rate)
		: 0;
	const handleBefore = sourceHandleBefore / rate;
	const handleAfter = sourceHandleAfter / rate;

	return {
		source: {
			...source,
			trimStart: Math.max(0, (source.trimStart ?? 0) - sourceHandleBefore),
			trimEnd: Math.max(0, (source.trimEnd ?? 0) - sourceHandleAfter),
		},
		handleBefore,
		handleAfter,
		leadingPad: Math.max(0, requestedBefore - handleBefore),
		trailingPad: Math.max(0, requestedAfter - handleAfter),
		usesSourceHandles,
	};
}

function semanticProgressExpression({
	transition,
}: {
	transition: VideoTransition;
}): string {
	const linear = "(1-P)";
	if (transition.easing === "linear") return linear;
	return (
		"if(lt(" +
		linear +
		",0.5),4*pow(" +
		linear +
		",3),1-pow(-2*" +
		linear +
		"+2,3)/2)"
	);
}

function transitionTuning({ transition }: { transition: VideoTransition }) {
	return {
		intensity: Math.min(2, Math.max(0.1, transition.tuning?.intensity ?? 1)),
		frequency: Math.min(4, Math.max(0.1, transition.tuning?.frequency ?? 1)),
		tint: transition.tuning?.tint,
	};
}

function pushExpression({
	direction,
	progress,
	sampler = planeSample,
}: {
	direction: VideoTransition["direction"];
	progress: string;
	sampler?: PlaneSampler;
}): string {
	const inverse = "(1-(" + progress + "))";
	if (direction === "right") {
		const split = inverse + "*W";
		return (
			"if(gte(X," +
			split +
			")," +
			sampler({
				input: "b",
				x: "X-" + split,
				y: "Y",
			}) +
			"," +
			sampler({
				input: "a",
				x: "X+(" + progress + ")*W",
				y: "Y",
			}) +
			")"
		);
	}
	if (direction === "up") {
		const split = "(" + progress + ")*H";
		return (
			"if(lt(Y," +
			split +
			")," +
			sampler({
				input: "b",
				x: "X",
				y: "Y+" + inverse + "*H",
			}) +
			"," +
			sampler({
				input: "a",
				x: "X",
				y: "Y-(" + progress + ")*H",
			}) +
			")"
		);
	}
	if (direction === "down") {
		const split = inverse + "*H";
		return (
			"if(gte(Y," +
			split +
			")," +
			sampler({
				input: "b",
				x: "X",
				y: "Y-" + split,
			}) +
			"," +
			sampler({
				input: "a",
				x: "X",
				y: "Y+(" + progress + ")*H",
			}) +
			")"
		);
	}

	const split = "(" + progress + ")*W";
	return (
		"if(lt(X," +
		split +
		")," +
		sampler({
			input: "b",
			x: "X+" + inverse + "*W",
			y: "Y",
		}) +
		"," +
		sampler({
			input: "a",
			x: "X-(" + progress + ")*W",
			y: "Y",
		}) +
		")"
	);
}

function slideExpression({
	direction,
	progress,
}: {
	direction: VideoTransition["direction"];
	progress: string;
}): string {
	const inverse = "(1-(" + progress + "))";
	if (direction === "right") {
		const split = inverse + "*W";
		return (
			"if(gte(X," +
			split +
			")," +
			planeSample({ input: "b", x: "X-" + split, y: "Y" }) +
			",A)"
		);
	}
	if (direction === "up") {
		const split = "(" + progress + ")*H";
		return (
			"if(lt(Y," +
			split +
			")," +
			planeSample({ input: "b", x: "X", y: "Y+" + inverse + "*H" }) +
			",A)"
		);
	}
	if (direction === "down") {
		const split = inverse + "*H";
		return (
			"if(gte(Y," +
			split +
			")," +
			planeSample({ input: "b", x: "X", y: "Y-" + split }) +
			",A)"
		);
	}

	const split = "(" + progress + ")*W";
	return (
		"if(lt(X," +
		split +
		")," +
		planeSample({ input: "b", x: "X+" + inverse + "*W", y: "Y" }) +
		",A)"
	);
}

function fadeColorExpression({
	progress,
	colorValue,
}: {
	progress: string;
	colorValue: 0 | 255;
}): string {
	const outgoing =
		"A*(1-2*(" + progress + "))+" + colorValue + "*(2*(" + progress + "))";
	const incoming =
		colorValue + "*(2-2*(" + progress + "))+B*(2*(" + progress + ")-1)";
	return (
		"if(eq(PLANE,3),255,if(lt(" +
		progress +
		",0.5)," +
		outgoing +
		"," +
		incoming +
		"))"
	);
}

function wipeExpression({
	direction,
	progress,
}: {
	direction: VideoTransition["direction"];
	progress: string;
}): string {
	const inverse = "(1-(" + progress + "))";
	if (direction === "right") {
		return "if(gte(X," + inverse + "*W),B,A)";
	}
	if (direction === "up") {
		return "if(lt(Y,(" + progress + ")*H),B,A)";
	}
	if (direction === "down") {
		return "if(gte(Y," + inverse + "*H),B,A)";
	}
	return "if(lt(X,(" + progress + ")*W),B,A)";
}

function zoomPlaneSample({
	input,
	peak,
	intensity,
}: {
	input: "a" | "b";
	peak: string;
	intensity: number;
}): string {
	const samples: string[] = [];
	for (const strength of [0, 0.1, 0.2]) {
		const zoom = "(1+" + strength * intensity + "*(" + peak + "))";
		samples.push(
			clampedPlaneSample({
				input,
				x: "W/2+(X-W/2)/" + zoom,
				y: "H/2+(Y-H/2)/" + zoom,
			})
		);
	}
	return "(" + samples.join("+") + ")/" + samples.length;
}

function zoomBlurExpression({
	progress,
	intensity,
}: {
	progress: string;
	intensity: number;
}): string {
	const peak = transitionPeakExpression({ progress });
	return blendSamples({
		progress,
		outgoing: zoomPlaneSample({ input: "a", peak, intensity }),
		incoming: zoomPlaneSample({ input: "b", peak, intensity }),
	});
}

function whipPanExpression({
	direction,
	progress,
	intensity,
}: {
	direction: VideoTransition["direction"];
	progress: string;
	intensity: number;
}): string {
	const peak = transitionPeakExpression({ progress });
	const axisSize = direction === "up" || direction === "down" ? "H" : "W";
	const radius = 0.045 * intensity + "*" + axisSize + "*(" + peak + ")";
	return pushExpression({
		direction,
		progress,
		sampler: ({ input, x, y }) =>
			motionBlurPlaneSample({
				input,
				x,
				y,
				direction,
				radius,
			}),
	});
}

function flashExpression({
	progress,
	intensity,
	tint,
}: {
	progress: string;
	intensity: number;
	tint: string | undefined;
}): string {
	const peak = transitionPeakExpression({ progress });
	const blend = blendSamples({ progress, outgoing: "A", incoming: "B" });
	const color = tintPlaneExpression({ tint: tint ?? "#ffffff" });
	const alpha = Math.min(0.95, 0.7 * intensity);
	return `(${blend})*(1-${alpha}*(${peak}))+(${color})*${alpha}*(${peak})`;
}

function lightLeakExpression({
	progress,
	intensity,
	tint,
}: {
	progress: string;
	intensity: number;
	tint: string | undefined;
}): string {
	const peak = transitionPeakExpression({ progress });
	const blend = blendSamples({ progress, outgoing: "A", incoming: "B" });
	const color = tintPlaneExpression({ tint });
	const alpha = Math.min(0.9, 0.52 * intensity);
	return (
		"(" +
		blend +
		")*(1-" +
		alpha +
		"*(" +
		peak +
		"))+(" +
		color +
		")*" +
		alpha +
		"*(" +
		peak +
		")"
	);
}

function rgbGlitchExpression({
	progress,
	intensity,
	frequency,
}: {
	progress: string;
	intensity: number;
	frequency: number;
}): string {
	const peak = transitionPeakExpression({ progress });
	const channelDirection = "if(eq(PLANE,2),1,if(eq(PLANE,1),-1,0))";
	const bandSize = Math.max(2, Math.round(12 / frequency));
	const stripeDirection = `if(lt(mod(Y,${bandSize}),${Math.max(1, Math.round(bandSize / 2))}),1,-1)`;
	const shift =
		0.04 * intensity +
		"*W*(" +
		peak +
		")*(" +
		channelDirection +
		")*(" +
		stripeDirection +
		")";
	const sampleX = "X+(" + shift + ")";
	return blendSamples({
		progress,
		outgoing: clampedPlaneSample({ input: "a", x: sampleX, y: "Y" }),
		incoming: clampedPlaneSample({ input: "b", x: sampleX, y: "Y" }),
	});
}

function shakeExpression({
	progress,
	intensity,
	frequency,
}: {
	progress: string;
	intensity: number;
	frequency: number;
}): string {
	const peak = transitionPeakExpression({ progress });
	const sampleX =
		"X+sin((" +
		progress +
		")*" +
		50 * frequency +
		")*(" +
		peak +
		")*" +
		0.025 * intensity +
		"*W";
	const sampleY =
		"Y+cos((" +
		progress +
		")*" +
		43 * frequency +
		")*(" +
		peak +
		")*" +
		0.025 * intensity +
		"*H";
	return blendSamples({
		progress,
		outgoing: clampedPlaneSample({ input: "a", x: sampleX, y: sampleY }),
		incoming: clampedPlaneSample({ input: "b", x: sampleX, y: sampleY }),
	});
}

export function buildXfadeTransitionFilter({
	transition,
}: {
	transition: VideoTransition;
}): XfadeTransitionFilter {
	const progress = semanticProgressExpression({ transition });
	const type = transition.type;
	const tuning = transitionTuning({ transition });
	let expression: string;
	switch (type) {
		case "dissolve":
			expression = "A*(1-(" + progress + "))+B*(" + progress + ")";
			break;
		case "fade-black":
		case "fade-white":
			expression = fadeColorExpression({
				progress,
				colorValue: type === "fade-white" ? 255 : 0,
			});
			break;
		case "slide":
			expression = slideExpression({
				direction: transition.direction,
				progress,
			});
			break;
		case "push":
			expression = pushExpression({
				direction: transition.direction,
				progress,
			});
			break;
		case "wipe":
			expression = wipeExpression({
				direction: transition.direction,
				progress,
			});
			break;
		case "zoom-blur":
			expression = zoomBlurExpression({
				progress,
				intensity: tuning.intensity,
			});
			break;
		case "whip-pan":
			expression = whipPanExpression({
				direction: transition.direction,
				progress,
				intensity: tuning.intensity,
			});
			break;
		case "flash":
			expression = flashExpression({
				progress,
				intensity: tuning.intensity,
				tint: tuning.tint,
			});
			break;
		case "light-leak":
			expression = lightLeakExpression({
				progress,
				intensity: tuning.intensity,
				tint: tuning.tint,
			});
			break;
		case "rgb-glitch":
			expression = rgbGlitchExpression({
				progress,
				intensity: tuning.intensity,
				frequency: tuning.frequency,
			});
			break;
		case "shake":
			expression = shakeExpression({
				progress,
				intensity: tuning.intensity,
				frequency: tuning.frequency,
			});
			break;
		case "motion-blur":
			expression = motionBlurExpression({
				direction: transition.direction,
				progress,
				intensity: tuning.intensity,
			});
			break;
		case "pixelate":
			expression = pixelateExpression({
				progress,
				intensity: tuning.intensity,
			});
			break;
		case "water-ripple":
			expression = waterRippleExpression({
				progress,
				intensity: tuning.intensity,
				frequency: tuning.frequency,
			});
			break;
		case "particle-dissolve":
			expression = particleDissolveExpression({
				progress,
				intensity: tuning.intensity,
				frequency: tuning.frequency,
			});
			break;
		case "glass-refraction":
			expression = glassRefractionExpression({
				direction: transition.direction,
				progress,
				intensity: tuning.intensity,
				frequency: tuning.frequency,
			});
			break;
		case "page-flip":
			expression = pageFlipExpression({
				direction: transition.direction,
				progress,
				intensity: tuning.intensity,
			});
			break;
		case "texture-mask":
			expression = transition.maskShape
				? maskShapeExpression({
						shape: transition.maskShape,
						progress,
					})
				: textureMaskExpression({
						progress,
						frequency: tuning.frequency,
					});
			break;
		case "lens-flare":
			expression = lensFlareExpression({
				progress,
				intensity: tuning.intensity,
				tint: tuning.tint,
			});
			break;
		case "vortex":
			expression = vortexExpression({
				progress,
				intensity: tuning.intensity,
			});
			break;
		case "shockwave":
			expression = shockwaveExpression({
				progress,
				intensity: tuning.intensity,
				frequency: tuning.frequency,
			});
			break;
		case "cube":
			expression = cubeExpression({
				progress,
				intensity: tuning.intensity,
			});
			break;
		case "color-swipe":
			expression = colorSwipeExpression({
				direction: transition.direction,
				progress,
				tint: tuning.tint,
			});
			break;
		default: {
			const unsupportedType: never = type;
			throw new Error(`Unsupported transition type: ${unsupportedType}`);
		}
	}
	return { transition: "custom", expression };
}
