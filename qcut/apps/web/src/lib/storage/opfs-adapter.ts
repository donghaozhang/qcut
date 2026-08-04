import { StorageAdapter } from "./types";
import {
	pipeChunkedFileSource,
	type ChunkedFileSource,
} from "./chunked-file-source";

function toFileSystemWriteBytes({
	bytes,
}: {
	bytes: Uint8Array;
}): Uint8Array<ArrayBuffer> {
	return bytes.buffer instanceof ArrayBuffer
		? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
		: Uint8Array.from(bytes);
}

export class OPFSAdapter implements StorageAdapter<File> {
	private directoryName: string;

	constructor(directoryName = "media") {
		this.directoryName = directoryName;
	}

	private async getDirectory(): Promise<FileSystemDirectoryHandle> {
		const opfsRoot = await navigator.storage.getDirectory();
		return await opfsRoot.getDirectoryHandle(this.directoryName, {
			create: true,
		});
	}

	async get(key: string): Promise<File | null> {
		try {
			const directory = await this.getDirectory();
			const fileHandle = await directory.getFileHandle(key);
			return await fileHandle.getFile();
		} catch (error) {
			if ((error as Error).name === "NotFoundError") {
				return null;
			}
			throw error;
		}
	}

	async set(key: string, file: File): Promise<void> {
		const directory = await this.getDirectory();
		const fileHandle = await directory.getFileHandle(key, { create: true });
		const writable = await fileHandle.createWritable();

		await writable.write(file);
		await writable.close();
	}

	async setFromChunks({
		key,
		source,
	}: {
		key: string;
		source: ChunkedFileSource;
	}): Promise<void> {
		const existingFile = await this.get(key);
		const directory = await this.getDirectory();
		const fileHandle = await directory.getFileHandle(key, { create: true });
		const fileWritable = await fileHandle.createWritable();
		const writable = new WritableStream<Uint8Array>({
			write: (bytes) => fileWritable.write(toFileSystemWriteBytes({ bytes })),
			close: () => fileWritable.close(),
			abort: (reason) => fileWritable.abort(reason),
		});

		try {
			await pipeChunkedFileSource({ source, writable });
		} catch (error) {
			if (existingFile === null) {
				await directory.removeEntry(key).catch(() => undefined);
			}
			throw error;
		}
	}

	async remove(key: string): Promise<void> {
		try {
			const directory = await this.getDirectory();
			await directory.removeEntry(key);
		} catch (error) {
			if ((error as Error).name !== "NotFoundError") {
				throw error;
			}
		}
	}

	async list(): Promise<string[]> {
		const directory = await this.getDirectory();
		const keys: string[] = [];

		for await (const name of directory.keys()) {
			keys.push(name);
		}

		return keys;
	}

	async clear(): Promise<void> {
		const directory = await this.getDirectory();

		for await (const name of directory.keys()) {
			await directory.removeEntry(name);
		}
	}

	// Helper method to check OPFS support
	static isSupported(): boolean {
		return "storage" in navigator && "getDirectory" in navigator.storage;
	}
}
