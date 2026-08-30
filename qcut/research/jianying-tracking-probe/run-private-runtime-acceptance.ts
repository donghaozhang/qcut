#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { sha256File } from "../../electron/jianying-motion-tracking/runtime-assets";
import {
	runBoundedProcess,
	type BoundedProcessResult,
} from "../jianying-runtime-probe/bounded-process";

const WIDTH = 320;
const HEIGHT = 240;
const FPS = 30;
const FRAME_COUNT = 60;
const ANCHOR_FRAME = 30;
const TARGET_WIDTH = 80;
const TARGET_HEIGHT = 60;
const MINIMUM_MEAN_IOU = 0.85;
const MINIMUM_FRAME_IOU = 0.65;
const MAXIMUM_MEAN_CENTER_ERROR_PIXELS = 6;
const projectRoot = path.resolve(import.meta.dir, "../..");

interface Rect {
	bottom: number;
	left: number;
	right: number;
	top: number;
}

interface TrackingSample {
	frameIndex: number;
	rect: Rect;
	status: string;
}

interface TrackingResult {
	execution: {
		jianyingProcessRequired: boolean;
		networkPolicy: string;
	};
	route: string;
	runtime: {
		appBundleId: string;
		appVersion: string;
		coreSha256: string;
		coreUuid: string;
	};
	samples: TrackingSample[];
}

function defaultEvidenceRoot() {
	return path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"ResearchEvidence",
		"JianyingTracking"
	);
}

function parseEvidenceRoot() {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			"evidence-root": { type: "string" },
		},
		strict: true,
	});
	return path.resolve(values["evidence-root"] ?? defaultEvidenceRoot());
}

function successfulOutput({
	label,
	result,
}: {
	label: string;
	result: BoundedProcessResult;
}) {
	if (result.exitCode === 0) return result.stdout.trim();
	throw new Error(`${label}: ${result.stderr || result.stdout}`.trim());
}

async function resolveExecutable({ name }: { name: string }) {
	const result = await runBoundedProcess({
		command: "/usr/bin/which",
		args: [name],
		cwd: projectRoot,
	});
	return successfulOutput({ label: `${name} is unavailable`, result });
}

async function jianyingProcessSnapshot() {
	const result = await runBoundedProcess({
		command: "/usr/bin/pgrep",
		args: ["-fal", "^/Applications/VideoFusion-macOS\\.app/"],
		cwd: projectRoot,
	});
	if (result.exitCode === 1) return [];
	if (result.exitCode !== 0) {
		throw new Error(
			`Cannot inspect Jianying processes: ${result.stderr}`.trim()
		);
	}
	return result.stdout.trim().split("\n").filter(Boolean);
}

async function generateCalibrationVideo({
	ffmpeg,
	videoPath,
}: {
	ffmpeg: string;
	videoPath: string;
}) {
	const result = await runBoundedProcess({
		command: ffmpeg,
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			`color=c=0x303030:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=2`,
			"-f",
			"lavfi",
			"-i",
			`testsrc2=s=${TARGET_WIDTH}x${TARGET_HEIGHT}:r=${FPS}:d=2`,
			"-filter_complex",
			"[0:v][1:v]overlay=x=40+40*t:y=80+10*sin(PI*t):shortest=1",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			videoPath,
		],
		cwd: projectRoot,
		timeoutMs: 60_000,
	});
	successfulOutput({ label: "Cannot generate calibration video", result });
}

function anchorRectArgument() {
	const timeSeconds = ANCHOR_FRAME / FPS;
	const left = (40 + 40 * timeSeconds) / WIDTH;
	const top = (80 + 10 * Math.sin(Math.PI * timeSeconds)) / HEIGHT;
	return [
		left,
		top,
		left + TARGET_WIDTH / WIDTH,
		top + TARGET_HEIGHT / HEIGHT,
	].join(",");
}

