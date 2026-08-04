import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildFrameExtractionArgs } from "./ffmpeg-args.js";
import type { FrameSample, FrameSamplePlan } from "./frame-sample-plan.js";
import {
	getBundledTargetKey,
	requireBundledToolVersion,
	resolveBundledToolPath,
	runCommand,
	runFfmpeg,
} from "./runtime.js";
import { compareRgbImages, type RgbImageComparison } from "./visual-ffmpeg.js";
import { describeVisualFile } from "./visual-files.js";
import { DEFAULT_VISUAL_RMSE_THRESHOLD } from "./visual-metrics.js";

export const FRAME_COMPARISON_MANIFEST_SCHEMA =
	"qcut.capcut-e2e.frame-comparison";
export const FRAME_COMPARISON_MANIFEST_FILE_NAME =
	"frame-comparison-manifest.json";

interface FileHashEvidence {
	bytes: number;
	sha256: string;
}

export interface VideoProbeEvidence {
	fps: number;
	frameCount: number;
	height: number;
	width: number;
}

export interface FrameComparisonThresholds {
	evidenceStatus: "candidate-unverified" | "verified";
	id: string;
	rmse: number;
}

export const CAPCUT_8_1_NATIVE_FRAME_THRESHOLDS = Object.freeze({
	evidenceStatus: "candidate-unverified" as const,
	id: "capcut-8.1-native-export-candidate-v1",
	rmse: DEFAULT_VISUAL_RMSE_THRESHOLD,
});

export interface FrameComparisonSampleEvidence extends FrameSample {
	comparison: RgbImageComparison;
	leftFrame: FileHashEvidence;
	rightFrame: FileHashEvidence;
}

export interface FrameComparisonManifest {
	checks: {
		fpsMatch: boolean;
		frameCountMatch: boolean;
		geometryMatch: boolean;
		planCoverage: boolean;
	};
	failureReason?: string;
	generatedAtIso: string;
	left: FileHashEvidence & { video?: VideoProbeEvidence };
	notComparableReason?: string;
	right: FileHashEvidence & { video?: VideoProbeEvidence };
	samples: FrameComparisonSampleEvidence[];
	schema: typeof FRAME_COMPARISON_MANIFEST_SCHEMA;
	schemaVersion: 1;
	thresholds: FrameComparisonThresholds;
	toolchain: {
		ffmpeg: { banner: string; version: string };
		ffprobe: { banner: string; version: string };
		targetKey: string;
	};
	verdict: "pass" | "fail" | "not-comparable";
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function requirePositiveInteger({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	const parsed = typeof value === "string" ? Number(value) : value;
	if (
		typeof parsed !== "number" ||
		!Number.isSafeInteger(parsed) ||
		parsed <= 0
	) {
		throw new Error(`${label} must be a positive integer.`);
	}
	return parsed;
}

function parseFrameRate({ value }: { value: unknown }): number {
	if (typeof value !== "string" || !/^\d+\/\d+$/.test(value)) {
		throw new Error("Video frame rate must be a positive rational.");
	}
	const [numeratorText, denominatorText] = value.split("/");
	const numerator = Number(numeratorText);
	const denominator = Number(denominatorText);
	if (!numerator || !denominator) {
		throw new Error("Video frame rate must be positive.");
	}
	return Number((numerator / denominator).toFixed(6));
}

export function buildVideoFrameProbeArgs({
	mediaPath,
}: {
	mediaPath: string;
}): string[] {
	return [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-count_frames",
		"-show_streams",
		"-show_entries",
		"stream=codec_type,width,height,avg_frame_rate,nb_read_frames",
		"-of",
		"json",
		mediaPath,
	];
}

export function parseVideoProbeEvidence({
	value,
}: {
	value: unknown;
}): VideoProbeEvidence | null {
	const root = requireRecord({ label: "Video FFprobe report", value });
	if (!Array.isArray(root.streams)) {
		throw new Error("Video FFprobe report is missing streams.");
	}
	if (root.streams.length === 0) return null;
	if (root.streams.length !== 1) {
		throw new Error("Video comparison requires exactly one selected stream.");
	}
	const stream = requireRecord({
		label: "Video FFprobe stream",
		value: root.streams[0],
	});
	if (stream.codec_type !== "video") {
		throw new Error("Selected FFprobe stream is not video.");
	}
	return {
		fps: parseFrameRate({ value: stream.avg_frame_rate }),
		frameCount: requirePositiveInteger({
			label: "Video decoded frame count",
			value: stream.nb_read_frames,
		}),
		height: requirePositiveInteger({
			label: "Video height",
			value: stream.height,
		}),
		width: requirePositiveInteger({
			label: "Video width",
			value: stream.width,
		}),
	};
}

function validateSamplePlan({ plan }: { plan: FrameSamplePlan }): void {
	if (
		!Number.isFinite(plan.fps) ||
		plan.fps <= 0 ||
		!Number.isSafeInteger(plan.frameCount) ||
		plan.frameCount <= 0 ||
		plan.samples.length === 0
	) {
		throw new Error("Frame sample plan is invalid.");
	}
	let previous = -1;
	for (const sample of plan.samples) {
		if (
			!Number.isSafeInteger(sample.frameIndex) ||
			sample.frameIndex <= previous ||
			sample.frameIndex < 0 ||
			sample.frameIndex >= plan.frameCount ||
			sample.reasons.length === 0
		) {
			throw new Error("Frame sample plan contains an invalid sample.");
		}
		previous = sample.frameIndex;
	}
}

async function describeHash({ path }: { path: string }) {
	const { bytes, sha256 } = await describeVisualFile({ path });
	return { bytes, sha256 };
}

async function probeVideo({
	ffprobePath,
	mediaPath,
}: {
	ffprobePath: string;
	mediaPath: string;
}) {
	const { stdout } = await runCommand({
		args: buildVideoFrameProbeArgs({ mediaPath }),
		command: ffprobePath,
	});
	return parseVideoProbeEvidence({ value: JSON.parse(stdout) as unknown });
}

async function mapWithConcurrency<Item, Result>({
	concurrency,
	items,
	mapper,
}: {
	concurrency: number;
	items: readonly Item[];
	mapper: (options: { index: number; item: Item }) => Promise<Result>;
}): Promise<Result[]> {
	const results = new Array<Result>(items.length);
	let nextIndex = 0;
	const runWorker = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		const item = items[index];
		if (item === undefined) return;
		results[index] = await mapper({ index, item });
		await runWorker();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () =>
			runWorker()
		)
	);
	return results;
}

