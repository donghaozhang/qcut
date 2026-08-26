export const RESTRICTED_MEDIA_EXPORT_ERROR_CODE =
	"QCUT_RESTRICTED_MEDIA_EXPORT" as const;

export const RESTRICTED_MEDIA_EXPORT_MESSAGE =
	"Sticker Lab reference-only media cannot be exported or redistributed." as const;

const RESTRICTED_STICKER_LAB_ID_PATTERN =
	/^sticker-lab:jianying-\d{4}-\d{2}-\d{2}(?:-batch-[1-9]\d*)?(?:-v[1-9]\d*)?:\d+$/;

const MAX_COMPOUND_MEDIA_DEPTH = 32;
const COMPOUND_MEDIA_DEPTH_LIMIT_ID = "[compound-media-depth-limit]";

type RestrictedMediaExportScope = "all-media" | "timeline";

interface ExportMediaRecord {
	id?: unknown;
	metadata?: unknown;
}

export interface RestrictedMediaExportCheck {
	additionalMediaIds?: readonly string[];
	mediaItems: readonly ExportMediaRecord[];
	operation: string;
	scope: RestrictedMediaExportScope;
	tracks?: readonly unknown[];
}

export class RestrictedMediaExportError extends Error {
	readonly code = RESTRICTED_MEDIA_EXPORT_ERROR_CODE;
	readonly mediaIds: readonly string[];
	readonly operation: string;

	constructor({
		mediaIds,
		operation,
	}: {
		mediaIds: readonly string[];
		operation: string;
	}) {
		const uniqueMediaIds = [...new Set(mediaIds)].sort();
		const mediaSummary =
			uniqueMediaIds.length > 0 ? ` Media: ${uniqueMediaIds.join(", ")}.` : "";
		super(
			`[${RESTRICTED_MEDIA_EXPORT_ERROR_CODE}] ${RESTRICTED_MEDIA_EXPORT_MESSAGE}${mediaSummary}`
		);
		this.name = "RestrictedMediaExportError";
		this.mediaIds = uniqueMediaIds;
		this.operation = operation;
	}
}

function toRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function addMediaId({
	mediaIds,
	value,
}: {
	mediaIds: Set<string>;
	value: unknown;
}): void {
	if (typeof value === "string" && value.length > 0) {
		mediaIds.add(value);
	}
}

function collectElementMediaIds({
	element,
	mediaIds,
}: {
	element: Record<string, unknown>;
	mediaIds: Set<string>;
}): void {
	addMediaId({ mediaIds, value: element.mediaId });
	addMediaId({ mediaIds, value: element.sourceId });

	const audio = toRecord({ value: element.audio });
	const denoise = toRecord({ value: audio?.denoise });
	addMediaId({ mediaIds, value: denoise?.processedMediaId });
	const separation = toRecord({ value: audio?.separation });
	const stemMediaIds = toRecord({ value: separation?.stemMediaIds });
	if (stemMediaIds) {
		for (const stemMediaId of Object.values(stemMediaIds)) {
			addMediaId({ mediaIds, value: stemMediaId });
		}
	}
	const voiceConversion = toRecord({ value: audio?.voiceConversion });
	addMediaId({ mediaIds, value: voiceConversion?.sourceMediaId });

	const legacyMask = toRecord({ value: element.mask });
	addMediaId({ mediaIds, value: legacyMask?.sourceMediaId });
	if (!Array.isArray(element.masks)) return;
	for (const maskValue of element.masks) {
		const mask = toRecord({ value: maskValue });
		addMediaId({ mediaIds, value: mask?.sourceMediaId });
	}
}

export function isRestrictedStickerLabMetadata({
	metadata,
}: {
	metadata: unknown;
}): boolean {
	const metadataRecord = toRecord({ value: metadata });
	if (!metadataRecord) return false;
	return (
		metadataRecord.source === "sticker-lab" ||
		metadataRecord.referenceOnly === true ||
		metadataRecord.usage === "internal-reference-only" ||
		metadataRecord.redistribution === "prohibited"
	);
}

export function isRestrictedMediaExportError({
	error,
}: {
	error: unknown;
}): boolean {
	const errorRecord = toRecord({ value: error });
	return (
		error instanceof RestrictedMediaExportError ||
		errorRecord?.code === RESTRICTED_MEDIA_EXPORT_ERROR_CODE
	);
}

