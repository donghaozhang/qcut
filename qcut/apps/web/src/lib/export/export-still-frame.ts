import {
	renderFrame,
	type RenderContext,
} from "@/lib/export/export-engine-renderer";
import { saveExportedFile } from "@/lib/export/export-output";
import { expandCompoundMediaTracks } from "@/lib/timeline/compound-media";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useMediaStore } from "@/stores/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

export type StillFrameExportResult =
	| { ok: true; fileName: string; filePath?: string }
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
export async function exportStillFrame(): Promise<StillFrameExportResult> {
	const project = useProjectStore.getState().activeProject;
	if (!project) {
		return { ok: false, error: "No active project" };
	}
	const { tracks } = useTimelineStore.getState();
	const mediaItems = useMediaStore.getState().mediaItems;
	const currentTime = usePlaybackStore.getState().currentTime;
	const fps = project.fps ?? 30;
	const { width, height } = project.canvasSize;
	if (width < 2 || height < 2) {
		return { ok: false, error: "Project canvas size is not set" };
	}

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
		usedImages: new Set(),
		fps,
		// Blur backdrops are preview-only; fall back to the stored project
		// color so blur-mode stills keep the project background instead of
		// silently going black.
		backgroundColor: project.backgroundColor,
	};

	try {
		await renderFrame(context, currentTime);
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

	const frame = Math.round(currentTime * fps);
	const fileName = `${sanitizeFileName(project.name)}-frame-${frame}.png`;
	const saved = await saveExportedFile(blob, fileName);
	if (!saved.success) {
		return { ok: false, error: saved.error ?? "Unable to save PNG" };
	}
	return { ok: true, fileName, filePath: saved.filePath };
}
