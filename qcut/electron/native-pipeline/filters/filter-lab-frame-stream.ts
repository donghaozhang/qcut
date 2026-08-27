import { Transform } from "node:stream";
import { mapWithConcurrency } from "../../lib/map-with-concurrency.js";

export function createFilterLabFrameStream({
	frameBytes,
	renderFrame,
}: {
	frameBytes: number;
	renderFrame: (input: { rgba: Buffer; index: number }) => Promise<Uint8Array>;
}): Transform {
	if (!Number.isSafeInteger(frameBytes) || frameBytes <= 0) {
		throw new Error("Frame byte size must be a positive integer.");
	}
	let chunks: Buffer[] = [];
	let bufferedBytes = 0;
	let frameIndex = 0;
	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			chunks.push(chunk);
			bufferedBytes += chunk.length;
			if (bufferedBytes < frameBytes) {
				callback();
				return;
			}
			const buffer = Buffer.concat(chunks, bufferedBytes);
			const count = Math.floor(buffer.length / frameBytes);
			const remainder = buffer.subarray(count * frameBytes);
			chunks = remainder.length ? [Buffer.from(remainder)] : [];
			bufferedBytes = remainder.length;
			// The native tracker is stateful: never render frames concurrently.
			void mapWithConcurrency({
				items: Array.from({ length: count }, (_, index) => index),
				limit: 1,
				task: async ({ item }) => {
					const result = await renderFrame({
						rgba: buffer.subarray(item * frameBytes, (item + 1) * frameBytes),
						index: frameIndex++,
					});
					if (result.byteLength !== frameBytes)
						throw new Error("Native filter returned an invalid frame size.");
					this.push(Buffer.from(result));
				},
			}).then(
				() => callback(),
				(error: Error) => callback(error)
			);
		},
		flush(callback) {
			if (bufferedBytes)
				callback(new Error("FFmpeg returned an incomplete RGBA frame."));
			else if (frameIndex === 0) callback(new Error("No frames were decoded."));
			else callback();
		},
	});
}
