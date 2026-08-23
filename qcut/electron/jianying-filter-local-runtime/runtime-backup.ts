import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
	access,
	cp,
	lstat,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { JianyingKnownFilter } from "../jianying-filter-metadata.js";
import { JIANYING_PORTRAIT_MAKEUP_CARDS } from "../jianying-portrait-adjustment-runtime/makeup-catalog.js";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";
import {
	inspectJianyingFilterPrivateRuntimeFiles,
	isJianyingFilterPrivateRuntimeVolatileFile,
	listJianyingFilterPrivateRuntimeFiles,
	verifyJianyingFilterPrivateRuntimeFiles,
} from "./private-runtime-manifest.js";
import {
	JIANYING_FILTER_PRIVATE_RUNTIME_MANIFEST,
	parseJianyingFilterPrivateRuntimeManifest,
	readJianyingFilterPrivateRuntimeManifest,
	type JianyingFilterPrivateRuntimeManifest,
	jianyingFilterPrivateRuntimeRoot,
} from "./private-runtime.js";
import type { JianyingFilterLocalRuntimeInspection } from "./runtime-discovery.js";
import { JIANYING_PORTRAIT_PACKAGE_IDENTITIES } from "../jianying-portrait-adjustment-runtime/catalog.js";

const execFileAsync = promisify(execFile);
const COPY_CONCURRENCY = 3;
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

interface CopyTask {
	sourcePath: string;
	destinationRelativePath: string;
	kind: "frameworks" | "models" | "database" | "package";
}

export interface JianyingFilterRuntimeBackupResult {
	created: boolean;
	coreUuid: string;
	fileCount: number;
	runtimeLibraryCount: number;
	modelCount: number;
	packageCount: number;
	databaseFileCount: number;
	totalBytes: number;
	createdAt: string;
}

export interface BackupJianyingFilterRuntimeOptions {
	filters: JianyingKnownFilter[];
	runtime: JianyingFilterLocalRuntimeInspection;
	privateRuntimeRoot?: string;
	sourceCacheRoot?: string;
	managedPackageRoot?: string | null;
	readCoreUuid?: ({ binaryPath }: { binaryPath: string }) => Promise<string>;
}

function installedCacheRoot(): string {
	return path.join(os.homedir(), "Movies", "JianyingPro", "User Data", "Cache");
}

async function pathExists({
	filePath,
}: {
	filePath: string;
}): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function readCoreUuid({ binaryPath }: { binaryPath: string }) {
	const { stdout } = await execFileAsync("dwarfdump", ["--uuid", binaryPath], {
		maxBuffer: 1024 * 1024,
		timeout: 5000,
	});
	const expectedArchitecture = process.arch === "x64" ? "x86_64" : process.arch;
	const match = stdout
		.split("\n")
		.map((line) => /UUID:\s+([0-9A-F-]+)\s+\(([^)]+)\)/i.exec(line))
		.find((candidate) => candidate?.[2] === expectedArchitecture);
	if (!match?.[1]) {
		throw new Error("无法读取剪映本机运行库的架构 UUID");
	}
	return match[1].toUpperCase();
}

function filterPackageIdentifiers({
	filters,
}: {
	filters: JianyingKnownFilter[];
}): string[] {
	return [
		...new Set(
			filters.flatMap((filter) => [
				filter.resourceId,
				filter.effectId,
				filter.thirdResourceId,
			])
		),
	].filter((value): value is string =>
		Boolean(
			value && SAFE_SEGMENT.test(value) && value !== "." && value !== ".."
		)
	);
}

async function directoryNames({ directory }: { directory: string }) {
	try {
		return (await readdir(directory, { withFileTypes: true }))
			.filter(
				(entry) =>
					entry.isDirectory() &&
					SAFE_SEGMENT.test(entry.name) &&
					entry.name !== "." &&
					entry.name !== ".."
			)
			.map((entry) => entry.name);
	} catch {
		return [] as string[];
	}
}

