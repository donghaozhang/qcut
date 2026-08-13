#!/usr/bin/env bun

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { stringifyParityReport } from "./parity-report-json";
import {
	collectTransitionParityEvidence,
	runCommand,
	type ParitySampleEvidence,
	type TransitionParityEvidence,
} from "./transition-parity-media";
import { renderMatrix, type RenderResult } from "./transition-parity-render";
import {
	buildTransitionFrameWindow,
	classifyParityResult,
	readTransitionParityMatrix,
	type TransitionParityEntry,
	type TransitionParityMatrix,
} from "./transition-parity-plan";

interface VerifiedResult {
	entry: TransitionParityEntry;
	render: RenderResult;
	evidence: TransitionParityEvidence | null;
	status: "pass" | "near" | "fail";
	error: string;
}

type MatrixMode = "run" | "render" | "verify";

function usage(): string {
	return `Usage:
  transition-parity-matrix.ts --matrix PATH [--output PATH] [--mode run|render|verify]

Options:
  --reuse                 Reuse outputs with a matching saved render request
  --ffmpeg PATH           FFmpeg executable (default: ffmpeg)
  --ffprobe PATH          FFprobe executable (default: ffprobe)
  --renderer PATH         render-transition-video.sh path
  --rmse-threshold VALUE  Pass threshold in decoded RGB (default: 8)`;
}

