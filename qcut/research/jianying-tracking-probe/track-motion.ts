#!/usr/bin/env bun

import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
	sha256File,
	verifyTrackingRuntimeSnapshot,
} from "../../electron/jianying-motion-tracking/runtime-assets";
import {
	runBoundedProcess,
	type BoundedProcessResult,
} from "../jianying-runtime-probe/bounded-process";

const NATIVE_SOURCE = path.join(import.meta.dir, "bingo-tracking-bridge.cpp");
const PROCESS_TIMEOUT_MS = 10 * 60_000;
const NETWORK_DENY_PROFILE = "(version 1) (allow default) (deny network*)";
const projectRoot = path.resolve(import.meta.dir, "../..");

interface Options {
	allowJianyingRunning: boolean;
	anchorFrame: number;
	direction: "backward" | "both" | "forward";
	force: boolean;
	outputPath: string;
	rect: readonly [number, number, number, number];
	runtimeRoot: string;
	videoPath: string;
}

interface VideoMetadata {
	fps: number;
	height: number;
	width: number;
}

interface NativeTrackingResult {
	anchorFrameIndex: number;
	direction: string;
	fps: number;
	frameCount: number;
	height: number;
	route: string;
	samples: unknown[];
	schemaVersion: number;
	width: number;
}

function defaultRuntimeRoot() {
	return path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"PrivateRuntimes",
		"JianyingTracking",
		"current"
	);
}

function parseNonNegativeInteger({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	if (!/^\d+$/.test(value))
		throw new Error(`${label} must be a non-negative integer`);
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed))
		throw new Error(`${label} is out of range`);
	return parsed;
}

export function parseRect({ value }: { value: string }) {
	const values = value.split(",").map((part) => Number(part.trim()));
	if (
		values.length !== 4 ||
		values.some((coordinate) => !Number.isFinite(coordinate))
	) {
		throw new Error(
			"--rect must be left,top,right,bottom in normalized coordinates"
		);
	}
	const [left, top, right, bottom] = values;
	if (
		left < 0 ||
		top < 0 ||
		right > 1 ||
		bottom > 1 ||
		left >= right ||
		top >= bottom
	) {
		throw new Error(
			"--rect must be a positive normalized rectangle inside the frame"
		);
	}
	return [left, top, right, bottom] as const;
}

function outputPathFor({ videoPath }: { videoPath: string }) {
	const extension = path.extname(videoPath);
	const baseName = path.basename(videoPath, extension);
	return path.join(
		path.dirname(videoPath),
		`${baseName}.jianying-motion-track.json`
	);
}

function parseOptions(): Options {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			"allow-jianying-running": { type: "boolean" },
			"anchor-frame": { default: "0", type: "string" },
			direction: { default: "forward", type: "string" },
			force: { type: "boolean" },
			output: { type: "string" },
			rect: { type: "string" },
			"runtime-root": { type: "string" },
			video: { type: "string" },
		},
		strict: true,
	});
	if (!values.video) throw new Error("--video is required");
	if (!values.rect) throw new Error("--rect is required");
	if (
		values.direction !== "forward" &&
		values.direction !== "backward" &&
		values.direction !== "both"
	) {
		throw new Error("--direction must be forward, backward, or both");
	}
	const videoPath = path.resolve(values.video);
	return {
		allowJianyingRunning: values["allow-jianying-running"] ?? false,
		anchorFrame: parseNonNegativeInteger({
			label: "--anchor-frame",
			value: values["anchor-frame"],
		}),
		direction: values.direction,
		force: values.force ?? false,
		outputPath: path.resolve(values.output ?? outputPathFor({ videoPath })),
		rect: parseRect({ value: values.rect }),
		runtimeRoot: path.resolve(values["runtime-root"] ?? defaultRuntimeRoot()),
		videoPath,
	};
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
	const executablePath = successfulOutput({
		label: `${name} is unavailable`,
		result,
	});
	if (!path.isAbsolute(executablePath)) {
		throw new Error(`${name} did not resolve to an absolute path`);
	}
	return executablePath;
}

async function requireInputFile({ filePath }: { filePath: string }) {
	const metadata = await stat(filePath);
	if (!metadata.isFile() || metadata.size === 0) {
		throw new Error(`Input video is not a non-empty file: ${filePath}`);
	}
}

async function pathExists({ filePath }: { filePath: string }) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function requireOutputAvailable({
	force,
	outputPath,
}: Pick<Options, "force" | "outputPath">) {
	if (!force && (await pathExists({ filePath: outputPath }))) {
		throw new Error(
			`Output already exists; pass --force to replace it: ${outputPath}`
		);
	}
	await mkdir(path.dirname(outputPath), { recursive: true });
}

async function assertJianyingStopped({
	allowRunning,
}: {
	allowRunning: boolean;
}) {
	const result = await runBoundedProcess({
		command: "/usr/bin/pgrep",
		args: ["-fal", "^/Applications/VideoFusion-macOS\\.app/"],
		cwd: projectRoot,
	});
	if (result.exitCode === 1) return;
	if (result.exitCode !== 0) {
		throw new Error(
			`Cannot inspect Jianying processes: ${result.stderr}`.trim()
		);
	}
	if (!allowRunning) {
		throw new Error(
			"Jianying is running. Quit it to prove app-less execution, or pass --allow-jianying-running."
		);
	}
}

