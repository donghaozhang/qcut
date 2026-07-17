import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AudioWaveformOptions, AudioWaveformResult } from "./types.js";
import { getFFmpegPath } from "./utils.js";

const CACHE_VERSION = 2;
const DEFAULT_PEAK_COUNT = 4_096;
const MIN_PEAK_COUNT = 64;
const MAX_PEAK_COUNT = 16_384;
const WAVEFORM_HEIGHT = 128;
const MAX_CACHE_ENTRIES = 256;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;
const activeJobs = new Map<string, Promise<AudioWaveformResult>>();

interface NormalizedAudioWaveformOptions {
	sourcePath: string;
	duration: number;
	peakCount: number;
}

export interface AudioWaveformCommand {
	args: string[];
	expectedBytes: number;
	height: number;
	peakCount: number;
}

function normalizeAudioWaveformOptions({
	options,
}: {
	options: AudioWaveformOptions;
}): NormalizedAudioWaveformOptions {
	if (!options.sourcePath.trim() || !fs.existsSync(options.sourcePath)) {
		throw new Error(`Audio waveform source not found: ${options.sourcePath}`);
	}
	if (!Number.isFinite(options.duration) || options.duration <= 0) {
		throw new Error("Audio waveform duration must be positive");
	}
	const peakCount = options.peakCount ?? DEFAULT_PEAK_COUNT;
	if (
		!Number.isInteger(peakCount) ||
		peakCount < MIN_PEAK_COUNT ||
		peakCount > MAX_PEAK_COUNT
	) {
		throw new Error(
			`Audio waveform peakCount must be between ${MIN_PEAK_COUNT} and ${MAX_PEAK_COUNT}`
		);
	}
	return {
		sourcePath: options.sourcePath,
		duration: Number(options.duration.toFixed(6)),
		peakCount,
	};
}

export function buildAudioWaveformCacheKey({
	options,
}: {
	options: AudioWaveformOptions;
}): string {
	const normalized = normalizeAudioWaveformOptions({ options });
	const source = fs.statSync(normalized.sourcePath);
	return createHash("sha256")
		.update(
			JSON.stringify({
				version: CACHE_VERSION,
				sourcePath: path.resolve(normalized.sourcePath),
				sourceSize: source.size,
				sourceModified: source.mtimeMs,
				duration: normalized.duration,
				peakCount: normalized.peakCount,
				height: WAVEFORM_HEIGHT,
			})
		)
		.digest("hex");
}

export function buildAudioWaveformCommand({
	options,
}: {
	options: AudioWaveformOptions;
}): AudioWaveformCommand {
	const normalized = normalizeAudioWaveformOptions({ options });
	const filter = [
		"aformat=channel_layouts=mono",
		// filter=peak: the default (average) flattens music to a fraction of its
		// real amplitude, making clip waveforms look nearly silent.
		`showwavespic=s=${normalized.peakCount}x${WAVEFORM_HEIGHT}:colors=white:scale=lin:draw=full:filter=peak`,
		"format=gray",
	].join(",");
	return {
		peakCount: normalized.peakCount,
		height: WAVEFORM_HEIGHT,
		expectedBytes: normalized.peakCount * WAVEFORM_HEIGHT,
		args: [
			"-v",
			"error",
			"-i",
			normalized.sourcePath,
			"-filter_complex",
			filter,
			"-frames:v",
			"1",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"gray",
			"pipe:1",
		],
	};
}

export function decodeAudioWaveformPixels({
	pixels,
	peakCount,
	height,
}: {
	pixels: Uint8Array;
	peakCount: number;
	height: number;
}): Float32Array {
	if (pixels.byteLength !== peakCount * height) {
		throw new Error("Audio waveform pixel buffer has an unexpected size");
	}
	const values = new Float32Array(peakCount);
	for (let x = 0; x < peakCount; x += 1) {
		let first = height;
		let last = -1;
		for (let y = 0; y < height; y += 1) {
			if ((pixels[y * peakCount + x] ?? 0) === 0) continue;
			first = Math.min(first, y);
			last = Math.max(last, y);
		}
		const span = last >= first ? last - first + 1 : 0;
		values[x] = Math.min(1, Math.max(0, (span - 1) / (height - 1)));
	}
	return values;
}

function waveformCacheDirectory(): string {
	return path.join(os.tmpdir(), "qcut-audio-waveforms-v1");
}

function waveformCachePath({ cacheKey }: { cacheKey: string }): string {
	return path.join(waveformCacheDirectory(), `${cacheKey}.f32`);
}

function readCachedWaveform({
	cacheKey,
	peakCount,
	duration,
}: {
	cacheKey: string;
	peakCount: number;
	duration: number;
}): AudioWaveformResult | null {
	const cachePath = waveformCachePath({ cacheKey });
	try {
		const data = fs.readFileSync(cachePath);
		if (data.byteLength !== peakCount * Float32Array.BYTES_PER_ELEMENT) {
			return null;
		}
		void fs.promises.utimes(cachePath, new Date(), new Date()).catch(() => {});
		const copied = data.buffer.slice(
			data.byteOffset,
			data.byteOffset + data.byteLength
		);
		return {
			duration,
			values: new Float32Array(copied),
			cacheHit: true,
		};
	} catch {
		return null;
	}
}

