/**
 * Claude Transcription HTTP Handler
 * Exposes ElevenLabs/Gemini transcription over HTTP for Claude Code.
 *
 * Resolves media from projectId + mediaId, extracts audio if video,
 * then calls the appropriate transcription provider.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { app } from "electron";
import { getMediaInfo } from "./claude-media-handler.js";
import { claudeLog } from "../utils/logger.js";
import { sanitizeProjectId, isValidSourcePath } from "../utils/helpers.js";
import { getFFmpegPath, getFFprobePath } from "../../ffmpeg/utils.js";
import { getDecryptedApiKeys } from "../../api-key-handler.js";
import type {
	TranscribeJob,
	TranscribeRequest,
	TranscriptionResult,
	TranscriptionWord,
	TranscriptionSegment,
} from "../../types/claude-api";

const HANDLER_NAME = "Transcribe";
const TRANSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Video extensions that require audio extraction
const VIDEO_EXTENSIONS = new Set([
	".mp4",
	".mov",
	".avi",
	".mkv",
	".webm",
	".m4v",
	".wmv",
]);

/**
 * Resolve a mediaId to its file path and determine if audio extraction is needed.
 */
async function resolveMediaPath(
	projectId: string,
	mediaId: string
): Promise<{ path: string; needsExtraction: boolean }> {
	const media = await getMediaInfo(projectId, mediaId);
	if (!media) {
		throw new Error(`Media not found: ${mediaId}`);
	}
	if (!existsSync(media.path)) {
		throw new Error(`Media file missing on disk: ${media.path}`);
	}
	const ext = media.name.slice(media.name.lastIndexOf(".")).toLowerCase();
	return {
		path: media.path,
		needsExtraction: VIDEO_EXTENSIONS.has(ext),
	};
}

/**
 * Resolve a raw file path and determine if audio extraction is needed.
 */
function resolveFilePath(filePath: string): {
	path: string;
	needsExtraction: boolean;
} {
	if (!isValidSourcePath(filePath)) {
		throw new Error(
			"Invalid file path: must be an absolute path without null bytes"
		);
	}
	if (!existsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}
	const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
	return {
		path: filePath,
		needsExtraction: VIDEO_EXTENSIONS.has(ext),
	};
}

/**
 * Check whether a video file contains at least one audio stream using ffprobe.
 */
async function hasAudioStream(videoPath: string): Promise<boolean> {
	const ffprobePath = await getFFprobePath();
	return new Promise((resolve) => {
		const proc = spawn(
			ffprobePath,
			[
				"-v",
				"error",
				"-select_streams",
				"a",
				"-show_entries",
				"stream=codec_type",
				"-of",
				"csv=p=0",
				videoPath,
			],
			{ windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
		);

		let stdout = "";
		proc.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});

		const timeout = setTimeout(() => {
			try {
				proc.kill("SIGTERM");
			} catch {
				/* ignore */
			}
			resolve(false);
		}, 10_000);

		proc.on("close", () => {
			clearTimeout(timeout);
			resolve(stdout.trim().length > 0);
		});

		proc.on("error", () => {
			clearTimeout(timeout);
			resolve(false);
		});
	});
}

/**
 * Extract audio from a video file using FFmpeg.
 * Returns path to the extracted audio file (mp3, low bitrate for transcription).
 */
