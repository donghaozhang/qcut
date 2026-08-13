import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
	JianyingTextRuntimeRenderRequest,
	JianyingTextRuntimeRenderResult,
	JianyingTextRuntimeRenderStrategy,
} from "../../electron/jianying-text-runtime-contract";
import { readVideoMetadata, runCommand } from "./transition-parity-media";
import { buildTextCompositeCommand } from "./text-parity-composite";
import type {
	TextParityCanvas,
	TextParityEntry,
	TextParityMatrix,
} from "./text-parity-plan";

interface TextRenderFingerprint {
	schemaVersion: number;
	request: JianyingTextRuntimeRenderRequest;
	canvas: TextParityCanvas;
	placement: { x: number; y: number; width: number; height: number };
	sourceManifestSha256: string;
	ffmpegPath: string;
}

export interface TextParityRenderResult {
	title: string;
	resourceId: string;
	packageHash: string;
	candidateVideo: string;
	renderLog: string;
	frameCount: number;
	frameRate: number;
	strategy?: JianyingTextRuntimeRenderStrategy;
	runtimeCacheHit: boolean;
	videoReused: boolean;
	exitCode: number;
	elapsedSeconds: number;
	error: string;
}

export function textParityEntryDirectory({
	entry,
	outputDirectory,
}: {
	entry: TextParityEntry;
	outputDirectory: string;
}): string {
	return path.join(
		outputDirectory,
		`${entry.resourceId}-${entry.packageHash.slice(0, 8)}`
	);
}

function fileSha256({ filePath }: { filePath: string }): string {
	return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function resolveTsxExecutable({ repositoryRoot }: { repositoryRoot: string }) {
	const candidates = [
		process.env.QCUT_TSX_PATH ?? "",
		path.join(repositoryRoot, "apps/web/node_modules/.bin/tsx"),
		path.join(repositoryRoot, "node_modules/.bin/tsx"),
	];
	const executable = candidates.find(
		(candidate) => candidate && existsSync(candidate)
	);
	if (!executable) {
		throw new Error(
			"tsx is unavailable; run bun install or set QCUT_TSX_PATH before text parity rendering"
		);
	}
	return path.resolve(executable);
}

function requireRuntimeRenderResult({
	value,
}: {
	value: unknown;
}): JianyingTextRuntimeRenderResult {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Text runtime worker returned a non-object response");
	}
	const response = value as Record<string, unknown>;
	if (
		typeof response.requestId !== "string" ||
		typeof response.resourceId !== "string" ||
		typeof response.packageHash !== "string" ||
		typeof response.frameCount !== "number" ||
		typeof response.cacheHit !== "boolean" ||
		typeof response.strategy !== "string" ||
		!response.source ||
		typeof response.source !== "object" ||
		Array.isArray(response.source)
	) {
		throw new Error("Text runtime worker returned an invalid response");
	}
	return value as JianyingTextRuntimeRenderResult;
}

function runRuntimeWorker({
	request,
	entryDirectory,
	repositoryRoot,
}: {
	request: JianyingTextRuntimeRenderRequest;
	entryDirectory: string;
	repositoryRoot: string;
}): {
	result: JianyingTextRuntimeRenderResult;
	log: string;
} {
	const requestPath = path.join(entryDirectory, "runtime-request.json");
	const responsePath = path.join(entryDirectory, "runtime-response.json");
	writeFileSync(requestPath, `${JSON.stringify(request)}\n`);
	const execution = runCommand({
		command: [
			resolveTsxExecutable({ repositoryRoot }),
			path.join(import.meta.dir, "text-parity-runtime-worker.ts"),
			"--request",
			requestPath,
			"--response",
			responsePath,
		],
		cwd: repositoryRoot,
	});
	const log = `${execution.stdout}\n${execution.stderr}`;
	if (execution.exitCode !== 0) {
		throw new Error(
			log.trim().split("\n").slice(-16).join("\n") ||
				`Text runtime worker exited with code ${execution.exitCode}`
		);
	}
	if (!existsSync(responsePath)) {
		throw new Error("Text runtime worker did not write its response");
	}
	return {
		result: requireRuntimeRenderResult({
			value: JSON.parse(readFileSync(responsePath, "utf8")),
		}),
		log,
	};
}

