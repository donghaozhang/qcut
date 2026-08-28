// @vitest-environment node
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it, vi } from "vitest";
import { createFilterLabFrameStream } from "../native-pipeline/filters/filter-lab-frame-stream.js";

async function renderChunks({
	chunks,
	renderFrame,
}: {
	chunks: Buffer[];
	renderFrame: (input: { rgba: Buffer; index: number }) => Promise<Uint8Array>;
}) {
	const outputs: Buffer[] = [];
	await pipeline(
		Readable.from(chunks),
		createFilterLabFrameStream({ frameBytes: 8, renderFrame }),
		new Writable({
			write(chunk: Buffer, _encoding, callback) {
				outputs.push(chunk);
				callback();
			},
		})
	);
	return Buffer.concat(outputs);
}

describe("Filter Lab RGBA stream", () => {
	it("reassembles split frames and serializes tracker calls", async () => {
		let active = 0;
		let maxActive = 0;
		const indices: number[] = [];
		const bytes = Buffer.from(Array.from({ length: 24 }, (_, index) => index));
		const output = await renderChunks({
			chunks: [
				bytes.subarray(0, 3),
				bytes.subarray(3, 5),
				bytes.subarray(5, 24),
			],
			renderFrame: async ({ rgba, index }) => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				indices.push(index);
				await Promise.resolve();
				active -= 1;
				return rgba;
			},
		});
		expect(output).toEqual(bytes);
		expect(indices).toEqual([0, 1, 2]);
		expect(maxActive).toBe(1);
	});

	it("rejects incomplete and empty frame streams", async () => {
		const renderFrame = async ({ rgba }: { rgba: Buffer }) => rgba;
		await expect(
			renderChunks({ chunks: [Buffer.alloc(9)], renderFrame })
		).rejects.toThrow("incomplete");
		await expect(renderChunks({ chunks: [], renderFrame })).rejects.toThrow(
			"No frames"
		);
	});

	it("rejects an invalid native result before publishing it", async () => {
		await expect(
			renderChunks({
				chunks: [Buffer.alloc(8)],
				renderFrame: async () => Buffer.alloc(4),
			})
		).rejects.toThrow("invalid frame size");
	});

	it("stops after a failed native frame", async () => {
		const renderFrame = vi.fn(async () => {
			throw new Error("native failed");
		});
		await expect(
			renderChunks({ chunks: [Buffer.alloc(24)], renderFrame })
		).rejects.toThrow("native failed");
		expect(renderFrame).toHaveBeenCalledTimes(1);
	});
});
