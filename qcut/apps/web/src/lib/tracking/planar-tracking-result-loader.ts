import type {
	PlanarTrackingReference,
	PlanarTrackingResultStore,
	PlanarTrackingSidecarV1,
} from "@qcut/editor-core";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import { getPlanarTrackingResultStore } from "./planar-result-store";

const sidecarPromises = new Map<string, Promise<PlanarTrackingSidecarV1>>();

/**
 * Most recently used keys, oldest first. The cached sidecars are keyed by
 * content hash and are never mutated, so retaining them is safe; this bound
 * only stops a long editing session from holding every tracking result it has
 * ever opened.
 */
const cacheOrder: string[] = [];
const MAX_CACHED_SIDECARS = 8;

function touchCacheEntry({ key }: { key: string }): void {
	const index = cacheOrder.indexOf(key);
	if (index !== -1) cacheOrder.splice(index, 1);
	cacheOrder.push(key);
	while (cacheOrder.length > MAX_CACHED_SIDECARS) {
		const evicted = cacheOrder.shift();
		if (evicted !== undefined) sidecarPromises.delete(evicted);
	}
}

function dropCacheEntry({ key }: { key: string }): void {
	sidecarPromises.delete(key);
	const index = cacheOrder.indexOf(key);
	if (index !== -1) cacheOrder.splice(index, 1);
}

function resultCacheKey({
	projectId,
	reference,
}: {
	projectId: string;
	reference: PlanarTrackingReference;
}): string {
	return JSON.stringify([
		projectId,
		reference.resultUri,
		reference.resultSha256,
	]);
}

export function loadPlanarTrackingSidecar({
	projectId,
	reference,
	resultStore = getPlanarTrackingResultStore(),
}: {
	projectId: string;
	reference: PlanarTrackingReference;
	resultStore?: PlanarTrackingResultStore;
}): Promise<PlanarTrackingSidecarV1> {
	if (!reference.resultUri || !reference.resultSha256) {
		return Promise.reject(new Error("Planar tracking result is unavailable."));
	}
	const key = resultCacheKey({ projectId, reference });
	const existing = sidecarPromises.get(key);
	if (existing) {
		touchCacheEntry({ key });
		return existing;
	}
	const pending = resultStore
		.read({
			expectedSha256: reference.resultSha256,
			projectId,
			resultUri: reference.resultUri,
		})
		.then(({ sidecar }) => sidecar);
	sidecarPromises.set(key, pending);
	touchCacheEntry({ key });
	// A fulfilled sidecar is kept: the key contains the result's SHA-256, so a
	// re-tracked surface produces a different key and can never be served a
	// stale entry. A rejected read is dropped so a repaired sidecar can be
	// retried rather than the failure being cached forever.
	void pending.catch(() => {
		if (sidecarPromises.get(key) === pending) dropCacheEntry({ key });
	});
	return pending;
}

export function clearPlanarTrackingSidecarCache(): void {
	cacheOrder.length = 0;
	sidecarPromises.clear();
}

export function findStickerPlanarTrackingReference({
	element,
	tracks,
}: {
	element: StickerElement;
	tracks: TimelineTrack[];
}): PlanarTrackingReference | undefined {
	const binding = element.tracking;
	if (binding?.mode !== "planar") return;
	const source = tracks
		.flatMap((track) => track.elements)
		.find(
			(candidate) =>
				candidate.type === "media" && candidate.id === binding.sourceElementId
		);
	if (!source || source.type !== "media") return;
	return source.surfaceTrackings?.find(
		(reference) =>
			reference.id === binding.surfaceTrackingId &&
			(reference.status === "ready" || reference.status === "partial")
	);
}

export async function loadStickerPlanarTrackingSidecar({
	element,
	projectId,
	tracks,
}: {
	element: StickerElement;
	projectId: string | undefined;
	tracks: TimelineTrack[];
}): Promise<PlanarTrackingSidecarV1 | undefined> {
	if (element.tracking?.mode !== "planar" || !projectId) return;
	const reference = findStickerPlanarTrackingReference({ element, tracks });
	return reference
		? loadPlanarTrackingSidecar({ projectId, reference })
		: undefined;
}