async function runTracker({
	outputPath,
	videoPath,
}: {
	outputPath: string;
	videoPath: string;
}) {
	const result = await runBoundedProcess({
		command: process.execPath,
		args: [
			path.join(import.meta.dir, "track-motion.ts"),
			"--video",
			videoPath,
			"--rect",
			anchorRectArgument(),
			"--anchor-frame",
			String(ANCHOR_FRAME),
			"--direction",
			"both",
			"--output",
			outputPath,
			"--force",
		],
		cwd: projectRoot,
		timeoutMs: 10 * 60_000,
	});
	successfulOutput({ label: "Detached tracking run failed", result });
}

function parseTrackingResult({ value }: { value: unknown }) {
	if (!value || typeof value !== "object") {
		throw new Error("Tracking result is not an object");
	}
	const result = value as Partial<TrackingResult>;
	if (
		typeof result.route !== "string" ||
		!Array.isArray(result.samples) ||
		result.samples.length !== FRAME_COUNT ||
		result.execution?.networkPolicy !== "deny" ||
		result.execution.jianyingProcessRequired !== false ||
		typeof result.runtime?.coreSha256 !== "string" ||
		typeof result.runtime.coreUuid !== "string"
	) {
		throw new Error(
			"Tracking result violates detached acceptance requirements"
		);
	}
	for (const sample of result.samples) {
		if (
			!sample ||
			typeof sample.frameIndex !== "number" ||
			typeof sample.status !== "string" ||
			!sample.rect ||
			Object.values(sample.rect).some(
				(coordinate) => !Number.isFinite(coordinate)
			)
		) {
			throw new Error("Tracking result contains an invalid sample");
		}
	}
	return result as TrackingResult;
}

function expectedRect({ frameIndex }: { frameIndex: number }): Rect {
	const timeSeconds = frameIndex / FPS;
	const left = (40 + 40 * timeSeconds) / WIDTH;
	const top = (80 + 10 * Math.sin(Math.PI * timeSeconds)) / HEIGHT;
	return {
		bottom: top + TARGET_HEIGHT / HEIGHT,
		left,
		right: left + TARGET_WIDTH / WIDTH,
		top,
	};
}

function intersectionOverUnion({
	actual,
	expected,
}: {
	actual: Rect;
	expected: Rect;
}) {
	const intersectionWidth = Math.max(
		0,
		Math.min(actual.right, expected.right) -
			Math.max(actual.left, expected.left)
	);
	const intersectionHeight = Math.max(
		0,
		Math.min(actual.bottom, expected.bottom) -
			Math.max(actual.top, expected.top)
	);
	const intersectionArea = intersectionWidth * intersectionHeight;
	const actualArea =
		(actual.right - actual.left) * (actual.bottom - actual.top);
	const expectedArea =
		(expected.right - expected.left) * (expected.bottom - expected.top);
	return intersectionArea / (actualArea + expectedArea - intersectionArea);
}

function centerErrorPixels({
	actual,
	expected,
}: {
	actual: Rect;
	expected: Rect;
}) {
	const actualX = ((actual.left + actual.right) * WIDTH) / 2;
	const actualY = ((actual.top + actual.bottom) * HEIGHT) / 2;
	const expectedX = ((expected.left + expected.right) * WIDTH) / 2;
	const expectedY = ((expected.top + expected.bottom) * HEIGHT) / 2;
	return Math.hypot(actualX - expectedX, actualY - expectedY);
}

