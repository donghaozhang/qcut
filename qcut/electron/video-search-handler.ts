/**
 * Video Semantic Search — IPC Handler
 *
 * Handles video indexing (chunk → embed → store) and semantic search
 * (query → embed → KNN cosine → results).
 *
 * @module electron/video-search-handler
 */

import { ipcMain, app, BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import type { EmbeddingProvider } from "./video-search/embedding-provider.js";
import { GeminiEmbeddingProvider } from "./video-search/gemini-embedding-provider.js";
import {
	chunkVideo,
	cleanupChunks,
	type VideoChunk,
} from "./video-search/video-chunker.js";
import {
	saveEmbeddings,
	loadMediaEmbeddings,
	loadAllEmbeddings,
	deleteEmbeddings,
	listIndexedMedia,
	type StoredEmbedding,
	type MediaEmbeddingFile,
} from "./video-search/vector-storage.js";
import {
	searchEmbeddings,
	type SearchOptions,
	type SearchResult,
} from "./video-search/cosine-search.js";
import { getFFmpegPath } from "./ffmpeg/utils.js";

const LOG_PREFIX = "[VideoSearch]";

interface IndexProgress {
	phase: "chunking" | "embedding" | "saving";
	current: number;
	total: number;
	mediaId?: string;
	mediaName?: string;
}

interface IndexResult {
	status: "indexed" | "already-indexed" | "cancelled" | "error";
	mediaId: string;
	chunks?: number;
	error?: string;
}

// Active indexing abort controllers (keyed by projectId)
const activeAbortControllers = new Map<string, AbortController>();

// Embedding cache (keyed by projectDir, cleared on new indexing)
let embeddingCache: {
	projectDir: string;
	embeddings: StoredEmbedding[];
} | null = null;

function getProjectDir(projectId: string): string {
	const sanitized = projectId.replace(/[/\\]/g, "").replace(/\.\./g, "");
	return path.join(app.getPath("documents"), "QCut", "Projects", sanitized);
}

function getProvider(): EmbeddingProvider {
	return new GeminiEmbeddingProvider();
}

function invalidateCache(): void {
	embeddingCache = null;
}

async function getCachedEmbeddings(
	projectDir: string
): Promise<StoredEmbedding[]> {
	if (embeddingCache?.projectDir === projectDir) {
		return embeddingCache.embeddings;
	}
	const embeddings = await loadAllEmbeddings(projectDir);
	embeddingCache = { projectDir, embeddings };
	return embeddings;
}

/** Extract a single frame as a JPEG thumbnail. */
async function generateSearchThumbnail(
	projectDir: string,
	mediaPath: string,
	timeSeconds: number,
	mediaId: string
): Promise<string> {
	const cacheDir = path.join(projectDir, "cache", "search-thumbs");
	if (!fs.existsSync(cacheDir)) {
		fs.mkdirSync(cacheDir, { recursive: true });
	}

	const sanitizedId = mediaId.replace(/[^a-zA-Z0-9_-]/g, "_");
	const cachePath = path.join(
		cacheDir,
		`${sanitizedId}_${Math.floor(timeSeconds)}.jpg`
	);

	if (fs.existsSync(cachePath)) return cachePath;

	const ffmpegPath = getFFmpegPath();
	await new Promise<void>((resolve, reject) => {
		const proc = spawn(
			ffmpegPath,
			[
				"-ss",
				String(timeSeconds),
				"-i",
				mediaPath,
				"-frames:v",
				"1",
				"-vf",
				"scale=320:180:force_original_aspect_ratio=decrease",
				"-y",
				cachePath,
			],
			{ stdio: "pipe" }
		);
		proc.on("close", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`Thumbnail failed: code ${code}`))
		);
		proc.on("error", reject);
	});

	return cachePath;
}

/** Resolve media file path within a project. */
function resolveMediaPath(
	projectDir: string,
	mediaId: string,
	mediaName: string
): string | null {
	// Check imported media
	const importedDir = path.join(projectDir, "media", "imported");
	if (fs.existsSync(importedDir)) {
		const files = fs.readdirSync(importedDir);
		// Try exact name match first
		if (files.includes(mediaName)) {
			return path.join(importedDir, mediaName);
		}
		// Try matching by mediaId prefix
		const match = files.find((f) => f.startsWith(mediaId));
		if (match) return path.join(importedDir, match);
	}

	// Check generated videos
	const generatedDir = path.join(projectDir, "media", "generated", "videos");
	if (fs.existsSync(generatedDir)) {
		const files = fs.readdirSync(generatedDir);
		if (files.includes(mediaName)) {
			return path.join(generatedDir, mediaName);
		}
	}

	return null;
}

function getMainWindow(): BrowserWindow | null {
	const windows = BrowserWindow.getAllWindows();
	return windows[0] ?? null;
}

