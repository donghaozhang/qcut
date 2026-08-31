import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	JianyingMotionTrackingProgress,
	JianyingMotionTrackingRect,
	JianyingMotionTrackingRequest,
	JianyingMotionTrackingResult,
	JianyingMotionTrackingStatus,
} from "../jianying-motion-tracking-contract.js";
import { getFFmpegPath, getFFprobePath } from "../ffmpeg/paths.js";
import { resolveJianyingMotionTrackingBridge } from "./bridge-resolver.js";
import { validateNativeTrackingResult } from "./native-result.js";
import {
	motionTrackingAbortError,
	runMotionTrackingProcess,
} from "./process-runner.js";
import {
	defaultTrackingRuntimeRoot,
	JIANYING_MOTION_TRACKING_ROUTE,
	verifyTrackingRuntimeSnapshot,
} from "./runtime-assets.js";
import {
	anchorFrameIndex,
	buildRgbDecodeArguments,
	inspectMotionTrackingVideo,
	requireBoundedRawDecode,
	requireMotionTrackingSourceFile,
	trackingDimensions,
} from "./video-input.js";

const NETWORK_DENY_PROFILE = "(version 1) (allow default) (deny network*)";

type ProgressCallback = (
	progress: Omit<JianyingMotionTrackingProgress, "taskId">
) => void;

function runtimeRoot() {
	return path.resolve(
		process.env.QCUT_JIANYING_MOTION_TRACKING_RUNTIME ??
			defaultTrackingRuntimeRoot()
	);
}

function requireFiniteNumber({
	label,
	maximum,
	minimum,
	value,
}: {
	label: string;
	maximum: number;
	minimum: number;
	value: number;
}) {
	if (!Number.isFinite(value) || value < minimum || value > maximum) {
		throw new Error(`${label} 超出允许范围`);
	}
	return value;
}

function validateRect({ rect }: { rect: JianyingMotionTrackingRect }) {
	if (!rect || typeof rect !== "object") {
		throw new Error("运动跟踪任务缺少初始框");
	}
	const left = requireFiniteNumber({
		label: "初始框 left",
		maximum: 1,
		minimum: 0,
		value: rect.left,
	});
	const top = requireFiniteNumber({
		label: "初始框 top",
		maximum: 1,
		minimum: 0,
		value: rect.top,
	});
	const right = requireFiniteNumber({
		label: "初始框 right",
		maximum: 1,
		minimum: 0,
		value: rect.right,
	});
	const bottom = requireFiniteNumber({
		label: "初始框 bottom",
		maximum: 1,
		minimum: 0,
		value: rect.bottom,
	});
	if (left >= right || top >= bottom) {
		throw new Error("初始框必须具有正面积");
	}
	return { bottom, left, right, top };
}

function validateRequest({
	request,
}: {
	request: JianyingMotionTrackingRequest;
}) {
	if (
		!request ||
		typeof request !== "object" ||
		typeof request.taskId !== "string" ||
		!request.taskId.trim() ||
		request.taskId.length > 200
	) {
		throw new Error("运动跟踪任务缺少有效 taskId");
	}
	if (
		typeof request.sourcePath !== "string" ||
		!path.isAbsolute(request.sourcePath)
	) {
		throw new Error("运动跟踪素材必须使用绝对路径");
	}
	if (
		request.direction !== "backward" &&
		request.direction !== "both" &&
		request.direction !== "forward"
	) {
		throw new Error("运动跟踪方向无效");
	}
	const rangeStartTimeSeconds = requireFiniteNumber({
		label: "跟踪起点",
		maximum: 24 * 60 * 60,
		minimum: 0,
		value: request.rangeStartTimeSeconds,
	});
	const rangeEndTimeSeconds = requireFiniteNumber({
		label: "跟踪终点",
		maximum: 24 * 60 * 60,
		minimum: 0,
		value: request.rangeEndTimeSeconds,
	});
	const anchorTimeSeconds = requireFiniteNumber({
		label: "跟踪锚点",
		maximum: 24 * 60 * 60,
		minimum: 0,
		value: request.anchorTimeSeconds,
	});
	if (
		rangeEndTimeSeconds <= rangeStartTimeSeconds ||
		anchorTimeSeconds < rangeStartTimeSeconds ||
		anchorTimeSeconds > rangeEndTimeSeconds
	) {
		throw new Error("运动跟踪时间范围无效");
	}
	return {
		...request,
		anchorTimeSeconds,
		initialRect: validateRect({ rect: request.initialRect }),
		rangeEndTimeSeconds,
		rangeStartTimeSeconds,
	};
}

