import { cp, lstat, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { mapWithConcurrency } from "./lib/map-with-concurrency.js";

export interface PrivateArchiveContainerSummary {
	fileCount: number;
	byteCount: number;
	latestMtimeMs: number;
}

interface FileInventoryEntry {
	relativePath: string;
	size: number;
	mtimeMs: number;
}

export async function isPrivateArchiveDirectory({
	directory,
}: {
	directory: string;
}) {
	try {
		return (await lstat(directory)).isDirectory();
	} catch {
		return false;
	}
}

async function collectFileInventory({
	include,
	root,
}: {
	include?: ({ relativePath }: { relativePath: string }) => boolean;
	root: string;
}) {
	const relativePaths = (await readdir(root, { recursive: true })).filter(
		(relativePath) => !include || include({ relativePath })
	);
	const inspected = await mapWithConcurrency({
		items: relativePaths,
		limit: 32,
		task: async ({ item: relativePath }) => {
			const metadata = await lstat(path.join(root, relativePath));
			if (metadata.isDirectory()) return null;
			if (!metadata.isFile()) {
				throw new Error(`QCut 花字备份拒绝非常规文件：${relativePath}`);
			}
			return {
				relativePath,
				size: metadata.size,
				mtimeMs: metadata.mtimeMs,
			} satisfies FileInventoryEntry;
		},
	});
	const files = inspected.filter(
		(entry): entry is FileInventoryEntry => entry !== null
	);
	return files.sort((left, right) =>
		left.relativePath.localeCompare(right.relativePath)
	);
}

function summarizeInventory({
	inventory,
}: {
	inventory: FileInventoryEntry[];
}) {
	return {
		fileCount: inventory.length,
		byteCount: inventory.reduce((total, file) => total + file.size, 0),
		latestMtimeMs: inventory.reduce(
			(latest, file) => Math.max(latest, file.mtimeMs),
			0
		),
	} satisfies PrivateArchiveContainerSummary;
}

function inventoryEntryChanged({
	destination,
	source,
}: {
	destination?: FileInventoryEntry;
	source: FileInventoryEntry;
}) {
	return (
		!destination ||
		destination.size !== source.size ||
		Math.abs(destination.mtimeMs - source.mtimeMs) > 1
	);
}

async function copyChangedFiles({
	destination,
	destinationInventory,
	source,
	sourceInventory,
}: {
	destination: string;
	destinationInventory: FileInventoryEntry[];
	source: string;
	sourceInventory: FileInventoryEntry[];
}) {
	const destinationByPath = new Map(
		destinationInventory.map((entry) => [entry.relativePath, entry])
	);
	const changedFiles = sourceInventory.filter((entry) =>
		inventoryEntryChanged({
			destination: destinationByPath.get(entry.relativePath),
			source: entry,
		})
	);
	await mapWithConcurrency({
		items: changedFiles,
		limit: 12,
		task: async ({ item }) => {
			const sourcePath = path.join(source, item.relativePath);
			const destinationPath = path.join(destination, item.relativePath);
			await mkdir(path.dirname(destinationPath), { recursive: true });
			await cp(sourcePath, destinationPath, {
				force: true,
				preserveTimestamps: true,
			});
			return destinationPath;
		},
	});
}

function assertInventoryCopied({
	container,
	destination,
	source,
}: {
	container: string;
	destination: FileInventoryEntry[];
	source: FileInventoryEntry[];
}) {
	const destinationSizes = new Map(
		destination.map(({ relativePath, size }) => [relativePath, size])
	);
	const missing = source.find(
		({ relativePath, size }) => destinationSizes.get(relativePath) !== size
	);
	if (missing) {
		throw new Error(
			`QCut 花字备份校验失败：${container}/${missing.relativePath}`
		);
	}
}

export async function syncPrivateArchiveContainer({
	container,
	destination,
	include,
	source,
}: {
	container: string;
	destination: string;
	include?: ({ relativePath }: { relativePath: string }) => boolean;
	source: string;
}) {
	if (!(await isPrivateArchiveDirectory({ directory: source }))) {
		throw new Error(`剪映花字源目录不存在：${container}`);
	}
	const sourceInventory = await collectFileInventory({ include, root: source });
	await mkdir(destination, { recursive: true });
	const destinationInventoryBeforeCopy = await collectFileInventory({
		include,
		root: destination,
	});
	await copyChangedFiles({
		destination,
		destinationInventory: destinationInventoryBeforeCopy,
		source,
		sourceInventory,
	});
	const destinationInventory = await collectFileInventory({
		include,
		root: destination,
	});
	assertInventoryCopied({
		container,
		destination: destinationInventory,
		source: sourceInventory,
	});
	return summarizeInventory({ inventory: destinationInventory });
}

export async function summarizePrivateArchiveContainer({
	destination,
}: {
	destination: string;
}) {
	await mkdir(destination, { recursive: true });
	return summarizeInventory({
		inventory: await collectFileInventory({ root: destination }),
	});
}
