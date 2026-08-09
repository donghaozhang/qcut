import { createHash } from "node:crypto";
import { lstat, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mapWithConcurrency } from "./bounded-concurrency.js";
import type { FrameComparisonThresholds } from "./frame-comparison.js";
import {
	type FrameSample,
	type FrameSamplePlan,
	validateFrameSamplePlan,
} from "./frame-sample-plan.js";
import {
	getBundledTargetKey,
	requireBundledToolVersion,
	resolveBundledToolPath,
} from "./runtime.js";
import { compareRgbImages, type RgbImageComparison } from "./visual-ffmpeg.js";
import {
	readVisualFileSnapshot,
	type VisualFileSnapshot,
} from "./visual-files.js";
import { DEFAULT_VISUAL_RMSE_THRESHOLD } from "./visual-metrics.js";

export const PREVIEW_FRAME_COMPARISON_MANIFEST_SCHEMA =
	"qcut.capcut-e2e.preview-frame-comparison";
export const PREVIEW_FRAME_COMPARISON_MANIFEST_FILE_NAME =
	"preview-frame-comparison-manifest.json";

export const CAPCUT_8_1_PREVIEW_FRAME_THRESHOLDS = Object.freeze({
	evidenceStatus: "candidate-unverified" as const,
	id: "capcut-8.1-preview-candidate-v1",
	rmse: DEFAULT_VISUAL_RMSE_THRESHOLD,
});

interface FileHashEvidence {
	bytes: number;
	sha256: string;
}

export interface PreviewFrameSampleEvidence extends FrameSample {
	comparison: RgbImageComparison;
	leftFrame: FileHashEvidence;
	rightFrame: FileHashEvidence;
}

export interface PreviewFrameSampleOutcome {
	comparison?: RgbImageComparison;
	leftFrame?: FileHashEvidence;
	rightFrame?: FileHashEvidence;
	sample: FrameSample;
}

export interface PreviewFrameSetEvidence {
	availableSampleCount: number;
	sampleSetSha256: string;
}

export interface PreviewFrameComparisonSummary {
	checks: {
		comparedSampleCountMatch: boolean;
		leftPlanCoverage: boolean;
		rightPlanCoverage: boolean;
	};
	failureReason?: string;
	left: PreviewFrameSetEvidence;
	missing: Array<{
		frameIndex: number;
		sides: Array<"left" | "right">;
	}>;
	notComparableReason?: string;
	right: PreviewFrameSetEvidence;
	samples: PreviewFrameSampleEvidence[];
	verdict: "pass" | "fail" | "not-comparable";
}

export interface PreviewFrameComparisonManifest
	extends PreviewFrameComparisonSummary {
	generatedAtIso: string;
	samplePlan: {
		coverage: FrameSamplePlan["coverage"];
		durationUs: number;
		fps: number;
		frameCount: number;
		sampleCount: number;
		seed: number;
		sha256: string;
	};
	schema: typeof PREVIEW_FRAME_COMPARISON_MANIFEST_SCHEMA;
	schemaVersion: 1;
	thresholds: FrameComparisonThresholds;
	toolchain: {
		ffmpeg: { banner: string; version: string };
		ffprobe: { banner: string; version: string };
		targetKey: string;
	};
}

function getErrorCode({ error }: { error: unknown }): string | null {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return null;
	}
	return typeof error.code === "string" ? error.code : null;
}

function hashJson({ value }: { value: unknown }): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fileEvidence({ snapshot }: { snapshot: VisualFileSnapshot }) {
	return {
		bytes: snapshot.evidence.bytes,
		sha256: snapshot.evidence.sha256,
	};
}

export function getPreviewFrameFileName({
	frameIndex,
}: {
	frameIndex: number;
}): string {
	if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
		throw new Error("Preview frame index must be a non-negative integer.");
	}
	return `frame-${frameIndex.toString().padStart(8, "0")}.png`;
}

export function buildPreviewFrameSetEvidence({
	frames,
}: {
	frames: Array<{ frameIndex: number; file: FileHashEvidence }>;
}): PreviewFrameSetEvidence {
	const entries = frames
		.map(({ file, frameIndex }) => ({
			bytes: file.bytes,
			frameIndex,
			sha256: file.sha256,
		}))
		.sort((left, right) => left.frameIndex - right.frameIndex);
	return {
		availableSampleCount: entries.length,
		sampleSetSha256: hashJson({ value: entries }),
	};
}

