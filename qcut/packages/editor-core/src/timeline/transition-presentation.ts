import type {
	ClipTransition,
	ClipTransitionEasing,
} from "../types/timeline.js";
import { resolveClipTransitionTuning } from "./transition-tuning.js";

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
	pixelScale?: number;
	maskImage?: string;
	maskSize?: string;
	maskPosition?: string;
	perspective?: number;
	rotationX?: number;
	rotationY?: number;
	skewX?: number;
	skewY?: number;
	transformOrigin?: string;
	overlayBackground?: string;
	overlayOpacity?: number;
	overlayBlendMode?: "normal" | "screen" | "overlay";
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

function maskVisibility({
	role,
	progress,
}: {
	role: ClipTransitionRole;
	progress: number;
}): number {
	return role === "from" ? 1 - progress : progress;
}

function particleMask({
	visibility,
	frequency,
	intensity,
	progress,
}: {
	visibility: number;
	frequency: number;
	intensity: number;
	progress: number;
}): Pick<
	ClipTransitionLayerPresentation,
	"maskImage" | "maskPosition" | "maskSize"
> {
	const cellSize = Math.max(7, 20 / frequency);
	const radius = visibility * cellSize * (0.72 + intensity * 0.08);
	const feather = Math.max(0.75, cellSize * 0.06);
	return {
		maskImage: `radial-gradient(circle, #000 0 ${radius.toFixed(2)}px, transparent ${(radius + feather).toFixed(2)}px)`,
		maskSize: `${cellSize.toFixed(2)}px ${cellSize.toFixed(2)}px`,
		maskPosition: `${(progress * cellSize * 0.65).toFixed(2)}px ${(progress * cellSize * -0.45).toFixed(2)}px`,
	};
}

function textureMask({
	visibility,
	frequency,
	progress,
}: {
	visibility: number;
	frequency: number;
	progress: number;
}): Pick<
	ClipTransitionLayerPresentation,
	"maskImage" | "maskPosition" | "maskSize"
> {
	const tileSize = Math.max(10, 34 / frequency);
	const revealAngle = visibility * 25;
	return {
		maskImage: `repeating-conic-gradient(from ${(progress * 90).toFixed(2)}deg, #000 0 ${revealAngle.toFixed(2)}%, transparent ${revealAngle.toFixed(2)}% 25%)`,
		maskSize: `${tileSize.toFixed(2)}px ${tileSize.toFixed(2)}px`,
		maskPosition: `${(progress * tileSize * 0.5).toFixed(2)}px ${(progress * tileSize * 0.35).toFixed(2)}px`,
	};
}

function pageFlipTransform({
	direction,
	role,
	progress,
}: {
	direction: ClipTransition["direction"];
	role: ClipTransitionRole;
	progress: number;
}): Pick<
	ClipTransitionLayerPresentation,
	"perspective" | "rotationX" | "rotationY" | "transformOrigin"
