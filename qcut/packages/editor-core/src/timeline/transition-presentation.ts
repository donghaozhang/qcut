import type {
	ClipTransition,
	ClipTransitionEasing,
} from "../types/timeline.js";

export const CLIP_TRANSITION_PROGRESS_STOPS = [0, 0.25, 0.5, 0.75, 1] as const;

export type ClipTransitionRole = "from" | "to";

export interface ClipTransitionLayerPresentation {
	opacity: number;
	contentOpacity: number;
	offsetX: number;
	offsetY: number;
	clipPath?: string;
	backgroundColor?: string;
	scale?: number;
	rotation?: number;
	blur?: number;
	brightness?: number;
	saturation?: number;
	hueRotate?: number;
}

function clampProgress({ progress }: { progress: number }): number {
	return Math.min(1, Math.max(0, progress));
}

function normalizedOffset({ value }: { value: number }): number {
	return Object.is(value, -0) || Math.abs(value) < Number.EPSILON ? 0 : value;
}

export function easeClipTransitionProgress({
	progress,
	easing,
}: {
	progress: number;
	easing: ClipTransitionEasing;
}): number {
	const clamped = clampProgress({ progress });
	if (easing === "linear") return clamped;
	return clamped < 0.5
		? 4 * clamped * clamped * clamped
		: 1 - (-2 * clamped + 2) ** 3 / 2;
}

function wipeClipPath({
	direction,
	progress,
}: {
	direction: ClipTransition["direction"];
	progress: number;
}): string {
	const hidden = (1 - progress) * 100;
	switch (direction) {
		case "right":
			return "inset(0 0 0 " + hidden + "%)";
		case "up":
			return "inset(0 0 " + hidden + "% 0)";
		case "down":
			return "inset(" + hidden + "% 0 0 0)";
		default:
			return "inset(0 " + hidden + "% 0 0)";
	}
}

function transitionPeak({ progress }: { progress: number }): number {
	return 4 * progress * (1 - progress);
}

function transitionTuning({ transition }: { transition: ClipTransition }) {
	return {
		intensity: Math.min(2, Math.max(0.1, transition.tuning?.intensity ?? 1)),
		frequency: Math.min(4, Math.max(0.1, transition.tuning?.frequency ?? 1)),
		tint: transition.tuning?.tint,
	};
}

function enteringOffset({
	direction,
	distance,
	canvasWidth,
	canvasHeight,
}: {
	direction: ClipTransition["direction"];
	distance: number;
	canvasWidth: number;
	canvasHeight: number;
}): Pick<ClipTransitionLayerPresentation, "offsetX" | "offsetY"> {
	switch (direction) {
		case "right":
			return {
				offsetX: normalizedOffset({ value: distance * canvasWidth }),
				offsetY: 0,
			};
		case "up":
			return {
				offsetX: 0,
				offsetY: normalizedOffset({ value: -distance * canvasHeight }),
			};
		case "down":
			return {
				offsetX: 0,
				offsetY: normalizedOffset({ value: distance * canvasHeight }),
			};
		default:
			return {
				offsetX: normalizedOffset({ value: -distance * canvasWidth }),
				offsetY: 0,
			};
	}
}

function crossfadeOpacity({
	role,
	progress,
}: {
	role: ClipTransitionRole;
	progress: number;
}): number {
	return role === "from" ? 1 - progress : progress;
}

