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
import {
	clampUnitInterval,
	easeTextAnimationProgress,
	springProgress,
} from "./easing.js";

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

function loopFraction({ value }: { value: number }): number {
	return value - Math.floor(value);
}

function smoothstep({ progress }: { progress: number }): number {
	return progress * progress * (3 - 2 * progress);
}

function trianglePulse({ progress }: { progress: number }): number {
	const cycleProgress = loopFraction({ value: progress });
	return cycleProgress <= 0.5 ? cycleProgress * 2 : (1 - cycleProgress) * 2;
}

function oscillationPhase({
	progress,
	cycles,
	phaseEasing,
}: {
	progress: number;
	cycles: number;
	phaseEasing: "linear" | "smoothstep";
}): number {
	const cycleProgress = loopFraction({ value: progress * cycles });
	if (phaseEasing === "linear") return cycleProgress;
	const half = Math.floor(cycleProgress * 2);
	const halfProgress = loopFraction({ value: cycleProgress * 2 });
	return (half + smoothstep({ progress: halfProgress })) / 2;
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

function unitHorizontalProgress({
	unit,
	layout,
}: {
	unit: CompiledTextAnimationUnit;
	layout: TextAnimationLayout;
}): number {
	const bounds = unitBounds({ unit, layout });
	return clampUnitInterval({
		value:
			(bounds.x + bounds.width / 2 - layout.bounds.x) /
			Math.max(Number.EPSILON, layout.bounds.width),
	});
}

function spatialWaveMovement({
	effect,
	progress,
	unit,
	layout,
}: {
	effect: Extract<TextAnimationEffect, { kind: "bounce" }>;
	progress: number;
	unit: CompiledTextAnimationUnit;
	layout: TextAnimationLayout;
}): number | null {
	if (!effect.spatialWave) return null;
	const bounds = unitBounds({ unit, layout });
	const centerX = bounds.x + bounds.width / 2;
	const horizontalProgress =
		(centerX - layout.bounds.x) / Math.max(Number.EPSILON, layout.bounds.width);
	const phase =
		effect.spatialWave.spatialCycles * horizontalProgress -
		progress +
		effect.spatialWave.phaseOffset;
	return Math.sin(phase * Math.PI * 2);
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

const BURST_BASE_LIFE = 0.62;

function burstDecorations({
	effect,
	progress,
	unit,
	layout,
}: {
	effect: Extract<TextAnimationEffect, { kind: "burst" }>;
	progress: number;
	unit: CompiledTextAnimationUnit;
	layout: TextAnimationLayout;
}): TextAnimationDecorationState[] {
	const originX = layout.bounds.x + layout.bounds.width / 2;
	const originY = layout.bounds.y + layout.bounds.height / 2;
	const speedPx = resolveDistance({ distance: effect.speed, layout });
	const gravityPx = resolveDistance({ distance: effect.gravity, layout });
	const items: Extract<
		TextAnimationDecorationState,
		{ kind: "particles" }
	>["items"] = [];
	for (let particleIndex = 0; particleIndex < effect.count; particleIndex++) {
		const noise = (channel: number) =>
			seededValue({
				seed: effect.seed,
				unitIndex: unit.index,
				particleIndex,
				channel,
			});
		// Closed-form ballistics: every value below is a pure function of the
		// phase progress, mirroring the LumiDust prefab schema (pLifeRandom,
		// pSizeRandom, pSizeOverLife/pOpacityOverLife, gravity).
		const birth = noise(0) * 0.35;
		const life =
			BURST_BASE_LIFE * (1 + (noise(1) - 0.5) * 2 * effect.lifeRandom);
		const age = (progress - birth) / Math.max(Number.EPSILON, life);
		if (age <= 0 || age >= 1) continue;
		const angleRad =
			((effect.directionDeg + (noise(2) - 0.5) * effect.spreadDeg) * Math.PI) /
			180;
		const travel = speedPx * (0.6 + 0.8 * noise(3)) * age;
		const flutterSway =
			Math.sin(Math.PI * 2 * (age * 2 + noise(4))) *
			effect.flutter *
			layout.fontSize *
			0.4;
		const fadeIn = clampUnitInterval({ value: age / 0.12 });
		const fadeOut = clampUnitInterval({ value: (1 - age) / 0.3 });
		items.push({
			x: originX + Math.sin(angleRad) * travel + flutterSway,
			y: originY - Math.cos(angleRad) * travel + gravityPx * age * age,
			rotationDeg:
				(noise(5) - 0.5) * 720 * age +
				Math.sin(Math.PI * 2 * (age * 2.5 + noise(6))) * effect.flutter * 65,
			sizePx:
				layout.fontSize *
				effect.sizeEm *
				(1 + (noise(7) - 0.5) * 2 * effect.sizeRandom) *
				clampUnitInterval({ value: age / 0.08 }),
			opacity: Math.min(fadeIn, fadeOut),
			colorIndex: Math.min(
				effect.palette.length - 1,
				Math.floor(noise(8) * effect.palette.length)
			),
		});
	}
	if (items.length === 0) return [];
	return [
		{ kind: "particles", shape: effect.shape, palette: effect.palette, items },
	];
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
		if (effect.oscillation) {
			const phase = oscillationPhase({
				progress,
				cycles: effect.oscillation.cycles,
				phaseEasing: effect.oscillation.phaseEasing,
			});
			visual.rotationDeg = effect.degrees * Math.cos(phase * Math.PI * 2);
			visual.transformOrigin = effect.oscillation.pivot;
		} else {
			visual.rotationDeg = effect.degrees * progress;
		}
	}
	if (effect.kind === "scale") {
		const pulseProgress = effect.pulse
			? trianglePulse({ progress: progress * effect.pulse.cycles })
			: pulse;
		const shapedPulse =
			effect.pulse?.easing === "smoothstep"
				? smoothstep({ progress: pulseProgress })
				: pulseProgress;
		const scale = lerp({
			from: 1,
			to: effect.hiddenScale,
			progress: shapedPulse,
		});
		const axis = effect.axis ?? "uniform";
		if (axis !== "y") visual.scaleX = scale;
		if (axis !== "x") visual.scaleY = scale;
		if (effect.fade) visual.opacity = 1 - shapedPulse * 0.2;
	}
	if (effect.kind === "bounce") {
		const vector = directionVector({ direction: effect.direction });
		const pixels = resolveDistance({ distance: effect.distance, layout });
		const movement =
			spatialWaveMovement({ effect, progress, unit, layout }) ?? pulse;
		visual.translateX = vector.x * pixels * movement;
		visual.translateY = vector.y * pixels * movement;
		const scale = lerp({
			from: 1,
			to: effect.hiddenScale,
			progress: (effect.spatialWave ? 0 : pulse) * 0.35,
		});
		visual.scaleX = scale;
		visual.scaleY = scale;
	}
	if (effect.kind === "flip") {
		// Jianying's 空间翻转: rotate every unit rigidly about the layout
		// center (tilt = cos phase) while a position-keyed scale gradient
		// (sin phase) fakes the perspective of the plane yawing toward and
		// away from the viewer.
		const swing = Math.sin(progress * Math.PI * 2);
		const tilt = Math.cos(progress * Math.PI * 2);
		const angle = (effect.maxAngleDeg * Math.PI) / 180;
		const theta = angle * tilt;
		const bounds = unitBounds({ unit, layout });
		const offsetX =
			bounds.x + bounds.width / 2 - (layout.bounds.x + layout.bounds.width / 2);
		const offsetY =
			bounds.y +
			bounds.height / 2 -
			(layout.bounds.y + layout.bounds.height / 2);
		visual.translateX =
			offsetX * Math.cos(theta) - offsetY * Math.sin(theta) - offsetX;
		visual.translateY =
			offsetX * Math.sin(theta) + offsetY * Math.cos(theta) - offsetY;
		visual.rotationDeg = effect.maxAngleDeg * tilt;
		const lineRatio =
			layout.bounds.width > 0 ? offsetX / layout.bounds.width : 0;
		const scale = 1 + effect.perspective * lineRatio * swing * 2;
		visual.scaleX = scale;
		visual.scaleY = scale;
	}
	if (effect.kind === "jitter") {
		// Ported from Jianying's stepped shake: local time is floored into
		// `steps` poses per cycle, then each unit's offset comes from a product
		// of sines phase-shifted by its 1-based rank. The constants are theirs.
		const step = 1 / Math.max(1, effect.steps);
		const quantized = Math.floor(progress / step) * step;
		const rank = unit.index + 1;
		const swingX = Math.sin(quantized * Math.PI * 2);
		const swingY = Math.cos(quantized * Math.PI * 2);
		visual.translateX =
			Math.cos(24.8 * swingX + 7.9 * rank) *
			Math.sin(swingX * Math.PI * 2 + rank) *
			effect.amplitudeX *
			layout.fontSize;
		visual.translateY =
			Math.sin(19.1 * swingY + 33.6 * rank) *
			Math.cos(swingY * Math.PI * 2 - rank) *
			effect.amplitudeY *
			layout.fontSize;
	}
	if (effect.kind === "arc") {
		// Jianying's 上弧: the line bows into an arc (peak at the center) and
		// relaxes each cycle; the ends tilt outward with the arc's slope.
		const wave = (1 - Math.cos(progress * Math.PI * 2)) / 2;
		const across = unitHorizontalProgress({ unit, layout });
		visual.translateY =
			-effect.riseEm * layout.fontSize * Math.sin(Math.PI * across) * wave;
		visual.rotationDeg = effect.tiltDeg * Math.cos(Math.PI * across) * wave;
	}
	if (effect.kind === "squeeze") {
		// Jianying's 波浪挤压: a squash wave travels through the line, with a
		// touch of horizontal spread to keep the glyph's area believable.
		const across = unitHorizontalProgress({ unit, layout });
		const crest =
			(1 + Math.sin(Math.PI * 2 * (effect.spatialCycles * across - progress))) /
			2;
		visual.scaleY = 1 - effect.amount * crest;
		visual.scaleX = 1 + effect.amount * 0.3 * crest;
	}
	if (effect.kind === "fold") {
		// Jianying's 折叠: units fold flat and reopen, phase-stepped by rank
		// so the fold ripples along the line.
		const phase =
			progress * Math.PI * 2 +
			unit.rank * ((effect.phaseStepDeg * Math.PI) / 180);
		visual.scaleX = Math.max(effect.minimumScale, Math.abs(Math.cos(phase)));
	}
	if (effect.kind === "orbit") {
		const sign = effect.rotation === "clockwise" ? 1 : -1;
		const angle = sign * progress * Math.PI * 2 * effect.turns;
		const radius = resolveDistance({ distance: effect.radius, layout });
		if (effect.ring) {
			// Jianying's 环绕: every unit rides the same centered circle
			// (x = sin, y = cos), so first cancel the unit's own layout
			// offset, then place it by its wrapped phase angle.
			const bounds = unitBounds({ unit, layout });
			const centerOffsetX =
				layout.bounds.x +
				layout.bounds.width / 2 -
				(bounds.x + bounds.width / 2);
			const centerOffsetY =
				layout.bounds.y +
				layout.bounds.height / 2 -
				(bounds.y + bounds.height / 2);
			visual.translateX = centerOffsetX + radius * Math.sin(angle);
			visual.translateY = centerOffsetY + radius * Math.cos(angle);
			if (effect.spin !== false) {
				visual.rotationDeg = (-angle * 180) / Math.PI;
			}
		} else {
			visual.translateX = radius * (Math.cos(angle) - 1);
			visual.translateY = radius * Math.sin(angle);
			if (effect.spin !== false) {
				visual.rotationDeg = (angle * 180) / Math.PI;
			}
		}
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
	if (effect.kind === "burst") {
		return {
			visual,
			decorations: burstDecorations({
				effect,
				progress: linearProgress,
				unit,
				layout,
			}),
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
		const axis = effect.axis ?? "uniform";
		if (axis !== "y") visual.scaleX = scale;
		if (axis !== "x") visual.scaleY = scale;
		if (effect.shakeEm) {
			// Jianying's 收缩震动: the shrink rides a quantized shake, reusing
			// the stepped-pose constants from their 颤抖.
			const step =
				Math.floor((role === "exit" ? 1 - presence : presence) * 8) / 8;
			const rank = unit.index + 1;
			visual.translateX +=
				Math.cos(24.8 * step + 7.9 * rank) * effect.shakeEm * layout.fontSize;
			visual.translateY +=
				Math.sin(19.1 * step + 33.6 * rank) *
				effect.shakeEm *
				layout.fontSize *
				0.7;
			// The captured reference renders the shake as motion-blur smear.
			visual.blurPx = Math.max(
				visual.blurPx,
				effect.shakeEm * layout.fontSize * 0.6
			);
		}
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
	if (effect.kind === "spiral") {
		// Jianying's 螺旋下降: units corkscrew outward while dropping away,
		// accelerating into the fall.
		const radialProgress = role === "entrance" ? 1 - progress : progress;
		const angle = Math.PI * 2 * effect.turns * radialProgress;
		const radius =
			resolveDistance({ distance: effect.radius, layout }) * radialProgress;
		visual.translateX = Math.cos(angle) * radius;
		visual.translateY =
			Math.sin(angle) * radius +
			resolveDistance({ distance: effect.drop, layout }) * radialProgress ** 2;
		visual.rotationDeg = (angle * 180) / Math.PI;
		if (effect.fade) visual.opacity = presence;
	}
	if (effect.kind === "shatter") {
		// Ported from LumiDust: the renderer runs the tile pass; the engine
		// resolves parameters and the sweep progress (exits dissolve forward,
		// entrances assemble in reverse).
		visual.shatter = {
			progress: role === "entrance" ? 1 - progress : progress,
			tilePx: effect.tilePx,
			distortionPx: effect.distortion * layout.fontSize,
			gravityPx: resolveDistance({ distance: effect.gravity, layout }),
			gravityRotDeg: effect.gravityRotDeg,
			front: effect.front,
			frontRotDeg: effect.frontRotDeg,
			feather: effect.feather,
			seed: 1,
		};
	}
	if (effect.kind === "tumble") {
		// Jianying's RotateFlyOut: cubic-in shrink to zero with spin and
		// drop; the glyph vanishes by scale, not by fading.
		const out = role === "entrance" ? 1 - progress : progress;
		const drive = out ** 3;
		const scale = Math.max(0, 1 - drive);
		visual.scaleX = scale;
		visual.scaleY = scale;
		visual.rotationDeg = effect.spinDeg * drive;
		visual.translateY =
			resolveDistance({ distance: effect.drop, layout }) * drive;
		if (effect.fade) visual.opacity = presence;
	}
	if (effect.kind === "scatter") {
		// Seeded dispersal: each unit picks its own direction and spin, and
		// with flicker enabled it strobes while it flies (Jianying's 闪烁散开
		// vs 随机飞出).
		const dispersal = role === "entrance" ? 1 - progress : progress;
		const heading =
			seededValue({
				seed: effect.seed,
				unitIndex: unit.index,
				particleIndex: 0,
				channel: 0,
			}) *
			Math.PI *
			2;
		// Jianying holds the character near home through the first half and
		// only drifts late; the strobe carries the early phase.
		const drift = Math.max(0, dispersal - 0.5) * 2;
		const travel =
			resolveDistance({ distance: effect.distance, layout }) * drift ** 2;
		visual.translateX = Math.cos(heading) * travel;
		visual.translateY = Math.sin(heading) * travel;
		visual.rotationDeg =
			(seededValue({
				seed: effect.seed,
				unitIndex: unit.index,
				particleIndex: 0,
				channel: 1,
			}) -
				0.5) *
			2 *
			effect.rotateDeg *
			dispersal;
		const strobe = effect.flicker
			? Math.sin(
					dispersal * Math.PI * 26 +
						seededValue({
							seed: effect.seed,
							unitIndex: unit.index,
							particleIndex: 0,
							channel: 2,
						}) *
							Math.PI *
							2
				) > -0.35
				? 1
				: 0.3
			: 1;
		// Brightness stays full until the late drift; the strobe reads as
		// flicker rather than a fade-out.
		visual.opacity = clampUnitInterval({
			value: (1 - drift ** 2) * strobe,
		});
	}
	if (effect.kind === "orbit") {
		const sign = effect.rotation === "clockwise" ? 1 : -1;
		const radialProgress = role === "entrance" ? 1 - progress : progress;
		const angle = sign * radialProgress * Math.PI * 2 * effect.turns;
		const radius =
			resolveDistance({ distance: effect.radius, layout }) * radialProgress;
		visual.translateX = Math.cos(angle) * radius;
		visual.translateY = Math.sin(angle) * radius;
		if (effect.spin !== false) {
			visual.rotationDeg = (angle * 180) / Math.PI;
		}
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
	if (effect.kind === "burst") {
		return {
			visual,
			decorations: burstDecorations({
				effect,
				progress: role === "exit" ? 1 - linearProgress : linearProgress,
				unit,
				layout,
			}),
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