async function packageTasksForRoot({
	container,
	identifiers,
	root,
}: {
	container: "artistEffect" | "effect";
	identifiers: string[];
	root: string;
}): Promise<CopyTask[]> {
	const inspected = await Promise.all(
		identifiers.map(async (identifier) => {
			const identifierRoot = path.join(root, container, identifier);
			const versions = await directoryNames({ directory: identifierRoot });
			return versions.map((version) => ({
				sourcePath: path.join(identifierRoot, version),
				destinationRelativePath: path.join(
					"Cache",
					container,
					identifier,
					version
				),
				kind: "package" as const,
			}));
		})
	);
	return inspected.flat();
}

async function managedPackageTasks({
	managedPackageRoot,
	resourceIds,
}: {
	managedPackageRoot: string | null;
	resourceIds: string[];
}): Promise<CopyTask[]> {
	if (!managedPackageRoot) return [];
	const inspected = await Promise.all(
		resourceIds.map(async (resourceId) => {
			const resourceRoot = path.join(managedPackageRoot, resourceId);
			const versions = await directoryNames({ directory: resourceRoot });
			return versions.map((version) => ({
				sourcePath: path.join(resourceRoot, version),
				destinationRelativePath: path.join(
					"Cache",
					"artistEffect",
					resourceId,
					version
				),
				kind: "package" as const,
			}));
		})
	);
	return inspected.flat();
}

async function portraitAdjustmentPackageTasks({
	sourceCacheRoot,
}: {
	sourceCacheRoot: string;
}): Promise<CopyTask[]> {
	const packageIdentities = [
		...Object.values(JIANYING_PORTRAIT_PACKAGE_IDENTITIES),
		...JIANYING_PORTRAIT_MAKEUP_CARDS,
	];
	const candidates = [
		...new Map(
			packageIdentities.map(({ resourceId, version }) => [
				`${resourceId}/${version}`,
				{ resourceId, version },
			])
		).values(),
	].map(({ resourceId, version }) => ({
		sourcePath: path.join(sourceCacheRoot, "effect", resourceId, version),
		destinationRelativePath: path.join("Cache", "effect", resourceId, version),
		kind: "package" as const,
	}));
	const availability = await Promise.all(
		candidates.map(async (task) => ({
			task,
			available: await pathExists({ filePath: task.sourcePath }),
		}))
	);
	return availability
		.filter(({ available }) => available)
		.map(({ task }) => task);
}

function deduplicateCopyTasks({ tasks }: { tasks: CopyTask[] }): CopyTask[] {
	const byDestination = new Map<string, CopyTask>();
	for (const task of tasks) {
		if (!byDestination.has(task.destinationRelativePath)) {
			byDestination.set(task.destinationRelativePath, task);
		}
	}
	return [...byDestination.values()];
}

async function buildCopyTasks({
	filters,
	frameworkDirectory,
	modelDirectory,
	sourceCacheRoot,
	managedPackageRoot,
}: {
	filters: JianyingKnownFilter[];
	frameworkDirectory: string;
	modelDirectory: string;
	sourceCacheRoot: string;
	managedPackageRoot: string | null;
}): Promise<CopyTask[]> {
	const identifiers = filterPackageIdentifiers({ filters });
	const resourceIds = filters
		.map(({ resourceId }) => resourceId)
		.filter(
			(value) => SAFE_SEGMENT.test(value) && value !== "." && value !== ".."
		);
	const [
		artistPackages,
		effectPackages,
		managedPackages,
		portraitAdjustmentPackages,
	] = await Promise.all([
		packageTasksForRoot({
			container: "artistEffect",
			identifiers,
			root: sourceCacheRoot,
		}),
		packageTasksForRoot({
			container: "effect",
			identifiers,
			root: sourceCacheRoot,
		}),
		managedPackageTasks({ managedPackageRoot, resourceIds }),
		portraitAdjustmentPackageTasks({ sourceCacheRoot }),
	]);
	return deduplicateCopyTasks({
		tasks: [
			{
				sourcePath: frameworkDirectory,
				destinationRelativePath: "Frameworks",
				kind: "frameworks",
			},
			{
				sourcePath: modelDirectory,
				destinationRelativePath: "Models",
				kind: "models",
			},
			{
				sourcePath: path.join(sourceCacheRoot, "ressdk_db"),
				destinationRelativePath: path.join("Cache", "ressdk_db"),
				kind: "database",
			},
			...artistPackages,
			...effectPackages,
			...managedPackages,
			...portraitAdjustmentPackages,
		],
	});
}

