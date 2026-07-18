import { useEffect, useRef } from "react";
import { getEffectMotionState } from "@/lib/effects/effect-motion-preview";
import { parametersToCSSFilters } from "@/lib/effects/effects-utils";
import type { VisualEffectCatalogEntry } from "@/lib/effects/effect-catalog-types";
import { EffectOverlayLayers } from "@/components/editor/effects/effect-overlay-layers";
import { EffectCompositeCanvas } from "@/components/editor/effects/effect-composite-canvas";
import { Volume2 } from "lucide-react";

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
		<div className="relative size-full overflow-hidden">
			<img
				ref={imageRef}
				src={source}
				alt=""
				className="size-full scale-[1.04] object-cover"
				style={{ filter: parametersToCSSFilters(entry.preset.parameters) }}
				data-effect-preview-base="true"
				draggable={false}
			/>
			<EffectCompositeCanvas
				program={entry.preset.renderProgram}
				sourceSelector='img[data-effect-preview-base="true"]'
				fitMode="cover"
			/>
			<EffectOverlayLayers program={entry.preset.renderProgram} />
			{entry.preset.audioCompanion ? (
				<span
					className="absolute bottom-1 left-1 flex size-5 items-center justify-center rounded bg-black/70 text-white"
					title="Includes sound effect"
					data-effect-audio-companion={entry.preset.audioCompanion.resourceId}
				>
					<Volume2 className="size-3" aria-hidden="true">
						<title>Includes sound effect</title>
					</Volume2>
				</span>
			) : null}
		</div>
	);
}
