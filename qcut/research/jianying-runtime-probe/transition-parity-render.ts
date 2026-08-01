import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

import { readVideoMetadata, runCommand } from "./transition-parity-media";
import type {
	TransitionParityEntry,
	TransitionParityMatrix,
	VideoSize,
} from "./transition-parity-plan";

export interface RenderResult {
	title: string;
	resourceId: string;
	engineVideo: string;
	candidateVideo: string;
	renderLog: string;
	renderSize: VideoSize;
	comparisonSize: VideoSize;
	normalized: boolean;
	exitCode: number;
	elapsedSeconds: number;
	reused: boolean;
	error: string;
}

interface RenderRequestFingerprint {
	schemaVersion: number;
	inputA: FileFingerprint;
	inputB: FileFingerprint;
	package: FileFingerprint;
	reference: FileFingerprint;
	rendererDigest: string;
	ffmpegPath: string;
	frameRate: number;
	renderSize: VideoSize | null;
	durationSeconds: number;
	resourceId: string;
	metadataMd5: string;
	holdExactEndpoints: boolean;
}

interface FileFingerprint {
	path: string;
	size: number;
	modifiedMilliseconds: number;
}

const RENDERER_SOURCE_FILES = [
	"render-transition-video.sh",
	"run-probe.sh",
	"probe.mm",
	"graphics-probe.h",
	"graphics-probe.mm",
	"transition-probe.h",
	"transition-probe.mm",
	"video-transition-probe.h",
	"video-transition-probe.mm",
];

function fileFingerprint({ filePath }: { filePath: string }): FileFingerprint {
	const stats = statSync(filePath);
	return {
		path: path.resolve(filePath),
		size: stats.size,
		modifiedMilliseconds: stats.mtimeMs,
	};
}

function rendererDigest({ rendererPath }: { rendererPath: string }): string {
	const rendererDirectory = path.dirname(rendererPath);
	const hash = createHash("sha256");
	const sourcePaths = [
		rendererPath,
		...RENDERER_SOURCE_FILES.map((filename) =>
			path.join(rendererDirectory, filename)
		),
	];
	const seenPaths = new Set<string>();
	for (const filePath of sourcePaths) {
		const resolvedPath = path.resolve(filePath);
		if (seenPaths.has(resolvedPath)) continue;
		seenPaths.add(resolvedPath);
		if (!existsSync(filePath)) continue;
		hash.update(resolvedPath);
		hash.update(readFileSync(filePath));
	}
	return hash.digest("hex");
}

function renderRequestFingerprint({
	entry,
	matrix,
	rendererPath,
	ffmpegPath,
}: {
	entry: TransitionParityEntry;
	matrix: TransitionParityMatrix;
	rendererPath: string;
	ffmpegPath: string;
}): RenderRequestFingerprint {
	return {
		schemaVersion: 1,
		inputA: fileFingerprint({ filePath: matrix.inputA }),
		inputB: fileFingerprint({ filePath: matrix.inputB }),
		package: fileFingerprint({ filePath: entry.packagePath }),
		reference: fileFingerprint({ filePath: entry.referenceVideo }),
		rendererDigest: rendererDigest({ rendererPath }),
		ffmpegPath,
		frameRate: matrix.frameRate,
		renderSize: matrix.renderSize,
		durationSeconds: entry.durationSeconds,
		resourceId: entry.resourceId,
		metadataMd5: entry.metadataMd5,
		holdExactEndpoints: entry.holdExactEndpoints,
	};
}

function requestMatches({
	manifestPath,
	fingerprint,
}: {
	manifestPath: string;
	fingerprint: RenderRequestFingerprint;
}): boolean {
	if (!existsSync(manifestPath)) return false;
	try {
		const existing: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
		return JSON.stringify(existing) === JSON.stringify(fingerprint);
	} catch {
		return false;
	}
}

function dimensionsFromMetadata({
	metadata,
}: {
	metadata: { width: number; height: number };
}): VideoSize {
	return { width: metadata.width, height: metadata.height };
}

function sizesMatch({ left, right }: { left: VideoSize; right: VideoSize }) {
	return left.width === right.width && left.height === right.height;
}

function errorTail({ output }: { output: string }): string {
	return output.trim().split("\n").slice(-12).join("\n");
}

