import { createReadStream } from "node:fs";
import type { JianyingTextRuntimeContentBounds } from "../jianying-text-runtime-contract.js";

const BYTES_PER_PIXEL = 4;
const ALPHA_BYTE_OFFSET = 3;

export async function measureJianyingTextRawSequenceAlphaBounds({
	rawPath,
	width,
	height,
	frameCount,
}: {
	rawPath: string;
	width: number;
	height: number;
	frameCount: number;
}): Promise<JianyingTextRuntimeContentBounds | null> {
	const pixelsPerFrame = width * height;
	const expectedBytes = pixelsPerFrame * frameCount * BYTES_PER_PIXEL;
	let bytesRead = 0;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;

	for await (const chunk of createReadStream(rawPath)) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		const firstAlpha =
			(ALPHA_BYTE_OFFSET - (bytesRead % BYTES_PER_PIXEL) + BYTES_PER_PIXEL) %
			BYTES_PER_PIXEL;
		for (
			let index = firstAlpha;
			index < bytes.length;
			index += BYTES_PER_PIXEL
		) {
			if (bytes[index] === 0) continue;
			const globalPixel = Math.floor((bytesRead + index) / BYTES_PER_PIXEL);
			const framePixel = globalPixel % pixelsPerFrame;
			const x = framePixel % width;
			const y = Math.floor(framePixel / width);
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
		bytesRead += bytes.length;
	}

	if (bytesRead !== expectedBytes) {
		throw new Error(
			`Jianying text raw sequence size mismatch: expected ${expectedBytes}, received ${bytesRead}.`
		);
	}
	if (maxX < 0 || maxY < 0) return null;
	return {
		x: minX,
		y: minY,
		width: maxX - minX + 1,
		height: maxY - minY + 1,
	};
}