function collectTimelineMediaIds({
	additionalMediaIds,
	tracks,
}: {
	additionalMediaIds: readonly string[];
	tracks: readonly unknown[];
}): {
	mediaIds: Set<string>;
	restrictedTimelineIds: string[];
} {
	const mediaIds = new Set(
		additionalMediaIds.filter((mediaId) => mediaId.length > 0)
	);
	const restrictedTimelineIds: string[] = [];
	const visitedElements = new WeakSet<object>();
	const pendingElements: { depth: number; value: unknown }[] = [];
	for (const trackValue of tracks) {
		const track = toRecord({ value: trackValue });
		if (!track || !Array.isArray(track.elements)) continue;
		for (const value of track.elements) {
			pendingElements.push({ depth: 0, value });
		}
	}
	for (let index = 0; index < pendingElements.length; index += 1) {
		const { depth, value: elementValue } = pendingElements[index];
		const element = toRecord({ value: elementValue });
		if (!element || visitedElements.has(element)) continue;
		visitedElements.add(element);
		collectElementMediaIds({ element, mediaIds });
		if (
			typeof element.stickerId === "string" &&
			RESTRICTED_STICKER_LAB_ID_PATTERN.test(element.stickerId)
		) {
			restrictedTimelineIds.push(element.stickerId);
		}

		const compound = toRecord({ value: element.compound });
		if (!compound || !Array.isArray(compound.clips)) continue;
		if (depth >= MAX_COMPOUND_MEDIA_DEPTH) {
			if (compound.clips.length > 0) {
				restrictedTimelineIds.push(COMPOUND_MEDIA_DEPTH_LIMIT_ID);
			}
			continue;
		}
		for (const clipValue of compound.clips) {
			const clip = toRecord({ value: clipValue });
			if (!clip) continue;
			pendingElements.push({ depth: depth + 1, value: clip.element });
		}
	}
	return { mediaIds, restrictedTimelineIds };
}

function collectStickerRuntimeResourceMediaIds({
	mediaIds,
	mediaItems,
}: {
	mediaIds: Set<string>;
	mediaItems: readonly ExportMediaRecord[];
}): void {
	const mediaById = new Map<string, ExportMediaRecord>();
	for (const mediaItem of mediaItems) {
		if (typeof mediaItem.id === "string" && mediaItem.id.length > 0) {
			mediaById.set(mediaItem.id, mediaItem);
		}
	}
	const pendingMediaIds = [...mediaIds];
	const visitedMediaIds = new Set<string>();
	for (let index = 0; index < pendingMediaIds.length; index += 1) {
		const mediaId = pendingMediaIds[index];
		if (!mediaId || visitedMediaIds.has(mediaId)) continue;
		visitedMediaIds.add(mediaId);
		const metadata = toRecord({ value: mediaById.get(mediaId)?.metadata });
		const resources = toRecord({ value: metadata?.stickerRuntimeResources });
		if (!resources) continue;
		for (const resourceMediaId of Object.values(resources)) {
			if (typeof resourceMediaId !== "string" || resourceMediaId.length === 0) {
				continue;
			}
			if (!mediaIds.has(resourceMediaId)) {
				mediaIds.add(resourceMediaId);
				pendingMediaIds.push(resourceMediaId);
			}
		}
	}
}

export function findRestrictedMediaForExport({
	additionalMediaIds = [],
	mediaItems,
	scope,
	tracks = [],
}: Omit<RestrictedMediaExportCheck, "operation">): string[] {
	const { mediaIds: timelineMediaIds, restrictedTimelineIds } =
		collectTimelineMediaIds({ additionalMediaIds, tracks });
	if (scope === "timeline") {
		collectStickerRuntimeResourceMediaIds({
			mediaIds: timelineMediaIds,
			mediaItems,
		});
	}
	const restrictedMediaIds = [...restrictedTimelineIds];

	for (const mediaItem of mediaItems) {
		if (!isRestrictedStickerLabMetadata({ metadata: mediaItem.metadata })) {
			continue;
		}
		const mediaId =
			typeof mediaItem.id === "string" && mediaItem.id.length > 0
				? mediaItem.id
				: "[unknown-restricted-media]";
		if (scope === "all-media" || timelineMediaIds.has(mediaId)) {
			restrictedMediaIds.push(mediaId);
		}
	}

	return [...new Set(restrictedMediaIds)].sort();
}

export function assertRestrictedMediaExportAllowed({
	additionalMediaIds = [],
	mediaItems,
	operation,
	scope,
	tracks = [],
}: RestrictedMediaExportCheck): void {
	const mediaIds = findRestrictedMediaForExport({
		additionalMediaIds,
		mediaItems,
		scope,
		tracks,
	});
	if (mediaIds.length === 0) return;
	throw new RestrictedMediaExportError({ mediaIds, operation });
}
