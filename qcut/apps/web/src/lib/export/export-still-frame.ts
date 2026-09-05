import {
	renderFrame,
	type RenderContext,
} from "@/lib/export/export-engine-renderer";
import { saveExportedFile } from "@/lib/export/export-output";
import { getActiveElements } from "@/lib/export/export-engine-utils";
import { TEST_MEDIA_ID } from "@/constants/timeline-constants";
import { assertCoverCanvas } from "@qcut/editor-core/cover";
import { expandCompoundMediaTracks } from "@/lib/timeline/compound-media";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useMediaStore } from "@/stores/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { assertRestrictedMediaExportAllowed } from "../../../../../electron/types/restricted-media-export-policy";

export type StillFrameExportResult =
	| { ok: true; fileName: string; filePath?: string }
	| { ok: false; error: string };

export type StillFrameCaptureResult =
	| {
			ok: true;
			blob: Blob;
			projectId: string;
			projectName: string;
			sceneId: string;
			frame: number;
			fps: number;
			timeSeconds: number;
			width: number;
			height: number;
	  }
	| { ok: false; error: string };

function sanitizeFileName(name: string): string {
	const cleaned = name.replaceAll(/[\\/:*?"<>|]/g, "_").trim();
	return cleaned.length > 0 ? cleaned : "project";
}

/**
 * Export the composited frame at the playhead as a PNG at project
 * resolution, using the export renderer — never the window screenshot API.
 *
 * The output contains the timeline composition only (video, images, text,
 * captions, stickers, adjustment layers, effects, color grades, transforms).
 * Editing aids such as guides, rulers, and safe areas live outside the
 * render path, so they can never appear in the file. Known gap: clip
 * transitions are export-graph-only and are not rendered at the boundary
 * frame.
 */
export async function captureStillFrame(): Promise<StillFrameCaptureResult> {
	const project = useProjectStore.getState().activeProject;
	if (!project) {
		return { ok: false, error: "No active project" };
	}
	const tracks = structuredClone(useTimelineStore.getState().tracks);
	const mediaState = useMediaStore.getState();
	if (mediaState.isLoading)
		return { ok: false, error: "Media is still loading; retry frame capture" };
	const mediaItems = [...mediaState.mediaItems];
	try {
		const overlayMediaIds = useStickersOverlayStore
			.getState()
			.getStickersForExport()
			.map((sticker) => sticker.mediaItemId);
		assertRestrictedMediaExportAllowed({
			additionalMediaIds: overlayMediaIds,
			mediaItems,
			operation: "still-frame",
			scope: "timeline",
			tracks,
		});
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
	const currentTime = usePlaybackStore.getState().currentTime;
	const fps = project.fps ?? 30;
	const { width, height } = project.canvasSize;
	try {
		assertCoverCanvas({ width, height });
	} catch {
		return { ok: false, error: "Project canvas size is not set" };
	}
	if (
		!Number.isFinite(currentTime) ||
		currentTime < 0 ||
		!Number.isFinite(fps) ||
		fps <= 0 ||
		fps > 240
	) {
		return { ok: false, error: "Invalid frame time or FPS" };
	}
	const frame = Math.round(currentTime * fps);
	const timeSeconds = frame / fps;

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return { ok: false, error: "Unable to create render canvas" };
	}

	const context: RenderContext = {
		ctx,
		canvas,
		tracks: expandCompoundMediaTracks({ tracks }),
		mediaItems,
		videoCache: new Map(),
		imageCache: new Map(),
		usedImages: new Set(),
		fps,
		// Blur backdrops are preview-only; fall back to the stored project
		// color so blur-mode stills keep the project background instead of
		// silently going black.
		backgroundColor: project.backgroundColor,
	};

	try {
		const unavailable = getActiveElements(
			context.tracks,
			mediaItems,
			timeSeconds,
			fps
		).find(
			({ element, mediaItem }) =>
				element.type === "media" &&
				element.mediaId !== TEST_MEDIA_ID &&
				!mediaItem?.url
		);
		if (unavailable)
			throw new Error(
				`Frame media is missing or not loaded: ${unavailable.element.name}`
			);
		await renderFrame(context, timeSeconds);
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		for (const video of context.videoCache.values()) {
			video.src = "";
			video.load();
		}
		context.videoCache.clear();
	}

	const blob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, "image/png");
	});
	if (!blob) {
		return { ok: false, error: "Unable to encode PNG" };
	}

	return {
		ok: true,
		blob,
		projectId: project.id,
		projectName: project.name,
		sceneId: project.currentSceneId,
		frame,
		fps,
		timeSeconds,
		width,
		height,
	};
}

export async function exportStillFrame(): Promise<StillFrameExportResult> {
	const capture = await captureStillFrame();
	if (!capture.ok) return capture;
	const fileName = `${sanitizeFileName(capture.projectName)}-frame-${capture.frame}.png`;
	const saved = await saveExportedFile(capture.blob, fileName);
	if (!saved.success) {
		return { ok: false, error: saved.error ?? "Unable to save PNG" };
	}
	return { ok: true, fileName, filePath: saved.filePath };
}
