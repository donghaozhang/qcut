import {
	IDENTITY_TEXT_ANIMATION_VISUAL_STATE,
	type CompiledTextAnimationUnit,
	type TextAnimationActivePhase,
	type TextAnimationDecorationState,
	type TextAnimationDirection,
	type TextAnimationDistance,
	type TextAnimationEffect,
	type TextAnimationLayout,
	type TextAnimationVisualState,
} from "./model.js";
import { clampUnitInterval, springProgress } from "./easing.js";

export interface TextAnimationEffectResult {
	visual: TextAnimationVisualState;
	decorations: TextAnimationDecorationState[];
}

export interface TextAnimationEffectContext {
	effect: TextAnimationEffect;
	role: TextAnimationActivePhase;
	progress: number;
	linearProgress: number;
	layout: TextAnimationLayout;
	unit: CompiledTextAnimationUnit;
}

function lerp({
	from,
	to,
	progress,
}: {
	from: number;
	to: number;
	progress: number;
}): number {
	return from + (to - from) * progress;
}

function identityVisual(): TextAnimationVisualState {
	return { ...IDENTITY_TEXT_ANIMATION_VISUAL_STATE };
}

function directionVector({
	direction,
}: {
	direction: TextAnimationDirection;
}): { x: number; y: number } {
	if (direction === "left") return { x: -1, y: 0 };
	if (direction === "right") return { x: 1, y: 0 };
	if (direction === "up") return { x: 0, y: -1 };
	return { x: 0, y: 1 };
}

function resolveDistance({
	distance,
	layout,
}: {
	distance: TextAnimationDistance;
	layout: TextAnimationLayout;
}): number {
	if (distance.unit === "em") return distance.value * layout.fontSize;
	if (distance.unit === "boxWidth") {
		return distance.value * layout.bounds.width;
	}
	if (distance.unit === "boxHeight") {
		return distance.value * layout.bounds.height;
	}
	return distance.value;
}

function edgePresence({
	role,
	progress,
}: {
	role: TextAnimationActivePhase;
	progress: number;
}): number {
	if (role === "exit") return 1 - progress;
	return progress;
}

function travelMultiplier({
	role,
	presence,
	progress,
}: {
	role: TextAnimationActivePhase;
	presence: number;
	progress: number;
}): number {
	if (role === "entrance") return -(1 - presence);
	if (role === "exit") return progress;
	return Math.sin(progress * Math.PI * 2);
}

function seededValue({
	seed,
	unitIndex,
	particleIndex,
	channel,
}: {
	seed: number;
	unitIndex: number;
	particleIndex: number;
	channel: number;
}): number {
	let state =
		(seed ^
			Math.imul(unitIndex + 1, 0x9e37_79b1) ^
			Math.imul(particleIndex + 1, 0x85eb_ca77) ^
			Math.imul(channel + 1, 0xc2b2_ae3d)) >>>
		0;
	state ^= state >>> 16;
	state = Math.imul(state, 0x7feb_352d);
	state ^= state >>> 15;
	state = Math.imul(state, 0x846c_a68b);
	state ^= state >>> 16;
	return (state >>> 0) / 0xffff_ffff;
}

