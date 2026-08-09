import { createCapCut81WritebackTimingSnapshot } from "@/lib/jianying-draft/capcut-same-profile-writeback-snapshot";
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
	const capturedBinding = capturedProject.draftInterop;
	const currentBinding = currentProject?.draftInterop;
	if (
		currentProject === null ||
		capturedBinding === undefined ||
		currentBinding === undefined ||
		currentBinding.writeback.status !== "ready" ||
		currentProject.id !== capturedProject.id ||
		currentProject.currentSceneId !== capturedProject.currentSceneId ||
		(currentProject.fps ?? 30) !== (capturedProject.fps ?? 30) ||
		currentBinding.profileId !== capturedBinding.profileId ||
		currentBinding.importId !== capturedBinding.importId ||
		currentBinding.bundleDigest !== capturedBinding.bundleDigest
	) {
		return false;
	}

	const currentSnapshot = createCapCut81WritebackTimingSnapshot({
		fps: currentProject.fps ?? 30,
		tracks: currentTracks,
	});
	return JSON.stringify(currentSnapshot) === JSON.stringify(capturedSnapshot);
}
