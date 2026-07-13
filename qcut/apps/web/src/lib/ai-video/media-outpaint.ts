import { platform } from "@qcut/platform-core";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement } from "@/types/timeline";

export const MEDIA_OUTPAINT_MODEL = "luma_ray_3_2_reframe";
export const MEDIA_OUTPAINT_MAX_SOURCE_SECONDS = 30;
export const MEDIA_OUTPAINT_ASPECT_RATIOS = [
	"3:4",
	"4:3",
	"1:1",
	"9:16",
	"16:9",
	"21:9",
] as const;
export const MEDIA_OUTPAINT_RESOLUTIONS = ["540p", "720p", "1080p"] as const;

export type MediaOutpaintAspectRatio =
	(typeof MEDIA_OUTPAINT_ASPECT_RATIOS)[number];
export type MediaOutpaintResolution =
	(typeof MEDIA_OUTPAINT_RESOLUTIONS)[number];

export interface MediaOutpaintRequest {
	prompt: string;
	aspectRatio: MediaOutpaintAspectRatio;
	resolution: MediaOutpaintResolution;
}

export interface MediaOutpaintClipSnapshot {
	mediaId: string;
	name: string;
	duration: number;
	trimStart: number;
	trimEnd: number;
}

export interface PreparedMediaOutpaintSource {
	path: string;
	sessionId: string;
	cleanup: () => Promise<void>;
}

type OutpaintFFmpegAPI = Pick<
	ReturnType<typeof platform>["ffmpeg"],
	"createExportSession" | "exportVideoCLI" | "cleanupExportSession"
>;

export function getMediaOutpaintSourceRange({
	element,
}: {
	element: Pick<MediaElement, "duration" | "trimStart" | "trimEnd">;
}): { start: number; end: number; duration: number } {
	const start = Math.max(0, element.trimStart);
	const end = Math.max(start, element.duration - element.trimEnd);
	return { start, end, duration: Math.max(0, end - start) };
}

function ratioValue({ ratio }: { ratio: MediaOutpaintAspectRatio }): number {
	const [width, height] = ratio.split(":").map(Number);
	return width / height;
}

export function closestMediaOutpaintAspectRatio({
	width,
	height,
}: {
	width: number;
	height: number;
}): MediaOutpaintAspectRatio {
	if (!(width > 0) || !(height > 0)) return "16:9";
	const target = width / height;
	let closest: MediaOutpaintAspectRatio = "16:9";
	let smallestDistance = Number.POSITIVE_INFINITY;
	for (const ratio of MEDIA_OUTPAINT_ASPECT_RATIOS) {
		const distance = Math.abs(Math.log(target / ratioValue({ ratio })));
		if (distance >= smallestDistance) continue;
		closest = ratio;
		smallestDistance = distance;
	}
	return closest;
}

export function mediaOutpaintValidationError({
	element,
	mediaItem,
	projectId,
	request,
}: {
	element: MediaElement;
	mediaItem?: MediaItem;
	projectId?: string;
	request: MediaOutpaintRequest;
}): string | null {
	if (!projectId) return "请先打开一个项目";
	if (!mediaItem || mediaItem.type !== "video") return "请选择一个视频片段";
	if (!request.prompt.trim()) return "请描述需要补全的新画面";
	const range = getMediaOutpaintSourceRange({ element });
	if (range.duration <= 0) return "所选片段没有可处理的画面";
	if (range.duration > MEDIA_OUTPAINT_MAX_SOURCE_SECONDS + 0.001) {
		return `AI 扩图最多处理 ${MEDIA_OUTPAINT_MAX_SOURCE_SECONDS} 秒，请先缩短片段`;
	}
	return null;
}

export function buildMediaOutpaintArgs({
	request,
	videoPath,
}: {
	request: MediaOutpaintRequest;
	videoPath: string;
}): Record<string, string | number | boolean> {
	return {
		model: MEDIA_OUTPAINT_MODEL,
		text: request.prompt.trim(),
		"video-url": videoPath,
		"aspect-ratio": request.aspectRatio,
		resolution: request.resolution,
	};
}

export function mediaOutpaintClipSnapshot({
	element,
}: {
	element: MediaElement;
}): MediaOutpaintClipSnapshot {
	return {
		mediaId: element.mediaId,
		name: element.name,
		duration: element.duration,
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
	};
}

export function mediaOutpaintReplacementUpdates({
	generatedMedia,
	sourceDuration,
}: {
	generatedMedia: Pick<MediaItem, "id" | "name">;
	sourceDuration: number;
}) {
	return {
		mediaId: generatedMedia.id,
		name: generatedMedia.name,
		duration: sourceDuration,
		trimStart: 0,
		trimEnd: 0,
	};
}

export function mediaOutpaintRequestFromPayload({
	payload,
}: {
	payload: Record<string, unknown>;
}): MediaOutpaintRequest | null {
	const prompt = payload.prompt;
	const aspectRatio = payload.aspectRatio;
	const resolution = payload.resolution;
	if (
		typeof prompt !== "string" ||
		typeof aspectRatio !== "string" ||
		typeof resolution !== "string" ||
		!MEDIA_OUTPAINT_ASPECT_RATIOS.some((value) => value === aspectRatio) ||
		!MEDIA_OUTPAINT_RESOLUTIONS.some((value) => value === resolution)
	) {
		return null;
	}
	return {
		prompt,
		aspectRatio: aspectRatio as MediaOutpaintAspectRatio,
		resolution: resolution as MediaOutpaintResolution,
	};
}

export async function ensureMediaOutpaintLocalSource({
	mediaItem,
}: {
	mediaItem: MediaItem;
}): Promise<string> {
	if (mediaItem.localPath) return mediaItem.localPath;
	const fileData = new Uint8Array(await mediaItem.file.arrayBuffer());
	const localPath = await platform().video.saveTemp(
		fileData,
		`outpaint-source-${mediaItem.file.name}`
	);
	if (!localPath) throw new Error("无法准备本地视频源");
	return localPath;
}

export async function prepareMediaOutpaintSource({
	element,
	mediaItem,
	sourcePath,
	fps,
	ffmpeg,
}: {
	element: MediaElement;
	mediaItem: MediaItem;
	sourcePath: string;
	fps: number;
	ffmpeg?: OutpaintFFmpegAPI;
}): Promise<PreparedMediaOutpaintSource> {
	const api = ffmpeg ?? platform().ffmpeg;
	const range = getMediaOutpaintSourceRange({ element });
	const session = await api.createExportSession();
	try {
		const result = await api.exportVideoCLI({
			sessionId: session.sessionId,
			width: mediaItem.width ?? 1920,
			height: mediaItem.height ?? 1080,
			fps: mediaItem.fps ?? fps,
			quality: "high",
			duration: range.duration,
			useDirectCopy: false,
			useVideoInput: true,
			videoInputPath: sourcePath,
			trimStart: range.start,
			optimizationStrategy: "direct-video-with-filters",
		});
		const outputPath = result.outputFile ?? result.outputPath;
		if (!result.success || !outputPath) {
			throw new Error(result.error || "无法准备所选视频片段");
		}
		return {
			path: outputPath,
			sessionId: session.sessionId,
			cleanup: async () => {
				await api.cleanupExportSession(session.sessionId);
			},
		};
	} catch (error) {
		await api.cleanupExportSession(session.sessionId);
		throw error;
	}
}