async function indexMedia(
	projectDir: string,
	mediaId: string,
	mediaPath: string,
	mediaName: string,
	totalDuration: number,
	signal?: AbortSignal
): Promise<IndexResult> {
	const provider = getProvider();

	const sendProgress = (progress: IndexProgress) => {
		getMainWindow()?.webContents.send("video-search:index-progress", progress);
	};

	// Check if already indexed with same provider
	const existing = await loadMediaEmbeddings(projectDir, mediaId);
	if (existing && existing.provider === provider.name) {
		return { status: "already-indexed", mediaId };
	}

	// Chunk video
	sendProgress({ phase: "chunking", current: 0, total: 1, mediaId, mediaName });
	let chunks: VideoChunk[] = [];

	try {
		chunks = await chunkVideo(mediaPath, totalDuration, undefined, signal);

		// Embed each chunk
		const embeddings: StoredEmbedding[] = [];
		for (let i = 0; i < chunks.length; i++) {
			if (signal?.aborted) {
				return { status: "cancelled", mediaId };
			}

			sendProgress({
				phase: "embedding",
				current: i + 1,
				total: chunks.length,
				mediaId,
				mediaName,
			});

			const result = await provider.embedVideo(chunks[i].path);
			embeddings.push({
				mediaId,
				mediaName,
				chunkIndex: i,
				startTime: chunks[i].startTime,
				endTime: chunks[i].endTime,
				vector: result.vector,
				dimensions: result.dimensions,
				provider: provider.name,
				createdAt: Date.now(),
			});
		}

		// Save
		sendProgress({ phase: "saving", current: 1, total: 1, mediaId, mediaName });
		await saveEmbeddings(projectDir, {
			version: 1,
			mediaId,
			mediaName,
			provider: provider.name,
			dimensions: embeddings[0]?.dimensions ?? 768,
			chunkDuration: 5,
			totalChunks: chunks.length,
			totalDuration,
			createdAt: Date.now(),
			embeddings,
		});

		invalidateCache();
		return { status: "indexed", mediaId, chunks: chunks.length };
	} finally {
		await cleanupChunks(chunks);
	}
}

/** Register all video search IPC handlers. */
export function setupVideoSearchIPC(): void {
	console.log(`${LOG_PREFIX} Registering IPC handlers`);

	// Index a single media item
	ipcMain.handle(
		"video-search:index-media",
		async (
			_,
			projectId: string,
			mediaId: string,
			mediaPath: string,
			mediaName: string,
			totalDuration: number
		) => {
			const projectDir = getProjectDir(projectId);
			const controller = new AbortController();
			activeAbortControllers.set(projectId, controller);

			try {
				return await indexMedia(
					projectDir,
					mediaId,
					mediaPath,
					mediaName,
					totalDuration,
					controller.signal
				);
			} catch (err) {
				console.error(`${LOG_PREFIX} Index error:`, err);
				return { status: "error", mediaId, error: String(err) } as IndexResult;
			} finally {
				activeAbortControllers.delete(projectId);
			}
		}
	);

	// Cancel indexing
	ipcMain.handle(
		"video-search:cancel-indexing",
		async (_, projectId: string) => {
			activeAbortControllers.get(projectId)?.abort();
		}
	);

	// Semantic search
	ipcMain.handle(
		"video-search:search",
		async (_, projectId: string, query: string, options?: SearchOptions) => {
			const projectDir = getProjectDir(projectId);
			const provider = getProvider();

			const available = await provider.isAvailable();
			if (!available) {
				return { results: [], error: "Gemini API key not configured" };
			}

			const embeddings = await getCachedEmbeddings(projectDir);
			if (embeddings.length === 0) {
				return { results: [], message: "No media indexed yet" };
			}

			const queryResult = await provider.embedText(query);
			const results = searchEmbeddings(queryResult.vector, embeddings, options);

			// Generate thumbnails for top results
			for (const result of results) {
				const midpoint = (result.startTime + result.endTime) / 2;
				const mediaPath = resolveMediaPath(
					projectDir,
					result.mediaId,
					result.mediaName
				);
				if (mediaPath) {
					try {
						(
							result as SearchResult & { thumbnailPath?: string }
						).thumbnailPath = await generateSearchThumbnail(
							projectDir,
							mediaPath,
							midpoint,
							result.mediaId
						);
					} catch {
						// Thumbnail generation is best-effort
					}
				}
			}

			return { results };
		}
	);

	// Get indexing status
	ipcMain.handle("video-search:index-status", async (_, projectId: string) => {
		const projectDir = getProjectDir(projectId);
		const indexedMediaIds = await listIndexedMedia(projectDir);
		return { indexedMediaIds };
	});

	// Delete index for a media item
	ipcMain.handle(
		"video-search:delete-index",
		async (_, projectId: string, mediaId: string) => {
			const projectDir = getProjectDir(projectId);
			await deleteEmbeddings(projectDir, mediaId);
			invalidateCache();
			return { ok: true };
		}
	);

	// Check provider availability
	ipcMain.handle("video-search:provider-status", async () => {
		const provider = getProvider();
		return {
			name: provider.name,
			available: await provider.isAvailable(),
		};
	});
}
