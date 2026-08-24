import type { JianyingPortraitDetectedFace } from "@/types/electron";

export interface PortraitFaceDetection {
	faces: JianyingPortraitDetectedFace[];
	/** Faces beyond this position are listed but receive no effect. */
	appliedFaceLimit: number;
}

/**
 * Detects the faces the native runtime is tracking on one frame.
 *
 * Throws rather than returning an empty list when the pipeline fails: an empty
 * result must only ever mean "this frame genuinely has no faces", otherwise the
 * panel would tell the user there is nobody in a shot that clearly has someone.
 */
export async function detectJianyingPortraitFaces({
	source,
}: {
	source: ImageData;
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
	};
}
