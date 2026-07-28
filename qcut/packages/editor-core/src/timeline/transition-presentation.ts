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
	maskRepeat?: string;
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

function stackedLayerOpacity({
	role,
	progress,
}: {
	role: ClipTransitionRole;
	progress: number;
}): number {
	return role === "from" ? 1 : progress;
}

function pageFlipOpacity({
	role,
	progress,
}: {
	role: ClipTransitionRole;
	progress: number;
}): number {
	if (role === "from" && progress >= 0.999) return 0;
	if (role === "to" && progress <= 0.001) return 0;
	return 1;
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

function hash01(seed: number): number {
	const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
	return value - Math.floor(value);
}

const HEART_MASK_SVG = encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 36 36"><defs><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".65"/></filter></defs><path fill="#000" filter="url(#soft)" d="M16 29C7 21.5 2 16.5 2 10.6 2 6.4 5.4 3 9.6 3c2.6 0 5 1.3 6.4 3.4C17.4 4.3 19.8 3 22.4 3 26.6 3 30 6.4 30 10.6 30 16.5 25 21.5 16 29z"/></svg>'
);

const STAR_MASK_SVG = encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#000" d="M16 1l4.6 9.9L31 12.4l-7.5 7.5L25.3 31 16 25.4 6.7 31l1.8-11.1L1 12.4l10.4-1.5z"/></svg>'
);

function noiseBlobMask({
	seedBase,
	blobCount,
	spread,
	progress,
}: {
	seedBase: number;
	blobCount: number;
	spread: number;
	progress: number;
}): string {
	const layers: string[] = [];
	const backing = Math.min(1, Math.max(0, (progress - 0.68) / 0.3));
	if (backing > 0) {
		layers.push(`linear-gradient(rgba(0,0,0,${backing.toFixed(3)}) 0 0)`);
	}
	for (let index = 0; index < blobCount; index += 1) {
		const x = hash01(seedBase + index * 3.7) * 100;
		const y = hash01(seedBase + index * 7.3 + 1) * 100;
		const radius =
			progress * (spread + hash01(seedBase + index * 11.9 + 2) * spread);
		const feather = spread * 0.55;
		layers.push(
			`radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, #000 0 ${radius.toFixed(1)}%, transparent ${(radius + feather).toFixed(1)}%)`
		);
	}
	return layers.join(", ");
}

type ShapeMaskPresentation = Partial<ClipTransitionLayerPresentation>;

function circleMask({
	progress,
	canvasWidth,
	canvasHeight,
}: {
	progress: number;
	canvasWidth: number;
	canvasHeight: number;
}): ShapeMaskPresentation {
	const maximumRadius = Math.hypot(canvasWidth, canvasHeight) / 2;
	const featherRadius = maximumRadius * 0.03;
	const radius = progress * 1.06 * maximumRadius;
	const solidRadius = Math.max(0, radius - featherRadius);
	const outerRadius = radius + featherRadius;
	return {
		maskImage: `radial-gradient(circle at 50% 50%, #000 0 ${solidRadius.toFixed(2)}px, rgba(0,0,0,0.5) ${radius.toFixed(2)}px, transparent ${outerRadius.toFixed(2)}px)`,
		maskSize: "100% 100%",
		maskRepeat: "no-repeat",
	};
}

function clockMask({ progress }: { progress: number }): ShapeMaskPresentation {
	const points = ["50% 50%", "50% -50%"];
	const sweep = progress * Math.PI * 2;
	const steps = Math.max(1, Math.ceil(sweep / (Math.PI / 15)));
	for (let index = 0; index <= steps; index += 1) {
		const angle = (sweep * index) / steps;
		const x = 50 + 150 * Math.sin(angle);
		const y = 50 - 150 * Math.cos(angle);
		points.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
	}
	return { clipPath: `polygon(${points.join(", ")})` };
}

function blindsMask({ progress }: { progress: number }): ShapeMaskPresentation {
	const slat = (progress * 12.5).toFixed(2);
	return {
		maskImage: `repeating-linear-gradient(180deg, #000 0 ${slat}%, transparent ${slat}% 12.5%)`,
		maskSize: "100% 100%",
		maskRepeat: "no-repeat",
	};
}

function crossMask({ progress }: { progress: number }): ShapeMaskPresentation {
	const arm = (progress * 50).toFixed(2);
	return {
		maskImage:
			`linear-gradient(90deg, transparent calc(50% - ${arm}%), #000 calc(50% - ${arm}%) calc(50% + ${arm}%), transparent calc(50% + ${arm}%)), ` +
			`linear-gradient(180deg, transparent calc(50% - ${arm}%), #000 calc(50% - ${arm}%) calc(50% + ${arm}%), transparent calc(50% + ${arm}%))`,
		maskSize: "100% 100%",
		maskRepeat: "no-repeat",
	};
}

function triptychMask({
	progress,
}: {
	progress: number;
}): ShapeMaskPresentation {
	return {
		maskImage: "linear-gradient(#000 0 0)",
		maskSize: `33.4% ${(progress * 100).toFixed(2)}%`,
		maskPosition: "0 0",
		maskRepeat: "repeat-x",
	};
}

