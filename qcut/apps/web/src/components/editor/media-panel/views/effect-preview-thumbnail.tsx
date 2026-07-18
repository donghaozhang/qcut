import { useEffect, useRef } from "react";
import { getEffectMotionState } from "@/lib/effects/effect-motion-preview";
import { parametersToCSSFilters } from "@/lib/effects/effects-utils";
import type { VisualEffectCatalogEntry } from "@/lib/effects/effect-catalog-types";

const PREVIEW_WIDTH = 160;
const PREVIEW_HEIGHT = 90;
const PREVIEW_DURATION_SECONDS = 2;
const PREVIEW_SAMPLE_COUNT = 17;

export function EffectPreviewThumbnail({
	entry,
	source,
}: {
	entry: VisualEffectCatalogEntry;
	source: string;
}) {
	const imageRef = useRef<HTMLImageElement>(null);

	useEffect(() => {
		const image = imageRef.current;
		if (!image || typeof image.animate !== "function") return;
		if (!entry.preset.renderProgram) return;
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

		const keyframes = Array.from(
			{ length: PREVIEW_SAMPLE_COUNT },
			(_item, index) => {
				const progress = index / (PREVIEW_SAMPLE_COUNT - 1);
				const state = getEffectMotionState({
					program: entry.preset.renderProgram,
					localTime: progress * PREVIEW_DURATION_SECONDS,
					duration: PREVIEW_DURATION_SECONDS,
					canvasWidth: PREVIEW_WIDTH,
					canvasHeight: PREVIEW_HEIGHT,
				});
				return {
					transform: `translate3d(${state.offsetX}px, ${state.offsetY}px, 0) rotate(${state.rotation}deg) scale(${state.scale})`,
					opacity: state.opacity,
					offset: progress,
				};
			}
		);
		const animation = image.animate(keyframes, {
			duration: PREVIEW_DURATION_SECONDS * 1000,
			iterations: Number.POSITIVE_INFINITY,
			direction: "alternate",
			easing: "linear",
		});
		return () => animation.cancel();
	}, [entry]);

	return (
		<img
			ref={imageRef}
			src={source}
			alt=""
			className="size-full scale-[1.04] object-cover"
			style={{ filter: parametersToCSSFilters(entry.preset.parameters) }}
			draggable={false}
		/>
	);
}
