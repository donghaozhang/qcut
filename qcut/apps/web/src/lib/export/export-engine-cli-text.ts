import { generateASS } from "@qcut/editor-core";
import {
	sortTracksByOrder,
	type TimelineElement,
	type TimelineTrack,
} from "@/types/timeline";
import { buildTextASSOverlay } from "../export-cli/filters/text-ass-overlay";
import { resolveTextStyle } from "@/lib/text/text-style";

export interface TimelineAssLayer {
	content: string;
	blendMode: NonNullable<
		Extract<TimelineElement, { type: "text" }>["blendMode"]
	>;
	trackOrder: number;
	elementOrder: number;
}

export function buildTimelineAssLayers({
	tracks,
	canvasWidth,
	canvasHeight,
	fps,
}: {
	tracks: TimelineTrack[];
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
}): {
	layers: TimelineAssLayer[];
	renderedTextElementIds: Set<string>;
} {
	const layers: TimelineAssLayer[] = [];
	const renderedTextElementIds = new Set<string>();
	const orderedTracks = sortTracksByOrder(tracks);

	for (let trackOrder = 0; trackOrder < orderedTracks.length; trackOrder++) {
		const track = orderedTracks[trackOrder];
		if (track.hidden) continue;

		for (
			let elementOrder = 0;
			elementOrder < track.elements.length;
			elementOrder++
		) {
			const element = track.elements[elementOrder];
			if (element.hidden) continue;

			if (element.type === "text") {
				const layer = buildTextASSOverlay({
					tracks: [{ ...track, elements: [element] }],
					allTracks: orderedTracks,
					canvasWidth,
					canvasHeight,
					fps,
				});
				if (!layer.content) continue;
				layers.push({
					content: layer.content,
					blendMode: resolveTextStyle(element).blendMode,
					trackOrder,
					elementOrder,
				});
				renderedTextElementIds.add(element.id);
				continue;
			}

			if (element.type === "captions") {
				layers.push({
					content: generateASS([element], {
						resolution: { width: canvasWidth, height: canvasHeight },
						title: `QCut Caption ${element.id}`,
					}),
					blendMode: "normal",
					trackOrder,
					elementOrder,
				});
			}
		}
	}

	return { layers, renderedTextElementIds };
}
