import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
	isPrivateArchiveDirectory,
	summarizePrivateArchiveContainer,
	syncPrivateArchiveContainer,
	type PrivateArchiveContainerSummary,
} from "./jianying-text-private-archive-files.js";

const ARCHIVE_SCHEMA_VERSION = 3;
const SOURCE_CONTAINER_NAMES = ["artistEffect", "effect", "ressdk_db"] as const;
const ARCHIVE_CONTAINER_NAMES = [
	...SOURCE_CONTAINER_NAMES,
	"recovered-resources",
	"project-evidence",
] as const;
const MANIFEST_FILE_NAME = "manifest.json";

type ArchiveContainerName = (typeof ARCHIVE_CONTAINER_NAMES)[number];

export interface QCutJianyingTextPrivateArchiveManifest {
	schemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
	completedAt: string;
	containers: Record<ArchiveContainerName, PrivateArchiveContainerSummary>;
}

export interface QCutJianyingTextPrivateArchive {
	archiveRoot: string;
	cacheRoot: string;
	packageRoot: string;
	animationPackageRoot: string;
	databaseRoot: string;
	recoveryRoot: string;
	projectEvidenceRoot: string;
	manifest: QCutJianyingTextPrivateArchiveManifest;
}

export interface EnsureQCutJianyingTextPrivateArchiveOptions {
	archiveRoot?: string;
	sourceCacheRoot?: string;
	recoverySourceRoot?: string;
	projectEvidenceSourceRoot?: string;
	refresh?: boolean;
}

const pendingArchives = new Map<
	string,
	Promise<QCutJianyingTextPrivateArchive>
>();

export function getDefaultJianyingTextSourceCacheRoot() {
	return path.join(homedir(), "Movies", "JianyingPro", "User Data", "Cache");
}

export function getDefaultJianyingTextProjectEvidenceSourceRoot() {
	return path.join(
		homedir(),
		"Movies",
		"JianyingPro",
		"User Data",
		"Projects",
		"com.lveditor.draft"
	);
}

export function getQCutJianyingTextPrivateArchiveRoot() {
	return (
		process.env.QCUT_JIANYING_TEXT_PRIVATE_ARCHIVE_ROOT ??
		path.join(
			homedir(),
			"Library",
			"Application Support",
			"QCut",
			"PrivateAssets",
			"JianyingText"
		)
	);
}

export function getLegacyQCutJianyingTextRecoveryRoot() {
	return path.join(
		homedir(),
		"Library",
		"Caches",
		"QCut",
		"jianying-text-runtime",
		"recovered-resources"
	);
}

function archivePaths({ archiveRoot }: { archiveRoot: string }) {
	const cacheRoot = path.join(archiveRoot, "Cache");
	return {
		archiveRoot,
		cacheRoot,
		packageRoot: path.join(cacheRoot, "artistEffect"),
		animationPackageRoot: path.join(cacheRoot, "effect"),
		databaseRoot: path.join(cacheRoot, "ressdk_db"),
		recoveryRoot: path.join(cacheRoot, "recovered-resources"),
		projectEvidenceRoot: path.join(cacheRoot, "project-evidence"),
		manifestPath: path.join(archiveRoot, MANIFEST_FILE_NAME),
	};
}

function isContainerSummary(
	value: unknown
): value is PrivateArchiveContainerSummary {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.fileCount === "number" &&
		Number.isSafeInteger(record.fileCount) &&
		record.fileCount >= 0 &&
		typeof record.byteCount === "number" &&
		Number.isSafeInteger(record.byteCount) &&
		record.byteCount >= 0 &&
		typeof record.latestMtimeMs === "number" &&
		Number.isFinite(record.latestMtimeMs) &&
		record.latestMtimeMs >= 0
	);
}

function isArchiveManifest(
	value: unknown
): value is QCutJianyingTextPrivateArchiveManifest {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	if (
		record.schemaVersion !== ARCHIVE_SCHEMA_VERSION ||
		typeof record.completedAt !== "string" ||
		!record.containers ||
		typeof record.containers !== "object"
	) {
		return false;
	}
	const containers = record.containers as Record<string, unknown>;
	return ARCHIVE_CONTAINER_NAMES.every((name) =>
		isContainerSummary(containers[name])
	);
}

async function readArchive({ archiveRoot }: { archiveRoot: string }) {
	const paths = archivePaths({ archiveRoot });
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(paths.manifestPath, "utf8"));
	} catch {
		return null;
	}
	if (!isArchiveManifest(parsed)) return null;
	const containerDirectories = ARCHIVE_CONTAINER_NAMES.map((name) =>
		path.join(paths.cacheRoot, name)
	);
	const present = await Promise.all(
		containerDirectories.map((directory) =>
			isPrivateArchiveDirectory({ directory })
		)
	);
	if (present.some((value) => !value)) return null;
	return {
		archiveRoot: paths.archiveRoot,
		cacheRoot: paths.cacheRoot,
		packageRoot: paths.packageRoot,
		animationPackageRoot: paths.animationPackageRoot,
		databaseRoot: paths.databaseRoot,
		recoveryRoot: paths.recoveryRoot,
		projectEvidenceRoot: paths.projectEvidenceRoot,
		manifest: parsed,
	} satisfies QCutJianyingTextPrivateArchive;
}

async function syncContainer({
	destinationRoot,
	include,
	name,
	source,
}: {
	destinationRoot: string;
	include?: ({ relativePath }: { relativePath: string }) => boolean;
	name: ArchiveContainerName;
	source: string;
}) {
	return syncPrivateArchiveContainer({
		container: name,
		destination: path.join(destinationRoot, name),
		include,
		source,
	});
}

