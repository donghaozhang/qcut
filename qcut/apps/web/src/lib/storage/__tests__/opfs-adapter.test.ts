import { afterEach, describe, expect, it, vi } from "vitest";
import { OPFSAdapter } from "../opfs-adapter";

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(
	navigator,
	"storage"
);

afterEach(() => {
	if (originalStorageDescriptor === undefined) {
		Reflect.deleteProperty(navigator, "storage");
		return;
	}
	Object.defineProperty(navigator, "storage", originalStorageDescriptor);
});

function notFound(): Error {
	const error = new Error("missing");
	error.name = "NotFoundError";
	return error;
}

function installOPFS({ existing = false }: { existing?: boolean } = {}) {
	const writes: number[][] = [];
	const abort = vi.fn(async () => undefined);
	const close = vi.fn(async () => undefined);
	const removeEntry = vi.fn(async () => undefined);
	const writable = {
		abort,
		close,
		write: vi.fn(async (bytes: Uint8Array) => {
			writes.push([...bytes]);
		}),
	};
	const fileHandle = {
		createWritable: vi.fn(async () => writable),
		getFile: vi.fn(async () => new File(["old"], "media-id")),
	};
	const directory = {
		getFileHandle: vi.fn(
			async (_key: string, options?: { create?: boolean }) => {
				if (!existing && options?.create !== true) throw notFound();
				return fileHandle;
			}
		),
		removeEntry,
	};
	const root = {
		getDirectoryHandle: vi.fn(async () => directory),
	};
	Object.defineProperty(navigator, "storage", {
		configurable: true,
		value: { getDirectory: vi.fn(async () => root) },
	});
	return { abort, close, removeEntry, writes };
}

describe("OPFSAdapter.setFromChunks", () => {
	it("streams source chunks into the file writable", async () => {
		const opfs = installOPFS();
		const bytes = new Uint8Array([1, 2, 3]);
		await new OPFSAdapter("test-media").setFromChunks({
			key: "media-id",
			source: {
				byteLength: bytes.byteLength,
				readChunk: async ({ offset, maxBytes }) => {
					const chunk = bytes.slice(offset, offset + maxBytes);
					return {
						bytes: chunk,
						eof: offset + chunk.byteLength === bytes.byteLength,
					};
				},
			},
		});

		expect(opfs.writes).toEqual([[1, 2, 3]]);
		expect(opfs.close).toHaveBeenCalledOnce();
		expect(opfs.abort).not.toHaveBeenCalled();
		expect(opfs.removeEntry).not.toHaveBeenCalled();
	});

	it("aborts and removes a newly-created partial file", async () => {
		const opfs = installOPFS();
		await expect(
			new OPFSAdapter("test-media").setFromChunks({
				key: "media-id",
				source: {
					byteLength: 3,
					readChunk: async () => ({
						bytes: new Uint8Array(),
						eof: false,
					}),
				},
			})
		).rejects.toMatchObject({ name: "ChunkedFileSourceError" });
		expect(opfs.abort).toHaveBeenCalledOnce();
		expect(opfs.removeEntry).toHaveBeenCalledWith("media-id");
	});

	it("preserves a previous file when replacement aborts", async () => {
		const opfs = installOPFS({ existing: true });
		await expect(
			new OPFSAdapter("test-media").setFromChunks({
				key: "media-id",
				source: {
					byteLength: 3,
					readChunk: async () => {
						throw new Error("transport failed");
					},
				},
			})
		).rejects.toThrow("transport failed");
		expect(opfs.abort).toHaveBeenCalledOnce();
		expect(opfs.removeEntry).not.toHaveBeenCalled();
	});
});
