import type { TextAnimationEffect, TextKeyframePoint } from "./model.js";
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
			...(typeof record.shakeEm === "number" && record.shakeEm > 0
				? {
						shakeEm: numberInRange({
							value: record.shakeEm,
							fallback: 0.05,
							minimum: 0,
							maximum: 1,
						}),
					}
				: {}),
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
			...(record.spin === false ? { spin: false } : {}),
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
	if (record.kind === "flip3d") {
		return {
			kind: "flip3d",
			axis: oneOf({
				value: record.axis,
				values: ["x", "y"],
				fallback: "y",
			}),
			maxAngleDeg: numberInRange({
				value: record.maxAngleDeg,
				fallback: 60,
				minimum: 0,
				maximum: 180,
			}),
			cameraFovDeg: numberInRange({
				value: record.cameraFovDeg,
				fallback: 30,
				minimum: 10,
				maximum: 140,
			}),
			motionRatio: numberInRange({
				value: record.motionRatio,
				fallback: 0.8,
				minimum: 0.05,
				maximum: 1,
			}),
			motionEasing: normalizeEasing({
				value:
					record.motionEasing ??
					({
						type: "cubicBezier",
						x1: 0.55,
						y1: 0.06,
						x2: 0.4,
						y2: 0.96,
					} as const),
			}),
		};
	}
	if (record.kind === "cylinder3d") {
		return {
			kind: "cylinder3d",
			turns: numberInRange({
				value: record.turns,
				fallback: 1,
				minimum: -20,
				maximum: 20,
			}),
			tiltXDeg: numberInRange({
				value: record.tiltXDeg,
				fallback: 20,
				minimum: -89,
				maximum: 89,
			}),
			cameraFovDeg: numberInRange({
				value: record.cameraFovDeg,
				fallback: 60,
				minimum: 10,
				maximum: 140,
			}),
			coverage: numberInRange({
				value: record.coverage,
				fallback: 5 / 6,
				minimum: 0.05,
				maximum: 1,
			}),
			radiusRatio: numberInRange({
				value: record.radiusRatio,
				fallback: 1.2 / (Math.PI * 2),
				minimum: 0.01,
				maximum: 4,
			}),
			startYawDeg: numberInRange({
				value: record.startYawDeg,
				fallback: 540,
				minimum: -10_000,
				maximum: 10_000,
			}),
		};
	}
	if (record.kind === "jitter3d") {
		return {
			kind: "jitter3d",
			cameraFovDeg: numberInRange({
				value: record.cameraFovDeg,
				fallback: 60,
				minimum: 10,
				maximum: 140,
			}),
			groupYawDeg: numberInRange({
				value: record.groupYawDeg,
				fallback: 20,
				minimum: -180,
				maximum: 180,
			}),
			rotationXDeg: numberInRange({
				value: record.rotationXDeg,
				fallback: 15,
				minimum: 0,
				maximum: 180,
			}),
			rotationYDeg: numberInRange({
				value: record.rotationYDeg,
				fallback: 15,
				minimum: 0,
				maximum: 180,
			}),
			rotationZDeg: numberInRange({
				value: record.rotationZDeg,
				fallback: 10,
				minimum: 0,
				maximum: 360,
			}),
			positionJitter: numberInRange({
				value: record.positionJitter,
				fallback: 0.03,
				minimum: 0,
				maximum: 1,
			}),
			scaleFrom: numberInRange({
				value: record.scaleFrom,
				fallback: 2 / 3,
				minimum: 0.01,
				maximum: 10,
			}),
			scaleTo: numberInRange({
				value: record.scaleTo,
				fallback: 1,
				minimum: 0.01,
				maximum: 10,
			}),
			frequency: numberInRange({
				value: record.frequency,
				fallback: 12,
				minimum: 1,
				maximum: 60,
			}),
			seed: Math.trunc(
				numberInRange({
					value: record.seed,
					fallback: 1,
					minimum: 0,
					maximum: 0xffff_ffff,
				})
			),
			trailSamples: Math.trunc(
				numberInRange({
					value: record.trailSamples,
					fallback: 12,
					minimum: 1,
					maximum: 32,
				})
			),
			trailStrength: numberInRange({
				value: record.trailStrength,
				fallback: 0.65,
				minimum: 0,
				maximum: 2,
			}),
			trapezoidAmount: numberInRange({
				value: record.trapezoidAmount,
				fallback: 0.12,
				minimum: -1,
				maximum: 1,
			}),
		};
	}
	if (record.kind === "arc") {
		return {
			kind: "arc",
			riseEm: numberInRange({
				value: record.riseEm,
				fallback: 0.45,
				minimum: 0,
				maximum: 4,
			}),
			tiltDeg: numberInRange({
				value: record.tiltDeg,
				fallback: 14,
				minimum: -90,
				maximum: 90,
			}),
		};
	}
	if (record.kind === "squeeze") {
		return {
			kind: "squeeze",
			amount: numberInRange({
				value: record.amount,
				fallback: 0.45,
				minimum: 0,
				maximum: 0.95,
			}),
			spatialCycles: numberInRange({
				value: record.spatialCycles,
				fallback: 1.2,
				minimum: 0.1,
				maximum: 8,
			}),
		};
	}
	if (record.kind === "fold") {
		return {
			kind: "fold",
			minimumScale: numberInRange({
				value: record.minimumScale,
				fallback: 0.05,
				minimum: 0.01,
				maximum: 1,
			}),
			phaseStepDeg: numberInRange({
				value: record.phaseStepDeg,
				fallback: 90,
				minimum: 0,
				maximum: 360,
			}),
		};
	}
	if (record.kind === "spiral") {
		return {
			kind: "spiral",
			turns: numberInRange({
				value: record.turns,
				fallback: 1.25,
				minimum: 0.1,
				maximum: 10,
			}),
			radius: normalizeDistance({
				value: record.radius,
				fallback: { value: 0.8, unit: "em" },
			}),
			drop: normalizeDistance({
				value: record.drop,
				fallback: { value: 1.1, unit: "boxHeight" },
			}),
			fade,
		};
	}
	if (record.kind === "shatter") {
		return {
			kind: "shatter",
			tilePx: numberInRange({
				value: record.tilePx,
				fallback: 6,
				minimum: 2,
				maximum: 64,
			}),
			distortion: numberInRange({
				value: record.distortion,
				fallback: 0.6,
				minimum: 0,
				maximum: 8,
			}),
			gravity: normalizeDistance({
				value: record.gravity,
				fallback: { value: 1.2, unit: "em" },
			}),
			gravityRotDeg: numberInRange({
				value: record.gravityRotDeg,
				fallback: 0,
				minimum: -180,
				maximum: 180,
			}),
			front: record.front === "wipe" ? "wipe" : "noise",
			frontRotDeg: numberInRange({
				value: record.frontRotDeg,
				fallback: 0,
				minimum: -180,
				maximum: 180,
			}),
			feather: numberInRange({
				value: record.feather,
				fallback: 0.35,
				minimum: 0.01,
				maximum: 1,
			}),
		};
	}
	if (record.kind === "burst") {
		const shape =
			record.shape === "coin" || record.shape === "rect"
				? record.shape
				: "ribbon";
		const palette = Array.isArray(record.palette)
			? record.palette
					.filter((entry): entry is string => typeof entry === "string")
					.slice(0, 12)
			: [];
		return {
			kind: "burst",
			shape,
			count: Math.trunc(
				numberInRange({
					value: record.count,
					fallback: 36,
					minimum: 1,
					maximum: 200,
				})
			),
			speed: normalizeDistance({
				value: record.speed,
				fallback: { value: 5, unit: "em" },
			}),
			directionDeg: numberInRange({
				value: record.directionDeg,
				fallback: 0,
				minimum: -360,
				maximum: 360,
			}),
			spreadDeg: numberInRange({
				value: record.spreadDeg,
				fallback: 80,
				minimum: 1,
				maximum: 360,
			}),
			gravity: normalizeDistance({
				value: record.gravity,
				fallback: { value: 2.4, unit: "em" },
			}),
			lifeRandom: numberInRange({
				value: record.lifeRandom,
				fallback: 0.4,
				minimum: 0,
				maximum: 1,
			}),
			sizeEm: numberInRange({
				value: record.sizeEm,
				fallback: 0.22,
				minimum: 0.02,
				maximum: 2,
			}),
			sizeRandom: numberInRange({
				value: record.sizeRandom,
				fallback: 0.4,
				minimum: 0,
				maximum: 1,
			}),
			palette:
				palette.length > 0
					? palette
					: ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"],
			flutter: numberInRange({
				value: record.flutter,
				fallback: shape === "ribbon" ? 0.8 : 0.25,
				minimum: 0,
				maximum: 1,
			}),
			...(record.rays && typeof record.rays === "object"
				? {
						rays: {
							count: Math.trunc(
								numberInRange({
									value: (record.rays as Record<string, unknown>).count,
									fallback: 22,
									minimum: 0,
									maximum: 64,
								})
							),
							length: normalizeDistance({
								value: (record.rays as Record<string, unknown>).length,
								fallback: { value: 3, unit: "em" },
							}),
						},
					}
				: {}),
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
	if (record.kind === "tumble") {
		return {
			kind: "tumble",
			spinDeg: numberInRange({
				value: record.spinDeg,
				fallback: -720,
				minimum: -3600,
				maximum: 3600,
			}),
			drop: normalizeDistance({
				value: record.drop,
				fallback: { value: 2, unit: "em" },
			}),
			fade,
		};
	}
	if (record.kind === "scatter") {
		return {
			kind: "scatter",
			distance: normalizeDistance({
				value: record.distance,
				fallback: { value: 2, unit: "em" },
			}),
			flicker: record.flicker === true,
			rotateDeg: numberInRange({
				value: record.rotateDeg,
				fallback: 45,
				minimum: 0,
				maximum: 360,
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
	if (record.kind === "keyframes") {
		const KEYFRAME_CHANNELS = [
			"translateXEm",
			"translateYEm",
			"scaleX",
			"scaleY",
			"rotationDeg",
			"rotationXDeg",
			"rotationYDeg",
			"opacity",
			"blurPx",
			"colorAmount",
			"glowIntensity",
			"glowRadiusPx",
		] as const;
		const channelsRecord = asRecord({ value: record.channels });
		if (!channelsRecord) return null;
		const channels: Partial<
			Record<(typeof KEYFRAME_CHANNELS)[number], TextKeyframePoint[]>
		> = {};
		for (const name of KEYFRAME_CHANNELS) {
			const raw = channelsRecord[name];
			if (!Array.isArray(raw)) continue;
			const track: TextKeyframePoint[] = [];
			for (const entry of raw.slice(0, 64)) {
				const point = asRecord({ value: entry });
				if (
					!point ||
					typeof point.t !== "number" ||
					!Number.isFinite(point.t) ||
					typeof point.v !== "number" ||
					!Number.isFinite(point.v)
				) {
					continue;
				}
				const handle = (value: unknown) =>
					typeof value === "number" && Number.isFinite(value)
						? value
						: undefined;
				const inValue = handle(point.inValue);
				const outValue = handle(point.outValue);
				const inTime = handle(point.inTime);
				const outTime = handle(point.outTime);
				track.push({
					t: Math.min(1, Math.max(0, point.t)),
					v: point.v,
					...(inValue !== undefined ? { inValue } : {}),
					...(outValue !== undefined ? { outValue } : {}),
					...(inTime !== undefined ? { inTime } : {}),
					...(outTime !== undefined ? { outTime } : {}),
				});
			}
			if (track.length === 0) continue;
			track.sort((left, right) => left.t - right.t);
			channels[name] = track;
		}
		if (Object.keys(channels).length === 0) return null;
		return {
			kind: "keyframes",
			channels,
			...(typeof record.color === "string" && record.color.trim()
				? { color: record.color.trim() }
				: {}),
			...(typeof record.glowColor === "string" && record.glowColor.trim()
				? { glowColor: record.glowColor.trim() }
				: {}),
		};
	}
	if (record.kind === "colorCycle") {
		const palette = Array.isArray(record.palette)
			? record.palette
					.filter((entry): entry is string => typeof entry === "string")
					.slice(0, 12)
			: [];
		const bounceEm = numberInRange({
			value: record.bounceEm,
			fallback: 0,
			minimum: 0,
			maximum: 2,
		});
		return {
			kind: "colorCycle",
			palette:
				palette.length > 0
					? palette
					: ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"],
			amount: numberInRange({
				value: record.amount,
				fallback: 1,
				minimum: 0,
				maximum: 1,
			}),
			cycles: numberInRange({
				value: record.cycles,
				fallback: 1,
				minimum: 0.1,
				maximum: 12,
			}),
			rankOffset: numberInRange({
				value: record.rankOffset,
				fallback: 1,
				minimum: 0,
				maximum: 12,
			}),
			stepped: record.stepped === true,
			envelope:
				record.envelope === "hold" || record.envelope === "beat"
					? record.envelope
					: "constant",
			...(bounceEm > 0 ? { bounceEm } : {}),
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
