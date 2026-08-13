import type { SameProfileWritebackTimingSnapshot } from "@qcut/editor-core/jianying-draft";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { createSameProfileWritebackTimingSnapshot } from "./same-profile-writeback-snapshot";

export function isSameProfileWritebackSnapshotCurrent({
	capturedProject,
	capturedSnapshot,
	currentProject,
	currentTracks,
	requireWritebackReady = true,
}: {
	capturedProject: TProject;
	capturedSnapshot: SameProfileWritebackTimingSnapshot;
	currentProject: TProject | null;
	currentTracks: readonly TimelineTrack[];
	requireWritebackReady?: boolean;
}): boolean {
	const capturedBinding = capturedProject.draftInterop;
	const currentBinding = currentProject?.draftInterop;
	if (
		currentProject === null ||
		capturedBinding === undefined ||
		currentBinding === undefined ||
		(requireWritebackReady && currentBinding.writeback.status !== "ready") ||
		currentProject.id !== capturedProject.id ||
		currentProject.currentSceneId !== capturedProject.currentSceneId ||
		(currentProject.fps ?? 30) !== (capturedProject.fps ?? 30) ||
		currentBinding.profileId !== capturedBinding.profileId ||
		currentBinding.importId !== capturedBinding.importId ||
		currentBinding.bundleDigest !== capturedBinding.bundleDigest
	) {
		return false;
	}

	const currentSnapshot = createSameProfileWritebackTimingSnapshot({
		fps: currentProject.fps ?? 30,
		tracks: currentTracks,
	});
	return JSON.stringify(currentSnapshot) === JSON.stringify(capturedSnapshot);
}
