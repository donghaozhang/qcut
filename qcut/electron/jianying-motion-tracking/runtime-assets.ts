import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";

const HASH_CONCURRENCY = 4;

export const JIANYING_MOTION_TRACKING_ROUTE =
	"jianying-bingo-object-tracking-11.3.0" as const;
export const EXPECTED_JIANYING_BUNDLE_ID = "com.lemon.lvpro";
export const EXPECTED_JIANYING_VERSION = "11.3.0";
export const EXPECTED_TRACKING_CORE_UUID =
	"100726E3-FCB0-31BC-98EE-1B196A1714A3";
export const EXPECTED_TRACKING_CORE_SHA256 =
	"b09c395d934169cb20ec865dd1d4032ca68023b287a7264e1b06ff4d71fd1be4";
export const EXPECTED_BINGO_MODEL_SHA256 =
	"b2f10c3c1ccc68afb7f5f61c587a29de029b8eff9590755f3b554db4aa04834f";
export const EXPECTED_TRACKING_FILESET_SHA256 =
	"7999e9cd22a0534f8db0cac9f7429f1bf441db0d3b356e01f4f9907d13a929b0";
export const EXPECTED_TRACKING_RUNTIME_LIBRARY_COUNT = 23;
export const EXPECTED_TRACKING_RUNTIME_BYTES = 294_090_115;
export const TRACKING_CORE_RELATIVE_PATH = "Frameworks/libcccreator.dylib";
export const BINGO_MODEL_RELATIVE_PATH =
	"Resources/models/object_tracking/bingo_objectTracking_v1.0.dat";
export const SINGLE_OBJECT_MODEL_RELATIVE_PATH =
	"Resources/models/single_object_tracking_v1.0.model";

export interface TrackingRuntimeManifestFile {
	bytes: number;
	path: string;
	sha256: string;
}

export interface TrackingRuntimeManifest {
	app: {
		bundleId: string;
		version: string;
	};
	architecture: "arm64";
	cloudUpload: false;
	core: {
		path: string;
		sha256: string;
		uuid: string;
	};
	createdAt: string;
	files: TrackingRuntimeManifestFile[];
	localOnly: true;
	modelPaths: string[];
	purpose: "jianying-motion-tracking-research-oracle";
	runtimeLibraryCount: number;
	schemaVersion: 1;
	totalBytes: number;
}

export function privateRuntimeBase() {
	return path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"PrivateRuntimes"
	);
}

export function defaultTrackingRuntimeRoot() {
	return path.join(privateRuntimeBase(), "JianyingTracking", "current");
}

function isSafeRelativePath({ value }: { value: string }) {
	if (!value || path.isAbsolute(value)) return false;
	const normalized = path.normalize(value);
	return (
		normalized === value &&
		normalized !== ".." &&
		!normalized.startsWith(`..${path.sep}`)
	);
}

function isManifestFile(value: unknown): value is TrackingRuntimeManifestFile {
	if (!value || typeof value !== "object") return false;
	const file = value as Partial<TrackingRuntimeManifestFile>;
	return (
		typeof file.path === "string" &&
		isSafeRelativePath({ value: file.path }) &&
		Number.isSafeInteger(file.bytes) &&
		(file.bytes ?? 0) >= 0 &&
		typeof file.sha256 === "string" &&
		/^[a-f0-9]{64}$/.test(file.sha256)
	);
}

export function trackingRuntimeFilesFingerprint({
	files,
}: {
	files: TrackingRuntimeManifestFile[];
}) {
	const canonical = [...files]
		.sort((first, second) => first.path.localeCompare(second.path))
		.map(({ bytes, path: relativePath, sha256 }) =>
			[relativePath, bytes, sha256].join("\0")
		)
		.join("\n");
	return createHash("sha256").update(canonical).digest("hex");
}

