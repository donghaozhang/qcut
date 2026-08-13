#!/usr/bin/env bun

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { stringifyParityReport } from "./parity-report-json";
import {
	classifyTextParityResult,
	collectTextParityEvidence,
	type TextParityEvidence,
} from "./text-parity-media";
import {
	readTextParityMatrix,
	type TextParityEntry,
	type TextParityMatrix,
} from "./text-parity-plan";
import {
	renderTextParityEntry,
	textParityEntryDirectory,
	type TextParityRenderResult,
} from "./text-parity-render";
import { runCommand } from "./transition-parity-media";

type TextParityMode = "run" | "render" | "verify";
type TextParityStatus = "pass" | "near" | "fail" | "control";
type TextParityMetricStatus = Exclude<TextParityStatus, "control">;

interface TextParityCliOptions {
	matrixPath: string;
	outputDirectory: string;
	mode: TextParityMode;
	reuse: boolean;
	ffmpegPath: string;
	ffprobePath: string;
	highConfidenceRmse: number;
	foregroundRmse: number;
	maskIou: number;
	geometryPixels: number;
}

interface VerifiedTextParityResult {
	entry: TextParityEntry;
	render: TextParityRenderResult;
	evidence: TextParityEvidence | null;
	status: TextParityStatus;
	error: string;
}

export function qualifyTextParityStatus({
	metricStatus,
	referenceOrigin,
}: {
	metricStatus: TextParityMetricStatus;
	referenceOrigin: TextParityEntry["referenceOrigin"];
}): TextParityStatus {
	if (referenceOrigin !== "qcut-private-runtime-control") {
		return metricStatus;
	}
	return metricStatus === "pass" ? "control" : "fail";
}

function usage(): string {
	return `Usage:
  bun research/jianying-runtime-probe/text-parity-matrix.ts --matrix PATH [--output PATH] [--mode run|render|verify]

Options:
  --reuse                 Reuse a candidate with an identical runtime request
  --ffmpeg PATH           FFmpeg executable (default: ffmpeg)
  --ffprobe PATH          FFprobe executable (default: ffprobe)
  --rmse-threshold VALUE  Full-frame decoded RGB threshold (default: 4)
  --foreground-rmse VALUE Foreground-union RGB threshold (default: 8)
  --mask-iou VALUE        Minimum low-alpha foreground-mask IoU (default: 0.98)
  --geometry-px VALUE     Maximum core-text centroid/bounds shift (default: 2)`;
}

function parseMode({ value }: { value: string }): TextParityMode {
	if (value === "run" || value === "render" || value === "verify") {
		return value;
	}
	throw new Error(`--mode must be run, render, or verify\n${usage()}`);
}

export function parseTextParityArgs({
	args,
	repositoryRoot,
}: {
	args: string[];
	repositoryRoot: string;
}): TextParityCliOptions | null {
	const { values } = parseArgs({
		args,
		options: {
			matrix: { type: "string" },
			output: { type: "string" },
			mode: { type: "string", default: "run" },
			reuse: { type: "boolean", default: false },
			ffmpeg: { type: "string", default: "ffmpeg" },
			ffprobe: { type: "string", default: "ffprobe" },
			"rmse-threshold": { type: "string", default: "4" },
			"foreground-rmse": { type: "string", default: "8" },
			"mask-iou": { type: "string", default: "0.98" },
			"geometry-px": { type: "string", default: "2" },
			help: { type: "boolean", short: "h" },
		},
		strict: true,
	});
	if (values.help) return null;
	if (!values.matrix) throw new Error(`--matrix is required\n${usage()}`);
	const highConfidenceRmse = Number(values["rmse-threshold"]);
	if (!Number.isFinite(highConfidenceRmse) || highConfidenceRmse <= 0) {
		throw new Error("--rmse-threshold must be a positive number");
	}
	const foregroundRmse = Number(values["foreground-rmse"]);
	if (!Number.isFinite(foregroundRmse) || foregroundRmse <= 0) {
		throw new Error("--foreground-rmse must be a positive number");
	}
	const maskIou = Number(values["mask-iou"]);
	if (!Number.isFinite(maskIou) || maskIou <= 0 || maskIou > 1) {
		throw new Error("--mask-iou must be greater than zero and at most one");
	}
	const geometryPixels = Number(values["geometry-px"]);
	if (!Number.isFinite(geometryPixels) || geometryPixels < 0) {
		throw new Error("--geometry-px must be a non-negative number");
	}
	return {
		matrixPath: path.resolve(values.matrix),
		outputDirectory: path.resolve(
			values.output ??
				path.join(repositoryRoot, ".local/jianying-runtime/text-parity")
		),
		mode: parseMode({ value: values.mode }),
		reuse: values.reuse,
		ffmpegPath: values.ffmpeg,
		ffprobePath: values.ffprobe,
		highConfidenceRmse,
		foregroundRmse,
		maskIou,
		geometryPixels,
	};
}

