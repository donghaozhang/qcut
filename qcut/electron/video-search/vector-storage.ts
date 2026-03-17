/**
 * Project-scoped vector storage for video embeddings.
 * Stores as JSON files in projectDir/embeddings/.
 */

import fs from "node:fs";
import path from "node:path";

export interface StoredEmbedding {
	mediaId: string;
	mediaName: string;
	chunkIndex: number;
	startTime: number;
	endTime: number;
	vector: number[];
	dimensions: number;
	provider: string;
	createdAt: number;
}

export interface MediaEmbeddingFile {
	version: 1;
	mediaId: string;
	mediaName: string;
	provider: string;
	dimensions: number;
	chunkDuration: number;
	totalChunks: number;
	totalDuration: number;
	createdAt: number;
	embeddings: StoredEmbedding[];
}

function embeddingsDir(projectDir: string): string {
	return path.join(projectDir, "embeddings");
}

function embeddingFilePath(projectDir: string, mediaId: string): string {
	const sanitized = mediaId.replace(/[^a-zA-Z0-9_-]/g, "_");
	return path.join(embeddingsDir(projectDir), `${sanitized}.embeddings.json`);
}

function ensureDir(dir: string): void {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

/** Save embeddings for a media item. Atomic write via temp file + rename. */
export async function saveEmbeddings(
	projectDir: string,
	data: MediaEmbeddingFile,
): Promise<void> {
	const dir = embeddingsDir(projectDir);
	ensureDir(dir);

	const filePath = embeddingFilePath(projectDir, data.mediaId);
	const tmpPath = `${filePath}.tmp`;

	fs.writeFileSync(tmpPath, JSON.stringify(data), "utf-8");
	fs.renameSync(tmpPath, filePath);
}

/** Load embeddings for a single media item. Returns null if not found. */
export async function loadMediaEmbeddings(
	projectDir: string,
	mediaId: string,
): Promise<MediaEmbeddingFile | null> {
	const filePath = embeddingFilePath(projectDir, mediaId);
	if (!fs.existsSync(filePath)) return null;

	try {
		const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		return data as MediaEmbeddingFile;
	} catch {
		return null;
	}
}

/** Load ALL embeddings across all media in a project. */
export async function loadAllEmbeddings(
	projectDir: string,
): Promise<StoredEmbedding[]> {
	const dir = embeddingsDir(projectDir);
	if (!fs.existsSync(dir)) return [];

	const files = fs.readdirSync(dir).filter((f) => f.endsWith(".embeddings.json"));
	const all: StoredEmbedding[] = [];

	for (const file of files) {
		try {
			const data: MediaEmbeddingFile = JSON.parse(
				fs.readFileSync(path.join(dir, file), "utf-8"),
			);
			all.push(...data.embeddings);
		} catch {
			// Skip corrupt files
		}
	}

	return all;
}

/** Delete embeddings for a media item. */
export async function deleteEmbeddings(
	projectDir: string,
	mediaId: string,
): Promise<void> {
	const filePath = embeddingFilePath(projectDir, mediaId);
	if (fs.existsSync(filePath)) {
		fs.unlinkSync(filePath);
	}
}

/** List which media items have been indexed. */
export async function listIndexedMedia(
	projectDir: string,
): Promise<string[]> {
	const dir = embeddingsDir(projectDir);
	if (!fs.existsSync(dir)) return [];

	const ids: string[] = [];
	const files = fs.readdirSync(dir).filter((f) => f.endsWith(".embeddings.json"));

	for (const file of files) {
		try {
			const data: MediaEmbeddingFile = JSON.parse(
				fs.readFileSync(path.join(dir, file), "utf-8"),
			);
			ids.push(data.mediaId);
		} catch {
			// Skip corrupt files
		}
	}

	return ids;
}

/** Get the provider used for a media item's embeddings. */
export async function getEmbeddingProvider(
	projectDir: string,
	mediaId: string,
): Promise<string | null> {
	const data = await loadMediaEmbeddings(projectDir, mediaId);
	return data?.provider ?? null;
}
