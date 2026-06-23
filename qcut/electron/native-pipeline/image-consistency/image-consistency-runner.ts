import type { PipelineStep } from "../execution/executor.js";
import type { StepInput, StepOutput } from "../execution/step-executors.js";
import { toOpenRouterMediaUrl } from "../execution/openrouter-media-content.js";
import { collectCandidates } from "./image-collector.js";
import { getImageConsistencyPromptSet } from "./image-consistency-prompts.js";
import { parseImageConsistencyResponse } from "./image-consistency-normalize.js";
import type {
	ImageCandidate,
	ImageConsistencyResult,
	ImageConsistencyRunOptions,
	ImageFinding,
	Severity,
} from "./types.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

export interface ImageConsistencyExecutor {
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

interface ImageConsistencyCollector {
	collectCandidates: typeof collectCandidates;
}

const severityRank: Record<Severity, number> = {
	low: 1,
	medium: 2,
	high: 3,
};

function shouldKeepSeverity({
	severity,
	minSeverity,
}: {
	severity: Severity;
	minSeverity: Severity;
}): boolean {
	return severityRank[severity] >= severityRank[minSeverity];
}

function chunkCandidates({
	candidates,
	batchSize,
}: {
	candidates: ImageCandidate[];
	batchSize: number;
}): ImageCandidate[][] {
	if (!Number.isInteger(batchSize) || batchSize <= 0) {
		throw new Error("Image consistency batchSize must be a positive integer");
	}
	const chunks: ImageCandidate[][] = [];
	for (let index = 0; index < candidates.length; index += batchSize) {
		chunks.push(candidates.slice(index, index + batchSize));
	}
	return chunks;
}

function buildBatchPrompt({
	basePrompt,
	referenceCount,
	batch,
}: {
	basePrompt: string;
	referenceCount: number;
	batch: ImageCandidate[];
}): string {
	const referenceLabels = Array.from(
		{ length: referenceCount },
		(_, index) => `REFERENCE ${index + 1}`
	).join("\n");
	const candidateLabels = batch
		.map((candidate) => `CANDIDATE index=${candidate.index}`)
		.join("\n");
	return `${basePrompt}

Image order:
${referenceLabels}
${candidateLabels}

Return findings only for the CANDIDATE images. Use the exact imageIndex from the labels.`;
}

function dedupeFindings({
	findings,
}: {
	findings: ImageFinding[];
}): ImageFinding[] {
	const seen = new Set<string>();
	const deduped: ImageFinding[] = [];
	for (const finding of findings) {
		const key = JSON.stringify([
			finding.imageIndex,
			finding.category,
			finding.severity,
			finding.comment,
		]);
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
}: {
	batch: ImageCandidate[];
	batchIndex: number;
	totalBatches: number;
	referenceImageUrls: string[];
	options: ImageConsistencyRunOptions;
	executor: ImageConsistencyExecutor;
	basePrompt: string;
	onProgress?: ProgressFn;
	signal?: AbortSignal;
}): Promise<ImageFinding[]> {
	onProgress?.({
		stage: "analyzing",
		percent: 20 + Math.round((batchIndex / Math.max(totalBatches, 1)) * 70),
		message: `Analyzing image-consistency batch ${batchIndex + 1}/${totalBatches}`,
		model: options.model,
	});

	const candidateImageUrls = batch.map((candidate) =>
		toOpenRouterMediaUrl({ input: candidate.path })
	);
	const step: PipelineStep = {
		type: "image_understanding",
		model: options.model,
		params: {
			prompt: buildBatchPrompt({
				basePrompt,
				referenceCount: referenceImageUrls.length,
				batch,
			}),
			analysis_type: "image_consistency",
			max_tokens: options.maxTokens,
		},
		enabled: true,
		retryCount: 0,
	};
	const input: StepInput = {
		images: [...referenceImageUrls, ...candidateImageUrls],
	};
	const result = await executor.executeStep(step, input, {
		outputDir: options.outputDir,
		signal,
	});
	if (!result.success) {
		throw new Error(result.error || "Image consistency analysis failed");
	}
	return parseImageConsistencyResponse({
		response: result.text || "",
		batchCandidates: batch,
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
}: {
	batches: ImageCandidate[][];
	referenceImageUrls: string[];
	options: ImageConsistencyRunOptions;
	executor: ImageConsistencyExecutor;
	basePrompt: string;
	onProgress?: ProgressFn;
	signal?: AbortSignal;
}): Promise<ImageFinding[]> {
	let chain = Promise.resolve<ImageFinding[]>([]);
	for (const [batchIndex, batch] of batches.entries()) {
		chain = chain.then(async (previous) => {
			const nextFindings = await runBatch({
				batch,
				batchIndex,
				totalBatches: batches.length,
				referenceImageUrls,
				options,
				executor,
				basePrompt,
				onProgress,
				signal,
			});
			return [...previous, ...nextFindings];
		});
	}
	return chain;
}

export async function runImageConsistencyCheck({
	options,
	executor,
	onProgress,
	signal,
	collector = { collectCandidates },
}: {
	options: ImageConsistencyRunOptions;
	executor: ImageConsistencyExecutor;
	onProgress?: ProgressFn;
	signal?: AbortSignal;
	collector?: ImageConsistencyCollector;
}): Promise<ImageConsistencyResult> {
	onProgress?.({
		stage: "collecting",
		percent: 10,
		message: "Collecting candidate images...",
		model: options.model,
	});
	const candidates = collector.collectCandidates({
		images: options.candidates,
		dir: options.dir,
	});

	const referenceImageUrls = options.refs.map((ref) =>
		toOpenRouterMediaUrl({ input: ref })
	);
	const promptSet = getImageConsistencyPromptSet({
		language: options.language,
		rule: options.rule,
	});
	const batches = chunkCandidates({
		candidates,
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
	});
	const severityFiltered = rawFindings.filter((finding) =>
		shouldKeepSeverity({
			severity: finding.severity,
			minSeverity: options.minSeverity,
		})
	);
	const findings = dedupeFindings({ findings: severityFiltered });

	onProgress?.({
		stage: "complete",
		percent: 100,
		message: "Image consistency analysis complete",
		model: options.model,
	});

	return {
		model: options.model,
		language: promptSet.language,
		referenceImages: options.refs,
		candidateImages: candidates.map((candidate) => candidate.path),
		ruleApplied: promptSet.ruleApplied,
		minSeverity: options.minSeverity,
		findings,
	};
}
