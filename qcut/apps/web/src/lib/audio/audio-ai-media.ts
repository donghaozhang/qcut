import { platform } from "@qcut/platform-core";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useMediaStore } from "@/stores/media/media-store";
import { falAIClient } from "@/lib/ai-clients/fal-ai-client";
import type { RemoteAudioFile } from "./audio-ai-service";

const MAX_INLINE_AUDIO_BYTES = 6 * 1024 * 1024;

function isPublicHttpUrl(value: string | undefined): value is string {
	return Boolean(value && /^https?:\/\//i.test(value));
}

function extensionForContentType(contentType: string | undefined): string {
	if (contentType?.includes("wav")) return "wav";
	if (contentType?.includes("flac")) return "flac";
	if (contentType?.includes("ogg")) return "ogg";
	if (contentType?.includes("aac")) return "aac";
	if (contentType?.includes("mp4")) return "m4a";
	return "mp3";
}

function safeFileName({
	name,
	contentType,
}: {
	name: string;
	contentType?: string;
}): string {
	const cleaned = name
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (/\.[a-zA-Z0-9]{2,5}$/.test(cleaned)) return cleaned;
	return `${cleaned || "processed-audio"}.${extensionForContentType(contentType)}`;
}

async function localAudioFileFromMedia({
	mediaItem,
}: {
	mediaItem: MediaItem;
}): Promise<File> {
	if (mediaItem.type === "audio" && mediaItem.file?.size > 0) {
		return mediaItem.file;
	}

	if (mediaItem.type === "audio" && mediaItem.localPath) {
		const data = await platform().files.readFile(mediaItem.localPath);
		if (!data) throw new Error(`Unable to read ${mediaItem.name}`);
		return new File([new Uint8Array(data)], mediaItem.name, {
			type: mediaItem.file?.type || "audio/mpeg",
		});
	}

	if (mediaItem.type !== "video") {
		throw new Error("The selected clip has no readable audio source");
	}
	if (!platform().isElectron) {
		throw new Error("AI processing for video clip audio requires QCut Desktop");
	}
	let videoPath = mediaItem.localPath;
	if (!videoPath && mediaItem.file?.size > 0) {
		videoPath = await platform().video.saveTemp(
			new Uint8Array(await mediaItem.file.arrayBuffer()),
			mediaItem.name
		);
	}
	if (!videoPath) throw new Error(`Unable to read ${mediaItem.name}`);
	const extracted = await platform().ffmpeg.extractAudio({
		videoPath,
		format: "wav",
	});
	const data = await platform().files.readFile(extracted.audioPath);
	if (!data) throw new Error("Unable to read extracted clip audio");
	return new File([new Uint8Array(data)], `${mediaItem.name}-audio.wav`, {
		type: "audio/wav",
	});
}

function fileAsDataUrl({ file }: { file: File }): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}
			reject(new Error(`Unable to encode ${file.name}`));
		};
		reader.onerror = () =>
			reject(reader.error ?? new Error(`Unable to read ${file.name}`));
		reader.readAsDataURL(file);
	});
}

async function uploadOrInlineAudio({ file }: { file: File }): Promise<string> {
	try {
		return await falAIClient.uploadAudioToFal(file);
	} catch (uploadError) {
		if (file.size <= MAX_INLINE_AUDIO_BYTES) {
			return fileAsDataUrl({ file });
		}
		const message =
			uploadError instanceof Error ? uploadError.message : String(uploadError);
		throw new Error(
			`Audio upload failed and ${file.name} is too large for proxy fallback: ${message}`
		);
	}
}

export function audioFileToFalUrl({ file }: { file: File }): Promise<string> {
	return uploadOrInlineAudio({ file });
}

export async function mediaItemToFalAudioUrl({
	mediaItem,
}: {
	mediaItem: MediaItem;
}): Promise<string> {
	if (mediaItem.type === "audio") {
		if (isPublicHttpUrl(mediaItem.originalUrl)) return mediaItem.originalUrl;
		if (isPublicHttpUrl(mediaItem.url)) return mediaItem.url;
	}
	const file = await localAudioFileFromMedia({ mediaItem });
	return uploadOrInlineAudio({ file });
}

async function downloadRemoteAudio({
	remote,
	name,
	signal,
}: {
	remote: RemoteAudioFile;
	name: string;
	signal?: AbortSignal;
}): Promise<{ file: File; previewUrl: string }> {
	const fileName = safeFileName({
		name: remote.fileName || name,
		contentType: remote.contentType,
	});
	try {
		const response = await fetch(remote.url, { signal });
		if (!response.ok) throw new Error(`Download failed (${response.status})`);
		const blob = await response.blob();
		if (signal?.aborted) throw new Error("Audio processing was cancelled");
		const file = new File([blob], fileName, {
			type: remote.contentType || blob.type || "audio/mpeg",
		});
		return { file, previewUrl: URL.createObjectURL(file) };
	} catch (error) {
		if (signal?.aborted) throw error;
		return {
			file: new File([], fileName, {
				type: remote.contentType || "audio/mpeg",
			}),
			previewUrl: remote.url,
		};
	}
}

export async function addRemoteAudioMedia({
	projectId,
	remote,
	name,
	duration,
	metadata,
	signal,
}: {
	projectId: string;
	remote: RemoteAudioFile;
	name: string;
	duration: number;
	metadata: Record<string, unknown>;
	signal?: AbortSignal;
}): Promise<string> {
	const downloaded = await downloadRemoteAudio({ remote, name, signal });
	if (signal?.aborted) throw new Error("Audio processing was cancelled");
	return useMediaStore.getState().addMediaItem(projectId, {
		name: downloaded.file.name,
		type: "audio",
		file: downloaded.file,
		url: downloaded.previewUrl,
		originalUrl: remote.url,
		duration: remote.duration ?? duration,
		metadata,
	});
}