function isManifest(value: unknown): value is TrackingRuntimeManifest {
	if (!value || typeof value !== "object") return false;
	const manifest = value as Partial<TrackingRuntimeManifest>;
	if (
		manifest.schemaVersion !== 1 ||
		manifest.localOnly !== true ||
		manifest.cloudUpload !== false ||
		manifest.architecture !== "arm64" ||
		manifest.purpose !== "jianying-motion-tracking-research-oracle" ||
		manifest.app?.bundleId !== EXPECTED_JIANYING_BUNDLE_ID ||
		manifest.app.version !== EXPECTED_JIANYING_VERSION ||
		manifest.core?.path !== TRACKING_CORE_RELATIVE_PATH ||
		manifest.core.sha256 !== EXPECTED_TRACKING_CORE_SHA256 ||
		manifest.core.uuid !== EXPECTED_TRACKING_CORE_UUID ||
		typeof manifest.createdAt !== "string" ||
		!Array.isArray(manifest.files) ||
		!manifest.files.every(isManifestFile) ||
		!Array.isArray(manifest.modelPaths) ||
		!manifest.modelPaths.every(
			(modelPath) =>
				typeof modelPath === "string" &&
				isSafeRelativePath({ value: modelPath })
		) ||
		manifest.runtimeLibraryCount !== EXPECTED_TRACKING_RUNTIME_LIBRARY_COUNT ||
		manifest.totalBytes !== EXPECTED_TRACKING_RUNTIME_BYTES
	) {
		return false;
	}
	const paths = manifest.files.map((file) => file.path);
	const expectedModelPaths = [
		BINGO_MODEL_RELATIVE_PATH,
		SINGLE_OBJECT_MODEL_RELATIVE_PATH,
	].sort();
	return (
		new Set(paths).size === paths.length &&
		paths.includes(TRACKING_CORE_RELATIVE_PATH) &&
		paths.includes(BINGO_MODEL_RELATIVE_PATH) &&
		paths.includes(SINGLE_OBJECT_MODEL_RELATIVE_PATH) &&
		JSON.stringify([...manifest.modelPaths].sort()) ===
			JSON.stringify(expectedModelPaths) &&
		trackingRuntimeFilesFingerprint({ files: manifest.files }) ===
			EXPECTED_TRACKING_FILESET_SHA256
	);
}

export function sha256File({ filePath }: { filePath: string }) {
	return new Promise<string>((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}

async function listFiles({
	baseDirectory,
	directory = baseDirectory,
}: {
	baseDirectory: string;
	directory?: string;
}): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				return listFiles({ baseDirectory, directory: entryPath });
			}
			if (!entry.isFile()) return [];
			return [path.relative(baseDirectory, entryPath)];
		})
	);
	return nested.flat().sort();
}

export async function inspectRuntimeFiles({
	relativePaths,
	runtimeRoot,
}: {
	relativePaths: string[];
	runtimeRoot: string;
}) {
	return mapWithConcurrency({
		items: relativePaths,
		limit: HASH_CONCURRENCY,
		task: async ({ item: relativePath }) => {
			const filePath = path.join(runtimeRoot, relativePath);
			const [metadata, sha256] = await Promise.all([
				stat(filePath),
				sha256File({ filePath }),
			]);
			if (!metadata.isFile()) {
				throw new Error(`Private runtime entry is not a file: ${relativePath}`);
			}
			return { bytes: metadata.size, path: relativePath, sha256 };
		},
	});
}

export async function verifyTrackingRuntimeSnapshot({
	snapshotPath,
}: {
	snapshotPath: string;
}) {
	const manifestValue = JSON.parse(
		await readFile(path.join(snapshotPath, "manifest.json"), "utf8")
	) as unknown;
	if (!isManifest(manifestValue)) {
		throw new Error(`Invalid tracking runtime manifest: ${snapshotPath}`);
	}
	const manifest = manifestValue;
	const actualPaths = (await listFiles({ baseDirectory: snapshotPath })).filter(
		(relativePath) => relativePath !== "manifest.json"
	);
	const expectedPaths = manifest.files.map((file) => file.path).sort();
	if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
		throw new Error(
			"Private tracking runtime file list does not match manifest"
		);
	}
	const inspected = await inspectRuntimeFiles({
		relativePaths: expectedPaths,
		runtimeRoot: snapshotPath,
	});
	const expectedByPath = new Map(
		manifest.files.map((file) => [file.path, file])
	);
	for (const actual of inspected) {
		const expected = expectedByPath.get(actual.path);
		if (
			!expected ||
			expected.bytes !== actual.bytes ||
			expected.sha256 !== actual.sha256
		) {
			throw new Error(`Private runtime checksum mismatch: ${actual.path}`);
		}
	}
	const totalBytes = inspected.reduce((sum, file) => sum + file.bytes, 0);
	if (totalBytes !== manifest.totalBytes) {
		throw new Error(
			"Private tracking runtime byte total does not match manifest"
		);
	}
	return manifest;
}
