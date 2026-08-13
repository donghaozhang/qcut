import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getFFmpegPath } from "../ffmpeg/paths.js";

export function runProcess({
	command,
	args,
}: {
	command: string;
	args: string[];
}): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve(Buffer.concat(stdout));
				return;
			}
			reject(
				new Error(
					`${path.basename(command)} exited with ${code}: ${Buffer.concat(stderr).toString("utf8")}`
				)
			);
		});
	});
}

export function framePathFromPattern({
	pattern,
	index,
}: {
	pattern: string;
	index: number;
}) {
	return pattern.replace("%06d", String(index).padStart(6, "0"));
}

export function hashImageSequenceFrames({
	frameCount,
	pattern,
}: {
	frameCount: number;
	pattern: string;
}) {
	return Promise.all(
		Array.from({ length: frameCount }, (_, index) =>
			readFile(framePathFromPattern({ pattern, index })).then((bytes) =>
				createHash("sha256").update(bytes).digest("hex")
			)
		)
	);
}

export function alphaCoverage({
	bytes,
	width,
}: {
	bytes: Buffer;
	width: number;
}) {
	let visible = 0;
	let transparent = 0;
	let edgeVisible = 0;
	const height = bytes.length / 4 / width;
	for (let offset = 3; offset < bytes.length; offset += 4) {
		const alpha = bytes[offset];
		if (alpha === 0) transparent += 1;
		if (alpha === 0) continue;
		visible += 1;
		const pixelIndex = (offset - 3) / 4;
		const x = pixelIndex % width;
		const y = Math.floor(pixelIndex / width);
		if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
			edgeVisible += 1;
		}
	}
	return { visible, transparent, edgeVisible };
}

export async function readImageSequenceAlphaCoverages({
	fps,
	frameCount,
	height,
	pattern,
	width,
}: {
	fps: number;
	frameCount: number;
	height: number;
	pattern: string;
	width: number;
}) {
	const bytes = await runProcess({
		command: getFFmpegPath(),
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-framerate",
			String(fps),
			"-start_number",
			"0",
			"-i",
			pattern,
			"-frames:v",
			String(frameCount),
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"pipe:1",
		],
	});
	const frameBytes = width * height * 4;
	if (bytes.length !== frameBytes * frameCount) {
		throw new Error("Decoded image sequence has an unexpected size");
	}
	return Array.from({ length: frameCount }, (_, index) =>
		alphaCoverage({
			bytes: bytes.subarray(index * frameBytes, (index + 1) * frameBytes),
			width,
		})
	);
}
