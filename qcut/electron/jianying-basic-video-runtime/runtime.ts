import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	JianyingBasicVideoProgress,
	JianyingBasicVideoStatus,
	JianyingDeflickerRequest,
	JianyingDeflickerResult,
} from "../jianying-basic-video-contract.js";
import { JIANYING_PRIVATE_DEFLICKER_ROUTE } from "../jianying-basic-video-contract.js";
import { getFFmpegPath, getFFprobePath } from "../ffmpeg/paths.js";
import { resolveJianyingDeflickerHost } from "./bridge-resolver.js";
import { runDeflickerPipeline } from "./process-pipeline.js";
import { verifyJianyingBasicVideoRuntime } from "./runtime-assets.js";
import {
	inspectDeflickerVideo,
	requireDeflickerSourceFile,
	type DeflickerVideoMetadata,
} from "./video-input.js";

type ProgressCallback = (
	progress: Omit<JianyingBasicVideoProgress, "taskId">
) => void;

function validateRequest({ request }: { request: JianyingDeflickerRequest }) {
	if (
		!request ||
		typeof request !== "object" ||
		typeof request.taskId !== "string" ||
		!request.taskId.trim() ||
		request.taskId.length > 200
	) {
		throw new Error("防闪烁任务缺少有效 taskId");
	}
	if (
		typeof request.sourcePath !== "string" ||
		!path.isAbsolute(request.sourcePath)
	) {
		throw new Error("防闪烁素材必须使用绝对路径");
	}
	if (
		!Number.isInteger(request.strength) ||
		request.strength < 1 ||
		request.strength > 100
	) {
		throw new Error("防闪烁强度必须是 1 到 100 的整数");
	}
	return request;
}

function cacheRoot() {
	return path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"JianyingBasicVideo",
		"deflicker"
	);
}

async function isValidCachedOutput({ outputPath }: { outputPath: string }) {
	try {
		const metadata = await stat(outputPath);
		return metadata.isFile() && metadata.size > 1024;
	} catch {
		return false;
	}
}

function outputMatchesSource({
	output,
	source,
}: {
	output: DeflickerVideoMetadata;
	source: DeflickerVideoMetadata;
}) {
	const durationTolerance = Math.max(0.1, 2 / source.fps);
	return (
		output.width === source.width &&
		output.height === source.height &&
		Math.abs(output.fps - source.fps) < 0.001 &&
		Math.abs(output.durationSeconds - source.durationSeconds) <=
			durationTolerance &&
		(!source.hasAudio || output.hasAudio)
	);
}

function resultFromMetadata({
	assets,
	cacheHit,
	frameCount,
	metadata,
	outputPath,
	strength,
}: {
	assets: Awaited<ReturnType<typeof verifyJianyingBasicVideoRuntime>>;
	cacheHit: boolean;
	frameCount: number;
	metadata: DeflickerVideoMetadata;
	outputPath: string;
	strength: number;
}): JianyingDeflickerResult {
	return {
		cacheHit,
		durationSeconds: metadata.durationSeconds,
		fps: metadata.fps,
		frameCount,
		hasAudio: metadata.hasAudio,
		height: metadata.height,
		outputPath,
		provider: "jianying-private-cache",
		route: JIANYING_PRIVATE_DEFLICKER_ROUTE,
		runtime: {
			appVersion: assets.appVersion,
			deflickerModelSha256: assets.deflickerModelSha256,
			lensSha256: assets.lensSha256,
			localOnly: true,
		},
		strength,
		width: metadata.width,
	};
}

export async function inspectJianyingBasicVideo(): Promise<JianyingBasicVideoStatus> {
	const platformSupported =
		process.platform === "darwin" && process.arch === "arm64";
	const base = {
		available: false,
		localOnly: true as const,
		offlineReady: false,
		platformSupported,
		route: JIANYING_PRIVATE_DEFLICKER_ROUTE,
	};
	if (!platformSupported) {
		return {
			...base,
			message: "本机剪映防闪烁仅支持 Apple Silicon macOS",
		};
	}
	try {
		const assets = await verifyJianyingBasicVideoRuntime();
		const hostPath = await resolveJianyingDeflickerHost({
			frameworkDirectory: assets.frameworkDirectory,
			runtimeIdentity: assets.runtimeIdentity,
		});
		if (!hostPath) {
			return {
				...base,
				appVersion: assets.appVersion,
				deflickerModelSha256: assets.deflickerModelSha256,
				lensSha256: assets.lensSha256,
				message: "本机剪映缓存已校验，但防闪烁桥不可用",
			};
		}
		return {
			...base,
			appVersion: assets.appVersion,
			available: true,
			deflickerModelSha256: assets.deflickerModelSha256,
			lensSha256: assets.lensSha256,
			message: "剪映 11.3.0 防闪烁本机缓存已就绪",
			offlineReady: true,
		};
	} catch (error) {
		return {
			...base,
			message:
				error instanceof Error ? error.message : "无法校验本机剪映防闪烁缓存",
		};
	}
}

