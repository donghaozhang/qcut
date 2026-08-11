import type { TextRasterLayer } from "../../../ffmpeg/types.js";
import type { JianyingTextOverlay } from "./types.js";

const FRAME_EPSILON = 1e-7;

function requirePositiveDimension({
	value,
	label,
}: {
	value: number;
	label: string;
}): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be a positive finite number.`);
	}
	return value;
}

function renderRequestId({
	jobId,
	index,
}: {
	jobId: string;
	index: number;
}): string {
	const safeJobId = jobId.replace(/[^A-Za-z0-9._:-]/g, "_");
	return `export:${safeJobId}:${index}`.slice(0, 160);
}

export async function renderJianyingTextRasterLayers({
	jobId,
	overlays,
	projectCanvas,
	outputCanvas,
	projectFps,
}: {
	jobId: string;
	overlays: readonly JianyingTextOverlay[];
	projectCanvas: { width: number; height: number };
	outputCanvas: { width: number; height: number };
	projectFps: number;
}): Promise<TextRasterLayer[]> {
	const projectWidth = requirePositiveDimension({
		value: projectCanvas.width,
		label: "Project canvas width",
	});
	const projectHeight = requirePositiveDimension({
		value: projectCanvas.height,
		label: "Project canvas height",
	});
	const outputWidth = requirePositiveDimension({
		value: outputCanvas.width,
		label: "Export canvas width",
	});
	const outputHeight = requirePositiveDimension({
		value: outputCanvas.height,
		label: "Export canvas height",
	});
	const fps = requirePositiveDimension({
		value: projectFps,
		label: "Project FPS",
	});
	const scaleX = outputWidth / projectWidth;
	const scaleY = outputHeight / projectHeight;
	const fontScale = Math.min(scaleX, scaleY);
	const { renderJianyingText } = await import(
		"../../../jianying-text-runtime/render.js"
	);

	return Promise.all(
		overlays.map(async (overlay, index) => {
			const requestId = renderRequestId({ jobId, index });
			const frameCount = Math.max(
				1,
				Math.ceil((overlay.endTime - overlay.startTime) * fps - FRAME_EPSILON)
			);
			const result = await renderJianyingText({
				request: {
					requestId,
					reference: overlay.reference,
					content: overlay.content,
					fontSize: overlay.fontSize * fontScale,
					canvasWidth: outputWidth,
					canvasHeight: outputHeight,
					transform: {
						x: overlay.x * scaleX,
						y: overlay.y * scaleY,
						width: overlay.width * scaleX,
						height: overlay.height * scaleY,
						rotation: overlay.rotation,
						opacity: overlay.opacity,
					},
					sourceStart: overlay.sourceStart,
					elementDuration: overlay.elementDuration,
					frameCount,
					fps,
				},
			});
			if (
				result.requestId !== requestId ||
				result.packageHash !== overlay.reference.packageHash ||
				result.frameCount !== frameCount
			) {
				throw new Error(
					`Jianying text renderer returned a mismatched result for ${overlay.id}.`
				);
			}
			return {
				elementId: overlay.id,
				source: result.source,
				startTime: overlay.startTime,
				endTime: overlay.endTime,
				blendMode: overlay.blendMode,
				x: result.x,
				y: result.y,
				trackOrder: overlay.trackOrder,
				elementOrder: overlay.elementOrder,
			} satisfies TextRasterLayer;
		})
	);
}
