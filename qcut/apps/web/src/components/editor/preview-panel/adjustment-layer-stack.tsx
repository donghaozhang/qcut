import type { ReactNode } from "react";
import { buildAdjustmentCssFilter } from "@/lib/effects/adjustment-layer";
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
		renderedLayers = [
			<div
				key={adjustment.id}
				className="absolute inset-0"
				style={{
					filter: filter || undefined,
					opacity: adjustment.opacity ?? 1,
					isolation: "isolate",
					zIndex: index + 1,
				}}
				data-testid={`adjustment-layer-${adjustment.id}`}
			>
				{renderedLayers}
			</div>,
		];
	}

	return <>{renderedLayers}</>;
}
