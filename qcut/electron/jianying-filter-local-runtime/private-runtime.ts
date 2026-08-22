import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const JIANYING_FILTER_PRIVATE_RUNTIME_DIRECTORY = "JianyingFilter";
export const JIANYING_FILTER_PRIVATE_RUNTIME_MANIFEST = "manifest.json";

export interface JianyingFilterPrivateRuntimeFile {
	path: string;
	bytes: number;
	sha256: string;
}

export interface JianyingFilterPrivateRuntimeManifest {
	schemaVersion: 1;
	createdAt: string;
	localOnly: true;
	cloudUpload: false;
	coreUuid: string;
	runtimeLibraryCount: number;
	modelCount: number;
	packageCount: number;
	databaseFileCount: number;
	totalBytes: number;
	files: JianyingFilterPrivateRuntimeFile[];
}

export function jianyingFilterPrivateRuntimeRoot({
	homeDirectory = os.homedir(),
}: {
	homeDirectory?: string;
} = {}): string {
	return path.join(
		homeDirectory,
		"Library",
		"Application Support",
		"QCut",
		"PrivateRuntimes",
		JIANYING_FILTER_PRIVATE_RUNTIME_DIRECTORY
	);
}

export function jianyingFilterPrivateRuntimeCurrent({
	privateRuntimeRoot = jianyingFilterPrivateRuntimeRoot(),
}: {
	privateRuntimeRoot?: string;
} = {}): string {
	return path.join(privateRuntimeRoot, "current");
}

export function jianyingFilterPrivateCacheRoot({
	runtimeRoot = jianyingFilterPrivateRuntimeCurrent(),
}: {
	runtimeRoot?: string;
} = {}): string {
	return path.join(runtimeRoot, "Cache");
}

export function jianyingFilterPrivateModelDirectory({
	runtimeRoot = jianyingFilterPrivateRuntimeCurrent(),
}: {
	runtimeRoot?: string;
} = {}): string {
	return path.join(runtimeRoot, "Models");
}

function isManifestFile(
	value: unknown
): value is JianyingFilterPrivateRuntimeFile {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<JianyingFilterPrivateRuntimeFile>;
	return (
		typeof candidate.path === "string" &&
		candidate.path.length > 0 &&
		!path.isAbsolute(candidate.path) &&
		!candidate.path.split(/[\\/]/).includes("..") &&
		Number.isSafeInteger(candidate.bytes) &&
		(candidate.bytes ?? -1) >= 0 &&
		typeof candidate.sha256 === "string" &&
		/^[a-f0-9]{64}$/.test(candidate.sha256)
	);
}

function isCount(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parseJianyingFilterPrivateRuntimeManifest({
	value,
}: {
	value: unknown;
}): JianyingFilterPrivateRuntimeManifest | null {
	if (!value || typeof value !== "object") return null;
	const manifest = value as Partial<JianyingFilterPrivateRuntimeManifest>;
	if (
		manifest.schemaVersion !== 1 ||
		manifest.localOnly !== true ||
		manifest.cloudUpload !== false ||
		typeof manifest.createdAt !== "string" ||
		!Number.isFinite(Date.parse(manifest.createdAt)) ||
		typeof manifest.coreUuid !== "string" ||
		!/^[A-F0-9-]{36}$/.test(manifest.coreUuid) ||
		!isCount(manifest.runtimeLibraryCount) ||
		!isCount(manifest.modelCount) ||
		!isCount(manifest.packageCount) ||
		!isCount(manifest.databaseFileCount) ||
		!isCount(manifest.totalBytes) ||
		!Array.isArray(manifest.files) ||
		!manifest.files.every(isManifestFile)
	) {
		return null;
	}
	const paths = manifest.files.map((file) => file.path);
	if (new Set(paths).size !== paths.length) return null;
	return manifest as JianyingFilterPrivateRuntimeManifest;
}

export async function readJianyingFilterPrivateRuntimeManifest({
	runtimeRoot = jianyingFilterPrivateRuntimeCurrent(),
}: {
	runtimeRoot?: string;
} = {}): Promise<JianyingFilterPrivateRuntimeManifest | null> {
	try {
		const value = JSON.parse(
			await readFile(
				path.join(runtimeRoot, JIANYING_FILTER_PRIVATE_RUNTIME_MANIFEST),
				"utf8"
			)
		) as unknown;
		return parseJianyingFilterPrivateRuntimeManifest({ value });
	} catch {
		return null;
	}
}

export async function hasJianyingFilterPrivateRuntime({
	runtimeRoot = jianyingFilterPrivateRuntimeCurrent(),
}: {
	runtimeRoot?: string;
} = {}): Promise<boolean> {
	const manifest = await readJianyingFilterPrivateRuntimeManifest({
		runtimeRoot,
	});
	if (!manifest) return false;
	try {
		await Promise.all([
			access(path.join(runtimeRoot, "Frameworks", "libcccreator.dylib")),
			access(path.join(runtimeRoot, "Models")),
			access(path.join(runtimeRoot, "Cache", "ressdk_db")),
		]);
		return true;
	} catch {
		return false;
	}
}