export function buildPreviewFrameComparisonSummary({
	expectedSampleCount,
	outcomes,
}: {
	expectedSampleCount: number;
	outcomes: PreviewFrameSampleOutcome[];
}): PreviewFrameComparisonSummary {
	const leftFrames = outcomes.flatMap(({ leftFrame, sample }) =>
		leftFrame ? [{ file: leftFrame, frameIndex: sample.frameIndex }] : []
	);
	const rightFrames = outcomes.flatMap(({ rightFrame, sample }) =>
		rightFrame ? [{ file: rightFrame, frameIndex: sample.frameIndex }] : []
	);
	const samples = outcomes.flatMap(
		({ comparison, leftFrame, rightFrame, sample }) =>
			comparison && leftFrame && rightFrame
				? [{ ...sample, comparison, leftFrame, rightFrame }]
				: []
	);
	const missing = outcomes.flatMap(({ leftFrame, rightFrame, sample }) => {
		const sides: Array<"left" | "right"> = [];
		if (!leftFrame) sides.push("left");
		if (!rightFrame) sides.push("right");
		return sides.length > 0 ? [{ frameIndex: sample.frameIndex, sides }] : [];
	});
	const checks = {
		comparedSampleCountMatch: samples.length === expectedSampleCount,
		leftPlanCoverage: leftFrames.length === expectedSampleCount,
		rightPlanCoverage: rightFrames.length === expectedSampleCount,
	};
	const planCovered = Object.values(checks).every(Boolean);
	const comparisonsPass = samples.every(({ comparison }) => comparison.pass);
	return {
		checks,
		...(planCovered && !comparisonsPass
			? { failureReason: "One or more preview frame comparisons failed." }
			: {}),
		left: buildPreviewFrameSetEvidence({ frames: leftFrames }),
		missing,
		...(planCovered
			? {}
			: {
					notComparableReason:
						"Preview frame sets do not cover the sample plan.",
				}),
		right: buildPreviewFrameSetEvidence({ frames: rightFrames }),
		samples,
		verdict: planCovered
			? comparisonsPass
				? "pass"
				: "fail"
			: "not-comparable",
	};
}

async function requirePreviewDirectory({
	label,
	path,
}: {
	label: string;
	path: string;
}): Promise<string> {
	const stats = await lstat(path);
	if (stats.isSymbolicLink() || !stats.isDirectory()) {
		throw new Error(`${label} must be a non-symlink directory: ${path}`);
	}
	return realpath(path);
}

async function readOptionalSnapshot({
	path,
}: {
	path: string;
}): Promise<VisualFileSnapshot | null> {
	try {
		return await readVisualFileSnapshot({ path });
	} catch (error) {
		if (getErrorCode({ error }) === "ENOENT") return null;
		throw error;
	}
}

async function comparePreviewSample({
	ffmpegPath,
	ffprobePath,
	leftDirectory,
	rightDirectory,
	rmseThreshold,
	sample,
	temporaryDirectory,
}: {
	ffmpegPath: string;
	ffprobePath: string;
	leftDirectory: string;
	rightDirectory: string;
	rmseThreshold: number;
	sample: FrameSample;
	temporaryDirectory: string;
}): Promise<PreviewFrameSampleOutcome> {
	const fileName = getPreviewFrameFileName({ frameIndex: sample.frameIndex });
	const [leftSnapshot, rightSnapshot] = await Promise.all([
		readOptionalSnapshot({ path: join(leftDirectory, fileName) }),
		readOptionalSnapshot({ path: join(rightDirectory, fileName) }),
	]);
	const leftFrame = leftSnapshot
		? fileEvidence({ snapshot: leftSnapshot })
		: undefined;
	const rightFrame = rightSnapshot
		? fileEvidence({ snapshot: rightSnapshot })
		: undefined;
	if (!leftSnapshot || !rightSnapshot) {
		return { leftFrame, rightFrame, sample };
	}
	const suffix = sample.frameIndex.toString().padStart(8, "0");
	const leftSnapshotPath = join(temporaryDirectory, `left-${suffix}.png`);
	const rightSnapshotPath = join(temporaryDirectory, `right-${suffix}.png`);
	await Promise.all([
		writeFile(leftSnapshotPath, leftSnapshot.bytes, {
			flag: "wx",
			mode: 0o600,
		}),
		writeFile(rightSnapshotPath, rightSnapshot.bytes, {
			flag: "wx",
			mode: 0o600,
		}),
	]);
	const comparison = await compareRgbImages({
		actualPath: rightSnapshotPath,
		expectedPath: leftSnapshotPath,
		ffmpegPath,
		ffprobePath,
		rmseThreshold,
		temporaryDirectory,
	});
	return { comparison, leftFrame, rightFrame, sample };
}

