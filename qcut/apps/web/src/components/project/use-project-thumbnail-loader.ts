import { useCallback, useRef } from "react";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

export function useProjectThumbnailLoader(): (
	projectId: string
) => Promise<string | null> {
	const thumbnailCache = useRef(new Map<string, string | null>());
	const thumbnailRequests = useRef(new Map<string, Promise<string | null>>());

	return useCallback((projectId: string) => {
		if (thumbnailCache.current.has(projectId)) {
			return Promise.resolve(thumbnailCache.current.get(projectId) ?? null);
		}

		const existingRequest = thumbnailRequests.current.get(projectId);
		if (existingRequest) return existingRequest;

		const request = useTimelineStore
			.getState()
			.getProjectThumbnail(projectId)
			.then(
				(thumbnail) => {
					thumbnailCache.current.set(projectId, thumbnail);
					thumbnailRequests.current.delete(projectId);
					return thumbnail;
				},
				(error: unknown) => {
					thumbnailRequests.current.delete(projectId);
					throw error;
				}
			);
		thumbnailRequests.current.set(projectId, request);
		return request;
	}, []);
}
