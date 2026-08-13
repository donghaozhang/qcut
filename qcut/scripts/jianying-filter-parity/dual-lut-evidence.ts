import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { createJianyingFilterLocalProvider } from "../../electron/jianying-filter-local-runtime/provider.js";
import { encodePpm } from "../../electron/jianying-filter-local-runtime/portable-image.js";
import {
	createJianyingFilterLocalRenderSession,
	type JianyingFilterLocalRenderResult,
} from "../../electron/jianying-filter-local-runtime/render.js";
import type { inspectJianyingFilterLocalRuntime } from "../../electron/jianying-filter-local-runtime/runtime-discovery.js";

const execFileAsync = promisify(execFile);

function sha256({ bytes }: { bytes: Uint8Array }) {
	return createHash("sha256").update(bytes).digest("hex");
}

export function byteMae({
	left,
	right,
}: {
	left: Uint8Array;
	right: Uint8Array;
}) {
	if (left.length !== right.length) return Number.POSITIVE_INFINITY;
	let sum = 0;
	for (let index = 0; index < left.length; index += 1) {
		sum += Math.abs(left[index] - right[index]);
	}
	return sum / left.length;
}

export function maskStatistics({
	bytes,
	width,
	height,
}: {
	bytes: Uint8Array;
	width: number;
	height: number;
}) {
	let sum = 0;
	let nonZero = 0;
	let edgeSum = 0;
	let edgeSamples = 0;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = y * width + x;
			const value = bytes[index];
			sum += value;
			if (value > 0) nonZero += 1;
			if (x + 1 < width) {
				edgeSum += Math.abs(value - bytes[index + 1]);
				edgeSamples += 1;
			}
			if (y + 1 < height) {
				edgeSum += Math.abs(value - bytes[index + width]);
				edgeSamples += 1;
			}
		}
	}
	return {
		mean: sum / bytes.length,
		nonZeroRatio: nonZero / bytes.length,
		edgeMean: edgeSamples === 0 ? 0 : edgeSum / edgeSamples,
	};
}

export function measureByteSequenceChange({
	frames,
	changeThreshold = 0.01,
}: {
	frames: Uint8Array[];
	changeThreshold?: number;
}) {
	if (frames.length < 2) {
		throw new Error("Temporal verification requires at least two frames");
	}
	const firstLength = frames[0].length;
	if (frames.some((frame) => frame.length !== firstLength)) {
		throw new Error("Temporal verification frames have different sizes");
	}
	const adjacentMae = frames
		.slice(1)
		.map((frame, index) => byteMae({ left: frames[index], right: frame }));
	return {
		adjacentMae,
		meanAdjacentMae:
			adjacentMae.reduce((sum, value) => sum + value, 0) / adjacentMae.length,
		maxAdjacentMae: Math.max(...adjacentMae),
		changedPairCount: adjacentMae.filter((value) => value >= changeThreshold)
			.length,
		changeThreshold,
	};
}

export function requireMask({
	result,
}: {
	result: JianyingFilterLocalRenderResult;
}) {
	if (!result.mask) throw new Error("Native portrait render returned no mask");
	return result.mask;
}

function encodePgm({
	bytes,
	width,
	height,
}: {
	bytes: Uint8Array;
	width: number;
	height: number;
}) {
	if (bytes.length !== width * height) {
		throw new Error("Mask frame has the wrong size");
	}
	return Buffer.concat([
		Buffer.from(`P5\n${width} ${height}\n255\n`, "ascii"),
		bytes,
	]);
}

async function convertPortableImage({
	ffmpegPath,
	inputPath,
	outputPath,
}: {
	ffmpegPath: string;
	inputPath: string;
	outputPath: string;
}) {
	await execFileAsync(ffmpegPath, [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-i",
		inputPath,
		outputPath,
	]);
}

export async function saveFrameEvidence({
	directory,
	ffmpegPath,
	result,
}: {
	directory: string;
	ffmpegPath: string;
	result: JianyingFilterLocalRenderResult;
}) {
	const mask = requireMask({ result });
	const framePath = join(directory, "frame.ppm");
	const framePngPath = join(directory, "frame.png");
	const maskPath = join(directory, "mask.pgm");
	const maskPngPath = join(directory, "mask.png");
	await mkdir(directory, { recursive: true });
	await Promise.all([
		writeFile(
			framePath,
			encodePpm({
				rgba: result.rgba,
				width: result.width,
				height: result.height,
			})
		),
		writeFile(
			maskPath,
			encodePgm({ bytes: mask.bytes, width: mask.width, height: mask.height })
		),
	]);
	await Promise.all([
		convertPortableImage({
			ffmpegPath,
			inputPath: framePath,
			outputPath: framePngPath,
		}),
		convertPortableImage({
			ffmpegPath,
			inputPath: maskPath,
			outputPath: maskPngPath,
		}),
	]);
}