async function copyTask({
	runtimeRoot,
	task,
}: {
	runtimeRoot: string;
	task: CopyTask;
}): Promise<void> {
	if (!(await pathExists({ filePath: task.sourcePath }))) {
		throw new Error(`本机滤镜备份缺少来源：${task.kind}`);
	}
	const destinationPath = path.join(
		runtimeRoot,
		...task.destinationRelativePath.split(path.sep)
	);
	await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
	await cp(task.sourcePath, destinationPath, {
		recursive: true,
		force: false,
		errorOnExist: true,
		preserveTimestamps: true,
	});
}

async function removeVolatileDatabaseFiles({
	directory,
	root,
}: {
	directory: string;
	root: string;
}): Promise<void> {
	const entries = await readdir(directory, { withFileTypes: true }).catch(
		() => []
	);
	await Promise.all(
		entries.map(async (entry) => {
			const absolutePath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				await removeVolatileDatabaseFiles({ directory: absolutePath, root });
				return;
			}
			const relativePath = path.relative(root, absolutePath);
			if (
				entry.isFile() &&
				isJianyingFilterPrivateRuntimeVolatileFile({ relativePath })
			) {
				await rm(absolutePath, { force: true });
			}
		})
	);
}

function countFilesByPrefix({
	files,
	prefix,
}: {
	files: { path: string }[];
	prefix: string;
}): number {
	return files.filter((file) => file.path.startsWith(prefix)).length;
}

function snapshotIdentity({
	coreUuid,
	files,
}: {
	coreUuid: string;
	files: { path: string; bytes: number; sha256: string }[];
}): string {
	const digest = createHash("sha256")
		.update(coreUuid)
		.update(JSON.stringify(files))
		.digest("hex")
		.slice(0, 16);
	return `${coreUuid}-${digest}`;
}

async function pointCurrentAt({
	privateRuntimeRoot,
	snapshotName,
}: {
	privateRuntimeRoot: string;
	snapshotName: string;
}): Promise<void> {
	const temporaryLink = path.join(
		privateRuntimeRoot,
		`.current-${process.pid}-${Date.now()}`
	);
	const currentLink = path.join(privateRuntimeRoot, "current");
	await symlink(snapshotName, temporaryLink, "dir");
	try {
		await rename(temporaryLink, currentLink);
	} catch (cause) {
		const current = await lstat(currentLink).catch(() => null);
		if (!current?.isSymbolicLink()) throw cause;
		await rm(currentLink);
		await rename(temporaryLink, currentLink);
	}
}

async function verifySnapshot({
	runtimeRoot,
}: {
	runtimeRoot: string;
}): Promise<JianyingFilterPrivateRuntimeManifest> {
	const manifest = await readJianyingFilterPrivateRuntimeManifest({
		runtimeRoot,
	});
	if (!manifest) throw new Error("本机滤镜备份清单无效");
	await verifyJianyingFilterPrivateRuntimeFiles({
		runtimeRoot,
		expected: manifest.files,
		exclude: [JIANYING_FILTER_PRIVATE_RUNTIME_MANIFEST],
	});
	return manifest;
}

function publicResult({
	created,
	manifest,
}: {
	created: boolean;
	manifest: JianyingFilterPrivateRuntimeManifest;
}): JianyingFilterRuntimeBackupResult {
	return {
		created,
		coreUuid: manifest.coreUuid,
		fileCount: manifest.files.length,
		runtimeLibraryCount: manifest.runtimeLibraryCount,
		modelCount: manifest.modelCount,
		packageCount: manifest.packageCount,
		databaseFileCount: manifest.databaseFileCount,
		totalBytes: manifest.totalBytes,
		createdAt: manifest.createdAt,
	};
}

