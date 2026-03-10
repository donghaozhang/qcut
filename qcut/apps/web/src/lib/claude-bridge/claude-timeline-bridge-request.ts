import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import type { ClaudeTimeline } from "../../../../../electron/types/claude-api";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import {
	calculateTimelineDuration,
	formatTracksForExport,
	applyTimelineToStore,
} from "./claude-timeline-bridge-helpers";
import type { ClaudeTimelineBridgeAPI } from "./claude-timeline-bridge";

export function setupRequestHandlers({
	claudeAPI,
}: {
	claudeAPI: ClaudeTimelineBridgeAPI;
}): void {
	// Respond to timeline export request from main process
	claudeAPI.onRequest(() => {
		try {
			debugLog("[ClaudeTimelineBridge] Received timeline export request");

			const timelineState = useTimelineStore.getState();
			const projectState = useProjectStore.getState();
			const project = projectState.activeProject;
			const tracks = timelineState.tracks;

			const timeline: ClaudeTimeline = {
				name: project?.name || "Untitled",
				duration: calculateTimelineDuration(tracks),
				width: project?.canvasSize?.width || 1920,
				height: project?.canvasSize?.height || 1080,
				fps: project?.fps || 30,
				tracks: formatTracksForExport(tracks),
			};

			claudeAPI.sendResponse(timeline);
			debugLog("[ClaudeTimelineBridge] Sent timeline response");
		} catch (error) {
			debugError(
				"[ClaudeTimelineBridge] Failed to handle timeline export request:",
				error
			);
		}
	});

	// Handle timeline import from Claude
	claudeAPI.onApply(async (timeline: any, replace?: boolean) => {
		try {
			debugLog(
				"[ClaudeTimelineBridge] Received timeline to apply:",
				timeline.name,
				"replace:",
				replace
			);

			if (replace) {
				const timelineStore = useTimelineStore.getState();
				timelineStore.pushHistory();
				for (const track of [...timelineStore.tracks]) {
					for (const element of [...track.elements]) {
						useTimelineStore
							.getState()
							.removeElementFromTrack(track.id, element.id, false);
					}
				}
			}

			await applyTimelineToStore(timeline);
		} catch (error) {
			debugError("[ClaudeTimelineBridge] Failed to apply timeline:", error);
		}
	});
}