async function compareSample({
	ffmpegPath,
	ffprobePath,
	leftPath,
	rightPath,
	rmseThreshold,
	sample,
	temporaryDirectory,
}: {
	ffmpegPath: string;
	ffprobePath: string;
	leftPath: string;
	rightPath: string;
	rmseThreshold: number;
	sample: FrameSample;
	temporaryDirectory: string;
}): Promise<FrameComparisonSampleEvidence> {
	const suffix = sample.frameIndex.toString().padStart(8, "0");
	const leftFramePath = join(temporaryDirectory, `left-${suffix}.png`);
	const rightFramePath = join(temporaryDirectory, `right-${suffix}.png`);
	await Promise.all([
		runFfmpeg({
			args: buildFrameExtractionArgs({
				frameIndex: sample.frameIndex,
				inputPath: leftPath,
				outputPath: leftFramePath,
			}),
			ffmpegPath,
		}),
		runFfmpeg({
			args: buildFrameExtractionArgs({
				frameIndex: sample.frameIndex,
				inputPath: rightPath,
				outputPath: rightFramePath,
			}),
			ffmpegPath,
		}),
	]);
	const [comparison, leftFrame, rightFrame] = await Promise.all([
		compareRgbImages({
			actualPath: rightFramePath,
			expectedPath: leftFramePath,
			ffmpegPath,
			ffprobePath,
			rmseThreshold,
			temporaryDirectory,
		}),
		describeHash({ path: leftFramePath }),
		describeHash({ path: rightFramePath }),
	]);
	return { ...sample, comparison, leftFrame, rightFrame };
}

export function buildFrameComparisonChecks({
	left,
	plan,
	right,
}: {
	left: VideoProbeEvidence;
	plan: FrameSamplePlan;
	right: VideoProbeEvidence;
}) {
	const maximumFrame = plan.samples.at(-1)?.frameIndex ?? -1;
	return {
		fpsMatch:
			Math.abs(left.fps - plan.fps) < 0.000_001 &&
			Math.abs(right.fps - plan.fps) < 0.000_001,
		frameCountMatch:
			left.frameCount === plan.frameCount &&
			right.frameCount === plan.frameCount,
		geometryMatch: left.width === right.width && left.height === right.height,
		planCoverage:
			maximumFrame < left.frameCount && maximumFrame < right.frameCount,
	};
}

