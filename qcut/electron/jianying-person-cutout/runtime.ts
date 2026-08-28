import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
	JianyingPersonCutoutRenderResult,
	JianyingPersonCutoutStatus,
} from "../jianying-person-cutout-contract.js";
import { getFFmpegPath, getFFprobePath } from "../ffmpeg/utils.js";
import {
	createPersonCutoutAbortError,
	throwIfPersonCutoutAborted,
	waitForPersonCutoutPromise,
} from "./abort.js";
import { resolveJianyingPersonCutoutBridge } from "./bridge-resolver.js";
import { parsePersonCutoutBridgeTiming } from "./bridge-timing.js";
import {
	resolvePersonCutoutFrameCountExpectation,
	type PersonCutoutFrameCountExpectation,
	validatePersonCutoutAlphaFrameCount,
} from "./frame-count.js";
import { executePersonCutoutInferencePipeline } from "./inference-pipeline.js";
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
	GRU_ONLY_PERSON_CUTOUT_PIPELINE,
	GRU_VISION_PERSON_CUTOUT_PIPELINE,
	SALIENCY_SCRIPT_PERSON_CUTOUT_PIPELINE,
	selectVideoObjectPersonCutoutPipeline,
	type PersonCutoutPipelineDescriptor,
} from "./pipeline-descriptor.js";
import {
	executeTemattingWithFallback,
	selectTemattingBlendImplementation,
} from "./runtime-capability.js";
import {
	buildTemattingOutputMetadata,
	buildTemattingTransparentBlendFilter,
	resolveTemattingOutputProvenance,
	resolveTemattingOutputBlendImplementation,
	TEMATTING_COMPATIBLE_BLEND,
	TEMATTING_NATIVE_METAL_CANARY,
	type TemattingBlendImplementation,
	type TemattingNativeMetalCanaryStatus,
	type TemattingOutputBlendImplementation,
} from "./tematting-blend.js";
import {
	resolveJianyingSaliencyRuntime,
	type JianyingSaliencyRuntime,
} from "./saliency-runtime.js";
import {
	detectPersonCutoutModelRoute,
	resolvePersonCutoutRoutingMode,
	type PersonCutoutRouteDecision,
} from "./model-router.js";
import {
	connectPersonCutoutProcessPipe,
	createPersonCutoutRgbaDecoderArguments,
	waitForPersonCutoutProcesses,
} from "./process-pipeline.js";
import {
	resolveJianyingVideoObjectRuntimeCandidates,
	type JianyingVideoObjectRuntimeCandidate,
} from "./video-object-runtime.js";
import { VideoObjectRuntimeCircuitBreaker } from "./video-object-circuit-breaker.js";
import { createVideoObjectBridgeArguments } from "./video-object-bridge-arguments.js";
import { resolveAutorotatedVideoDimensions } from "./video-display-dimensions.js";

const execFileAsync = promisify(execFile);
const MODEL_SHA256 =
	"101688825490be3704babc7ce49f6d002cdb4fe69e879556b4687ac9006f8596";
const MODEL_TYPE = "4";
const MODEL_NAME = "tt_matting_video_gru_v1.0.model";
const FINE_MODEL_NAME = "tt_matting_video_gru_v1.0+vision-person-v1";
const EFFECT_GRAPH_INACTIVITY_TIMEOUT_MS = 20_000;
const videoObjectRuntimeCircuitBreaker = new VideoObjectRuntimeCircuitBreaker();
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
	frameworkDirectory: string | null;
	libraryPath: string | null;
	modelPath: string;
	modelName: string;
	modelRoute: PersonCutoutModelRoute;
	modelSha256: string;
	processorSha256: string;
	pipelineDescriptor: PersonCutoutPipelineDescriptor;
	saliency?: JianyingSaliencyRuntime;
	videoObject?: JianyingVideoObjectRuntimeCandidate;
}

