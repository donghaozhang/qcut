import { platform } from "@qcut/platform-core";
import { getOrCreateObjectURL } from "@/lib/media/blob-manager";
import {
	getMediaDuration,
	useMediaStore,
	type MediaItem,
} from "@/stores/media/media-store";
import type { SoundEffect } from "@/types/sounds";

export interface AiMusicPromptInput {
	style: string;
	mood: string;
	scene: string;
	targetDuration: number;
	bpm: number;
}

export function buildAiMusicPrompt({
	style,
	mood,
	scene,
	targetDuration,
	bpm,
}: AiMusicPromptInput): string {
	return [
		style.trim(),
		mood.trim() && `${mood.trim()} mood`,
		scene.trim() && `for ${scene.trim()}`,
		`${Math.round(bpm)} BPM`,
		`approximately ${Math.round(targetDuration)} seconds`,
		"clean edit-friendly ending",
	]
		.filter(Boolean)
		.join(", ")
		.slice(0, 300);
}

function contentTypeForPath({ outputPath }: { outputPath: string }): string {
	const extension = outputPath.split(".").pop()?.toLocaleLowerCase();
	if (extension === "wav") return "audio/wav";
	if (extension === "ogg") return "audio/ogg";
	if (extension === "m4a") return "audio/mp4";
	return "audio/mpeg";
}

function outputFileName({ outputPath }: { outputPath: string }): string {
	return outputPath.split(/[\\/]/).pop() || `ai-music-${Date.now()}.mp3`;
}

export async function importGeneratedMusic({
	projectId,
	outputPath,
	prompt,
	model,
	instrumental,
	targetDuration,
	bpm,
}: {
	projectId: string;
	outputPath: string;
	prompt: string;
	model: string;
	instrumental: boolean;
	targetDuration: number;
	bpm: number;
}): Promise<MediaItem> {
	const data = await platform().files.readFile(outputPath);
	if (!data) throw new Error("Unable to read generated music output");
	const contentType = contentTypeForPath({ outputPath });
	const file = new File(
		[new Uint8Array(data)],
		outputFileName({ outputPath }),
		{
			type: contentType,
		}
	);
	const duration = await getMediaDuration(file).catch(() => targetDuration);
	const url = getOrCreateObjectURL(file, "ai-music-result");
	const mediaId = await useMediaStore.getState().addMediaItem(projectId, {
		name: file.name,
		type: "audio",
		file,
		url,
		duration,
		metadata: {
			source: "ai-music",
			prompt,
			model,
			instrumental,
			targetDuration,
			bpm,
		},
	});
	const mediaItem = useMediaStore
		.getState()
		.mediaItems.find((item) => item.id === mediaId);
	if (!mediaItem)
		throw new Error("Generated music was not added to the project");
	return mediaItem;
}

function stableProjectAudioId({ mediaId }: { mediaId: string }): number {
	let hash = 2_166_136_261;
	for (const char of mediaId) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16_777_619);
	}
	return -Math.max(1, hash >>> 0);
}

export function projectAudioToSound({
	mediaItem,
}: {
	mediaItem: MediaItem;
}): SoundEffect {
	const metadata = mediaItem.metadata ?? {};
	const isAiMusic = metadata.source === "ai-music";
	const bpm = typeof metadata.bpm === "number" ? metadata.bpm : undefined;
	return {
		id: stableProjectAudioId({ mediaId: mediaItem.id }),
		mediaId: mediaItem.id,
		name: mediaItem.name,
		description:
			typeof metadata.prompt === "string" ? metadata.prompt : "Project audio",
		url: mediaItem.url ?? "",
		previewUrl: mediaItem.url,
		downloadUrl: mediaItem.url,
		duration: mediaItem.duration ?? 0,
		filesize: mediaItem.file?.size ?? 0,
		type: "audio",
		channels: 2,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 44_100,
		username: isAiMusic ? "MiniMax Music" : "QCut Project",
		tags: isAiMusic ? ["ai", "music", "project"] : ["project", "audio"],
		license: isAiMusic ? "AI generated" : "Project media",
		created: new Date(mediaItem.file?.lastModified ?? Date.now()).toISOString(),
		downloads: 0,
		rating: 0,
		ratingCount: 0,
		source: "project",
		kind: "music",
		bpm,
		moods: isAiMusic ? ["AI generated"] : undefined,
		scenes: ["project"],
		loopable: false,
		artworkColors: isAiMusic ? ["#166534", "#86efac"] : ["#374151", "#d1d5db"],
	};
}
