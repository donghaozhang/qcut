import type {
	PlanarQuad,
	PlanarTrackingErrorCode,
	PlanarTrackingReference,
	StickerPlanarTracking,
	TimelineTrack,
} from "@qcut/editor-core";

export const DEFAULT_PLANAR_SEED_QUAD: PlanarQuad = {
	topLeft: { x: 0.25, y: 0.25 },
	topRight: { x: 0.75, y: 0.25 },
	bottomRight: { x: 0.75, y: 0.75 },
	bottomLeft: { x: 0.25, y: 0.75 },
};

const PLANAR_TRACKING_ERROR_CODES = new Set<PlanarTrackingErrorCode>([
	"provider-unavailable",
	"decode-failed",
	"invalid-seed-quad",
	"insufficient-texture",
	"tracking-lost",
	"degenerate-homography",
	"result-write-failed",
	"result-corrupt",
	"cancelled",
]);

export function resolvePlanarTrackingReference({
	binding,
	references,
	sourceMediaId,
}: {
	binding: StickerPlanarTracking | undefined;
	references: PlanarTrackingReference[] | undefined;
	sourceMediaId: string;
}): PlanarTrackingReference | undefined {
	if (binding) {
		return references?.find(
			(candidate) => candidate.id === binding.surfaceTrackingId
		);
	}
	return references?.find(
		(candidate) =>
			candidate.sourceMediaId === sourceMediaId && candidate.status !== "error"
	);
}

export function isPlanarTrackingReferenceUsedByAnotherSticker({
	referenceId,
	stickerElementId,
	tracks,
}: {
	referenceId: string;
	stickerElementId: string;
	tracks: TimelineTrack[];
}): boolean {
	for (const track of tracks) {
		for (const candidate of track.elements) {
			if (
				candidate.id !== stickerElementId &&
				candidate.type === "sticker" &&
				candidate.tracking?.mode === "planar" &&
				candidate.tracking.surfaceTrackingId === referenceId
			) {
				return true;
			}
		}
	}
	return false;
}

export function upsertPlanarTrackingReference({
	reference,
	references,
}: {
	reference: PlanarTrackingReference;
	references: PlanarTrackingReference[] | undefined;
}): PlanarTrackingReference[] {
	const existing = references ?? [];
	return [
		...existing.filter((candidate) => candidate.id !== reference.id),
		reference,
	];
}

export function readPlanarTrackingErrorCode({
	cause,
}: {
	cause: unknown;
}): PlanarTrackingErrorCode {
	if (cause instanceof DOMException && cause.name === "AbortError") {
		return "cancelled";
	}
	if (cause instanceof Error) {
		const code = Reflect.get(cause, "code");
		if (
			typeof code === "string" &&
			PLANAR_TRACKING_ERROR_CODES.has(code as PlanarTrackingErrorCode)
		) {
			return code as PlanarTrackingErrorCode;
		}
	}
	return "decode-failed";
}