export async function deflickerWithJianyingRuntime({
	onProgress,
	request: requestValue,
	signal,
}: {
	onProgress?: ProgressCallback;
	request: JianyingDeflickerRequest;
	signal?: AbortSignal;
}): Promise<JianyingDeflickerResult> {
	const request = validateRequest({ request: requestValue });
	const report = ({
		progress,
		stage,
		status,
	}: Omit<JianyingBasicVideoProgress, "taskId">) =>
		onProgress?.({ progress, stage, status });
	report({ progress: 2, stage: "verify", status: "正在校验本机剪映缓存" });
	const sourceMetadata = await requireDeflickerSourceFile({
		sourcePath: request.sourcePath,
	});
	const assets = await verifyJianyingBasicVideoRuntime();
	if (signal?.aborted) {
		const error = new Error("防闪烁任务已取消");
		error.name = "AbortError";
		throw error;
	}
	report({ progress: 12, stage: "prepare", status: "正在准备隔离运行时" });
	const [hostPath, ffprobePath] = await Promise.all([
		resolveJianyingDeflickerHost({
			frameworkDirectory: assets.frameworkDirectory,
			runtimeIdentity: assets.runtimeIdentity,
		}),
		getFFprobePath(),
	]);
	if (!hostPath) throw new Error("本机剪映防闪烁桥不可用");
	const metadata = await inspectDeflickerVideo({
		ffprobePath,
		signal,
		sourcePath: request.sourcePath,
	});
	const cacheKey = createHash("sha256")
		.update(path.resolve(request.sourcePath))
		.update(String(sourceMetadata.size))
		.update(String(sourceMetadata.mtimeMs))
		.update(String(request.strength))
		.update(assets.runtimeIdentity)
		.update(JIANYING_PRIVATE_DEFLICKER_ROUTE)
		.digest("hex");
	const outputDirectory = cacheRoot();
	const outputPath = path.join(outputDirectory, `${cacheKey}.mp4`);
	if (await isValidCachedOutput({ outputPath })) {
		try {
			const cachedMetadata = await inspectDeflickerVideo({
				ffprobePath,
				signal,
				sourcePath: outputPath,
			});
			if (!outputMatchesSource({ output: cachedMetadata, source: metadata })) {
				throw new Error("缓存媒体规格与原片不一致");
			}
			report({ progress: 100, stage: "publish", status: "已复用本机处理缓存" });
			return resultFromMetadata({
				assets,
				cacheHit: true,
				frameCount: cachedMetadata.frameCount,
				metadata: cachedMetadata,
				outputPath,
				strength: request.strength,
			});
		} catch (error) {
			if (signal?.aborted) throw error;
			await rm(outputPath, { force: true });
		}
	}
	await mkdir(outputDirectory, { mode: 0o700, recursive: true });
	const temporaryPath = path.join(
		outputDirectory,
		`${cacheKey}.${process.pid}.${randomUUID()}.partial.mp4`
	);
	try {
		report({ progress: 20, stage: "decode", status: "正在解码原始画面" });
		const pipeline = await runDeflickerPipeline({
			ffmpegPath: getFFmpegPath(),
			frameworkDirectory: assets.frameworkDirectory,
			hostPath,
			lensPath: assets.lensPath,
			metadata,
			modelPath: assets.deflickerModelPath,
			onFrameProgress: (processedFrames) => {
				const fraction = Math.min(1, processedFrames / metadata.frameCount);
				report({
					progress: Math.round(25 + fraction * 65),
					stage: "process",
					status: `正在处理第 ${processedFrames} 帧`,
				});
			},
			outputPath: temporaryPath,
			signal,
			sourcePath: request.sourcePath,
			strength: request.strength,
		});
		report({ progress: 94, stage: "encode", status: "正在校验高清输出" });
		if (!(await isValidCachedOutput({ outputPath: temporaryPath }))) {
			throw new Error("防闪烁输出文件无效");
		}
		const outputMetadata = await inspectDeflickerVideo({
			ffprobePath,
			signal,
			sourcePath: temporaryPath,
		});
		if (!outputMatchesSource({ output: outputMetadata, source: metadata })) {
			throw new Error("防闪烁输出媒体规格与原片不一致");
		}
		await rm(outputPath, { force: true });
		await rename(temporaryPath, outputPath);
		report({ progress: 100, stage: "publish", status: "本机防闪烁处理完成" });
		return resultFromMetadata({
			assets,
			cacheHit: false,
			frameCount: pipeline.frameCount,
			metadata: outputMetadata,
			outputPath,
			strength: request.strength,
		});
	} finally {
		await rm(temporaryPath, { force: true });
	}
}
