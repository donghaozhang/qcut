import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
	VideoPreviewProxyCacheClearResult,
	VideoPreviewProxyCacheStats,
	VideoPreviewProxyOptions,
	VideoPreviewProxyProgress,
	VideoPreviewProxyResult,
} from "./types.js";
import {
	buildVideoEnhancementFilter,
	normalizeVideoEnhancements,
} from "./video-enhancement-filter.js";
import {
	getVideoPreviewProxyCacheDir,
	getVideoPreviewProxyPath,
	getVideoPreviewProxyUrl,
} from "./video-preview-proxy-cache.js";
import { getFFmpegPath } from "./utils.js";

const PROXY_CACHE_VERSION = 1;
const MAX_PROXY_DIMENSION = 1920;
const MAX_PROXY_DURATION_SECONDS = 12 * 60 * 60;
const MAX_PROXY_CACHE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_PROXY_CACHE_ENTRIES = 80;
const MIN_VALID_PROXY_BYTES = 1_024;
const TEMPORAL_PREROLL_SECONDS = 0.5;

interface NormalizedProxyOptions extends VideoPreviewProxyOptions {
	width: number;
	height: number;
}

interface ProxyArtifact {
	cacheKey: string;
	fileSize: number;
}

interface ActiveProxyJob {
	process: ChildProcess;
	promise: Promise<ProxyArtifact>;
	requestIds: Set<string>;
	progressListeners: Map<string, (progress: VideoPreviewProxyProgress) => void>;
}

interface VideoPreviewProxyCommand {
	args: string[];
	inputStart: number;
	preroll: number;
}

const activeJobsByKey = new Map<string, ActiveProxyJob>();
const requestKeys = new Map<string, string>();

function evenDimension({ value }: { value: number }): number {
	return Math.max(2, Math.round(value / 2) * 2);
}

function assertProxyOptions({
	options,
}: {
	options: VideoPreviewProxyOptions;
}): void {
	if (!options.requestId.trim())
		throw new Error("Proxy request ID is required");
	if (!fs.existsSync(options.sourcePath)) {
		throw new Error(`Proxy source not found: ${options.sourcePath}`);
	}
	if (!Number.isFinite(options.sourceStart) || options.sourceStart < 0) {
		throw new Error("Proxy sourceStart must be a non-negative number");
	}
	if (
		!Number.isFinite(options.sourceDuration) ||
		options.sourceDuration <= 0 ||
		options.sourceDuration > MAX_PROXY_DURATION_SECONDS
	) {
		throw new Error(
			`Proxy sourceDuration must be between 0 and ${MAX_PROXY_DURATION_SECONDS} seconds`
		);
	}
	for (const [name, value] of [
		["width", options.width],
		["height", options.height],
	] as const) {
		if (!Number.isFinite(value) || value < 2 || value > MAX_PROXY_DIMENSION) {
			throw new Error(
				`Proxy ${name} must be between 2 and ${MAX_PROXY_DIMENSION}`
			);
		}
	}
	if (!Number.isFinite(options.fps) || options.fps < 1 || options.fps > 120) {
		throw new Error("Proxy FPS must be between 1 and 120");
	}
}

function normalizeProxyOptions({
	options,
}: {
	options: VideoPreviewProxyOptions;
}): NormalizedProxyOptions {
	assertProxyOptions({ options });
	return {
		...options,
		width: evenDimension({ value: options.width }),
		height: evenDimension({ value: options.height }),
		sourceStart: Number(options.sourceStart.toFixed(6)),
		sourceDuration: Number(options.sourceDuration.toFixed(6)),
		fps: Number(options.fps.toFixed(6)),
		enhancements: normalizeVideoEnhancements({
			enhancements: options.enhancements,
		}),
	};
}

function hasTemporalEnhancement({
	options,
}: {
	options: NormalizedProxyOptions;
}): boolean {
	return (
		options.enhancements.stabilization > 0 ||
		options.enhancements.denoise > 0 ||
		options.enhancements.beauty > 0
	);
}

