import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement } from "@/types/timeline";
import {
	buildMediaOutpaintArgs,
	closestMediaOutpaintAspectRatio,
	getMediaOutpaintSourceRange,
	mediaOutpaintReplacementUpdates,
	mediaOutpaintRequestFromPayload,
	mediaOutpaintValidationError,
	prepareMediaOutpaintSource,
} from "../media-outpaint";

function createElement({
	duration = 12,
	trimStart = 2,
	trimEnd = 3,
}: {
	duration?: number;
	trimStart?: number;
	trimEnd?: number;
} = {}): MediaElement {
	return {
		id: "clip-1",
		type: "media",
		mediaId: "source-media",
		name: "Source",
		duration,
		startTime: 5,
		trimStart,
		trimEnd,
	};
}

function createMediaItem(): MediaItem {
	return {
		id: "source-media",
		name: "source.mp4",
		type: "video",
		file: new File(["video"], "source.mp4", { type: "video/mp4" }),
		localPath: "/project/source.mp4",
		width: 1080,
		height: 1920,
		fps: 30,
	};
}

describe("media outpaint", () => {
	it("finds the nearest supported ratio for the project canvas", () => {
		expect(closestMediaOutpaintAspectRatio({ width: 1920, height: 1080 })).toBe(
			"16:9"
		);
		expect(closestMediaOutpaintAspectRatio({ width: 1080, height: 1920 })).toBe(
			"9:16"
		);
		expect(closestMediaOutpaintAspectRatio({ width: 1000, height: 1000 })).toBe(
			"1:1"
		);
	});

	it("validates the visible source range instead of the full media duration", () => {
		const element = createElement({
			duration: 120,
			trimStart: 70,
			trimEnd: 25,
		});
		const request = {
			prompt: "extend the room naturally",
			aspectRatio: "16:9" as const,
			resolution: "720p" as const,
		};
		expect(getMediaOutpaintSourceRange({ element })).toEqual({
			start: 70,
			end: 95,
			duration: 25,
		});
		expect(
			mediaOutpaintValidationError({
				element,
				mediaItem: createMediaItem(),
				projectId: "project-1",
				request,
			})
		).toBeNull();

		element.trimEnd = 15;
		expect(
			mediaOutpaintValidationError({
				element,
				mediaItem: createMediaItem(),
				projectId: "project-1",
				request,
			})
		).toContain("30 秒");
	});

	it("builds the registered Luma reframe command and replacement updates", () => {
		expect(
			buildMediaOutpaintArgs({
				request: {
					prompt: "  continue the beach and sky  ",
					aspectRatio: "21:9",
					resolution: "1080p",
				},
				videoPath: "/tmp/selected-clip.mp4",
			})
		).toEqual({
			model: "luma_ray_3_2_reframe",
			text: "continue the beach and sky",
			"video-url": "/tmp/selected-clip.mp4",
			"aspect-ratio": "21:9",
			resolution: "1080p",
		});
		expect(
			mediaOutpaintReplacementUpdates({
				generatedMedia: { id: "generated", name: "outpaint.mp4" },
				sourceDuration: 7,
			})
		).toEqual({
			mediaId: "generated",
			name: "outpaint.mp4",
			duration: 7,
			trimStart: 0,
			trimEnd: 0,
		});
	});

	it("rejects malformed persisted task parameters", () => {
		expect(
			mediaOutpaintRequestFromPayload({
				payload: {
					prompt: "fill",
					aspectRatio: "2:1",
					resolution: "720p",
				},
			})
		).toBeNull();
		expect(
			mediaOutpaintRequestFromPayload({
				payload: {
					prompt: "fill",
					aspectRatio: "4:3",
					resolution: "540p",
				},
			})
		).toEqual({ prompt: "fill", aspectRatio: "4:3", resolution: "540p" });
	});

	it("renders the exact selected range into a temporary source and cleans it", async () => {
		const createExportSession = vi.fn().mockResolvedValue({
			sessionId: "outpaint-session",
			framesDir: "/tmp/frames",
		});
		const exportVideoCLI = vi.fn().mockResolvedValue({
			success: true,
			outputFile: "/tmp/outpaint-session/output.mp4",
		});
		const cleanupExportSession = vi.fn().mockResolvedValue(true);
		const prepared = await prepareMediaOutpaintSource({
			element: createElement(),
			mediaItem: createMediaItem(),
			sourcePath: "/project/source.mp4",
			fps: 24,
			ffmpeg: {
				createExportSession,
				exportVideoCLI,
				cleanupExportSession,
			},
		});

		expect(exportVideoCLI).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: "outpaint-session",
				duration: 7,
				trimStart: 2,
				useDirectCopy: false,
				useVideoInput: true,
				videoInputPath: "/project/source.mp4",
			})
		);
		expect(prepared.path).toBe("/tmp/outpaint-session/output.mp4");
		expect(cleanupExportSession).not.toHaveBeenCalled();
		await prepared.cleanup();
		expect(cleanupExportSession).toHaveBeenCalledWith("outpaint-session");
	});

	it("cleans the export session when source preparation fails", async () => {
		const cleanupExportSession = vi.fn().mockResolvedValue(true);
		await expect(
			prepareMediaOutpaintSource({
				element: createElement(),
				mediaItem: createMediaItem(),
				sourcePath: "/project/source.mp4",
				fps: 30,
				ffmpeg: {
					createExportSession: vi.fn().mockResolvedValue({
						sessionId: "failed-session",
						framesDir: "/tmp/frames",
					}),
					exportVideoCLI: vi.fn().mockResolvedValue({
						success: false,
						error: "ffmpeg failed",
					}),
					cleanupExportSession,
				},
			})
		).rejects.toThrow("ffmpeg failed");
		expect(cleanupExportSession).toHaveBeenCalledWith("failed-session");
	});
});