function requestForEntry({
	entry,
	matrix,
	requestId,
}: {
	entry: TextParityEntry;
	matrix: TextParityMatrix;
	requestId: string;
}): JianyingTextRuntimeRenderRequest {
	return {
		requestId,
		reference: {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: entry.packageKind,
			resourceId: entry.resourceId,
			packageHash: entry.packageHash,
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: entry.templateDuration,
		},
		content: entry.content,
		...(entry.fontAssetId ? { fontAssetId: entry.fontAssetId } : {}),
		fontSize: entry.fontSize,
		canvasWidth: matrix.canvas.width,
		canvasHeight: matrix.canvas.height,
		transform: entry.transform,
		sourceStart: entry.sourceStartSeconds,
		elementDuration: entry.elementDurationSeconds,
		frameCount: Math.round(entry.captureDurationSeconds * matrix.frameRate),
		fps: matrix.frameRate,
		previewVideo: false,
	};
}

function fingerprintMatches({
	manifestPath,
	fingerprint,
}: {
	manifestPath: string;
	fingerprint: TextRenderFingerprint;
}): boolean {
	if (!existsSync(manifestPath)) return false;
	try {
		const existing: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
		return JSON.stringify(existing) === JSON.stringify(fingerprint);
	} catch {
		return false;
	}
}

function validateCandidate({
	videoPath,
	matrix,
	frameCount,
	ffprobePath,
	repositoryRoot,
}: {
	videoPath: string;
	matrix: TextParityMatrix;
	frameCount: number;
	ffprobePath: string;
	repositoryRoot: string;
}) {
	const metadata = readVideoMetadata({
		videoPath,
		ffprobePath,
		cwd: repositoryRoot,
	});
	const issues: string[] = [];
	if (
		metadata.width !== matrix.canvas.width ||
		metadata.height !== matrix.canvas.height
	) {
		issues.push(
			`dimensions ${metadata.width}x${metadata.height} instead of ${matrix.canvas.width}x${matrix.canvas.height}`
		);
	}
	if (Math.abs(metadata.frameRate - matrix.frameRate) > 0.0001) {
		issues.push(
			`frame rate ${metadata.frameRate} instead of ${matrix.frameRate}`
		);
	}
	if (metadata.frameCount !== frameCount) {
		issues.push(`frame count ${metadata.frameCount} instead of ${frameCount}`);
	}
	if (issues.length > 0) {
		throw new Error(`Candidate video is invalid: ${issues.join(", ")}`);
	}
}

function failedResult({
	entry,
	candidateVideo,
	renderLog,
	frameCount,
	frameRate,
	elapsedSeconds,
	error,
}: {
	entry: TextParityEntry;
	candidateVideo: string;
	renderLog: string;
	frameCount: number;
	frameRate: number;
	elapsedSeconds: number;
	error: string;
}): TextParityRenderResult {
	return {
		title: entry.title,
		resourceId: entry.resourceId,
		packageHash: entry.packageHash,
		candidateVideo,
		renderLog,
		frameCount,
		frameRate,
		runtimeCacheHit: false,
		videoReused: false,
		exitCode: 1,
		elapsedSeconds,
		error,
	};
}

