import type {
	PlanarTrackingReference,
	PlanarTrackingSidecarV1,
} from "@qcut/editor-core";
import { useEffect, useState } from "react";
import { useProjectStore } from "@/stores/project-store";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import { loadPlanarTrackingSidecar } from "./planar-tracking-result-loader";

function findReference({
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

export function usePlanarTrackingSidecar({
	element,
	tracks,
}: {
	element: StickerElement;
	tracks: TimelineTrack[];
}): PlanarTrackingSidecarV1 | undefined {
	const projectId = useProjectStore((state) => state.activeProject?.id);
	const reference = findReference({ element, tracks });
	const [sidecar, setSidecar] = useState<PlanarTrackingSidecarV1>();

	useEffect(() => {
		let active = true;
		setSidecar(undefined);
		if (!projectId || !reference) return () => undefined;
		void loadPlanarTrackingSidecar({ projectId, reference })
			.then((loaded) => {
				if (active) setSidecar(loaded);
			})
			.catch(() => {
				if (active) setSidecar(undefined);
			});
		return () => {
			active = false;
		};
	}, [projectId, reference]);

	return sidecar;
}
