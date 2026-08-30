import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
	AudioPropertyKeyframe,
	AudioSettings,
} from "../ffmpeg/audio-settings.js";
import { buildTimelineAudioFilters } from "../ffmpeg/audio-filter-graph.js";
import { getFFmpegPath } from "../ffmpeg/paths.js";
import type {
	QcutAudioArtifactManifest,
	QcutAudioProcessRequest,
	QcutAudioProcessResult,
} from "../qcut-audio-runtime-contract.js";
import {
	QCUT_AUDIO_RUNTIME_ID,
	QCUT_AUDIO_RUNTIME_VERSION,
} from "../qcut-audio-runtime-contract.js";
import {
	cleanupQcutAudioCache,
	getQcutAudioCacheDirectory,
	qcutAudioArtifactPaths,
	readQcutAudioArtifact,
} from "./cache.js";

const MAX_SOURCE_BYTES = 512 * 1024 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const PROCESS_TIMEOUT_MS = 30 * 60 * 1_000;

interface QcutAudioProcessCommand {
	args: string[];
}

interface PreparedQcutAudioRequest {
	request: QcutAudioProcessRequest;
	sourceSha256: string;
	settingsSha256: string;
	cacheKey: string;
}

interface RenderedArtifact {
	outputPath: string;
	manifestPath: string;
	manifest: QcutAudioArtifactManifest;
}

interface ActiveQcutAudioJob {
	promise: Promise<RenderedArtifact>;
	owners: Set<string>;
	cancel: () => void;
}

const activeJobs = new Map<string, ActiveQcutAudioJob>();
const jobKeysByRequestId = new Map<string, string>();

function stableKeyframes({
	keyframes,
}: {
	keyframes: AudioSettings["keyframes"];
}): Array<[string, AudioPropertyKeyframe[]]> {
	return Object.entries(keyframes ?? {})
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([property, frames]) => [
			property,
			[...(frames ?? [])]
				.sort(
					(left, right) =>
						left.frame - right.frame || left.id.localeCompare(right.id)
				)
				.map(({ id, frame, value, easing }) => ({ id, frame, value, easing })),
		]);
}

export function canonicalQcutAudioSettings({
	audio,
}: {
	audio: AudioSettings;
}): Record<string, unknown> {
	return {
		enabled: audio.enabled,
		volumeDb: audio.volumeDb,
		fadeIn: audio.fadeIn,
		fadeOut: audio.fadeOut,
		channelMode: audio.channelMode ?? "stereo",
		panEnabled: audio.panEnabled,
		pan: audio.pan,
		loudness: {
			enabled: audio.loudness.enabled,
			targetLufs: audio.loudness.targetLufs,
			truePeakDb: audio.loudness.truePeakDb,
			loudnessRange: audio.loudness.loudnessRange,
		},
		denoise: {
			enabled: audio.denoise.enabled,
			amount: audio.denoise.amount,
			noiseFloorDb: audio.denoise.noiseFloorDb,
		},
		voiceEnhance: {
			enabled: audio.voiceEnhance.enabled,
			clarity: audio.voiceEnhance.clarity,
			warmth: audio.voiceEnhance.warmth,
			presence: audio.voiceEnhance.presence,
		},
		pitch: {
			enabled: audio.pitch.enabled,
			semitones: audio.pitch.semitones,
			preserveFormants: audio.pitch.preserveFormants,
		},
		equalizer: {
			enabled: audio.equalizer.enabled,
			lowGainDb: audio.equalizer.lowGainDb,
			midGainDb: audio.equalizer.midGainDb,
			highGainDb: audio.equalizer.highGainDb,
		},
		compressor: {
			enabled: audio.compressor.enabled,
			thresholdDb: audio.compressor.thresholdDb,
			ratio: audio.compressor.ratio,
			attackMs: audio.compressor.attackMs,
			releaseMs: audio.compressor.releaseMs,
			makeupGainDb: audio.compressor.makeupGainDb,
		},
		limiter: {
			enabled: audio.limiter.enabled,
			ceilingDb: audio.limiter.ceilingDb,
			releaseMs: audio.limiter.releaseMs,
		},
		reverb: {
			enabled: audio.reverb.enabled,
			mix: audio.reverb.mix,
			roomSize: audio.reverb.roomSize,
			damping: audio.reverb.damping,
		},
		echo: {
			enabled: audio.echo.enabled,
			mix: audio.echo.mix,
			delayMs: audio.echo.delayMs,
			feedback: audio.echo.feedback,
		},
		telephone: {
			enabled: audio.telephone.enabled,
			mix: audio.telephone.mix,
		},
		keyframes: stableKeyframes({ keyframes: audio.keyframes }),
	};
}

