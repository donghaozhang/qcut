import type { TextElement } from "../types/timeline.js";
import {
	type CompiledTextAnimation,
	type CompiledTextAnimationPhase,
	type CompiledTextAnimationRhythm,
	type CompiledTextAnimationUnit,
	type TextAnimationEdgePhase,
	type TextAnimationLoopPhase,
	type TextAnimationOrder,
	type TextAnimationPhaseBase,
	type TextAnimationSegment,
} from "./model.js";
import { normalizeTextAnimations } from "./normalize.js";
import { segmentText } from "./segmentation.js";

const FRAME_EPSILON = 1e-7;

interface EdgeFrameCounts {
	delay: number;
	duration: number;
}

function finiteOr({
	value,
	fallback,
}: {
	value: number;
	fallback: number;
}): number {
	return Number.isFinite(value) ? value : fallback;
}

function secondsToFrameCount({
	seconds,
	fps,
	minimum,
}: {
	seconds: number;
	fps: number;
	minimum: number;
}): number {
	return Math.max(minimum, Math.round(seconds * fps));
}

function fitSingleEdge({
	requested,
	budget,
}: {
	requested: EdgeFrameCounts;
	budget: number;
}): EdgeFrameCounts {
	if (budget <= 0) return { delay: 0, duration: 0 };
	const requestedTotal = requested.delay + requested.duration;
	if (requestedTotal <= budget) return requested;
	const delay = Math.min(
		budget - 1,
		Math.round((requested.delay / requestedTotal) * budget)
	);
	return { delay: Math.max(0, delay), duration: Math.max(1, budget - delay) };
}

function fitEdgeFrames({
	entrance,
	exit,
	clipFrames,
}: {
	entrance?: EdgeFrameCounts;
	exit?: EdgeFrameCounts;
	clipFrames: number;
}): { entrance?: EdgeFrameCounts; exit?: EdgeFrameCounts } {
	if (clipFrames <= 0) return {};
	if (entrance && !exit) {
		return {
			entrance: fitSingleEdge({ requested: entrance, budget: clipFrames }),
		};
	}
	if (exit && !entrance) {
		return { exit: fitSingleEdge({ requested: exit, budget: clipFrames }) };
	}
	if (!entrance || !exit) return {};

	const entranceTotal = entrance.delay + entrance.duration;
	const exitTotal = exit.delay + exit.duration;
	if (entranceTotal + exitTotal <= clipFrames) return { entrance, exit };
	if (clipFrames === 1) {
		return {
			entrance: { delay: 0, duration: 1 },
			exit: { delay: 0, duration: 1 },
		};
	}
	const entranceBudget = Math.min(
		clipFrames - 1,
		Math.max(
			1,
			Math.round((entranceTotal / (entranceTotal + exitTotal)) * clipFrames)
		)
	);
	const exitBudget = clipFrames - entranceBudget;
	return {
		entrance: fitSingleEdge({
			requested: entrance,
			budget: entranceBudget,
		}),
		exit: fitSingleEdge({ requested: exit, budget: exitBudget }),
	};
}

function seededUnitOrder({
	count,
	seed,
}: {
	count: number;
	seed: number;
}): number[] {
	const indices = Array.from({ length: count }, (_, index) => index);
	let state = seed || 0x9e37_79b9;
	for (let index = indices.length - 1; index > 0; index--) {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		const swapIndex = (state >>> 0) % (index + 1);
		const current = indices[index];
		indices[index] = indices[swapIndex];
		indices[swapIndex] = current;
	}
	return indices;
}

function orderedUnitIndices({
	count,
	order,
	seed,
}: {
	count: number;
	order: TextAnimationOrder;
	seed: number;
}): number[] {
	const indices = Array.from({ length: count }, (_, index) => index);
	if (order === "reverse") return indices.reverse();
	if (order === "random") return seededUnitOrder({ count, seed });
	const center = (count - 1) / 2;
	if (order === "centerOut") {
		return indices.sort(
			(left, right) =>
				Math.abs(left - center) - Math.abs(right - center) || left - right
		);
	}
	if (order === "outsideIn") {
		return indices.sort(
			(left, right) =>
				Math.abs(right - center) - Math.abs(left - center) || left - right
		);
	}
	return indices;
}

