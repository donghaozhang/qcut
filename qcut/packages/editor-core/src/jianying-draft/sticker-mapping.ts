import type { MediaElement, StickerElement } from "../types/timeline.js";
import {
	mapMediaElementToJianying,
	type MappedMediaElement,
} from "./media-mapping.js";
import type {
	JianyingDraftTargetPlatform,
	QCutDraftExportImageMedia,
} from "./types.js";

const DEFAULT_STICKER_POSITION_PERCENT = 50;
const DEFAULT_STICKER_SIZE_PERCENT = 15;

interface StickerGeometry {
	centerOffsetX: number;
	centerOffsetY: number;
	scaleX: number;
	scaleY: number;
}

function resolveStickerGeometry({
	canvasHeight,
	canvasWidth,
	element,
	media,
}: {
	canvasHeight: number;
	canvasWidth: number;
	element: StickerElement;
	media: QCutDraftExportImageMedia;
}): StickerGeometry {
	const shortSide = Math.min(canvasWidth, canvasHeight);
	const boxWidth =
		((element.width ?? DEFAULT_STICKER_SIZE_PERCENT) / 100) * shortSide;
	const boxHeight =
		((element.height ?? DEFAULT_STICKER_SIZE_PERCENT) / 100) * shortSide;
	const sourceFitScale = Math.min(
		canvasWidth / media.width,
		canvasHeight / media.height
	);
	const fittedSourceWidth = media.width * sourceFitScale;
	const fittedSourceHeight = media.height * sourceFitScale;
	const maintainAspectRatio = element.maintainAspectRatio ?? true;
	let scaleX = boxWidth / fittedSourceWidth;
	let scaleY = boxHeight / fittedSourceHeight;

	if (maintainAspectRatio) {
		const contentScale = Math.min(
			boxWidth / media.width,
			boxHeight / media.height
		);
		const uniformScale = contentScale / sourceFitScale;
		scaleX = uniformScale;
		scaleY = uniformScale;
	}

	return {
		centerOffsetX:
			((element.x ?? DEFAULT_STICKER_POSITION_PERCENT) / 100) * canvasWidth -
			canvasWidth / 2,
		centerOffsetY:
			((element.y ?? DEFAULT_STICKER_POSITION_PERCENT) / 100) * canvasHeight -
			canvasHeight / 2,
		scaleX,
		scaleY,
	};
}

export function mapStaticStickerToJianying({
	canvasHeight,
	canvasWidth,
	draftOutputDirectory,
	element,
	media,
	targetPlatform,
}: {
	canvasHeight: number;
	canvasWidth: number;
	draftOutputDirectory: string;
	element: StickerElement;
	media: QCutDraftExportImageMedia;
	targetPlatform: JianyingDraftTargetPlatform;
}): MappedMediaElement {
	const timelineDuration =
		element.duration - element.trimStart - element.trimEnd;
	const geometry = resolveStickerGeometry({
		canvasHeight,
		canvasWidth,
		element,
		media,
	});
	const mediaElement: MediaElement = {
		duration: timelineDuration,
		id: element.id,
		maintainAspectRatio: element.maintainAspectRatio ?? true,
		mediaId: media.id,
		name: element.name,
		opacity: element.opacity ?? 1,
		rotation: element.rotation ?? 0,
		scaleX: geometry.scaleX,
		scaleY: geometry.scaleY,
		startTime: element.startTime,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
		x: geometry.centerOffsetX,
		y: geometry.centerOffsetY,
	};

	return mapMediaElementToJianying({
		canvasHeight,
		canvasWidth,
		draftOutputDirectory,
		element: mediaElement,
		media,
		targetPlatform,
		timelineDuration,
	});
}
