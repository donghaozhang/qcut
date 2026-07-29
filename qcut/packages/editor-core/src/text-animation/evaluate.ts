import {
	IDENTITY_TEXT_ANIMATION_VISUAL_STATE,
	type CompiledTextAnimation,
	type CompiledTextAnimationPhase,
	type CompiledTextAnimationUnit,
	type TextAnimationActivePhase,
	type TextAnimationDecorationState,
	type TextAnimationFrameState,
	type TextAnimationLayout,
	type TextAnimationLoopPhase,
	type TextAnimationPhaseBase,
	type TextAnimationUnitState,
	type TextAnimationVisualState,
} from "./model.js";
import { clampUnitInterval, easeTextAnimationProgress } from "./easing.js";
import { evaluateTextAnimationEffect } from "./effect-state.js";
import { segmentText } from "./segmentation.js";

const MAX_DECORATIONS_PER_FRAME = 256;

function identityVisual(): TextAnimationVisualState {
	return { ...IDENTITY_TEXT_ANIMATION_VISUAL_STATE };
}

function composeVisual({
	base,
	overlay,
}: {
	base: TextAnimationVisualState;
	overlay: TextAnimationVisualState;
}): TextAnimationVisualState {
	let mask = base.mask ?? overlay.mask;
	if (base.mask && overlay.mask) {
		mask =
			base.mask.progress <= overlay.mask.progress ? base.mask : overlay.mask;
	}
	const transformOrigin = overlay.transformOrigin ?? base.transformOrigin;
	return {
		opacity: base.opacity * overlay.opacity,
		translateX: base.translateX + overlay.translateX,
		translateY: base.translateY + overlay.translateY,
		scaleX: base.scaleX * overlay.scaleX,
		scaleY: base.scaleY * overlay.scaleY,
		rotationDeg: base.rotationDeg + overlay.rotationDeg,
		blurPx: Math.max(base.blurPx, overlay.blurPx),
		...(mask ? { mask } : {}),
		...(transformOrigin ? { transformOrigin } : {}),
	};
}

function phaseUnitProgress({
	phaseProgress,
	unit,
	unitCount,
	staggerRatio,
}: {
	phaseProgress: number;
	unit: CompiledTextAnimationUnit;
	unitCount: number;
	staggerRatio: number;
}): number {
	const startRatio =
		unitCount <= 1 ? 0 : (unit.rank / (unitCount - 1)) * staggerRatio;
	return clampUnitInterval({
		value: (phaseProgress - startRatio) / Math.max(0.05, 1 - staggerRatio),
	});
}

/**
 * Jianying's typewriter gives every unit an equal slot of the phase and
 * completes unit `rank` at (rank + 1) / (unitCount + 1): nothing is revealed
 * at progress 0 and the final unit lands one slot before the phase ends.
 *
 * With a rhythm table the slots keep the same overall span but take their
 * widths from the cycled weights, reproducing Jianying's human-rhythm typing
 * (fast bursts and long pauses) deterministically.
 */
function typewriterUnitProgress({
	phaseProgress,
	unit,
	unitCount,
	rhythm,
}: {
	phaseProgress: number;
	unit: CompiledTextAnimationUnit;
	unitCount: number;
	rhythm?: readonly number[];
}): number {
	if (rhythm && rhythm.length > 0 && unitCount > 0) {
		let total = 0;
		let before = 0;
		for (let rank = 0; rank < unitCount; rank += 1) {
			const weight = rhythm[rank % rhythm.length];
			total += weight;
			if (rank < unit.rank) before += weight;
		}
		if (total > 0) {
			const span = unitCount / (unitCount + 1);
			const slotStart = (before / total) * span;
			const slotWidth = (rhythm[unit.rank % rhythm.length] / total) * span;
			return clampUnitInterval({
				value: (phaseProgress - slotStart) / Math.max(1e-6, slotWidth),
			});
		}
	}
	return clampUnitInterval({
		value: phaseProgress * (unitCount + 1) - unit.rank,
	});
}

function appendDecorations({
	target,
	source,
}: {
	target: TextAnimationDecorationState[];
	source: TextAnimationDecorationState[];
}): void {
	if (target.length >= MAX_DECORATIONS_PER_FRAME) return;
	target.push(...source.slice(0, MAX_DECORATIONS_PER_FRAME - target.length));
}