function normalizeCandidate({
	ffmpegPath,
	engineVideo,
	candidateVideo,
	comparisonSize,
	repositoryRoot,
}: {
	ffmpegPath: string;
	engineVideo: string;
	candidateVideo: string;
	comparisonSize: VideoSize;
	repositoryRoot: string;
}) {
	return runCommand({
		cwd: repositoryRoot,
		command: [
			ffmpegPath,
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			engineVideo,
			"-map",
			"0:v:0",
			"-an",
			"-sn",
			"-dn",
			"-vf",
			`scale=${comparisonSize.width}:${comparisonSize.height}:flags=lanczos,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709`,
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"0",
			"-color_range",
			"tv",
			"-colorspace",
			"bt709",
			"-color_trc",
			"bt709",
			"-color_primaries",
			"bt709",
			"-movflags",
			"+faststart",
			candidateVideo,
		],
	});
}

function failedRenderResult({
	entry,
	engineVideo,
	candidateVideo,
	renderLog,
	renderSize,
	comparisonSize,
	elapsedSeconds,
	error,
}: {
	entry: TransitionParityEntry;
	engineVideo: string;
	candidateVideo: string;
	renderLog: string;
	renderSize: VideoSize;
	comparisonSize: VideoSize;
	elapsedSeconds: number;
	error: string;
}): RenderResult {
	return {
		title: entry.title,
		resourceId: entry.resourceId,
		engineVideo,
		candidateVideo,
		renderLog,
		renderSize,
		comparisonSize,
		normalized: !sizesMatch({ left: renderSize, right: comparisonSize }),
		exitCode: 1,
		elapsedSeconds,
		reused: false,
		error,
	};
}

