import { generateASS } from "@qcut/editor-core";
import {
	sortTracksByOrder,
	type TimelineElement,
	type TimelineTrack,
} from "@/types/timeline";
import { buildTextASSOverlay } from "../export-cli/filters/text-ass-overlay";
import { resolveTextStyle } from "@/lib/text/text-style";
import { stripMarkdownSyntax } from "@/lib/markdown";

function markdownAsTextElement({
	element,
}: {
	element: Extract<TimelineElement, { type: "markdown" }>;
}): Extract<TimelineElement, { type: "text" }> {
	return {
		id: element.id,
		type: "text",
		name: element.name,
		duration: element.duration,
		startTime: element.startTime,
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
		hidden: element.hidden,
		content: stripMarkdownSyntax({ markdown: element.markdownContent }),
		fontSize: element.fontSize,
		fontFamily: element.fontFamily,
		color: element.textColor,
		backgroundColor: element.backgroundColor,
		textAlign: "left",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: element.x,
		y: element.y,
		width: element.width,
		height: element.height,
		rotation: element.rotation,
		opacity: element.opacity,
	};
}

export interface TimelineAssLayer {
	content: string;
	blendMode: NonNullable<
		Extract<TimelineElement, { type: "text" }>["blendMode"]
	>;
	trackOrder: number;
	elementOrder: number;
}

export type CaptionExportPlatform = "darwin" | "win32" | "linux";

export function resolveCjkExportFont({
	platform,
}: {
	platform?: CaptionExportPlatform;
}): string | undefined {
	if (platform === "darwin") return "Hiragino Sans GB";
	if (platform === "win32") return "Microsoft YaHei";
	if (platform === "linux") return "Noto Sans CJK SC";
	return undefined;
}

export function buildTimelineAssLayers({
	tracks,
	canvasWidth,
	canvasHeight,
	fps,
	platform,
	excludedTextElementIds = new Set(),
}: {
	tracks: TimelineTrack[];
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	platform?: CaptionExportPlatform;
	excludedTextElementIds?: ReadonlySet<string>;
}): {
	layers: TimelineAssLayer[];
	renderedTextElementIds: Set<string>;
} {
	const layers: TimelineAssLayer[] = [];
	const renderedTextElementIds = new Set<string>();
	const orderedTracks = sortTracksByOrder(tracks);
	const cjkFontFamily = resolveCjkExportFont({ platform });

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

			if (element.type === "text" && !excludedTextElementIds.has(element.id)) {
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
						cjkFontFamily,
					}),
					blendMode: "normal",
					trackOrder,
					elementOrder,
				});
				continue;
			}

			if (element.type === "markdown") {
				const textElement = markdownAsTextElement({ element });
				const layer = buildTextASSOverlay({
					tracks: [{ ...track, type: "text", elements: [textElement] }],
					allTracks: orderedTracks,
					canvasWidth,
					canvasHeight,
					fps,
				});
				if (!layer.content) continue;
				layers.push({
					content: layer.content,
					blendMode: "normal",
					trackOrder,
					elementOrder,
				});
				renderedTextElementIds.add(element.id);
			}
		}
	}

	return { layers, renderedTextElementIds };
}
