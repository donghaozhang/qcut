import { hasMediaPortraitAdjustments } from "@qcut/editor-core";
import type { MediaPortraitAdjustments } from "@/types/timeline";
import { reportColorDegradation } from "@/lib/color/color-degradation";

export async function renderJianyingPortraitAdjustmentPreview({
	source,
	adjustments,
	frameNumber,
	sourceKey,
	timestampSeconds,
}: {
	source: ImageData;
	adjustments?: MediaPortraitAdjustments;
	frameNumber?: number;
	sourceKey?: string;
	timestampSeconds?: number;
}): Promise<ImageData | null> {
	if (!adjustments || !hasMediaPortraitAdjustments({ adjustments })) {
		return source;
	}
	const api = window.electronAPI?.jianyingPortraitAdjustment;
	if (!api) return null;
	try {
		const result = await api.render({
			width: source.width,
			height: source.height,
			rgba: new Uint8Array(
				source.data.buffer,
				source.data.byteOffset,
				source.data.byteLength
			),
			adjustments,
			...(frameNumber === undefined ? {} : { frameNumber }),
			...(sourceKey ? { sourceKey } : {}),
			...(timestampSeconds === undefined ? {} : { timestampSeconds }),
		});
		if (
			result.provider !== "jianying-local-swing-v1" ||
			result.width !== source.width ||
			result.height !== source.height ||
			result.rgba.byteLength !== source.data.byteLength
		) {
			throw new Error("剪映美颜美体返回了不匹配的画面");
		}
		return new ImageData(
			Uint8ClampedArray.from(result.rgba),
			result.width,
			result.height
		);
	} catch (cause) {
		reportColorDegradation({
			reason: "jianying-portrait-adjustment-fallback",
			detail: cause instanceof Error ? cause.message : String(cause),
		});
		return null;
	}
}
