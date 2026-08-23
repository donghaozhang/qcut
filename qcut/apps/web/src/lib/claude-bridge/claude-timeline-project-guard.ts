import { useProjectStore } from "@/stores/project-store";

export function readRequiredTimelineProjectId({
	candidate,
}: {
	candidate: unknown;
}): string {
	if (typeof candidate !== "string" || !candidate.trim()) {
		throw new Error("Timeline mutation requires a non-empty projectId");
	}
	return candidate.trim();
}

export function assertTimelineProjectActive({
	projectId,
}: {
	projectId: string;
}): void {
	const activeProjectId = useProjectStore.getState().activeProject?.id;
	if (activeProjectId === projectId) return;
	throw new Error(`Cannot mutate timeline for inactive project ${projectId}`);
}
