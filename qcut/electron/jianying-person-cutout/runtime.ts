import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
	JianyingPersonCutoutRenderResult,
	JianyingPersonCutoutStatus,
} from "../jianying-person-cutout-contract.js";
import { getFFmpegPath, getFFprobePath } from "../ffmpeg/utils.js";
import { resolveJianyingPersonCutoutBridge } from "./bridge-resolver.js";
import {
	commitPersonCutoutMaskCache,
	createPersonCutoutCacheIdentity,
	createPersonCutoutCacheKey,
	createPersonCutoutMaskCacheBuild,
	discardPersonCutoutMaskCacheBuild,
	inspectPersonCutoutMaskCache,
	type PersonCutoutCacheIdentity,
	type PersonCutoutMaskCacheEntry,
	type PersonCutoutModelRoute,
} from "./mask-cache.js";
import {
	executeTemattingWithFallback,
	selectTemattingBlendImplementation,
} from "./runtime-capability.js";
import {
	buildTemattingOutputMetadata,
	buildTemattingTransparentBlendFilter,
	TEMATTING_COMPATIBLE_BLEND,
	TEMATTING_NATIVE_METAL_BLEND,
	type TemattingBlendImplementation,
} from "./tematting-blend.js";
import {
	resolveJianyingSaliencyRuntime,
	type JianyingSaliencyRuntime,
} from "./saliency-runtime.js";
import { resolvePersonCutoutRoutingMode } from "./model-router.js";
import { executePersonCutoutRouteWithFallback } from "./model-route-fallback.js";
import {
	resolveJianyingVideoObjectRuntime,
	type JianyingVideoObjectRuntime,
} from "./video-object-runtime.js";

const execFileAsync = promisify(execFile);
const MODEL_SHA256 =
	"101688825490be3704babc7ce49f6d002cdb4fe69e879556b4687ac9006f8596";
const MODEL_TYPE = "4";
const MODEL_NAME = "tt_matting_video_gru_v1.0.model";
const FINE_MODEL_NAME = "tt_matting_video_gru_v1.0+vision-person-v1";
const BRIDGE_ERROR_TAIL_BYTES = 64 * 1024;
const PRIVATE_RUNTIME_ROOT = path.join(
	os.homedir(),
	"Library",
	"Application Support",
	"QCut",
	"PrivateRuntimes"
);

interface ReadyRuntime {
	blendImplementation: TemattingBlendImplementation;
	bridgePath: string;
	frameworkDirectory: string;
	libraryPath: string;
	modelPath: string;
	modelName: string;
	modelRoute: PersonCutoutModelRoute;
	modelSha256: string;
	processorSha256: string;
	saliency?: JianyingSaliencyRuntime;
	videoObject?: JianyingVideoObjectRuntime;
}

interface VideoMetadata {
	width: number;
	height: number;
	duration: number;
	frameRate: number;
	hasAudio: boolean;
}

interface PersonCutoutProgress {
	progress: number;
	status: string;
}

type ProgressCallback = (progress: PersonCutoutProgress) => void;

function status({
	available,
	blendImplementation,
	message,
}: {
	available: boolean;
	blendImplementation: TemattingBlendImplementation;
	message: string;
}): JianyingPersonCutoutStatus {
	return {
		available,
		message,
		provider: "jianying-gru-local-v1",
		offlineReady: available,
		blendImplementation,
	};
}

