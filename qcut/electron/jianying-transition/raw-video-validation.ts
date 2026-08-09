import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";

const RGBA_BYTES_PER_PIXEL = 4;
const RGBA_ALPHA_OFFSET = 3;

export interface RawTransitionFrameIssue {
	frame: number;
	reason: "empty";
}

export interface RawTransitionBoundaryRepair {
	inputARepaired: boolean;
	inputBRepaired: boolean;
}

function requireSafeInteger({
	value,
	label,
	minimum,
}: {
	value: number;
	label: string;
	minimum: number;
}) {
	if (!Number.isSafeInteger(value) || value < minimum) {
		throw new Error(
			`${label} must be a safe integer greater than or equal to ${minimum}.`
		);
	}
	return value;
}

export function findFirstInvalidRawFrame({
	rawPath,
	frameBytes,
	startFrame,
	frameCount,
}: {
	rawPath: string;
	frameBytes: number;
	startFrame: number;
	frameCount: number;
}): Promise<RawTransitionFrameIssue | null> {
	const validatedFrameBytes = requireSafeInteger({
		value: frameBytes,
		label: "Frame byte count",
		minimum: RGBA_BYTES_PER_PIXEL,
	});
	if (validatedFrameBytes % RGBA_BYTES_PER_PIXEL !== 0) {
		throw new Error("Frame byte count must contain whole RGBA pixels.");
	}
	const validatedStartFrame = requireSafeInteger({
		value: startFrame,
		label: "Start frame",
		minimum: 0,
	});
	const validatedFrameCount = requireSafeInteger({
		value: frameCount,
		label: "Frame count",
		minimum: 0,
	});
	if (validatedFrameCount === 0) return Promise.resolve(null);

	const startByte = validatedStartFrame * validatedFrameBytes;
	const expectedByteCount = validatedFrameCount * validatedFrameBytes;
	const endByte = startByte + expectedByteCount - 1;
	if (![startByte, expectedByteCount, endByte].every(Number.isSafeInteger)) {
		throw new Error("Raw transition frame window exceeds safe file offsets.");
	}

	return new Promise((resolve, reject) => {
		const stream = createReadStream(rawPath, {
			start: startByte,
			end: endByte,
			highWaterMark: 1024 * 1024,
		});
		let bytesRead = 0;
		let currentFrame = validatedStartFrame;
		let currentFrameHasColor = false;
		let settled = false;

		stream.on("data", (chunk) => {
			if (settled) return;
			const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
			for (let index = 0; index < buffer.length; ) {
				const absoluteByte = startByte + bytesRead + index;
				const frame = Math.floor(absoluteByte / validatedFrameBytes);
				if (frame !== currentFrame) {
					if (!currentFrameHasColor) {
						settled = true;
						stream.destroy();
						resolve({ frame: currentFrame, reason: "empty" });
						return;
					}
					currentFrame = frame;
					currentFrameHasColor = false;
				}
				if (currentFrameHasColor) {
					const nextFrameByte = (frame + 1) * validatedFrameBytes;
					index += Math.min(
						buffer.length - index,
						nextFrameByte - absoluteByte
					);
					continue;
				}
				const channel = absoluteByte % RGBA_BYTES_PER_PIXEL;
				if (channel !== RGBA_ALPHA_OFFSET && buffer[index] !== 0) {
					currentFrameHasColor = true;
				}
				index += 1;
			}
			bytesRead += buffer.length;
		});
		stream.on("error", (error) => {
			if (settled) return;
			settled = true;
			reject(error);
		});
		stream.on("end", () => {
			if (settled) return;
			settled = true;
			if (bytesRead !== expectedByteCount) {
				reject(new Error("Raw transition frame window ended unexpectedly."));
				return;
			}
			if (!currentFrameHasColor) {
				resolve({ frame: currentFrame, reason: "empty" });
				return;
			}
			resolve(null);
		});
	});
}

export async function rawFrameHasVisibleColor({
	rawPath,
	frameBytes,
	frame,
}: {
	rawPath: string;
	frameBytes: number;
	frame: number;
}): Promise<boolean> {
	const validatedFrameBytes = requireSafeInteger({
		value: frameBytes,
		label: "Frame byte count",
		minimum: RGBA_BYTES_PER_PIXEL,
	});
	if (validatedFrameBytes % RGBA_BYTES_PER_PIXEL !== 0) {
		throw new Error("Frame byte count must contain whole RGBA pixels.");
	}
	const validatedFrame = requireSafeInteger({
		value: frame,
		label: "Frame",
		minimum: 0,
	});
	const position = validatedFrame * validatedFrameBytes;
	if (!Number.isSafeInteger(position)) {
		throw new Error("Raw frame exceeds safe file offsets.");
	}
	const buffer = await readRawFrame({
		rawPath,
		frameBytes: validatedFrameBytes,
		frame: validatedFrame,
	});
	return frameHasVisibleColor({ frame: buffer });
}