async function jianyingProcesses() {
	const result = await runMotionTrackingProcess({
		acceptedExitCodes: [0, 1],
		command: "/usr/bin/pgrep",
		args: ["-fal", "^/Applications/VideoFusion-macOS\\.app/"],
		timeoutMs: 5000,
	});
	return result.stdout.trim().split("\n").filter(Boolean);
}

async function requireJianyingStopped() {
	if ((await jianyingProcesses()).length > 0) {
		throw new Error("请先完全退出剪映，再运行本机 Bingo 运动跟踪");
	}
}

export async function inspectJianyingMotionTracking(): Promise<JianyingMotionTrackingStatus> {
	const platformSupported =
		process.platform === "darwin" && process.arch === "arm64";
	const base = {
		available: false,
		localOnly: true as const,
		offlineReady: false,
		platformSupported,
		route: JIANYING_MOTION_TRACKING_ROUTE,
	};
	if (!platformSupported) {
		return {
			...base,
			message: "本机 Bingo 运动跟踪仅支持 Apple Silicon macOS",
		};
	}
	const selectedRuntimeRoot = runtimeRoot();
	try {
		const manifest = await verifyTrackingRuntimeSnapshot({
			snapshotPath: selectedRuntimeRoot,
		});
		const bridgePath = await resolveJianyingMotionTrackingBridge({
			runtimeRoot: selectedRuntimeRoot,
			runtimeSha256: manifest.core.sha256,
		});
		if (!bridgePath) {
			return {
				...base,
				appVersion: manifest.app.version,
				coreSha256: manifest.core.sha256,
				coreUuid: manifest.core.uuid,
				message: "私有 runtime 已缓存，但本机桥不可用",
				runtimeRoot: selectedRuntimeRoot,
			};
		}
		const running = (await jianyingProcesses()).length > 0;
		return {
			...base,
			available: !running,
			appVersion: manifest.app.version,
			coreSha256: manifest.core.sha256,
			coreUuid: manifest.core.uuid,
			message: running
				? "私有 runtime 已就绪；退出剪映后可以跟踪"
				: "剪映 11.3.0 Bingo 私有 oracle 已就绪",
			offlineReady: true,
			runtimeRoot: selectedRuntimeRoot,
		};
	} catch (error) {
		return {
			...base,
			message:
				error instanceof Error ? error.message : "无法校验本机运动跟踪 runtime",
			runtimeRoot: selectedRuntimeRoot,
		};
	}
}