async function summarizeExistingContainer({
	destinationRoot,
	name,
}: {
	destinationRoot: string;
	name: ArchiveContainerName;
}) {
	return summarizePrivateArchiveContainer({
		destination: path.join(destinationRoot, name),
	});
}

async function writeManifest({
	manifest,
	manifestPath,
}: {
	manifest: QCutJianyingTextPrivateArchiveManifest;
	manifestPath: string;
}) {
	const temporaryPath = `${manifestPath}.tmp-${process.pid}`;
	await writeFile(
		temporaryPath,
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8"
	);
	await rename(temporaryPath, manifestPath);
}

async function synchronizeArchive({
	archiveRoot,
	projectEvidenceSourceRoot,
	recoverySourceRoot,
	sourceCacheRoot,
}: {
	archiveRoot: string;
	projectEvidenceSourceRoot: string;
	recoverySourceRoot: string;
	sourceCacheRoot: string;
}) {
	const paths = archivePaths({ archiveRoot });
	await mkdir(paths.cacheRoot, { recursive: true });
	const sourceSummaries = await Promise.all(
		SOURCE_CONTAINER_NAMES.map(
			async (name) =>
				[
					name,
					await syncContainer({
						destinationRoot: paths.cacheRoot,
						name,
						source: path.join(sourceCacheRoot, name),
					}),
				] as const
		)
	);
	const recoveredSummary = (await isPrivateArchiveDirectory({
		directory: recoverySourceRoot,
	}))
		? await syncContainer({
				destinationRoot: paths.cacheRoot,
				name: "recovered-resources",
				source: recoverySourceRoot,
			})
		: await summarizeExistingContainer({
				destinationRoot: paths.cacheRoot,
				name: "recovered-resources",
			});
	const projectEvidenceSummary = (await isPrivateArchiveDirectory({
		directory: projectEvidenceSourceRoot,
	}))
		? await syncContainer({
				destinationRoot: paths.cacheRoot,
				include: ({ relativePath }) =>
					path.basename(relativePath) === "key_value.json",
				name: "project-evidence",
				source: projectEvidenceSourceRoot,
			})
		: await summarizeExistingContainer({
				destinationRoot: paths.cacheRoot,
				name: "project-evidence",
			});
	const summaries = {
		...Object.fromEntries(sourceSummaries),
		"recovered-resources": recoveredSummary,
		"project-evidence": projectEvidenceSummary,
	} as Record<ArchiveContainerName, PrivateArchiveContainerSummary>;
	const manifest = {
		schemaVersion: ARCHIVE_SCHEMA_VERSION,
		completedAt: new Date().toISOString(),
		containers: summaries,
	} satisfies QCutJianyingTextPrivateArchiveManifest;
	await writeManifest({ manifest, manifestPath: paths.manifestPath });
	return {
		archiveRoot: paths.archiveRoot,
		cacheRoot: paths.cacheRoot,
		packageRoot: paths.packageRoot,
		animationPackageRoot: paths.animationPackageRoot,
		databaseRoot: paths.databaseRoot,
		recoveryRoot: paths.recoveryRoot,
		projectEvidenceRoot: paths.projectEvidenceRoot,
		manifest,
	} satisfies QCutJianyingTextPrivateArchive;
}

export async function ensureQCutJianyingTextPrivateArchive(
	options: EnsureQCutJianyingTextPrivateArchiveOptions = {}
) {
	const archiveRoot =
		options.archiveRoot ?? getQCutJianyingTextPrivateArchiveRoot();
	const refresh = options.refresh ?? false;
	const sourceCacheRoot =
		options.sourceCacheRoot ?? getDefaultJianyingTextSourceCacheRoot();
	const recoverySourceRoot =
		options.recoverySourceRoot ??
		(options.sourceCacheRoot
			? path.join(options.sourceCacheRoot, "recovered-resources")
			: getLegacyQCutJianyingTextRecoveryRoot());
	const projectEvidenceSourceRoot =
		options.projectEvidenceSourceRoot ??
		(options.sourceCacheRoot
			? path.join(options.sourceCacheRoot, "project-evidence")
			: getDefaultJianyingTextProjectEvidenceSourceRoot());
	const existing = await readArchive({ archiveRoot });
	if (existing && !refresh) return existing;
	const sourcePresent = await Promise.all(
		SOURCE_CONTAINER_NAMES.map((name) =>
			isPrivateArchiveDirectory({ directory: path.join(sourceCacheRoot, name) })
		)
	);
	if (sourcePresent.some((value) => !value)) {
		if (existing) return existing;
		throw new Error(
			"QCut 尚未建立花字私有备份，且没有找到可导入的剪映花字缓存。"
		);
	}
	const key = `${archiveRoot}\0${sourceCacheRoot}\0${recoverySourceRoot}\0${projectEvidenceSourceRoot}`;
	const pending = pendingArchives.get(key);
	if (pending) return pending;
	const synchronization = synchronizeArchive({
		archiveRoot,
		projectEvidenceSourceRoot,
		recoverySourceRoot,
		sourceCacheRoot,
	}).finally(() => pendingArchives.delete(key));
	pendingArchives.set(key, synchronization);
	return synchronization;
}

export async function findQCutJianyingTextPrivateArchive({
	archiveRoot = getQCutJianyingTextPrivateArchiveRoot(),
}: {
	archiveRoot?: string;
} = {}) {
	return readArchive({ archiveRoot });
}
