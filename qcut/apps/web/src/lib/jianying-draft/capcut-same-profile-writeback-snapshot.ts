import type { CapCut81WritebackTimingSnapshot } from "@qcut/editor-core/jianying-draft";
import type { TimelineTrack } from "@/types/timeline";
import { createSameProfileWritebackTimingSnapshot } from "./same-profile-writeback-snapshot";

export { buildTimelineDurationByElementId } from "./same-profile-writeback-snapshot";

export function createCapCut81WritebackTimingSnapshot({
	fps,
	tracks,
}: {
	fps: number;
	tracks: readonly TimelineTrack[];
}): CapCut81WritebackTimingSnapshot {
	return createSameProfileWritebackTimingSnapshot({ fps, tracks });
}