> {
	const enteringAngle = (1 - progress) * 90;
	const leavingAngle = progress * 90;
	const angle = role === "from" ? leavingAngle : enteringAngle;
	const vertical = direction === "up" || direction === "down";
	const sign = direction === "right" || direction === "down" ? 1 : -1;
	const transformOrigin = vertical
		? direction === "down"
			? "center bottom"
			: "center top"
		: direction === "right"
			? "right center"
			: "left center";
	return {
		perspective: 900,
		rotationX: vertical ? angle * sign * (role === "from" ? 1 : -1) : 0,
		rotationY: vertical ? 0 : angle * sign * (role === "from" ? 1 : -1),
		transformOrigin,
	};
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
	const tuning = resolveClipTransitionTuning({ transition, progress });
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
		case "motion-blur": {
			const peak = transitionPeak({ progress: eased });
			const offset = enteringOffset({
				direction: transition.direction,
				distance: peak * 0.055 * tuning.intensity,
				canvasWidth,
				canvasHeight,
			});
			const roleSign = role === "from" ? -1 : 1;
			return {
				...base,
				opacity: crossfadeOpacity({ role, progress: eased }),
				offsetX: normalizedOffset({ value: offset.offsetX * roleSign }),
				offsetY: normalizedOffset({ value: offset.offsetY * roleSign }),
				blur: peak * 18 * tuning.intensity,
				scale: 1 + peak * 0.035 * tuning.intensity,
			};
		}
		case "pixelate": {
			const peak = transitionPeak({ progress: eased });
			return {
				...base,
				opacity: crossfadeOpacity({ role, progress: eased }),
				pixelScale: 1 + Math.round(peak * 22 * tuning.intensity),
				saturation: 1 + peak * 0.15 * tuning.intensity,
			};
		}
		case "water-ripple": {
			const peak = transitionPeak({ progress: eased });
			const wave =
				Math.sin(eased * Math.PI * 8 * tuning.frequency) *
				peak *
				tuning.intensity;
			return {
				...base,
				opacity: crossfadeOpacity({ role, progress: eased }),
				scale: 1 + wave * 0.018,
				rotation: wave * (role === "from" ? -0.45 : 0.45),
				blur: peak * 1.5 * tuning.intensity,
				overlayBackground:
					"repeating-radial-gradient(circle at center, transparent 0 8%, rgba(255,255,255,0.22) 9%, transparent 10% 16%)",
				overlayOpacity: peak * 0.28 * tuning.intensity,
				overlayBlendMode: "screen",
			};
		}
		case "particle-dissolve": {
			const visibility = maskVisibility({ role, progress: eased });
			return {
				...base,
				...particleMask({
					visibility,
					frequency: tuning.frequency,
					intensity: tuning.intensity,
					progress: eased,
				}),
				contentOpacity: visibility <= 0.001 ? 0 : 1,
				scale: 1 + transitionPeak({ progress: eased }) * 0.025,
			};
		}
		case "glass-refraction": {
			const peak = transitionPeak({ progress: eased });
			const roleSign = role === "from" ? -1 : 1;
			const vertical =
				transition.direction === "up" || transition.direction === "down";
			return {
				...base,
				opacity: crossfadeOpacity({ role, progress: eased }),
				offsetX: vertical
					? 0
					: roleSign * peak * canvasWidth * 0.018 * tuning.intensity,
				offsetY: vertical
					? roleSign * peak * canvasHeight * 0.018 * tuning.intensity
					: 0,
				skewX: vertical ? roleSign * peak * 2.5 : 0,
				skewY: vertical ? 0 : roleSign * peak * 2.5,
				blur: peak * 2.2 * tuning.intensity,
				saturation: 1 + peak * 0.45,
				maskImage:
					"repeating-linear-gradient(90deg, rgba(0,0,0,1) 0 14px, rgba(0,0,0,0.58) 14px 18px)",
				overlayBackground:
					"repeating-linear-gradient(90deg, transparent 0 14px, rgba(255,255,255,0.3) 15px, transparent 18px)",
				overlayOpacity: peak * 0.55,
				overlayBlendMode: "screen",
			};
		}
		case "page-flip": {
			const peak = transitionPeak({ progress: eased });
			return {
				...base,
				...pageFlipTransform({
					direction: transition.direction,
					role,
					progress: eased,
				}),
				opacity: crossfadeOpacity({ role, progress: eased }),
				brightness: 1 - peak * 0.28 * tuning.intensity,
				overlayBackground:
					"linear-gradient(90deg, rgba(0,0,0,0.5), transparent 18%, transparent 82%, rgba(255,255,255,0.28))",
				overlayOpacity: peak,
				overlayBlendMode: "overlay",
			};
		}
		case "texture-mask": {
			const visibility = maskVisibility({ role, progress: eased });
			return {
				...base,
				...textureMask({
					visibility,
					frequency: tuning.frequency,
					progress: eased,
				}),
				contentOpacity: visibility <= 0.001 ? 0 : 1,
			};
		}
		case "lens-flare": {
			const peak = transitionPeak({ progress: eased });
			const flareX = 15 + eased * 70;
			const flareY = 30 + Math.sin(eased * Math.PI) * 28;
			const tint = tuning.tint ?? "#ffd6a1";
			return {
				...base,
				opacity: crossfadeOpacity({ role, progress: eased }),
				brightness: 1 + peak * 0.85 * tuning.intensity,
				saturation: 1 + peak * 0.35,
				overlayBackground: `radial-gradient(circle at ${flareX.toFixed(2)}% ${flareY.toFixed(2)}%, ${tint} 0, rgba(255,255,255,0.72) 8%, transparent 34%), linear-gradient(${(eased * 18 - 9).toFixed(2)}deg, transparent 42%, ${tint} 49%, transparent 56%)`,
				overlayOpacity: peak * Math.min(1, 0.72 * tuning.intensity),
				overlayBlendMode: "screen",
			};
		}
	}
	return base;
}