export function parseFrameRate({ value }: { value: unknown }) {
	if (typeof value !== "string")
		throw new Error("ffprobe did not report a frame rate");
	const [numeratorText, denominatorText] = value.split("/");
	const numerator = Number(numeratorText);
	const denominator = Number(denominatorText);
	const fps = numerator / denominator;
	if (!Number.isFinite(fps) || fps <= 0) {
		throw new Error(`Invalid ffprobe frame rate: ${value}`);
	}
	return fps;
}

async function inspectVideo({
	ffprobe,
	videoPath,
}: {
	ffprobe: string;
	videoPath: string;
}) {
	const result = await runBoundedProcess({
		command: ffprobe,
		args: [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height,avg_frame_rate",
			"-of",
			"json",
			videoPath,
		],
		cwd: projectRoot,
	});
	const output = successfulOutput({ label: "ffprobe failed", result });
	const parsed = JSON.parse(output) as {
		streams?: Array<{
			avg_frame_rate?: unknown;
			height?: unknown;
			width?: unknown;
		}>;
	};
	const stream = parsed.streams?.[0];
	if (
		!stream ||
		typeof stream.width !== "number" ||
		typeof stream.height !== "number" ||
		!Number.isSafeInteger(stream.width) ||
		!Number.isSafeInteger(stream.height) ||
		stream.width <= 0 ||
		stream.height <= 0
	) {
		throw new Error("ffprobe did not report valid video dimensions");
	}
	return {
		fps: parseFrameRate({ value: stream.avg_frame_rate }),
		height: stream.height,
		width: stream.width,
	} satisfies VideoMetadata;
}

async function decodeRgb24({
	ffmpeg,
	outputPath,
	videoPath,
}: {
	ffmpeg: string;
	outputPath: string;
	videoPath: string;
}) {
	const result = await runBoundedProcess({
		command: ffmpeg,
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-nostdin",
			"-noautorotate",
			"-y",
			"-i",
			videoPath,
			"-map",
			"0:v:0",
			"-fps_mode",
			"passthrough",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgb24",
			outputPath,
		],
		cwd: projectRoot,
		timeoutMs: PROCESS_TIMEOUT_MS,
	});
	successfulOutput({ label: "FFmpeg RGB24 decode failed", result });
}

async function ensureNativeBridge({
	clang,
	runtimeRoot,
	runtimeSha256,
}: {
	clang: string;
	runtimeRoot: string;
	runtimeSha256: string;
}) {
	const sourceSha256 = await sha256File({ filePath: NATIVE_SOURCE });
	const buildId = `${sourceSha256}-${runtimeSha256}`;
	const buildRoot = path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"JianyingTrackingBridge",
		buildId
	);
	const bridgePath = path.join(buildRoot, "bingo-tracking-bridge");
	if (await pathExists({ filePath: bridgePath })) {
		return { bridgePath, sourceSha256 };
	}
	await mkdir(buildRoot, { mode: 0o700, recursive: true });
	const temporaryPath = `${bridgePath}.tmp-${process.pid}`;
	const frameworkPath = path.join(runtimeRoot, "Frameworks");
	const result = await runBoundedProcess({
		command: clang,
		args: [
			"-std=c++20",
			"-Wall",
			"-Wextra",
			"-Werror",
			"-Wno-deprecated-declarations",
			`-Wl,-rpath,${frameworkPath}`,
			NATIVE_SOURCE,
			"-o",
			temporaryPath,
		],
		cwd: projectRoot,
		timeoutMs: PROCESS_TIMEOUT_MS,
	});
	successfulOutput({ label: "Native Bingo bridge build failed", result });
	await rename(temporaryPath, bridgePath);
	return { bridgePath, sourceSha256 };
}

function parseNativeResult({
	value,
}: {
	value: unknown;
}): NativeTrackingResult {
	if (!value || typeof value !== "object") {
		throw new Error("Native bridge output is not an object");
	}
	const result = value as Partial<NativeTrackingResult>;
	if (
		result.schemaVersion !== 1 ||
		typeof result.route !== "string" ||
		typeof result.frameCount !== "number" ||
		!Number.isSafeInteger(result.frameCount) ||
		!Array.isArray(result.samples) ||
		typeof result.width !== "number" ||
		typeof result.height !== "number" ||
		typeof result.fps !== "number" ||
		typeof result.anchorFrameIndex !== "number" ||
		typeof result.direction !== "string"
	) {
		throw new Error("Native bridge output violates the tracking schema");
	}
	return result as NativeTrackingResult;
}

export function expectedSampleCount({
	anchorFrame,
	direction,
	frameCount,
}: {
	anchorFrame: number;
	direction: Options["direction"];
	frameCount: number;
}) {
	if (direction === "forward") return frameCount - anchorFrame;
	if (direction === "backward") return anchorFrame + 1;
	return frameCount;
}