export async function extractAudio(videoPath: string): Promise<string> {
	const hasAudio = await hasAudioStream(videoPath);
	if (!hasAudio) {
		throw new Error(`Video file has no audio stream to extract: ${videoPath}`);
	}

	const ffmpegPath = getFFmpegPath();
	let tempBase: string;
	try {
		tempBase = app.getPath("temp");
	} catch {
		tempBase = tmpdir();
	}
	const tempDir = join(tempBase, "qcut-transcribe");
	if (!existsSync(tempDir)) {
		mkdirSync(tempDir, { recursive: true });
	}

	const outputPath = join(tempDir, `audio-${Date.now()}.mp3`);

	return new Promise((resolve, reject) => {
		const proc = spawn(
			ffmpegPath,
			[
				"-i",
				videoPath,
				"-vn",
				"-acodec",
				"libmp3lame",
				"-ab",
				"64k",
				"-ar",
				"16000",
				"-ac",
				"1",
				"-y",
				outputPath,
			],
			{ windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
		);

		let stderr = "";
		let settled = false;

		const timeout = setTimeout(() => {
			if (!settled) {
				settled = true;
				try {
					proc.kill("SIGTERM");
				} catch {
					/* ignore */
				}
				reject(new Error("Audio extraction timed out (2 minutes)"));
			}
		}, 120_000);

		proc.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (code === 0 && existsSync(outputPath)) {
				resolve(outputPath);
			} else {
				// Extract meaningful error from stderr (skip FFmpeg banner, use last lines)
				const stderrLines = stderr.split("\n").filter((l) => l.trim());
				const lastLines = stderrLines.slice(-5).join("\n");
				const errorDetail = lastLines || stderr.slice(0, 300);
				reject(
					new Error(
						`Audio extraction failed (FFmpeg exit code ${code}). ` +
							`Input: ${videoPath}\n${errorDetail}`
					)
				);
			}
		});

		proc.on("error", (err) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(err);
		});
	});
}

/**
 * Upload a file to FAL storage for ElevenLabs transcription.
 */
