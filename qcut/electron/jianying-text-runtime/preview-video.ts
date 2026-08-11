import { randomUUID } from "node:crypto";
import { rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getFFmpegPath } from "../ffmpeg/paths.js";
import {
	getJianyingTextPreviewVideoPath,
	getJianyingTextPreviewVideoUrl,
} from "./cache-path.js";
import {
	runJianyingTextProcess,
	throwIfJianyingTextRenderCancelled,
} from "./render-process.js";

async function isNonemptyFile({ filePath }: { filePath: string }) {
	try {
		const metadata = await stat(filePath);
		return metadata.isFile() && metadata.size > 0;
	} catch {
		return false;
	}
}

async function createPreviewVideo({
	requestId,
	cacheKey,
	directory,
	frameCount,
	fps,
}: {
	requestId: string;
	cacheKey: string;
	directory: string;
	frameCount: number;
	fps: number;
}) {
	const destination = getJianyingTextPreviewVideoPath({ cacheKey });
	if (await isNonemptyFile({ filePath: destination })) {
		return getJianyingTextPreviewVideoUrl({ cacheKey });
	}
	const temporary = path.join(directory, `.preview-${randomUUID()}.webm`);
	try {
		await runJianyingTextProcess({
			requestId,
			command: await getFFmpegPath(),
			timeoutMs: Math.min(300_000, Math.max(30_000, frameCount * 100)),
			args: [
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-framerate",
				String(fps),
				"-start_number",
				"0",
				"-i",
				path.join(directory, "frame-%06d.png"),
				"-frames:v",
				String(frameCount),
				"-an",
				"-c:v",
				"libvpx-vp9",
				"-pix_fmt",
				"yuva420p",
				"-auto-alt-ref",
				"0",
				"-row-mt",
				"1",
				"-deadline",
				"good",
				"-cpu-used",
				"4",
				"-crf",
				"30",
				"-b:v",
				"0",
				temporary,
			],
		});
		throwIfJianyingTextRenderCancelled({ requestId });
		await rename(temporary, destination).catch(async (cause) => {
			if (await isNonemptyFile({ filePath: destination })) return;
			throw cause;
		});
		if (!(await isNonemptyFile({ filePath: destination }))) {
			throw new Error("Jianying text preview video validation failed.");
		}
		return getJianyingTextPreviewVideoUrl({ cacheKey });
	} finally {
		await rm(temporary, { force: true });
	}
}

export function ensureJianyingTextPreviewVideo({
	requestId,
	cacheKey,
	directory,
	frameCount,
	fps,
}: {
	requestId: string;
	cacheKey: string;
	directory: string;
	frameCount: number;
	fps: number;
}) {
	return createPreviewVideo({
		requestId,
		cacheKey,
		directory,
		frameCount,
		fps,
	});
}
