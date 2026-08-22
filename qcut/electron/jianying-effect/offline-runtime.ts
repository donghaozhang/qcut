import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
	access,
	copyFile,
	lstat,
	mkdir,
	readFile,
	readdir,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";

const execFileAsync = promisify(execFile);
const MANIFEST_FILE_NAME = "qcut-effect-runtime.json";
const COPY_CONCURRENCY = 4;
const SUPPORTED_CORE_UUID = "D6342ECD-5432-33F0-A2AD-0C28F5699994";
const REQUIRED_FRAMEWORKS = [
	"libAGFX.dylib",
	"libEGL.dylib",
	"libGLESv2.dylib",
	"libLumiGeneRuntime.dylib",
	"libcccreator.dylib",
] as const;

interface OfflineRuntimeFile {
	path: string;
	bytes: number;
	sha256: string;
}

interface OfflineRuntimeManifest {
	schemaVersion: 1;
	createdAt: string;
	localOnly: true;
	cloudUpload: false;
	coreUuid: string;
	files: OfflineRuntimeFile[];
}

interface CopyTask {
	sourcePath: string;
	destinationRelativePath: string;
}

interface EnsureOfflineRuntimeOptions {
	appBundlePath?: string;
	userModelDirectory?: string;
	privateRuntimeRoot?: string;
	readDependencies?: (input: { filePath: string }) => Promise<string[]>;
	readCoreUuid?: (input: { binaryPath: string }) => Promise<string>;
}

let pendingRuntime: Promise<string> | null = null;

export function qcutEffectPrivateRuntimeRoot({
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
		"JianyingTransition"
	);
}

export function qcutEffectPrivateRuntimeCurrent({
	privateRuntimeRoot = qcutEffectPrivateRuntimeRoot(),
}: {
	privateRuntimeRoot?: string;
} = {}): string {
	return path.join(privateRuntimeRoot, "current");
}

function isSafeRelativePath({ value }: { value: string }): boolean {
	return (
		value.length > 0 &&
		!path.isAbsolute(value) &&
		!value.split(/[\\/]/).includes("..")
	);
}

function fileErrorCode({ cause }: { cause: unknown }): string | undefined {
	return cause && typeof cause === "object" && "code" in cause
		? String((cause as { code?: unknown }).code)
		: undefined;
}

function parseManifest({
	value,
}: {
	value: unknown;
}): OfflineRuntimeManifest | null {
	if (!value || typeof value !== "object") return null;
	const manifest = value as Partial<OfflineRuntimeManifest>;
	if (
		manifest.schemaVersion !== 1 ||
		manifest.localOnly !== true ||
		manifest.cloudUpload !== false ||
		typeof manifest.createdAt !== "string" ||
		!Number.isFinite(Date.parse(manifest.createdAt)) ||
		typeof manifest.coreUuid !== "string" ||
		!/^[A-F0-9-]{36}$/.test(manifest.coreUuid) ||
		!Array.isArray(manifest.files)
	) {
		return null;
	}
	const validFiles = manifest.files.every((file) => {
		if (!file || typeof file !== "object") return false;
		return (
			isSafeRelativePath({ value: file.path }) &&
			Number.isSafeInteger(file.bytes) &&
			file.bytes >= 0 &&
			/^[a-f0-9]{64}$/.test(file.sha256)
		);
	});
	if (!validFiles) return null;
	const paths = manifest.files.map((file) => file.path);
	return new Set(paths).size === paths.length
		? (manifest as OfflineRuntimeManifest)
		: null;
}

async function readManifest({
	runtimeRoot,
}: {
	runtimeRoot: string;
}): Promise<OfflineRuntimeManifest | null> {
	try {
		return parseManifest({
			value: JSON.parse(
				await readFile(path.join(runtimeRoot, MANIFEST_FILE_NAME), "utf8")
			) as unknown,
		});
	} catch {
		return null;
	}
}

