import type {
	MediaMask,
	MediaMaskKeyframeProperty,
	MediaMaskType,
	MediaPropertyKeyframe,
} from "@/types/timeline";
import { DEFAULT_MEDIA_MASK, normalizeMediaMask } from "./video-properties";

export function createMediaMask({
	id,
	type,
	index,
	name,
}: {
	id: string;
	type: Exclude<MediaMaskType, "none">;
	index: number;
	name?: string;
}): MediaMask {
	return normalizeMediaMask(
		{
			...DEFAULT_MEDIA_MASK,
			id,
			name: name ?? `蒙版 ${index + 1}`,
			type,
			blendMode: "add",
		},
		index
	);
}

export function normalizeMediaMaskStack(masks: MediaMask[]): MediaMask[] {
	return masks
		.filter((mask) => mask.type !== "none")
		.map((mask, index) => {
			const normalized = normalizeMediaMask(mask, index);
			return index === 0
				? { ...normalized, blendMode: "add" as const }
				: normalized;
		});
}

export function addMediaMask(masks: MediaMask[], mask: MediaMask): MediaMask[] {
	return normalizeMediaMaskStack([...masks, mask]);
}

export function updateMediaMaskInStack({
	masks,
	maskId,
	updates,
}: {
	masks: MediaMask[];
	maskId: string;
	updates: Partial<MediaMask>;
}): MediaMask[] {
	return normalizeMediaMaskStack(
		masks.map((mask) =>
			mask.id === maskId ? { ...mask, ...updates, id: mask.id } : mask
		)
	);
}

export function removeMediaMask(
	masks: MediaMask[],
	maskId: string
): MediaMask[] {
	return normalizeMediaMaskStack(masks.filter((mask) => mask.id !== maskId));
}

export function moveMediaMask({
	masks,
	maskId,
	toIndex,
}: {
	masks: MediaMask[];
	maskId: string;
	toIndex: number;
}): MediaMask[] {
	const fromIndex = masks.findIndex((mask) => mask.id === maskId);
	if (fromIndex < 0) return normalizeMediaMaskStack(masks);
	const next = [...masks];
	const [moved] = next.splice(fromIndex, 1);
	next.splice(Math.min(Math.max(0, toIndex), next.length), 0, moved);
	return normalizeMediaMaskStack(next);
}

export function duplicateMediaMask({
	masks,
	maskId,
	newId,
}: {
	masks: MediaMask[];
	maskId: string;
	newId: string;
}): MediaMask[] {
	const index = masks.findIndex((mask) => mask.id === maskId);
	if (index < 0) return normalizeMediaMaskStack(masks);
	const source = masks[index];
	const copy = normalizeMediaMask(
		{
			...source,
			id: newId,
			name: `${source.name ?? `蒙版 ${index + 1}`} 副本`,
			points: source.points?.map((point) => ({
				...point,
				handleIn: point.handleIn ? { ...point.handleIn } : undefined,
				handleOut: point.handleOut ? { ...point.handleOut } : undefined,
			})),
			keyframes: source.keyframes
				? Object.fromEntries(
						Object.entries(source.keyframes).map(([property, keyframes]) => [
							property,
							keyframes?.map((keyframe) => ({
								...keyframe,
								id: `${newId}-${keyframe.id}`,
							})),
						])
					)
				: undefined,
		},
		index + 1
	);
	const next = [...masks];
	next.splice(index + 1, 0, copy);
	return normalizeMediaMaskStack(next);
}

export function upsertMediaMaskKeyframe({
	mask,
	property,
	keyframe,
}: {
	mask: MediaMask;
	property: MediaMaskKeyframeProperty;
	keyframe: MediaPropertyKeyframe;
}): MediaMask {
	const existing = mask.keyframes?.[property] ?? [];
	const keyframes = existing
		.filter((item) => item.id !== keyframe.id && item.frame !== keyframe.frame)
		.concat({ ...keyframe })
		.sort((a, b) => a.frame - b.frame);
	return normalizeMediaMask({
		...mask,
		keyframes: {
			...mask.keyframes,
			[property]: keyframes,
		},
	});
}

export function removeMediaMaskKeyframe({
	mask,
	property,
	keyframeId,
}: {
	mask: MediaMask;
	property: MediaMaskKeyframeProperty;
	keyframeId: string;
}): MediaMask {
	return normalizeMediaMask({
		...mask,
		keyframes: {
			...mask.keyframes,
			[property]: (mask.keyframes?.[property] ?? []).filter(
				(keyframe) => keyframe.id !== keyframeId
			),
		},
	});
}

export function updateMediaMaskAtFrame({
	mask,
	updates,
	frame,
}: {
	mask: MediaMask;
	updates: Partial<MediaMask>;
	frame: number;
}): MediaMask {
	let nextMask = normalizeMediaMask({ ...mask, ...updates });
	for (const [property, value] of Object.entries(updates) as Array<
		[MediaMaskKeyframeProperty, MediaMask[MediaMaskKeyframeProperty]]
	>) {
		if (typeof value !== "number") continue;
		const keyframes = mask.keyframes?.[property] ?? [];
		if (keyframes.length === 0) continue;
		const existing = keyframes.find((keyframe) => keyframe.frame === frame);
		nextMask = upsertMediaMaskKeyframe({
			mask: {
				...nextMask,
				[property]: mask[property],
			},
			property,
			keyframe: {
				id: existing?.id ?? `${mask.id ?? "mask"}-${property}-${frame}`,
				frame,
				value,
				easing: existing?.easing ?? "linear",
			},
		});
	}
	return nextMask;
}