export function buildVideoPreviewProxyCommand({
	options,
	outputPath,
}: {
	options: VideoPreviewProxyOptions;
	outputPath: string;
}): VideoPreviewProxyCommand {
	const normalized = normalizeProxyOptions({ options });
	const preroll = hasTemporalEnhancement({ options: normalized })
		? Math.min(normalized.sourceStart, TEMPORAL_PREROLL_SECONDS)
		: 0;
	const inputStart = Math.max(0, normalized.sourceStart - preroll);
	const filters = [
		`scale=${normalized.width}:${normalized.height}:flags=lanczos`,
		"setsar=1",
		buildVideoEnhancementFilter({
			enhancements: normalized.enhancements,
			width: normalized.width,
			height: normalized.height,
		}),
		`fps=${normalized.fps}`,
		"format=yuv420p",
	].filter(Boolean);
	return {
		inputStart,
		preroll,
		args: [
			"-y",
			"-v",
			"error",
			"-ss",
			String(inputStart),
			"-i",
			normalized.sourcePath,
			"-ss",
			String(preroll),
			"-t",
			String(normalized.sourceDuration),
			"-map",
			"0:v:0",
			"-map",
			"0:a?",
			"-vf",
			filters.join(","),
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-crf",
			"28",
			"-tune",
			"fastdecode",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"96k",
			"-movflags",
			"+faststart",
			"-max_muxing_queue_size",
			"1024",
			"-progress",
			"pipe:2",
			"-nostats",
			outputPath,
		],
	};
}

export function buildVideoPreviewProxyCacheKey({
	options,
}: {
	options: VideoPreviewProxyOptions;
}): string {
	const normalized = normalizeProxyOptions({ options });
	const source = fs.statSync(normalized.sourcePath);
	return createHash("sha256")
		.update(
			JSON.stringify({
				version: PROXY_CACHE_VERSION,
				sourcePath: normalized.sourcePath,
				sourceSize: source.size,
				sourceModified: source.mtimeMs,
				sourceStart: normalized.sourceStart,
				sourceDuration: normalized.sourceDuration,
				width: normalized.width,
				height: normalized.height,
				fps: normalized.fps,
				enhancements: normalized.enhancements,
			})
		)
		.digest("hex");
}

function readCachedArtifact({
	cacheKey,
}: {
	cacheKey: string;
}): ProxyArtifact | null {
	const proxyPath = getVideoPreviewProxyPath({ cacheKey });
	try {
		const stat = fs.statSync(proxyPath);
		if (!stat.isFile() || stat.size < MIN_VALID_PROXY_BYTES) return null;
		void fs.promises.utimes(proxyPath, new Date(), new Date()).catch(() => {});
		return { cacheKey, fileSize: stat.size };
	} catch {
		return null;
	}
}

async function readProxyCacheEntries(): Promise<
	Array<{ filePath: string; size: number; lastUsedAt: number }>
> {
	const cacheDir = getVideoPreviewProxyCacheDir();
	let filenames: string[];
	try {
		filenames = (await fs.promises.readdir(cacheDir)).filter((filename) =>
			filename.endsWith(".mp4")
		);
	} catch {
		return [];
	}

	const entries = await Promise.all(
		filenames.map(async (filename) => {
			const filePath = path.join(cacheDir, filename);
			try {
				const stat = await fs.promises.stat(filePath);
				if (!stat.isFile()) return null;
				return {
					filePath,
					size: stat.size,
					lastUsedAt: stat.mtimeMs,
				};
			} catch {
				// Cache stats are best-effort; stale files can disappear mid-scan.
				return null;
			}
		})
	);
	return entries.filter((entry) => entry !== null);
}

async function cleanupProxyCache({
	keepPath,
}: {
	keepPath: string;
}): Promise<void> {
	const entries = await readProxyCacheEntries();
	entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
	let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
	let totalEntries = entries.length;
	const pathsToRemove: string[] = [];
	for (const entry of entries) {
		if (
			totalBytes <= MAX_PROXY_CACHE_BYTES &&
			totalEntries <= MAX_PROXY_CACHE_ENTRIES
		) {
			break;
		}
		if (entry.filePath === keepPath) continue;
		pathsToRemove.push(entry.filePath);
		totalBytes -= entry.size;
		totalEntries--;
	}
	await Promise.all(
		pathsToRemove.map((filePath) =>
			fs.promises.rm(filePath, { force: true }).catch(() => {})
		)
	);
}

