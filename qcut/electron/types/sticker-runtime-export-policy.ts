export const STICKER_RUNTIME_EXPORT_ERROR_CODE =
	"QCUT_STICKER_RUNTIME_EXPORT_UNSUPPORTED" as const;

const MAX_COMPOUND_RUNTIME_DEPTH = 32;

export type StickerRuntimeExportUnsupportedReason =
	| "native-engine"
	| "remotion-composition"
	| "unsupported-format"
	| "muxer-unavailable"
	| "missing-timeline-context";

interface StickerRuntimeMediaRecord {
	id?: unknown;
	metadata?: unknown;
	name?: unknown;
}

export interface StickerRuntimeExportCheck {
	additionalMediaIds?: readonly string[];
	mediaItems: readonly StickerRuntimeMediaRecord[];
	tracks: readonly unknown[];
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

function hasStickerRuntime({ value }: { value: unknown }): boolean {
	const record = toRecord({ value });
	return record?.stickerRuntime !== undefined && record.stickerRuntime !== null;
}

function collectTimelineRuntimeState({
	additionalMediaIds,
	tracks,
}: {
	additionalMediaIds: readonly string[];
	tracks: readonly unknown[];
}): {
	hasElementRuntime: boolean;
	mediaIds: Set<string>;
	mediaNames: Set<string>;
} {
	const mediaIds = new Set(
		additionalMediaIds.filter((mediaId) => mediaId.length > 0)
	);
	const mediaNames = new Set<string>();
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
		const { depth, value } = pendingElements[index];
		const element = toRecord({ value });
		if (!element || visitedElements.has(element)) continue;
		visitedElements.add(element);
		if (hasStickerRuntime({ value: element })) {
			return { hasElementRuntime: true, mediaIds, mediaNames };
		}
		for (const candidate of [element.mediaId, element.sourceId]) {
			if (typeof candidate === "string" && candidate.length > 0) {
				mediaIds.add(candidate);
			}
		}
		if (
			typeof element.sourceName === "string" &&
			element.sourceName.length > 0
		) {
			mediaNames.add(element.sourceName);
		}

		const compound = toRecord({ value: element.compound });
		if (!compound || !Array.isArray(compound.clips)) continue;
		if (depth >= MAX_COMPOUND_RUNTIME_DEPTH) {
			if (compound.clips.length > 0) {
				return { hasElementRuntime: true, mediaIds, mediaNames };
			}
			continue;
		}
		for (const clipValue of compound.clips) {
			const clip = toRecord({ value: clipValue });
			if (!clip) continue;
			pendingElements.push({ depth: depth + 1, value: clip.element });
		}
	}
	return { hasElementRuntime: false, mediaIds, mediaNames };
}

export function hasStickerRuntimeForExport({
	additionalMediaIds = [],
	mediaItems,
	tracks,
}: StickerRuntimeExportCheck): boolean {
	const { hasElementRuntime, mediaIds, mediaNames } =
		collectTimelineRuntimeState({
			additionalMediaIds,
			tracks,
		});
	if (hasElementRuntime) return true;

	for (const mediaItem of mediaItems) {
		const matchesId =
			typeof mediaItem.id === "string" && mediaIds.has(mediaItem.id);
		const matchesName =
			typeof mediaItem.name === "string" && mediaNames.has(mediaItem.name);
		if (!(matchesId || matchesName)) {
			continue;
		}
		if (hasStickerRuntime({ value: mediaItem.metadata })) return true;
	}
	return false;
}

export class StickerRuntimeExportUnsupportedError extends Error {
	readonly code = STICKER_RUNTIME_EXPORT_ERROR_CODE;
	readonly format?: string;
	readonly operation: string;
	readonly reason: StickerRuntimeExportUnsupportedReason;

	constructor({
		format,
		operation,
		reason,
	}: {
		format?: string;
		operation: string;
		reason: StickerRuntimeExportUnsupportedReason;
	}) {
		const formatSummary = format ? ` Format: ${format}.` : "";
		super(
			`[${STICKER_RUNTIME_EXPORT_ERROR_CODE}] Exact sticker runtime export is unavailable for ${operation}.${formatSummary}`
		);
		this.name = "StickerRuntimeExportUnsupportedError";
		this.format = format;
		this.operation = operation;
		this.reason = reason;
	}
}

export function isStickerRuntimeExportError({
	error,
}: {
	error: unknown;
}): boolean {
	const errorRecord = toRecord({ value: error });
	return (
		error instanceof StickerRuntimeExportUnsupportedError ||
		errorRecord?.code === STICKER_RUNTIME_EXPORT_ERROR_CODE
	);
}

export function assertNativeStickerRuntimeExportAllowed({
	additionalMediaIds,
	mediaItems,
	operation,
	tracks,
}: StickerRuntimeExportCheck & { operation: string }): void {
	if (!hasStickerRuntimeForExport({ additionalMediaIds, mediaItems, tracks })) {
		return;
	}
	throw new StickerRuntimeExportUnsupportedError({
		operation,
		reason: "native-engine",
	});
}