function ensureFile({ filePath, label }: { filePath: string; label: string }) {
	if (!existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
}

function ensureIgnoredDirectory({
	directoryPath,
	repositoryRoot,
}: {
	directoryPath: string;
	repositoryRoot: string;
}) {
	mkdirSync(directoryPath, { recursive: true });
	const relative = path.relative(repositoryRoot, directoryPath);
	if (relative.startsWith("..") || path.isAbsolute(relative)) return;
	const ignored = runCommand({
		cwd: repositoryRoot,
		command: ["git", "check-ignore", "-q", "--", directoryPath],
	});
	if (ignored.exitCode !== 0) {
		throw new Error(
			`Private parity output is inside the repository but not ignored: ${directoryPath}`
		);
	}
}

function ensureReferenceIsPrivate({
	referencePath,
	repositoryRoot,
}: {
	referencePath: string;
	repositoryRoot: string;
}) {
	const relative = path.relative(repositoryRoot, referencePath);
	if (relative.startsWith("..") || path.isAbsolute(relative)) return;
	const ignored = runCommand({
		cwd: repositoryRoot,
		command: ["git", "check-ignore", "-q", "--", referencePath],
	});
	if (ignored.exitCode !== 0) {
		throw new Error(
			`Jianying reference must stay outside the repository or in an ignored path: ${referencePath}`
		);
	}
}

function verifyOnlyRender({
	entry,
	matrix,
	outputDirectory,
}: {
	entry: TextParityEntry;
	matrix: TextParityMatrix;
	outputDirectory: string;
}): TextParityRenderResult {
	const entryDirectory = textParityEntryDirectory({ entry, outputDirectory });
	const candidateVideo = path.join(entryDirectory, "qcut-private-runtime.mp4");
	return {
		title: entry.title,
		resourceId: entry.resourceId,
		packageHash: entry.packageHash,
		candidateVideo,
		renderLog: path.join(entryDirectory, "render.log"),
		frameCount: Math.round(entry.captureDurationSeconds * matrix.frameRate),
		frameRate: matrix.frameRate,
		runtimeCacheHit: true,
		videoReused: true,
		exitCode: existsSync(candidateVideo) ? 0 : 1,
		elapsedSeconds: 0,
		error: existsSync(candidateVideo)
			? ""
			: `Missing candidate video: ${candidateVideo}`,
	};
}

function renderEntries({
	matrix,
	options,
	repositoryRoot,
}: {
	matrix: TextParityMatrix;
	options: TextParityCliOptions;
	repositoryRoot: string;
}): TextParityRenderResult[] {
	const results: TextParityRenderResult[] = [];
	for (const entry of matrix.entries) {
		const result =
			options.mode === "verify"
				? verifyOnlyRender({
						entry,
						matrix,
						outputDirectory: options.outputDirectory,
					})
				: renderTextParityEntry({
						entry,
						matrix,
						outputDirectory: options.outputDirectory,
						ffmpegPath: options.ffmpegPath,
						ffprobePath: options.ffprobePath,
						repositoryRoot,
						reuse: options.reuse,
					});
		results.push(result);
		const outcome =
			result.exitCode === 0
				? result.videoReused
					? "reused"
					: "rendered"
				: "failed";
		console.log(`[text-render] ${entry.title}: ${outcome}`);
	}
	return results;
}

async function verifyEntry({
	entry,
	render,
	matrix,
	options,
	repositoryRoot,
}: {
	entry: TextParityEntry;
	render: TextParityRenderResult;
	matrix: TextParityMatrix;
	options: TextParityCliOptions;
	repositoryRoot: string;
}): Promise<VerifiedTextParityResult> {
	if (render.exitCode !== 0) {
		return {
			entry,
			render,
			evidence: null,
			status: "fail",
			error: render.error,
		};
	}
	try {
		const evidence = await collectTextParityEvidence({
			entry,
			matrix,
			candidateVideo: render.candidateVideo,
			evidenceDirectory: path.join(
				textParityEntryDirectory({
					entry,
					outputDirectory: options.outputDirectory,
				}),
				"evidence"
			),
			ffmpegPath: options.ffmpegPath,
			ffprobePath: options.ffprobePath,
			repositoryRoot,
		});
		const metricStatus = classifyTextParityResult({
			evidence,
			thresholds: {
				fullFrameRmse: options.highConfidenceRmse,
				foregroundRmse: options.foregroundRmse,
				maskIou: options.maskIou,
				geometryPixels: options.geometryPixels,
			},
		});
		return {
			entry,
			render,
			evidence,
			status: qualifyTextParityStatus({
				metricStatus,
				referenceOrigin: entry.referenceOrigin,
			}),
			error: "",
		};
	} catch (error) {
		return {
			entry,
			render,
			evidence: null,
			status: "fail",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function markdownPath({
	reportDirectory,
	filePath,
}: {
	reportDirectory: string;
	filePath: string;
}): string {
	return path.relative(reportDirectory, filePath).split(path.sep).join("/");
}

function formatNumber({
	value,
	digits = 3,
}: {
	value: number;
	digits?: number;
}): string {
	return value.toFixed(digits);
}

function escapeTableCell({ value }: { value: string }): string {
	return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function resultDetails({
	result,
	reportDirectory,
}: {
	result: VerifiedTextParityResult;
	reportDirectory: string;
}): string {
	const lines = [
		`## ${result.entry.title}`,
		"",
		`- Identity: \`${result.entry.resourceId}:${result.entry.packageHash}\``,
		`- Package kind: \`${result.entry.packageKind}\``,
		`- Reference origin: \`${result.entry.referenceOrigin}\``,
		...(result.entry.referenceAppVersion
			? [`- Jianying App version: \`${result.entry.referenceAppVersion}\``]
			: []),
		`- Text code points: \`${Array.from(result.entry.content).length}\``,
		`- Font asset: \`${result.entry.fontAssetId ?? "QCut default"}\``,
		`- Font size: \`${result.entry.fontSize}\``,
		`- Source/capture duration: \`${result.entry.sourceStartSeconds}s / ${result.entry.captureDurationSeconds}s\``,
		`- Runtime strategy: \`${result.render.strategy ?? "unavailable"}\``,
		`- Status: **${result.status}**`,
		"",
	];
	if (!result.evidence) {
		lines.push(`Error: ${result.error}`, "");
		return lines.join("\n");
	}
	lines.push(
		`Pixel masks: glow/foreground > ${result.evidence.pixelThresholds.foreground} RGB levels from the background; core geometry > ${result.evidence.pixelThresholds.geometry}.`,
		"",
		"| Progress | Frame | Full RMSE | Foreground RMSE | Glow IoU | Core centroid px | Core bounds px |",
		"| ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
	);
	for (const sample of result.evidence.samples) {
		lines.push(
			`| ${sample.progress} | ${sample.frameIndex} | ${formatNumber({ value: sample.metrics.rmse })} | ${formatNumber({ value: sample.foreground.foregroundRmse })} | ${formatNumber({ value: sample.foreground.maskIou, digits: 6 })} | ${formatNumber({ value: sample.geometry.centroidDistance })} | ${formatNumber({ value: sample.geometry.maximumBoundsDelta })} |`
		);
	}
	lines.push(
		"",
		`Five-stop full-frame mean/worst RMSE: **${formatNumber({ value: result.evidence.fiveStopMeanRmse })} / ${formatNumber({ value: result.evidence.fiveStopWorstRmse })}**. Foreground mean/worst RMSE: **${formatNumber({ value: result.evidence.foregroundSummary.meanRmse })} / ${formatNumber({ value: result.evidence.foregroundSummary.worstRmse })}**. Minimum glow-mask IoU: **${formatNumber({ value: result.evidence.foregroundSummary.minimumMaskIou, digits: 6 })}**. Maximum core centroid/bounds shift: **${formatNumber({ value: result.evidence.foregroundSummary.maximumCentroidDistance })} / ${formatNumber({ value: result.evidence.foregroundSummary.maximumBoundsDelta })} px**. Full interval: **${formatNumber({ value: result.evidence.fullInterval.rgbRmse })} RGB RMSE**, **${formatNumber({ value: result.evidence.fullInterval.psnrAverage })} dB PSNR**, **${formatNumber({ value: result.evidence.fullInterval.ssim, digits: 6 })} SSIM**.`,
		"",
		"Jianying is on the left; QCut private-runtime output is on the right:",
		"",
		`![${result.entry.title} comparison](${markdownPath({ reportDirectory, filePath: result.evidence.contactSheet })})`,
		""
	);
	return lines.join("\n");
}

function writeReports({
	results,
	options,
}: {
	results: VerifiedTextParityResult[];
	options: TextParityCliOptions;
}) {
	const summary = {
		total: results.length,
		passed: results.filter((result) => result.status === "pass").length,
		near: results.filter((result) => result.status === "near").length,
		failed: results.filter((result) => result.status === "fail").length,
		controls: results.filter((result) => result.status === "control").length,
	};
	const report = {
		generatedAt: new Date().toISOString(),
		matrixPath: options.matrixPath,
		thresholds: {
			fullFrameRmse: options.highConfidenceRmse,
			foregroundRmse: options.foregroundRmse,
			maskIou: options.maskIou,
			geometryPixels: options.geometryPixels,
		},
		summary,
		results,
	};
	writeFileSync(
		path.join(options.outputDirectory, "evidence-report.json"),
		stringifyParityReport({ value: report })
	);
	const lines = [
		"# Jianying text parity matrix",
		"",
		`Generated: ${report.generatedAt}`,
		"",
		`Pass thresholds: full-frame RMSE <= ${options.highConfidenceRmse}, foreground RMSE <= ${options.foregroundRmse}, glow-mask IoU >= ${options.maskIou}, core centroid/bounds shift <= ${options.geometryPixels}px. The reference and candidate must also have identical dimensions, frame rate, and frame count.`,
		"",
		`Summary: **${summary.passed} pass**, **${summary.near} near**, **${summary.failed} fail**, **${summary.controls} control**, ${summary.total} total. Controls validate the QCut comparison pipeline and are never counted as Jianying parity passes.`,
		"",
		"| Text style | Kind | Full worst | Foreground worst | Glow IoU | Core geometry px | SSIM | Status |",
		"| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
	];
	for (const result of results) {
		const evidence = result.evidence;
		lines.push(
			`| ${escapeTableCell({ value: result.entry.title })} | ${result.entry.packageKind} | ${evidence ? formatNumber({ value: Math.max(evidence.fiveStopWorstRmse, evidence.fullInterval.rgbRmse) }) : "-"} | ${evidence ? formatNumber({ value: evidence.foregroundSummary.worstRmse }) : "-"} | ${evidence ? formatNumber({ value: evidence.foregroundSummary.minimumMaskIou, digits: 6 }) : "-"} | ${evidence ? formatNumber({ value: Math.max(evidence.foregroundSummary.maximumCentroidDistance, evidence.foregroundSummary.maximumBoundsDelta) }) : "-"} | ${evidence ? formatNumber({ value: evidence.fullInterval.ssim, digits: 6 }) : "-"} | ${result.status} |`
		);
	}
	lines.push("");
	for (const result of results) {
		lines.push(
			resultDetails({ result, reportDirectory: options.outputDirectory })
		);
	}
	writeFileSync(
		path.join(options.outputDirectory, "evidence-report.md"),
		`${lines.join("\n")}\n`
	);
	return summary;
}

async function runCli() {
	const repositoryRoot = path.resolve(import.meta.dir, "../..");
	const options = parseTextParityArgs({
		args: Bun.argv.slice(2),
		repositoryRoot,
	});
	if (!options) {
		console.log(usage());
		return;
	}
	ensureFile({ filePath: options.matrixPath, label: "text parity matrix" });
	ensureIgnoredDirectory({
		directoryPath: options.outputDirectory,
		repositoryRoot,
	});
	const matrix = readTextParityMatrix({ matrixPath: options.matrixPath });
	if (options.mode !== "render") {
		for (const entry of matrix.entries) {
			ensureFile({
				filePath: entry.referenceVideo,
				label: `${entry.title} Jianying reference`,
			});
			ensureReferenceIsPrivate({
				referencePath: entry.referenceVideo,
				repositoryRoot,
			});
		}
	}
	const renders = renderEntries({ matrix, options, repositoryRoot });
	if (options.mode === "render") {
		writeFileSync(
			path.join(options.outputDirectory, "render-results.json"),
			`${JSON.stringify(renders, null, 2)}\n`
		);
		if (renders.some((result) => result.exitCode !== 0)) process.exitCode = 1;
		return;
	}
	const verificationTasks = matrix.entries.map((entry, index) =>
		verifyEntry({
			entry,
			render:
				renders[index] ??
				verifyOnlyRender({
					entry,
					matrix,
					outputDirectory: options.outputDirectory,
				}),
			matrix,
			options,
			repositoryRoot,
		})
	);
	const results = await Promise.all(verificationTasks);
	const summary = writeReports({ results, options });
	console.log(
		`[text-parity] ${summary.passed} pass, ${summary.near} near, ${summary.failed} fail, ${summary.controls} control`
	);
	if (summary.failed > 0) process.exitCode = 1;
}

if (import.meta.main) {
	runCli().catch((error: unknown) => {
		console.error(error instanceof Error ? error.stack : String(error));
		process.exitCode = 1;
	});
}
