import type { ReactNode } from "react";
import { buildAdjustmentCssFilter } from "@/lib/effects/adjustment-layer";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import { buildMediaMaskStyle } from "@/lib/video/video-animation";
import { MediaMaskOverlay } from "./media-mask-overlay";
import type { ActiveElement } from "./types";

export function AdjustmentLayerStack({
	activeElements,
	currentTime,
	fps = 30,
	renderElement,
}: {
	activeElements: ActiveElement[];
	currentTime: number;
	fps?: number;
	renderElement: (elementData: ActiveElement, index: number) => ReactNode;
}) {
	const selectedMaskElementId = useMaskEditorStore(
		(state) => state.selectedElementId
	);
	const selectedMaskId = useMaskEditorStore((state) => state.selectedMaskId);
	const isEditingMask = useMaskEditorStore((state) => state.isEditing);
	let renderedLayers: ReactNode[] = [];
	for (let index = 0; index < activeElements.length; index++) {
		const elementData = activeElements[index];
		if (elementData.element.type !== "adjustment") {
			renderedLayers.push(renderElement(elementData, index));
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
