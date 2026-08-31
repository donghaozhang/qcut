/**
 * Native Jianying transition pass for canvas-rendered exports.
 *
 * The muxer engine renders jianying-local seams as hard cuts and then hands
 * its finished MP4 to the same native timeline renderer the CLI engine
 * uses: the file is staged in an export session directory, the desktop
 * bridge splits the decoded frames at each cut and renders the real
 * transition window, and the result is read back as the export blob.
 */

import { platform } from "@qcut/platform-core";
import type { TimelineTrack } from "@/types/timeline";
import type { VideoTransitionInput } from "../export-cli/types";
import { applyJianyingTimelineTransitions } from "./export-engine-cli-jianying";

const STAGED_VIDEO_NAME = "canvas-export.mp4";

interface ExportSessionDirectories {
	sessionId: string;
	outputDir?: string;
	frameDir?: string;
	framesDir?: string;
}

function resolveSessionDirectory({
	session,
}: {
	session: ExportSessionDirectories;
}): string {
	const directory = session.outputDir ?? session.frameDir ?? session.framesDir;
	if (!directory) {
		throw new Error(
			"Export session did not provide a working directory for the Jianying transition pass."
		);
	}
	return directory;
}

export async function applyJianyingTransitionsToRenderedVideo({
	blob,
	transitions,
	tracks,
	fps,
	width,
	height,
	onProgress,
}: {
	blob: Blob;
	transitions: VideoTransitionInput[];
	tracks: TimelineTrack[];
	fps: number;
	width: number;
	height: number;
	onProgress?: (percent: number, message: string) => void;
}): Promise<Blob> {
	if (transitions.length === 0) return blob;
	const ffmpeg = platform().ffmpeg;
	const session =
		(await ffmpeg.createExportSession()) as unknown as ExportSessionDirectories;
	try {
		const inputPath = `${resolveSessionDirectory({ session })}/${STAGED_VIDEO_NAME}`;
		const written = await platform().files.writeFile(
			inputPath,
			await blob.arrayBuffer()
		);
		if (!written) {
			throw new Error(
				`Could not stage the rendered video for the Jianying transition pass: ${inputPath}`
			);
		}
		const outputPath = await applyJianyingTimelineTransitions({
			inputPath,
			transitions,
			tracks,
			fps,
			width,
			height,
			onProgress,
		});
		const buffer = await ffmpeg.readOutputFile(outputPath);
		if (!buffer) {
			throw new Error(
				`The Jianying transition pass produced no readable output: ${outputPath}`
			);
		}
		return new Blob([buffer], { type: "video/mp4" });
	} finally {
		try {
			await ffmpeg.cleanupExportSession(session.sessionId);
		} catch {
			// Session cleanup is best-effort; the temp manager also expires sessions.
		}
	}
}
