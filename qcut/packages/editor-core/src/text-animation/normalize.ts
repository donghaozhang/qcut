import type { TextElement } from "../types/timeline.js";
import {
	TEXT_ANIMATION_SCHEMA_VERSION,
	type TextAnimationEdgePhase,
	type TextAnimationEffect,
	type TextAnimationLoopPhase,
	type TextAnimationPhaseBase,
	type TextAnimationsV1,
} from "./model.js";
import {
	asRecord,
	finiteOr,
	normalizePresetRef,
	normalizeSequence,
	normalizeTiming,
	numberInRange,
	oneOf,
	stableSeed,
	TEXT_ANIMATION_TARGETS,
} from "./normalization-helpers.js";
import { normalizeTextAnimationEffect } from "./normalize-effect.js";

export type TextAnimationNormalizationSource =
	| "canonical"
	| "legacy"
	| "none"
	| "unsupported";

export interface TextAnimationNormalizationIssue {
	code:
		| "unsupported-schema"
		| "invalid-phase"
		| "unknown-effect"
		| "legacy-scale-preserved-as-fade"
		| "unknown-legacy-animation";
	path: string;
}

export interface TextAnimationNormalizationResult {
	animation: TextAnimationsV1 | null;
	source: TextAnimationNormalizationSource;
	issues: TextAnimationNormalizationIssue[];
}

function normalizePhaseBase({
	value,
	elementId,
	fps,
	path,
	issues,
}: {
	value: unknown;
	elementId: string;
	fps: number;
	path: string;
	issues: TextAnimationNormalizationIssue[];
}): TextAnimationPhaseBase | null {
	const record = asRecord({ value });
	if (!record) {
		issues.push({ code: "invalid-phase", path });
		return null;
	}
	const effect = normalizeTextAnimationEffect({ value: record.effect });
	if (!effect) {
		issues.push({ code: "unknown-effect", path: `${path}.effect` });
		return null;
	}
	let sequence = normalizeSequence({
		value: record.sequence,
		elementId,
	});
	let target = oneOf({
		value: record.target,
		values: TEXT_ANIMATION_TARGETS,
		fallback: "text",
	});
	if (effect.kind === "typewriter") {
		sequence = { ...sequence, unit: "grapheme" };
		target = "text";
	}
	if (effect.kind === "shatter" || effect.kind === "burst") {
		// Shatter rasterises the whole element and burst emits from the layout
		// centre, so neither has a per-unit meaning: a persisted "text" target
		// would drop the shatter entirely or duplicate every particle.
		target = "textAndBackground";
	}
	if (target === "textAndBackground") {
		sequence = { ...sequence, unit: "all" };
	}
	const sourcePreset = normalizePresetRef({ value: record.sourcePreset });
	return {
		...(sourcePreset ? { sourcePreset } : {}),
		timing: normalizeTiming({ value: record.timing, fps }),
		sequence,
		target,
		effect,
	};
}

function normalizeEdgePhase({
	value,
	elementId,
	fps,
	path,
	issues,
}: {
	value: unknown;
	elementId: string;
	fps: number;
	path: string;
	issues: TextAnimationNormalizationIssue[];
}): TextAnimationEdgePhase | null {
	return normalizePhaseBase({ value, elementId, fps, path, issues });
}

function normalizeLoopPhase({
	value,
	elementId,
	fps,
	issues,
}: {
	value: unknown;
	elementId: string;
	fps: number;
	issues: TextAnimationNormalizationIssue[];
}): TextAnimationLoopPhase | null {
	const base = normalizePhaseBase({
		value,
		elementId,
		fps,
		path: "textAnimations.loop",
		issues,
	});
	if (!base) return null;
	const repeat = asRecord({ value: asRecord({ value })?.repeat });
	const rawCount = finiteOr({ value: repeat?.count, fallback: 0 });
	return {
		...base,
		repeat: {
			mode: repeat?.mode === "alternate" ? "alternate" : "restart",
			...(rawCount > 0
				? { count: Math.min(10_000, Math.max(1, Math.trunc(rawCount))) }
				: {}),
			gap: numberInRange({
				value: repeat?.gap,
				fallback: 0,
				minimum: 0,
				maximum: 60,
			}),
			phaseOffset: numberInRange({
				value: repeat?.phaseOffset,
				fallback: 0,
				minimum: 0,
				maximum: 1,
			}),
		},
	};
}

