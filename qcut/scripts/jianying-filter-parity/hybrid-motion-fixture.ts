import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { getFFmpegPath, getFFprobePath } from "../../electron/ffmpeg/paths.js";

export async function loadHybridMotionFixture({
	source,
	startFrame = 60,
}: {
	source: string;
	startFrame?: number;
}) {
	if (!Number.isSafeInteger(startFrame) || startFrame < 0)
		throw new Error("Invalid start frame.");
	const exec = promisify(execFile);
	const probe = await exec(await getFFprobePath(), [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=width,height,r_frame_rate",
		"-of",
		"json",
		source,
	]);
	const info = JSON.parse(probe.stdout) as {
		streams: Array<{ width: number; height: number; r_frame_rate: string }>;
	};
	const stream = info.streams[0];
	if (!stream) throw new Error("Missing video stream.");
	const { width, height } = stream;
	const [numerator, denominator] = stream.r_frame_rate.split("/").map(Number);
	const fps = numerator / denominator;
	const bytesPerFrame = width * height * 4;
	if (
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width < 1 ||
		height < 1 ||
		!Number.isSafeInteger(bytesPerFrame) ||
		bytesPerFrame < 4 ||
		width > 1920 ||
		height > 1080 ||
		!Number.isFinite(fps) ||
		fps <= 0
	)
		throw new Error("Unsupported motion fixture dimensions or FPS.");
	const { stdout } = await exec(
		getFFmpegPath(),
		[
			"-v",
			"error",
			"-i",
			source,
			"-vf",
			`select=between(n\\,${startFrame}\\,${startFrame + 9})`,
			"-fps_mode",
			"passthrough",
			"-frames:v",
			"10",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 100 * 1024 * 1024, timeout: 120_000 }
	);
	if (stdout.length !== bytesPerFrame * 10)
		throw new Error("Expected ten unscaled consecutive video frames.");
	const frames = Array.from({ length: 10 }, (_, i) => ({
		key: "motion",
		time: (startFrame + i) / fps,
		rgba: new Uint8Array(
			stdout.subarray(i * bytesPerFrame, (i + 1) * bytesPerFrame)
		),
	}));
	const motionMae = frames.slice(1).map((frame, index) => {
		let sum = 0;
		for (let i = 0; i < frame.rgba.length; i++)
			if (i % 4 !== 3) sum += Math.abs(frame.rgba[i] - frames[index].rgba[i]);
		return sum / (width * height * 3);
	});
	if (!motionMae.some((mae) => mae > 0.05))
		throw new Error("Fixture does not contain visible frame changes.");
	return {
		width,
		height,
		fps,
		startFrame,
		motionMae,
		frames,
		sourceSha256: createHash("sha256")
			.update(await readFile(source))
			.digest("hex"),
	};
}