async function cleanupWaveformCache({
	keepPath,
}: {
	keepPath: string;
}): Promise<void> {
	let filenames: string[];
	try {
		filenames = (await fs.promises.readdir(waveformCacheDirectory())).filter(
			(filename) => filename.endsWith(".f32")
		);
	} catch {
		return;
	}
	const entries = (
		await Promise.all(
			filenames.map(async (filename) => {
				const filePath = path.join(waveformCacheDirectory(), filename);
				try {
					const stat = await fs.promises.stat(filePath);
					return { filePath, size: stat.size, lastUsedAt: stat.mtimeMs };
				} catch {
					return null;
				}
			})
		)
	).filter(
		(entry): entry is { filePath: string; size: number; lastUsedAt: number } =>
			entry !== null
	);
	entries.sort((left, right) => left.lastUsedAt - right.lastUsedAt);
	let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
	let totalEntries = entries.length;
	for (const entry of entries) {
		if (totalEntries <= MAX_CACHE_ENTRIES && totalBytes <= MAX_CACHE_BYTES) {
			break;
		}
		if (entry.filePath === keepPath) continue;
		await fs.promises.rm(entry.filePath, { force: true }).catch(() => {});
		totalEntries -= 1;
		totalBytes -= entry.size;
	}
}

async function writeCachedWaveform({
	cacheKey,
	values,
}: {
	cacheKey: string;
	values: Float32Array;
}): Promise<void> {
	const cachePath = waveformCachePath({ cacheKey });
	const partialPath = `${cachePath}.${process.pid}-${Date.now()}.partial`;
	await fs.promises.mkdir(waveformCacheDirectory(), { recursive: true });
	const data = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
	try {
		await fs.promises.writeFile(partialPath, data);
		await fs.promises.rename(partialPath, cachePath);
	} finally {
		await fs.promises.rm(partialPath, { force: true }).catch(() => {});
	}
	await cleanupWaveformCache({ keepPath: cachePath });
}

function processTimeoutMs({ duration }: { duration: number }): number {
	return Math.min(15 * 60_000, Math.max(30_000, (duration * 1000) / 20));
}

async function renderAudioWaveformPixels({
	command,
	duration,
}: {
	command: AudioWaveformCommand;
	duration: number;
}): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn(getFFmpegPath(), command.args, {
			stdio: ["ignore", "pipe", "pipe"],
		});
		const output: Buffer[] = [];
		const errors: Buffer[] = [];
		let outputBytes = 0;
		let errorBytes = 0;
		let settled = false;
		const finish = ({ error, pixels }: { error?: Error; pixels?: Buffer }) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (error) reject(error);
			else if (pixels) resolve(pixels);
		};
		const timeout = setTimeout(() => {
			child.kill("SIGKILL");
			finish({ error: new Error("Audio waveform extraction timed out") });
		}, processTimeoutMs({ duration }));

		child.stdout.on("data", (chunk: Buffer) => {
			outputBytes += chunk.byteLength;
			if (outputBytes > command.expectedBytes) {
				child.kill("SIGKILL");
				finish({
					error: new Error("Audio waveform output exceeded its limit"),
				});
				return;
			}
			output.push(chunk);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			if (errorBytes >= MAX_STDERR_BYTES) return;
			errorBytes += chunk.byteLength;
			errors.push(
				chunk.subarray(0, MAX_STDERR_BYTES - errorBytes + chunk.byteLength)
			);
		});
		child.once("error", (error) => finish({ error }));
		child.once("close", (code) => {
			if (settled) return;
			if (code !== 0) {
				const detail = Buffer.concat(errors).toString("utf8").trim();
				finish({
					error: new Error(
						detail || `Audio waveform FFmpeg exited with ${code}`
					),
				});
				return;
			}
			const pixels = Buffer.concat(output);
			if (pixels.byteLength !== command.expectedBytes) {
				finish({
					error: new Error("Audio waveform FFmpeg returned incomplete pixels"),
				});
				return;
			}
			finish({ pixels });
		});
	});
}

export async function extractAudioWaveform({
	options,
}: {
	options: AudioWaveformOptions;
}): Promise<AudioWaveformResult> {
	const normalized = normalizeAudioWaveformOptions({ options });
	const cacheKey = buildAudioWaveformCacheKey({ options: normalized });
	const cached = readCachedWaveform({
		cacheKey,
		peakCount: normalized.peakCount,
		duration: normalized.duration,
	});
	if (cached) return cached;
	const active = activeJobs.get(cacheKey);
	if (active) return active;

	const job = (async () => {
		const command = buildAudioWaveformCommand({ options: normalized });
		const pixels = await renderAudioWaveformPixels({
			command,
			duration: normalized.duration,
		});
		const values = decodeAudioWaveformPixels({
			pixels,
			peakCount: command.peakCount,
			height: command.height,
		});
		await writeCachedWaveform({ cacheKey, values });
		return { duration: normalized.duration, values, cacheHit: false };
	})();
	activeJobs.set(cacheKey, job);
	try {
		return await job;
	} finally {
		if (activeJobs.get(cacheKey) === job) activeJobs.delete(cacheKey);
	}
}
