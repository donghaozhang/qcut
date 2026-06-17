import type { PipelineStep } from "../execution/executor.js";
import type { StepInput, StepOutput } from "../execution/step-executors.js";
import { toOpenRouterMediaUrl } from "../execution/openrouter-media-content.js";
import { extractKeyframes, probeVideoMeta } from "./frame-extractor.js";
import { getConsistencyPromptSet } from "./consistency-prompts.js";
import { parseConsistencyResponse } from "./consistency-normalize.js";
import type {
	ConsistencyFinding,
	ConsistencyResult,
	ConsistencyRunOptions,
	Keyframe,
	Severity,
} from "./types.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

export interface ConsistencyExecutor {
	executeStep: (
		step: PipelineStep,
		input: StepInput,
		options: {
			outputDir?: string;
			onProgress?: (percent: number, message: string) => void;
			signal?: AbortSignal;
		}
	) => Promise<StepOutput>;
}

interface ConsistencyFrameTools {
	probeVideoMeta: typeof probeVideoMeta;
	extractKeyframes: typeof extractKeyframes;
}

const severityRank: Record<Severity, number> = {
	low: 1,
	medium: 2,
	high: 3,
};

function chunkKeyframes({
	keyframes,
	batchSize,
}: {
	keyframes: Keyframe[];
	batchSize: number;
}): Keyframe[][] {
	const chunks: Keyframe[][] = [];
	for (let index = 0; index < keyframes.length; index += batchSize) {
		chunks.push(keyframes.slice(index, index + batchSize));
	}
	return chunks;
}

function buildFrameLabel({ keyframe }: { keyframe: Keyframe }): string {
	return `FRAME index=${keyframe.index} frameNumber=${keyframe.frameNumber} timeSeconds=${keyframe.timeSeconds.toFixed(
		3
	)}`;
}

function buildBatchPrompt({
	basePrompt,
	referenceCount,
	keyframes,
}: {
	basePrompt: string;
	referenceCount: number;
	keyframes: Keyframe[];
}): string {
	const referenceLabels = Array.from(
		{ length: referenceCount },
		(_, index) => `REFERENCE ${index + 1}`
	).join("\n");
	const frameLabels = keyframes
		.map((keyframe) => buildFrameLabel({ keyframe }))
		.join("\n");
	return `${basePrompt}

Image order:
${referenceLabels}
${frameLabels}

Return findings only for the FRAME images. Use the exact frameNumber from the labels.`;
}

function shouldKeepSeverity({
	severity,
	minSeverity,
}: {
	severity: Severity;
	minSeverity: Severity;
}): boolean {
	return severityRank[severity] >= severityRank[minSeverity];
}

function mergeFindings({
	left,
	right,
}: {
	left: ConsistencyFinding;
	right: ConsistencyFinding;
}): ConsistencyFinding {
	return {
		...left,
		endFrame: Math.max(left.endFrame, right.endFrame),
		endTime: right.endFrame >= left.endFrame ? right.endTime : left.endTime,
		severity:
			severityRank[right.severity] > severityRank[left.severity]
				? right.severity
				: left.severity,
		comment: `${left.comment} ${right.comment}`.trim(),
		fix: left.fix === right.fix ? left.fix : `${left.fix} ${right.fix}`.trim(),
	};
}

export function mergeAdjacentFindings({
	findings,
}: {
	findings: ConsistencyFinding[];
}): ConsistencyFinding[] {
	const sorted = [...findings].sort((left, right) => {
		if (left.startFrame !== right.startFrame) {
			return left.startFrame - right.startFrame;
		}
		return left.category.localeCompare(right.category);
	});
	const merged: ConsistencyFinding[] = [];
	for (const finding of sorted) {
		const previous = merged[merged.length - 1];
		const canMerge =
			previous !== undefined &&
			previous.category === finding.category &&
			finding.startFrame <= previous.endFrame + 1;
		if (!canMerge) {
			merged.push(finding);
			continue;
		}
		merged[merged.length - 1] = mergeFindings({
			left: previous,
			right: finding,
		});
	}
	return merged;
}

function dedupeFindings({
	findings,
}: {
	findings: ConsistencyFinding[];
}): ConsistencyFinding[] {
	const seen = new Set<string>();
	const deduped: ConsistencyFinding[] = [];
	for (const finding of findings) {
		const key = [
			finding.startFrame,
			finding.endFrame,
			finding.category,
			finding.severity,
			finding.comment,
		].join("|");
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(finding);
	}
	return deduped;
}