function ensureFile({ filePath, label }: { filePath: string; label: string }) {
	if (!existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
}

function parseMode({ value }: { value: string }): MatrixMode {
	if (value === "run" || value === "render" || value === "verify") {
		return value;
	}
	throw new Error(`--mode must be run, render, or verify\n${usage()}`);
}

function ensureIgnoredOutput({
	outputDirectory,
	repositoryRoot,
}: {
	outputDirectory: string;
	repositoryRoot: string;
}) {
	mkdirSync(outputDirectory, { recursive: true });
	const relative = path.relative(repositoryRoot, outputDirectory);
	if (relative.startsWith("..") || path.isAbsolute(relative)) return;
	const ignored = runCommand({
		cwd: repositoryRoot,
		command: ["git", "check-ignore", "-q", "--", outputDirectory],
	});
	if (ignored.exitCode !== 0) {
		throw new Error(
			`Evidence output is inside the repository but not ignored: ${outputDirectory}`
		);
	}
}

async function verifyEntry({
	entry,
	render,
	matrix,
	outputDirectory,
	ffmpegPath,
	ffprobePath,
	repositoryRoot,
	highConfidenceRmse,
}: {
	entry: TransitionParityEntry;
	render: RenderResult;
	matrix: TransitionParityMatrix;
	outputDirectory: string;
	ffmpegPath: string;
	ffprobePath: string;
	repositoryRoot: string;
	highConfidenceRmse: number;
}): Promise<VerifiedResult> {
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
		ensureFile({ filePath: render.candidateVideo, label: "candidate video" });
		ensureFile({ filePath: entry.referenceVideo, label: "Jianying reference" });
		const window = buildTransitionFrameWindow({
			frameRate: matrix.frameRate,
			durationSeconds: entry.durationSeconds,
			cutFrame: matrix.cutFrame,
		});
		const evidence = await collectTransitionParityEvidence({
			entry,
			candidateVideo: render.candidateVideo,
			window,
			evidenceDirectory: path.join(outputDirectory, entry.resourceId),
			ffmpegPath,
			ffprobePath,
			cwd: repositoryRoot,
		});
		return {
			entry,
			render,
			evidence,
			status: classifyParityResult({
				fiveStopWorstRmse: evidence.fiveStopWorstRmse,
				fullIntervalRmse: evidence.fullInterval.rgbRmse,
				highConfidenceRmse,
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

/**
 * Derived rather than indexed at 2, so the label stays truthful if
 * PARITY_PROGRESS_STOPS ever changes length.
 */
function midpointSample({
	samples,
}: {
	samples: ParitySampleEvidence[];
}): ParitySampleEvidence {
	const sample = samples.at(Math.floor(samples.length / 2));
	if (!sample) {
		throw new Error("Parity evidence has no samples to report a midpoint for");
	}
	return sample;
}

function escapeTableCell({ value }: { value: string }): string {
	return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatNumber({
	value,
	digits = 3,
}: {
	value: number;
	digits?: number;
}) {
	return value.toFixed(digits);
}

function resultDetails({
	result,
	reportDirectory,
}: {
	result: VerifiedResult;
	reportDirectory: string;
}): string {
	const lines = [`## ${result.entry.title}`, ""];
	lines.push(
		`- Identity: \`${result.entry.resourceId}:${result.entry.metadataMd5}\``,
		`- Package family: \`${result.entry.packageFamily || "unclassified"}\``,
		`- Duration: \`${result.entry.durationSeconds}s\``,
		`- Render/comparison size: \`${result.render.renderSize.width}x${result.render.renderSize.height} -> ${result.render.comparisonSize.width}x${result.render.comparisonSize.height}\``,
		`- Hold exact endpoints: \`${result.entry.holdExactEndpoints}\``,
		`- Status: **${result.status}**`,
		""
	);
	if (!result.evidence) {
		lines.push(`Error: ${result.error}`, "");
		return lines.join("\n");
	}
	lines.push(
		"| Progress | Frame | MAE | RMSE | P95 | Max |",
		"| ---: | ---: | ---: | ---: | ---: | ---: |"
	);
	for (const sample of result.evidence.samples) {
		lines.push(
			`| ${sample.progress} | ${sample.frameIndex} | ${formatNumber({ value: sample.metrics.mae })} | ${formatNumber({ value: sample.metrics.rmse })} | ${sample.metrics.p95AbsoluteError} | ${sample.metrics.maxAbsoluteError} |`
		);
	}
	lines.push(
		"",
		`Five-stop mean/worst RGB RMSE: **${formatNumber({ value: result.evidence.fiveStopMeanRmse })} / ${formatNumber({ value: result.evidence.fiveStopWorstRmse })}**. Full interval: **${formatNumber({ value: result.evidence.fullInterval.rgbRmse })} RGB RMSE**, **${formatNumber({ value: result.evidence.fullInterval.psnrAverage })} dB PSNR**, **${formatNumber({ value: result.evidence.fullInterval.ssim, digits: 6 })} SSIM**.`,
		"",
		"Five stops, Jianying on the left and the probe on the right:",
		"",
		`![${result.entry.title} five-stop comparison](${markdownPath({ reportDirectory, filePath: result.evidence.contactSheet })})`,
		"",
		"Midpoint absolute difference amplified 8x:",
		"",
		`![${result.entry.title} midpoint difference](${markdownPath({ reportDirectory, filePath: midpointSample({ samples: result.evidence.samples }).differenceImage })})`,
		""
	);
	return lines.join("\n");
}

function writeReports({
	results,
	outputDirectory,
	matrixPath,
	highConfidenceRmse,
}: {
	results: VerifiedResult[];
	outputDirectory: string;
	matrixPath: string;
	highConfidenceRmse: number;
}) {
	const report = {
		generatedAt: new Date().toISOString(),
		matrixPath,
		highConfidenceRmse,
		summary: {
			total: results.length,
			passed: results.filter((result) => result.status === "pass").length,
			near: results.filter((result) => result.status === "near").length,
			failed: results.filter((result) => result.status === "fail").length,
		},
		results,
	};
	writeFileSync(
		path.join(outputDirectory, "evidence-report.json"),
		stringifyParityReport({ value: report })
	);
	const lines = [
		"# Jianying transition parity matrix",
		"",
		`Generated: ${report.generatedAt}`,
		"",
		`Pass threshold: decoded RGB RMSE <= ${highConfidenceRmse}. MP4 byte identity is not expected; metrics are calculated from aligned decoded frames.`,
		"",
		`Summary: **${report.summary.passed} pass**, **${report.summary.near} near**, **${report.summary.failed} fail**, ${report.summary.total} total.`,
		"",
		"| Transition | Family | Duration | Five-stop mean | Five-stop worst | Full RMSE | SSIM | Status |",
		"| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
	];
	for (const result of results) {
		const evidence = result.evidence;
		lines.push(
			`| ${escapeTableCell({ value: result.entry.title })} | ${escapeTableCell({ value: result.entry.packageFamily || "unclassified" })} | ${result.entry.durationSeconds} | ${evidence ? formatNumber({ value: evidence.fiveStopMeanRmse }) : "-"} | ${evidence ? formatNumber({ value: evidence.fiveStopWorstRmse }) : "-"} | ${evidence ? formatNumber({ value: evidence.fullInterval.rgbRmse }) : "-"} | ${evidence ? formatNumber({ value: evidence.fullInterval.ssim, digits: 6 }) : "-"} | ${result.status} |`
		);
	}
	lines.push("");
	for (const result of results) {
		lines.push(resultDetails({ result, reportDirectory: outputDirectory }));
	}
	writeFileSync(
		path.join(outputDirectory, "evidence-report.md"),
		lines.join("\n")
	);
	return report.summary;
}

async function runCli() {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			matrix: { type: "string" },
			output: { type: "string" },
			mode: { type: "string", default: "run" },
			reuse: { type: "boolean", default: false },
			ffmpeg: { type: "string", default: "ffmpeg" },
			ffprobe: { type: "string", default: "ffprobe" },
			renderer: { type: "string" },
			"rmse-threshold": { type: "string", default: "8" },
			help: { type: "boolean", short: "h" },
		},
		strict: true,
	});
	if (values.help) {
		console.log(usage());
		return;
	}
	if (!values.matrix) throw new Error(`--matrix is required\n${usage()}`);
	const mode = parseMode({ value: values.mode });
	const highConfidenceRmse = Number(values["rmse-threshold"]);
	if (!Number.isFinite(highConfidenceRmse) || highConfidenceRmse <= 0) {
		throw new Error("--rmse-threshold must be a positive number");
	}
	const repositoryRoot = path.resolve(import.meta.dir, "../..");
	const matrixPath = path.resolve(values.matrix);
	const outputDirectory = path.resolve(
		values.output ??
			path.join(repositoryRoot, ".local/jianying-runtime/parity-matrix")
	);
	const rendererPath = path.resolve(
		values.renderer ?? path.join(import.meta.dir, "render-transition-video.sh")
	);
	ensureIgnoredOutput({ outputDirectory, repositoryRoot });
	ensureFile({ filePath: rendererPath, label: "transition renderer" });
	const matrix = readTransitionParityMatrix({ matrixPath });
	ensureFile({ filePath: matrix.inputA, label: "input A" });
	ensureFile({ filePath: matrix.inputB, label: "input B" });
	for (const entry of matrix.entries) {
		ensureFile({
			filePath: entry.packagePath,
			label: `${entry.title} package`,
		});
		ensureFile({
			filePath: entry.referenceVideo,
			label: `${entry.title} Jianying reference`,
		});
	}
	const renders = renderMatrix({
		matrix,
		outputDirectory,
		rendererPath,
		ffmpegPath: values.ffmpeg,
		ffprobePath: values.ffprobe,
		repositoryRoot,
		reuse: values.reuse,
		mode,
	});
	if (mode === "render") {
		writeFileSync(
			path.join(outputDirectory, "render-results.json"),
			JSON.stringify(renders, null, 2)
		);
		return;
	}
	const results = await Promise.all(
		matrix.entries.map((entry, index) =>
			verifyEntry({
				entry,
				render: renders[index],
				matrix,
				outputDirectory,
				ffmpegPath: values.ffmpeg,
				ffprobePath: values.ffprobe,
				repositoryRoot,
				highConfidenceRmse,
			})
		)
	);
	for (const result of results) {
		console.log(
			`[verify] ${result.entry.title}: ${result.status}${result.error ? ` (${result.error})` : ""}`
		);
	}
	const summary = writeReports({
		results,
		outputDirectory,
		matrixPath,
		highConfidenceRmse,
	});
	console.log(
		`[summary] ${summary.passed} pass, ${summary.near} near, ${summary.failed} fail`
	);
	if (summary.failed > 0) process.exitCode = 1;
}

if (import.meta.main) {
	await runCli();
}