export async function isReadyQCutEffectOfflineRuntime({
	runtimeRoot = qcutEffectPrivateRuntimeCurrent(),
}: {
	runtimeRoot?: string;
} = {}): Promise<boolean> {
	const manifest = await readManifest({ runtimeRoot });
	if (!manifest || manifest.coreUuid !== SUPPORTED_CORE_UUID) return false;
	try {
		await Promise.all([
			...REQUIRED_FRAMEWORKS.map((name) =>
				access(path.join(runtimeRoot, "Frameworks", name), constants.R_OK)
			),
			access(
				path.join(runtimeRoot, "Resources", "lumi_js_resources"),
				constants.R_OK
			),
			access(path.join(runtimeRoot, "Models", "user-cache"), constants.R_OK),
			access(path.join(runtimeRoot, "Models", "app-bundle"), constants.R_OK),
		]);
		return true;
	} catch {
		return false;
	}
}

async function listFiles({
	directory,
	root = directory,
}: {
	directory: string;
	root?: string;
}): Promise<Array<{ absolutePath: string; relativePath: string }>> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const absolutePath = path.join(directory, entry.name);
			const metadata = await lstat(absolutePath);
			if (metadata.isSymbolicLink()) {
				throw new Error("本机算法资源包含不允许的符号链接。");
			}
			if (metadata.isDirectory()) {
				return listFiles({ directory: absolutePath, root });
			}
			if (!metadata.isFile()) {
				throw new Error("本机算法资源包含不支持的文件类型。");
			}
			return [
				{ absolutePath, relativePath: path.relative(root, absolutePath) },
			];
		})
	);
	return nested.flat();
}

async function listOptionalDirectoryFiles({
	directory,
}: {
	directory: string;
}): Promise<Array<{ absolutePath: string; relativePath: string }>> {
	const metadata = await lstat(directory).catch((cause: unknown) => {
		if (fileErrorCode({ cause }) === "ENOENT") return null;
		throw cause;
	});
	if (!metadata) return [];
	if (!metadata.isDirectory()) {
		throw new Error("QCut 现有本机资源包目录无效。");
	}
	return listFiles({ directory });
}

async function packageEntryCount({
	directory,
}: {
	directory: string;
}): Promise<number> {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		return entries.filter((entry) => entry.isDirectory()).length;
	} catch {
		return 0;
	}
}

async function hasRuntimeAssets({
	runtimeRoot,
}: {
	runtimeRoot: string;
}): Promise<boolean> {
	try {
		await Promise.all([
			...REQUIRED_FRAMEWORKS.map((name) =>
				access(path.join(runtimeRoot, "Frameworks", name), constants.R_OK)
			),
			access(
				path.join(runtimeRoot, "Resources", "lumi_js_resources"),
				constants.R_OK
			),
		]);
		return true;
	} catch {
		return false;
	}
}

async function privateRuntimeCandidates({
	privateRuntimeRoot,
}: {
	privateRuntimeRoot: string;
}): Promise<string[]> {
	const entries = await readdir(privateRuntimeRoot, {
		withFileTypes: true,
	}).catch(() => []);
	return [
		...new Set([
			qcutEffectPrivateRuntimeCurrent({ privateRuntimeRoot }),
			...entries
				.filter(
					(entry) => entry.isDirectory() && !entry.name.startsWith(".staging-")
				)
				.map((entry) => path.join(privateRuntimeRoot, entry.name)),
		]),
	];
}

async function findCompatibleRuntimeSource({
	appBundlePath,
	privateRuntimeRoot,
	readCoreUuid: resolveCoreUuid,
}: {
	appBundlePath: string;
	privateRuntimeRoot: string;
	readCoreUuid: (input: { binaryPath: string }) => Promise<string>;
}): Promise<string> {
	const privateCandidates = await privateRuntimeCandidates({
		privateRuntimeRoot,
	});
	const candidates = [
		...privateCandidates,
		path.join(appBundlePath, "Contents"),
	];
	const inspections = await Promise.all(
		candidates.map(async (runtimeRoot) => {
			if (!(await hasRuntimeAssets({ runtimeRoot }))) return null;
			const coreUuid = await resolveCoreUuid({
				binaryPath: path.join(runtimeRoot, "Frameworks", "libcccreator.dylib"),
			}).catch(() => null);
			if (coreUuid !== SUPPORTED_CORE_UUID) return null;
			return {
				runtimeRoot,
				packageCount: await packageEntryCount({
					directory: path.join(runtimeRoot, "Packages"),
				}),
			};
		})
	);
	const compatible = inspections
		.filter(
			(
				inspection
			): inspection is { runtimeRoot: string; packageCount: number } =>
				Boolean(inspection)
		)
		.sort((left, right) => right.packageCount - left.packageCount)[0];
	if (!compatible) {
		throw new Error(
			`未找到与 QCut bridge 兼容的本机特效运行库（需要 ${SUPPORTED_CORE_UUID}）。`
		);
	}
	return compatible.runtimeRoot;
}