function assertFiniteNumber({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): void {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number`);
	}
}

function assertFiniteNumbers({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): void {
	if (typeof value === "number") {
		assertFiniteNumber({ value, label });
		return;
	}
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			assertFiniteNumbers({ value: item, label: `${label}[${index}]` });
		}
		return;
	}
	if (typeof value !== "object" || value === null) return;
	for (const [key, item] of Object.entries(value)) {
		assertFiniteNumbers({ value: item, label: `${label}.${key}` });
	}
}

function assertAudioSettings({ audio }: { audio: AudioSettings }): void {
	if (!audio || typeof audio !== "object") {
		throw new Error("QCut audio settings are required");
	}
	for (const section of [
		"loudness",
		"denoise",
		"voiceEnhance",
		"pitch",
		"equalizer",
		"compressor",
		"limiter",
		"reverb",
		"echo",
		"telephone",
	] as const) {
		const value = Reflect.get(audio, section);
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			throw new Error(`QCut audio ${section} settings are required`);
		}
	}
	for (const [label, value] of [
		["volumeDb", audio.volumeDb],
		["fadeIn", audio.fadeIn],
		["fadeOut", audio.fadeOut],
		["pan", audio.pan],
		["denoise.amount", audio.denoise?.amount],
		["denoise.noiseFloorDb", audio.denoise?.noiseFloorDb],
		["pitch.semitones", audio.pitch?.semitones],
	] as const) {
		assertFiniteNumber({ value, label: `QCut audio ${label}` });
	}
	const channelMode = audio.channelMode ?? "stereo";
	if (!["stereo", "mono", "left", "right", "swap"].includes(channelMode)) {
		throw new Error(`Unsupported QCut audio channel mode: ${channelMode}`);
	}
	assertFiniteNumbers({ value: audio, label: "QCut audio" });
}

function assertProcessRequest({
	request,
}: {
	request: QcutAudioProcessRequest;
}): void {
	if (!request.requestId.trim() || request.requestId.length > 128) {
		throw new Error("QCut audio request ID must contain 1 to 128 characters");
	}
	if (!path.isAbsolute(request.sourcePath)) {
		throw new Error("QCut audio source path must be absolute");
	}
	let stat: fs.Stats;
	try {
		stat = fs.statSync(request.sourcePath);
	} catch {
		throw new Error(`QCut audio source not found: ${request.sourcePath}`);
	}
	if (!stat.isFile()) throw new Error("QCut audio source must be a file");
	if (stat.size <= 0 || stat.size > MAX_SOURCE_BYTES) {
		throw new Error("QCut audio source has an unsupported size");
	}
	assertAudioSettings({ audio: request.audio });
}

async function sha256File({ filePath }: { filePath: string }): Promise<string> {
	return await new Promise<string>((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = fs.createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}

function sha256Text({ value }: { value: string }): string {
	return createHash("sha256").update(value).digest("hex");
}

export async function prepareQcutAudioProcessRequest({
	request,
}: {
	request: QcutAudioProcessRequest;
}): Promise<PreparedQcutAudioRequest> {
	assertProcessRequest({ request });
	const [sourceSha256, settingsJson] = await Promise.all([
		sha256File({ filePath: request.sourcePath }),
		Promise.resolve(
			JSON.stringify(canonicalQcutAudioSettings({ audio: request.audio }))
		),
	]);
	const settingsSha256 = sha256Text({ value: settingsJson });
	const cacheKey = sha256Text({
		value: JSON.stringify({
			version: QCUT_AUDIO_RUNTIME_VERSION,
			engine: QCUT_AUDIO_RUNTIME_ID,
			sourceSha256,
			settingsSha256,
			format: "flac",
			sampleRate: 48_000,
			channels: 2,
		}),
	});
	return { request, sourceSha256, settingsSha256, cacheKey };
}

export function buildQcutAudioProcessCommand({
	request,
	outputPath,
}: {
	request: QcutAudioProcessRequest;
	outputPath: string;
}): QcutAudioProcessCommand {
	assertProcessRequest({ request });
	const audioGraph = buildTimelineAudioFilters({
		audioFiles: [
			{
				path: request.sourcePath,
				startTime: 0,
				volume: 1,
				audio: request.audio,
			},
		],
		audioStartIndex: 0,
		fps: 30,
	});
	return {
		args: [
			"-y",
			"-v",
			"error",
			"-i",
			request.sourcePath,
			...(audioGraph.filterSteps.length > 0
				? ["-filter_complex", audioGraph.filterSteps.join(";")]
				: []),
			"-map",
			audioGraph.mapAudio ?? "0:a:0",
			"-vn",
			"-map_metadata",
			"-1",
			"-c:a",
			"flac",
			"-compression_level",
			"5",
			"-ar",
			"48000",
			"-ac",
			"2",
			"-f",
			"flac",
			outputPath,
		],
	};
}

async function runFfmpeg({
	ffmpegPath,
	args,
	signal,
}: {
	ffmpegPath: string;
	args: string[];
	signal?: AbortSignal;
}): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(ffmpegPath, args, {
			windowsHide: true,
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		let settled = false;
		const onAbort = () => {
			child.kill();
			finish({
				error: new Error("QCut local audio processing was cancelled"),
			});
		};
		const finish = ({ error }: { error?: Error }) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			if (error) reject(error);
			else resolve();
		};
		const timer = setTimeout(() => {
			child.kill();
			finish({ error: new Error("QCut local audio processing timed out") });
		}, PROCESS_TIMEOUT_MS);
		if (signal?.aborted) {
			onAbort();
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr = `${stderr}${chunk.toString()}`.slice(-MAX_STDERR_BYTES);
		});
		child.on("error", (error) => finish({ error }));
		child.on("close", (code, signal) => {
			if (code === 0) {
				finish({});
				return;
			}
			finish({
				error: new Error(
					signal
						? `QCut local audio processing stopped (${signal})`
						: `QCut local audio processing failed (${code}): ${stderr}`
				),
			});
		});
	});
}

async function writeJsonAtomically({
	value,
	filePath,
}: {
	value: unknown;
	filePath: string;
}): Promise<void> {
	const partialPath = `${filePath}.${process.pid}-${Date.now()}.partial`;
	try {
		await fs.promises.writeFile(
			partialPath,
			`${JSON.stringify(value, null, 2)}\n`
		);
		await fs.promises.rm(filePath, { force: true });
		await fs.promises.rename(partialPath, filePath);
	} finally {
		await fs.promises.rm(partialPath, { force: true }).catch(() => {});
	}
}

async function renderPreparedRequest({
	prepared,
	cacheDirectory,
	ffmpegPath,
	signal,
}: {
	prepared: PreparedQcutAudioRequest;
	cacheDirectory: string;
	ffmpegPath: string;
	signal?: AbortSignal;
}): Promise<RenderedArtifact> {
	const { outputPath, manifestPath } = qcutAudioArtifactPaths({
		cacheKey: prepared.cacheKey,
		cacheDirectory,
	});
	const partialPath = path.join(
		cacheDirectory,
		`${prepared.cacheKey}.${process.pid}-${Date.now()}.partial.flac`
	);
	await fs.promises.mkdir(cacheDirectory, { recursive: true });
	try {
		const command = buildQcutAudioProcessCommand({
			request: prepared.request,
			outputPath: partialPath,
		});
		await runFfmpeg({ ffmpegPath, args: command.args, signal });
		const stat = await fs.promises.stat(partialPath);
		if (!stat.isFile() || stat.size <= 0) {
			throw new Error("QCut local audio processing returned an empty file");
		}
		const outputSha256 = await sha256File({ filePath: partialPath });
		const manifest: QcutAudioArtifactManifest = {
			schemaVersion: 1,
			cacheKey: prepared.cacheKey,
			createdAt: new Date().toISOString(),
			provider: "qcut",
			engine: QCUT_AUDIO_RUNTIME_ID,
			sourceSha256: prepared.sourceSha256,
			settingsSha256: prepared.settingsSha256,
			outputSha256,
			fileSize: stat.size,
			format: "flac",
			sampleRate: 48_000,
			channels: 2,
		};
		await fs.promises.rm(outputPath, { force: true });
		await fs.promises.rename(partialPath, outputPath);
		await writeJsonAtomically({ value: manifest, filePath: manifestPath });
		await cleanupQcutAudioCache({ keepPath: outputPath, cacheDirectory });
		return { outputPath, manifestPath, manifest };
	} finally {
		await fs.promises.rm(partialPath, { force: true }).catch(() => {});
	}
}

function processResult({
	requestId,
	artifact,
	cacheHit,
}: {
	requestId: string;
	artifact: RenderedArtifact;
	cacheHit: boolean;
}): QcutAudioProcessResult {
	return {
		requestId,
		outputPath: artifact.outputPath,
		manifestPath: artifact.manifestPath,
		cacheKey: artifact.manifest.cacheKey,
		cacheHit,
		fileSize: artifact.manifest.fileSize,
		sha256: artifact.manifest.outputSha256,
		provider: "qcut",
		engine: QCUT_AUDIO_RUNTIME_ID,
	};
}

export async function processQcutAudio({
	request,
	cacheDirectory = getQcutAudioCacheDirectory(),
	ffmpegPath = getFFmpegPath(),
}: {
	request: QcutAudioProcessRequest;
	cacheDirectory?: string;
	ffmpegPath?: string;
}): Promise<QcutAudioProcessResult> {
	const prepared = await prepareQcutAudioProcessRequest({ request });
	const cached = readQcutAudioArtifact({
		cacheKey: prepared.cacheKey,
		cacheDirectory,
	});
	if (cached) {
		return processResult({
			requestId: request.requestId,
			artifact: cached,
			cacheHit: true,
		});
	}
	const activeKey = `${path.resolve(cacheDirectory)}\u0000${prepared.cacheKey}`;
	let job = activeJobs.get(activeKey);
	if (!job) {
		const controller = new AbortController();
		const promise = renderPreparedRequest({
			prepared,
			cacheDirectory,
			ffmpegPath,
			signal: controller.signal,
		});
		job = { promise, owners: new Set(), cancel: () => controller.abort() };
		activeJobs.set(activeKey, job);
		void promise.finally(() => activeJobs.delete(activeKey)).catch(() => {});
	}
	job.owners.add(request.requestId);
	jobKeysByRequestId.set(request.requestId, activeKey);
	try {
		const artifact = await job.promise;
		return processResult({
			requestId: request.requestId,
			artifact,
			cacheHit: false,
		});
	} finally {
		job.owners.delete(request.requestId);
		if (jobKeysByRequestId.get(request.requestId) === activeKey) {
			jobKeysByRequestId.delete(request.requestId);
		}
	}
}

/**
 * Cancels the render behind a requestId. The underlying FFmpeg job is shared
 * between identical concurrent requests, so it is only killed once its last
 * owner cancels. Returns false when the request is unknown or already settled.
 */
export function cancelQcutAudioProcess({
	requestId,
}: {
	requestId: string;
}): boolean {
	const activeKey = jobKeysByRequestId.get(requestId);
	if (!activeKey) return false;
	jobKeysByRequestId.delete(requestId);
	const job = activeJobs.get(activeKey);
	if (!job) return false;
	job.owners.delete(requestId);
	if (job.owners.size === 0) job.cancel();
	return true;
}
