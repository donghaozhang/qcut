import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";
import type { JianyingFilterPrivateRuntimeFile } from "./private-runtime.js";

const HASH_CONCURRENCY = 4;

export function isJianyingFilterPrivateRuntimeVolatileFile({
	relativePath,
}: {
	relativePath: string;
}): boolean {
	const normalizedPath = relativePath.split(path.sep).join("/");
	return (
		normalizedPath.startsWith("Cache/ressdk_db/") &&
		path.posix.basename(normalizedPath).toLowerCase().endsWith("-shm")
	);
}

async function listDirectoryFiles({
	directory,
	root,
}: {
	directory: string;
	root: string;
}): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const absolutePath = path.join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				throw new Error(
					"Private runtime snapshots cannot contain symbolic links"
				);
			}
			if (entry.isDirectory()) {
				return listDirectoryFiles({ directory: absolutePath, root });
			}
			if (!entry.isFile()) {
				throw new Error("Private runtime snapshots can contain only files");
			}
			return [path.relative(root, absolutePath).split(path.sep).join("/")];
		})
	);
	return nested.flat();
}

export async function listJianyingFilterPrivateRuntimeFiles({
	runtimeRoot,
	exclude = [],
}: {
	runtimeRoot: string;
	exclude?: string[];
}): Promise<string[]> {
	const excluded = new Set(exclude);
	return (
		await listDirectoryFiles({ directory: runtimeRoot, root: runtimeRoot })
	)
		.filter(
			(relativePath) =>
				!excluded.has(relativePath) &&
				!isJianyingFilterPrivateRuntimeVolatileFile({ relativePath })
		)
		.sort();
}

async function sha256File({ filePath }: { filePath: string }): Promise<string> {
	const hash = createHash("sha256");
	await pipeline(
		createReadStream(filePath),
		new Writable({
			write(chunk: Buffer, _encoding, callback) {
				hash.update(chunk);
				callback();
			},
		})
	);
	return hash.digest("hex");
}

async function inspectFile({
	runtimeRoot,
	relativePath,
}: {
	runtimeRoot: string;
	relativePath: string;
}): Promise<JianyingFilterPrivateRuntimeFile> {
	const filePath = path.join(runtimeRoot, ...relativePath.split("/"));
	const metadata = await lstat(filePath);
	if (!metadata.isFile() || metadata.isSymbolicLink()) {
		throw new Error(
			`Private runtime entry is not a regular file: ${relativePath}`
		);
	}
	return {
		path: relativePath,
		bytes: metadata.size,
		sha256: await sha256File({ filePath }),
	};
}

export async function inspectJianyingFilterPrivateRuntimeFiles({
	runtimeRoot,
	relativePaths,
}: {
	runtimeRoot: string;
	relativePaths: string[];
}): Promise<JianyingFilterPrivateRuntimeFile[]> {
	return mapWithConcurrency({
		items: relativePaths,
		limit: HASH_CONCURRENCY,
		task: async ({ item }) => inspectFile({ runtimeRoot, relativePath: item }),
	});
}

export async function verifyJianyingFilterPrivateRuntimeFiles({
	runtimeRoot,
	expected,
	exclude = [],
}: {
	runtimeRoot: string;
	expected: JianyingFilterPrivateRuntimeFile[];
	exclude?: string[];
}): Promise<void> {
	const actualPaths = await listJianyingFilterPrivateRuntimeFiles({
		runtimeRoot,
		exclude,
	});
	const immutableExpected = expected.filter(
		(file) =>
			!isJianyingFilterPrivateRuntimeVolatileFile({
				relativePath: file.path,
			})
	);
	const expectedPaths = immutableExpected.map((file) => file.path).sort();
	if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
		throw new Error(
			"Private runtime file inventory does not match its manifest"
		);
	}
	const inspected = await inspectJianyingFilterPrivateRuntimeFiles({
		runtimeRoot,
		relativePaths: expectedPaths,
	});
	const expectedByPath = new Map(
		immutableExpected.map((file) => [file.path, file])
	);
	const mismatch = inspected.find((file) => {
		const manifestFile = expectedByPath.get(file.path);
		return (
			!manifestFile ||
			manifestFile.bytes !== file.bytes ||
			manifestFile.sha256 !== file.sha256
		);
	});
	if (mismatch) {
		throw new Error(`Private runtime checksum mismatch: ${mismatch.path}`);
	}
}
