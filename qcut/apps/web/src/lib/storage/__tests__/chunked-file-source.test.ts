import { describe, expect, it, vi } from "vitest";
import {
	ChunkedFileSourceError,
	pipeChunkedFileSource,
} from "../chunked-file-source";

describe("pipeChunkedFileSource", () => {
	it("writes bounded chunks in exact offset order", async () => {
		const sourceBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const requests: Array<{ offset: number; maxBytes: number }> = [];
		const written: number[] = [];
		const close = vi.fn();

		await pipeChunkedFileSource({
			chunkBytes: 4,
			source: {
				byteLength: sourceBytes.byteLength,
				readChunk: async ({ offset, maxBytes }) => {
					requests.push({ offset, maxBytes });
					const bytes = sourceBytes.slice(offset, offset + maxBytes);
					return {
						bytes,
						eof: offset + bytes.byteLength === sourceBytes.byteLength,
					};
				},
			},
			writable: new WritableStream<Uint8Array>({
				write(bytes) {
					written.push(...bytes);
				},
				close,
			}),
		});

		expect(requests).toEqual([
			{ offset: 0, maxBytes: 4 },
			{ offset: 4, maxBytes: 4 },
			{ offset: 8, maxBytes: 1 },
		]);
		expect(written).toEqual([...sourceBytes]);
		expect(close).toHaveBeenCalledOnce();
	});

	it("creates an empty file without asking for a chunk", async () => {
		const readChunk = vi.fn();
		const close = vi.fn();
		await pipeChunkedFileSource({
			source: {
				byteLength: 0,
				readChunk,
			},
			writable: new WritableStream<Uint8Array>({ close }),
		});
		expect(readChunk).not.toHaveBeenCalled();
		expect(close).toHaveBeenCalledOnce();
	});

	it("aborts the destination when a reader stalls", async () => {
		const abort = vi.fn();
		await expect(
			pipeChunkedFileSource({
				source: {
					byteLength: 3,
					readChunk: async () => ({
						bytes: new Uint8Array(),
						eof: false,
					}),
				},
				writable: new WritableStream<Uint8Array>({ abort }),
			})
		).rejects.toBeInstanceOf(ChunkedFileSourceError);
		expect(abort).toHaveBeenCalledOnce();
	});

	it("rejects an early EOF marker", async () => {
		await expect(
			pipeChunkedFileSource({
				source: {
					byteLength: 3,
					readChunk: async () => ({
						bytes: new Uint8Array([1]),
						eof: true,
					}),
				},
				writable: new WritableStream<Uint8Array>(),
			})
		).rejects.toMatchObject({ name: "ChunkedFileSourceError" });
	});
});
