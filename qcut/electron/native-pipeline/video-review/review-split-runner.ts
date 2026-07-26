import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { PipelineExecutor, PipelineStep } from "../execution/executor.js";
import type { StepOutput } from "../execution/step-executors.js";
import type { VideoSplitPart } from "../editorial/video-split.js";
import {
	partCountForPayload,
	probeVideoDurationSeconds,
	shouldSplitVideoInput,
	splitVideoIntoParts,
} from "../editorial/video-split.js";
import type { ReviewArtifactResult } from "./review-artifacts.js";
import { writeReviewArtifacts } from "./review-artifacts.js";
import type { ReviewComment } from "./review-normalize.js";
import { parseReviewModelResponse } from "./review-normalize.js";
import type { ReviewPromptSet } from "./review-prompts.js";

const DEFAULT_MAX_REVIEW_PAYLOAD_CHARS = 35 * 1024 * 1024;

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

export type ReviewSplitPart = VideoSplitPart;

export interface ReviewSplitPartResult {
	part: ReviewSplitPart;
	output: StepOutput;
	comments: ReviewComment[];
	artifact?: ReviewArtifactResult;
	rawText: string;
	parsed: unknown;
}

export interface ReviewSplitResult {
	comments: ReviewComment[];
	artifacts: ReviewArtifactResult;
	rawAnalysis: unknown;
	parts: ReviewSplitPartResult[];
}

export interface ReviewVideoSplitter {
	probeDurationSeconds: (args: { input: string }) => Promise<number>;
	splitVideo: (args: {
		input: string;
		outputDir: string;
		partCount: number;
		durationSeconds: number;
	}) => Promise<ReviewSplitPart[]>;
}

interface RunSplitReviewIfNeededOptions {
	videoInput: string;
	outputDir: string;
	videoDisplayName: string;
	model: string;
	step: PipelineStep;
	executor: PipelineExecutor;
	promptSet: ReviewPromptSet;
	onProgress: ProgressFn;
	signal: AbortSignal;
	startTime: number;
	maxPayloadChars?: number;
	splitter?: ReviewVideoSplitter;
}

/**
 * Resolves the maximum allowed review payload size in characters.
 *
 * Precedence: explicit `value` → `QCUT_REVIEW_SPLIT_MAX_PAYLOAD_CHARS` env var → built-in default.
 *
 * @param value - Optional explicit override for the maximum payload size.
 * @returns The effective maximum payload size in characters.
 */
function resolveMaxPayloadChars({ value }: { value?: number }): number {
	if (value !== undefined) return value;
	const envValue = process.env.QCUT_REVIEW_SPLIT_MAX_PAYLOAD_CHARS;
	if (!envValue) return DEFAULT_MAX_REVIEW_PAYLOAD_CHARS;
	const parsed = Number.parseInt(envValue, 10);
	return Number.isFinite(parsed) && parsed > 0
		? parsed
		: DEFAULT_MAX_REVIEW_PAYLOAD_CHARS;
}

/**
 * Parses an `HH:MM:SS` or `MM:SS` timestamp into total seconds.
 *
 * @param timestamp - The colon-separated timestamp string.
 * @returns The timestamp converted to seconds, or `0` if it cannot be parsed.
 */
function timestampToSeconds({ timestamp }: { timestamp: string }): number {
	const parts = timestamp.split(":").map((part) => Number(part));
	if (parts.some((part) => !Number.isFinite(part))) return 0;
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	return 0;
}

/**
 * Formats a number of seconds as a zero-padded `HH:MM:SS` timestamp.
 *
 * @param seconds - The number of seconds (negative values are clamped to 0).
 * @returns The formatted `HH:MM:SS` string.
 */
