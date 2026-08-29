import { parseStickerLabMediaMetadata } from "./sticker-lab-media-metadata.js";

export const RESTRICTED_MEDIA_EXPORT_ERROR_CODE =
	"QCUT_RESTRICTED_MEDIA_EXPORT" as const;

export const RESTRICTED_MEDIA_EXPORT_MESSAGE =
	"Sticker Lab reference media cannot be exported as source assets, packaged into transferable projects, or redistributed." as const;

const RESTRICTED_STICKER_LAB_ID_PATTERN =
	/^sticker-lab:jianying-\d{4}-\d{2}-\d{2}(?:-batch-[1-9]\d*)?(?:-v[1-9]\d*)?:\d+$/;
const MAX_COMPOUND_MEDIA_DEPTH = 32;
const COMPOUND_MEDIA_DEPTH_LIMIT_ID = "[compound-media-depth-limit]";

type RestrictedMediaExportScope = "all-media" | "timeline";

interface ExportMediaRecord {
	id?: unknown;
	metadata?: unknown;
	name?: unknown;
}

export interface RestrictedMediaExportCheck {
	additionalMediaIds?: readonly string[];
	mediaItems: readonly ExportMediaRecord[];
	operation: string;
	scope: RestrictedMediaExportScope;
	tracks?: readonly unknown[];
}

export interface LocalFinalVideoExportOutput {
	container: "gif" | "mov" | "mp4" | "webm";
	destination: "external" | "local-file";
	kind: "final-video";
}

export interface LocalFinalVideoExportCheck {
	additionalNonStickerMediaIds?: readonly string[];
	mediaItems: readonly ExportMediaRecord[];
	operation: string;
	output: LocalFinalVideoExportOutput;
	stickerOverlayMediaIds?: readonly string[];
	tracks: readonly unknown[];
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
	collectElementAuxiliaryMediaIds({ element, mediaIds });
}

function collectElementAuxiliaryMediaIds({
	element,
	mediaIds,
}: {
	element: Record<string, unknown>;
	mediaIds: Set<string>;
}): void {
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

function visitTimelineElements({
	onDepthLimit,
	onElement,
	tracks,
}: {
	onDepthLimit: () => void;
	onElement: ({ element }: { element: Record<string, unknown> }) => void;
	tracks: readonly unknown[];
}): void {
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
		onElement({ element });

		const compound = toRecord({ value: element.compound });
		if (!compound || !Array.isArray(compound.clips)) continue;
		if (depth >= MAX_COMPOUND_MEDIA_DEPTH) {
			if (compound.clips.length > 0) onDepthLimit();
			continue;
		}
		for (const clipValue of compound.clips) {
			const clip = toRecord({ value: clipValue });
			if (!clip) continue;
			pendingElements.push({ depth: depth + 1, value: clip.element });
		}
	}
}

function collectTimelineMediaIds({
	additionalMediaIds,
	mediaItems,
	tracks,
}: {
	additionalMediaIds: readonly string[];
	mediaItems: readonly ExportMediaRecord[];
	tracks: readonly unknown[];
}): {
	mediaIds: Set<string>;
	restrictedTimelineIds: string[];
} {
	const mediaIds = new Set(
		additionalMediaIds.filter((mediaId) => mediaId.length > 0)
	);
	const restrictedTimelineIds: string[] = [];
	const mediaIdsByName = collectMediaIdsByName({ mediaItems });
	visitTimelineElements({
		onDepthLimit: () => {
			restrictedTimelineIds.push(COMPOUND_MEDIA_DEPTH_LIMIT_ID);
		},
		onElement: ({ element }) => {
			collectElementMediaIds({ element, mediaIds });
			addMediaIdsForElementSourceName({
				element,
				mediaIds,
				mediaIdsByName,
			});
			if (
				typeof element.stickerId === "string" &&
				RESTRICTED_STICKER_LAB_ID_PATTERN.test(element.stickerId)
			) {
				restrictedTimelineIds.push(element.stickerId);
			}
		},
		tracks,
	});
	return { mediaIds, restrictedTimelineIds };
}

