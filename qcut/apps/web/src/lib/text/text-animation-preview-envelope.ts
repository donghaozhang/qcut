import {
	normalizeTextAnimations,
	type TextAnimationDistance,
	type TextAnimationEasing,
	type TextAnimationEffect,
	type TextAnimationPhaseBase,
} from "@qcut/editor-core";
import type { TextElement } from "@/types/timeline";

export const TEXT_ANIMATION_FILTER_BLUR_EXTENT = 3;

export interface TextAnimationPreviewEnvelope {
	translateX: number;
	translateY: number;
	scale: number;
	rotationDeg: number;
	filterPadding: number;
	decorationPadding: number;
}

interface NumericRange {
	minimum: number;
	maximum: number;
}

interface EffectEnvelopeContext {
	boxWidth: number;
	boxHeight: number;
	fontSize: number;
	role: "entrance" | "loop" | "exit";
	easing: TextAnimationEasing;
}

function emptyEffectEnvelope(): TextAnimationPreviewEnvelope {
	return {
		translateX: 0,
		translateY: 0,
		scale: 1,
		rotationDeg: 0,
		filterPadding: 0,
		decorationPadding: 0,
	};
}

function springProgressRange({
	mass,
	stiffness,
	damping,
	velocity,
}: Extract<TextAnimationEasing, { type: "spring" }>): NumericRange {
	const angularFrequency = Math.sqrt(stiffness / mass);
	const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
	if (dampingRatio < 1) {
		const dampedFrequency = angularFrequency * Math.sqrt(1 - dampingRatio ** 2);
		const coefficient =
			(dampingRatio * angularFrequency - velocity) / dampedFrequency;
		const amplitude = Math.hypot(1, coefficient);
		return {
			minimum: Math.min(0, 1 - amplitude),
			maximum: Math.max(1, 1 + amplitude),
		};
	}
	const amplitude = 1 + Math.abs(angularFrequency - velocity);
	return {
		minimum: Math.min(0, 1 - amplitude),
		maximum: Math.max(1, 1 + amplitude),
	};
}

function easingProgressRange({
	easing,
}: {
	easing: TextAnimationEasing;
}): NumericRange {
	if (typeof easing === "string") return { minimum: 0, maximum: 1 };
	if (easing.type === "spring") return springProgressRange(easing);
	return {
		minimum: Math.min(0, easing.y1, easing.y2, 1),
		maximum: Math.max(0, easing.y1, easing.y2, 1),
	};
}

function maximumAbsolute({ range }: { range: NumericRange }): number {
	return Math.max(Math.abs(range.minimum), Math.abs(range.maximum));
}

function invertedRange({ range }: { range: NumericRange }): NumericRange {
	return {
		minimum: 1 - range.maximum,
		maximum: 1 - range.minimum,
	};
}

function resolveDistance({
	distance,
	boxWidth,
	boxHeight,
	fontSize,
}: {
	distance: TextAnimationDistance;
	boxWidth: number;
	boxHeight: number;
	fontSize: number;
}): number {
	if (distance.unit === "em") return distance.value * fontSize;
	if (distance.unit === "boxWidth") return distance.value * boxWidth;
	if (distance.unit === "boxHeight") return distance.value * boxHeight;
	return distance.value;
}

function addDirectionalTravel({
	envelope,
	direction,
	distance,
	multiplier,
}: {
	envelope: TextAnimationPreviewEnvelope;
	direction: "left" | "right" | "up" | "down";
	distance: number;
	multiplier: number;
}): void {
	const travel = Math.abs(distance * multiplier);
	if (direction === "left" || direction === "right") {
		envelope.translateX = Math.max(envelope.translateX, travel);
		return;
	}
	envelope.translateY = Math.max(envelope.translateY, travel);
}

function maximumLinearScale({
	from,
	to,
	progress,
	padding = 0,
}: {
	from: number;
	to: number;
	progress: NumericRange;
	padding?: number;
}): number {
	const atMinimum = from + (to - from) * progress.minimum;
	const atMaximum = from + (to - from) * progress.maximum;
	return Math.max(1, Math.abs(atMinimum), Math.abs(atMaximum)) + padding;
}

function cursorPadding({
	effect,
	fontSize,
}: {
	effect: Extract<TextAnimationEffect, { kind: "typewriter" }>;
	fontSize: number;
}): number {
	if (!effect.cursor) return 0;
	const codePointCount = Math.max(1, Array.from(effect.cursor.text).length);
	return codePointCount * fontSize * 1.25;
}

function movementProgressRange({
	role,
	progress,
}: {
	role: EffectEnvelopeContext["role"];
	progress: NumericRange;
}): NumericRange {
	if (role === "entrance") return invertedRange({ range: progress });
	return progress;
}

function resolveBounceSpringRange({
	effect,
}: {
	effect: Extract<TextAnimationEffect, { kind: "bounce" }>;
}): NumericRange {
	return springProgressRange({ type: "spring", ...effect.spring });
}