async function readRawFrame({
	rawPath,
	frameBytes,
	frame,
}: {
	rawPath: string;
	frameBytes: number;
	frame: number;
}): Promise<Buffer> {
	const buffer = Buffer.allocUnsafe(frameBytes);
	const handle = await open(rawPath, "r");
	try {
		const { bytesRead } = await handle.read(
			buffer,
			0,
			frameBytes,
			frame * frameBytes
		);
		if (bytesRead !== frameBytes) {
			throw new Error("Raw frame ended unexpectedly.");
		}
		return buffer;
	} finally {
		await handle.close();
	}
}

function frameHasVisibleColor({ frame }: { frame: Buffer }): boolean {
	for (let index = 0; index < frame.length; index += RGBA_BYTES_PER_PIXEL) {
		if (
			frame[index] !== 0 ||
			frame[index + 1] !== 0 ||
			frame[index + 2] !== 0
		) {
			return true;
		}
	}
	return false;
}

async function writeRawFrame({
	rawPath,
	frameBytes,
	frame,
	buffer,
}: {
	rawPath: string;
	frameBytes: number;
	frame: number;
	buffer: Buffer;
}): Promise<void> {
	const handle = await open(rawPath, "r+");
	try {
		const { bytesWritten } = await handle.write(
			buffer,
			0,
			frameBytes,
			frame * frameBytes
		);
		if (bytesWritten !== frameBytes) {
			throw new Error("Raw frame write ended unexpectedly.");
		}
	} finally {
		await handle.close();
	}
}

function interpolateRawFrames({
	previous,
	next,
}: {
	previous: Buffer;
	next: Buffer;
}): Buffer {
	const interpolated = Buffer.allocUnsafe(previous.length);
	for (let index = 0; index < previous.length; index += RGBA_BYTES_PER_PIXEL) {
		interpolated[index] = Math.round((previous[index] + next[index]) / 2);
		interpolated[index + 1] = Math.round(
			(previous[index + 1] + next[index + 1]) / 2
		);
		interpolated[index + 2] = Math.round(
			(previous[index + 2] + next[index + 2]) / 2
		);
		interpolated[index + 3] = 255;
	}
	return interpolated;
}

export async function repairIsolatedRawOutputFrame({
	rawPath,
	frameBytes,
	frame,
	frameCount,
}: {
	rawPath: string;
	frameBytes: number;
	frame: number;
	frameCount: number;
}): Promise<boolean> {
	if (frame <= 0 || frame >= frameCount - 1) return false;
	const [previous, current, next] = await Promise.all([
		readRawFrame({ rawPath, frameBytes, frame: frame - 1 }),
		readRawFrame({ rawPath, frameBytes, frame }),
		readRawFrame({ rawPath, frameBytes, frame: frame + 1 }),
	]);
	if (
		frameHasVisibleColor({ frame: current }) ||
		!frameHasVisibleColor({ frame: previous }) ||
		!frameHasVisibleColor({ frame: next })
	) {
		return false;
	}
	await writeRawFrame({
		rawPath,
		frameBytes,
		frame,
		buffer: interpolateRawFrames({ previous, next }),
	});
	return true;
}

export async function repairIsolatedRawTransitionBoundary({
	rawInputA,
	rawInputB,
	frameBytes,
	inputAFrameCount,
	inputBFrameCount,
}: {
	rawInputA: string;
	rawInputB: string;
	frameBytes: number;
	inputAFrameCount: number;
	inputBFrameCount: number;
}): Promise<RawTransitionBoundaryRepair> {
	if (inputAFrameCount < 2 || inputBFrameCount < 2) {
		return { inputARepaired: false, inputBRepaired: false };
	}

	const [previousA, lastA, firstB, nextB] = await Promise.all([
		readRawFrame({
			rawPath: rawInputA,
			frameBytes,
			frame: inputAFrameCount - 2,
		}),
		readRawFrame({
			rawPath: rawInputA,
			frameBytes,
			frame: inputAFrameCount - 1,
		}),
		readRawFrame({ rawPath: rawInputB, frameBytes, frame: 0 }),
		readRawFrame({ rawPath: rawInputB, frameBytes, frame: 1 }),
	]);
	const previousAHasColor = frameHasVisibleColor({ frame: previousA });
	const lastAHasColor = frameHasVisibleColor({ frame: lastA });
	const firstBHasColor = frameHasVisibleColor({ frame: firstB });
	const nextBHasColor = frameHasVisibleColor({ frame: nextB });
	const inputARepaired =
		!lastAHasColor && previousAHasColor && (firstBHasColor || nextBHasColor);
	const inputBRepaired =
		!firstBHasColor && nextBHasColor && (lastAHasColor || previousAHasColor);
	const writes: Promise<void>[] = [];
	if (inputARepaired) {
		writes.push(
			writeRawFrame({
				rawPath: rawInputA,
				frameBytes,
				frame: inputAFrameCount - 1,
				buffer: previousA,
			})
		);
	}
	if (inputBRepaired) {
		writes.push(
			writeRawFrame({
				rawPath: rawInputB,
				frameBytes,
				frame: 0,
				buffer: nextB,
			})
		);
	}
	await Promise.all(writes);
	return { inputARepaired, inputBRepaired };
}