function collectMediaIdsByName({
	mediaItems,
}: {
	mediaItems: readonly ExportMediaRecord[];
}): ReadonlyMap<string, readonly string[]> {
	const mutableMediaIdsByName = new Map<string, string[]>();
	for (const mediaItem of mediaItems) {
		if (
			typeof mediaItem.id !== "string" ||
			mediaItem.id.length === 0 ||
			typeof mediaItem.name !== "string" ||
			mediaItem.name.length === 0
		) {
			continue;
		}
		const existing = mutableMediaIdsByName.get(mediaItem.name) ?? [];
		existing.push(mediaItem.id);
		mutableMediaIdsByName.set(mediaItem.name, existing);
	}
	return mutableMediaIdsByName;
}

function addMediaIdsForElementSourceName({
	element,
	mediaIds,
	mediaIdsByName,
}: {
	element: Record<string, unknown>;
	mediaIds: Set<string>;
	mediaIdsByName: ReadonlyMap<string, readonly string[]>;
}): void {
	for (const mediaId of resolveMediaIdsForElementSourceName({
		element,
		mediaIdsByName,
	})) {
		mediaIds.add(mediaId);
	}
}

function resolveMediaIdsForElementSourceName({
	element,
	mediaIdsByName,
}: {
	element: Record<string, unknown>;
	mediaIdsByName: ReadonlyMap<string, readonly string[]>;
}): readonly string[] {
	if (typeof element.sourceName !== "string") return [];
	return mediaIdsByName.get(element.sourceName) ?? [];
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

interface LocalStickerProvenance {
	batchId: string;
	itemId: string;
}

function resolveCompleteLocalStickerProvenance({
	metadata,
	source,
}: {
	metadata: unknown;
	source: "sticker-lab" | "sticker-runtime-resource";
}): LocalStickerProvenance | null {
	const record = toRecord({ value: metadata });
	if (!record || record.source !== source) return null;
	try {
		const parsed = parseStickerLabMediaMetadata({
			candidate: {
				animatedSticker:
					source === "sticker-lab" ? record.animatedSticker : true,
				batchId: record.batchId,
				checksumSha256: record.checksumSha256,
				itemId: record.itemId,
				redistribution: record.redistribution,
				referenceOnly: record.referenceOnly,
				source: "sticker-lab",
				usage: record.usage,
			},
			label: "Sticker Lab export provenance",
		});
		if (
			source === "sticker-runtime-resource" &&
			(record.stickerAssetId !==
				`sticker-lab:${parsed.batchId}:${parsed.itemId}` ||
				record.stickerAssetVersion !== 1 ||
				typeof record.stickerRuntimeResourceName !== "string" ||
				record.stickerRuntimeResourceName.length === 0 ||
				record.stickerRuntimeResourceName.length > 256)
		) {
			return null;
		}
		return { batchId: parsed.batchId, itemId: parsed.itemId };
	} catch {
		return null;
	}
}

function collectBakedVideoMediaUsage({
	additionalNonStickerMediaIds,
	mediaItems,
	stickerOverlayMediaIds,
	tracks,
}: {
	additionalNonStickerMediaIds: readonly string[];
	mediaItems: readonly ExportMediaRecord[];
	stickerOverlayMediaIds: readonly string[];
	tracks: readonly unknown[];
}): {
	nonStickerMediaIds: Set<string>;
	requiredLocalStickerMediaIds: Set<string>;
	restrictedTimelineIds: string[];
	primaryStickerMediaIds: Set<string>;
} {
	const primaryStickerMediaIds = new Set(
		stickerOverlayMediaIds.filter((mediaId) => mediaId.length > 0)
	);
	const nonStickerMediaIds = new Set(
		additionalNonStickerMediaIds.filter((mediaId) => mediaId.length > 0)
	);
	const requiredLocalStickerMediaIds = new Set<string>();
	const restrictedTimelineIds: string[] = [];
	const mediaIdsByName = collectMediaIdsByName({ mediaItems });
	visitTimelineElements({
		onDepthLimit: () => {
			restrictedTimelineIds.push(COMPOUND_MEDIA_DEPTH_LIMIT_ID);
		},
		onElement: ({ element }) => {
			if (element.type === "sticker") {
				const sourceNameMediaIds = resolveMediaIdsForElementSourceName({
					element,
					mediaIdsByName,
				});
				addMediaId({
					mediaIds: primaryStickerMediaIds,
					value: element.mediaId,
				});
				collectElementAuxiliaryMediaIds({
					element,
					mediaIds: nonStickerMediaIds,
				});
				addMediaIdsForElementSourceName({
					element,
					mediaIds: primaryStickerMediaIds,
					mediaIdsByName,
				});
				if (
					typeof element.stickerId === "string" &&
					RESTRICTED_STICKER_LAB_ID_PATTERN.test(element.stickerId)
				) {
					if (sourceNameMediaIds.length > 0) {
						for (const mediaId of sourceNameMediaIds) {
							requiredLocalStickerMediaIds.add(mediaId);
						}
					} else if (
						typeof element.mediaId === "string" &&
						element.mediaId.length > 0
					) {
						requiredLocalStickerMediaIds.add(element.mediaId);
					} else {
						restrictedTimelineIds.push(element.stickerId);
					}
				}
			} else {
				collectElementMediaIds({ element, mediaIds: nonStickerMediaIds });
				addMediaIdsForElementSourceName({
					element,
					mediaIds: nonStickerMediaIds,
					mediaIdsByName,
				});
			}

			if (
				typeof element.stickerId === "string" &&
				RESTRICTED_STICKER_LAB_ID_PATTERN.test(element.stickerId) &&
				element.type !== "sticker"
			) {
				restrictedTimelineIds.push(element.stickerId);
			}
		},
		tracks,
	});
	return {
		nonStickerMediaIds,
		primaryStickerMediaIds,
		requiredLocalStickerMediaIds,
		restrictedTimelineIds,
	};
}

function collectRequiredLocalRuntimeResourceMediaIds({
	mediaById,
	primaryMediaIds,
	restrictedMediaIds,
}: {
	mediaById: ReadonlyMap<string, ExportMediaRecord>;
	primaryMediaIds: ReadonlySet<string>;
	restrictedMediaIds: string[];
}): Map<string, LocalStickerProvenance> {
	const resourceProvenanceByMediaId = new Map<string, LocalStickerProvenance>();
	const pendingMedia = [...primaryMediaIds].flatMap((mediaId) => {
		const provenance = resolveCompleteLocalStickerProvenance({
			metadata: mediaById.get(mediaId)?.metadata,
			source: "sticker-lab",
		});
		return provenance ? [{ mediaId, provenance }] : [];
	});
	const visitedMediaIds = new Set<string>();
	for (let index = 0; index < pendingMedia.length; index += 1) {
		const { mediaId, provenance } = pendingMedia[index];
		if (!mediaId || visitedMediaIds.has(mediaId)) continue;
		visitedMediaIds.add(mediaId);
		const metadata = toRecord({ value: mediaById.get(mediaId)?.metadata });
		const resourcesValue = metadata?.stickerRuntimeResources;
		if (resourcesValue === undefined) continue;
		const resources = toRecord({ value: resourcesValue });
		if (!resources) {
			restrictedMediaIds.push(mediaId);
			continue;
		}
		for (const resourceMediaId of Object.values(resources)) {
			if (typeof resourceMediaId !== "string" || resourceMediaId.length === 0) {
				restrictedMediaIds.push(mediaId);
				continue;
			}
			const existingProvenance =
				resourceProvenanceByMediaId.get(resourceMediaId);
			if (
				existingProvenance &&
				(existingProvenance.batchId !== provenance.batchId ||
					existingProvenance.itemId !== provenance.itemId)
			) {
				restrictedMediaIds.push(resourceMediaId);
				continue;
			}
			if (existingProvenance) continue;
			resourceProvenanceByMediaId.set(resourceMediaId, provenance);
			pendingMedia.push({ mediaId: resourceMediaId, provenance });
		}
	}
	return resourceProvenanceByMediaId;
}

function collectUnprovenancedRestrictedRuntimeResourceMediaIds({
	mediaById,
	primaryMediaIds,
	restrictedMediaIds,
}: {
	mediaById: ReadonlyMap<string, ExportMediaRecord>;
	primaryMediaIds: ReadonlySet<string>;
	restrictedMediaIds: string[];
}): void {
	const mediaItems = [...mediaById.values()];
	for (const primaryMediaId of primaryMediaIds) {
		if (
			resolveCompleteLocalStickerProvenance({
				metadata: mediaById.get(primaryMediaId)?.metadata,
				source: "sticker-lab",
			})
		) {
			continue;
		}

		const runtimeClosure = new Set([primaryMediaId]);
		collectStickerRuntimeResourceMediaIds({
			mediaIds: runtimeClosure,
			mediaItems,
		});
		for (const resourceMediaId of runtimeClosure) {
			if (resourceMediaId === primaryMediaId) continue;
			if (
				!isRestrictedStickerLabMetadata({
					metadata: mediaById.get(resourceMediaId)?.metadata,
				})
			) {
				continue;
			}
			restrictedMediaIds.push(primaryMediaId, resourceMediaId);
		}
	}
}

export function assertLocalFinalVideoExportAllowed({
	additionalNonStickerMediaIds = [],
	mediaItems,
	operation,
	output,
	stickerOverlayMediaIds = [],
	tracks,
}: LocalFinalVideoExportCheck): void {
	if (
		output.kind !== "final-video" ||
		output.container !== "mp4" ||
		output.destination !== "local-file"
	) {
		assertRestrictedMediaExportAllowed({
			additionalMediaIds: [
				...additionalNonStickerMediaIds,
				...stickerOverlayMediaIds,
			],
			mediaItems,
			operation,
			scope: "timeline",
			tracks,
		});
		return;
	}
	const {
		nonStickerMediaIds,
		primaryStickerMediaIds,
		requiredLocalStickerMediaIds,
		restrictedTimelineIds,
	} = collectBakedVideoMediaUsage({
		additionalNonStickerMediaIds,
		mediaItems,
		stickerOverlayMediaIds,
		tracks,
	});
	const restrictedMediaIds = [...restrictedTimelineIds];
	const mediaById = new Map<string, ExportMediaRecord>();
	for (const mediaItem of mediaItems) {
		if (typeof mediaItem.id === "string" && mediaItem.id.length > 0) {
			mediaById.set(mediaItem.id, mediaItem);
		}
	}
	collectUnprovenancedRestrictedRuntimeResourceMediaIds({
		mediaById,
		primaryMediaIds: primaryStickerMediaIds,
		restrictedMediaIds,
	});

	for (const mediaItem of mediaItems) {
		if (!isRestrictedStickerLabMetadata({ metadata: mediaItem.metadata })) {
			continue;
		}
		const mediaId =
			typeof mediaItem.id === "string" && mediaItem.id.length > 0
				? mediaItem.id
				: "[unknown-restricted-media]";
		const usedAsSticker = primaryStickerMediaIds.has(mediaId);
		const usedOutsideSticker = nonStickerMediaIds.has(mediaId);
		if (!(usedAsSticker || usedOutsideSticker)) continue;
		if (usedAsSticker) requiredLocalStickerMediaIds.add(mediaId);
		if (usedOutsideSticker) restrictedMediaIds.push(mediaId);
	}

	for (const mediaId of requiredLocalStickerMediaIds) {
		if (
			!resolveCompleteLocalStickerProvenance({
				metadata: mediaById.get(mediaId)?.metadata,
				source: "sticker-lab",
			})
		) {
			restrictedMediaIds.push(mediaId);
		}
	}

	const requiredRuntimeResourceMediaIds =
		collectRequiredLocalRuntimeResourceMediaIds({
			mediaById,
			primaryMediaIds: requiredLocalStickerMediaIds,
			restrictedMediaIds,
		});
	for (const [mediaId, expectedProvenance] of requiredRuntimeResourceMediaIds) {
		const actualProvenance = resolveCompleteLocalStickerProvenance({
			metadata: mediaById.get(mediaId)?.metadata,
			source: "sticker-runtime-resource",
		});
		if (
			nonStickerMediaIds.has(mediaId) ||
			!actualProvenance ||
			actualProvenance.batchId !== expectedProvenance.batchId ||
			actualProvenance.itemId !== expectedProvenance.itemId
		) {
			restrictedMediaIds.push(mediaId);
		}
	}

	if (restrictedMediaIds.length === 0) return;
	throw new RestrictedMediaExportError({
		mediaIds: restrictedMediaIds,
		operation,
	});
}

export function findRestrictedMediaForExport({
	additionalMediaIds = [],
	mediaItems,
	scope,
	tracks = [],
}: Omit<RestrictedMediaExportCheck, "operation">): string[] {
	const { mediaIds: timelineMediaIds, restrictedTimelineIds } =
		collectTimelineMediaIds({ additionalMediaIds, mediaItems, tracks });
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
