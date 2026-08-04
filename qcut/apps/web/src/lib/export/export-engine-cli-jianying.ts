import { resolveJianyingTransition } from "../../../../../electron/jianying-transition-catalog";
import type { TimelineTrack } from "@/types/timeline";
import type { VideoTransitionInput } from "../export-cli/types";

export interface PartitionedVideoTransitions {
	qcutTransitions: VideoTransitionInput[];
	jianyingTransitions: VideoTransitionInput[];
}

export function partitionJianyingTransitions({
	transitions,
}: {
	transitions: VideoTransitionInput[];
}): PartitionedVideoTransitions {
	const qcutTransitions: VideoTransitionInput[] = [];
	const jianyingTransitions: VideoTransitionInput[] = [];
	for (const transition of transitions) {
		if (resolveJianyingTransition({ value: transition.presetId })) {
			jianyingTransitions.push(transition);
			continue;
		}
		qcutTransitions.push(transition);
	}
	return { qcutTransitions, jianyingTransitions };
}

function findTransitionCutTime({
	transition,
	tracks,
}: {
	transition: VideoTransitionInput;
	tracks: TimelineTrack[];
}): number {
	const track = tracks.find((candidate) => candidate.id === transition.trackId);
	const toElement = track?.elements.find(
		(element) => element.id === transition.toElementId
	);
	if (!toElement) {
		throw new Error(
			`Transition ${transition.id} references a missing destination clip.`
		);
	}
	return toElement.startTime;
}

export function buildJianyingOutputPath({
	inputPath,
}: {
	inputPath: string;
}): string {
	const extensionIndex = inputPath.lastIndexOf(".");
	if (extensionIndex <= inputPath.lastIndexOf("/")) {
		return `${inputPath}-jianying.mp4`;
	}
	return `${inputPath.slice(0, extensionIndex)}-jianying${inputPath.slice(extensionIndex)}`;
}

export async function applyJianyingTimelineTransitions({
	inputPath,
	transitions,
	tracks,
	fps,
	width,
	height,
	onProgress,
}: {
	inputPath: string;
	transitions: VideoTransitionInput[];
	tracks: TimelineTrack[];
	fps: number;
	width: number;
	height: number;
	onProgress?: (percent: number, message: string) => void;
}): Promise<string> {
	if (transitions.length === 0) return inputPath;
	const api = window.electronAPI?.jianyingTransitions;
	if (!api) {
		throw new Error("转场实验室导出仅在 QCut 桌面版中可用。");
	}
	const result = await api.renderTimeline({
		inputPath,
		outputPath: buildJianyingOutputPath({ inputPath }),
		transitions: transitions.map((transition) => {
			const definition = resolveJianyingTransition({
				value: transition.presetId,
			});
			if (!definition) {
				throw new Error(
					`Unknown Transition Lab preset: ${transition.presetId}`
				);
			}
			return {
				presetId: definition.id,
				cutTime: findTransitionCutTime({ transition, tracks }),
				duration: transition.duration,
			};
		}),
		fps,
		width,
		height,
		overwrite: true,
	});
	onProgress?.(94, `已用本机剪映引擎渲染 ${result.transitionCount} 个转场`);
	return result.outputPath;
}