function mean({ values }: { values: number[] }) {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function evaluate({ result }: { result: TrackingResult }) {
	const ious: number[] = [];
	const centerErrors: number[] = [];
	let trackedCount = 0;
	for (const sample of result.samples) {
		const expected = expectedRect({ frameIndex: sample.frameIndex });
		ious.push(intersectionOverUnion({ actual: sample.rect, expected }));
		centerErrors.push(centerErrorPixels({ actual: sample.rect, expected }));
		if (sample.status === "tracked") trackedCount += 1;
	}
	return {
		maximumCenterErrorPixels: Math.max(...centerErrors),
		meanCenterErrorPixels: mean({ values: centerErrors }),
		meanIou: mean({ values: ious }),
		minimumIou: Math.min(...ious),
		trackedCount,
		trackedRatio: trackedCount / result.samples.length,
	};
}

function thresholdChecks({
	deterministic,
	metrics,
}: {
	deterministic: boolean;
	metrics: ReturnType<typeof evaluate>;
}) {
	return {
		deterministic,
		meanCenterError:
			metrics.meanCenterErrorPixels <= MAXIMUM_MEAN_CENTER_ERROR_PIXELS,
		meanIou: metrics.meanIou >= MINIMUM_MEAN_IOU,
		minimumIou: metrics.minimumIou >= MINIMUM_FRAME_IOU,
		trackedEveryFrame: metrics.trackedCount === FRAME_COUNT,
	};
}

async function run() {
	const evidenceRoot = parseEvidenceRoot();
	const runId = new Date().toISOString().replace(/[:.]/g, "-");
	const evidencePath = path.join(evidenceRoot, runId);
	await mkdir(evidencePath, { mode: 0o700, recursive: true });
	const videoPath = path.join(evidencePath, "calibration.mp4");
	const firstResultPath = path.join(evidencePath, "track-run-1.json");
	const secondResultPath = path.join(evidencePath, "track-run-2.json");
	const reportPath = path.join(evidencePath, "acceptance.json");
	const [ffmpeg, processesBefore] = await Promise.all([
		resolveExecutable({ name: "ffmpeg" }),
		jianyingProcessSnapshot(),
	]);
	if (processesBefore.length > 0) {
		throw new Error(
			"Jianying must be fully stopped before detached acceptance"
		);
	}
	await generateCalibrationVideo({ ffmpeg, videoPath });
	await runTracker({ outputPath: firstResultPath, videoPath });
	await runTracker({ outputPath: secondResultPath, videoPath });
	const [firstValue, secondValue, processesAfter] = await Promise.all([
		readFile(firstResultPath, "utf8"),
		readFile(secondResultPath, "utf8"),
		jianyingProcessSnapshot(),
	]);
	const firstResult = parseTrackingResult({
		value: JSON.parse(firstValue) as unknown,
	});
	const secondResult = parseTrackingResult({
		value: JSON.parse(secondValue) as unknown,
	});
	const deterministic =
		JSON.stringify(firstResult.samples) ===
		JSON.stringify(secondResult.samples);
	const metrics = evaluate({ result: firstResult });
	const checks = thresholdChecks({ deterministic, metrics });
	const passed =
		processesAfter.length === 0 && Object.values(checks).every(Boolean);
	const [videoSha256, firstResultSha256, secondResultSha256] =
		await Promise.all([
			sha256File({ filePath: videoPath }),
			sha256File({ filePath: firstResultPath }),
			sha256File({ filePath: secondResultPath }),
		]);
	const report = {
		artifacts: {
			calibration: { fileName: path.basename(videoPath), sha256: videoSha256 },
			firstResult: {
				fileName: path.basename(firstResultPath),
				sha256: firstResultSha256,
			},
			secondResult: {
				fileName: path.basename(secondResultPath),
				sha256: secondResultSha256,
			},
		},
		checks,
		evidencePath,
		generatedAt: new Date().toISOString(),
		jianyingProcessCount: {
			after: processesAfter.length,
			before: processesBefore.length,
		},
		metrics,
		passed,
		route: firstResult.route,
		runtime: firstResult.runtime,
		thresholds: {
			maximumMeanCenterErrorPixels: MAXIMUM_MEAN_CENTER_ERROR_PIXELS,
			minimumFrameIou: MINIMUM_FRAME_IOU,
			minimumMeanIou: MINIMUM_MEAN_IOU,
		},
	};
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
		mode: 0o600,
	});
	console.log(JSON.stringify({ ...report, reportPath }, null, 2));
	if (!passed) throw new Error(`Detached acceptance failed: ${reportPath}`);
}

if (import.meta.main) await run();
