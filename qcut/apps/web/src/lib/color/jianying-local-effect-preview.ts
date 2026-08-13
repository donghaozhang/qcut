import type { MediaColorSettings } from "@/types/timeline";
import { reportColorDegradation } from "./color-degradation";

export function canRenderJianyingLocalEffect({
	settings,
}: {
	settings: MediaColorSettings;
}): boolean {
	const multiPass = settings.multiPass;
	return Boolean(
		settings.enabled &&
			multiPass?.enabled &&
			multiPass.fidelity === "native-local" &&
			multiPass.nativeEffect?.provider === "jianying-local-effect-v1" &&
			multiPass.nativeEffect.resourceId
	);
}

export function blendJianyingLocalEffect({
	source,
	rendered,
	maskData,
}: {
	source: ImageData;
	rendered: Uint8Array;
	maskData?: Uint8ClampedArray;
}): ImageData {
	if (rendered.length !== source.data.length) {
		throw new Error("剪映本机滤镜返回了错误的像素数量");
	}
	if (maskData && maskData.length !== source.data.length) {
		throw new Error("调色蒙版像素数量与画面不一致");
	}
	const output = new ImageData(
		new Uint8ClampedArray(source.data),
		source.width,
		source.height
	);
	for (let index = 0; index < output.data.length; index += 4) {
		const amount = maskData ? maskData[index + 3] / 255 : 1;
		for (let channel = 0; channel < 3; channel += 1) {
			output.data[index + channel] =
				source.data[index + channel] +
				(rendered[index + channel] - source.data[index + channel]) * amount;
		}
	}
	return output;
}

export async function renderJianyingLocalEffectPreview({
	source,
	settings,
	maskData,
	frameSeed = 0,
	sourceKey,
	timestampSeconds,
}: {
	source: ImageData;
	settings: MediaColorSettings;
	maskData?: Uint8ClampedArray;
	frameSeed?: number;
	sourceKey?: string;
	timestampSeconds?: number;
}): Promise<ImageData | null> {
	if (!canRenderJianyingLocalEffect({ settings })) return null;
	const nativeEffect = settings.multiPass?.nativeEffect;
	if (!nativeEffect) return null;
	const intensity = settings.multiPass?.intensity ?? 0;
	if (intensity <= 0) {
		return new ImageData(
			new Uint8ClampedArray(source.data),
			source.width,
			source.height
		);
	}
	const api = window.electronAPI?.jianyingFilterLab;
	if (!api) return null;
	try {
		const result = await api.renderLocalEffect({
			resourceId: nativeEffect.resourceId,
			width: source.width,
			height: source.height,
			intensity,
			...(sourceKey ? { sourceKey } : {}),
			timestampSeconds: Math.max(0, timestampSeconds ?? frameSeed / 30),
			rgba: new Uint8Array(
				source.data.buffer,
				source.data.byteOffset,
				source.data.byteLength
			),
		});
		if (
			result.provider !== nativeEffect.provider ||
			result.resourceId !== nativeEffect.resourceId ||
			result.width !== source.width ||
			result.height !== source.height
		) {
			throw new Error("剪映本机滤镜返回了不匹配的画面");
		}
		return blendJianyingLocalEffect({
			source,
			rendered: result.rgba,
			maskData,
		});
	} catch (cause) {
		const detail = cause instanceof Error ? cause.message : String(cause);
		if (!detail.includes("正在处理另一帧")) {
			reportColorDegradation({
				reason: "jianying-local-effect-fallback",
				detail,
			});
		}
		return null;
	}
}
