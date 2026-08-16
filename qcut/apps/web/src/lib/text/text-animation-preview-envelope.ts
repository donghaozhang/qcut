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
		if (effect.shakeEm) {
			envelope.translateX = context.fontSize * effect.shakeEm;
			envelope.translateY = context.fontSize * effect.shakeEm;
			envelope.filterPadding =
				context.fontSize *
				effect.shakeEm *
				0.6 *
				TEXT_ANIMATION_FILTER_BLUR_EXTENT;
		}
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
		if (effect.spin !== false) {
			envelope.rotationDeg =
				360 * effect.turns * Math.max(1, maximumAbsolute({ range: progress }));
		}
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
	if (effect.kind === "flip") {
		envelope.rotationDeg = effect.maxAngleDeg;
		envelope.scale = 1 + effect.perspective;
		return envelope;
	}
	if (effect.kind === "flip3d") {
		const angle = (Math.abs(effect.maxAngleDeg) * Math.PI) / 180;
		const rotatingExtent =
			effect.axis === "y" ? context.boxWidth : context.boxHeight;
		const maximumDepth = (rotatingExtent / 2) * Math.abs(Math.sin(angle));
		const fov = (effect.cameraFovDeg * Math.PI) / 180;
		const baseDistance = context.boxHeight / (2 * Math.tan(fov / 2));
		const cameraDistance =
			baseDistance +
			maximumDepth +
			Math.max(context.boxWidth, context.boxHeight) * 0.05;
		envelope.scale = Math.max(
			1,
			cameraDistance / Math.max(1, cameraDistance - maximumDepth)
		);
		return envelope;
	}
	if (effect.kind === "cylinder3d") {
		const radius = context.boxWidth * effect.radiusRatio;
		const horizontalScale = (radius * 2) / Math.max(1, context.boxWidth);
		const tiltScale = 1 + Math.abs(Math.sin((effect.tiltXDeg * Math.PI) / 180));
		envelope.scale = Math.max(1, horizontalScale, tiltScale);
		return envelope;
	}
	if (effect.kind === "jitter3d") {
		envelope.translateX = context.boxWidth * effect.positionJitter;
		envelope.translateY = context.boxHeight * effect.positionJitter;
		envelope.rotationDeg = effect.rotationZDeg;
		envelope.scale =
			Math.max(1, effect.scaleFrom, effect.scaleTo) *
			(1 + effect.trailStrength * 0.08);
		envelope.filterPadding = context.fontSize * effect.trailStrength * 0.08;
		return envelope;
	}
	if (effect.kind === "jitter") {
		envelope.translateX = context.fontSize * effect.amplitudeX;
		envelope.translateY = context.fontSize * effect.amplitudeY;
		return envelope;
	}
	if (effect.kind === "arc") {
		envelope.translateY = context.fontSize * effect.riseEm;
		envelope.rotationDeg = Math.abs(effect.tiltDeg);
		return envelope;
	}
	if (effect.kind === "squeeze") {
		envelope.scale = 1 + effect.amount * 0.3;
		return envelope;
	}
	if (effect.kind === "fold") {
		return envelope;
	}
	if (effect.kind === "spiral") {
		envelope.translateX = resolveDistance({
			distance: effect.radius,
			...context,
		});
		envelope.translateY =
			envelope.translateX +
			resolveDistance({ distance: effect.drop, ...context });
		envelope.rotationDeg = 360 * effect.turns;
		return envelope;
	}
	if (effect.kind === "tumble") {
		envelope.translateY = resolveDistance({
			distance: effect.drop,
			...context,
		});
		envelope.rotationDeg = Math.abs(effect.spinDeg);
		return envelope;
	}
	if (effect.kind === "shatter") {
		// Magnitudes, not a signed sum: noise scatters symmetrically while
		// gravity pulls one way, so the reach is the sum of their absolute
		// contributions no matter which direction gravity points.
		const drift =
			Math.abs(context.fontSize * effect.distortion) +
			Math.abs(resolveDistance({ distance: effect.gravity, ...context }));
		envelope.translateX = drift;
		envelope.translateY = drift;
		return envelope;
	}
	if (effect.kind === "scatter") {
		const travel = resolveDistance({ distance: effect.distance, ...context });
		envelope.translateX = travel;
		envelope.translateY = travel;
		envelope.rotationDeg = effect.rotateDeg;
		return envelope;
	}
	if (effect.kind === "burst") {
		// Particles fly from the layout center: fastest launch (1.4×) plus the
		// gravity drop bounds their reach.
		const reach =
			resolveDistance({ distance: effect.speed, ...context }) * 1.4 +
			resolveDistance({ distance: effect.gravity, ...context });
		envelope.translateX = reach;
		envelope.translateY = reach;
		return envelope;
	}
	if (effect.kind === "colorCycle") {
		// Color rides in place; only the coupled bounce lift moves the glyphs.
		envelope.translateY = (effect.bounceEm ?? 0) * context.fontSize;
		return envelope;
	}
	if (effect.kind === "marquee") {
		// Wrapped characters stay within half a period of the block center,
		// so the widest excursion is bounded by the box plus the wrap gap.
		envelope.translateX =
			context.boxWidth / 2 + (effect.gapEm * context.fontSize) / 2;
		return envelope;
	}
	if (effect.kind === "keyframes") {
		const maxAbs = (track?: { v: number }[]) =>
			track?.reduce((max, point) => Math.max(max, Math.abs(point.v)), 0) ?? 0;
		envelope.translateX =
			maxAbs(effect.channels.translateXEm) * context.fontSize;
		envelope.translateY =
			maxAbs(effect.channels.translateYEm) * context.fontSize;
		envelope.scale = Math.max(
			1,
			maxAbs(effect.channels.scaleX),
			maxAbs(effect.channels.scaleY)
		);
		// The painter turns glowRadiusPx into shadowBlur and blurPx into a
		// filter, both of which paint outside the glyph box — reserve room for
		// them or the preview clips the halo (glow-pulse peaks at 14 px).
		const glowRadius =
			maxAbs(effect.channels.glowIntensity) > 0
				? maxAbs(effect.channels.glowRadiusPx)
				: 0;
		envelope.filterPadding =
			Math.max(glowRadius, maxAbs(effect.channels.blurPx)) *
			TEXT_ANIMATION_FILTER_BLUR_EXTENT;
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
