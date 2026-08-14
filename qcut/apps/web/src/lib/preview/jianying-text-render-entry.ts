import type {
	JianyingTextRuntimeRenderRequest,
	JianyingTextRuntimeRenderResult,
} from "@/types/electron/api-jianying-text-runtime";
import type { TextOverlayBounds } from "@/lib/text/text-overlay-bounds";
import {
	sortTracksByOrder,
	type TextElement,
	type TimelineTrack,
} from "@/types/timeline";

export interface JianyingTextRenderEntry {
	requestId: string;
	elementId: string;
	trackOrder: number;
	elementOrder: number;
	startTime: number;
	endTime: number;
	element: TextElement;
	renderRequest: JianyingTextRuntimeRenderRequest;
}

const JIANYING_TEXT_OVERLAY_BREATHING_PX = 6;

export function resolveJianyingTextRenderContentBounds({
	entry,
	result,
}: {
	entry: JianyingTextRenderEntry;
	result: JianyingTextRuntimeRenderResult;
}): TextOverlayBounds | null {
	const bounds = result.contentBounds;
	if (!bounds) return null;
	const renderWidth = Math.round(entry.renderRequest.transform.width);
	const renderHeight = Math.round(entry.renderRequest.transform.height);
	const scaleX = entry.renderRequest.transform.width / renderWidth;
	const scaleY = entry.renderRequest.transform.height / renderHeight;
	return {
		offsetX: (bounds.x + bounds.width / 2 - renderWidth / 2) * scaleX,
		offsetY: (bounds.y + bounds.height / 2 - renderHeight / 2) * scaleY,
		width: bounds.width * scaleX + JIANYING_TEXT_OVERLAY_BREATHING_PX * 2,
		height: bounds.height * scaleY + JIANYING_TEXT_OVERLAY_BREATHING_PX * 2,
	};
}

export function createJianyingTextRenderEntry({
	element,
	requestId,
	trackOrder,
	elementOrder,
	canvasWidth,
	canvasHeight,
	fps,
	mode,
	timelineTime,
}: {
	element: TextElement;
	requestId: string;
	trackOrder: number;
	elementOrder: number;
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	mode: "frame" | "sequence";
	timelineTime?: number;
}): JianyingTextRenderEntry | null {
	const reference = element.jianyingTextStyle;
	if (!reference || element.hidden) return null;
	const startTime = element.startTime + element.trimStart;
	const endTime = element.startTime + element.duration - element.trimEnd;
	if (!(endTime > startTime)) return null;
	if (
		mode === "frame" &&
		(timelineTime === undefined ||
			timelineTime < startTime ||
			timelineTime >= endTime)
	) {
		return null;
	}
	const sourceStart =
		mode === "frame"
			? Math.min(
					element.duration,
					Math.max(
						element.trimStart,
						(timelineTime ?? startTime) - element.startTime
					)
				)
			: element.trimStart;
	const frameCount =
		mode === "frame"
			? 1
			: Math.max(1, Math.ceil((endTime - startTime) * fps - 1e-7));
	return {
		requestId,
		elementId: element.id,
		trackOrder,
		elementOrder,
		startTime,
		endTime,
		element,
		renderRequest: {
			requestId,
			reference,
			content: element.content,
			fontAssetId: element.fontAsset?.assetId,
			fontSize: element.fontSize,
			canvasWidth,
			canvasHeight,
			transform: {
				x: element.x,
				y: element.y,
				width: element.width ?? 512,
				height: element.height ?? 512,
				rotation: element.rotation,
				opacity: element.opacity,
			},
			sourceStart,
			elementDuration: element.duration,
			frameCount,
			fps,
			...(mode === "sequence" ? { previewVideo: true } : {}),
		},
	};
}

export function collectJianyingTextFrameEntries({
	tracks,
	timelineTime,
	requestId,
	canvasWidth,
	canvasHeight,
	fps,
}: {
	tracks: TimelineTrack[];
	timelineTime: number;
	requestId: string;
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
}) {
	const entries: JianyingTextRenderEntry[] = [];
	const orderedTracks = sortTracksByOrder([...tracks]);
	for (let trackOrder = 0; trackOrder < orderedTracks.length; trackOrder += 1) {
		const track = orderedTracks[trackOrder];
		if (track.hidden) continue;
		for (
			let elementOrder = 0;
			elementOrder < track.elements.length;
			elementOrder += 1
		) {
			const element = track.elements[elementOrder];
			if (element.type !== "text") continue;
			const entry = createJianyingTextRenderEntry({
				element,
				requestId: `${requestId}:jy:${trackOrder}:${elementOrder}`,
				trackOrder,
				elementOrder,
				canvasWidth,
				canvasHeight,
				fps,
				mode: "frame",
				timelineTime,
			});
			if (entry) entries.push(entry);
		}
	}
	return entries;
}

export function validateJianyingTextRenderResult({
	entry,
	result,
}: {
	entry: JianyingTextRenderEntry;
	result: JianyingTextRuntimeRenderResult;
}) {
	if (
		result.requestId !== entry.requestId ||
		result.packageHash !== entry.element.jianyingTextStyle?.packageHash ||
		result.frameCount !== entry.renderRequest.frameCount
	) {
		throw new Error("剪映花字预览响应与请求不匹配");
	}
	return result;
}