export async function trackWithJianyingMotionRuntime({
	onProgress,
	request: requestValue,
	signal,
}: {
	onProgress?: ProgressCallback;
	request: JianyingMotionTrackingRequest;
	signal?: AbortSignal;
}): Promise<JianyingMotionTrackingResult> {
	const request = validateRequest({ request: requestValue });
	const report = ({
		progress,
		stage,
		status,
	}: Omit<JianyingMotionTrackingProgress, "taskId">) =>
		onProgress?.({ progress, stage, status });
	report({ progress: 2, stage: "verify", status: "正在校验私有 runtime" });
	await Promise.all([
		requireMotionTrackingSourceFile({ sourcePath: request.sourcePath }),
		requireJianyingStopped(),
	]);
	const selectedRuntimeRoot = runtimeRoot();
	const manifest = await verifyTrackingRuntimeSnapshot({
		snapshotPath: selectedRuntimeRoot,
	});
	if (signal?.aborted) throw motionTrackingAbortError();
	report({ progress: 12, stage: "prepare", status: "正在准备本机跟踪桥" });
	const [bridgePath, ffprobePath] = await Promise.all([
		resolveJianyingMotionTrackingBridge({
			runtimeRoot: selectedRuntimeRoot,
			runtimeSha256: manifest.core.sha256,
		}),
		getFFprobePath(),
	]);
	if (!bridgePath) throw new Error("本机运动跟踪桥不可用");
	const metadata = await inspectMotionTrackingVideo({
		ffprobePath,
		signal,
		sourcePath: request.sourcePath,
	});
	const dimensions = trackingDimensions(metadata);
	requireBoundedRawDecode({
		durationSeconds:
			request.rangeEndTimeSeconds - request.rangeStartTimeSeconds,
		fps: metadata.fps,
		height: dimensions.height,
		width: dimensions.width,
	});
	const workDirectory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-motion-tracking-")
	);
	try {
		const rawPath = path.join(workDirectory, "frames.rgb24");
		const nativeOutputPath = path.join(workDirectory, "track.json");
		report({ progress: 20, stage: "decode", status: "正在解码可见片段" });
		await runMotionTrackingProcess({
			command: getFFmpegPath(),
			args: buildRgbDecodeArguments({
				rangeEndTimeSeconds: request.rangeEndTimeSeconds,
				rangeStartTimeSeconds: request.rangeStartTimeSeconds,
				rawPath,
				sourcePath: request.sourcePath,
				height: dimensions.height,
				width: dimensions.width,
			}),
			signal,
		});
		const rawMetadata = await stat(rawPath);
		const frameBytes = dimensions.width * dimensions.height * 3;
		if (rawMetadata.size === 0 || rawMetadata.size % frameBytes !== 0) {
			throw new Error("解码结果包含不完整视频帧");
		}
		const frameCount = rawMetadata.size / frameBytes;
		const anchorFrame = anchorFrameIndex({
			anchorTimeSeconds: request.anchorTimeSeconds,
			fps: metadata.fps,
			frameCount,
			rangeStartTimeSeconds: request.rangeStartTimeSeconds,
		});
		report({ progress: 48, stage: "track", status: "正在运行 Bingo 跟踪" });
		await runMotionTrackingProcess({
			command: "/usr/bin/sandbox-exec",
			args: [
				"-p",
				NETWORK_DENY_PROFILE,
				bridgePath,
				selectedRuntimeRoot,
				rawPath,
				nativeOutputPath,
				String(dimensions.width),
				String(dimensions.height),
				String(metadata.fps),
				String(anchorFrame),
				request.direction,
				String(request.initialRect.left),
				String(request.initialRect.top),
				String(request.initialRect.right),
				String(request.initialRect.bottom),
			],
			signal,
		});
		report({ progress: 94, stage: "publish", status: "正在整理逐帧轨迹" });
		const nativeResult = validateNativeTrackingResult({
			anchorFrame,
			direction: request.direction,
			fps: metadata.fps,
			frameCount,
			height: dimensions.height,
			value: JSON.parse(await readFile(nativeOutputPath, "utf8")) as unknown,
			width: dimensions.width,
		});
		const rangeOffsetUs = Math.round(request.rangeStartTimeSeconds * 1_000_000);
		report({ progress: 100, stage: "publish", status: "运动跟踪完成" });
		return {
			...nativeResult,
			direction: request.direction,
			route: JIANYING_MOTION_TRACKING_ROUTE,
			runtime: {
				appVersion: manifest.app.version,
				coreSha256: manifest.core.sha256,
				coreUuid: manifest.core.uuid,
				localOnly: true,
			},
			samples: nativeResult.samples.map((sample) => ({
				...sample,
				sourceTimeUs: sample.sourceTimeUs + rangeOffsetUs,
			})),
		};
	} finally {
		await rm(workDirectory, { force: true, recursive: true });
	}
}