async function runBatch({
	batch,
	batchIndex,
	totalBatches,
	referenceImageUrls,
	options,
	executor,
	basePrompt,
	onProgress,
	signal,
	videoFps,
}: {
	batch: Keyframe[];
	batchIndex: number;
	totalBatches: number;
	referenceImageUrls: string[];
	options: ConsistencyRunOptions;
	executor: ConsistencyExecutor;
	basePrompt: string;
	onProgress?: ProgressFn;
	signal?: AbortSignal;
	videoFps: number;
}): Promise<ConsistencyFinding[]> {
	onProgress?.({
		stage: "analyzing",
		percent: 30 + Math.round((batchIndex / Math.max(totalBatches, 1)) * 55),
		message: `Analyzing consistency batch ${batchIndex + 1}/${totalBatches}`,
		model: options.model,
	});

	const frameImageUrls = batch.map((keyframe) =>
		toOpenRouterMediaUrl({ input: keyframe.path })
	);
	const step: PipelineStep = {
		type: "image_understanding",
		model: options.model,
		params: {
			prompt: buildBatchPrompt({
				basePrompt,
				referenceCount: referenceImageUrls.length,
				keyframes: batch,
			}),
			analysis_type: "character_consistency",
			max_tokens: options.maxTokens,
		},
		enabled: true,
		retryCount: 0,
	};
	const input: StepInput = {
		images: [...referenceImageUrls, ...frameImageUrls],
	};
	const result = await executor.executeStep(step, input, {
		outputDir: options.outputDir,
		signal,
	});
	if (!result.success) {
		throw new Error(result.error || "Character consistency analysis failed");
	}
	return parseConsistencyResponse({
		response: result.text || "",
		batchKeyframes: batch,
		samplingFps: options.fps,
		videoFps,
	});
}

async function runBatchesSequentially({
	batches,
	referenceImageUrls,
	options,
	executor,
	basePrompt,
	onProgress,
	signal,
	videoFps,
}: {
	batches: Keyframe[][];
	referenceImageUrls: string[];
	options: ConsistencyRunOptions;
	executor: ConsistencyExecutor;
	basePrompt: string;
	onProgress?: ProgressFn;
	signal?: AbortSignal;
	videoFps: number;
}): Promise<ConsistencyFinding[]> {
	return batches.reduce<Promise<ConsistencyFinding[]>>(
		async (previousPromise, batch, batchIndex) => {
			const previous = await previousPromise;
			const findings = await runBatch({
				batch,
				batchIndex,
				totalBatches: batches.length,
				referenceImageUrls,
				options,
				executor,
				basePrompt,
				onProgress,
				signal,
				videoFps,
			});
			return [...previous, ...findings];
		},
		Promise.resolve([])
	);
}

export async function runConsistencyCheck({
	options,
	executor,
	onProgress,
	signal,
	frameTools = { probeVideoMeta, extractKeyframes },
}: {
	options: ConsistencyRunOptions;
	executor: ConsistencyExecutor;
	onProgress?: ProgressFn;
	signal?: AbortSignal;
	frameTools?: ConsistencyFrameTools;
}): Promise<ConsistencyResult> {
	onProgress?.({
		stage: "probing",
		percent: 5,
		message: "Probing video metadata...",
		model: options.model,
	});
	const videoMeta = await frameTools.probeVideoMeta({
		input: options.videoInput,
	});

	onProgress?.({
		stage: "extracting",
		percent: 15,
		message: "Extracting keyframes...",
		model: options.model,
	});
	const keyframes = await frameTools.extractKeyframes({
		input: options.videoInput,
		fps: options.fps,
		sceneDetect: options.sceneDetect,
		outputDir: options.outputDir,
		videoFps: videoMeta.fps,
	});
	const referenceImageUrls = options.refs.map((ref) =>
		toOpenRouterMediaUrl({ input: ref })
	);
	const promptSet = getConsistencyPromptSet({ language: options.language });
	const batches = chunkKeyframes({
		keyframes,
		batchSize: options.batchSize,
	});
	const rawFindings = await runBatchesSequentially({
		batches,
		referenceImageUrls,
		options,
		executor,
		basePrompt: promptSet.system,
		onProgress,
		signal,
		videoFps: videoMeta.fps,
	});
	const severityFiltered = rawFindings.filter((finding) =>
		shouldKeepSeverity({
			severity: finding.severity,
			minSeverity: options.minSeverity,
		})
	);
	const findings = dedupeFindings({
		findings: mergeAdjacentFindings({ findings: severityFiltered }),
	});

	onProgress?.({
		stage: "complete",
		percent: 100,
		message: "Character consistency analysis complete",
		model: options.model,
	});

	return {
		video: options.videoInput,
		model: options.model,
		videoFps: videoMeta.fps,
		totalFrames: videoMeta.totalFrames,
		referenceImages: options.refs,
		samplingFps: options.fps,
		minSeverity: options.minSeverity,
		findings,
	};
}
