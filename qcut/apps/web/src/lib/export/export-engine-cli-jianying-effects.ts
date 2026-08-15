import type { TimelineTrack } from "@/types/timeline";
import { buildJianyingOutputPath } from "./export-engine-cli-jianying";

/**
 * Lab effects render through the Jianying runtime rather than QCut's own
 * stages, so they cannot join the FFmpeg graph. They are applied as a post-pass
 * over the exported file, one clip window at a time, the same way Transition
 * Lab renders its transitions after the main export.
 */

export interface JianyingEffectExportRequest {
	effectId: string;
	packageHash: string;
	startSeconds: number;
	durationSeconds: number;
}

export function collectJianyingEffectRequests({
	tracks,
}: {
	tracks: TimelineTrack[];
}): JianyingEffectExportRequest[] {
	const requests: JianyingEffectExportRequest[] = [];

	for (const track of tracks) {
		for (const element of track.elements) {
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
}: {
	inputPath: string;
	requests: JianyingEffectExportRequest[];
	fps: number;
	width: number;
	height: number;
	onProgress?: (percent: number, message: string) => void;
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
		const outputPath = buildJianyingOutputPath({
			inputPath: `${currentPath}.effect-${index}`,
		});
		const result = await api.render({
			effectId: request.effectId,
			inputPath: currentPath,
			outputPath,
			width,
			height,
			frameRate: fps,
			startSeconds: request.startSeconds,
			durationSeconds: request.durationSeconds,
		});
		currentPath = result.outputPath;
		onProgress?.(
			95,
			`已用本机剪映引擎渲染 ${index + 1}/${requests.length} 个特效`
		);
	}

	return currentPath;
}
