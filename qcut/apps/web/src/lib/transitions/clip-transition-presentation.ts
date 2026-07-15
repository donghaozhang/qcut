import type { ClipTransitionLayerPresentation } from "@qcut/editor-core/timeline";
import type { CSSProperties } from "react";

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
	return [
		presentation.perspective
			? `perspective(${presentation.perspective}px)`
			: undefined,
		`translate3d(${presentation.offsetX}px, ${presentation.offsetY}px, 0)`,
		`rotateX(${presentation.rotationX ?? 0}deg)`,
		`rotateY(${presentation.rotationY ?? 0}deg)`,
		`rotateZ(${presentation.rotation ?? 0}deg)`,
		`skew(${presentation.skewX ?? 0}deg, ${presentation.skewY ?? 0}deg)`,
		`scale(${presentation.scale ?? 1})`,
	]
		.filter(Boolean)
		.join(" ");
}

export function buildClipTransitionAnchoredTransform({
	presentation,
	rotation = 0,
	scaleX = 1,
	scaleY = 1,
}: {
	presentation: ClipTransitionLayerPresentation;
	rotation?: number;
	scaleX?: number;
	scaleY?: number;
}): string {
	const transitionScale = presentation.scale ?? 1;
	return [
		"translate(-50%, -50%)",
		presentation.perspective
			? `perspective(${presentation.perspective}px)`
			: undefined,
		`rotateX(${presentation.rotationX ?? 0}deg)`,
		`rotateY(${presentation.rotationY ?? 0}deg)`,
		`rotateZ(${rotation + (presentation.rotation ?? 0)}deg)`,
		`skew(${presentation.skewX ?? 0}deg, ${presentation.skewY ?? 0}deg)`,
		`scale(${scaleX * transitionScale}, ${scaleY * transitionScale})`,
	]
		.filter(Boolean)
		.join(" ");
}

export function buildClipTransitionMaskStyle({
	presentation,
}: {
	presentation: ClipTransitionLayerPresentation;
}): CSSProperties {
	if (!presentation.maskImage) return {};
	return {
		maskImage: presentation.maskImage,
		WebkitMaskImage: presentation.maskImage,
		maskSize: presentation.maskSize,
		WebkitMaskSize: presentation.maskSize,
		maskPosition: presentation.maskPosition,
		WebkitMaskPosition: presentation.maskPosition,
		maskRepeat: "repeat",
		WebkitMaskRepeat: "repeat",
	};
}

export function buildClipTransitionContentStyle({
	presentation,
	baseTransform,
}: {
	presentation: ClipTransitionLayerPresentation;
	baseTransform?: string;
}): CSSProperties {
	const pixelScale = Math.max(1, presentation.pixelScale ?? 1);
	if (pixelScale === 1) {
		return {
			opacity: presentation.contentOpacity,
			transform: baseTransform,
		};
	}

	return {
		opacity: presentation.contentOpacity,
		width: `${100 / pixelScale}%`,
		height: `${100 / pixelScale}%`,
		transform: [baseTransform, `scale(${pixelScale})`]
			.filter(Boolean)
			.join(" "),
		transformOrigin: "top left",
		imageRendering: "pixelated",
	};
}

export function buildClipTransitionOverlayStyle({
	presentation,
}: {
	presentation: ClipTransitionLayerPresentation;
}): CSSProperties | null {
	if (!presentation.overlayBackground || !presentation.overlayOpacity) {
		return null;
	}
	return {
		position: "absolute",
		inset: 0,
		pointerEvents: "none",
		background: presentation.overlayBackground,
		opacity: presentation.overlayOpacity,
		mixBlendMode: presentation.overlayBlendMode ?? "normal",
	};
}