function applyPhase({
	phase,
	role,
	phaseProgress,
	layout,
	container,
	units,
	decorations,
}: {
	phase: CompiledTextAnimationPhase<TextAnimationPhaseBase>;
	role: TextAnimationActivePhase;
	phaseProgress: number;
	layout: TextAnimationLayout;
	container: TextAnimationVisualState;
	units: TextAnimationUnitState[];
	decorations: TextAnimationDecorationState[];
}): TextAnimationVisualState {
	if (phase.units.length === 0) return container;
	if (phase.config.target === "textAndBackground") {
		const unit = phase.units[0];
		const progress = easeTextAnimationProgress({
			progress: phaseProgress,
			easing: phase.config.timing.easing,
		});
		const result = evaluateTextAnimationEffect({
			context: {
				effect: phase.config.effect,
				role,
				progress,
				linearProgress: phaseProgress,
				layout,
				unit,
			},
		});
		appendDecorations({ target: decorations, source: result.decorations });
		return composeVisual({ base: container, overlay: result.visual });
	}

	const isTypewriter = phase.config.effect.kind === "typewriter";
	for (const unit of phase.units) {
		const rawProgress = isTypewriter
			? typewriterUnitProgress({
					phaseProgress,
					unit,
					unitCount: phase.units.length,
					rhythm:
						phase.config.effect.kind === "typewriter"
							? phase.config.effect.rhythm
							: undefined,
				})
			: phaseUnitProgress({
					phaseProgress,
					unit,
					unitCount: phase.units.length,
					staggerRatio: phase.config.sequence.staggerRatio,
				});
		const progress = easeTextAnimationProgress({
			progress: rawProgress,
			easing: phase.config.timing.easing,
		});
		const result = evaluateTextAnimationEffect({
			context: {
				effect: phase.config.effect,
				role,
				progress,
				linearProgress: rawProgress,
				layout,
				unit,
			},
		});
		for (
			let graphemeIndex = unit.graphemeStart;
			graphemeIndex < unit.graphemeEnd;
			graphemeIndex++
		) {
			const target = units[graphemeIndex];
			if (!target) continue;
			target.visual = composeVisual({
				base: target.visual,
				overlay: result.visual,
			});
		}
		appendDecorations({ target: decorations, source: result.decorations });
	}
	return container;
}

function loopProgress({
	phase,
	frame,
	fps,
}: {
	phase: CompiledTextAnimationPhase<TextAnimationLoopPhase>;
	frame: number;
	fps: number;
}): number | null {
	const gapFrames = Math.max(0, Math.round(phase.config.repeat.gap * fps));
	const cycleFrames = phase.durationFrames + gapFrames;
	const phaseOffsetFrames = Math.round(
		phase.config.repeat.phaseOffset * phase.durationFrames
	);
	const elapsed = frame - phase.startFrame + phaseOffsetFrames;
	if (elapsed < 0 || cycleFrames <= 0) return null;
	const cycle = Math.floor(elapsed / cycleFrames);
	if (
		phase.config.repeat.count !== undefined &&
		cycle >= phase.config.repeat.count
	) {
		return null;
	}
	const withinCycle = elapsed % cycleFrames;
	if (withinCycle >= phase.durationFrames) return null;
	const progress = withinCycle / phase.durationFrames;
	return phase.config.repeat.mode === "alternate" && cycle % 2 === 1
		? 1 - progress
		: progress;
}

function cursorBoundary({
	phase,
	progressedUnits,
	role,
}: {
	phase: CompiledTextAnimationPhase<TextAnimationPhaseBase>;
	progressedUnits: readonly CompiledTextAnimationUnit[];
	role: TextAnimationActivePhase;
}): number {
	if (role === "exit") {
		if (progressedUnits.length === 0) {
			return Math.max(...phase.units.map((unit) => unit.graphemeEnd));
		}
		return Math.min(...progressedUnits.map((unit) => unit.graphemeStart));
	}
	const latest = progressedUnits.reduce<CompiledTextAnimationUnit | null>(
		(current, candidate) =>
			!current || candidate.rank > current.rank ? candidate : current,
		null
	);
	return latest?.graphemeEnd ?? 0;
}

function cursorDecoration({
	phase,
	phaseProgress,
	frame,
	fps,
	role,
	blinking,
}: {
	phase: CompiledTextAnimationPhase<TextAnimationPhaseBase>;
	phaseProgress: number;
	frame: number;
	fps: number;
	role: TextAnimationActivePhase;
	/** Jianying keeps the cursor solid while typing; it only blinks afterwards. */
	blinking: boolean;
}): TextAnimationDecorationState | null {
	const effect = phase.config.effect;
	if (
		effect.kind !== "typewriter" ||
		!effect.cursor ||
		phase.units.length === 0
	) {
		return null;
	}
	const progressedUnits = phase.units.filter((unit) => {
		const rawProgress = typewriterUnitProgress({
			phaseProgress,
			unit,
			unitCount: phase.units.length,
			rhythm: effect.rhythm,
		});
		const progress = easeTextAnimationProgress({
			progress: rawProgress,
			easing: phase.config.timing.easing,
		});
		return effect.reveal === "step" ? progress >= 1 - 1e-6 : progress > 0;
	});
	const afterGrapheme = cursorBoundary({ phase, progressedUnits, role });
	const blinkFrames = Math.max(1, Math.round(effect.cursor.blinkPeriod * fps));
	const phaseElapsedFrame = Math.max(0, frame - phase.startFrame);
	const opacity = blinking
		? Math.floor(phaseElapsedFrame / blinkFrames) % 2 === 0
			? 1
			: 0
		: 1;
	return {
		kind: "cursor",
		afterGrapheme,
		text: effect.cursor.text,
		...(effect.cursor.color ? { color: effect.cursor.color } : {}),
		opacity,
	};
}

