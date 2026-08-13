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

async function readImageSequenceRgba({
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
	return { bytes, frameBytes };
}

export async function inspectImageSequenceAlphaFrames({
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
	const { bytes, frameBytes } = await readImageSequenceRgba({
		fps,
		frameCount,
		height,
		pattern,
		width,
	});
	const alphaBytes = Buffer.alloc(width * height);
	return Array.from({ length: frameCount }, (_, frameIndex) => {
		const frameOffset = frameIndex * frameBytes;
		const frame = bytes.subarray(frameOffset, frameOffset + frameBytes);
		for (let pixelIndex = 0; pixelIndex < alphaBytes.length; pixelIndex += 1) {
			alphaBytes[pixelIndex] = frame[pixelIndex * 4 + 3];
		}
		return {
			...alphaCoverage({ bytes: frame, width }),
			alphaHash: createHash("sha256").update(alphaBytes).digest("hex"),
		};
	});
}

export async function hashImageSequenceAlphaFrames({
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
	return (
		await inspectImageSequenceAlphaFrames({
			fps,
			frameCount,
			height,
			pattern,
			width,
		})
	).map(({ alphaHash }) => alphaHash);
}

export async function hashImageSequenceRgbaFrames({
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
	const { bytes, frameBytes } = await readImageSequenceRgba({
		fps,
		frameCount,
		height,
		pattern,
		width,
	});
	return Array.from({ length: frameCount }, (_, frameIndex) => {
		const frameOffset = frameIndex * frameBytes;
		return createHash("sha256")
			.update(bytes.subarray(frameOffset, frameOffset + frameBytes))
			.digest("hex");
	});
}

function premultiplyRgbaFrame({
	destination,
	source,
}: {
	destination: Buffer;
	source: Buffer;
}) {
	for (let offset = 0; offset < source.length; offset += 4) {
		const alpha = source[offset + 3];
		destination[offset] = Math.round((source[offset] * alpha) / 255);
		destination[offset + 1] = Math.round((source[offset + 1] * alpha) / 255);
		destination[offset + 2] = Math.round((source[offset + 2] * alpha) / 255);
		destination[offset + 3] = alpha;
	}
}

export async function hashImageSequencePremultipliedRgbaFrames({
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
	const { bytes, frameBytes } = await readImageSequenceRgba({
		fps,
		frameCount,
		height,
		pattern,
		width,
	});
	const premultiplied = Buffer.alloc(frameBytes);
	return Array.from({ length: frameCount }, (_, frameIndex) => {
		const frameOffset = frameIndex * frameBytes;
		const frame = bytes.subarray(frameOffset, frameOffset + frameBytes);
		premultiplyRgbaFrame({ destination: premultiplied, source: frame });
		return createHash("sha256").update(premultiplied).digest("hex");
	});
}

interface AlphaGeometry {
	centroidX: number;
	centroidY: number;
	maximumX: number;
	maximumY: number;
	minimumX: number;
	minimumY: number;
	visiblePixels: number;
}

function emptyAlphaGeometry({
	height,
	width,
}: {
	height: number;
	width: number;
}) {
	return {
		centroidX: 0,
		centroidY: 0,
		maximumX: -1,
		maximumY: -1,
		minimumX: width,
		minimumY: height,
		visiblePixels: 0,
	};
}

function alphaGeometryDifference({
	candidate,
	reference,
}: {
	candidate: AlphaGeometry;
	reference: AlphaGeometry;
}) {
	if (candidate.visiblePixels === 0 && reference.visiblePixels === 0) {
		return { bounds: 0, centroid: 0 };
	}
	if (candidate.visiblePixels === 0 || reference.visiblePixels === 0) {
		return {
			bounds: Number.POSITIVE_INFINITY,
			centroid: Number.POSITIVE_INFINITY,
		};
	}
	return {
		bounds: Math.max(
			Math.abs(candidate.minimumX - reference.minimumX),
			Math.abs(candidate.minimumY - reference.minimumY),
			Math.abs(candidate.maximumX - reference.maximumX),
			Math.abs(candidate.maximumY - reference.maximumY)
		),
		centroid: Math.hypot(
			candidate.centroidX / candidate.visiblePixels -
				reference.centroidX / reference.visiblePixels,
			candidate.centroidY / candidate.visiblePixels -
				reference.centroidY / reference.visiblePixels
		),
	};
}

export async function compareImageSequencePremultipliedRgbaFrames({
	candidatePattern,
	fps,
	frameCount,
	height,
	referencePattern,
	width,
}: {
	candidatePattern: string;
	fps: number;
	frameCount: number;
	height: number;
	referencePattern: string;
	width: number;
}) {
	const [reference, candidate] = await Promise.all([
		readImageSequenceRgba({
			fps,
			frameCount,
			height,
			pattern: referencePattern,
			width,
		}),
		readImageSequenceRgba({
			fps,
			frameCount,
			height,
			pattern: candidatePattern,
			width,
		}),
	]);
	if (reference.frameBytes !== candidate.frameBytes) {
		throw new Error("Image sequences have incompatible frame sizes");
	}
	return comparePremultipliedRgbaSequences({
		candidateBytes: candidate.bytes,
		frameCount,
		height,
		referenceBytes: reference.bytes,
		width,
	});
}

export function comparePremultipliedRgbaSequences({
	candidateBytes,
	frameCount,
	height,
	referenceBytes,
	width,
}: {
	candidateBytes: Buffer;
	frameCount: number;
	height: number;
	referenceBytes: Buffer;
	width: number;
}) {
	const frameBytes = width * height * 4;
	const expectedBytes = frameBytes * frameCount;
	if (
		referenceBytes.length !== expectedBytes ||
		candidateBytes.length !== expectedBytes
	) {
		throw new Error("RGBA sequences have incompatible frame sizes");
	}
	const referenceFrame = Buffer.alloc(frameBytes);
	const candidateFrame = Buffer.alloc(frameBytes);
	let differenceSquared = 0;
	let foregroundDifferenceSquared = 0;
	let foregroundSamples = 0;
	let maximumBoundsDelta = 0;
	let maximumCentroidDistance = 0;
	let maximumFrameRmse = 0;
	let maximumForegroundRmse = 0;
	let maximumChannelDelta = 0;
	let minimumMaskIou = 1;
	let differingFrames = 0;
	for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
		const frameOffset = frameIndex * frameBytes;
		premultiplyRgbaFrame({
			destination: referenceFrame,
			source: referenceBytes.subarray(frameOffset, frameOffset + frameBytes),
		});
		premultiplyRgbaFrame({
			destination: candidateFrame,
			source: candidateBytes.subarray(frameOffset, frameOffset + frameBytes),
		});
		const referenceGeometry = emptyAlphaGeometry({ height, width });
		const candidateGeometry = emptyAlphaGeometry({ height, width });
		let frameDifferenceSquared = 0;
		let frameForegroundDifferenceSquared = 0;
		let frameForegroundSamples = 0;
		let intersectionPixels = 0;
		let unionPixels = 0;
		let frameDiffers = false;
		for (let offset = 0; offset < frameBytes; offset += 4) {
			const pixelIndex = offset / 4;
			const x = pixelIndex % width;
			const y = Math.floor(pixelIndex / width);
			const referenceVisible = referenceFrame[offset + 3] > 8;
			const candidateVisible = candidateFrame[offset + 3] > 8;
			if (referenceVisible) {
				referenceGeometry.visiblePixels += 1;
				referenceGeometry.centroidX += x;
				referenceGeometry.centroidY += y;
				referenceGeometry.minimumX = Math.min(referenceGeometry.minimumX, x);
				referenceGeometry.minimumY = Math.min(referenceGeometry.minimumY, y);
				referenceGeometry.maximumX = Math.max(referenceGeometry.maximumX, x);
				referenceGeometry.maximumY = Math.max(referenceGeometry.maximumY, y);
			}
			if (candidateVisible) {
				candidateGeometry.visiblePixels += 1;
				candidateGeometry.centroidX += x;
				candidateGeometry.centroidY += y;
				candidateGeometry.minimumX = Math.min(candidateGeometry.minimumX, x);
				candidateGeometry.minimumY = Math.min(candidateGeometry.minimumY, y);
				candidateGeometry.maximumX = Math.max(candidateGeometry.maximumX, x);
				candidateGeometry.maximumY = Math.max(candidateGeometry.maximumY, y);
			}
			const inForeground = referenceVisible || candidateVisible;
			if (inForeground) unionPixels += 1;
			if (referenceVisible && candidateVisible) intersectionPixels += 1;
			for (let channel = 0; channel < 4; channel += 1) {
				const difference = Math.abs(
					referenceFrame[offset + channel] - candidateFrame[offset + channel]
				);
				if (difference > 0) frameDiffers = true;
				maximumChannelDelta = Math.max(maximumChannelDelta, difference);
				frameDifferenceSquared += difference * difference;
				if (!inForeground) continue;
				frameForegroundDifferenceSquared += difference * difference;
				frameForegroundSamples += 1;
			}
		}
		if (frameDiffers) differingFrames += 1;
		differenceSquared += frameDifferenceSquared;
		foregroundDifferenceSquared += frameForegroundDifferenceSquared;
		foregroundSamples += frameForegroundSamples;
		maximumFrameRmse = Math.max(
			maximumFrameRmse,
			Math.sqrt(frameDifferenceSquared / frameBytes)
		);
		maximumForegroundRmse = Math.max(
			maximumForegroundRmse,
			frameForegroundSamples === 0
				? 0
				: Math.sqrt(frameForegroundDifferenceSquared / frameForegroundSamples)
		);
		minimumMaskIou = Math.min(
			minimumMaskIou,
			unionPixels === 0 ? 1 : intersectionPixels / unionPixels
		);
		const geometry = alphaGeometryDifference({
			candidate: candidateGeometry,
			reference: referenceGeometry,
		});
		maximumBoundsDelta = Math.max(maximumBoundsDelta, geometry.bounds);
		maximumCentroidDistance = Math.max(
			maximumCentroidDistance,
			geometry.centroid
		);
	}
	return {
		differingFrames,
		maximumBoundsDelta,
		maximumCentroidDistance,
		maximumChannelDelta,
		maximumForegroundRmse,
		maximumFrameRmse,
		minimumMaskIou,
		foregroundRmse:
			foregroundSamples === 0
				? 0
				: Math.sqrt(foregroundDifferenceSquared / foregroundSamples),
		rgbaRmse: Math.sqrt(differenceSquared / (frameBytes * frameCount)),
	};
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
	return (
		await inspectImageSequenceAlphaFrames({
			fps,
			frameCount,
			height,
			pattern,
			width,
		})
	).map(({ alphaHash: _alphaHash, ...coverage }) => coverage);
}