function findGraphemeRange({
	segment,
	graphemes,
}: {
	segment: TextAnimationSegment;
	graphemes: TextAnimationSegment[];
}): { start: number; end: number } {
	const first = graphemes.findIndex((grapheme) => grapheme.end > segment.start);
	if (first < 0) return { start: graphemes.length, end: graphemes.length };
	let end = first;
	while (end < graphemes.length && graphemes[end].start < segment.end) end++;
	return { start: first, end };
}

function compileUnits({
	content,
	phase,
}: {
	content: string;
	phase: TextAnimationPhaseBase;
}): CompiledTextAnimationUnit[] {
	const graphemes = segmentText({
		content,
		unit: "grapheme",
		locale: phase.sequence.locale,
	});
	const segments = segmentText({
		content,
		unit: phase.sequence.unit,
		locale: phase.sequence.locale,
	});
	const order = orderedUnitIndices({
		count: segments.length,
		order: phase.sequence.order,
		seed: phase.sequence.seed,
	});
	const rankByIndex = new Map(
		order.map((unitIndex, rank) => [unitIndex, rank] as const)
	);
	return segments.map((segment, index) => {
		const range = findGraphemeRange({ segment, graphemes });
		return {
			index,
			graphemeStart: range.start,
			graphemeEnd: range.end,
			rank: rankByIndex.get(index) ?? index,
		};
	});
}

function compileTypewriterRhythm({
	phase,
	unitCount,
}: {
	phase: TextAnimationPhaseBase;
	unitCount: number;
}): CompiledTextAnimationRhythm | undefined {
	if (phase.effect.kind !== "typewriter") return;
	const weights = phase.effect.rhythm;
	if (!weights || weights.length === 0 || unitCount === 0) return;

	const prefixTotals = [0];
	let cycleTotal = 0;
	for (const weight of weights) {
		cycleTotal += weight;
		prefixTotals.push(cycleTotal);
	}
	if (cycleTotal <= 0) return;

	const fullCycles = Math.floor(unitCount / weights.length);
	const remainder = unitCount % weights.length;
	const total = fullCycles * cycleTotal + (prefixTotals.at(remainder) ?? 0);
	if (total <= 0) return;

	return {
		weights,
		prefixTotals,
		cycleTotal,
		total,
		span: unitCount / (unitCount + 1),
	};
}

function compilePhaseContent({
	content,
	phase,
}: {
	content: string;
	phase: TextAnimationPhaseBase;
}): {
	units: CompiledTextAnimationUnit[];
	typewriterRhythm?: CompiledTextAnimationRhythm;
} {
	const units = compileUnits({ content, phase });
	const typewriterRhythm = compileTypewriterRhythm({
		phase,
		unitCount: units.length,
	});
	return {
		units,
		...(typewriterRhythm ? { typewriterRhythm } : {}),
	};
}

function compileEdgePhase({
	config,
	frames,
	visibleStartFrame,
	visibleEndFrame,
	edge,
	content,
}: {
	config: TextAnimationEdgePhase;
	frames: EdgeFrameCounts;
	visibleStartFrame: number;
	visibleEndFrame: number;
	edge: "entrance" | "exit";
	content: string;
}): CompiledTextAnimationPhase<TextAnimationEdgePhase> {
	const startFrame =
		edge === "entrance"
			? visibleStartFrame + frames.delay
			: visibleEndFrame - frames.delay - frames.duration;
	return {
		config,
		delayFrames: frames.delay,
		durationFrames: frames.duration,
		startFrame,
		endFrame: startFrame + frames.duration,
		...compilePhaseContent({ content, phase: config }),
	};
}