async function findPackageSourceDirectory({
	privateRuntimeRoot,
	runtimeSourceRoot,
}: {
	privateRuntimeRoot: string;
	runtimeSourceRoot: string;
}): Promise<string> {
	const candidates = [
		path.join(
			qcutEffectPrivateRuntimeCurrent({ privateRuntimeRoot }),
			"Packages"
		),
		path.join(runtimeSourceRoot, "Packages"),
	];
	const counts = await Promise.all(
		candidates.map(async (directory) => ({
			directory,
			count: await packageEntryCount({ directory }),
		}))
	);
	return (
		counts.sort((left, right) => right.count - left.count)[0]?.directory ?? ""
	);
}

function frameworkDependencyName({ value }: { value: string }): string | null {
	const match = /^@rpath\/(.+\.dylib)$/.exec(
		value.trim().split(/\s+/)[0] ?? ""
	);
	if (!match?.[1] || !isSafeRelativePath({ value: match[1] })) return null;
	return match[1];
}

async function readFrameworkDependencies({
	filePath,
}: {
	filePath: string;
}): Promise<string[]> {
	const { stdout } = await execFileAsync("otool", ["-L", filePath], {
		maxBuffer: 4 * 1024 * 1024,
		timeout: 10_000,
	});
	return stdout.split("\n").flatMap((line) => {
		const name = frameworkDependencyName({ value: line });
		return name ? [name] : [];
	});
}

async function collectFrameworkNames({
	frameworkDirectory,
	pending,
	seen,
	readDependencies,
}: {
	frameworkDirectory: string;
	pending: string[];
	seen: Set<string>;
	readDependencies: (input: { filePath: string }) => Promise<string[]>;
}): Promise<Set<string>> {
	const level = [...new Set(pending)].filter((name) => !seen.has(name));
	if (level.length === 0) return seen;
	for (const name of level) seen.add(name);
	const dependencies = (
		await Promise.all(
			level.map((name) =>
				readDependencies({ filePath: path.join(frameworkDirectory, name) })
			)
		)
	).flat();
	const existingDependencies = (
		await Promise.all(
			dependencies.map(async (name) => {
				try {
					await access(path.join(frameworkDirectory, name), constants.R_OK);
					return name;
				} catch {
					return null;
				}
			})
		)
	).filter((name): name is string => Boolean(name));
	return collectFrameworkNames({
		frameworkDirectory,
		pending: existingDependencies,
		seen,
		readDependencies,
	});
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

async function copyAndInspect({
	task,
	runtimeRoot,
}: {
	task: CopyTask;
	runtimeRoot: string;
}): Promise<OfflineRuntimeFile> {
	const destinationPath = path.join(
		runtimeRoot,
		...task.destinationRelativePath.split("/")
	);
	await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
	await copyFile(task.sourcePath, destinationPath, constants.COPYFILE_FICLONE);
	const metadata = await lstat(destinationPath);
	return {
		path: task.destinationRelativePath,
		bytes: metadata.size,
		sha256: await sha256File({ filePath: destinationPath }),
	};
}

async function readCoreUuid({
	binaryPath,
}: {
	binaryPath: string;
}): Promise<string> {
	const { stdout } = await execFileAsync("dwarfdump", ["--uuid", binaryPath], {
		maxBuffer: 1024 * 1024,
		timeout: 5000,
	});
	const architecture = process.arch === "x64" ? "x86_64" : process.arch;
	const match = stdout
		.split("\n")
		.map((line) => /UUID:\s+([0-9A-F-]+)\s+\(([^)]+)\)/i.exec(line))
		.find((candidate) => candidate?.[2] === architecture);
	if (!match?.[1]) throw new Error("无法读取本机特效运行库版本。");
	return match[1].toUpperCase();
}