function renderEntry({
	entry,
	matrix,
	outputDirectory,
	rendererPath,
	ffmpegPath,
	ffprobePath,
	repositoryRoot,
	reuse,
}: {
	entry: TransitionParityEntry;
	matrix: TransitionParityMatrix;
	outputDirectory: string;
	rendererPath: string;
	ffmpegPath: string;
	ffprobePath: string;
	repositoryRoot: string;
	reuse: boolean;
}): RenderResult {
	const entryDirectory = path.join(outputDirectory, entry.resourceId);
	mkdirSync(entryDirectory, { recursive: true });
	const engineVideo = path.join(entryDirectory, "probe-engine.mp4");
	const candidateVideo = path.join(entryDirectory, "probe.mp4");
	const renderLog = path.join(entryDirectory, "render.log");
	const manifestPath = path.join(entryDirectory, "render-request.json");
	const referenceMetadata = readVideoMetadata({
		videoPath: entry.referenceVideo,
		ffprobePath,
		cwd: repositoryRoot,
	});
	const comparisonSize = dimensionsFromMetadata({
		metadata: referenceMetadata,
	});
	const requestedRenderSize = matrix.renderSize ?? comparisonSize;
	const fingerprint = renderRequestFingerprint({
		entry,
		matrix,
		rendererPath,
		ffmpegPath,
	});
	if (
		reuse &&
		existsSync(engineVideo) &&
		existsSync(candidateVideo) &&
		requestMatches({ manifestPath, fingerprint })
	) {
		const engineMetadata = readVideoMetadata({
			videoPath: engineVideo,
			ffprobePath,
			cwd: repositoryRoot,
		});
		const renderSize = dimensionsFromMetadata({ metadata: engineMetadata });
		return {
			title: entry.title,
			resourceId: entry.resourceId,
			engineVideo,
			candidateVideo,
			renderLog,
			renderSize,
			comparisonSize,
			normalized: !sizesMatch({ left: renderSize, right: comparisonSize }),
			exitCode: 0,
			elapsedSeconds: 0,
			reused: true,
			error: "",
		};
	}

	const startedAt = performance.now();
	let log = "";
	try {
		const renderSizeEnvironment = matrix.renderSize
			? {
					JY_VIDEO_WIDTH: String(matrix.renderSize.width),
					JY_VIDEO_HEIGHT: String(matrix.renderSize.height),
				}
			: {};
		const execution = runCommand({
			cwd: repositoryRoot,
			command: [
				rendererPath,
				matrix.inputA,
				matrix.inputB,
				engineVideo,
				String(entry.durationSeconds),
			],
			environment: {
				JY_VIDEO_FPS: String(matrix.frameRate),
				JY_VIDEO_CRF: "0",
				JY_VIDEO_PRESET: "medium",
				JY_TRANSITION_PACKAGE: entry.packagePath,
				JY_TRANSITION_HOLD_EXACT_ENDPOINTS: entry.holdExactEndpoints
					? "1"
					: "0",
				...renderSizeEnvironment,
			},
		});
		log = `${execution.stdout}\n${execution.stderr}`;
		if (execution.exitCode !== 0) {
			writeFileSync(renderLog, log);
			return failedRenderResult({
				entry,
				engineVideo,
				candidateVideo,
				renderLog,
				renderSize: requestedRenderSize,
				comparisonSize,
				elapsedSeconds: (performance.now() - startedAt) / 1000,
				error: errorTail({ output: log }),
			});
		}

		const engineMetadata = readVideoMetadata({
			videoPath: engineVideo,
			ffprobePath,
			cwd: repositoryRoot,
		});
		const renderSize = dimensionsFromMetadata({ metadata: engineMetadata });
		const normalized = !sizesMatch({ left: renderSize, right: comparisonSize });
		if (normalized) {
			const normalization = normalizeCandidate({
				ffmpegPath,
				engineVideo,
				candidateVideo,
				comparisonSize,
				repositoryRoot,
			});
			log += `\n[normalization]\n${normalization.stdout}\n${normalization.stderr}`;
			if (normalization.exitCode !== 0) {
				writeFileSync(renderLog, log);
				return failedRenderResult({
					entry,
					engineVideo,
					candidateVideo,
					renderLog,
					renderSize,
					comparisonSize,
					elapsedSeconds: (performance.now() - startedAt) / 1000,
					error: errorTail({ output: log }),
				});
			}
		} else {
			copyFileSync(engineVideo, candidateVideo);
		}
		writeFileSync(renderLog, log);
		writeFileSync(manifestPath, JSON.stringify(fingerprint, null, 2));
		return {
			title: entry.title,
			resourceId: entry.resourceId,
			engineVideo,
			candidateVideo,
			renderLog,
			renderSize,
			comparisonSize,
			normalized,
			exitCode: 0,
			elapsedSeconds: (performance.now() - startedAt) / 1000,
			reused: false,
			error: "",
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		writeFileSync(renderLog, `${log}\n${message}\n`);
		return failedRenderResult({
			entry,
			engineVideo,
			candidateVideo,
			renderLog,
			renderSize: requestedRenderSize,
			comparisonSize,
			elapsedSeconds: (performance.now() - startedAt) / 1000,
			error: message,
		});
	}
}

function skippedRenderResult({
	entry,
	matrix,
	outputDirectory,
	ffprobePath,
	repositoryRoot,
}: {
	entry: TransitionParityEntry;
	matrix: TransitionParityMatrix;
	outputDirectory: string;
	ffprobePath: string;
	repositoryRoot: string;
}): RenderResult {
	const entryDirectory = path.join(outputDirectory, entry.resourceId);
	const engineVideo = path.join(entryDirectory, "probe-engine.mp4");
	const candidateVideo = path.join(entryDirectory, "probe.mp4");
	const referenceMetadata = readVideoMetadata({
		videoPath: entry.referenceVideo,
		ffprobePath,
		cwd: repositoryRoot,
	});
	const comparisonSize = dimensionsFromMetadata({
		metadata: referenceMetadata,
	});
	const renderSize = existsSync(engineVideo)
		? dimensionsFromMetadata({
				metadata: readVideoMetadata({
					videoPath: engineVideo,
					ffprobePath,
					cwd: repositoryRoot,
				}),
			})
		: (matrix.renderSize ?? comparisonSize);
	return {
		title: entry.title,
		resourceId: entry.resourceId,
		engineVideo,
		candidateVideo,
		renderLog: path.join(entryDirectory, "render.log"),
		renderSize,
		comparisonSize,
		normalized: !sizesMatch({ left: renderSize, right: comparisonSize }),
		exitCode: 0,
		elapsedSeconds: 0,
		reused: true,
		error: "",
	};
}

export function renderMatrix({
	matrix,
	outputDirectory,
	rendererPath,
	ffmpegPath,
	ffprobePath,
	repositoryRoot,
	reuse,
	mode,
}: {
	matrix: TransitionParityMatrix;
	outputDirectory: string;
	rendererPath: string;
	ffmpegPath: string;
	ffprobePath: string;
	repositoryRoot: string;
	reuse: boolean;
	mode: "run" | "render" | "verify";
}): RenderResult[] {
	const results: RenderResult[] = [];
	for (const entry of matrix.entries) {
		const result =
			mode === "verify"
				? skippedRenderResult({
						entry,
						matrix,
						outputDirectory,
						ffprobePath,
						repositoryRoot,
					})
				: renderEntry({
						entry,
						matrix,
						outputDirectory,
						rendererPath,
						ffmpegPath,
						ffprobePath,
						repositoryRoot,
						reuse,
					});
		results.push(result);
		console.log(
			`[render] ${entry.title}: ${result.exitCode === 0 ? (result.reused ? "reused" : "ok") : "failed"} (${result.renderSize.width}x${result.renderSize.height} -> ${result.comparisonSize.width}x${result.comparisonSize.height})`
		);
	}
	return results;
}
