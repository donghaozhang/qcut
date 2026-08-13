import { isSameProfileWritebackSnapshotCurrent } from "@/lib/jianying-draft/same-profile-writeback-current";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import type { CapCut81WritebackTimingSnapshot } from "@qcut/editor-core/jianying-draft";

export function isCapCutWritebackSnapshotCurrent({
	capturedProject,
	capturedSnapshot,
	currentProject,
	currentTracks,
}: {
	capturedProject: TProject;
	capturedSnapshot: CapCut81WritebackTimingSnapshot;
	currentProject: TProject | null;
	currentTracks: readonly TimelineTrack[];
}): boolean {
	return isSameProfileWritebackSnapshotCurrent({
		capturedProject,
		capturedSnapshot,
		currentProject,
		currentTracks,
		requireWritebackReady: true,
	});
}
