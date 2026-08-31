import { registerActiveMaskTrackingRuntime } from "@/lib/segmentation/mask-tracking-runtime";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { JianyingMotionTrackingAPI } from "@/types/electron/api-jianying-motion-tracking";
import type {
	MediaElement,
	MediaMask,
	MediaMaskTrackingDirection,
} from "@/types/timeline";
import { generateUUID } from "@/lib/utils";
import { updateMediaMaskInStack } from "./media-mask-stack";
import { resolveMediaVisualProperties } from "./video-properties";
import { trackMediaMaskWithJianying } from "./jianying-motion-tracking-client";

interface MotionTrackingTarget {
	element: MediaElement;
	mask: MediaMask;
}

function currentTarget({
	elementId,
	maskId,
	trackId,
}: {
	elementId: string;
	maskId: string;
	trackId: string;
}): MotionTrackingTarget | null {
	const track = useTimelineStore
		.getState()
		.tracks.find((candidate) => candidate.id === trackId);
	const element = track?.elements.find(
		(candidate) => candidate.id === elementId
	);
	if (element?.type !== "media") return null;
	const mask = resolveMediaVisualProperties(element).masks.find(
		(candidate) => candidate.id === maskId
	);
	return mask ? { element, mask } : null;
}

function patchCurrentMask({
	elementId,
	history = false,
	maskId,
	trackId,
	updates,
}: {
	elementId: string;
	history?: boolean;
	maskId: string;
	trackId: string;
	updates: Partial<MediaMask>;
}) {
	const target = currentTarget({ elementId, maskId, trackId });
	if (!target) return;
	const masks = resolveMediaVisualProperties(target.element).masks;
	useTimelineStore.getState().updateMediaElement(
		trackId,
		elementId,
		{
			masks: updateMediaMaskInStack({ masks, maskId, updates }),
		},
		history
	);
}

function errorMessage({ error }: { error: unknown }) {
	if (!(error instanceof Error)) return "本机运动跟踪失败";
	return error.message
		.replace(/^Error invoking remote method '[^']+':\s*/u, "")
		.replace(/^Error:\s*/u, "");
}

export async function runJianyingMotionTracking({
	api,
	currentFrame,
	direction,
	elementId,
	fps,
	maskId,
	sourcePath,
	trackId,
}: {
	api: JianyingMotionTrackingAPI;
	currentFrame: number;
	direction: MediaMaskTrackingDirection;
	elementId: string;
	fps: number;
	maskId: string;
	sourcePath: string;
	trackId: string;
}) {
	const taskId = `jianying-motion-${generateUUID()}`;
	const unregisterProgress = api.onProgress((progress) => {
		if (progress.taskId !== taskId) return;
		const target = currentTarget({ elementId, maskId, trackId });
		if (!target || target.mask.tracking?.status === "paused") return;
		patchCurrentMask({
			elementId,
			maskId,
			trackId,
			updates: {
				tracking: {
					...target.mask.tracking,
					direction,
					status: "processing",
					source: "jianying-bingo",
					progress: progress.progress,
					anchorFrame: currentFrame,
				},
			},
		});
	});
	const unregisterRuntime = registerActiveMaskTrackingRuntime({
		runtime: {
			elementId,
			maskId,
			source: "jianying-bingo",
			direction,
			cancel: () => api.cancel({ taskId }),
		},
	});
	try {
		const target = currentTarget({ elementId, maskId, trackId });
		if (!target) throw new Error("跟踪蒙版已不存在");
		if (!sourcePath) throw new Error("找不到视频的本机路径");
		const trackedMask = await trackMediaMaskWithJianying({
			api,
			currentFrame,
			direction,
			element: target.element,
			fps,
			mask: target.mask,
			sourcePath,
			taskId,
		});
		if (
			currentTarget({ elementId, maskId, trackId })?.mask.tracking?.status ===
			"paused"
		) {
			return;
		}
		patchCurrentMask({
			elementId,
			maskId,
			trackId,
			updates: trackedMask,
		});
	} catch (error) {
		const target = currentTarget({ elementId, maskId, trackId });
		if (!target || target.mask.tracking?.status === "paused") return;
		patchCurrentMask({
			elementId,
			maskId,
			trackId,
			updates: {
				tracking: {
					...target.mask.tracking,
					direction,
					status: "error",
					source: "jianying-bingo",
					progress: target.mask.tracking?.progress ?? 0,
					anchorFrame: currentFrame,
					error: errorMessage({ error }),
				},
			},
		});
	} finally {
		unregisterProgress();
		unregisterRuntime();
	}
}
