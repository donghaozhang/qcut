import type { JianyingAdjustValue } from "@/types/effects";
import type { TimelineTrack } from "@/types/timeline";

/**
 * Lab effects render through the Jianying runtime rather than QCut's own
 * stages, so they cannot join the FFmpeg graph. They are applied as a post-pass
 * over the exported file, one clip window at a time, the same way Transition
 * Lab renders its transitions after the main export.
 */

const EFFECT_PROGRESS_START = 94;
const EFFECT_PROGRESS_END = 98;

/**
 * Keeps a real video extension on every intermediate file — ffmpeg picks the
 * muxer from it, and a name ending in ".effect-0" has no muxer at all.
 */
function buildEffectPassOutputPath({
	inputPath,
	index,
}: {
	inputPath: string;
	index: number;
}): string {
	const separator = inputPath.lastIndexOf("/");
	const extensionIndex = inputPath.lastIndexOf(".");
	if (extensionIndex <= separator) {
		return `${inputPath}-jy-effect-${index}.mp4`;
	}
	return `${inputPath.slice(0, extensionIndex)}-jy-effect-${index}${inputPath.slice(extensionIndex)}`;
}

export interface JianyingEffectExportRequest {
	effectId: string;
	packageHash: string;
	startSeconds: number;
	durationSeconds: number;
	adjustValues?: JianyingAdjustValue[];
}

export function collectJianyingEffectRequests({
	tracks,
}: {
	tracks: TimelineTrack[];
}): JianyingEffectExportRequest[] {
	const requests: JianyingEffectExportRequest[] = [];

	for (const track of tracks) {
		// Mirrors the base export's visibility rules; a hidden track must not
		// change the picture through a post-pass either.
		if (track.hidden || track.muted) continue;
		for (const element of track.elements) {
			if (element.hidden) continue;
			for (const effect of element.effects ?? []) {
				if (effect.engine !== "jianying-local") continue;
				if (!effect.packageHash || !effect.presetId) continue;
				if (!effect.enabled) continue;

				// A range is clip-local, so it offsets from where the clip sits.
				const range = effect.timelineRange;
				const start = range
					? element.startTime + range.startTime
					: element.startTime;
				const duration =
					range?.duration ??
					(effect.duration > 0 ? effect.duration : element.duration);

				requests.push({
					effectId: effect.presetId,
					packageHash: effect.packageHash,
					startSeconds: start,
					durationSeconds: duration,
					adjustValues: effect.adjustValues,
				});
			}
		}
	}

	return requests.sort((left, right) => left.startSeconds - right.startSeconds);
}

export async function applyJianyingTimelineEffects({
	inputPath,
	requests,
	fps,
	width,
	height,
	onProgress,
	shouldCancel,
}: {
	inputPath: string;
	requests: JianyingEffectExportRequest[];
	fps: number;
	width: number;
	height: number;
	onProgress?: (percent: number, message: string) => void;
	shouldCancel?: () => boolean;
}): Promise<string> {
	if (requests.length === 0) return inputPath;

	const api = window.electronAPI?.jianyingEffects;
	if (!api) {
		throw new Error("特效实验室导出仅在 QCut 桌面版中可用。");
	}

	// Each pass consumes the previous pass's output so stacked effects compose
	// in timeline order.
	let currentPath = inputPath;
	for (const [index, request] of requests.entries()) {
		if (shouldCancel?.()) {
			throw new Error("导出已取消。");
		}
		const result = await api.render({
			effectId: request.effectId,
			packageHash: request.packageHash,
			inputPath: currentPath,
			outputPath: buildEffectPassOutputPath({ inputPath, index }),
			width,
			height,
			frameRate: fps,
			startSeconds: request.startSeconds,
			durationSeconds: request.durationSeconds,
			adjustValues: request.adjustValues,
		});
		currentPath = result.outputPath;
		onProgress?.(
			EFFECT_PROGRESS_START +
				Math.round(
					((index + 1) / requests.length) *
						(EFFECT_PROGRESS_END - EFFECT_PROGRESS_START)
				),
			`已用本机剪映引擎渲染 ${index + 1}/${requests.length} 个特效`
		);
	}

	return currentPath;
}