function arrowMask({ progress }: { progress: number }): ShapeMaskPresentation {
	const edge = progress * 125 - 25;
	return {
		clipPath: `polygon(-1% -1%, ${edge.toFixed(1)}% -1%, ${(edge + 25).toFixed(1)}% 50%, ${edge.toFixed(1)}% 101%, -1% 101%)`,
	};
}

function svgMask({
	svg,
	progress,
	scaleByHeight = false,
}: {
	svg: string;
	progress: number;
	scaleByHeight?: boolean;
}): ShapeMaskPresentation {
	const heightScale = progress * 200 + progress ** 8 * 300;
	return {
		maskImage: `url("data:image/svg+xml,${svg}")`,
		maskSize: scaleByHeight
			? `auto ${heightScale.toFixed(1)}%`
			: `${(progress * 260).toFixed(1)}%`,
		maskPosition: "center",
		maskRepeat: "no-repeat",
	};
}

function diagonalMask({
	progress,
}: {
	progress: number;
}): ShapeMaskPresentation {
	const front = (progress * 145 - 22.5).toFixed(2);
	return {
		maskImage: `linear-gradient(135deg, #000 0 ${front}%, rgba(0,0,0,0.55) calc(${front}% + 4%), transparent calc(${front}% + 11%))`,
		maskSize: "100% 100%",
		maskRepeat: "no-repeat",
	};
}

function curtainMask({
	progress,
}: {
	progress: number;
}): ShapeMaskPresentation {
	const half = (progress * 50).toFixed(2);
	return {
		maskImage: `linear-gradient(90deg, transparent 0 calc(50% - ${half}%), #000 calc(50% - ${half}%) calc(50% + ${half}%), transparent calc(50% + ${half}%))`,
		maskSize: "100% 100%",
		maskRepeat: "no-repeat",
	};
}

function noiseMask({
	seedBase,
	blobCount,
	spread,
	progress,
	backing,
}: {
	seedBase: number;
	blobCount: number;
	spread: number;
	progress: number;
	backing?: string;
}): ShapeMaskPresentation {
	const blobs = noiseBlobMask({ seedBase, blobCount, spread, progress });
	return {
		maskImage: backing ? `${backing}, ${blobs}` : blobs,
		maskSize: "100% 100%",
		maskRepeat: "no-repeat",
	};
}

function dripMask({ progress }: { progress: number }): ShapeMaskPresentation {
	const front = (progress * 130 - 15).toFixed(2);
	return noiseMask({
		seedBase: 67,
		blobCount: 6,
		spread: 16,
		progress,
		backing: `linear-gradient(180deg, #000 0 ${front}%, transparent calc(${front}% + 12%))`,
	});
}

/**
 * Procedural wipe masks for texture-mask transitions with a maskShape. The
 * incoming layer is clipped/masked by a growing shape; the outgoing layer
 * stays untouched underneath, so the pair reads as a shaped reveal.
 */
