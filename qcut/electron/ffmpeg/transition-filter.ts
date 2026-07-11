import type { VideoSource, VideoTransition } from "./types";

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

function planeSample({
	input,
	x,
	y,
}: {
	input: "a" | "b";
	x: string;
	y: string;
}): string {
	return (
		"if(eq(PLANE,0)," +
		input +
		"0(" +
		x +
		"," +
		y +
		"),if(eq(PLANE,1)," +
		input +
		"1(" +
		x +
		"," +
		y +
		"),if(eq(PLANE,2)," +
		input +
		"2(" +
		x +
		"," +
		y +
		")," +
		input +
		"3(" +
		x +
		"," +
		y +
		"))))"
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
			planeSample({
				input: "b",
				x: "X-" + split,
				y: "Y",
			}) +
			"," +
			planeSample({
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
			planeSample({
				input: "b",
				x: "X",
				y: "Y+" + inverse + "*H",
			}) +
			"," +
			planeSample({
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
			planeSample({
				input: "b",
				x: "X",
				y: "Y-" + split,
			}) +
			"," +
			planeSample({
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
		planeSample({
			input: "b",
			x: "X+" + inverse + "*W",
			y: "Y",
		}) +
		"," +
		planeSample({
			input: "a",
			x: "X-(" + progress + ")*W",
			y: "Y",
		}) +
		")"
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

export function buildXfadeTransitionFilter({
	transition,
}: {
	transition: VideoTransition;
}): XfadeTransitionFilter {
	const progress = semanticProgressExpression({ transition });
	if (transition.type === "dissolve") {
		return {
			transition: "custom",
			expression: "A*(1-(" + progress + "))+B*(" + progress + ")",
		};
	}
	if (transition.type === "fade-black") {
		const colorExpression =
			"if(lt(" +
			progress +
			",0.5),A*(1-2*(" +
			progress +
			")),B*(2*(" +
			progress +
			")-1))";
		return {
			transition: "custom",
			expression: "if(eq(PLANE,3),255," + colorExpression + ")",
		};
	}
	if (transition.type === "slide") {
		return {
			transition: "custom",
			expression: slideExpression({
				direction: transition.direction,
				progress,
			}),
		};
	}
	return {
		transition: "custom",
		expression: wipeExpression({
			direction: transition.direction,
			progress,
		}),
	};
}
