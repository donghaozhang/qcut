/**
 * YouTube upload handler for the native pipeline CLI.
 *
 * Uploads a video to YouTube using the YouTube Data API v3
 * resumable upload protocol.
 *
 * @module electron/native-pipeline/cli/cli-handlers-youtube
 */

import * as fs from "fs";
import * as path from "path";
import { getKey } from "../infra/key-manager.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

const LICENSE_SERVER_URL =
	process.env.QCUT_LICENSE_SERVER_URL ||
	"https://qcut-license-server.zdhpeter.workers.dev";

const SUPPORTED_FORMATS = new Set([".mp4", ".mov", ".webm", ".avi", ".mkv"]);
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

const MIME_TYPES: Record<string, string> = {
	".mp4": "video/mp4",
	".mov": "video/quicktime",
	".webm": "video/webm",
	".avi": "video/x-msvideo",
	".mkv": "video/x-matroska",
};

interface YouTubeUploadMetadata {
	snippet: {
		title: string;
		description: string;
		tags?: string[];
		categoryId: string;
	};
	status: {
		privacyStatus: "public" | "unlisted" | "private";
	};
}

/** Get the auth token for license server API calls. */
function getAuthToken(): string {
	const token = getKey("QCUT_AUTH_TOKEN");
	if (token) return token;
	return process.env.QCUT_AUTH_TOKEN || "";
}

/** Exchange the QCut session token for a Google access token via license server. */
async function getGoogleAccessToken(authToken: string): Promise<string> {
	const response = await fetch(`${LICENSE_SERVER_URL}/api/youtube/token`, {
		headers: { Authorization: `Bearer ${authToken}` },
		signal: AbortSignal.timeout(15_000),
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as Record<
			string,
			unknown
		> | null;
		const message = (body?.error as string) || `HTTP ${response.status}`;
		throw new Error(message);
	}

	const body = (await response.json()) as { accessToken?: string };
	if (!body.accessToken) {
		throw new Error("No access token in response");
	}
	return body.accessToken;
}

/** Initiate a resumable upload and return the upload URI. */
async function initiateResumableUpload(
	accessToken: string,
	metadata: YouTubeUploadMetadata,
	fileSize: number,
	mimeType: string
): Promise<string> {
	const response = await fetch(
		"https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json; charset=UTF-8",
				"X-Upload-Content-Length": String(fileSize),
				"X-Upload-Content-Type": mimeType,
			},
			body: JSON.stringify(metadata),
		}
	);

	if (!response.ok) {
		const errorBody = await response.text().catch(() => "");
		throw new Error(
			`Failed to initiate upload (${response.status}): ${errorBody}`
		);
	}

	const uploadUri = response.headers.get("location");
	if (!uploadUri) {
		throw new Error("No upload URI returned from YouTube API");
	}
	return uploadUri;
}

/** Upload file in chunks to the resumable upload URI. */
async function uploadFileInChunks(
	uploadUri: string,
	filePath: string,
	fileSize: number,
	mimeType: string,
	onProgress: ProgressFn
): Promise<Record<string, unknown>> {
	const fd = fs.openSync(filePath, "r");
	let offset = 0;

	try {
		while (offset < fileSize) {
			const chunkEnd = Math.min(offset + CHUNK_SIZE, fileSize);
			const chunkLength = chunkEnd - offset;
			const buffer = Buffer.alloc(chunkLength);
			fs.readSync(fd, buffer, 0, chunkLength, offset);

			const response = await fetch(uploadUri, {
				method: "PUT",
				headers: {
					"Content-Length": String(chunkLength),
					"Content-Type": mimeType,
					"Content-Range": `bytes ${offset}-${chunkEnd - 1}/${fileSize}`,
				},
				body: buffer,
			});

			if (response.status === 200 || response.status === 201) {
				// Upload complete
				const result = (await response.json()) as Record<string, unknown>;
				onProgress({
					stage: "complete",
					percent: 100,
					message: "Upload complete",
				});
				return result;
			}

			if (response.status === 308) {
				// Resume incomplete — continue uploading
				offset = chunkEnd;
				const percent = Math.round((offset / fileSize) * 100);
				onProgress({
					stage: "processing",
					percent,
					message: `Uploading: ${percent}%`,
				});
				continue;
			}

			// Unexpected status
			const errorBody = await response.text().catch(() => "");
			throw new Error(
				`Upload failed at offset ${offset} (${response.status}): ${errorBody}`
			);
		}
	} finally {
		fs.closeSync(fd);
	}

	throw new Error("Upload finished without completion response");
}

