import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { getFFmpegPath, getFFprobePath } from "../../ffmpeg/paths.js";

export interface FilterLabMediaInfo {
	width: number;
	height: number;
	duration: number;
	frameRate: number;
	hasAudio: boolean;
}

interface ProbeStream {
	codec_type?: string;
	width?: number;
	height?: number;
	duration?: string;
	avg_frame_rate?: string;
	r_frame_rate?: string;
	tags?: { rotate?: string };
	side_data_list?: Array<{ rotation?: number }>;
}

function frameRateValue({ value }: { value?: string }): number {
	const [numerator, denominator = "1"] = (value ?? "0").split("/");
	return Number(numerator) / Number(denominator);
}

export async function probeFilterLabMedia({
	filePath,
	signal,
}: {
	filePath: string;
	signal: AbortSignal;
}): Promise<FilterLabMediaInfo> {
	const { stdout } = await promisify(execFile)(
		await getFFprobePath(),
		["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath],
		{ signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }
	);
	const data = JSON.parse(stdout) as {
		streams?: ProbeStream[];
		format?: { duration?: string };
	};
	const video = data.streams?.find((stream) => stream.codec_type === "video");
	const rotation =
		video?.side_data_list?.find((item) => item.rotation !== undefined)
			?.rotation ?? Number(video?.tags?.rotate ?? 0);
	const rotated = Math.abs(rotation) % 180 === 90;
	const width = Number(rotated ? video?.height : video?.width);
	const height = Number(rotated ? video?.width : video?.height);
	if (
		![width, height].every(
			(value) => Number.isSafeInteger(value) && value > 0 && value <= 8192
		) ||
		width * height > 4096 ** 2
	) {
		throw new Error(
			"Input must contain a video/image stream of at most 16 megapixels (8192 pixels per side)."
		);
	}
	const averageRate = frameRateValue({ value: video?.avg_frame_rate });
	const rate =
		averageRate > 0
			? averageRate
			: frameRateValue({ value: video?.r_frame_rate });
	const duration = Number(video?.duration ?? data.format?.duration ?? 0);
	return {
		width,
		height,
		duration: Number.isFinite(duration) ? duration : 0,
		frameRate: Number.isFinite(rate) && rate > 0 ? rate : 0,
		hasAudio:
			data.streams?.some((stream) => stream.codec_type === "audio") ?? false,
	};
}

export function startFilterLabFfmpeg({
	args,
	signal,
}: {
	args: string[];
	signal: AbortSignal;
}) {
	const process = spawn(
		getFFmpegPath(),
		["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args],
		{
			stdio: ["pipe", "pipe", "pipe"],
			signal,
			windowsHide: true,
		}
	);
	let stderr = "";
	process.stderr.setEncoding("utf8");
	process.stderr.on("data", (chunk: string) => {
		stderr = (stderr + chunk).slice(-32_768);
	});
	const completion = new Promise<void>((resolve, reject) => {
		process.once("error", reject);
		process.once("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`FFmpeg failed (${code}): ${stderr.trim()}`));
		});
	});
	// Native initialization can finish after FFmpeg has already failed.
	void completion.catch(() => {});
	return { process, completion };
}

export async function runFilterLabFfmpeg({
	args,
	signal,
}: {
	args: string[];
	signal: AbortSignal;
}): Promise<void> {
	const task = startFilterLabFfmpeg({ args, signal });
	task.process.stdin.end();
	task.process.stdout.resume();
	await task.completion;
}

export function filterLabEncodeArgs({
	isImage,
	duration,
}: {
	isImage: boolean;
	duration: number;
}): string[] {
	return isImage
		? ["-frames:v", "1", "-c:v", "png", "-pix_fmt", "rgba"]
		: [
				"-t",
				String(duration),
				"-c:v",
				"libx264",
				"-preset",
				"fast",
				"-crf",
				"18",
				"-pix_fmt",
				"yuv420p",
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				"-movflags",
				"+faststart",
			];
}
