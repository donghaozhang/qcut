import type {
	ClipTransition,
	ClipTransitionEasing,
} from "@/types/timeline";

export type ClipTransitionRole = "from" | "to";

export interface ClipTransitionLayerPresentation {
	opacity: number;
	contentOpacity: number;
	offsetX: number;
	offsetY: number;
	clipPath?: string;
	backgroundColor?: string;
}

function clampProgress({ progress }: { progress: number }): number {
	return Math.min(1, Math.max(0, progress));
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
		: 1 - Math.pow(-2 * clamped + 2, 3) / 2;
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
			return `inset(0 0 0 ${hidden}%)`;
		case "up":
			return `inset(0 0 ${hidden}% 0)`;
		case "down":
			return `inset(${hidden}% 0 0 0)`;
		default:
			return `inset(0 ${hidden}% 0 0)`;
	}
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
	const base: ClipTransitionLayerPresentation = {
		opacity: 1,
		contentOpacity: 1,
		offsetX: 0,
		offsetY: 0,
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
					};
		case "slide": {
			const incomingDistance = 1 - eased;
			const outgoingDistance = eased;
			const distance = role === "from" ? outgoingDistance : incomingDistance;
			const sign = role === "from" ? 1 : -1;
			switch (transition.direction) {
				case "right":
					return { ...base, offsetX: -sign * distance * canvasWidth };
				case "up":
					return { ...base, offsetY: sign * distance * canvasHeight };
				case "down":
					return { ...base, offsetY: -sign * distance * canvasHeight };
				default:
					return { ...base, offsetX: sign * distance * canvasWidth };
			}
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
	}
}