interface ExportProbeStream {
	width?: number;
	height?: number;
	r_frame_rate?: string;
	duration?: string;
	nb_read_frames?: string;
}

interface ExportProbe {
	streams?: ExportProbeStream[];
}

export async function exportSequenceEvidence({
	frames,
	width,
	height,
	fps,
	ffmpegPath,
	ffprobePath,
	outputPath,
}: {
	frames: Uint8Array[];
	width: number;
	height: number;
	fps: number;
	ffmpegPath: string;
	ffprobePath: string;
	outputPath: string;
}) {
	if (frames.length < 2) {
		throw new Error("Video export requires at least two frames");
	}
	const bytesPerFrame = width * height * 4;
	if (frames.some((frame) => frame.length !== bytesPerFrame)) {
		throw new Error("Video export received an incorrectly sized RGBA frame");
	}
	const rawPath = `${outputPath}.rgba`;
	await writeFile(rawPath, Buffer.concat(frames));
	try {
		await execFileAsync(ffmpegPath, [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"-s:v",
			`${width}x${height}`,
			"-r",
			String(fps),
			"-i",
			rawPath,
			"-frames:v",
			String(frames.length),
			"-an",
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-crf",
			"18",
			"-pix_fmt",
			"yuv420p",
			"-movflags",
			"+faststart",
			outputPath,
		]);
	} finally {
		await rm(rawPath, { force: true });
	}
	const { stdout } = await execFileAsync(ffprobePath, [
		"-v",
		"error",
		"-count_frames",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=width,height,r_frame_rate,duration,nb_read_frames",
		"-of",
		"json",
		outputPath,
	]);
	const stream = (JSON.parse(String(stdout)) as ExportProbe).streams?.[0];
	const frameCount = Number(stream?.nb_read_frames);
	if (
		stream?.width !== width ||
		stream.height !== height ||
		frameCount !== frames.length
	) {
		throw new Error(
			"Exported video failed frame-count or dimension verification"
		);
	}
	return {
		path: outputPath,
		sha256: sha256({ bytes: new Uint8Array(await readFile(outputPath)) }),
		width,
		height,
		frameCount,
		frameRate: stream.r_frame_rate ?? null,
		durationSeconds: Number(stream.duration),
	};
}

async function renderFresh({
	bootstrapRgba,
	height,
	packagePath,
	resourceId,
	rgba,
	runtime,
	timestampSeconds,
	width,
}: {
	bootstrapRgba: Uint8Array;
	height: number;
	packagePath: string;
	resourceId: string;
	rgba: Uint8Array;
	runtime: Awaited<ReturnType<typeof inspectJianyingFilterLocalRuntime>>;
	timestampSeconds: number;
	width: number;
}) {
	const session = await createJianyingFilterLocalRenderSession({
		resourceId,
		packagePath,
		width,
		height,
		bootstrapRgba,
		runtime,
	});
	try {
		return await session.render({ rgba, timestampSeconds });
	} finally {
		await session.dispose();
	}
}

export async function verifySourceSwitch({
	height,
	packagePath,
	resourceId,
	sourceARgba,
	sourceBRgba,
	runtime,
	width,
}: {
	height: number;
	packagePath: string;
	resourceId: string;
	sourceARgba: Uint8Array;
	sourceBRgba: Uint8Array;
	runtime: Awaited<ReturnType<typeof inspectJianyingFilterLocalRuntime>>;
	width: number;
}) {
	const provider = createJianyingFilterLocalProvider();
	try {
		await provider.render({
			resourceId,
			packagePath,
			width,
			height,
			rgba: sourceARgba,
			sourceKey: "clip:a",
			timestampSeconds: 0,
		});
		const switched = await provider.render({
			resourceId,
			packagePath,
			width,
			height,
			rgba: sourceBRgba,
			sourceKey: "clip:b",
			timestampSeconds: 0,
		});
		const fresh = await renderFresh({
			bootstrapRgba: sourceBRgba,
			height,
			packagePath,
			resourceId,
			rgba: sourceBRgba,
			runtime,
			timestampSeconds: 0,
			width,
		});
		const switchedMask = requireMask({ result: switched });
		const freshMask = requireMask({ result: fresh });
		return {
			rgbaExact:
				sha256({ bytes: switched.rgba }) === sha256({ bytes: fresh.rgba }),
			rgbaMae: byteMae({ left: switched.rgba, right: fresh.rgba }),
			maskExact:
				sha256({ bytes: switchedMask.bytes }) ===
				sha256({ bytes: freshMask.bytes }),
			maskMae: byteMae({ left: switchedMask.bytes, right: freshMask.bytes }),
		};
	} finally {
		provider.clear();
	}
}