export function renderTextParityEntry({
	entry,
	matrix,
	outputDirectory,
	ffmpegPath,
	ffprobePath,
	repositoryRoot,
	reuse,
}: {
	entry: TextParityEntry;
	matrix: TextParityMatrix;
	outputDirectory: string;
	ffmpegPath: string;
	ffprobePath: string;
	repositoryRoot: string;
	reuse: boolean;
}): TextParityRenderResult {
	const entryDirectory = textParityEntryDirectory({
		entry,
		outputDirectory,
	});
	mkdirSync(entryDirectory, { recursive: true });
	const candidateVideo = path.join(entryDirectory, "qcut-private-runtime.mp4");
	const renderLog = path.join(entryDirectory, "render.log");
	const manifestPath = path.join(entryDirectory, "render-request.json");
	const frameCount = Math.round(
		entry.captureDurationSeconds * matrix.frameRate
	);
	const startedAt = performance.now();
	const request = requestForEntry({
		entry,
		matrix,
		requestId: `text-parity-${entry.resourceId}-${Date.now()}`,
	});
	let log = "";
	try {
		const runtime = runRuntimeWorker({
			request,
			entryDirectory,
			repositoryRoot,
		});
		const rendered = runtime.result;
		log = runtime.log;
		if (rendered.source.kind !== "image-sequence") {
			throw new Error("Text parity requires an image-sequence render");
		}
		const sourceDirectory = path.dirname(rendered.source.path);
		const sourceManifest = path.join(sourceDirectory, "manifest.json");
		const fingerprint: TextRenderFingerprint = {
			// 2: requestId is intentionally excluded so runtime cache hits can reuse video.
			schemaVersion: 2,
			request: { ...request, requestId: "stable-text-parity-request" },
			canvas: matrix.canvas,
			placement: {
				x: rendered.x,
				y: rendered.y,
				width: rendered.width,
				height: rendered.height,
			},
			sourceManifestSha256: fileSha256({ filePath: sourceManifest }),
			ffmpegPath: path.resolve(ffmpegPath),
		};
		if (
			reuse &&
			existsSync(candidateVideo) &&
			fingerprintMatches({ manifestPath, fingerprint })
		) {
			validateCandidate({
				videoPath: candidateVideo,
				matrix,
				frameCount,
				ffprobePath,
				repositoryRoot,
			});
			return {
				title: entry.title,
				resourceId: entry.resourceId,
				packageHash: entry.packageHash,
				candidateVideo,
				renderLog,
				frameCount,
				frameRate: matrix.frameRate,
				strategy: rendered.strategy,
				runtimeCacheHit: rendered.cacheHit,
				videoReused: true,
				exitCode: 0,
				elapsedSeconds: (performance.now() - startedAt) / 1000,
				error: "",
			};
		}
		const command = buildTextCompositeCommand({
			ffmpegPath,
			framePattern: rendered.source.path,
			outputPath: candidateVideo,
			canvas: matrix.canvas,
			placement: { x: rendered.x, y: rendered.y },
			frameRate: matrix.frameRate,
			frameCount,
		});
		const execution = runCommand({
			command,
			cwd: repositoryRoot,
		});
		log += `\n[composite]\n${execution.stdout}\n${execution.stderr}`;
		writeFileSync(renderLog, log);
		if (execution.exitCode !== 0) {
			throw new Error(
				log.trim().split("\n").slice(-12).join("\n") ||
					`FFmpeg exited with code ${execution.exitCode}`
			);
		}
		validateCandidate({
			videoPath: candidateVideo,
			matrix,
			frameCount,
			ffprobePath,
			repositoryRoot,
		});
		writeFileSync(manifestPath, `${JSON.stringify(fingerprint, null, 2)}\n`);
		return {
			title: entry.title,
			resourceId: entry.resourceId,
			packageHash: entry.packageHash,
			candidateVideo,
			renderLog,
			frameCount,
			frameRate: matrix.frameRate,
			strategy: rendered.strategy,
			runtimeCacheHit: rendered.cacheHit,
			videoReused: false,
			exitCode: 0,
			elapsedSeconds: (performance.now() - startedAt) / 1000,
			error: "",
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		writeFileSync(renderLog, `${log}\n${message}\n`);
		return failedResult({
			entry,
			candidateVideo,
			renderLog,
			frameCount,
			frameRate: matrix.frameRate,
			elapsedSeconds: (performance.now() - startedAt) / 1000,
			error: message,
		});
	}
}
