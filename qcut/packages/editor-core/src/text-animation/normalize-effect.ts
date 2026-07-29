import type { TextAnimationEffect } from "./model.js";
import {
	asRecord,
	normalizeDistance,
	normalizeEasing,
	normalizeSpring,
	numberInRange,
	oneOf,
	TEXT_ANIMATION_DIRECTIONS,
} from "./normalization-helpers.js";

function normalizeLoopCycles({ value }: { value: unknown }): number {
	return Math.trunc(
		numberInRange({
			value,
			fallback: 1,
			minimum: 1,
			maximum: 100,
		})
	);
}

export function normalizeTextAnimationEffect({
	value,
}: {
	value: unknown;
}): TextAnimationEffect | null {
	const record = asRecord({ value });
	if (!record || typeof record.kind !== "string") return null;
	const direction = () =>
		oneOf({
			value: record.direction,
			values: TEXT_ANIMATION_DIRECTIONS,
			fallback: "up",
		});
	const fade = record.fade !== false;

	if (record.kind === "typewriter") {
		const cursorRecord = asRecord({ value: record.cursor });
		const cursor =
			cursorRecord && cursorRecord.text !== ""
				? {
						text:
							typeof cursorRecord.text === "string" ? cursorRecord.text : "|",
						...(typeof cursorRecord.color === "string"
							? { color: cursorRecord.color }
							: {}),
						blinkPeriod: numberInRange({
							value: cursorRecord.blinkPeriod,
							fallback: 0.5,
							minimum: 0.05,
							maximum: 10,
						}),
						persist: cursorRecord.persist === true,
					}
				: undefined;
		const rhythmSource = Array.isArray(record.rhythm) ? record.rhythm : [];
		const rhythm = rhythmSource
			.slice(0, 32)
			.filter(
				(weight): weight is number =>
					typeof weight === "number" &&
					Number.isFinite(weight) &&
					weight > 0 &&
					weight <= 100
			);
		return {
			kind: "typewriter",
			reveal: oneOf({
				value: record.reveal,
				values: ["step", "fade", "wipe"],
				fallback: "step",
			}),
			...(rhythm.length > 0 ? { rhythm } : {}),
			...(cursor ? { cursor } : {}),
		};
	}
	if (record.kind === "fade") {
		return {
			kind: "fade",
			minimumOpacity: numberInRange({
				value: record.minimumOpacity,
				fallback: 0,
				minimum: 0,
				maximum: 1,
			}),
		};
	}
	if (record.kind === "slide") {
		return {
			kind: "slide",
			direction: direction(),
			distance: normalizeDistance({
				value: record.distance,
				fallback: { value: 1.5, unit: "em" },
			}),
			fade,
		};
	}
	if (record.kind === "blur") {
		const travelDirection = TEXT_ANIMATION_DIRECTIONS.find(
			(candidate) => candidate === record.direction
		);
		return {
			kind: "blur",
			...(travelDirection ? { direction: travelDirection } : {}),
			...(record.distance
				? {
						distance: normalizeDistance({
							value: record.distance,
							fallback: { value: 1, unit: "em" },
						}),
					}
				: {}),
			radiusPx: numberInRange({
				value: record.radiusPx,
				fallback: 16,
				minimum: 0,
				maximum: 500,
			}),
			fade,
		};
	}
	if (record.kind === "rotate") {
		const travelDirection = TEXT_ANIMATION_DIRECTIONS.find(
			(candidate) => candidate === record.travelDirection
		);
		const oscillationRecord = asRecord({ value: record.oscillation });
		return {
			kind: "rotate",
			degrees: numberInRange({
				value: record.degrees,
				fallback: 180,
				minimum: -10_000,
				maximum: 10_000,
			}),
			...(travelDirection ? { travelDirection } : {}),
			...(record.distance
				? {
						distance: normalizeDistance({
							value: record.distance,
							fallback: { value: 1.5, unit: "em" },
						}),
					}
				: {}),
			...(oscillationRecord
				? {
						oscillation: {
							cycles: normalizeLoopCycles({
								value: oscillationRecord.cycles,
							}),
							phaseEasing: oneOf({
								value: oscillationRecord.phaseEasing,
								values: ["linear", "smoothstep"],
								fallback: "smoothstep",
							}),
							pivot: oneOf({
								value: oscillationRecord.pivot,
								values: ["center", "bottomCenter"],
								fallback: "center",
							}),
						},
					}
				: {}),
			fade,
		};
	}
	if (record.kind === "scale") {
		const axis = oneOf({
			value: record.axis,
			values: ["uniform", "x", "y"],
			fallback: "uniform",
		});
		const pulseRecord = asRecord({ value: record.pulse });
		return {
			kind: "scale",
			hiddenScale: numberInRange({
				value: record.hiddenScale,
				fallback: 0.6,
				minimum: 0,
				maximum: 10,
			}),
			overshoot: numberInRange({
				value: record.overshoot,
				fallback: 0,
				minimum: 0,
				maximum: 2,
			}),
			...(axis !== "uniform" ? { axis } : {}),
			...(pulseRecord
				? {
						pulse: {
							cycles: normalizeLoopCycles({ value: pulseRecord.cycles }),
							easing: oneOf({
								value: pulseRecord.easing,
								values: ["linear", "smoothstep"],
								fallback: "smoothstep",
							}),
						},
					}
				: {}),
			fade,
		};
	}
	if (record.kind === "bounce") {
		const spatialWaveRecord = asRecord({ value: record.spatialWave });
		return {
			kind: "bounce",
			direction: direction(),
			distance: normalizeDistance({
				value: record.distance,
				fallback: { value: 1.5, unit: "em" },
			}),
			hiddenScale: numberInRange({
				value: record.hiddenScale,
				fallback: 0.8,
				minimum: 0,
				maximum: 10,
			}),
			spring: normalizeSpring({ value: record.spring }),
			...(spatialWaveRecord
				? {
						spatialWave: {
							spatialCycles: numberInRange({
								value: spatialWaveRecord.spatialCycles,
								fallback: 1,
								minimum: 0,
								maximum: 100,
							}),
							phaseOffset: numberInRange({
								value: spatialWaveRecord.phaseOffset,
								fallback: 0,
								minimum: -100,
								maximum: 100,
							}),
						},
					}
				: {}),
		};
	}
	if (record.kind === "orbit") {
		return {
			kind: "orbit",
			rotation:
				record.rotation === "counterclockwise"
					? "counterclockwise"
					: "clockwise",
			turns: numberInRange({
				value: record.turns,
				fallback: 0.5,
				minimum: 0,
				maximum: 100,
			}),
			radius: normalizeDistance({
				value: record.radius,
				fallback: { value: 2, unit: "em" },
			}),
			...(record.ring === true ? { ring: true } : {}),
			fade,
		};
	}
	if (record.kind === "laser") {
		return {
			kind: "laser",
			direction: direction(),
			color: typeof record.color === "string" ? record.color : "#22d3ee",
			thicknessPx: numberInRange({
				value: record.thicknessPx,
				fallback: 2,
				minimum: 0.1,
				maximum: 100,
			}),
			glowPx: numberInRange({
				value: record.glowPx,
				fallback: 12,
				minimum: 0,
				maximum: 500,
			}),
			trail: numberInRange({
				value: record.trail,
				fallback: 0.2,
				minimum: 0,
				maximum: 1,
			}),
			fade,
		};
	}
	if (record.kind === "heart") {
		return {
			kind: "heart",
			direction: direction(),
			distance: normalizeDistance({
				value: record.distance,
				fallback: { value: 1.25, unit: "em" },
			}),
			hiddenScale: numberInRange({
				value: record.hiddenScale,
				fallback: 0.7,
				minimum: 0,
				maximum: 10,
			}),
			color: typeof record.color === "string" ? record.color : "#fb7185",
			particleCount: Math.trunc(
				numberInRange({
					value: record.particleCount,
					fallback: 6,
					minimum: 0,
					maximum: 100,
				})
			),
			spread: numberInRange({
				value: record.spread,
				fallback: 1,
				minimum: 0,
				maximum: 10,
			}),
			seed: Math.trunc(
				numberInRange({
					value: record.seed,
					fallback: 1,
					minimum: 0,
					maximum: 0xffff_ffff,
				})
			),
		};
	}
	if (record.kind === "flip") {
		return {
			kind: "flip",
			maxAngleDeg: numberInRange({
				value: record.maxAngleDeg,
				fallback: 32,
				minimum: 0,
				maximum: 180,
			}),
			perspective: numberInRange({
				value: record.perspective,
				fallback: 0.35,
				minimum: 0,
				maximum: 1,
			}),
		};
	}
	if (record.kind === "jitter") {
		return {
			kind: "jitter",
			steps: Math.trunc(
				numberInRange({
					value: record.steps,
					fallback: 4,
					minimum: 1,
					maximum: 60,
				})
			),
			amplitudeX: numberInRange({
				value: record.amplitudeX,
				fallback: 0.04,
				minimum: 0,
				maximum: 2,
			}),
			amplitudeY: numberInRange({
				value: record.amplitudeY,
				fallback: 0.027,
				minimum: 0,
				maximum: 2,
			}),
		};
	}
	return null;
}