function shapeMask({
	shape,
	role,
	progress,
	canvasWidth,
	canvasHeight,
}: {
	shape: NonNullable<ClipTransition["maskShape"]>;
	role: ClipTransitionRole;
	progress: number;
	canvasWidth: number;
	canvasHeight: number;
}): ShapeMaskPresentation {
	if (role === "from") return {};
	switch (shape) {
		case "circle":
			return circleMask({ progress, canvasWidth, canvasHeight });
		case "clock":
			return clockMask({ progress });
		case "blinds":
			return blindsMask({ progress });
		case "cross":
			return crossMask({ progress });
		case "triptych":
			return triptychMask({ progress });
		case "arrow":
			return arrowMask({ progress });
		case "heart":
			return svgMask({ svg: HEART_MASK_SVG, progress, scaleByHeight: true });
		case "star":
			return svgMask({ svg: STAR_MASK_SVG, progress });
		case "ink":
			return noiseMask({ seedBase: 5, blobCount: 7, spread: 26, progress });
		case "cloud":
			return noiseMask({ seedBase: 23, blobCount: 10, spread: 20, progress });
		case "fog":
			return noiseMask({
				seedBase: 41,
				blobCount: 6,
				spread: 34,
				progress,
				backing: `linear-gradient(rgba(0,0,0,${Math.min(1, progress * 1.25).toFixed(3)}) 0 0)`,
			});
		case "drip":
			return dripMask({ progress });
		case "curtain":
			return curtainMask({ progress });
		case "diagonal":
			return diagonalMask({ progress });
		default: {
			shape satisfies never;
			return {};
		}
	}
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
			return {
				...base,
				opacity: stackedLayerOpacity({ role, progress: eased }),
			};
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
				opacity: stackedLayerOpacity({ role, progress: eased }),
				scale: 1 + peak * 0.18 * tuning.intensity,
				blur: peak * 12 * tuning.intensity,
			};
		}
		case "zoom-in-blur": {
			const peak = transitionPeak({ progress: eased });
			const zoomAmount = 0.12 * tuning.intensity;
			return {
				...base,
				opacity: stackedLayerOpacity({ role, progress: eased }),
				scale:
					role === "from"
						? 1 + zoomAmount * eased
						: 1 - zoomAmount * (1 - eased),
				blur: peak * 8 * tuning.intensity,
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
				opacity: stackedLayerOpacity({ role, progress: eased }),
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
				opacity: stackedLayerOpacity({ role, progress: eased }),
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
				opacity: stackedLayerOpacity({ role, progress: eased }),
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
				opacity: stackedLayerOpacity({ role, progress: eased }),
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
				opacity: stackedLayerOpacity({ role, progress: eased }),
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
				opacity: stackedLayerOpacity({ role, progress: eased }),
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
				opacity: stackedLayerOpacity({ role, progress: eased }),
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
				opacity: stackedLayerOpacity({ role, progress: eased }),
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
				opacity: pageFlipOpacity({ role, progress: eased }),
				brightness: 1 - peak * 0.28 * tuning.intensity,
				overlayBackground:
					"linear-gradient(90deg, rgba(0,0,0,0.5), transparent 18%, transparent 82%, rgba(255,255,255,0.28))",
				overlayOpacity: peak,
				overlayBlendMode: "overlay",
			};
		}
		case "texture-mask": {
			if (transition.maskShape) {
				// Snap at the boundaries to mirror the FFmpeg export expression
				// (if(lte(p,0.001),A,if(gte(p,0.999),B,...))): no incoming slivers
				// before the wipe starts, no outgoing residue after it completes.
				if (role === "from") {
					return {
						...base,
						opacity: eased >= 0.999 ? 0 : 1,
						contentOpacity: eased >= 0.999 ? 0 : 1,
					};
				}
				if (eased <= 0.001) {
					return { ...base, opacity: 0, contentOpacity: 0 };
				}
				if (eased >= 0.999) {
					return base;
				}
				return {
					...base,
					...shapeMask({
						shape: transition.maskShape,
						role,
						progress: eased,
						canvasWidth,
						canvasHeight,
					}),
					opacity: 1,
					contentOpacity: 1,
				};
			}
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
		case "cube": {
			const shade = 0.34 * tuning.intensity;
			if (role === "from") {
				return {
					...base,
					opacity: eased >= 0.999 ? 0 : 1,
					rotationY: -90 * eased,
					perspective: 1100,
					transformOrigin: "100% 50%",
					brightness: 1 - shade * eased,
				};
			}
			return {
				...base,
				opacity: eased <= 0.001 ? 0 : 1,
				rotationY: 90 * (1 - eased),
				perspective: 1100,
				transformOrigin: "0% 50%",
				brightness: 1 - shade * (1 - eased),
			};
		}
		case "color-swipe": {
			const tint = tuning.tint ?? "#ffd233";
			const angleByDirection = {
				right: 90,
				up: 0,
				down: 180,
				left: 270,
			} as const;
			const angle = angleByDirection[transition.direction ?? "left"];
			const front = Math.min(200, eased * 200);
			const back = Math.max(0, front - 100);
			const clampedFront = Math.min(100, front);
			return {
				...base,
				opacity: 1,
				contentOpacity:
					role === "from" ? (eased < 0.5 ? 1 : 0) : eased >= 0.5 ? 1 : 0,
				overlayBackground: `linear-gradient(${angle}deg, transparent 0 ${back.toFixed(2)}%, ${tint} ${back.toFixed(2)}% ${clampedFront.toFixed(2)}%, transparent ${clampedFront.toFixed(2)}%)`,
				overlayOpacity: front > 0 && back < 100 ? 1 : 0,
				overlayBlendMode: "normal",
			};
		}
		case "vortex": {
			const peak = transitionPeak({ progress: eased });
			const spin = 160 * tuning.intensity;
			return {
				...base,
				opacity: stackedLayerOpacity({ role, progress: eased }),
				rotation: role === "from" ? eased * spin : -(1 - eased) * spin,
				scale: 1 + peak * 0.24 * tuning.intensity,
				blur: peak * 7 * tuning.intensity,
				transformOrigin: "50% 50%",
			};
		}
		case "shockwave": {
			const peak = transitionPeak({ progress: eased });
			const ring = Math.min(100, eased * 130);
			return {
				...base,
				opacity: stackedLayerOpacity({ role, progress: eased }),
				scale: 1 + peak * 0.1 * tuning.intensity,
				blur: peak * 3 * tuning.intensity,
				brightness: 1 + peak * 0.2 * tuning.intensity,
				overlayBackground: `radial-gradient(circle at 50% 50%, transparent ${Math.max(0, ring - 9).toFixed(1)}%, rgba(255,255,255,0.85) ${ring.toFixed(1)}%, transparent ${Math.min(110, ring + 9).toFixed(1)}%)`,
				overlayOpacity: peak * Math.min(1, 0.8 * tuning.intensity),
				overlayBlendMode: "screen",
			};
		}
		case "lens-flare": {
			const peak = transitionPeak({ progress: eased });
			const flareX = 15 + eased * 70;
			const flareY = 30 + Math.sin(eased * Math.PI) * 28;
			const tint = tuning.tint ?? "#ffd6a1";
			return {
				...base,
				opacity: stackedLayerOpacity({ role, progress: eased }),
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
