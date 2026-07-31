import { constants } from "node:fs";
import {
	access,
	mkdir,
	open,
	realpath,
	rename,
	rm,
	stat,
} from "node:fs/promises";
import { dirname, join, posix, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

const DRAFT_STORE_DIRECTORY_NAME = "com.lveditor.draft";

export interface CapCut81BundleAllocation {
	finalDirectory: string;
	outputParentDirectory: string;
	stagingDirectory: string;
}

function getNodeErrorCode({ value }: { value: unknown }): string | undefined {
	if (!(value instanceof Error) || !("code" in value)) return undefined;
	const code = (value as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

function assertSafeRelativePath({
	relativePath,
}: {
	relativePath: string;
}): void {
	const normalized = posix.normalize(relativePath);
	const isSafe =
		relativePath.length > 0 &&
		normalized === relativePath &&
		!posix.isAbsolute(relativePath) &&
		!relativePath.includes("\\") &&
		!relativePath.split("/").includes("..");
	if (!isSafe) {
		throw new Error(`Unsafe CapCut migration path: ${relativePath}`);
	}
}

function isInsideDraftStore({ directory }: { directory: string }): boolean {
	return directory
		.split(/[\\/]+/)
		.some(
			(part) => part.toLowerCase() === DRAFT_STORE_DIRECTORY_NAME.toLowerCase()
		);
}

async function allocateBundle({
	attempt,
	bundleName,
	outputParentDirectory,
}: {
	attempt: number;
	bundleName: string;
	outputParentDirectory: string;
}): Promise<CapCut81BundleAllocation> {
	if (attempt >= 8) {
		throw new Error("Unable to allocate a unique CapCut migration bundle.");
	}
	const exportId = randomUUID();
	const finalDirectory = join(
		outputParentDirectory,
		`${bundleName}-${exportId}`
	);
	const stagingDirectory = join(
		outputParentDirectory,
		`.qcut-capcut-${exportId}.staging`
	);
	try {
		await access(finalDirectory, constants.F_OK);
		return allocateBundle({
			attempt: attempt + 1,
			bundleName,
			outputParentDirectory,
		});
	} catch (error) {
		if (getNodeErrorCode({ value: error }) !== "ENOENT") throw error;
	}
	try {
		await mkdir(stagingDirectory, { mode: 0o700 });
	} catch (error) {
		if (getNodeErrorCode({ value: error }) !== "EEXIST") throw error;
		return allocateBundle({
			attempt: attempt + 1,
			bundleName,
			outputParentDirectory,
		});
	}
	return { finalDirectory, outputParentDirectory, stagingDirectory };
}

export async function createCapCut81BundleAllocation({
	bundleName,
	outputParentDirectory,
}: {
	bundleName: string;
	outputParentDirectory: string;
}): Promise<CapCut81BundleAllocation> {
	const metadata = await stat(outputParentDirectory);
	if (!metadata.isDirectory()) {
		throw new Error(
			`CapCut migration output parent is not a directory: ${outputParentDirectory}`
		);
	}
	const canonicalParent = await realpath(resolve(outputParentDirectory));
	if (isInsideDraftStore({ directory: canonicalParent })) {
		throw new Error(
			"CapCut migration refuses to write inside an application draft store."
		);
	}
	await access(canonicalParent, constants.W_OK);
	return allocateBundle({
		attempt: 0,
		bundleName,
		outputParentDirectory: canonicalParent,
	});
}

export async function writeCapCut81BundleFile({
	content,
	relativePath,
	rootDirectory,
}: {
	content: string;
	relativePath: string;
	rootDirectory: string;
}): Promise<string> {
	assertSafeRelativePath({ relativePath });
	const filePath = join(rootDirectory, ...relativePath.split("/"));
	await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
	const handle = await open(filePath, "wx", 0o600);
	try {
		await handle.writeFile(content, "utf8");
		await handle.sync();
	} finally {
		await handle.close();
	}
	return filePath;
}

async function syncDirectory({
	directory,
}: {
	directory: string;
}): Promise<string | undefined> {
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(directory, "r");
		await handle.sync();
		return undefined;
	} catch (error) {
		const code = getNodeErrorCode({ value: error });
		if (
			code !== undefined &&
			["EINVAL", "ENOTSUP", "EPERM", "EISDIR"].includes(code)
		) {
			return `Directory fsync is unsupported on this filesystem (${code}).`;
		}
		throw error;
	} finally {
		await handle?.close();
	}
}

export async function syncCapCut81BundleDirectories({
	directories,
}: {
	directories: string[];
}): Promise<string[]> {
	const uniqueDirectories = [...new Set(directories)].sort(
		(left, right) => right.split(sep).length - left.split(sep).length
	);
	const results = await Promise.all(
		uniqueDirectories.map((directory) => syncDirectory({ directory }))
	);
	return results.flatMap((warning) => (warning ? [warning] : []));
}

export async function publishCapCut81Bundle({
	allocation,
}: {
	allocation: CapCut81BundleAllocation;
}): Promise<string[]> {
	await rename(allocation.stagingDirectory, allocation.finalDirectory);
	try {
		return await syncCapCut81BundleDirectories({
			directories: [allocation.outputParentDirectory],
		});
	} catch (error) {
		return [
			`Published CapCut bundle but could not fsync its parent: ${
				error instanceof Error ? error.message : String(error)
			}`,
		];
	}
}

export async function cleanupCapCut81Bundle({
	allocation,
}: {
	allocation: CapCut81BundleAllocation;
}): Promise<void> {
	await rm(allocation.stagingDirectory, { force: true, recursive: true });
	try {
		await syncCapCut81BundleDirectories({
			directories: [allocation.outputParentDirectory],
		});
	} catch {
		// The staging tree is already gone; cleanup durability is best effort.
	}
}
