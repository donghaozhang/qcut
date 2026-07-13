import type { ClipTransitionLayerPresentation } from "@qcut/editor-core/timeline";

export {
	CLIP_TRANSITION_PROGRESS_STOPS,
	easeClipTransitionProgress,
	getClipTransitionLayerPresentation,
	type ClipTransitionLayerPresentation,
	type ClipTransitionRole,
} from "@qcut/editor-core/timeline";

export function buildClipTransitionCssFilter({
	presentation,
}: {
	presentation: ClipTransitionLayerPresentation;
}): string | undefined {
	const filters = [
		`blur(${presentation.blur ?? 0}px)`,
		`brightness(${presentation.brightness ?? 1})`,
		`saturate(${presentation.saturation ?? 1})`,
		`hue-rotate(${presentation.hueRotate ?? 0}deg)`,
	];
	const hasVisibleFilter =
		(presentation.blur ?? 0) !== 0 ||
		(presentation.brightness ?? 1) !== 1 ||
		(presentation.saturation ?? 1) !== 1 ||
		(presentation.hueRotate ?? 0) !== 0;
	return hasVisibleFilter ? filters.join(" ") : undefined;
}

export function buildClipTransitionCssTransform({
	presentation,
}: {
	presentation: ClipTransitionLayerPresentation;
}): string {
	return `translate3d(${presentation.offsetX}px, ${presentation.offsetY}px, 0) rotate(${presentation.rotation ?? 0}deg) scale(${presentation.scale ?? 1})`;
}