function secondsToTimestamp({ seconds }: { seconds: number }): string {
	const rounded = Number.isFinite(seconds)
		? Math.max(0, Math.round(seconds))
		: 0;
	const hours = Math.floor(rounded / 3600);
	const minutes = Math.floor((rounded % 3600) / 60);
	const secs = rounded % 60;
	return [hours, minutes, secs]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

/**
 * Returns a copy of a review comment with its timestamp shifted by an offset.
 *
 * Used to map a part-relative timestamp back onto the original full-length video.
 *
 * @param comment - The review comment to shift.
 * @param offsetSeconds - Seconds to add to the comment's timestamp (the part's start offset).
 * @returns A new comment with the adjusted timestamp.
 */
function shiftCommentTimestamp({
	comment,
	offsetSeconds,
}: {
	comment: ReviewComment;
	offsetSeconds: number;
}): ReviewComment {
	return {
		...comment,
		timestamp: secondsToTimestamp({
			seconds:
				timestampToSeconds({ timestamp: comment.timestamp }) + offsetSeconds,
		}),
	};
}

const defaultSplitter: ReviewVideoSplitter = {
	probeDurationSeconds: probeVideoDurationSeconds,
	splitVideo: (args) =>
		splitVideoIntoParts({
			...args,
			subdirName: "review-split-parts",
			partDirSuffix: "review",
		}),
};

/**
 * Assembles the raw analysis payload persisted alongside a single reviewed part.
 *
 * @param video - Display name of the part's video file.
 * @param model - Identifier of the review model used.
 * @param duration - Wall-clock duration of the part review, in seconds.
 * @param review - Parsed model response for the part.
 * @returns A serializable raw-analysis record for the part.
 */
function rawAnalysisForPart({
	video,
	model,
	duration,
	review,
}: {
	video: string;
	model: string;
	duration: number;
	review: ReturnType<typeof parseReviewModelResponse>;
}): unknown {
	return {
		type: "review",
		video,
		model,
		duration,
		content: review.parsed,
		rawText: review.rawText,
	};
}

/**
 * Runs the review step on a single split part and writes its artifacts.
 *
 * On success, comment timestamps are shifted by the part's start offset so they map
 * back onto the original video; on failure, an empty comment list is returned.
 *
 * @param part - The split part to review.
 * @param step - The pipeline step describing the review operation.
 * @param executor - Pipeline executor used to run the step.
 * @param promptSet - Prompt set passed through to artifact generation.
 * @param model - Identifier of the review model.
 * @param signal - Abort signal for cancellation.
 * @param onProgress - Progress callback invoked during the part review.
 * @returns The part's review result, including comments, artifact, and raw output.
 */
async function reviewPart({
	part,
	step,
	executor,
	promptSet,
	model,
	signal,
	onProgress,
}: {
	part: ReviewSplitPart;
	step: PipelineStep;
	executor: PipelineExecutor;
	promptSet: ReviewPromptSet;
	model: string;
	signal: AbortSignal;
	onProgress: ProgressFn;
}): Promise<ReviewSplitPartResult> {
	const startedAt = Date.now();
	const output = await executor.executeStep(
		step,
		{ videoUrl: part.filePath },
		{
			outputDir: part.outputDir,
			onProgress: (percent, message) => {
				onProgress({
					stage: "review_split_part",
					percent,
					message: `Part ${part.index + 1}: ${message}`,
					model,
				});
			},
			signal,
		}
	);
	const resultData = output.text || output.data;
	const review = parseReviewModelResponse({ response: resultData });
	const duration = (Date.now() - startedAt) / 1000;
	const video = basename(part.filePath);
	const artifact = writeReviewArtifacts({
		outputDir: part.outputDir,
		video,
		model,
		duration,
		promptSet,
		comments: review.comments,
		rawAnalysis: rawAnalysisForPart({ video, model, duration, review }),
	});

	if (!output.success) {
		return {
			part,
			output,
			comments: [],
			artifact,
			rawText: review.rawText,
			parsed: review.parsed,
		};
	}

	return {
		part,
		output,
		comments: review.comments.map((comment) =>
			shiftCommentTimestamp({ comment, offsetSeconds: part.startSeconds })
		),
		artifact,
		rawText: review.rawText,
		parsed: review.parsed,
	};
}

/**
 * Reviews all split parts one at a time, in order, accumulating their results.
 *
 * Parts are processed sequentially to bound memory and API concurrency; overall
 * progress is reported as each part begins.
 *
 * @param parts - The split parts to review.
 * @param step - The pipeline step describing the review operation.
 * @param executor - Pipeline executor used to run each part.
 * @param promptSet - Prompt set passed through to each part review.
 * @param model - Identifier of the review model.
 * @param signal - Abort signal for cancellation.
 * @param onProgress - Progress callback invoked across parts.
 * @returns The ordered list of per-part review results.
 */
async function reviewPartsSequentially({
	parts,
	step,
	executor,
	promptSet,
	model,
	signal,
	onProgress,
}: {
	parts: ReviewSplitPart[];
	step: PipelineStep;
	executor: PipelineExecutor;
	promptSet: ReviewPromptSet;
	model: string;
	signal: AbortSignal;
	onProgress: ProgressFn;
}): Promise<ReviewSplitPartResult[]> {
	return parts.reduce<Promise<ReviewSplitPartResult[]>>(
		async (previousPromise, part) => {
			const previous = await previousPromise;
			onProgress({
				stage: "review_split_part",
				percent: Math.round((part.index / parts.length) * 90),
				message: `Reviewing split part ${part.index + 1}/${parts.length}`,
				model,
			});
			const result = await reviewPart({
				part,
				step,
				executor,
				promptSet,
				model,
				signal,
				onProgress,
			});
			return [...previous, result];
		},
		Promise.resolve([])
	);
}

/**
 * Writes a JSON manifest describing the split and the outcome of each reviewed part.
 *
 * @param outputDir - Directory the manifest is written to.
 * @param videoInput - The original video input path.
 * @param fileBytes - Size of the original video in bytes.
 * @param estimatedPayloadChars - Estimated payload size of the original video.
 * @param maxPayloadChars - Maximum payload size used to decide the split.
 * @param durationSeconds - Total duration of the original video.
 * @param parts - The split parts that were produced.
 * @param results - Per-part review results to record.
 * @returns The path to the written manifest file.
 */
function writeSplitManifest({
	outputDir,
	videoInput,
	fileBytes,
	estimatedPayloadChars,
	maxPayloadChars,
	durationSeconds,
	parts,
	results,
}: {
	outputDir: string;
	videoInput: string;
	fileBytes: number;
	estimatedPayloadChars: number;
	maxPayloadChars: number;
	durationSeconds: number;
	parts: ReviewSplitPart[];
	results: ReviewSplitPartResult[];
}): string {
	const manifestPath = join(outputDir, "review-split-manifest.json");
	writeFileSync(
		manifestPath,
		`${JSON.stringify(
			{
				videoInput,
				fileBytes,
				estimatedPayloadChars,
				maxPayloadChars,
				durationSeconds,
				partCount: parts.length,
				parts: results.map((result) => ({
					index: result.part.index,
					startSeconds: result.part.startSeconds,
					durationSeconds: result.part.durationSeconds,
					filePath: result.part.filePath,
					outputDir: result.part.outputDir,
					commentCount: result.comments.length,
					success: result.output.success,
					error: result.output.error,
					artifact: result.artifact,
				})),
			},
			null,
			2
		)}\n`,
		"utf-8"
	);
	return manifestPath;
}

/**
 * Splits an oversized video into parts, reviews each, and merges the results.
 *
 * Returns `null` when the input does not need splitting (remote/inline, missing, or
 * within the payload limit), letting the caller fall back to a single-pass review.
 * When splitting is required it probes duration, splits, reviews parts sequentially,
 * writes a manifest plus combined artifacts, and merges comments back onto the
 * original timeline.
 *
 * @param options - Review inputs, pipeline context, progress/abort hooks, and an
 *   optional `splitter` override (defaults to the `ffprobe`/`ffmpeg`-backed splitter).
 * @returns The merged split review result, or `null` if no split was needed.
 * @throws If any split part fails to review.
 */
export async function runSplitReviewIfNeeded({
	videoInput,
	outputDir,
	videoDisplayName,
	model,
	step,
	executor,
	promptSet,
	onProgress,
	signal,
	startTime,
	maxPayloadChars,
	splitter = defaultSplitter,
}: RunSplitReviewIfNeededOptions): Promise<ReviewSplitResult | null> {
	const resolvedMaxPayloadChars = resolveMaxPayloadChars({
		value: maxPayloadChars,
	});
	const splitDecision = shouldSplitVideoInput({
		input: videoInput,
		maxPayloadChars: resolvedMaxPayloadChars,
	});
	if (!splitDecision.shouldSplit) return null;

	onProgress({
		stage: "review_split",
		percent: 5,
		message: `Splitting video review input (${splitDecision.estimatedPayloadChars} estimated payload chars)`,
		model,
	});

	const durationSeconds = await splitter.probeDurationSeconds({
		input: videoInput,
	});
	const partCount = partCountForPayload({
		estimatedPayloadChars: splitDecision.estimatedPayloadChars,
		maxPayloadChars: resolvedMaxPayloadChars,
	});
	const parts = await splitter.splitVideo({
		input: videoInput,
		outputDir,
		partCount,
		durationSeconds,
	});
	const results = await reviewPartsSequentially({
		parts,
		step,
		executor,
		promptSet,
		model,
		signal,
		onProgress,
	});
	const failed = results.find((result) => !result.output.success);
	if (failed) {
		throw new Error(
			`Split review part ${failed.part.index + 1} failed: ${failed.output.error || "unknown error"}`
		);
	}

	const comments = results
		.flatMap((result) => result.comments)
		.sort(
			(left, right) =>
				timestampToSeconds({ timestamp: left.timestamp }) -
				timestampToSeconds({ timestamp: right.timestamp })
		);
	const manifestPath = writeSplitManifest({
		outputDir,
		videoInput,
		fileBytes: splitDecision.fileBytes,
		estimatedPayloadChars: splitDecision.estimatedPayloadChars,
		maxPayloadChars: resolvedMaxPayloadChars,
		durationSeconds,
		parts,
		results,
	});
	const duration = (Date.now() - startTime) / 1000;
	const rawAnalysis = {
		type: "review",
		video: videoDisplayName,
		model,
		duration,
		content: {
			comments,
			splitReview: {
				enabled: true,
				manifestPath,
				fileBytes: splitDecision.fileBytes,
				estimatedPayloadChars: splitDecision.estimatedPayloadChars,
				maxPayloadChars: resolvedMaxPayloadChars,
				durationSeconds,
				partCount: parts.length,
				parts: results.map((result) => ({
					index: result.part.index,
					startSeconds: result.part.startSeconds,
					durationSeconds: result.part.durationSeconds,
					filePath: result.part.filePath,
					outputDir: result.part.outputDir,
					commentCount: result.comments.length,
					rawText: result.rawText,
					parsed: result.parsed,
				})),
			},
		},
		rawText: results.map((result) => result.rawText).join("\n\n"),
	};
	const artifacts = writeReviewArtifacts({
		outputDir,
		video: videoDisplayName,
		model,
		duration,
		promptSet,
		comments,
		rawAnalysis,
		reportNotes: [
			`Split review enabled: ${parts.length} parts`,
			`Split manifest: ${manifestPath}`,
			`Estimated payload chars: ${splitDecision.estimatedPayloadChars}`,
			`Max payload chars per part: ${resolvedMaxPayloadChars}`,
		],
	});

	return {
		comments,
		artifacts,
		rawAnalysis,
		parts: results,
	};
}
