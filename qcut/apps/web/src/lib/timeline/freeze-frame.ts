import { toast } from "sonner";
import { getTimelineElementEndTime } from "@/lib/timeline";
import { mapMediaTimelineTime } from "@/lib/video/video-timing";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

/**
 * Add a one-second freeze frame to the selected media clip at the playhead.
 *
 * Shared by the timeline toolbar button and the `freeze-selected` shortcut
 * action so both entry points behave identically. Shows an error toast and
 * returns false when the current context does not allow freezing.
 */
export function freezeSelectedElementAtPlayhead(): boolean {
	const { selectedElements, tracks, updateMediaElement } =
		useTimelineStore.getState();
	if (selectedElements.length !== 1) {
		toast.error("Select exactly one video clip to add a freeze frame");
		return false;
	}
	const { trackId, elementId } = selectedElements[0];
	const track = tracks.find((candidate) => candidate.id === trackId);
	const element = track?.elements.find(
		(candidate) => candidate.id === elementId
	);
	if (!track || track.type !== "media" || element?.type !== "media") {
		toast.error("Select a video clip to add a freeze frame");
		return false;
	}
	const currentTime = usePlaybackStore.getState().currentTime;
	const elementEnd = getTimelineElementEndTime({ element });
	if (currentTime < element.startTime || currentTime > elementEnd) {
		toast.error("Move the playhead inside the selected clip");
		return false;
	}
	const projectFps = useProjectStore.getState().activeProject?.fps ?? 30;
	const playbackTiming = mapMediaTimelineTime({
		element,
		localTimelineTime: currentTime - element.startTime,
		fps: projectFps,
	});
	updateMediaElement(trackId, elementId, {
		freezeFrameTime: playbackTiming.sourceTime,
		freezeFrameDuration: 1,
	});
	return true;
}