/** Upload a thumbnail image for the video. */
async function uploadThumbnail(
	accessToken: string,
	videoId: string,
	thumbnailPath: string
): Promise<void> {
	const data = fs.readFileSync(thumbnailPath);
	const ext = path.extname(thumbnailPath).toLowerCase();
	const mimeType =
		ext === ".png"
			? "image/png"
			: ext === ".jpg" || ext === ".jpeg"
				? "image/jpeg"
				: "image/png";

	const response = await fetch(
		`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": mimeType,
				"Content-Length": String(data.length),
			},
			body: data,
		}
	);

	if (!response.ok) {
		const errorBody = await response.text().catch(() => "");
		throw new Error(
			`Failed to upload thumbnail (${response.status}): ${errorBody}`
		);
	}
}

/** Main handler for the youtube:upload CLI command. */
export async function handleYouTubeUpload(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const filePath = options.input;
	const title = options.title;

	if (!filePath) {
		return { success: false, error: "Missing required flag: --input (-i)" };
	}
	if (!title) {
		return { success: false, error: "Missing required flag: --title (-t)" };
	}

	// Validate file
	const resolvedPath = path.resolve(filePath);
	if (!fs.existsSync(resolvedPath)) {
		return { success: false, error: `File not found: ${resolvedPath}` };
	}

	const ext = path.extname(resolvedPath).toLowerCase();
	if (!SUPPORTED_FORMATS.has(ext)) {
		return {
			success: false,
			error: `Unsupported format: ${ext}. Supported: ${[...SUPPORTED_FORMATS].join(", ")}`,
		};
	}

	const stat = fs.statSync(resolvedPath);
	const mimeType = MIME_TYPES[ext] || "video/mp4";

	// Get auth token
	const authToken = getAuthToken();
	if (!authToken) {
		return {
			success: false,
			error:
				"Not authenticated. Set QCUT_AUTH_TOKEN or run: bun run pipeline set-key --name QCUT_AUTH_TOKEN",
		};
	}

	onProgress({
		stage: "starting",
		percent: 0,
		message: "Authenticating with YouTube...",
	});

	// Exchange for Google access token
	let accessToken: string;
	try {
		accessToken = await getGoogleAccessToken(authToken);
	} catch (err) {
		return {
			success: false,
			error: `YouTube auth failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	// Parse tags
	const tags: string[] = [];
	if (options.data) {
		// --tags passed as comma-separated string via --data
		tags.push(
			...options.data
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean)
		);
	}

	// Build metadata
	const privacy =
		(options.mode as "public" | "unlisted" | "private") || "public";
	const categoryId = options.category || "22";
	const description = options.text || "";

	const metadata: YouTubeUploadMetadata = {
		snippet: {
			title,
			description,
			categoryId,
			...(tags.length > 0 ? { tags } : {}),
		},
		status: {
			privacyStatus: privacy,
		},
	};

	onProgress({
		stage: "processing",
		percent: 5,
		message: `Uploading ${path.basename(resolvedPath)} (${(stat.size / 1024 / 1024).toFixed(1)} MB)...`,
	});

	// Initiate resumable upload
	let uploadUri: string;
	try {
		uploadUri = await initiateResumableUpload(
			accessToken,
			metadata,
			stat.size,
			mimeType
		);
	} catch (err) {
		return {
			success: false,
			error: `Failed to initiate upload: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	// Upload file in chunks
	let result: Record<string, unknown>;
	try {
		result = await uploadFileInChunks(
			uploadUri,
			resolvedPath,
			stat.size,
			mimeType,
			onProgress
		);
	} catch (err) {
		return {
			success: false,
			error: `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	const videoId = result.id as string;
	const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

	// Upload thumbnail if provided
	let thumbnailWarning: string | undefined;
	if (options.image) {
		try {
			await uploadThumbnail(accessToken, videoId, path.resolve(options.image));
		} catch (err) {
			thumbnailWarning = `Thumbnail upload failed: ${err instanceof Error ? err.message : String(err)}`;
			console.error(`Warning: ${thumbnailWarning}`);
		}
	}

	return {
		success: true,
		data: {
			videoId,
			url: videoUrl,
			title,
			privacy,
			...(thumbnailWarning ? { warning: thumbnailWarning } : {}),
		},
	};
}
