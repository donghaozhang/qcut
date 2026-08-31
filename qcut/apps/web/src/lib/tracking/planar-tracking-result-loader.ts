import type {
	PlanarTrackingReference,
	PlanarTrackingResultStore,
	PlanarTrackingSidecarV1,
} from "@qcut/editor-core";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import { getPlanarTrackingResultStore } from "./planar-result-store";

const sidecarPromises = new Map<string, Promise<PlanarTrackingSidecarV1>>();

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
	if (existing) return existing;
	const pending = resultStore
		.read({
			expectedSha256: reference.resultSha256,
			projectId,
			resultUri: reference.resultUri,
		})
		.then(({ sidecar }) => sidecar)
		.catch((cause: unknown) => {
			sidecarPromises.delete(key);
			throw cause;
		});
	sidecarPromises.set(key, pending);
	return pending;
}

export function clearPlanarTrackingSidecarCache(): void {
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