function emitProgress({
	job,
	progress,
	processedSeconds,
	duration,
}: {
	job: Pick<ActiveProxyJob, "progressListeners">;
	progress: number;
	processedSeconds: number;
	duration: number;
}): void {
	for (const [requestId, listener] of job.progressListeners) {
		listener({ requestId, progress, processedSeconds, duration });
	}
}

function startProxyJob({
	cacheKey,
	options,
	outputPath,
	partialPath,
}: {
	cacheKey: string;
	options: NormalizedProxyOptions;
	outputPath: string;
	partialPath: string;
}): ActiveProxyJob {
	const command = buildVideoPreviewProxyCommand({
		options,
		outputPath: partialPath,
	});
	const process = spawn(getFFmpegPath(), command.args, {
		windowsHide: true,
		stdio: ["ignore", "ignore", "pipe"],
	});
	const requestIds = new Set<string>();
	const progressListeners = new Map<
		string,
		(progress: VideoPreviewProxyProgress) => void
	>();
	const progressTarget = { progressListeners };
	const promise = new Promise<ProxyArtifact>((resolve, reject) => {
		let settled = false;
		let stderr = "";
		let progressBuffer = "";
		const timeoutMs = Math.min(
			30 * 60 * 1000,
			Math.max(60_000, options.sourceDuration * 3_000)
		);
		const finish = ({ error }: { error?: Error }) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			activeJobsByKey.delete(cacheKey);
			for (const requestId of requestIds) requestKeys.delete(requestId);
			if (error) {
				void fs.promises.rm(partialPath, { force: true }).catch(() => {});
				reject(error);
				return;
			}
			void (async () => {
				try {
					const partialStat = await fs.promises.stat(partialPath);
					if (partialStat.size < MIN_VALID_PROXY_BYTES) {
						throw new Error("Video preview proxy returned an empty file");
					}
					await fs.promises.rename(partialPath, outputPath);
					await cleanupProxyCache({ keepPath: outputPath });
					emitProgress({
						job: progressTarget,
						progress: 1,
						processedSeconds: options.sourceDuration,
						duration: options.sourceDuration,
					});
					resolve({ cacheKey, fileSize: partialStat.size });
				} catch (renameError) {
					void fs.promises.rm(partialPath, { force: true }).catch(() => {});
					reject(
						renameError instanceof Error
							? renameError
							: new Error(String(renameError))
					);
				}
			})();
		};
		const timer = setTimeout(() => {
			process.kill();
			finish({ error: new Error("Video preview proxy timed out") });
		}, timeoutMs);
		process.stderr?.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			stderr = `${stderr}${text}`.slice(-16_384);
			progressBuffer += text;
			const lines = progressBuffer.split(/\r?\n/);
			progressBuffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.startsWith("out_time_us=")) continue;
				const microseconds = Number(line.slice("out_time_us=".length));
				if (!Number.isFinite(microseconds)) continue;
				const processedSeconds = Math.min(
					options.sourceDuration,
					Math.max(0, microseconds / 1_000_000)
				);
				emitProgress({
					job: progressTarget,
					progress: Math.min(0.99, processedSeconds / options.sourceDuration),
					processedSeconds,
					duration: options.sourceDuration,
				});
			}
		});
		process.on("error", (error) => finish({ error }));
		process.on("close", (code, signal) => {
			if (code !== 0) {
				finish({
					error: new Error(
						signal
							? `Video preview proxy cancelled (${signal})`
							: `Video preview proxy failed (${code}): ${stderr}`
					),
				});
				return;
			}
			finish({});
		});
	});
	return { process, promise, requestIds, progressListeners };
}