function resolveEffectEnvelope({
	effect,
	context,
}: {
	effect: TextAnimationEffect;
	context: EffectEnvelopeContext;
}): TextAnimationPreviewEnvelope {
	const envelope = emptyEffectEnvelope();
	const progress = easingProgressRange({ easing: context.easing });
	const edgeMovement = movementProgressRange({
		role: context.role,
		progress,
	});
	const movementMultiplier =
		context.role === "loop" ? 1 : maximumAbsolute({ range: edgeMovement });

	if (effect.kind === "typewriter") {
		envelope.decorationPadding = cursorPadding({
			effect,
			fontSize: context.fontSize,
		});
		return envelope;
	}
	if (effect.kind === "fade") return envelope;
	if (effect.kind === "slide" || effect.kind === "blur") {
		if (effect.direction && effect.distance) {
			addDirectionalTravel({
				envelope,
				direction: effect.direction,
				distance: resolveDistance({
					distance: effect.distance,
					...context,
				}),
				multiplier: movementMultiplier,
			});
		}
		if (effect.kind === "blur") {
			envelope.filterPadding =
				effect.radiusPx * TEXT_ANIMATION_FILTER_BLUR_EXTENT;
		}
		return envelope;
	}
	if (effect.kind === "rotate") {
		const rotationProgress =
			context.role === "loop" ? progress : invertedRange({ range: progress });
		envelope.rotationDeg =
			Math.abs(effect.degrees) * maximumAbsolute({ range: rotationProgress });
		if (effect.travelDirection && effect.distance) {
			addDirectionalTravel({
				envelope,
				direction: effect.travelDirection,
				distance: resolveDistance({
					distance: effect.distance,
					...context,
				}),
				multiplier: movementMultiplier,
			});
		}
		return envelope;
	}
	if (effect.kind === "scale") {
		envelope.scale =
			context.role === "loop"
				? Math.max(1, Math.abs(effect.hiddenScale))
				: maximumLinearScale({
						from: effect.hiddenScale,
						to: 1,
						progress,
						padding: effect.overshoot,
					});
		return envelope;
	}
	if (effect.kind === "bounce") {
		const springRange = resolveBounceSpringRange({ effect });
		const resolvedPresence =
			context.role === "exit"
				? invertedRange({ range: springRange })
				: springRange;
		const travelRange =
			context.role === "entrance"
				? invertedRange({ range: springRange })
				: springRange;
		addDirectionalTravel({
			envelope,
			direction: effect.direction,
			distance: resolveDistance({
				distance: effect.distance,
				...context,
			}),
			multiplier:
				context.role === "loop" ? 1 : maximumAbsolute({ range: travelRange }),
		});
		envelope.scale =
			context.role === "loop"
				? Math.max(1, Math.abs(effect.hiddenScale))
				: maximumLinearScale({
						from: effect.hiddenScale,
						to: 1,
						progress: resolvedPresence,
					});
		return envelope;
	}
	if (effect.kind === "orbit") {
		const radius = resolveDistance({
			distance: effect.radius,
			...context,
		});
		if (context.role === "loop") {
			envelope.translateX = radius * 2;
			envelope.translateY = radius;
		} else {
			const radialProgress =
				context.role === "entrance"
					? invertedRange({ range: progress })
					: progress;
			const travel = radius * maximumAbsolute({ range: radialProgress });
			envelope.translateX = travel;
			envelope.translateY = travel;
		}
		envelope.rotationDeg =
			360 * effect.turns * Math.max(1, maximumAbsolute({ range: progress }));
		return envelope;
	}
	if (effect.kind === "laser") {
		envelope.filterPadding =
			effect.glowPx * effect.trail * 0.2 * TEXT_ANIMATION_FILTER_BLUR_EXTENT;
		envelope.decorationPadding =
			effect.glowPx * TEXT_ANIMATION_FILTER_BLUR_EXTENT +
			effect.thicknessPx / 2;
		return envelope;
	}
	const distance = resolveDistance({
		distance: effect.distance,
		...context,
	});
	addDirectionalTravel({
		envelope,
		direction: effect.direction,
		distance,
		multiplier: movementMultiplier,
	});
	envelope.scale = Math.max(1, Math.abs(effect.hiddenScale));
	envelope.decorationPadding = context.fontSize * (effect.spread + 0.25);
	return envelope;
}

function combineEffectEnvelopes({
	envelopes,
}: {
	envelopes: TextAnimationPreviewEnvelope[];
}): TextAnimationPreviewEnvelope {
	return envelopes.reduce<TextAnimationPreviewEnvelope>(
		(combined, envelope) => ({
			translateX: combined.translateX + envelope.translateX,
			translateY: combined.translateY + envelope.translateY,
			scale: combined.scale * envelope.scale,
			rotationDeg: combined.rotationDeg + envelope.rotationDeg,
			filterPadding: Math.max(combined.filterPadding, envelope.filterPadding),
			decorationPadding: Math.max(
				combined.decorationPadding,
				envelope.decorationPadding
			),
		}),
		emptyEffectEnvelope()
	);
}

export function resolveTextAnimationPreviewEnvelope({
	element,
	fps,
	boxWidth,
	boxHeight,
}: {
	element: TextElement;
	fps: number;
	boxWidth: number;
	boxHeight: number;
}): TextAnimationPreviewEnvelope {
	const animation = normalizeTextAnimations({ element, fps }).animation;
	if (!animation) return emptyEffectEnvelope();
	const phases: Array<{
		role: EffectEnvelopeContext["role"];
		phase: TextAnimationPhaseBase | undefined;
	}> = [
		{ role: "entrance", phase: animation.entrance },
		{ role: "loop", phase: animation.loop },
		{ role: "exit", phase: animation.exit },
	];
	return combineEffectEnvelopes({
		envelopes: phases.flatMap(({ role, phase }) =>
			phase
				? [
						resolveEffectEnvelope({
							effect: phase.effect,
							context: {
								boxWidth,
								boxHeight,
								fontSize: element.fontSize,
								role,
								easing: phase.timing.easing,
							},
						}),
					]
				: []
		),
	});
}