function createInitialUnits({
	content,
}: {
	content: string;
}): TextAnimationUnitState[] {
	return segmentText({ content, unit: "grapheme" }).map((_, index) => ({
		index,
		graphemeStart: index,
		graphemeEnd: index + 1,
		visual: identityVisual(),
	}));
}

export function evaluateTextAnimationFrame({
	compiled,
	frame,
	layout,
}: {
	compiled: CompiledTextAnimation;
	frame: number;
	layout: TextAnimationLayout;
}): TextAnimationFrameState {
	const safeFrame = Number.isFinite(frame) ? Math.trunc(frame) : 0;
	const render =
		safeFrame >= compiled.visibleStartFrame &&
		safeFrame < compiled.visibleEndFrame &&
		compiled.content.trim().length > 0;
	const units = createInitialUnits({ content: compiled.content });
	const activePhases: TextAnimationActivePhase[] = [];
	const decorations: TextAnimationDecorationState[] = [];
	let container = identityVisual();
	if (!render) {
		return {
			frame: safeFrame,
			render: false,
			activePhases,
			container,
			units,
			decorations,
		};
	}

	if (compiled.entrance && safeFrame < compiled.entrance.endFrame) {
		const progress = clampUnitInterval({
			value:
				(safeFrame - compiled.entrance.startFrame) /
				compiled.entrance.durationFrames,
		});
		activePhases.push("entrance");
		container = applyPhase({
			phase: compiled.entrance,
			role: "entrance",
			phaseProgress: progress,
			layout,
			container,
			units,
			decorations,
		});
		const cursor = cursorDecoration({
			phase: compiled.entrance,
			phaseProgress: progress,
			frame: safeFrame,
			fps: compiled.fps,
			role: "entrance",
			blinking: false,
		});
		if (cursor) decorations.push(cursor);
	} else if (
		compiled.entrance?.config.effect.kind === "typewriter" &&
		compiled.entrance.config.effect.cursor?.persist &&
		(!compiled.exit || safeFrame < compiled.exit.startFrame)
	) {
		const cursor = cursorDecoration({
			phase: compiled.entrance,
			phaseProgress: 1,
			frame: safeFrame,
			fps: compiled.fps,
			role: "entrance",
			blinking: true,
		});
		if (cursor) decorations.push(cursor);
	}

	if (
		compiled.loop &&
		safeFrame >= compiled.loop.startFrame &&
		safeFrame < compiled.loop.endFrame
	) {
		const progress = loopProgress({
			phase: compiled.loop,
			frame: safeFrame,
			fps: compiled.fps,
		});
		if (progress !== null) {
			activePhases.push("loop");
			container = applyPhase({
				phase: compiled.loop,
				role: "loop",
				phaseProgress: progress,
				layout,
				container,
				units,
				decorations,
			});
			const cursor = cursorDecoration({
				phase: compiled.loop,
				phaseProgress: progress,
				frame: safeFrame,
				fps: compiled.fps,
				role: "loop",
				blinking: false,
			});
			if (cursor) decorations.push(cursor);
		}
	}

	if (compiled.exit && safeFrame >= compiled.exit.startFrame) {
		const progress = clampUnitInterval({
			value:
				(safeFrame - compiled.exit.startFrame) / compiled.exit.durationFrames,
		});
		activePhases.push("exit");
		container = applyPhase({
			phase: compiled.exit,
			role: "exit",
			phaseProgress: progress,
			layout,
			container,
			units,
			decorations,
		});
		const cursor = cursorDecoration({
			phase: compiled.exit,
			phaseProgress: progress,
			frame: safeFrame,
			fps: compiled.fps,
			role: "exit",
			blinking: false,
		});
		if (cursor) decorations.push(cursor);
	}

	return {
		frame: safeFrame,
		render: true,
		activePhases,
		container,
		units,
		decorations: decorations.slice(0, MAX_DECORATIONS_PER_FRAME),
	};
}
