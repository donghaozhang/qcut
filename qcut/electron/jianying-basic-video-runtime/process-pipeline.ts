import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { DeflickerVideoMetadata } from "./video-input.js";

const execFileAsync = promisify(execFile);
const NETWORK_DENY_PROFILE = "(version 1) (allow default) (deny network*)";
const STDERR_LIMIT = 2 * 1024 * 1024;

interface DeflickerPipelineResult {
	changedBytes: number;
	frameCount: number;
}

function abortError() {
	const error = new Error("防闪烁任务已取消");
	error.name = "AbortError";
	return error;
}

function stderrCollector({
	child,
	onText,
}: {
	child: ChildProcess;
	onText?: (text: string) => void;
}) {
	let stderr = "";
	if (!child.stderr) throw new Error("子进程没有可读取的错误流");
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (text: string) => {
		stderr = (stderr + text).slice(-STDERR_LIMIT);
		onText?.(text);
	});
	return () => stderr;
}

function waitForExit({
	child,
	getStderr,
	label,
}: {
	child: ChildProcess;
	getStderr: () => string;
	label: string;
}) {
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		child.once("error", (error) => {
			if (settled) return;
			settled = true;
			reject(new Error(`${label}无法启动: ${error.message}`));
		});
		child.once("close", (code, signal) => {
			if (settled) return;
			settled = true;
			if (code === 0) {
				resolve();
				return;
			}
			const detail = getStderr().trim().split("\n").slice(-8).join("\n");
			reject(
				new Error(
					`${label}失败 (${signal ?? code ?? "unknown"})${detail ? `: ${detail}` : ""}`
				)
			);
		});
	});
}

function parseNativeResult({ stderr }: { stderr: string }) {
	const match = stderr.match(
		/QCUT\tRESULT\troute=qcut-jianying-private-deflicker-v2\tframes=(\d+)\tchangedBytes=(\d+)/
	);
	if (!match) throw new Error("本机防闪烁桥没有返回可验证结果");
	const frameCount = Number(match[1]);
	const changedBytes = Number(match[2]);
	if (
		!Number.isSafeInteger(frameCount) ||
		frameCount <= 0 ||
		!Number.isSafeInteger(changedBytes) ||
		changedBytes < 0
	) {
		throw new Error("本机防闪烁桥返回了无效统计");
	}
	return { changedBytes, frameCount };
}

function fpsText({ fps }: { fps: number }) {
	return fps.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

async function createFramePipes() {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-deflicker-pipes-")
	);
	const decodedPath = path.join(directory, "decoded.bgra");
	const processedPath = path.join(directory, "processed.bgra");
	try {
		await execFileAsync("/usr/bin/mkfifo", [decodedPath, processedPath], {
			timeout: 10_000,
		});
		return { decodedPath, directory, processedPath };
	} catch (error) {
		await rm(directory, { force: true, recursive: true });
		throw error;
	}
}

export async function runDeflickerPipeline({
	ffmpegPath,
	frameworkDirectory,
	hostPath,
	lensPath,
	metadata,
	modelPath,
	onFrameProgress,
	outputPath,
	signal,
	sourcePath,
	strength,
}: {
	ffmpegPath: string;
	frameworkDirectory: string;
	hostPath: string;
	lensPath: string;
	metadata: DeflickerVideoMetadata;
	modelPath: string;
	onFrameProgress?: (processedFrames: number) => void;
	outputPath: string;
	signal?: AbortSignal;
	sourcePath: string;
	strength: number;
}): Promise<DeflickerPipelineResult> {
	if (signal?.aborted) throw abortError();
	const pipes = await createFramePipes();
	const frameRate = fpsText({ fps: metadata.fps });
	const host = spawn(
		"/usr/bin/sandbox-exec",
		[
			"-p",
			NETWORK_DENY_PROFILE,
			hostPath,
			lensPath,
			modelPath,
			String(metadata.width),
			String(metadata.height),
			String(strength),
			pipes.decodedPath,
			pipes.processedPath,
		],
		{
			env: {
				...process.env,
				DYLD_FALLBACK_LIBRARY_PATH: frameworkDirectory,
				DYLD_LIBRARY_PATH: frameworkDirectory,
			},
			stdio: ["ignore", "ignore", "pipe"],
		}
	);
	const decoder = spawn(
		ffmpegPath,
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-nostdin",
			"-y",
			"-i",
			sourcePath,
			"-map",
			"0:v:0",
			"-an",
			"-vf",
			`fps=${frameRate}`,
			"-pix_fmt",
			"bgra",
			"-f",
			"rawvideo",
			pipes.decodedPath,
		],
		{ stdio: ["ignore", "ignore", "pipe"] }
	);
	const encoder = spawn(
		ffmpegPath,
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-nostdin",
			"-y",
			"-f",
			"rawvideo",
			"-pixel_format",
			"bgra",
			"-video_size",
			`${metadata.width}x${metadata.height}`,
			"-framerate",
			frameRate,
			"-i",
			pipes.processedPath,
			"-i",
			sourcePath,
			"-map",
			"0:v:0",
			"-map",
			"1:a?",
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"16",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			"-t",
			String(metadata.durationSeconds),
			"-movflags",
			"+faststart",
			"-f",
			"mp4",
			outputPath,
		],
		{ stdio: ["ignore", "ignore", "pipe"] }
	);
	const decoderStderr = stderrCollector({ child: decoder });
	let nativeLineBuffer = "";
	const hostStderr = stderrCollector({
		child: host,
		onText: (text) => {
			nativeLineBuffer += text;
			const lines = nativeLineBuffer.split("\n");
			nativeLineBuffer = lines.pop() ?? "";
			for (const line of lines) {
				const match = line.match(/^QCUT\tPROGRESS\tframes=(\d+)$/);
				if (match) onFrameProgress?.(Number(match[1]));
			}
		},
	});
	const encoderStderr = stderrCollector({ child: encoder });
	const children = [decoder, host, encoder];
	const abort = () => {
		for (const child of children) child.kill("SIGKILL");
	};
	signal?.addEventListener("abort", abort, { once: true });
	try {
		await Promise.all([
			waitForExit({
				child: decoder,
				getStderr: decoderStderr,
				label: "视频解码",
			}),
			waitForExit({
				child: host,
				getStderr: hostStderr,
				label: "本机防闪烁",
			}),
			waitForExit({
				child: encoder,
				getStderr: encoderStderr,
				label: "视频编码",
			}),
		]);
		if (signal?.aborted) throw abortError();
		return parseNativeResult({ stderr: hostStderr() });
	} catch (error) {
		abort();
		if (signal?.aborted) throw abortError();
		throw error;
	} finally {
		signal?.removeEventListener("abort", abort);
		await rm(pipes.directory, { force: true, recursive: true });
	}
}