async function readable({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

async function resolveRuntime(): Promise<ReadyRuntime | null> {
	if (process.platform !== "darwin") return null;
	const frameworkDirectory = path.join(
		PRIVATE_RUNTIME_ROOT,
		"JianyingTransition",
		"current",
		"Frameworks"
	);
	const libraryPath = path.join(frameworkDirectory, "libcccreator.dylib");
	const modelPath = path.join(
		PRIVATE_RUNTIME_ROOT,
		"JianyingMatting",
		"current",
		"Models",
		"mattingmodel",
		"tt_matting_video_gru_v1.0.model"
	);
	const bridgePath = await resolveJianyingPersonCutoutBridge();
	if (
		!bridgePath ||
		!(await readable({ filePath: libraryPath })) ||
		!(await readable({ filePath: modelPath }))
	) {
		return null;
	}
	const [bridgeContents, modelContents, libraryContents] = await Promise.all([
		readFile(bridgePath),
		readFile(modelPath),
		readFile(libraryPath),
	]);
	const modelHash = createHash("sha256").update(modelContents).digest("hex");
	if (modelHash !== MODEL_SHA256) return null;
	const libraryHash = createHash("sha256")
		.update(libraryContents)
		.digest("hex");
	const blendImplementation = selectTemattingBlendImplementation({
		arch: process.arch,
		disabled: process.env.QCUT_DISABLE_NATIVE_MATTING_METAL === "1",
		librarySha256: libraryHash,
		platform: process.platform,
	});
	return {
		blendImplementation,
		bridgePath,
		frameworkDirectory,
		libraryPath,
		modelPath,
		modelName: FINE_MODEL_NAME,
		modelRoute: "portrait-gru",
		modelSha256: modelHash,
		processorSha256: createHash("sha256")
			.update(bridgeContents)
			.update(os.release())
			.digest("hex"),
	};
}

async function selectInferenceRuntime({
	metadata,
	portraitRuntime,
}: {
	metadata: VideoMetadata;
	portraitRuntime: ReadyRuntime;
}): Promise<ReadyRuntime> {
	const routingMode = resolvePersonCutoutRoutingMode({
		automaticRoutingEnabled:
			process.env.QCUT_ENABLE_PERSON_CUTOUT_AUTO_ROUTE === "1",
		requestedRoute: process.env.QCUT_PERSON_CUTOUT_ROUTE,
	});
	if (routingMode === "portrait-gru") {
		return portraitRuntime;
	}
	if (routingMode === "auto") {
		return portraitRuntime;
	}
	if (routingMode === "video-object") {
		const videoObject = await resolveJianyingVideoObjectRuntime({
			height: metadata.height,
			width: metadata.width,
		});
		if (!videoObject) {
			console.warn(
				"Jianying video-object runtime is unavailable; falling back to portrait GRU."
			);
			return portraitRuntime;
		}
		return {
			blendImplementation: TEMATTING_COMPATIBLE_BLEND,
			bridgePath: videoObject.bridgePath,
			frameworkDirectory: videoObject.frameworkDirectory,
			libraryPath: videoObject.libraryPath,
			modelPath: videoObject.modelDirectory,
			modelName: "video_saliency_seg_bce",
			modelRoute: "video-object",
			modelSha256: videoObject.modelSha256,
			processorSha256: videoObject.processorSha256,
			videoObject,
		};
	}
	const saliency = await resolveJianyingSaliencyRuntime();
	if (!saliency) {
		if (routingMode === "saliency-script") {
			console.warn(
				"Jianying saliency runtime is unavailable; falling back to portrait GRU."
			);
		}
		return portraitRuntime;
	}
	return {
		blendImplementation: TEMATTING_COMPATIBLE_BLEND,
		bridgePath: saliency.bridgePath,
		frameworkDirectory: saliency.frameworkDirectory,
		libraryPath: saliency.libraryPath,
		modelPath: saliency.modelDirectory,
		modelName: "saliency_script_for_cc_v1.2",
		modelRoute: "saliency-script",
		modelSha256: saliency.modelSha256,
		processorSha256: saliency.processorSha256,
		saliency,
	};
}

export async function inspectJianyingPersonCutout() {
	if (process.platform !== "darwin") {
		return status({
			available: false,
			blendImplementation: TEMATTING_COMPATIBLE_BLEND,
			message: "精细抠像目前只支持 macOS",
		});
	}
	const runtime = await resolveRuntime();
	return runtime
		? status({
				available: true,
				blendImplementation: runtime.blendImplementation,
				message: "精细抠像已就绪",
			})
		: status({
				available: false,
				blendImplementation: TEMATTING_COMPATIBLE_BLEND,
				message: "精细抠像所需的本机模型未就绪",
			});
}

function bridgeArguments({
	blendImplementation,
	height,
	inputPath,
	modelPath,
	outputPath,
	settings,
	width,
	libraryPath,
	runtime,
}: {
	blendImplementation: TemattingBlendImplementation;
	height: number;
	inputPath: string;
	libraryPath: string;
	modelPath: string;
	outputPath: string;
	settings: {
		threshold: number;
		temporalSmoothing: number;
		edgeShift: number;
		feather: number;
	};
	width: number;
	runtime: ReadyRuntime;
}) {
	if (runtime.modelRoute === "video-object") {
		if (!runtime.videoObject) {
			throw new Error("剪映物体抠像运行时不完整");
		}
		return [
			libraryPath,
			runtime.videoObject.modelDirectory,
			runtime.videoObject.effectDirectory,
			inputPath,
			String(width),
			String(height),
			outputPath,
			String(settings.threshold),
			String(settings.temporalSmoothing),
			String(settings.edgeShift),
			String(settings.feather),
			"--route",
			"video-object",
		];
	}
	if (runtime.modelRoute === "saliency-script") {
		if (!runtime.saliency) {
			throw new Error("剪映显著性抠像运行时不完整");
		}
		return [
			libraryPath,
			runtime.saliency.modelDirectory,
			runtime.saliency.effectDirectory,
			inputPath,
			String(width),
			String(height),
			outputPath,
			String(settings.threshold),
			String(settings.temporalSmoothing),
			String(settings.edgeShift),
			String(settings.feather),
		];
	}
	const args = [
		libraryPath,
		modelPath,
		MODEL_TYPE,
		inputPath,
		String(width),
		String(height),
		outputPath,
		String(settings.threshold),
		String(settings.temporalSmoothing),
		String(settings.edgeShift),
		String(settings.feather),
		"--vision-person-fusion",
	];
	if (blendImplementation === TEMATTING_NATIVE_METAL_BLEND) {
		args.push("--blend", "native-metal");
	}
	return args;
}

function appendProcessOutputTail({
	current,
	next,
}: {
	current: string;
	next: string;
}) {
	return `${current}${next}`.slice(-BRIDGE_ERROR_TAIL_BYTES);
}

function createAbortError() {
	const error = new Error("人物抠像已取消");
	error.name = "AbortError";
	return error;
}

function clampProgress({ value }: { value: number }) {
	return Math.max(0, Math.min(100, Math.round(value)));
}

interface ManagedProcess {
	child: ChildProcess;
	label: string;
}

async function runEffectGraphAlphaInference({
	alphaPath,
	ffmpegPath,
	metadata,
	onProgress,
	runtime,
	settings,
	signal,
	sourcePath,
	workingDirectory,
}: {
	alphaPath: string;
	ffmpegPath: string;
	metadata: VideoMetadata;
	onProgress?: ProgressCallback;
	runtime: ReadyRuntime;
	settings: PersonCutoutCacheIdentity["settings"];
	signal?: AbortSignal;
	sourcePath: string;
	workingDirectory: string;
}) {
	const rgbaPath = path.join(workingDirectory, "source.rgba");
	onProgress?.({ progress: 8, status: "正在准备精细人物分析..." });
	const decoder = spawn(
		ffmpegPath,
		[
			"-y",
			"-v",
			"error",
			"-i",
			sourcePath,
			"-map",
			"0:v:0",
			"-pix_fmt",
			"rgba",
			"-f",
			"rawvideo",
			rgbaPath,
		],
		{ cwd: workingDirectory, stdio: ["ignore", "ignore", "pipe"] }
	);
	await waitForProcesses({
		processes: [{ child: decoder, label: "视频解码" }],
		signal,
	});
	const bridge = spawn(
		runtime.bridgePath,
		bridgeArguments({
			blendImplementation: TEMATTING_COMPATIBLE_BLEND,
			height: metadata.height,
			inputPath: rgbaPath,
			libraryPath: runtime.libraryPath,
			modelPath: runtime.modelPath,
			outputPath: alphaPath,
			runtime,
			settings,
			width: metadata.width,
		}),
		{
			cwd: workingDirectory,
			env: {
				...process.env,
				DYLD_LIBRARY_PATH: runtime.frameworkDirectory,
			},
			stdio: ["ignore", "ignore", "pipe"],
		}
	);
	let bridgeText = "";
	let lastProgress = 8;
	try {
		await waitForProcesses({
			processes: [{ child: bridge, label: "剪映主体分析" }],
			signal,
			onStderr: ({ chunk }) => {
				bridgeText += chunk.toString("utf8");
				const lines = bridgeText.split("\n");
				bridgeText = lines.pop() ?? "";
				for (const line of lines) {
					const match = /progress frame=(\d+) total=(\d+)/.exec(line);
					if (!match) continue;
					const frame = Number(match[1]);
					const total = Math.max(1, Number(match[2]));
					const progress = clampProgress({
						value: 8 + (frame / total) * 70,
					});
					if (progress <= lastProgress) continue;
					lastProgress = progress;
					onProgress?.({
						progress,
						status: `正在分析人物主体（${frame}/${total} 帧）...`,
					});
				}
			},
		});
	} finally {
		await rm(rgbaPath, { force: true });
	}
}

function waitForProcesses({
	onStderr,
	processes,
	signal,
}: {
	onStderr?: (event: { child: ChildProcess; chunk: Buffer }) => void;
	processes: ManagedProcess[];
	signal?: AbortSignal;
}) {
	return new Promise<void>((resolve, reject) => {
		const outputTails = new Map<ChildProcess, string>(
			processes.map(({ child }) => [child, ""])
		);
		let completed = 0;
		let settled = false;
		const terminate = () => {
			for (const { child } of processes) {
				if (child.exitCode === null && child.signalCode === null) {
					child.kill("SIGTERM");
				}
			}
			const forceKill = setTimeout(() => {
				for (const { child } of processes) {
					if (child.exitCode === null && child.signalCode === null) {
						child.kill("SIGKILL");
					}
				}
			}, 1000);
			forceKill.unref();
		};
		const cleanup = () => signal?.removeEventListener("abort", abort);
		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			terminate();
			reject(signal?.aborted ? createAbortError() : error);
		};
		const abort = () => fail(createAbortError());
		signal?.addEventListener("abort", abort, { once: true });

		for (const { child, label } of processes) {
			child.stderr?.on("data", (chunk: Buffer) => {
				outputTails.set(
					child,
					appendProcessOutputTail({
						current: outputTails.get(child) ?? "",
						next: chunk.toString("utf8"),
					})
				);
				onStderr?.({ child, chunk });
			});
			child.once("error", (error) => fail(error));
			child.once("close", (code, closeSignal) => {
				if (settled) return;
				if (code !== 0) {
					const details = processes
						.map(
							(candidate) =>
								`${candidate.label}: ${outputTails.get(candidate.child) ?? ""}`
						)
						.join("\n");
					fail(
						new Error(
							`${label}失败（退出 ${code ?? closeSignal ?? "unknown"}）：\n${details}`
						)
					);
					return;
				}
				completed += 1;
				if (completed !== processes.length) return;
				settled = true;
				cleanup();
				resolve();
			});
		}
	});
}

function runAlphaInference({
	alphaPath,
	blendImplementation,
	ffmpegPath,
	metadata,
	onProgress,
	runtime,
	settings,
	signal,
	sourcePath,
	workingDirectory,
}: {
	alphaPath: string;
	blendImplementation: TemattingBlendImplementation;
	ffmpegPath: string;
	metadata: VideoMetadata;
	onProgress?: ProgressCallback;
	runtime: ReadyRuntime;
	settings: PersonCutoutCacheIdentity["settings"];
	signal?: AbortSignal;
	sourcePath: string;
	workingDirectory: string;
}) {
	if (signal?.aborted) return Promise.reject(createAbortError());
	if (runtime.modelRoute !== "portrait-gru") {
		return runEffectGraphAlphaInference({
			alphaPath,
			ffmpegPath,
			metadata,
			onProgress,
			runtime,
			settings,
			signal,
			sourcePath,
			workingDirectory,
		});
	}
	const decoder = spawn(
		ffmpegPath,
		[
			"-v",
			"error",
			"-i",
			sourcePath,
			"-map",
			"0:v:0",
			"-pix_fmt",
			"rgba",
			"-f",
			"rawvideo",
			"pipe:1",
		],
		{ cwd: workingDirectory, stdio: ["ignore", "pipe", "pipe"] }
	);
	const bridge = spawn(
		runtime.bridgePath,
		bridgeArguments({
			blendImplementation,
			height: metadata.height,
			inputPath: "-",
			libraryPath: runtime.libraryPath,
			modelPath: runtime.modelPath,
			outputPath: alphaPath,
			settings,
			width: metadata.width,
			runtime,
		}),
		{
			cwd: workingDirectory,
			env: {
				...process.env,
				DYLD_LIBRARY_PATH: runtime.frameworkDirectory,
			},
			stdio: ["pipe", "ignore", "pipe"],
		}
	);
	if (!decoder.stdout || !bridge.stdin) {
		decoder.kill("SIGTERM");
		bridge.kill("SIGTERM");
		return Promise.reject(new Error("无法建立人物蒙版预计算管线"));
	}
	decoder.stdout.pipe(bridge.stdin);
	for (const stream of [decoder.stdout, bridge.stdin]) {
		stream.on("error", (error: NodeJS.ErrnoException) => {
			if (error.code !== "EPIPE") bridge.kill("SIGTERM");
		});
	}
	let bridgeText = "";
	let lastProgress = 8;
	return waitForProcesses({
		processes: [
			{ child: decoder, label: "视频解码" },
			{ child: bridge, label: "人物蒙版预计算" },
		],
		signal,
		onStderr: ({ child, chunk }) => {
			if (child !== bridge) return;
			bridgeText += chunk.toString("utf8");
			const lines = bridgeText.split("\n");
			bridgeText = lines.pop() ?? "";
			for (const line of lines) {
				const match = /progress frame=(\d+) total=(\d+)/.exec(line);
				if (!match) continue;
				const frame = Number(match[1]);
				const reportedTotal = Number(match[2]);
				const total =
					reportedTotal > 0
						? reportedTotal
						: Math.max(1, Math.round(metadata.duration * metadata.frameRate));
				const progress = clampProgress({ value: 8 + (frame / total) * 70 });
				if (progress <= lastProgress) continue;
				lastProgress = progress;
				onProgress?.({
					progress,
					status: `正在预计算人物蒙版（${frame}/${total} 帧）...`,
				});
			}
		},
	});
}

const activeMaskCacheBuilds = new Map<
	string,
	Promise<PersonCutoutMaskCacheEntry>
>();

async function buildMaskCache({
	blendImplementation,
	ffmpegPath,
	identity,
	metadata,
	onProgress,
	runtime,
	settings,
	signal,
	sourcePath,
}: {
	blendImplementation: TemattingBlendImplementation;
	ffmpegPath: string;
	identity: PersonCutoutCacheIdentity;
	metadata: VideoMetadata;
	onProgress?: ProgressCallback;
	runtime: ReadyRuntime;
	settings: PersonCutoutCacheIdentity["settings"];
	signal?: AbortSignal;
	sourcePath: string;
}) {
	const build = await createPersonCutoutMaskCacheBuild({ identity });
	try {
		await runAlphaInference({
			alphaPath: build.alphaPath,
			blendImplementation,
			ffmpegPath,
			metadata,
			onProgress,
			runtime,
			settings,
			signal,
			sourcePath,
			workingDirectory: build.directory,
		});
		const alphaStat = await stat(build.alphaPath);
		const bytesPerFrame = metadata.width * metadata.height;
		if (alphaStat.size === 0 || alphaStat.size % bytesPerFrame !== 0) {
			throw new Error("人物蒙版帧不完整，已停止导出");
		}
		return await commitPersonCutoutMaskCache({
			buildDirectory: build.directory,
			frameCount: alphaStat.size / bytesPerFrame,
			identity,
		});
	} catch (error) {
		await discardPersonCutoutMaskCacheBuild({
			buildDirectory: build.directory,
		});
		throw error;
	}
}

async function ensureMaskCache({
	blendImplementation,
	ffmpegPath,
	metadata,
	onProgress,
	runtime,
	settings,
	signal,
	sourcePath,
}: {
	blendImplementation: TemattingBlendImplementation;
	ffmpegPath: string;
	metadata: VideoMetadata;
	onProgress?: ProgressCallback;
	runtime: ReadyRuntime;
	settings: PersonCutoutCacheIdentity["settings"];
	signal?: AbortSignal;
	sourcePath: string;
}) {
	const identity = await createPersonCutoutCacheIdentity({
		blendImplementation,
		frameRate: metadata.frameRate,
		height: metadata.height,
		modelName: runtime.modelName,
		modelRoute: runtime.modelRoute,
		modelSha256: runtime.modelSha256,
		processorSha256: runtime.processorSha256,
		settings,
		sourcePath,
		width: metadata.width,
	});
	const cached = await inspectPersonCutoutMaskCache({ identity });
	if (cached) {
		onProgress?.({ progress: 78, status: "人物蒙版缓存完整，正在导出..." });
		return cached;
	}
	const cacheKey = createPersonCutoutCacheKey({ identity });
	const activeBuild = activeMaskCacheBuilds.get(cacheKey);
	if (activeBuild) return activeBuild;
	const build = buildMaskCache({
		blendImplementation,
		ffmpegPath,
		identity,
		metadata,
		onProgress,
		runtime,
		settings,
		signal,
		sourcePath,
	});
	activeMaskCacheBuilds.set(cacheKey, build);
	try {
		return await build;
	} finally {
		activeMaskCacheBuilds.delete(cacheKey);
	}
}

function runTransparentEncoder({
	alphaCache,
	blendImplementation,
	ffmpegPath,
	metadata,
	onProgress,
	outputPath,
	runtime,
	signal,
	sourcePath,
	workingDirectory,
}: {
	alphaCache: PersonCutoutMaskCacheEntry;
	blendImplementation: TemattingBlendImplementation;
	ffmpegPath: string;
	metadata: VideoMetadata;
	onProgress?: ProgressCallback;
	outputPath: string;
	runtime: ReadyRuntime;
	signal?: AbortSignal;
	sourcePath: string;
	workingDirectory: string;
}) {
	if (signal?.aborted) return Promise.reject(createAbortError());
	const encoder = spawn(
		ffmpegPath,
		[
			"-y",
			"-v",
			"error",
			"-i",
			sourcePath,
			"-f",
			"rawvideo",
			"-pixel_format",
			"gray",
			"-video_size",
			`${metadata.width}x${metadata.height}`,
			"-framerate",
			String(metadata.frameRate),
			"-i",
			alphaCache.alphaPath,
			"-filter_complex",
			buildTemattingTransparentBlendFilter(),
			"-map",
			"[cutout]",
			"-map",
			"0:a?",
			"-frames:v",
			String(alphaCache.frameCount),
			"-c:v",
			"libvpx-vp9",
			"-pix_fmt",
			"yuva420p",
			"-metadata:s:v:0",
			"alpha_mode=1",
			...buildTemattingOutputMetadata({
				implementation: blendImplementation,
				modelName: runtime.modelName,
				modelRoute: runtime.modelRoute,
			}),
			"-c:a",
			"libopus",
			"-shortest",
			"-progress",
			"pipe:1",
			"-nostats",
			outputPath,
		],
		{ cwd: workingDirectory, stdio: ["ignore", "pipe", "pipe"] }
	);
	let encoderText = "";
	let lastProgress = 78;
	encoder.stdout?.on("data", (chunk: Buffer) => {
		encoderText += chunk.toString("utf8");
		const lines = encoderText.split("\n");
		encoderText = lines.pop() ?? "";
		for (const line of lines) {
			const match = /^out_time_us=(\d+)$/.exec(line.trim());
			if (!match || metadata.duration <= 0) continue;
			const seconds = Number(match[1]) / 1_000_000;
			const progress = clampProgress({
				value: 78 + (seconds / metadata.duration) * 20,
			});
			if (progress <= lastProgress) continue;
			lastProgress = progress;
			onProgress?.({ progress, status: "正在生成透明视频..." });
		}
	});
	return waitForProcesses({
		processes: [{ child: encoder, label: "透明视频编码" }],
		signal,
	});
}

async function runCachedPipeline({
	blendImplementation,
	ffmpegPath,
	metadata,
	onProgress,
	outputPath,
	runtime,
	settings,
	signal,
	sourcePath,
	workingDirectory,
}: {
	blendImplementation: TemattingBlendImplementation;
	ffmpegPath: string;
	metadata: VideoMetadata;
	onProgress?: ProgressCallback;
	outputPath: string;
	runtime: ReadyRuntime;
	settings: PersonCutoutCacheIdentity["settings"];
	signal?: AbortSignal;
	sourcePath: string;
	workingDirectory: string;
}) {
	const alphaCache = await ensureMaskCache({
		blendImplementation,
		ffmpegPath,
		metadata,
		onProgress,
		runtime,
		settings,
		signal,
		sourcePath,
	});
	await runTransparentEncoder({
		alphaCache,
		blendImplementation,
		ffmpegPath,
		metadata,
		onProgress,
		outputPath,
		runtime,
		signal,
		sourcePath,
		workingDirectory,
	});
	return alphaCache.frameCount;
}

function parseFrameRate({ value }: { value: string }) {
	const [numeratorText, denominatorText = "1"] = value.split("/");
	const numerator = Number(numeratorText);
	const denominator = Number(denominatorText);
	if (
		!Number.isFinite(numerator) ||
		!Number.isFinite(denominator) ||
		denominator <= 0
	) {
		throw new Error("无法读取视频帧率");
	}
	return numerator / denominator;
}

async function probeVideo({ sourcePath }: { sourcePath: string }) {
	const ffprobePath = await getFFprobePath();
	const { stdout } = await execFileAsync(
		ffprobePath,
		[
			"-v",
			"error",
			"-show_entries",
			"stream=codec_type,width,height,avg_frame_rate:format=duration",
			"-of",
			"json",
			sourcePath,
		],
		{ maxBuffer: 4 * 1024 * 1024 }
	);
	const value = JSON.parse(stdout) as {
		streams?: Array<{
			codec_type?: string;
			width?: number;
			height?: number;
			avg_frame_rate?: string;
		}>;
		format?: { duration?: string };
	};
	const video = value.streams?.find((stream) => stream.codec_type === "video");
	const duration = Number(value.format?.duration);
	if (
		!video?.width ||
		!video.height ||
		!video.avg_frame_rate ||
		!Number.isFinite(duration)
	) {
		throw new Error("无法读取视频信息");
	}
	return {
		width: video.width,
		height: video.height,
		duration,
		frameRate: parseFrameRate({ value: video.avg_frame_rate }),
		hasAudio:
			value.streams?.some((stream) => stream.codec_type === "audio") === true,
	} satisfies VideoMetadata;
}

async function validateSourcePath({ sourcePath }: { sourcePath: string }) {
	if (!path.isAbsolute(sourcePath)) throw new Error("视频文件路径无效");
	const sourceStat = await stat(sourcePath);
	if (!sourceStat.isFile()) throw new Error("视频文件不存在");
}

export async function renderJianyingPersonCutout({
	onProgress,
	signal,
	sourcePath,
	settings,
}: {
	onProgress?: ProgressCallback;
	signal?: AbortSignal;
	sourcePath: string;
	settings: {
		threshold: number;
		temporalSmoothing: number;
		edgeShift: number;
		feather: number;
	};
}): Promise<JianyingPersonCutoutRenderResult> {
	if (signal?.aborted) throw createAbortError();
	onProgress?.({ progress: 2, status: "正在检查视频..." });
	await validateSourcePath({ sourcePath });
	const portraitRuntime = await resolveRuntime();
	if (!portraitRuntime) throw new Error("精细抠像所需的本机模型未就绪");
	const metadata = await probeVideo({ sourcePath });
	const ffmpegPath = await getFFmpegPath();
	const runtime = await selectInferenceRuntime({
		metadata,
		portraitRuntime,
	});
	const outputDirectory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-person-cutout-")
	);
	const outputPath = path.join(outputDirectory, "person-cutout.webm");
	try {
		onProgress?.({ progress: 8, status: "正在检查人物蒙版缓存..." });
		let frameCount = 0;
		const blendImplementation = await executeTemattingWithFallback({
			execute: async (implementation) => {
				const attemptPath = path.join(
					outputDirectory,
					implementation === TEMATTING_NATIVE_METAL_BLEND
						? "person-cutout-native.webm"
						: "person-cutout-compatible.webm"
				);
				const routeAttempt = await executePersonCutoutRouteWithFallback({
					execute: (candidateRuntime) =>
						runCachedPipeline({
							blendImplementation: implementation,
							ffmpegPath,
							metadata,
							onProgress,
							outputPath: attemptPath,
							runtime: candidateRuntime,
							settings,
							signal,
							sourcePath,
							workingDirectory: outputDirectory,
						}),
					onFallback: (error) => {
						console.warn(
							"Advanced person-cutout route failed; retrying portrait GRU.",
							error
						);
						onProgress?.({
							progress: 8,
							status: "物体分析不可用，正在切换精细人物抠像...",
						});
					},
					portraitRuntime,
					selectedRuntime: runtime,
				});
				frameCount = routeAttempt.result;
				await rename(attemptPath, outputPath);
			},
			onFallback: (error) => {
				console.warn(
					"Native matting blend failed; retrying the compatible path.",
					error
				);
				onProgress?.({
					progress: 8,
					status: "原生处理不可用，正在切换兼容模式...",
				});
			},
			preferred: runtime.blendImplementation,
		});
		if (signal?.aborted) throw createAbortError();
		return {
			blendImplementation,
			provider: "jianying-gru-local-v1",
			outputPath,
			width: metadata.width,
			height: metadata.height,
			duration: metadata.duration,
			frameRate: metadata.frameRate,
			frameCount,
			hasAudio: metadata.hasAudio,
			codec: "vp9",
		};
	} catch (error) {
		await rm(outputDirectory, { recursive: true, force: true });
		throw error;
	}
}

export async function releaseJianyingPersonCutout({
	outputPath,
}: {
	outputPath: string;
}) {
	const outputDirectory = path.dirname(outputPath);
	if (!path.basename(outputDirectory).startsWith("qcut-person-cutout-")) return;
	await rm(outputDirectory, { recursive: true, force: true });
}