function compileLoopPhase({
	config,
	fps,
	startBoundary,
	endBoundary,
	content,
}: {
	config: TextAnimationLoopPhase;
	fps: number;
	startBoundary: number;
	endBoundary: number;
	content: string;
}): CompiledTextAnimationPhase<TextAnimationLoopPhase> | undefined {
	const delayFrames = secondsToFrameCount({
		seconds: config.timing.delay,
		fps,
		minimum: 0,
	});
	const startFrame = Math.min(endBoundary, startBoundary + delayFrames);
	if (startFrame >= endBoundary) return;
	return {
		config,
		delayFrames,
		durationFrames: secondsToFrameCount({
			seconds: config.timing.duration,
			fps,
			minimum: 1,
		}),
		startFrame,
		endFrame: endBoundary,
		...compilePhaseContent({ content, phase: config }),
	};
}

export function compileTextAnimation({
	element,
	fps = 30,
}: {
	element: TextElement;
	fps?: number;
}): CompiledTextAnimation {
	const safeFps = Math.min(
		240,
		Math.max(1, finiteOr({ value: fps, fallback: 30 }))
	);
	const startTime = finiteOr({ value: element.startTime, fallback: 0 });
	const duration = Math.max(
		0,
		finiteOr({ value: element.duration, fallback: 0 })
	);
	const trimStart = Math.max(
		0,
		finiteOr({ value: element.trimStart, fallback: 0 })
	);
	const trimEnd = Math.max(
		0,
		finiteOr({ value: element.trimEnd, fallback: 0 })
	);
	const visibleStartFrame = Math.ceil(
		(startTime + trimStart) * safeFps - FRAME_EPSILON
	);
	const visibleEndFrame = Math.max(
		visibleStartFrame,
		Math.ceil((startTime + duration - trimEnd) * safeFps - FRAME_EPSILON)
	);
	const normalized = normalizeTextAnimations({
		element,
		fps: safeFps,
	}).animation;
	const compiled: CompiledTextAnimation = {
		content: element.content,
		fps: safeFps,
		visibleStartFrame,
		visibleEndFrame,
	};
	if (!normalized || visibleEndFrame <= visibleStartFrame) return compiled;

	const requestedEntrance = normalized.entrance
		? {
				delay: secondsToFrameCount({
					seconds: normalized.entrance.timing.delay,
					fps: safeFps,
					minimum: 0,
				}),
				duration: secondsToFrameCount({
					seconds: normalized.entrance.timing.duration,
					fps: safeFps,
					minimum: 1,
				}),
			}
		: undefined;
	const requestedExit = normalized.exit
		? {
				delay: secondsToFrameCount({
					seconds: normalized.exit.timing.delay,
					fps: safeFps,
					minimum: 0,
				}),
				duration: secondsToFrameCount({
					seconds: normalized.exit.timing.duration,
					fps: safeFps,
					minimum: 1,
				}),
			}
		: undefined;
	const fitted = fitEdgeFrames({
		entrance: requestedEntrance,
		exit: requestedExit,
		clipFrames: visibleEndFrame - visibleStartFrame,
	});

	if (normalized.entrance && fitted.entrance) {
		compiled.entrance = compileEdgePhase({
			config: normalized.entrance,
			frames: fitted.entrance,
			visibleStartFrame,
			visibleEndFrame,
			edge: "entrance",
			content: element.content,
		});
	}
	if (normalized.exit && fitted.exit) {
		compiled.exit = compileEdgePhase({
			config: normalized.exit,
			frames: fitted.exit,
			visibleStartFrame,
			visibleEndFrame,
			edge: "exit",
			content: element.content,
		});
	}
	if (normalized.loop) {
		const loop = compileLoopPhase({
			config: normalized.loop,
			fps: safeFps,
			startBoundary: compiled.entrance?.endFrame ?? visibleStartFrame,
			endBoundary: compiled.exit?.startFrame ?? visibleEndFrame,
			content: element.content,
		});
		if (loop) compiled.loop = loop;
	}
	return compiled;
}
