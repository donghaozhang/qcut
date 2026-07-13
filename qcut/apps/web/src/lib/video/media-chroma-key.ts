import type {
	MediaChromaKey,
	MediaChromaKeyKeyframeProperty,
	MediaPropertyKeyframe,
} from "@/types/timeline";
import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";
import type { PickedPreviewColor } from "@/stores/editor/color-picker-store";

export const DEFAULT_MEDIA_CHROMA_KEY: MediaChromaKey = {
	enabled: false,
	color: "#00ff00",
	similarity: 0.2,
	blend: 0.1,
	shadow: 0,
	cleanup: 0,
	spill: 0,
};

export const MEDIA_CHROMA_KEY_KEYFRAME_PROPERTIES: Array<{
	value: MediaChromaKeyKeyframeProperty;
	label: string;
}> = [
	{ value: "similarity", label: "强度" },
	{ value: "shadow", label: "阴影" },
	{ value: "blend", label: "边缘羽化" },
	{ value: "cleanup", label: "边缘清理" },
	{ value: "spill", label: "溢色抑制" },
];

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizedHexColor({ color }: { color?: string }): string {
	return color && /^#[0-9a-f]{6}$/i.test(color)
		? color.toLowerCase()
		: DEFAULT_MEDIA_CHROMA_KEY.color;
}

export function normalizeMediaChromaKey(
	chromaKey?: Partial<MediaChromaKey>
): MediaChromaKey {
	return {
		enabled: chromaKey?.enabled ?? DEFAULT_MEDIA_CHROMA_KEY.enabled,
		color: normalizedHexColor({ color: chromaKey?.color }),
		similarity: clamp({
			value: chromaKey?.similarity ?? DEFAULT_MEDIA_CHROMA_KEY.similarity,
			min: 0.01,
			max: 1,
		}),
		blend: clamp({
			value: chromaKey?.blend ?? DEFAULT_MEDIA_CHROMA_KEY.blend,
			min: 0,
			max: 1,
		}),
		shadow: clamp({
			value: chromaKey?.shadow ?? DEFAULT_MEDIA_CHROMA_KEY.shadow,
			min: 0,
			max: 1,
		}),
		cleanup: clamp({
			value: chromaKey?.cleanup ?? DEFAULT_MEDIA_CHROMA_KEY.cleanup,
			min: 0,
			max: 1,
		}),
		spill: clamp({
			value: chromaKey?.spill ?? DEFAULT_MEDIA_CHROMA_KEY.spill,
			min: 0,
			max: 1,
		}),
		keyframes: chromaKey?.keyframes
			? Object.fromEntries(
					Object.entries(chromaKey.keyframes).map(([property, keyframes]) => [
						property,
						keyframes?.map((keyframe) => ({ ...keyframe })),
					])
				)
			: undefined,
	};
}

export function resolveMediaChromaKeyAtTime({
	chromaKey,
	currentTime,
	elementStartTime,
	fps,
}: {
	chromaKey?: Partial<MediaChromaKey>;
	currentTime: number;
	elementStartTime: number;
	fps: number;
}): MediaChromaKey {
	const normalized = normalizeMediaChromaKey(chromaKey);
	const localFrame = Math.max(
		0,
		Math.round((currentTime - elementStartTime) * fps)
	);
	const resolved = { ...normalized };
	for (const { value: property } of MEDIA_CHROMA_KEY_KEYFRAME_PROPERTIES) {
		const keyframes = normalized.keyframes?.[property];
		if (!keyframes?.length) continue;
		resolved[property] = interpolateNumber(keyframes as Keyframe[], localFrame);
	}
	return normalizeMediaChromaKey(resolved);
}

export function upsertMediaChromaKeyframe({
	keyframes,
	keyframe,
}: {
	keyframes: MediaPropertyKeyframe[];
	keyframe: MediaPropertyKeyframe;
}): MediaPropertyKeyframe[] {
	return keyframes
		.filter((item) => item.id !== keyframe.id && item.frame !== keyframe.frame)
		.concat({ ...keyframe })
		.sort((left, right) => left.frame - right.frame);
}

export function effectiveChromaSimilarity({
	similarity,
	shadow,
}: {
	similarity: number;
	shadow: number;
}): number {
	const normalizedSimilarity = clamp({ value: similarity, min: 0.01, max: 1 });
	const normalizedShadow = clamp({ value: shadow, min: 0, max: 1 });
	return (
		normalizedSimilarity + (1 - normalizedSimilarity) * normalizedShadow * 0.35
	);
}

export function chromaCleanupPasses({ cleanup }: { cleanup: number }): number {
	return Math.round(clamp({ value: cleanup, min: 0, max: 1 }) * 4);
}

export function chromaScreenType({
	color,
}: {
	color: string;
}): "green" | "blue" {
	const normalized = normalizedHexColor({ color });
	const green = Number.parseInt(normalized.slice(3, 5), 16);
	const blue = Number.parseInt(normalized.slice(5, 7), 16);
	return blue > green ? "blue" : "green";
}

export function pickedPreviewColorToHex({
	color,
}: {
	color: PickedPreviewColor;
}): string {
	const channel = (value: number) =>
		Math.round(clamp({ value, min: 0, max: 1 }) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}