function normalizeCanonical({
	value,
	elementId,
	fps,
	issues,
}: {
	value: Record<string, unknown>;
	elementId: string;
	fps: number;
	issues: TextAnimationNormalizationIssue[];
}): TextAnimationsV1 {
	const entrance =
		value.entrance === undefined
			? null
			: normalizeEdgePhase({
					value: value.entrance,
					elementId,
					fps,
					path: "textAnimations.entrance",
					issues,
				});
	const exit =
		value.exit === undefined
			? null
			: normalizeEdgePhase({
					value: value.exit,
					elementId,
					fps,
					path: "textAnimations.exit",
					issues,
				});
	const loop =
		value.loop === undefined
			? null
			: normalizeLoopPhase({
					value: value.loop,
					elementId,
					fps,
					issues,
				});
	return {
		schemaVersion: TEXT_ANIMATION_SCHEMA_VERSION,
		...(entrance ? { entrance } : {}),
		...(exit ? { exit } : {}),
		...(loop ? { loop } : {}),
	};
}

function legacyPhase({
	element,
	type,
	fps,
}: {
	element: TextElement;
	type: "fade" | "slide-up" | "slide-left";
	fps: number;
}): TextAnimationEdgePhase {
	const effect: TextAnimationEffect =
		type === "fade"
			? { kind: "fade", minimumOpacity: 0 }
			: {
					kind: "slide",
					direction: type === "slide-up" ? "up" : "left",
					distance:
						type === "slide-up"
							? { value: 80, unit: "px" }
							: { value: 120, unit: "px" },
					fade: true,
				};
	return {
		timing: {
			duration: numberInRange({
				value: element.animationDuration,
				fallback: 0.6,
				minimum: 1 / fps,
				maximum: 60,
			}),
			delay: numberInRange({
				value: element.animationDelay,
				fallback: 0,
				minimum: 0,
				maximum: 60,
			}),
			easing: "linear",
		},
		sequence: {
			unit: "all",
			order: "forward",
			staggerRatio: 0,
			seed: stableSeed({ value: element.id }),
		},
		target: "textAndBackground",
		effect,
	};
}

export function normalizeTextAnimations({
	element,
	fps = 30,
}: {
	element: TextElement;
	fps?: number;
}): TextAnimationNormalizationResult {
	const safeFps = numberInRange({
		value: fps,
		fallback: 30,
		minimum: 1,
		maximum: 240,
	});
	const canonical = asRecord({ value: element.textAnimations });
	if (canonical) {
		if (canonical.schemaVersion !== TEXT_ANIMATION_SCHEMA_VERSION) {
			return {
				animation: null,
				source: "unsupported",
				issues: [
					{
						code: "unsupported-schema",
						path: "textAnimations.schemaVersion",
					},
				],
			};
		}
		const issues: TextAnimationNormalizationIssue[] = [];
		return {
			animation: normalizeCanonical({
				value: canonical,
				elementId: element.id,
				fps: safeFps,
				issues,
			}),
			source: "canonical",
			issues,
		};
	}

	const legacyType = element.animationType as string | undefined;
	if (!legacyType || legacyType === "none") {
		return { animation: null, source: "none", issues: [] };
	}
	const issues: TextAnimationNormalizationIssue[] = [];
	let type: "fade" | "slide-up" | "slide-left";
	if (
		legacyType === "fade" ||
		legacyType === "slide-up" ||
		legacyType === "slide-left"
	) {
		type = legacyType;
	} else if (legacyType === "scale") {
		type = "fade";
		issues.push({
			code: "legacy-scale-preserved-as-fade",
			path: "animationType",
		});
	} else {
		return {
			animation: null,
			source: "none",
			issues: [{ code: "unknown-legacy-animation", path: "animationType" }],
		};
	}
	return {
		animation: {
			schemaVersion: TEXT_ANIMATION_SCHEMA_VERSION,
			entrance: legacyPhase({ element, type, fps: safeFps }),
		},
		source: "legacy",
		issues,
	};
}

export function isCanonicalTextAnimations({
	value,
}: {
	value: unknown;
}): boolean {
	return asRecord({ value })?.schemaVersion === TEXT_ANIMATION_SCHEMA_VERSION;
}
