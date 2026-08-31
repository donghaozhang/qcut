import type { PlanarTrackingSidecarV1 } from "@qcut/editor-core";
import { useEffect, useState } from "react";
import { useProjectStore } from "@/stores/project-store";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import {
	findStickerPlanarTrackingReference,
	loadPlanarTrackingSidecar,
} from "./planar-tracking-result-loader";

export function usePlanarTrackingSidecar({
	element,
	tracks,
}: {
	element: StickerElement;
	tracks: TimelineTrack[];
}): PlanarTrackingSidecarV1 | undefined {
	const projectId = useProjectStore((state) => state.activeProject?.id);
	const reference = findStickerPlanarTrackingReference({ element, tracks });
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