function proxyResult({
	requestId,
	options,
	artifact,
	cacheHit,
}: {
	requestId: string;
	options: NormalizedProxyOptions;
	artifact: ProxyArtifact;
	cacheHit: boolean;
}): VideoPreviewProxyResult {
	return {
		requestId,
		proxyUrl: getVideoPreviewProxyUrl({ cacheKey: artifact.cacheKey }),
		cacheKey: artifact.cacheKey,
		cacheHit,
		sourceStart: options.sourceStart,
		duration: options.sourceDuration,
		width: options.width,
		height: options.height,
		fileSize: artifact.fileSize,
	};
}

export async function renderVideoPreviewProxy({
	options,
	onProgress,
}: {
	options: VideoPreviewProxyOptions;
	onProgress?: (progress: VideoPreviewProxyProgress) => void;
}): Promise<VideoPreviewProxyResult> {
	const normalized = normalizeProxyOptions({ options });
	const cacheKey = buildVideoPreviewProxyCacheKey({ options: normalized });
	const cached = readCachedArtifact({ cacheKey });
	if (cached) {
		onProgress?.({
			requestId: normalized.requestId,
			progress: 1,
			processedSeconds: normalized.sourceDuration,
			duration: normalized.sourceDuration,
		});
		return proxyResult({
			requestId: normalized.requestId,
			options: normalized,
			artifact: cached,
			cacheHit: true,
		});
	}

	let job = activeJobsByKey.get(cacheKey);
	if (!job) {
		const cacheDir = getVideoPreviewProxyCacheDir();
		await fs.promises.mkdir(cacheDir, { recursive: true });
		const requestHash = createHash("sha1")
			.update(normalized.requestId)
			.digest("hex")
			.slice(0, 12);
		const outputPath = getVideoPreviewProxyPath({ cacheKey });
		await fs.promises.rm(outputPath, { force: true });
		const partialPath = path.join(
			cacheDir,
			`${cacheKey}.partial-${requestHash}.mp4`
		);
		job = startProxyJob({
			cacheKey,
			options: normalized,
			outputPath,
			partialPath,
		});
		activeJobsByKey.set(cacheKey, job);
	}
	job.requestIds.add(normalized.requestId);
	requestKeys.set(normalized.requestId, cacheKey);
	if (onProgress) job.progressListeners.set(normalized.requestId, onProgress);
	onProgress?.({
		requestId: normalized.requestId,
		progress: 0,
		processedSeconds: 0,
		duration: normalized.sourceDuration,
	});
	const artifact = await job.promise;
	return proxyResult({
		requestId: normalized.requestId,
		options: normalized,
		artifact,
		cacheHit: false,
	});
}

export function cancelVideoPreviewProxy({
	requestId,
}: {
	requestId: string;
}): boolean {
	const cacheKey = requestKeys.get(requestId);
	if (!cacheKey) return false;
	requestKeys.delete(requestId);
	const job = activeJobsByKey.get(cacheKey);
	if (!job) return false;
	job.requestIds.delete(requestId);
	job.progressListeners.delete(requestId);
	if (job.requestIds.size > 0) return true;
	activeJobsByKey.delete(cacheKey);
	return job.process.kill();
}

export async function getVideoPreviewProxyCacheStats(): Promise<VideoPreviewProxyCacheStats> {
	const entries = await readProxyCacheEntries();
	return {
		cacheDir: getVideoPreviewProxyCacheDir(),
		entryCount: entries.length,
		totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
		maxBytes: MAX_PROXY_CACHE_BYTES,
		maxEntries: MAX_PROXY_CACHE_ENTRIES,
	};
}

export async function clearVideoPreviewProxyCache(): Promise<VideoPreviewProxyCacheClearResult> {
	const before = await readProxyCacheEntries();
	for (const entry of before) {
		await fs.promises.rm(entry.filePath, { force: true }).catch(() => {});
	}
	const after = await getVideoPreviewProxyCacheStats();
	return {
		...after,
		removedEntries: before.length - after.entryCount,
		removedBytes: Math.max(
			0,
			before.reduce((sum, entry) => sum + entry.size, 0) - after.totalBytes
		),
	};
}