function unitBounds({
	unit,
	layout,
}: {
	unit: CompiledTextAnimationUnit;
	layout: TextAnimationLayout;
}): { x: number; y: number; width: number; height: number } {
	const glyphs = layout.graphemes.filter(
		(grapheme) =>
			grapheme.index >= unit.graphemeStart && grapheme.index < unit.graphemeEnd
	);
	if (glyphs.length === 0) return layout.bounds;
	const left = Math.min(...glyphs.map((glyph) => glyph.bounds.x));
	const top = Math.min(...glyphs.map((glyph) => glyph.bounds.y));
	const right = Math.max(
		...glyphs.map((glyph) => glyph.bounds.x + glyph.bounds.width)
	);
	const bottom = Math.max(
		...glyphs.map((glyph) => glyph.bounds.y + glyph.bounds.height)
	);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function heartDecorations({
	effect,
	role,
	progress,
	unit,
	layout,
}: {
	effect: Extract<TextAnimationEffect, { kind: "heart" }>;
	role: TextAnimationActivePhase;
	progress: number;
	unit: CompiledTextAnimationUnit;
	layout: TextAnimationLayout;
}): TextAnimationDecorationState[] {
	const burst =
		role === "loop"
			? Math.sin(progress * Math.PI) ** 2
			: Math.sin(clampUnitInterval({ value: progress }) * Math.PI);
	if (burst <= 0) return [];
	const bounds = unitBounds({ unit, layout });
	const centerX = bounds.x + bounds.width / 2;
	const centerY = bounds.y + bounds.height / 2;
	const decorations: TextAnimationDecorationState[] = [];
	for (
		let particleIndex = 0;
		particleIndex < effect.particleCount;
		particleIndex++
	) {
		const angle =
			seededValue({
				seed: effect.seed,
				unitIndex: unit.index,
				particleIndex,
				channel: 0,
			}) *
			Math.PI *
			2;
		const radius =
			(0.35 +
				seededValue({
					seed: effect.seed,
					unitIndex: unit.index,
					particleIndex,
					channel: 1,
				}) *
					0.65) *
			layout.fontSize *
			effect.spread *
			burst;
		const rotationDeg =
			seededValue({
				seed: effect.seed,
				unitIndex: unit.index,
				particleIndex,
				channel: 2,
			}) *
				80 -
			40;
		decorations.push({
			kind: "heart",
			id: `${unit.index}:${particleIndex}`,
			x: centerX + Math.cos(angle) * radius,
			y: centerY + Math.sin(angle) * radius,
			scale: (0.35 + (particleIndex % 3) * 0.15) * burst,
			rotationDeg,
			opacity: burst,
			color: effect.color,
		});
	}
	return decorations;
}

function loopVisual({
	context,
}: {
	context: TextAnimationEffectContext;
}): TextAnimationEffectResult {
	const { effect, progress, linearProgress, layout, unit } = context;
	const visual = identityVisual();
	const pulse = (1 - Math.cos(progress * Math.PI * 2)) / 2;
	const wave = Math.sin(progress * Math.PI * 2);
	if (effect.kind === "typewriter") {
		const revealProgress =
			effect.reveal === "step" ? (progress > 0 ? 1 : 0) : progress;
		visual.opacity = effect.reveal === "step" ? revealProgress : progress;
		if (effect.reveal === "wipe") {
			visual.opacity = progress > 0 ? 1 : 0;
			visual.mask = {
				direction: "right",
				progress,
				featherPx: Math.max(1, layout.fontSize * 0.04),
			};
		}
		return { visual, decorations: [] };
	}
	if (effect.kind === "fade") {
		visual.opacity = lerp({
			from: 1,
			to: effect.minimumOpacity,
			progress: pulse,
		});
	}
	if (effect.kind === "slide" || effect.kind === "blur") {
		const { direction, distance } = effect;
		if (direction && distance) {
			const vector = directionVector({ direction });
			const pixels = resolveDistance({ distance, layout });
			visual.translateX = vector.x * pixels * wave;
			visual.translateY = vector.y * pixels * wave;
		}
		if (effect.kind === "blur") visual.blurPx = effect.radiusPx * pulse;
		if (effect.fade) visual.opacity = 1 - pulse * 0.25;
	}
	if (effect.kind === "rotate") {
		visual.rotationDeg = effect.degrees * progress;
	}
	if (effect.kind === "scale") {
		const scale = lerp({
			from: 1,
			to: effect.hiddenScale,
			progress: pulse,
		});
		visual.scaleX = scale;
		visual.scaleY = scale;
		if (effect.fade) visual.opacity = 1 - pulse * 0.2;
	}
	if (effect.kind === "bounce") {
		const vector = directionVector({ direction: effect.direction });
		const pixels = resolveDistance({ distance: effect.distance, layout });
		visual.translateX = vector.x * pixels * pulse;
		visual.translateY = vector.y * pixels * pulse;
		const scale = lerp({
			from: 1,
			to: effect.hiddenScale,
			progress: pulse * 0.35,
		});
		visual.scaleX = scale;
		visual.scaleY = scale;
	}
	if (effect.kind === "orbit") {
		const sign = effect.rotation === "clockwise" ? 1 : -1;
		const angle = sign * progress * Math.PI * 2 * effect.turns;
		const radius = resolveDistance({ distance: effect.radius, layout });
		visual.translateX = radius * (Math.cos(angle) - 1);
		visual.translateY = radius * Math.sin(angle);
		visual.rotationDeg = (angle * 180) / Math.PI;
		if (effect.fade) visual.opacity = 1 - pulse * 0.2;
	}
	if (effect.kind === "laser") {
		visual.blurPx = effect.glowPx * effect.trail * pulse * 0.2;
		return {
			visual,
			decorations: [
				{
					kind: "laser",
					unitIndex: unit.index,
					progress,
					direction: effect.direction,
					color: effect.color,
					thicknessPx: effect.thicknessPx,
					glowPx: effect.glowPx,
				},
			],
		};
	}
	if (effect.kind === "heart") {
		visual.scaleX = 1 + pulse * 0.12;
		visual.scaleY = 1 + pulse * 0.12;
		return {
			visual,
			decorations: heartDecorations({
				effect,
				role: "loop",
				progress: linearProgress,
				unit,
				layout,
			}),
		};
	}
	return { visual, decorations: [] };
}

function edgeVisual({
	context,
}: {
	context: TextAnimationEffectContext;
}): TextAnimationEffectResult {
	const { effect, role, progress, linearProgress, layout, unit } = context;
	const presence = edgePresence({ role, progress });
	const visual = identityVisual();
	if (effect.kind === "typewriter") {
		if (effect.reveal === "step") {
			// Jianying pops a unit in only when its reveal slot completes (and,
			// on exit, keeps it until its removal slot completes).
			visual.opacity = (
				role === "exit"
					? presence > 1e-6
					: presence >= 1 - 1e-6
			)
				? 1
				: 0;
		} else if (effect.reveal === "fade") {
			visual.opacity = presence;
		} else {
			visual.opacity = presence > 0 ? 1 : 0;
			visual.mask = {
				direction: role === "exit" ? "left" : "right",
				progress: presence,
				featherPx: Math.max(1, layout.fontSize * 0.04),
			};
		}
		return { visual, decorations: [] };
	}
	if (effect.kind === "fade") {
		visual.opacity = lerp({
			from: effect.minimumOpacity,
			to: 1,
			progress: presence,
		});
	}
	if (effect.kind === "slide" || effect.kind === "blur") {
		const { direction, distance } = effect;
		if (direction && distance) {
			const vector = directionVector({ direction });
			const pixels = resolveDistance({ distance, layout });
			const multiplier = travelMultiplier({ role, presence, progress });
			visual.translateX = vector.x * pixels * multiplier;
			visual.translateY = vector.y * pixels * multiplier;
		}
		if (effect.kind === "blur")
			visual.blurPx = effect.radiusPx * (1 - presence);
		if (effect.fade) visual.opacity = presence;
	}
	if (effect.kind === "rotate") {
		visual.rotationDeg = effect.degrees * (1 - presence);
		if (effect.travelDirection && effect.distance) {
			const vector = directionVector({ direction: effect.travelDirection });
			const pixels = resolveDistance({ distance: effect.distance, layout });
			const multiplier = travelMultiplier({ role, presence, progress });
			visual.translateX = vector.x * pixels * multiplier;
			visual.translateY = vector.y * pixels * multiplier;
		}
		if (effect.fade) visual.opacity = presence;
	}
	if (effect.kind === "scale") {
		const scale =
			lerp({
				from: effect.hiddenScale,
				to: 1,
				progress: presence,
			}) +
			Math.sin(presence * Math.PI) * effect.overshoot;
		visual.scaleX = scale;
		visual.scaleY = scale;
		if (effect.fade) visual.opacity = presence;
	}
	if (effect.kind === "bounce") {
		const springPresence = springProgress({
			progress: role === "exit" ? 1 - presence : presence,
			...effect.spring,
		});
		const resolvedPresence =
			role === "exit" ? 1 - springPresence : springPresence;
		const vector = directionVector({ direction: effect.direction });
		const pixels = resolveDistance({ distance: effect.distance, layout });
		const multiplier = travelMultiplier({
			role,
			presence: resolvedPresence,
			progress: role === "exit" ? 1 - resolvedPresence : progress,
		});
		visual.translateX = vector.x * pixels * multiplier;
		visual.translateY = vector.y * pixels * multiplier;
		const scale = lerp({
			from: effect.hiddenScale,
			to: 1,
			progress: resolvedPresence,
		});
		visual.scaleX = scale;
		visual.scaleY = scale;
		visual.opacity = clampUnitInterval({ value: resolvedPresence });
	}
	if (effect.kind === "orbit") {
		const sign = effect.rotation === "clockwise" ? 1 : -1;
		const radialProgress = role === "entrance" ? 1 - progress : progress;
		const angle = sign * radialProgress * Math.PI * 2 * effect.turns;
		const radius =
			resolveDistance({ distance: effect.radius, layout }) * radialProgress;
		visual.translateX = Math.cos(angle) * radius;
		visual.translateY = Math.sin(angle) * radius;
		visual.rotationDeg = (angle * 180) / Math.PI;
		if (effect.fade) visual.opacity = presence;
	}
	if (effect.kind === "laser") {
		visual.opacity = effect.fade ? presence : 1;
		visual.mask = {
			direction: role === "exit" ? "left" : effect.direction,
			progress: presence,
			featherPx: effect.trail * effect.glowPx,
		};
		return {
			visual,
			decorations: [
				{
					kind: "laser",
					unitIndex: unit.index,
					progress: role === "exit" ? 1 - progress : progress,
					direction: effect.direction,
					color: effect.color,
					thicknessPx: effect.thicknessPx,
					glowPx: effect.glowPx,
				},
			],
		};
	}
	if (effect.kind === "heart") {
		const vector = directionVector({ direction: effect.direction });
		const pixels = resolveDistance({ distance: effect.distance, layout });
		const multiplier = travelMultiplier({ role, presence, progress });
		visual.translateX = vector.x * pixels * multiplier;
		visual.translateY = vector.y * pixels * multiplier;
		const scale = lerp({
			from: effect.hiddenScale,
			to: 1,
			progress: presence,
		});
		visual.scaleX = scale;
		visual.scaleY = scale;
		visual.opacity = presence;
		return {
			visual,
			decorations: heartDecorations({
				effect,
				role,
				progress: linearProgress,
				unit,
				layout,
			}),
		};
	}
	return { visual, decorations: [] };
}

export function evaluateTextAnimationEffect({
	context,
}: {
	context: TextAnimationEffectContext;
}): TextAnimationEffectResult {
	if (context.role === "loop") return loopVisual({ context });
	return edgeVisual({ context });
}