function appBundleCandidates(): string[] {
	const override = process.env.QCUT_JIANYING_APP_BUNDLE;
	if (override) return [override];
	return [
		"/Applications/VideoFusion-macOS.app",
		path.join(os.homedir(), "Applications", "VideoFusion-macOS.app"),
	];
}

async function findAppBundle(): Promise<string | null> {
	const checks = await Promise.all(
		appBundleCandidates().map(async (candidate) => {
			try {
				await Promise.all([
					access(
						path.join(
							candidate,
							"Contents",
							"Frameworks",
							"libcccreator.dylib"
						),
						constants.R_OK
					),
					access(
						path.join(candidate, "Contents", "Resources", "lumi_js_resources"),
						constants.R_OK
					),
				]);
				return candidate;
			} catch {
				return null;
			}
		})
	);
	return (
		checks.find((candidate): candidate is string => Boolean(candidate)) ?? null
	);
}

async function buildCopyTasks({
	runtimeSourceRoot,
	appModelDirectory,
	userModelDirectory,
	packageSourceDirectory,
	readDependencies,
}: {
	runtimeSourceRoot: string;
	appModelDirectory: string;
	userModelDirectory: string;
	packageSourceDirectory: string;
	readDependencies: (input: { filePath: string }) => Promise<string[]>;
}): Promise<CopyTask[]> {
	const frameworkDirectory = path.join(runtimeSourceRoot, "Frameworks");
	const frameworkNames = await collectFrameworkNames({
		frameworkDirectory,
		pending: [...REQUIRED_FRAMEWORKS],
		seen: new Set(),
		readDependencies,
	});
	const [lumiFiles, userModels, appModels, existingPackages] =
		await Promise.all([
			listFiles({
				directory: path.join(
					runtimeSourceRoot,
					"Resources",
					"lumi_js_resources"
				),
			}),
			listFiles({ directory: userModelDirectory }),
			listFiles({ directory: appModelDirectory }),
			listOptionalDirectoryFiles({
				directory: packageSourceDirectory,
			}),
		]);
	return [
		...[...frameworkNames].sort().map((name) => ({
			sourcePath: path.join(frameworkDirectory, name),
			destinationRelativePath: `Frameworks/${name}`,
		})),
		...lumiFiles.map((file) => ({
			sourcePath: file.absolutePath,
			destinationRelativePath: `Resources/lumi_js_resources/${file.relativePath}`,
		})),
		...userModels.map((file) => ({
			sourcePath: file.absolutePath,
			destinationRelativePath: `Models/user-cache/${file.relativePath}`,
		})),
		...appModels.map((file) => ({
			sourcePath: file.absolutePath,
			destinationRelativePath: `Models/app-bundle/${file.relativePath}`,
		})),
		...existingPackages.map((file) => ({
			sourcePath: file.absolutePath,
			destinationRelativePath: `Packages/${file.relativePath}`,
		})),
	];
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
		`.current-${process.pid}-${randomUUID()}`
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

async function createOfflineRuntime({
	appBundlePath,
	userModelDirectory,
	privateRuntimeRoot,
	readDependencies,
	readCoreUuid: resolveCoreUuid,
}: Required<EnsureOfflineRuntimeOptions>): Promise<string> {
	const current = qcutEffectPrivateRuntimeCurrent({ privateRuntimeRoot });
	if (await isReadyQCutEffectOfflineRuntime({ runtimeRoot: current })) {
		return current;
	}
	const runtimeSourceRoot = await findCompatibleRuntimeSource({
		appBundlePath,
		privateRuntimeRoot,
		readCoreUuid: resolveCoreUuid,
	});
	const packageSourceDirectory = await findPackageSourceDirectory({
		privateRuntimeRoot,
		runtimeSourceRoot,
	});
	const frameworkDirectory = path.join(runtimeSourceRoot, "Frameworks");
	const coreUuid = await resolveCoreUuid({
		binaryPath: path.join(frameworkDirectory, "libcccreator.dylib"),
	});
	const tasks = await buildCopyTasks({
		runtimeSourceRoot,
		appModelDirectory: path.join(
			appBundlePath,
			"Contents",
			"Resources",
			"models"
		),
		userModelDirectory,
		packageSourceDirectory,
		readDependencies,
	});
	const stagingRoot = path.join(
		privateRuntimeRoot,
		`.staging-${process.pid}-${randomUUID()}`
	);
	await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
	try {
		const files = (
			await mapWithConcurrency({
				items: tasks,
				limit: COPY_CONCURRENCY,
				task: async ({ item }) =>
					copyAndInspect({ task: item, runtimeRoot: stagingRoot }),
			})
		).sort((left, right) => left.path.localeCompare(right.path));
		const manifest: OfflineRuntimeManifest = {
			schemaVersion: 1,
			createdAt: new Date().toISOString(),
			localOnly: true,
			cloudUpload: false,
			coreUuid,
			files,
		};
		await writeFile(
			path.join(stagingRoot, MANIFEST_FILE_NAME),
			`${JSON.stringify(manifest, null, 2)}\n`,
			{ mode: 0o600 }
		);
		if (
			!(await isReadyQCutEffectOfflineRuntime({ runtimeRoot: stagingRoot }))
		) {
			throw new Error("QCut 本机特效运行环境备份不完整。");
		}
		const digest = createHash("sha256")
			.update(coreUuid)
			.update(JSON.stringify(files))
			.digest("hex")
			.slice(0, 16);
		const snapshotName = `${coreUuid}-${digest}`;
		const destinationRoot = path.join(privateRuntimeRoot, snapshotName);
		const destinationExists = await access(destinationRoot)
			.then(() => true)
			.catch(() => false);
		if (
			destinationExists &&
			(await isReadyQCutEffectOfflineRuntime({ runtimeRoot: destinationRoot }))
		) {
			await rm(stagingRoot, { recursive: true, force: true });
		} else {
			await rm(destinationRoot, { recursive: true, force: true });
			await rename(stagingRoot, destinationRoot);
		}
		await pointCurrentAt({ privateRuntimeRoot, snapshotName });
		return qcutEffectPrivateRuntimeCurrent({ privateRuntimeRoot });
	} catch (cause) {
		await rm(stagingRoot, { recursive: true, force: true });
		throw cause;
	}
}

export async function ensureQCutEffectOfflineRuntime({
	appBundlePath,
	userModelDirectory = path.join(
		os.homedir(),
		"Movies",
		"JianyingPro",
		"User Data",
		"Cache",
		"effect",
		"model"
	),
	privateRuntimeRoot = qcutEffectPrivateRuntimeRoot(),
	readDependencies = readFrameworkDependencies,
	readCoreUuid: resolveCoreUuid = readCoreUuid,
}: EnsureOfflineRuntimeOptions = {}): Promise<string> {
	if (process.platform !== "darwin") {
		throw new Error("本机剪映特效离线运行仅支持 macOS。");
	}
	const current = qcutEffectPrivateRuntimeCurrent({ privateRuntimeRoot });
	if (await isReadyQCutEffectOfflineRuntime({ runtimeRoot: current })) {
		return current;
	}
	if (pendingRuntime) return pendingRuntime;
	const resolvedAppBundle = appBundlePath ?? (await findAppBundle());
	if (!resolvedAppBundle) throw new Error("未找到可备份的本机剪映运行环境。");
	const task = createOfflineRuntime({
		appBundlePath: resolvedAppBundle,
		userModelDirectory,
		privateRuntimeRoot,
		readDependencies,
		readCoreUuid: resolveCoreUuid,
	}).finally(() => {
		pendingRuntime = null;
	});
	pendingRuntime = task;
	return task;
}

export const qcutEffectOfflineRuntimeTestUtils = {
	frameworkDependencyName,
	parseManifest,
};