async function writeManifest({
	manifest,
	outputDirectory,
}: {
	manifest: PreviewFrameComparisonManifest;
	outputDirectory?: string;
}): Promise<void> {
	if (!outputDirectory) return;
	await writeFile(
		join(outputDirectory, PREVIEW_FRAME_COMPARISON_MANIFEST_FILE_NAME),
		`${JSON.stringify(manifest, null, 2)}\n`,
		{ encoding: "utf8", flag: "wx", mode: 0o600 }
	);
}

export async function comparePreviewFrameDirectories({
	leftDirectory,
	nowIso = new Date().toISOString(),
	outputDirectory,
	plan,
	rightDirectory,
	thresholds = CAPCUT_8_1_PREVIEW_FRAME_THRESHOLDS,
}: {
	leftDirectory: string;
	nowIso?: string;
	outputDirectory?: string;
	plan: FrameSamplePlan;
	rightDirectory: string;
	thresholds?: FrameComparisonThresholds;
}): Promise<PreviewFrameComparisonManifest> {
	validateFrameSamplePlan({ plan });
	const projectRoot = resolve(process.cwd());
	const targetKey = getBundledTargetKey();
	const [ffmpegPath, ffprobePath, canonicalLeft, canonicalRight] =
		await Promise.all([
			resolveBundledToolPath({ projectRoot, targetKey, tool: "ffmpeg" }),
			resolveBundledToolPath({ projectRoot, targetKey, tool: "ffprobe" }),
			requirePreviewDirectory({
				label: "Left preview frames",
				path: leftDirectory,
			}),
			requirePreviewDirectory({
				label: "Right preview frames",
				path: rightDirectory,
			}),
		]);
	const [ffmpeg, ffprobe] = await Promise.all([
		requireBundledToolVersion({ tool: "ffmpeg", toolPath: ffmpegPath }),
		requireBundledToolVersion({ tool: "ffprobe", toolPath: ffprobePath }),
	]);
	const temporaryDirectory = await mkdtemp(
		join(tmpdir(), "qcut-preview-frame-comparison-")
	);
	let outcomes: PreviewFrameSampleOutcome[];
	try {
		outcomes = await mapWithConcurrency({
			concurrency: 2,
			items: plan.samples,
			mapper: ({ item }) =>
				comparePreviewSample({
					ffmpegPath,
					ffprobePath,
					leftDirectory: canonicalLeft,
					rightDirectory: canonicalRight,
					rmseThreshold: thresholds.rmse,
					sample: item,
					temporaryDirectory,
				}),
		});
	} finally {
		await rm(temporaryDirectory, { force: true, recursive: true });
	}
	const summary = buildPreviewFrameComparisonSummary({
		expectedSampleCount: plan.samples.length,
		outcomes,
	});
	const manifest: PreviewFrameComparisonManifest = {
		...summary,
		generatedAtIso: nowIso,
		samplePlan: {
			coverage: plan.coverage,
			durationUs: plan.durationUs,
			fps: plan.fps,
			frameCount: plan.frameCount,
			sampleCount: plan.samples.length,
			seed: plan.seed,
			sha256: hashJson({ value: plan }),
		},
		schema: PREVIEW_FRAME_COMPARISON_MANIFEST_SCHEMA,
		schemaVersion: 1,
		thresholds,
		toolchain: {
			ffmpeg: { banner: ffmpeg.banner, version: ffmpeg.version },
			ffprobe: { banner: ffprobe.banner, version: ffprobe.version },
			targetKey,
		},
	};
	await writeManifest({ manifest, outputDirectory });
	return manifest;
}