async function runNativeBridge({
	bridgePath,
	metadata,
	options,
	rawPath,
	resultPath,
}: {
	bridgePath: string;
	metadata: VideoMetadata;
	options: Options;
	rawPath: string;
	resultPath: string;
}) {
	const argumentsList = [
		"-p",
		NETWORK_DENY_PROFILE,
		bridgePath,
		options.runtimeRoot,
		rawPath,
		resultPath,
		String(metadata.width),
		String(metadata.height),
		String(metadata.fps),
		String(options.anchorFrame),
		options.direction,
		...options.rect.map(String),
	];
	const result = await runBoundedProcess({
		command: "/usr/bin/sandbox-exec",
		args: argumentsList,
		cwd: projectRoot,
		env: process.env,
		timeoutMs: PROCESS_TIMEOUT_MS,
	});
	successfulOutput({ label: "App-less Bingo tracking failed", result });
	return result.stderr.trim();
}

async function publishOutput({
	contents,
	outputPath,
}: {
	contents: string;
	outputPath: string;
}) {
	const temporaryPath = `${outputPath}.tmp-${process.pid}`;
	await writeFile(temporaryPath, contents, { mode: 0o600 });
	await rename(temporaryPath, outputPath);
}

async function run() {
	const options = parseOptions();
	await Promise.all([
		requireInputFile({ filePath: options.videoPath }),
		requireOutputAvailable(options),
		assertJianyingStopped({ allowRunning: options.allowJianyingRunning }),
	]);
	const [ffmpeg, ffprobe, clang, runtimeManifest] = await Promise.all([
		resolveExecutable({ name: "ffmpeg" }),
		resolveExecutable({ name: "ffprobe" }),
		resolveExecutable({ name: "clang++" }),
		verifyTrackingRuntimeSnapshot({ snapshotPath: options.runtimeRoot }),
	]);
	const [
		{ bridgePath, sourceSha256: bridgeSourceSha256 },
		metadata,
		videoSha256,
	] = await Promise.all([
		ensureNativeBridge({
			clang,
			runtimeRoot: options.runtimeRoot,
			runtimeSha256: runtimeManifest.core.sha256,
		}),
		inspectVideo({ ffprobe, videoPath: options.videoPath }),
		sha256File({ filePath: options.videoPath }),
	]);
	const workDirectory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-tracking-")
	);
	try {
		const rawPath = path.join(workDirectory, "frames.rgb24");
		const nativeResultPath = path.join(workDirectory, "track.json");
		await decodeRgb24({
			ffmpeg,
			outputPath: rawPath,
			videoPath: options.videoPath,
		});
		const rawMetadata = await stat(rawPath);
		const frameBytes = metadata.width * metadata.height * 3;
		if (rawMetadata.size === 0 || rawMetadata.size % frameBytes !== 0) {
			throw new Error("Decoded RGB24 stream contains an incomplete frame");
		}
		const frameCount = rawMetadata.size / frameBytes;
		if (options.anchorFrame >= frameCount) {
			throw new Error(
				`Anchor frame ${options.anchorFrame} is outside ${frameCount} decoded frames`
			);
		}
		const nativeLog = await runNativeBridge({
			bridgePath,
			metadata,
			options,
			rawPath,
			resultPath: nativeResultPath,
		});
		const result = parseNativeResult({
			value: JSON.parse(await readFile(nativeResultPath, "utf8")) as unknown,
		});
		const expectedCount = expectedSampleCount({
			anchorFrame: options.anchorFrame,
			direction: options.direction,
			frameCount,
		});
		if (
			result.frameCount !== frameCount ||
			result.samples.length !== expectedCount
		) {
			throw new Error(
				`Native bridge returned ${result.samples.length}/${expectedCount} expected samples`
			);
		}
		const finalResult = {
			...result,
			execution: {
				bridgeSourceSha256,
				jianyingProcessRequired: false,
				nativeLog,
				networkPolicy: "deny",
			},
			initialRect: {
				bottom: options.rect[3],
				left: options.rect[0],
				right: options.rect[2],
				top: options.rect[1],
			},
			runtime: {
				appBundleId: runtimeManifest.app.bundleId,
				appVersion: runtimeManifest.app.version,
				coreSha256: runtimeManifest.core.sha256,
				coreUuid: runtimeManifest.core.uuid,
				localOnly: runtimeManifest.localOnly,
			},
			source: {
				fileName: path.basename(options.videoPath),
				sha256: videoSha256,
			},
		};
		await publishOutput({
			contents: `${JSON.stringify(finalResult, null, 2)}\n`,
			outputPath: options.outputPath,
		});
		console.log(
			JSON.stringify(
				{
					frameCount,
					outputPath: options.outputPath,
					route: result.route,
					sampleCount: result.samples.length,
				},
				null,
				2
			)
		);
	} finally {
		await rm(workDirectory, { force: true, recursive: true });
	}
}

if (import.meta.main) await run();
