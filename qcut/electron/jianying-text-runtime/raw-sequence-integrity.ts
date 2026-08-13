import { createReadStream } from "node:fs";
import { open, readFile, rm, stat, type FileHandle } from "node:fs/promises";

const MAXIMUM_RETRY_RUN_LENGTH = 3;

function rgbaFrameBytes({ width, height }: { width: number; height: number }) {
	return width * height * 4;
}

function isVisibleRgbaFrame({ bytes }: { bytes: Buffer }) {
	for (let offset = 3; offset < bytes.length; offset += 4) {
		if (bytes[offset] > 0) return true;
	}
	return false;
}

export async function findTransparentRgbaFrameIndices({
	rawPath,
	width,
	height,
	frameCount,
}: {
	rawPath: string;
	width: number;
	height: number;
	frameCount: number;
}) {
	const bytesPerFrame = rgbaFrameBytes({ width, height });
	const expectedBytes = bytesPerFrame * frameCount;
	const metadata = await stat(rawPath);
	if (metadata.size !== expectedBytes) {
		throw new Error(
			`Jianying raw sequence has ${metadata.size} bytes; expected ${expectedBytes}.`
		);
	}
	return new Promise<number[]>((resolve, reject) => {
		const transparentFrameIndices: number[] = [];
		let absoluteOffset = 0;
		let frameIndex = 0;
		let frameVisible = false;
		const stream = createReadStream(rawPath, { highWaterMark: 1024 * 1024 });
		stream.on("data", (chunk) => {
			const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			let chunkOffset = 0;
			while (chunkOffset < bytes.length) {
				const frameOffset = absoluteOffset % bytesPerFrame;
				const segmentLength = Math.min(
					bytes.length - chunkOffset,
					bytesPerFrame - frameOffset
				);
				if (!frameVisible) {
					const firstAlphaOffset = (3 - (absoluteOffset % 4) + 4) % 4;
					for (
						let offset = firstAlphaOffset;
						offset < segmentLength;
						offset += 4
					) {
						if (bytes[chunkOffset + offset] > 0) {
							frameVisible = true;
							break;
						}
					}
				}
				chunkOffset += segmentLength;
				absoluteOffset += segmentLength;
				if (absoluteOffset % bytesPerFrame === 0) {
					if (!frameVisible) transparentFrameIndices.push(frameIndex);
					frameIndex += 1;
					frameVisible = false;
				}
			}
		});
		stream.on("error", reject);
		stream.on("end", () => {
			if (absoluteOffset !== expectedBytes || frameIndex !== frameCount) {
				reject(
					new Error("Jianying raw sequence ended before its final frame.")
				);
				return;
			}
			resolve(transparentFrameIndices);
		});
	});
}

export function boundedTransparentRgbaFrameIndices({
	transparentFrameIndices,
	frameCount,
	maximumRunLength = MAXIMUM_RETRY_RUN_LENGTH,
}: {
	transparentFrameIndices: number[];
	frameCount: number;
	maximumRunLength?: number;
}) {
	const candidates: number[] = [];
	let run: number[] = [];
	const appendRun = () => {
		if (
			run.length > 0 &&
			run.length <= maximumRunLength &&
			run[0] > 0 &&
			run[run.length - 1] < frameCount - 1
		) {
			candidates.push(...run);
		}
	};
	for (const index of transparentFrameIndices) {
		if (run.length === 0 || index === run[run.length - 1] + 1) {
			run.push(index);
			continue;
		}
		appendRun();
		run = [index];
	}
	appendRun();
	return candidates;
}

async function writeCompleteFrame({
	file,
	bytes,
	position,
	written = 0,
}: {
	file: FileHandle;
	bytes: Buffer;
	position: number;
	written?: number;
}): Promise<void> {
	if (written === bytes.length) return;
	const result = await file.write(
		bytes,
		written,
		bytes.length - written,
		position + written
	);
	if (result.bytesWritten < 1) {
		throw new Error("Unable to repair the Jianying raw sequence frame.");
	}
	await writeCompleteFrame({
		file,
		bytes,
		position,
		written: written + result.bytesWritten,
	});
}

export async function repairTransientTransparentRgbaFrames({
	rawPath,
	width,
	height,
	frameCount,
	renderFrame,
	throwIfCancelled,
}: {
	rawPath: string;
	width: number;
	height: number;
	frameCount: number;
	renderFrame: (request: {
		frameIndex: number;
		outputPath: string;
	}) => Promise<void>;
	/** Rethrows cancellation out of an otherwise best-effort retry failure. */
	throwIfCancelled?: () => void;
}) {
	const transparentFrameIndices = await findTransparentRgbaFrameIndices({
		rawPath,
		width,
		height,
		frameCount,
	});
	const candidateFrameIndices = boundedTransparentRgbaFrameIndices({
		transparentFrameIndices,
		frameCount,
	});
	const repairedFrameIndices: number[] = [];
	const bytesPerFrame = rgbaFrameBytes({ width, height });
	const repairAt = async ({
		position,
	}: {
		position: number;
	}): Promise<void> => {
		if (position >= candidateFrameIndices.length) return;
		const frameIndex = candidateFrameIndices[position];
		const outputPath = `${rawPath}.retry-${frameIndex}.rgba`;
		try {
			await renderFrame({ frameIndex, outputPath });
			const bytes = await readFile(outputPath);
			if (bytes.length === bytesPerFrame && isVisibleRgbaFrame({ bytes })) {
				const file = await open(rawPath, "r+");
				try {
					await writeCompleteFrame({
						file,
						bytes,
						position: frameIndex * bytesPerFrame,
					});
					repairedFrameIndices.push(frameIndex);
				} finally {
					await file.close();
				}
			}
		} catch {
			// Repair is best-effort: the original frame is still in place, so
			// a failed retry must not abort the whole render. Cancellation is
			// the exception — it must still propagate.
			throwIfCancelled?.();
		} finally {
			await rm(outputPath, { force: true });
		}
		await repairAt({ position: position + 1 });
	};
	await repairAt({ position: 0 });
	return {
		transparentFrameIndices,
		candidateFrameIndices,
		repairedFrameIndices,
	};
}
