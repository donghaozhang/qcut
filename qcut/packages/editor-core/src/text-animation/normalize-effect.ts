import type { TextAnimationEffect } from "./model.js";
import {
	asRecord,
	normalizeDistance,
	normalizeSpring,
	numberInRange,
	oneOf,
	TEXT_ANIMATION_DIRECTIONS,
} from "./normalization-helpers.js";

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
		return {
			kind: "typewriter",
			reveal: oneOf({
				value: record.reveal,
				values: ["step", "fade", "wipe"],
				fallback: "step",
			}),
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
			fade,
		};
	}
	if (record.kind === "scale") {
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
			fade,
		};
	}
	if (record.kind === "bounce") {
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
	return null;
}