async function uploadToFalStorage(
	filePath: string,
	apiKey: string
): Promise<string> {
	const { readFile } = await import("node:fs/promises");
	const { basename } = await import("node:path");

	const fileBuffer = await readFile(filePath);
	const fileName = basename(filePath);

	const initResponse = await fetch(
		"https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
		{
			method: "POST",
			headers: {
				Authorization: `Key ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				file_name: fileName,
				content_type: "audio/mpeg",
			}),
		}
	);

	if (!initResponse.ok) {
		const errorText = await initResponse.text();
		throw new Error(
			`FAL storage initiate failed: ${initResponse.status} ${errorText}`
		);
	}

	const initData = (await initResponse.json()) as {
		upload_url?: string;
		file_url?: string;
	};

	if (!initData.upload_url || !initData.file_url) {
		throw new Error("FAL storage did not return upload URLs");
	}

	const uploadResponse = await fetch(initData.upload_url, {
		method: "PUT",
		headers: { "Content-Type": "audio/mpeg" },
		body: new Uint8Array(fileBuffer),
	});

	if (!uploadResponse.ok) {
		throw new Error(`FAL storage upload failed: ${uploadResponse.status}`);
	}

	return initData.file_url;
}

/**
 * Call ElevenLabs Scribe v2 via FAL.
 */
async function transcribeWithElevenLabs(
	audioPath: string,
	language?: string,
	diarize = true
): Promise<TranscriptionResult> {
	const keys = await getDecryptedApiKeys();
	const apiKey = keys.falApiKey;
	if (!apiKey) {
		throw new Error(
			"FAL API key not configured. Go to Settings → API Keys to set it."
		);
	}

	claudeLog.info(HANDLER_NAME, "Uploading audio to FAL storage...");
	const audioUrl = await uploadToFalStorage(audioPath, apiKey);

	claudeLog.info(HANDLER_NAME, "Calling ElevenLabs Scribe v2...");
	const requestBody: Record<string, unknown> = {
		audio_url: audioUrl,
		diarize,
		tag_audio_events: true,
	};
	if (language) {
		requestBody.language_code = language;
	}

	const response = await fetch(
		"https://fal.run/fal-ai/elevenlabs/speech-to-text/scribe-v2",
		{
			method: "POST",
			headers: {
				Authorization: `Key ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
			signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
		}
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
	}

	const result = (await response.json()) as {
		text: string;
		language_code: string;
		words: Array<{
			text: string;
			start: number;
			end: number;
			type: string;
			speaker_id: string | null;
		}>;
	};

	// Convert to unified format
	const words: TranscriptionWord[] = (result.words || []).map((w) => ({
		text: w.text,
		start: w.start,
		end: w.end,
		type: w.type as TranscriptionWord["type"],
		speaker: w.speaker_id ?? undefined,
	}));

	const segments = buildSegments(words);
	const duration = words.length > 0 ? words[words.length - 1].end : 0;

	return {
		words,
		segments,
		language: result.language_code || "unknown",
		duration,
	};
}

/**
 * Call Gemini transcription.
 */
async function transcribeWithGemini(
	audioPath: string,
	language?: string
): Promise<TranscriptionResult> {
	const keys = await getDecryptedApiKeys();
	const apiKey = keys.geminiApiKey;
	if (!apiKey) {
		throw new Error(
			"Gemini API key not configured. Go to Settings → API Keys to set it."
		);
	}

	const { readFile } = await import("node:fs/promises");
	const { extname } = await import("node:path");

	const audioBuffer = await readFile(audioPath);
	const audioBase64 = audioBuffer.toString("base64");

	const ext = extname(audioPath).toLowerCase();
	const mimeTypeMap: Record<string, string> = {
		".wav": "audio/wav",
		".mp3": "audio/mp3",
		".webm": "audio/webm",
		".m4a": "audio/mp4",
		".aac": "audio/aac",
		".ogg": "audio/ogg",
		".flac": "audio/flac",
	};
	const mimeType = mimeTypeMap[ext] || "audio/mpeg";

	// Load Gemini SDK
	let GoogleGenerativeAI: any;
	try {
		const module = await import("@google/generative-ai");
		GoogleGenerativeAI = module.GoogleGenerativeAI;
	} catch {
		const { join: pathJoin } = await import("node:path");
		const modulePath = pathJoin(
			process.resourcesPath,
			"node_modules/@google/generative-ai/dist/index.js"
		);
		const module = await import(modulePath);
		GoogleGenerativeAI = module.GoogleGenerativeAI;
	}

	const genAI = new GoogleGenerativeAI(apiKey);
	const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

	const prompt = `Transcribe this audio into SRT subtitle format with precise timestamps.

Format requirements:
1. Number each subtitle block sequentially (1, 2, 3...)
2. Use timestamp format: HH:MM:SS,mmm --> HH:MM:SS,mmm
3. Each subtitle should be 1-2 sentences maximum
4. Add blank line between blocks
5. Language: ${language || "auto-detect"}

Provide ONLY the SRT content, no additional text.`;

	const result = await model.generateContent([
		prompt,
		{ inlineData: { mimeType, data: audioBase64 } },
	]);

	const srtContent = result.response.text();
	const segments = parseSrtToSegments(srtContent);
	const fullText = segments.map((s) => s.text).join(" ");

	// Gemini only provides segment-level, not word-level
	const words: TranscriptionWord[] = segments.map((s) => ({
		text: s.text,
		start: s.start,
		end: s.end,
		type: "word" as const,
	}));

	const duration = segments.length > 0 ? segments[segments.length - 1].end : 0;

	return {
		words,
		segments,
		language: language || "auto",
		duration,
	};
}

/**
 * Parse SRT content into segments.
 */
function parseSrtToSegments(srtContent: string): TranscriptionSegment[] {
	const blocks = srtContent.trim().split(/\n\n+/);
	const segments: TranscriptionSegment[] = [];

	for (const block of blocks) {
		const lines = block.split("\n");
		if (lines.length < 3) continue;

		const timestampMatch = lines[1]?.match(
			/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
		);
		if (!timestampMatch) continue;

		const start = parseTimestamp(timestampMatch.slice(1, 5));
		const end = parseTimestamp(timestampMatch.slice(5, 9));
		const text = lines.slice(2).join(" ");

		segments.push({ text, start, end });
	}

	return segments;
}

function parseTimestamp(parts: string[]): number {
	const [h, m, s, ms] = parts.map(Number);
	return h * 3600 + m * 60 + s + ms / 1000;
}

/**
 * Build segments from word-level data by grouping on pauses.
 */
function buildSegments(words: TranscriptionWord[]): TranscriptionSegment[] {
	const segments: TranscriptionSegment[] = [];
	let currentText = "";
	let segStart = -1;
	let segEnd = 0;

	for (const word of words) {
		if (word.type !== "word" && word.type !== "punctuation") {
			// On spacing/audio_event with gap > 0.5s, start new segment
			if (word.end - word.start > 0.5 && currentText.trim()) {
				segments.push({
					text: currentText.trim(),
					start: segStart,
					end: segEnd,
				});
				currentText = "";
				segStart = -1;
			}
			continue;
		}
		if (segStart < 0) segStart = word.start;
		segEnd = word.end;
		currentText += word.text;
	}

	if (currentText.trim() && segStart >= 0) {
		segments.push({ text: currentText.trim(), start: segStart, end: segEnd });
	}

	return segments;
}

// ============================================================================
// Async Job Tracking
// ============================================================================

const transcribeJobs = new Map<string, TranscribeJob>();
const MAX_TRANSCRIBE_JOBS = 50;

function pruneOldTranscribeJobs(): void {
	if (transcribeJobs.size <= MAX_TRANSCRIBE_JOBS) return;
	const entries = [...transcribeJobs.entries()].sort(
		(a, b) => a[1].createdAt - b[1].createdAt
	);
	const toRemove = entries.slice(0, entries.length - MAX_TRANSCRIBE_JOBS);
	for (const [id] of toRemove) {
		transcribeJobs.delete(id);
	}
}

/**
 * Start a transcription job. Returns immediately with a job ID.
 * The transcription runs in the background; poll with getTranscribeJobStatus().
 */
export function startTranscribeJob(
	projectId: string,
	request: TranscribeRequest
): { jobId: string } {
	const jobId = `transcribe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
	const provider = request.provider || "elevenlabs";

	const job: TranscribeJob = {
		jobId,
		projectId,
		mediaId: request.mediaId,
		status: "queued",
		progress: 0,
		message: "Queued",
		provider,
		createdAt: Date.now(),
	};

	transcribeJobs.set(jobId, job);
	pruneOldTranscribeJobs();

	claudeLog.info(
		HANDLER_NAME,
		`Job ${jobId} created: ${provider} for project ${projectId}, source ${request.source?.filePath || request.mediaId || "unknown"}`
	);

	// Fire-and-forget — run transcription in background
	runTranscription(jobId, projectId, request).catch((err) => {
		claudeLog.error(HANDLER_NAME, `Job ${jobId} unexpected error:`, err);
	});

	return { jobId };
}

/**
 * Get the current status of a transcription job.
 */
export function getTranscribeJobStatus(jobId: string): TranscribeJob | null {
	return transcribeJobs.get(jobId) ?? null;
}

/**
 * List all transcription jobs, sorted newest-first.
 */
export function listTranscribeJobs(): TranscribeJob[] {
	return [...transcribeJobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Cancel a running transcription job.
 */
export function cancelTranscribeJob(jobId: string): boolean {
	const job = transcribeJobs.get(jobId);
	if (!job || job.status === "completed" || job.status === "failed") {
		return false;
	}
	job.status = "cancelled";
	job.message = "Cancelled by user";
	job.completedAt = Date.now();
	claudeLog.info(HANDLER_NAME, `Job ${jobId} cancelled`);
	return true;
}

/** Run transcription in the background, updating job progress. */
async function runTranscription(
	jobId: string,
	projectId: string,
	request: TranscribeRequest
): Promise<void> {
	const job = transcribeJobs.get(jobId);
	if (!job) return;

	job.status = "processing";
	job.progress = 10;
	job.message = "Resolving media...";

	try {
		const result = await transcribeMedia(projectId, request, (progress) => {
			if (job.status === "cancelled") return;
			job.progress = progress.percent;
			job.message = progress.message;
		});

		if (transcribeJobs.get(jobId)?.status === "cancelled") return;

		job.status = "completed";
		job.progress = 100;
		job.message = "Transcription complete";
		job.result = result;
		job.completedAt = Date.now();

		claudeLog.info(
			HANDLER_NAME,
			`Job ${jobId} completed: ${result.segments.length} segments, ${result.duration}s`
		);

		// Auto-persist transcription for search
		const mediaId =
			request.mediaId ?? request.source?.mediaId;
		if (mediaId) {
			try {
				const { saveTranscription } = await import(
					"../http/claude-http-search-routes.js"
				);
				const media = await getMediaInfo(projectId, mediaId);
				saveTranscription(projectId, {
					version: 1,
					mediaId,
					mediaName: media?.name ?? mediaId,
					language: result.language ?? "en",
					duration: result.duration ?? 0,
					provider: job.provider ?? "elevenlabs",
					createdAt: Date.now(),
					text: result.segments.map((s) => s.text).join(" "),
					words: result.words ?? [],
					segments: result.segments ?? [],
				});
			} catch (err) {
				claudeLog.warn(
					HANDLER_NAME,
					`Failed to auto-persist transcription for job ${jobId}: ${err}`
				);
			}
		}
	} catch (err) {
		if (transcribeJobs.get(jobId)?.status === "cancelled") return;
		job.status = "failed";
		job.message = err instanceof Error ? err.message : "Transcription failed";
		job.completedAt = Date.now();
		claudeLog.error(HANDLER_NAME, `Job ${jobId} failed:`, err);
	}
}

/** For tests: clear all jobs. */
export function _clearTranscribeJobs(): void {
	transcribeJobs.clear();
}

/**
 * Main transcription function exposed to HTTP server.
 */
export async function transcribeMedia(
	projectId: string,
	request: TranscribeRequest,
	onProgress?: (progress: { percent: number; message: string }) => void
): Promise<TranscriptionResult> {
	const safeProjectId = sanitizeProjectId(projectId);
	const provider = request.provider || "elevenlabs";

	const sourceDesc = request.source?.filePath || request.mediaId || "unknown";
	claudeLog.info(
		HANDLER_NAME,
		`Transcription request: project=${safeProjectId}, source=${sourceDesc}, provider=${provider}`
	);

	// 1. Resolve media path — from source object or legacy mediaId
	onProgress?.({ percent: 10, message: "Resolving media..." });
	let resolved: { path: string; needsExtraction: boolean };
	if (request.source) {
		if (request.source.type === "path" && request.source.filePath) {
			resolved = resolveFilePath(request.source.filePath);
		} else if (request.source.type === "media" && request.source.mediaId) {
			resolved = await resolveMediaPath(safeProjectId, request.source.mediaId);
		} else {
			throw new Error(
				`Invalid source: type=${request.source.type}, provide filePath or mediaId`
			);
		}
	} else if (request.mediaId) {
		resolved = await resolveMediaPath(safeProjectId, request.mediaId);
	} else {
		throw new Error("Missing media source: provide 'source' or 'mediaId'");
	}
	const { path: mediaPath, needsExtraction } = resolved;
	claudeLog.info(HANDLER_NAME, `Resolved media: ${mediaPath}`);

	// 2. Extract audio if video
	let audioPath = mediaPath;
	if (needsExtraction) {
		onProgress?.({ percent: 25, message: "Extracting audio from video..." });
		claudeLog.info(HANDLER_NAME, "Extracting audio from video...");
		audioPath = await extractAudio(mediaPath);
		claudeLog.info(HANDLER_NAME, `Audio extracted: ${audioPath}`);
	}

	// 3. Call provider
	onProgress?.({ percent: 50, message: `Transcribing with ${provider}...` });
	if (provider === "gemini") {
		return transcribeWithGemini(audioPath, request.language);
	}
	return transcribeWithElevenLabs(
		audioPath,
		request.language,
		request.diarize ?? true
	);
}

// CommonJS export for compatibility
module.exports = {
	transcribeMedia,
	extractAudio,
	startTranscribeJob,
	getTranscribeJobStatus,
	listTranscribeJobs,
	cancelTranscribeJob,
	_clearTranscribeJobs,
};
