import { useCallback, useRef } from "react";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

export function useProjectDurationLoader(): (
	projectId: string
) => Promise<number | null> {
	const durationRequests = useRef(new Map<string, Promise<number | null>>());

	return useCallback((projectId: string) => {
		const existingRequest = durationRequests.current.get(projectId);
		if (existingRequest) return existingRequest;

		const request = useTimelineStore.getState().getProjectDuration(projectId);
		durationRequests.current.set(projectId, request);
		return request;
	}, []);
}
