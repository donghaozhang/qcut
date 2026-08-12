import type { MediaColorSettings } from "@/types/timeline";
import { reportColorDegradation } from "./color-degradation";

function hasNeutralBasicSettings({
	settings,
}: {
	settings: MediaColorSettings;
}) {
	const { enabled: _enabled, ...values } = settings.basic;
	return Object.values(values).every((value) => value === 0);
}

export function canRenderJianyingLocalPortrait({
	settings,
}: {
	settings: MediaColorSettings;
}): boolean {
	const dual = settings.lut.dual;
	return Boolean(
		settings.enabled &&
			settings.lut.enabled &&
			settings.lut.cube &&
			dual?.maskKind === "skin-segmentation-v1" &&
			dual.resourceId &&
			hasNeutralBasicSettings({ settings }) &&
			!settings.multiPass?.enabled &&
			!settings.hsl.enabled &&
			!settings.curves.enabled &&
			!settings.secondaryCurves.enabled &&
			!settings.wheels.enabled &&
			!settings.smart.enabled &&
			!settings.management.enabled
	);
}

export function blendJianyingLocalPortrait({
	source,
	rendered,
	intensity,
	maskData,
}: {
	source: ImageData;
	rendered: Uint8Array;
	intensity: number;
	maskData?: Uint8ClampedArray;
}): ImageData {
	if (rendered.length !== source.data.length) {
		throw new Error("剪映本机人像滤镜返回了错误的像素数量");
	}
	if (maskData && maskData.length !== source.data.length) {
		throw new Error("调色蒙版像素数量与画面不一致");
	}
	const output = new ImageData(
		new Uint8ClampedArray(source.data),
		source.width,
		source.height
	);
	const strength = Math.min(1, Math.max(0, intensity / 100));
	for (let index = 0; index < output.data.length; index += 4) {
		const amount = strength * (maskData ? maskData[index + 3] / 255 : 1);
		for (let channel = 0; channel < 3; channel += 1) {
			output.data[index + channel] =
				source.data[index + channel] +
				(rendered[index + channel] - source.data[index + channel]) * amount;
		}
	}
	return output;
}

export async function renderJianyingLocalPortraitPreview({
	source,
	settings,
	maskData,
	sourceKey,
	timestampSeconds,
}: {
	source: ImageData;
	settings: MediaColorSettings;
	maskData?: Uint8ClampedArray;
	sourceKey?: string;
	timestampSeconds?: number;
}): Promise<ImageData | null> {
	if (!canRenderJianyingLocalPortrait({ settings })) return null;
	const dual = settings.lut.dual;
	if (dual?.maskKind !== "skin-segmentation-v1") return null;
	if (settings.lut.intensity <= 0) {
		return new ImageData(
			new Uint8ClampedArray(source.data),
			source.width,
			source.height
		);
	}
	const api = window.electronAPI?.jianyingFilterLab;
	if (!api) return null;
	try {
		const result = await api.renderLocalPortrait({
			resourceId: dual.resourceId,
			width: source.width,
			height: source.height,
			...(sourceKey ? { sourceKey } : {}),
			...(timestampSeconds === undefined ? {} : { timestampSeconds }),
			rgba: new Uint8Array(
				source.data.buffer,
				source.data.byteOffset,
				source.data.byteLength
			),
		});
		if (
			result.resourceId !== dual.resourceId ||
			result.width !== source.width ||
			result.height !== source.height
		) {
			throw new Error("剪映本机人像滤镜返回了不匹配的画面");
		}
		return blendJianyingLocalPortrait({
			source,
			rendered: result.rgba,
			intensity: settings.lut.intensity,
			maskData,
		});
	} catch (cause) {
		const detail = cause instanceof Error ? cause.message : String(cause);
		if (!detail.includes("正在处理另一帧")) {
			reportColorDegradation({
				reason: "jianying-local-portrait-fallback",
				detail,
			});
		}
		return null;
	}
}
