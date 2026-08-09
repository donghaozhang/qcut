export const DEFAULT_CHUNKED_FILE_WRITE_BYTES = 4 * 1024 * 1024;

const MAX_CHUNKED_FILE_WRITE_BYTES = 64 * 1024 * 1024;

export interface ChunkedFileReadResult {
	bytes: Uint8Array;
	eof: boolean;
}

export interface ChunkedFileSource {
	byteLength: number;
	readChunk(options: {
		offset: number;
		maxBytes: number;
	}): Promise<ChunkedFileReadResult>;
}

export class ChunkedFileSourceError extends Error {
	constructor({ message }: { message: string }) {
		super(message);
		this.name = "ChunkedFileSourceError";
	}
}

function invalidChunk({ message }: { message: string }): never {
	throw new ChunkedFileSourceError({ message });
}

function assertSourceOptions({
	byteLength,
	chunkBytes,
}: {
	byteLength: number;
	chunkBytes: number;
}): void {
	if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
		invalidChunk({ message: "Chunked file byte length is invalid." });
	}
	if (
		!Number.isSafeInteger(chunkBytes) ||
		chunkBytes < 1 ||
		chunkBytes > MAX_CHUNKED_FILE_WRITE_BYTES
	) {
		invalidChunk({ message: "Chunked file write size is invalid." });
	}
}

function validateChunk({
	chunk,
	maxBytes,
	offset,
	totalBytes,
}: {
	chunk: ChunkedFileReadResult;
	maxBytes: number;
	offset: number;
	totalBytes: number;
}): Uint8Array {
	if (
		typeof chunk !== "object" ||
		chunk === null ||
		!(chunk.bytes instanceof Uint8Array) ||
		typeof chunk.eof !== "boolean"
	) {
		invalidChunk({ message: "Chunked file reader returned malformed data." });
	}
	const remainingBytes = totalBytes - offset;
	if (
		chunk.bytes.byteLength < 1 ||
		chunk.bytes.byteLength > maxBytes ||
		chunk.bytes.byteLength > remainingBytes
	) {
		invalidChunk({
			message: "Chunked file reader returned an invalid length.",
		});
	}
	const expectedEof = chunk.bytes.byteLength === remainingBytes;
	if (chunk.eof !== expectedEof) {
		invalidChunk({
			message: "Chunked file reader returned an invalid EOF marker.",
		});
	}
	return chunk.bytes;
}

export async function pipeChunkedFileSource({
	chunkBytes = DEFAULT_CHUNKED_FILE_WRITE_BYTES,
	source,
	writable,
}: {
	chunkBytes?: number;
	source: ChunkedFileSource;
	writable: WritableStream<Uint8Array>;
}): Promise<void> {
	assertSourceOptions({ byteLength: source.byteLength, chunkBytes });
	let offset = 0;
	const readable = new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (offset === source.byteLength) {
				controller.close();
				return;
			}
			const maxBytes = Math.min(chunkBytes, source.byteLength - offset);
			const chunk = await source.readChunk({ offset, maxBytes });
			const bytes = validateChunk({
				chunk,
				maxBytes,
				offset,
				totalBytes: source.byteLength,
			});
			offset += bytes.byteLength;
			controller.enqueue(bytes);
			if (offset === source.byteLength) controller.close();
		},
	});
	await readable.pipeTo(writable);
}