async function writeManifest({
	manifest,
	outputDirectory,
}: {
	manifest: FrameComparisonManifest;
	outputDirectory?: string;
}): Promise<void> {
	if (!outputDirectory) return;
	await writeFile(
		join(outputDirectory, FRAME_COMPARISON_MANIFEST_FILE_NAME),
		`${JSON.stringify(manifest, null, 2)}\n`,
		{ encoding: "utf8", flag: "wx", mode: 0o600 }
	);
}

export async function compareVideoFrames({
	leftPath,
	nowIso = new Date().toISOString(),
	outputDirectory,
	plan,
	rightPath,
	thresholds = CAPCUT_8_1_NATIVE_FRAME_THRESHOLDS,
}: {
	leftPath: string;
	nowIso?: string;
	outputDirectory?: string;
	plan: FrameSamplePlan;
	rightPath: string;
	thresholds?: FrameComparisonThresholds;
}): Promise<FrameComparisonManifest> {
	validateSamplePlan({ plan });
	const projectRoot = resolve(process.cwd());
	const targetKey = getBundledTargetKey();
	const [ffmpegPath, ffprobePath] = await Promise.all([
		resolveBundledToolPath({ projectRoot, targetKey, tool: "ffmpeg" }),
		resolveBundledToolPath({ projectRoot, targetKey, tool: "ffprobe" }),
	]);
	const [ffmpeg, ffprobe, leftFile, rightFile, leftVideo, rightVideo] =
		await Promise.all([
			requireBundledToolVersion({ tool: "ffmpeg", toolPath: ffmpegPath }),
			requireBundledToolVersion({ tool: "ffprobe", toolPath: ffprobePath }),
			describeHash({ path: leftPath }),
			describeHash({ path: rightPath }),
			probeVideo({ ffprobePath, mediaPath: leftPath }),
			probeVideo({ ffprobePath, mediaPath: rightPath }),
		]);
	const toolchain = {
		ffmpeg: { banner: ffmpeg.banner, version: ffmpeg.version },
		ffprobe: { banner: ffprobe.banner, version: ffprobe.version },
		targetKey,
	};
	if (!leftVideo || !rightVideo) {
		const manifest: FrameComparisonManifest = {
			checks: {
				fpsMatch: false,
				frameCountMatch: false,
				geometryMatch: false,
				planCoverage: false,
			},
			generatedAtIso: nowIso,
			left: leftFile,
			notComparableReason: leftVideo
				? "right input has no video stream"
				: "left input has no video stream",
			right: rightFile,
			samples: [],
			schema: FRAME_COMPARISON_MANIFEST_SCHEMA,
			schemaVersion: 1,
			thresholds,
			toolchain,
			verdict: "not-comparable",
		};
		await writeManifest({ manifest, outputDirectory });
		return manifest;
	}
	const checks = buildFrameComparisonChecks({
		left: leftVideo,
		plan,
		right: rightVideo,
	});
	const structurePasses = Object.values(checks).every(Boolean);
	let samples: FrameComparisonSampleEvidence[] = [];
	if (structurePasses) {
		const temporaryDirectory = await mkdtemp(
			join(tmpdir(), "qcut-frame-comparison-")
		);
		try {
			samples = await mapWithConcurrency({
				concurrency: 2,
				items: plan.samples,
				mapper: ({ item }) =>
					compareSample({
						ffmpegPath,
						ffprobePath,
						leftPath,
						rightPath,
						rmseThreshold: thresholds.rmse,
						sample: item,
						temporaryDirectory,
					}),
			});
		} finally {
			await rm(temporaryDirectory, { force: true, recursive: true });
		}
	}
	const samplesPass =
		samples.length === plan.samples.length &&
		samples.every(({ comparison }) => comparison.pass);
	const manifest: FrameComparisonManifest = {
		checks,
		...(structurePasses
			? {}
			: { failureReason: "Video structure does not match the sample plan." }),
		generatedAtIso: nowIso,
		left: { ...leftFile, video: leftVideo },
		right: { ...rightFile, video: rightVideo },
		samples,
		schema: FRAME_COMPARISON_MANIFEST_SCHEMA,
		schemaVersion: 1,
		thresholds,
		toolchain,
		verdict: structurePasses && samplesPass ? "pass" : "fail",
	};
	await writeManifest({ manifest, outputDirectory });
	return manifest;
}