export async function backupJianyingFilterRuntime({
	filters,
	runtime,
	privateRuntimeRoot = jianyingFilterPrivateRuntimeRoot(),
	sourceCacheRoot = installedCacheRoot(),
	managedPackageRoot = null,
	readCoreUuid: resolveCoreUuid = readCoreUuid,
}: BackupJianyingFilterRuntimeOptions): Promise<JianyingFilterRuntimeBackupResult> {
	if (
		runtime.status.state !== "ready" ||
		!runtime.effectLibraryPath ||
		!runtime.frameworkDirectory ||
		!runtime.modelDirectory
	) {
		throw new Error(runtime.status.message);
	}
	await mkdir(privateRuntimeRoot, { recursive: true, mode: 0o700 });
	const coreUuid = await resolveCoreUuid({
		binaryPath: runtime.effectLibraryPath,
	});
	const tasks = await buildCopyTasks({
		filters,
		frameworkDirectory: runtime.frameworkDirectory,
		modelDirectory: runtime.modelDirectory,
		sourceCacheRoot,
		managedPackageRoot,
	});
	const stagingRoot = path.join(
		privateRuntimeRoot,
		`.staging-${process.pid}-${Date.now()}`
	);
	await rm(stagingRoot, { recursive: true, force: true });
	await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
	try {
		await mapWithConcurrency({
			items: tasks,
			limit: COPY_CONCURRENCY,
			task: async ({ item }) =>
				copyTask({ runtimeRoot: stagingRoot, task: item }),
		});
		await removeVolatileDatabaseFiles({
			directory: path.join(stagingRoot, "Cache", "ressdk_db"),
			root: stagingRoot,
		});
		const relativePaths = await listJianyingFilterPrivateRuntimeFiles({
			runtimeRoot: stagingRoot,
		});
		const files = await inspectJianyingFilterPrivateRuntimeFiles({
			runtimeRoot: stagingRoot,
			relativePaths,
		});
		const createdAt = new Date().toISOString();
		const manifest = parseJianyingFilterPrivateRuntimeManifest({
			value: {
				schemaVersion: 1,
				createdAt,
				localOnly: true,
				cloudUpload: false,
				coreUuid,
				runtimeLibraryCount: countFilesByPrefix({
					files,
					prefix: "Frameworks/",
				}),
				modelCount: countFilesByPrefix({ files, prefix: "Models/" }),
				packageCount: tasks.filter(({ kind }) => kind === "package").length,
				databaseFileCount: countFilesByPrefix({
					files,
					prefix: "Cache/ressdk_db/",
				}),
				totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
				files,
			},
		});
		if (!manifest) throw new Error("无法创建本机滤镜备份清单");
		await writeFile(
			path.join(stagingRoot, JIANYING_FILTER_PRIVATE_RUNTIME_MANIFEST),
			`${JSON.stringify(manifest, null, 2)}\n`,
			{ mode: 0o600 }
		);
		await verifySnapshot({ runtimeRoot: stagingRoot });
		const snapshotName = snapshotIdentity({ coreUuid, files });
		const destinationRoot = path.join(privateRuntimeRoot, snapshotName);
		if (await pathExists({ filePath: destinationRoot })) {
			const existingManifest = await verifySnapshot({
				runtimeRoot: destinationRoot,
			});
			await rm(stagingRoot, { recursive: true, force: true });
			await pointCurrentAt({ privateRuntimeRoot, snapshotName });
			return publicResult({ created: false, manifest: existingManifest });
		}
		await rename(stagingRoot, destinationRoot);
		await pointCurrentAt({ privateRuntimeRoot, snapshotName });
		return publicResult({ created: true, manifest });
	} catch (cause) {
		await rm(stagingRoot, { recursive: true, force: true });
		throw cause;
	}
}

export const jianyingFilterRuntimeBackupTestUtils = {
	filterPackageIdentifiers,
	verifySnapshot,
	parseStoredManifest: async ({ manifestPath }: { manifestPath: string }) =>
		parseJianyingFilterPrivateRuntimeManifest({
			value: JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
		}),
};