interface SelectedInferenceRuntime {
	didSelectionFallback: boolean;
	fallbackRuntimes: ReadyRuntime[];
	requestedModelRoute: PersonCutoutModelRoute | "auto";
	routeDecision?: PersonCutoutRouteDecision;
	runtime: ReadyRuntime;
}

interface VideoMetadata {
	width: number;
	height: number;
	duration: number;
	frameCountExpectation: PersonCutoutFrameCountExpectation;
	frameRate: number;
	hasAudio: boolean;
}

interface PersonCutoutProgress {
	progress: number;
	status: string;
}

interface CompletedPersonCutoutInference {
	alphaCache: PersonCutoutMaskCacheEntry;
	blendImplementation: TemattingOutputBlendImplementation;
	completedImplementation: TemattingBlendImplementation;
	nativeMetalCanary: TemattingNativeMetalCanaryStatus;
}

type ProgressCallback = (progress: PersonCutoutProgress) => void;

function status({
	available,
	blendImplementation,
	message,
	pipelineDescriptor = GRU_VISION_PERSON_CUTOUT_PIPELINE,
}: {
	available: boolean;
	blendImplementation: TemattingBlendImplementation;
	message: string;
	pipelineDescriptor?: PersonCutoutPipelineDescriptor;
}): JianyingPersonCutoutStatus {
	return {
		available,
		message,
		provider: pipelineDescriptor.providerId,
		offlineReady: available,
		blendImplementation: resolveTemattingOutputBlendImplementation({
			pipelineDescriptor,
		}),
		nativeMetalCanaryEnabled:
			blendImplementation === TEMATTING_NATIVE_METAL_CANARY,
		pipelineId: pipelineDescriptor.pipelineId,
		refinementProvider: pipelineDescriptor.refinementProvider,
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
	const visionPersonFusionEnabled =
		process.env.QCUT_DISABLE_VISION_PERSON_FUSION !== "1";
	const nativeMetalDiagnosticEnabled =
		process.env.QCUT_ENABLE_NATIVE_MATTING_DIAGNOSTIC === "1";
	const blendImplementation = selectTemattingBlendImplementation({
		arch: process.arch,
		disabled:
			!nativeMetalDiagnosticEnabled ||
			process.env.QCUT_DISABLE_NATIVE_MATTING_METAL === "1",
		librarySha256: libraryHash,
		platform: process.platform,
	});
	const pipelineDescriptor = visionPersonFusionEnabled
		? GRU_VISION_PERSON_CUTOUT_PIPELINE
		: GRU_ONLY_PERSON_CUTOUT_PIPELINE;
	return {
		blendImplementation,
		bridgePath,
		frameworkDirectory,
		libraryPath,
		modelPath,
		modelName: visionPersonFusionEnabled ? FINE_MODEL_NAME : MODEL_NAME,
		modelRoute: "portrait-gru",
		modelSha256: modelHash,
		processorSha256: createHash("sha256")
			.update(bridgeContents)
			.update(libraryHash)
			.update(visionPersonFusionEnabled ? os.release() : "vision-disabled")
			.digest("hex"),
		pipelineDescriptor,
	};
}

function createVideoObjectRuntime({
	settings,
	videoObject,
}: {
	settings: PersonCutoutCacheIdentity["settings"];
	videoObject: JianyingVideoObjectRuntimeCandidate;
}): ReadyRuntime {
	console.info("QCut person-cutout video-object provider candidate", {
		capabilitySha256: videoObject.capabilitySha256,
		providerCapability: videoObject.providerCapability,
		readiness: videoObject.readiness,
	});
	const pipelineDescriptor = selectVideoObjectPersonCutoutPipeline({
		executionBackend: videoObject.executionBackend,
		settings,
	});
	return {
		blendImplementation: TEMATTING_COMPATIBLE_BLEND,
		bridgePath: videoObject.bridgePath,
		frameworkDirectory: videoObject.frameworkDirectory,
		libraryPath: videoObject.libraryPath,
		modelPath: videoObject.modelPath,
		modelName: "video_saliency_seg_bce",
		modelRoute: "video-object",
		modelSha256: videoObject.modelSha256,
		pipelineDescriptor,
		processorSha256: videoObject.processorSha256,
		videoObject,
	};
}

function createSaliencyRuntime({
	saliency,
}: {
	saliency: JianyingSaliencyRuntime;
}): ReadyRuntime {
	return {
		blendImplementation: TEMATTING_COMPATIBLE_BLEND,
		bridgePath: saliency.bridgePath,
		frameworkDirectory: saliency.frameworkDirectory,
		libraryPath: saliency.libraryPath,
		modelPath: saliency.modelDirectory,
		modelName: "saliency_script_for_cc_v1.2",
		modelRoute: "saliency-script",
		modelSha256: saliency.modelSha256,
		pipelineDescriptor: SALIENCY_SCRIPT_PERSON_CUTOUT_PIPELINE,
		processorSha256: saliency.processorSha256,
		saliency,
	};
}

async function selectInferenceRuntime({
	ffmpegPath,
	metadata,
	portraitRuntime,
	settings,
	signal,
	sourcePath,
}: {
	ffmpegPath: string;
	metadata: VideoMetadata;
	portraitRuntime: ReadyRuntime;
	settings: PersonCutoutCacheIdentity["settings"];
	signal?: AbortSignal;
	sourcePath: string;
}): Promise<SelectedInferenceRuntime> {
	throwIfPersonCutoutAborted({ signal });
	const routingMode = resolvePersonCutoutRoutingMode({
		automaticRoutingEnabled:
			process.env.QCUT_DISABLE_PERSON_CUTOUT_AUTO_ROUTE !== "1" &&
			process.env.QCUT_ENABLE_PERSON_CUTOUT_AUTO_ROUTE !== "0",
		requestedRoute: process.env.QCUT_PERSON_CUTOUT_ROUTE,
	});
	if (routingMode === "portrait-gru") {
		return {
			didSelectionFallback: false,
			fallbackRuntimes: [],
			requestedModelRoute: "portrait-gru",
			runtime: portraitRuntime,
		};
	}
	if (routingMode === "video-object" || routingMode === "auto") {
		const resolvedVideoObjects =
			await resolveJianyingVideoObjectRuntimeCandidates({
				height: metadata.height,
				width: metadata.width,
			});
		throwIfPersonCutoutAborted({ signal });
		const retryRejected = process.env.QCUT_RETRY_VIDEO_OBJECT_ROUTE === "1";
		const videoObjects = resolvedVideoObjects.filter(
			(candidate) =>
				retryRejected ||
				!videoObjectRuntimeCircuitBreaker.isOpen({
					capabilitySha256: candidate.capabilitySha256,
				})
		);
		const didProviderSelectionFallback =
			videoObjects.length !== resolvedVideoObjects.length;
		if (didProviderSelectionFallback) {
			console.info(
				"QCut person-cutout skipped a video-object runtime rejected earlier in this app session."
			);
		}
		const videoObjectRuntimes = videoObjects.map((videoObject) =>
			createVideoObjectRuntime({ settings, videoObject })
		);
		const videoObjectRuntime = videoObjectRuntimes[0];
		if (routingMode === "auto") {
			const routeDecision = await detectPersonCutoutModelRoute({
				duration: metadata.duration,
				ffmpegPath,
				frameRate: metadata.frameRate,
				height: metadata.height,
				signal,
				sourcePath,
				videoObjectCandidateAvailable: Boolean(videoObjectRuntime),
				width: metadata.width,
			});
			console.info("QCut person-cutout automatic route", routeDecision);
			const selectedVideoObject =
				routeDecision.route === "video-object" ? videoObjectRuntime : undefined;
			return {
				didSelectionFallback:
					Boolean(selectedVideoObject) && didProviderSelectionFallback,
				fallbackRuntimes: selectedVideoObject
					? videoObjectRuntimes.slice(1)
					: [],
				requestedModelRoute: "auto",
				routeDecision,
				runtime: selectedVideoObject ?? portraitRuntime,
			};
		}
		if (!videoObjectRuntime) {
			console.warn(
				"Jianying video-object runtime is unavailable; falling back to portrait GRU."
			);
			return {
				didSelectionFallback: true,
				fallbackRuntimes: [],
				requestedModelRoute: "video-object",
				runtime: portraitRuntime,
			};
		}
		return {
			didSelectionFallback: didProviderSelectionFallback,
			fallbackRuntimes: videoObjectRuntimes.slice(1),
			requestedModelRoute: "video-object",
			runtime: videoObjectRuntime,
		};
	}
	const saliency = await resolveJianyingSaliencyRuntime();
	throwIfPersonCutoutAborted({ signal });
	if (!saliency) {
		console.warn(
			"Jianying saliency runtime is unavailable; falling back to portrait GRU."
		);
		return {
			didSelectionFallback: true,
			fallbackRuntimes: [],
			requestedModelRoute: "saliency-script",
			runtime: portraitRuntime,
		};
	}
	return {
		didSelectionFallback: false,
		fallbackRuntimes: [],
		requestedModelRoute: "saliency-script",
		runtime: createSaliencyRuntime({ saliency }),
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
				pipelineDescriptor: runtime.pipelineDescriptor,
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
	libraryPath: string | null;
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
		return createVideoObjectBridgeArguments({
			height,
			inputPath,
			outputPath,
			settings,
			videoObject: runtime.videoObject,
			width,
		});
	}
	if (runtime.modelRoute === "saliency-script") {
		if (!runtime.saliency || !libraryPath) {
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
	if (!libraryPath) {
		throw new Error("剪映人物抠像运行时不完整");
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
	];
	if (
		runtime.pipelineDescriptor.pipelineId ===
		GRU_VISION_PERSON_CUTOUT_PIPELINE.pipelineId
	) {
		args.push("--vision-person-fusion");
	}
	args.push("--timing-json");
	if (blendImplementation === TEMATTING_NATIVE_METAL_CANARY) {
		args.push("--native-metal-canary");
	}
	return args;
}

export function createPersonCutoutBridgeEnvironment({
	frameworkDirectory,
	sourceEnvironment = process.env,
}: {
	frameworkDirectory: string | null;
	sourceEnvironment?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
	const environment = { ...sourceEnvironment };
	for (const key of Object.keys(environment)) {
		if (key.startsWith("DYLD_")) Reflect.deleteProperty(environment, key);
	}
	Reflect.deleteProperty(environment, "QCUT_VIDEO_OBJECT_RESET_FRAMES");
	if (frameworkDirectory) {
		environment.DYLD_LIBRARY_PATH = frameworkDirectory;
	}
	return environment;
}

function clampProgress({ value }: { value: number }) {
	return Math.max(0, Math.min(100, Math.round(value)));
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
	if (signal?.aborted) return Promise.reject(createPersonCutoutAbortError());
	const decoder = spawn(
		ffmpegPath,
		createPersonCutoutRgbaDecoderArguments({ sourcePath }),
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
			env: createPersonCutoutBridgeEnvironment({
				frameworkDirectory: runtime.frameworkDirectory,
			}),
			stdio: ["pipe", "ignore", "pipe"],
		}
	);
	connectPersonCutoutProcessPipe({ consumer: bridge, producer: decoder });
	const isPortraitGru = runtime.modelRoute === "portrait-gru";
	const bridgeLabel = isPortraitGru ? "人物蒙版预计算" : "剪映主体分析";
	const progressStatus = isPortraitGru
		? "正在预计算人物蒙版"
		: "正在分析人物主体";
	let bridgeText = "";
	let lastProgress = 8;
	return waitForPersonCutoutProcesses({
		inactivityTimeoutMs: isPortraitGru
			? undefined
			: EFFECT_GRAPH_INACTIVITY_TIMEOUT_MS,
		processes: [
			{ child: decoder, label: "视频解码" },
			{ child: bridge, label: bridgeLabel },
		],
		signal,
		onStderr: ({ child, chunk }) => {
			if (child !== bridge) return;
			bridgeText += chunk.toString("utf8");
			const lines = bridgeText.split("\n");
			bridgeText = lines.pop() ?? "";
			for (const line of lines) {
				const timing = parsePersonCutoutBridgeTiming({ line });
				if (timing) {
					console.info("QCut person-cutout bridge timing", timing);
					continue;
				}
				const match = /progress frame=(\d+) total=(\d+)/.exec(line);
				if (!match) continue;
				const frame = Number(match[1]);
				const reportedTotal = Number(match[2]);
				const total =
					reportedTotal > 0
						? reportedTotal
						: metadata.frameCountExpectation.count;
				const progress = clampProgress({ value: 8 + (frame / total) * 70 });
				if (progress <= lastProgress) continue;
				lastProgress = progress;
				onProgress?.({
					progress,
					status: `${progressStatus}（${frame}/${total} 帧）...`,
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
	sourcePath,
}: {
	blendImplementation: TemattingBlendImplementation;
	ffmpegPath: string;
	identity: PersonCutoutCacheIdentity;
	metadata: VideoMetadata;
	onProgress?: ProgressCallback;
	runtime: ReadyRuntime;
	settings: PersonCutoutCacheIdentity["settings"];
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
			sourcePath,
			workingDirectory: build.directory,
		});
		const alphaStat = await stat(build.alphaPath);
		const bytesPerFrame = metadata.width * metadata.height;
		if (alphaStat.size === 0 || alphaStat.size % bytesPerFrame !== 0) {
			throw new Error("人物蒙版帧不完整，已停止导出");
		}
		const frameCount = alphaStat.size / bytesPerFrame;
		validatePersonCutoutAlphaFrameCount({
			actualFrameCount: frameCount,
			expectation: metadata.frameCountExpectation,
		});
		return await commitPersonCutoutMaskCache({
			buildDirectory: build.directory,
			frameCount,
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
		pipelineDescriptor: runtime.pipelineDescriptor,
		processorSha256: runtime.processorSha256,
		settings,
		signal,
		sourcePath,
		width: metadata.width,
	});
	const cached = await inspectPersonCutoutMaskCache({ identity, signal });
	if (cached) {
		onProgress?.({ progress: 78, status: "人物蒙版缓存完整，正在导出..." });
		return cached;
	}
	const cacheKey = createPersonCutoutCacheKey({ identity });
	const activeBuild = activeMaskCacheBuilds.get(cacheKey);
	if (activeBuild) {
		return waitForPersonCutoutPromise({ promise: activeBuild, signal });
	}
	const build = buildMaskCache({
		blendImplementation,
		ffmpegPath,
		identity,
		metadata,
		onProgress,
		runtime,
		settings,
		sourcePath,
	});
	activeMaskCacheBuilds.set(cacheKey, build);
	const clearActiveBuild = () => {
		if (activeMaskCacheBuilds.get(cacheKey) === build) {
			activeMaskCacheBuilds.delete(cacheKey);
		}
	};
	void build.then(clearActiveBuild, clearActiveBuild);
	return waitForPersonCutoutPromise({ promise: build, signal });
}

function runTransparentEncoder({
	alphaCache,
	blendImplementation,
	ffmpegPath,
	metadata,
	nativeMetalCanary,
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
	nativeMetalCanary: TemattingNativeMetalCanaryStatus;
	onProgress?: ProgressCallback;
	outputPath: string;
	runtime: ReadyRuntime;
	signal?: AbortSignal;
	sourcePath: string;
	workingDirectory: string;
}) {
	if (signal?.aborted) return Promise.reject(createPersonCutoutAbortError());
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
				nativeMetalCanary,
				pipelineDescriptor: runtime.pipelineDescriptor,
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
	return waitForPersonCutoutProcesses({
		processes: [{ child: encoder, label: "透明视频编码" }],
		signal,
	});
}

async function preparePersonCutoutInference({
	ffmpegPath,
	metadata,
	onProgress,
	runtime,
	settings,
	signal,
	sourcePath,
}: {
	ffmpegPath: string;
	metadata: VideoMetadata;
	onProgress?: ProgressCallback;
	runtime: ReadyRuntime;
	settings: PersonCutoutCacheIdentity["settings"];
	signal?: AbortSignal;
	sourcePath: string;
}): Promise<CompletedPersonCutoutInference> {
	let alphaCache: PersonCutoutMaskCacheEntry | null = null;
	const completedImplementation = await executeTemattingWithFallback({
		execute: async (implementation) => {
			alphaCache = await ensureMaskCache({
				blendImplementation: implementation,
				ffmpegPath,
				metadata,
				onProgress,
				runtime,
				settings,
				signal,
				sourcePath,
			});
		},
		onFallback: (error) => {
			console.warn(
				"Native matting validation failed; retrying the compatible path.",
				error
			);
			onProgress?.({
				progress: 8,
				status: "硬件校验未通过，正在切换稳定模式...",
			});
		},
		preferred: runtime.blendImplementation,
	});
	if (!alphaCache) throw new Error("人物蒙版推理未生成缓存");
	const provenance = resolveTemattingOutputProvenance({
		completedImplementation,
		pipelineDescriptor: runtime.pipelineDescriptor,
		preferredImplementation: runtime.blendImplementation,
	});
	return {
		alphaCache,
		blendImplementation: provenance.blendImplementation,
		completedImplementation,
		nativeMetalCanary: provenance.nativeMetalCanary,
	};
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

async function countVideoFrames({
	ffprobePath,
	signal,
	sourcePath,
}: {
	ffprobePath: string;
	signal?: AbortSignal;
	sourcePath: string;
}) {
	const { stdout } = await execFileAsync(
		ffprobePath,
		[
			"-v",
			"error",
			"-count_frames",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=nb_read_frames",
			"-of",
			"default=noprint_wrappers=1:nokey=1",
			sourcePath,
		],
		{ maxBuffer: 4 * 1024 * 1024, signal }
	);
	return stdout.trim().split(/\s+/)[0];
}

async function probeVideo({
	signal,
	sourcePath,
}: {
	signal?: AbortSignal;
	sourcePath: string;
}) {
	const ffprobePath = await getFFprobePath();
	const { stdout } = await execFileAsync(
		ffprobePath,
		[
			"-v",
			"error",
			"-show_entries",
			"stream=codec_type,width,height,avg_frame_rate,nb_frames:stream_tags=rotate:stream_side_data=rotation:format=duration",
			"-of",
			"json",
			sourcePath,
		],
		{ maxBuffer: 4 * 1024 * 1024, signal }
	);
	const value = JSON.parse(stdout) as {
		streams?: Array<{
			codec_type?: string;
			width?: number;
			height?: number;
			avg_frame_rate?: string;
			nb_frames?: string;
			side_data_list?: Array<{ rotation?: number | string }>;
			tags?: { rotate?: string };
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
	const displayDimensions = resolveAutorotatedVideoDimensions({
		height: video.height,
		sideDataList: video.side_data_list,
		tags: video.tags,
		width: video.width,
	});
	const frameRate = parseFrameRate({ value: video.avg_frame_rate });
	const declaredFrameCount = Number(video.nb_frames);
	const readFrames =
		Number.isSafeInteger(declaredFrameCount) && declaredFrameCount > 0
			? undefined
			: await countVideoFrames({ ffprobePath, signal, sourcePath });
	return {
		width: displayDimensions.width,
		height: displayDimensions.height,
		duration,
		frameCountExpectation: resolvePersonCutoutFrameCountExpectation({
			declaredFrames: video.nb_frames,
			duration,
			frameRate,
			readFrames,
		}),
		frameRate,
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
	if (signal?.aborted) throw createPersonCutoutAbortError();
	onProgress?.({ progress: 2, status: "正在检查视频..." });
	await validateSourcePath({ sourcePath });
	const portraitRuntime = await resolveRuntime();
	throwIfPersonCutoutAborted({ signal });
	if (!portraitRuntime) throw new Error("精细抠像所需的本机模型未就绪");
	const metadata = await probeVideo({ signal, sourcePath });
	throwIfPersonCutoutAborted({ signal });
	const ffmpegPath = await getFFmpegPath();
	const selection = await selectInferenceRuntime({
		ffmpegPath,
		metadata,
		portraitRuntime,
		settings,
		signal,
		sourcePath,
	});
	const outputDirectory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-person-cutout-")
	);
	const outputPath = path.join(outputDirectory, "person-cutout.webm");
	try {
		onProgress?.({ progress: 8, status: "正在检查人物蒙版缓存..." });
		const pipelineAttempt = await executePersonCutoutInferencePipeline({
			executeInference: async (candidateRuntime) =>
				preparePersonCutoutInference({
					ffmpegPath,
					metadata,
					onProgress,
					runtime: candidateRuntime,
					settings,
					signal,
					sourcePath,
				}),
			fallbackRuntimes: selection.fallbackRuntimes,
			finalize: async ({ inferenceResult, runtime }) => {
				await runTransparentEncoder({
					alphaCache: inferenceResult.alphaCache,
					blendImplementation: inferenceResult.completedImplementation,
					ffmpegPath,
					metadata,
					nativeMetalCanary: inferenceResult.nativeMetalCanary,
					onProgress,
					outputPath,
					runtime,
					signal,
					sourcePath,
					workingDirectory: outputDirectory,
				});
				return inferenceResult.alphaCache.frameCount;
			},
			onFallback: ({ error, failedRuntime, nextRuntime }) => {
				const videoObjectCandidate = failedRuntime.videoObject;
				if (
					failedRuntime.modelRoute === "video-object" &&
					videoObjectCandidate
				) {
					const circuitOpened = videoObjectRuntimeCircuitBreaker.reject({
						capabilitySha256: videoObjectCandidate.capabilitySha256,
						error,
					});
					if (circuitOpened) {
						console.warn(
							"QCut rejected the video-object candidate after its confirmed hostless Alpha signature.",
							{
								capabilitySha256: videoObjectCandidate.capabilitySha256,
								providerCapability: videoObjectCandidate.providerCapability,
							}
						);
					}
				}
				if (nextRuntime.modelRoute === "video-object") {
					console.warn(
						"Video-object provider failed; retrying the next pinned provider.",
						error
					);
					onProgress?.({
						progress: 8,
						status: "主体分析引擎不可用，正在切换备用引擎...",
					});
					return;
				}
				console.warn(
					"Advanced person-cutout route failed; retrying portrait GRU.",
					error
				);
				onProgress?.({
					progress: 8,
					status: "主体分析不可用，正在切换精细人物抠像...",
				});
			},
			portraitRuntime,
			selectedRuntime: selection.runtime,
		});
		if (signal?.aborted) throw createPersonCutoutAbortError();
		const { inferenceAttempt } = pipelineAttempt;
		const actualRuntime = inferenceAttempt.runtime;
		return {
			blendImplementation: inferenceAttempt.result.blendImplementation,
			didModelRouteFallback:
				selection.didSelectionFallback || inferenceAttempt.didFallback,
			modelRoute: actualRuntime.modelRoute,
			nativeMetalCanary: inferenceAttempt.result.nativeMetalCanary,
			pipelineId: actualRuntime.pipelineDescriptor.pipelineId,
			provider: actualRuntime.pipelineDescriptor.providerId,
			refinementProvider: actualRuntime.pipelineDescriptor.refinementProvider,
			requestedModelRoute: selection.requestedModelRoute,
			outputPath,
			width: metadata.width,
			height: metadata.height,
			duration: metadata.duration,
			frameRate: metadata.frameRate,
			frameCount: pipelineAttempt.finalResult,
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
