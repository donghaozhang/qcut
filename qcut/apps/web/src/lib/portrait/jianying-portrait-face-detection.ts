import type { JianyingPortraitDetectedFace } from "@/types/electron";
import type { MediaPortraitPersonBindingAnchor } from "@/types/timeline";
import { colorPreviewCanvasSize } from "@/lib/color/color-preview-resolution";
import { portraitPreviewSourceKey } from "./portrait-preview-source-key";

export interface PortraitFaceDetection {
	faces: JianyingPortraitDetectedFace[];
	frameNumber: number;
	/** Faces beyond this position are listed but receive no effect. */
	appliedFaceLimit: number;
	unmatchedPersonBindingIds: string[];
}

interface PortraitDetectionFrame {
	source: ImageData;
	sourceKey?: string;
}

function previewRoot({ elementId }: { elementId: string }) {
	return Array.from(
		document.querySelectorAll<HTMLElement>("[data-preview-element-id]")
	).find((candidate) => candidate.dataset.previewElementId === elementId);
}

function drawPreviewSource({
	height,
	root,
	source,
	width,
}: {
	height?: number;
	root: HTMLElement;
	source: HTMLImageElement | HTMLVideoElement;
	width?: number;
}): ImageData | null {
	const rootRect = root.getBoundingClientRect();
	const targetSize =
		width && height
			? { width, height }
			: colorPreviewCanvasSize({
					width: rootRect.width,
					height: rootRect.height,
				});
	const sourceWidth =
		source instanceof HTMLImageElement
			? source.naturalWidth
			: source.videoWidth;
	const sourceHeight =
		source instanceof HTMLImageElement
			? source.naturalHeight
			: source.videoHeight;
	if (
		targetSize.width <= 0 ||
		targetSize.height <= 0 ||
		sourceWidth <= 0 ||
		sourceHeight <= 0
	) {
		return null;
	}
	const canvas = document.createElement("canvas");
	canvas.width = targetSize.width;
	canvas.height = targetSize.height;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) return null;
	const objectFit = getComputedStyle(source).objectFit;
	const fitScale =
		objectFit === "cover"
			? Math.max(
					targetSize.width / sourceWidth,
					targetSize.height / sourceHeight
				)
			: Math.min(
					targetSize.width / sourceWidth,
					targetSize.height / sourceHeight
				);
	const drawWidth =
		objectFit === "fill" ? targetSize.width : sourceWidth * fitScale;
	const drawHeight =
		objectFit === "fill" ? targetSize.height : sourceHeight * fitScale;
	context.drawImage(
		source,
		(targetSize.width - drawWidth) / 2,
		(targetSize.height - drawHeight) / 2,
		drawWidth,
		drawHeight
	);
	return context.getImageData(0, 0, targetSize.width, targetSize.height);
}

export function captureJianyingPortraitDetectionFrame({
	elementId,
}: {
	elementId: string;
}): PortraitDetectionFrame | null {
	const root = previewRoot({ elementId });
	if (!root) return null;
	const image = root.querySelector<HTMLImageElement>(
		'img[data-color-source="true"]'
	);
	const video = root.querySelector<HTMLVideoElement>("video[data-video-id]");
	const source = image ?? video;
	const sourceSelector = image
		? 'img[data-color-source="true"]'
		: video?.dataset.videoId
			? `video[data-video-id="${video.dataset.videoId.replaceAll('"', '\\"')}"]`
			: undefined;
	const sourceLocation = source?.currentSrc || source?.src || sourceSelector;
	const sourceKey =
		sourceSelector && sourceLocation
			? portraitPreviewSourceKey({
					elementId,
					mediaId: source?.dataset.colorSourceKey,
					sourceSessionId: root.dataset.portraitSourceSession,
					sourceLocation,
					sourceSelector,
				})
			: undefined;
	const canvas = root.querySelector<HTMLCanvasElement>(
		'[data-testid="color-preview-canvas"]'
	);
	let rawFrame: ImageData | null = null;
	const targetSize =
		canvas && canvas.width > 0 && canvas.height > 0
			? { width: canvas.width, height: canvas.height }
			: {};
	if (image?.complete) {
		rawFrame = drawPreviewSource({ root, source: image, ...targetSize });
	} else if (video && video.readyState >= 2) {
		rawFrame = drawPreviewSource({ root, source: video, ...targetSize });
	}
	if (rawFrame) {
		return { source: rawFrame, ...(sourceKey ? { sourceKey } : {}) };
	}
	const context = canvas?.getContext("2d", { willReadFrequently: true });
	if (canvas && context && canvas.width > 0 && canvas.height > 0) {
		return {
			source: context.getImageData(0, 0, canvas.width, canvas.height),
			...(sourceKey ? { sourceKey } : {}),
		};
	}
	return null;
}

/**
 * Detects the faces the native runtime is tracking on one frame.
 *
 * Throws rather than returning an empty list when the pipeline fails: an empty
 * result must only ever mean "this frame genuinely has no faces", otherwise the
 * panel would tell the user there is nobody in a shot that clearly has someone.
 */
export async function detectJianyingPortraitFaces({
	frameNumber,
	personBindings,
	source,
	sourceKey,
}: {
	frameNumber: number;
	personBindings: {
		personBindingId: string;
		anchor: MediaPortraitPersonBindingAnchor;
	}[];
	source: ImageData;
	sourceKey?: string;
}): Promise<PortraitFaceDetection> {
	const api = window.electronAPI?.jianyingPortraitAdjustment;
	if (!api?.detect) {
		throw new Error("本机人脸检测不可用");
	}
	const result = await api.detect({
		width: source.width,
		height: source.height,
		rgba: new Uint8Array(
			source.data.buffer,
			source.data.byteOffset,
			source.data.byteLength
		),
		...(sourceKey ? { sourceKey } : {}),
		frameNumber,
		personBindings,
	});
	if (result.provider !== "jianying-local-swing-v1") {
		throw new Error("本机人脸检测返回了未知的提供方");
	}
	return {
		faces: [...result.faces].sort((left, right) => {
			// Largest first, so "face 1" is the subject rather than a bystander,
			// then by track id so equal-sized faces keep a stable order.
			const leftArea = left.rect.width * left.rect.height;
			const rightArea = right.rect.width * right.rect.height;
			if (leftArea !== rightArea) return rightArea - leftArea;
			return left.trackId - right.trackId;
		}),
		appliedFaceLimit: result.appliedFaceLimit,
		frameNumber,
		unmatchedPersonBindingIds: result.unmatchedPersonBindingIds,
	};
}
