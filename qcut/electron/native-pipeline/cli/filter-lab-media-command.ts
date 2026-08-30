import { lstat, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { FilterLabMediaInfo } from "../filters/filter-lab-media.js";
import type { CLIRunOptions } from "./cli-runner/types.js";

const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".webp",
	".bmp",
	".tif",
	".tiff",
]);
const VIDEO_EXTENSIONS = new Set([
	".mp4",
	".mov",
	".m4v",
	".mkv",
	".webm",
	".avi",
]);

export interface FilterLabMediaCommandPaths {
	input: string;
	output: string;
	isImage: boolean;
	duration?: number;
}

export function resolveFilterLabMediaCommandPaths({
	options,
	outputSuffix,
}: {
	options: CLIRunOptions;
	outputSuffix: string;
}): FilterLabMediaCommandPaths {
	if (!options.input)
		throw new Error("Missing --input/-i image or video path.");
	const duration =
		options.duration === undefined ? undefined : Number(options.duration);
	if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0))
		throw new Error("--duration must be a positive number of seconds.");
	if (
		options.fps !== undefined &&
		(!Number.isFinite(options.fps) || options.fps <= 0 || options.fps > 120)
	)
		throw new Error("--fps must be greater than 0 and at most 120.");
	const input = resolve(options.input);
	const extension = extname(input).toLowerCase();
	const isImage = IMAGE_EXTENSIONS.has(extension);
	if (!isImage && !VIDEO_EXTENSIONS.has(extension))
		throw new Error("Unsupported image/video extension.");
	if (isImage && (duration !== undefined || options.fps !== undefined))
		throw new Error("--duration and --fps apply only to video inputs.");
	const output = options.output
		? resolve(options.output)
		: join(
				resolve(options.outputDir),
				`${basename(input, extname(input))}_${outputSuffix}${isImage ? ".png" : ".mp4"}`
			);
	if (extname(output).toLowerCase() !== (isImage ? ".png" : ".mp4"))
		throw new Error("Use a .png output for images or .mp4 for videos.");
	if (input === output)
		throw new Error("Filter output cannot overwrite the input.");
	return { input, output, isImage, duration };
}

export async function validateFilterLabMediaFiles({
	input,
	output,
	force,
}: {
	input: string;
	output: string;
	force: boolean;
}) {
	const source = await stat(input);
	if (!source.isFile()) throw new Error("Input is not a regular file.");
	const destination = await lstat(output).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return undefined;
			throw error;
		}
	);
	if (!destination) return;
	if (destination.dev === source.dev && destination.ino === source.ino)
		throw new Error("Filter output cannot overwrite the input.");
	if (!destination.isFile())
		throw new Error(
			"Output must be a regular file, not a directory or symlink."
		);
	if (!force)
		throw new Error("Output already exists. Use --force to replace it.");
}

export function selectFilterLabRenderMedia({
	media,
	isImage,
	duration,
	fps,
}: {
	media: FilterLabMediaInfo;
	isImage: boolean;
	duration?: number;
	fps?: number;
}): FilterLabMediaInfo {
	if (isImage) return { ...media, duration: 0, frameRate: 1, hasAudio: false };
	const frameRate = fps ?? media.frameRate;
	if (
		media.duration <= 0 ||
		!Number.isFinite(frameRate) ||
		frameRate <= 0 ||
		frameRate > 120
	)
		throw new Error(
			"Video duration or frame rate is invalid; use --fps for sources without a usable rate."
		);
	if (media.width % 2 || media.height % 2)
		throw new Error(
			"MP4 output requires even dimensions; resize the source explicitly before rendering."
		);
	return {
		...media,
		frameRate,
		duration: Math.min(duration ?? media.duration, media.duration),
	};
}

export function verifyFilterLabOutput({
	input,
	output,
	isImage,
}: {
	input: FilterLabMediaInfo;
	output: FilterLabMediaInfo;
	isImage: boolean;
}) {
	if (input.width !== output.width || input.height !== output.height)
		throw new Error("Rendered dimensions differ from the input.");
	if (isImage) return;
	if (
		Math.abs(input.duration - output.duration) >
		Math.max(0.1, 1 / input.frameRate + 0.05)
	)
		throw new Error("Rendered duration differs from the requested duration.");
	if (Math.abs(input.frameRate - output.frameRate) > 0.001)
		throw new Error(
			"Rendered frame rate differs from the requested frame rate."
		);
	if (input.hasAudio && !output.hasAudio)
		throw new Error("Input audio was lost during rendering.");
}