export function getClipTransitionLayerPresentation({
	transition,
	role,
	progress,
	canvasWidth,
	canvasHeight,
}: {
	transition: ClipTransition;
	role: ClipTransitionRole;
	progress: number;
	canvasWidth: number;
	canvasHeight: number;
}): ClipTransitionLayerPresentation {
	const eased = easeClipTransitionProgress({
		progress,
		easing: transition.easing,
	});
	const tuning = transitionTuning({ transition });
	const base: ClipTransitionLayerPresentation = {
		opacity: 1,
		contentOpacity: 1,
		offsetX: 0,
		offsetY: 0,
		scale: 1,
		rotation: 0,
		blur: 0,
		brightness: 1,
		saturation: 1,
		hueRotate: 0,
	};

	switch (transition.type) {
		case "dissolve":
			return { ...base, opacity: role === "from" ? 1 - eased : eased };
		case "fade-black":
			return role === "from"
				? {
						...base,
						contentOpacity: Math.max(0, 1 - eased * 2),
						backgroundColor: "#000000",
					}
				: {
						...base,
						contentOpacity: Math.max(0, (eased - 0.5) * 2),
						backgroundColor: "#000000",
					};
		case "fade-white":
			return role === "from"
				? {
						...base,
						contentOpacity: Math.max(0, 1 - eased * 2),
						backgroundColor: "#ffffff",
					}
				: {
						...base,
						contentOpacity: Math.max(0, (eased - 0.5) * 2),
						backgroundColor: "#ffffff",
					};
		case "slide": {
			if (role === "from") return base;
			return {
				...base,
				...enteringOffset({
					direction: transition.direction,
					distance: 1 - eased,
					canvasWidth,
					canvasHeight,
				}),
			};
		}
		case "push": {
			const offset = enteringOffset({
				direction: transition.direction,
				distance: role === "from" ? eased : 1 - eased,
				canvasWidth,
				canvasHeight,
			});
			return role === "from"
				? {
						...base,
						offsetX: normalizedOffset({ value: -offset.offsetX }),
						offsetY: normalizedOffset({ value: -offset.offsetY }),
					}
				: { ...base, ...offset };
		}
		case "wipe":
			return role === "from"
				? base
				: {
						...base,
						clipPath: wipeClipPath({
							direction: transition.direction,
							progress: eased,
						}),
					};
		case "zoom-blur": {
			const peak = transitionPeak({ progress: eased });
			return {
				...base,
				opacity: crossfadeOpacity({ role, progress: eased }),
				scale: 1 + peak * 0.18 * tuning.intensity,
				blur: peak * 12 * tuning.intensity,
			};
		}
		case "whip-pan": {
			const peak = transitionPeak({ progress: eased });
			const offset = enteringOffset({
				direction: transition.direction,
				distance: role === "from" ? eased : 1 - eased,
				canvasWidth,
				canvasHeight,
			});
			const roleSign = role === "from" ? -1 : 1;
			const directionSign =
				transition.direction === "right" || transition.direction === "down"
					? 1
					: -1;
			return {
				...base,
				offsetX:
					role === "from"
						? normalizedOffset({ value: -offset.offsetX })
						: offset.offsetX,
				offsetY:
					role === "from"
						? normalizedOffset({ value: -offset.offsetY })
						: offset.offsetY,
				scale: 1 + peak * 0.06 * tuning.intensity,
				rotation: roleSign * directionSign * peak * 1.5 * tuning.intensity,
				blur: peak * 14 * tuning.intensity,
			};
		}
		case "flash": {
			const peak = transitionPeak({ progress: eased });
			return {
				...base,
				opacity: crossfadeOpacity({ role, progress: eased }),
				contentOpacity: Math.max(0, 1 - peak * 0.55 * tuning.intensity),
				backgroundColor: tuning.tint ?? "#ffffff",
				brightness: 1 + peak * 2.2 * tuning.intensity,
				saturation: Math.max(0, 1 - peak * 0.7 * tuning.intensity),
			};
		}
		case "light-leak": {
			const peak = transitionPeak({ progress: eased });
			return {
				...base,
				opacity: crossfadeOpacity({ role, progress: eased }),
				contentOpacity: Math.max(0, 1 - peak * 0.3 * tuning.intensity),
				backgroundColor: tuning.tint ?? "#ff5a1f",
				brightness: 1 + peak * 0.65 * tuning.intensity,
				saturation: 1 + peak * 1.1 * tuning.intensity,
				hueRotate: (role === "from" ? -12 : 12) * peak * tuning.frequency,
			};
		}
		case "rgb-glitch": {
			const peak = transitionPeak({ progress: eased });
			const oscillation = Math.sin(eased * Math.PI * 7 * tuning.frequency);
			const roleSign = role === "from" ? -1 : 1;
			return {
				...base,
				opacity: crossfadeOpacity({ role, progress: eased }),
				offsetX: normalizedOffset({
					value:
						roleSign *
						oscillation *
						peak *
						canvasWidth *
						0.025 *
						tuning.intensity,
				}),
				offsetY: normalizedOffset({
					value:
						-roleSign *
						oscillation *
						peak *
						canvasHeight *
						0.012 *
						tuning.intensity,
				}),
				scale: 1 + peak * 0.035 * tuning.intensity,
				saturation: 1 + peak * 1.8 * tuning.intensity,
				hueRotate: roleSign * peak * 42 * tuning.intensity,
			};
		}
		case "shake": {
			const peak = transitionPeak({ progress: eased });
			return {
				...base,
				opacity: crossfadeOpacity({ role, progress: eased }),
				offsetX: normalizedOffset({
					value:
						Math.sin(eased * Math.PI * 16 * tuning.frequency) *
						peak *
						canvasWidth *
						0.018 *
						tuning.intensity,
				}),
				offsetY: normalizedOffset({
					value:
						Math.cos(eased * Math.PI * 13 * tuning.frequency) *
						peak *
						canvasHeight *
						0.018 *
						tuning.intensity,
				}),
				scale: 1 + peak * 0.06 * tuning.intensity,
				rotation:
					Math.sin(eased * Math.PI * 11 * tuning.frequency) *
					peak *
					2.5 *
					tuning.intensity,
			};
		}
	}
}
