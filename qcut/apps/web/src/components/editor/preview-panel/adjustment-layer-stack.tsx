import type { ReactNode } from "react";
import { buildAdjustmentCssFilter } from "@/lib/effects/adjustment-layer";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import { buildMediaMaskStyle } from "@/lib/video/video-animation";
import {
	DEFAULT_MEDIA_COLOR_SETTINGS,
	resolveMediaColorAtTime,
} from "@/lib/color/color-properties";
import type { BrowserColorGradeLayer } from "@/lib/color/browser-color-rendering";
import type { AdjustmentElement, MediaColorSettings } from "@/types/timeline";
import { MediaMaskOverlay } from "./media-mask-overlay";
import { EffectOverlayLayers } from "@/components/editor/effects/effect-overlay-layers";
import { buildElementEffectsRendering } from "./use-effects-rendering";
import type { ActiveElement } from "./types";

function pixelColorSettings({
	settings,
}: {
	settings: MediaColorSettings;
}): MediaColorSettings {
	return {
		...DEFAULT_MEDIA_COLOR_SETTINGS,
		lut: settings.lut,
		multiPass: settings.multiPass,
	};
}

export function resolveAdjustmentPixelPreviewLayer({
	element,
	currentTime,
	fps,
}: {
	element: AdjustmentElement;
	currentTime: number;
	fps: number;
}): BrowserColorGradeLayer | undefined {
	const settings = resolveMediaColorAtTime({ element, currentTime, fps });
	const hasLut = settings.lut.enabled && Boolean(settings.lut.cube);
	const hasMultiPass = Boolean(settings.multiPass?.enabled);
	if (!settings.enabled || (!hasLut && !hasMultiPass)) {
		return;
	}
	return {
		settings: pixelColorSettings({ settings }),
		masks: element.masks ?? [],
		opacity: element.opacity ?? 1,
	};
}

function resolvePixelLayersByElementIndex({
	activeElements,
	currentTime,
	fps,
}: {
	activeElements: ActiveElement[];
	currentTime: number;
	fps: number;
}): Map<number, BrowserColorGradeLayer[]> {
	const layersByIndex = new Map<number, BrowserColorGradeLayer[]>();
	let layersAbove: BrowserColorGradeLayer[] = [];
	for (let index = activeElements.length - 1; index >= 0; index--) {
		const element = activeElements[index].element;
		if (element.type === "adjustment") {
			const layer = resolveAdjustmentPixelPreviewLayer({
				element,
				currentTime,
				fps,
			});
			if (layer) layersAbove = [layer, ...layersAbove];
			continue;
		}
		layersByIndex.set(index, layersAbove);
	}
	return layersByIndex;
}

export function AdjustmentLayerStack({
	activeElements,
	currentTime,
	fps = 30,
	renderElement,
}: {
	activeElements: ActiveElement[];
	currentTime: number;
	fps?: number;
	renderElement: (
		elementData: ActiveElement,
		index: number,
		lutLayers: BrowserColorGradeLayer[]
	) => ReactNode;
}) {
	const selectedMaskElementId = useMaskEditorStore(
		(state) => state.selectedElementId
	);
	const selectedMaskId = useMaskEditorStore((state) => state.selectedMaskId);
	const isEditingMask = useMaskEditorStore((state) => state.isEditing);
	const pixelLayersByIndex = resolvePixelLayersByElementIndex({
		activeElements,
		currentTime,
		fps,
	});
	let renderedLayers: ReactNode[] = [];
	for (let index = 0; index < activeElements.length; index++) {
		const elementData = activeElements[index];
		if (elementData.element.type === "effect") {
			// Region effect segment (untargeted): everything rendered so far is
			// the composite below it — wrap it exactly the way an adjustment
			// layer does, so the segment styles text and stickers too, and its
			// overlay programs (vignette, particles) draw once over the group
			// instead of once per clip. Targeted effect elements and
			// jianying-local runtime effects stay out of this fold.
			const segment = elementData.element;
			if (
				segment.targetElementId ||
				segment.effect.engine === "jianying-local"
			) {
				continue;
			}
			const rendering = buildElementEffectsRendering({
				effects: [segment.effect],
			});
			if (!rendering.hasEffects) continue;
			renderedLayers = [
				<div
					key={segment.id}
					className="absolute inset-0"
					style={{ zIndex: index + 1 }}
					data-testid={`region-effect-layer-${segment.id}`}
				>
					<div
						className="absolute inset-0"
						style={{
							filter: rendering.filterStyle || undefined,
							isolation: "isolate",
						}}
					>
						{renderedLayers}
					</div>
					<EffectOverlayLayers
						program={rendering.renderProgram}
						parameters={rendering.parameters}
					/>
				</div>,
			];
			continue;
		}
		if (elementData.element.type !== "adjustment") {
			renderedLayers.push(
				renderElement(elementData, index, pixelLayersByIndex.get(index) ?? [])
			);
			continue;
		}

		const adjustment = elementData.element;
		const filter = buildAdjustmentCssFilter({
			element: adjustment,
			currentTime,
			fps,
		});
		const currentFrame = Math.max(
			0,
			Math.round((currentTime - adjustment.startTime) * fps)
		);
		const masks = adjustment.masks ?? [];
		const selectedMask =
			isEditingMask && selectedMaskElementId === adjustment.id
				? masks.find((mask) => mask.id === selectedMaskId)
				: undefined;
		renderedLayers = [
			<div
				key={adjustment.id}
				className="absolute inset-0"
				style={{
					zIndex: index + 1,
				}}
				data-testid={`adjustment-layer-${adjustment.id}`}
			>
				<div
					className="absolute inset-0"
					style={{
						...buildMediaMaskStyle(masks, undefined, currentFrame),
						filter: filter || undefined,
						opacity: adjustment.opacity ?? 1,
						isolation: "isolate",
					}}
				>
					{renderedLayers}
				</div>
				{selectedMask ? (
					<MediaMaskOverlay
						element={adjustment}
						trackId={elementData.track.id}
						mask={selectedMask}
						currentTime={currentTime}
						fps={fps}
					/>
				) : null}
			</div>,
		];
	}

	return <>{renderedLayers}</>;
}
