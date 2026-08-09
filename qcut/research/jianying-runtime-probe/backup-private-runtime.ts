#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
	access,
	copyFile,
	cp,
	lstat,
	mkdir,
	readdir,
	readFile,
	realpath,
	rename,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { JIANYING_TRANSITIONS } from "../../electron/jianying-transition-catalog";
import { resolveJianyingTransitionBridge } from "../../electron/jianying-transition/bridge-resolver";
import { inspectJianyingTransitionRuntime } from "../../electron/jianying-transition/runtime-discovery";

const CORE_FRAMEWORKS = [
	"libAGFX.dylib",
	"libEGL.dylib",
	"libGLESv2.dylib",
	"libLumiGeneRuntime.dylib",
	"libcccreator.dylib",
] as const;

const RUNTIME_RESOURCES = [
	"lumi_js_resources",
	"VEMetalBinary_Mac.bundle",
] as const;

const COPY_CONCURRENCY = 4;
const projectRoot = path.resolve(import.meta.dir, "../..");

interface BackupOptions {
	sourceRuntimeRoot: string;
	appBundlePath: string;
	destinationRoot: string;
}

interface ProcessResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

interface RuntimeFile {
	relativePath: string;
	sourcePath: string;
}

interface ManifestFile {
	path: string;
	bytes: number;
	sha256: string;
}

interface PrivateRuntimeManifest {
	schemaVersion: 1;
	localOnly: true;
	cloudUpload: false;
	coreUuid: string;
	packageCount: number;
	files: ManifestFile[];
}

function privateStorageBase(): string {
	return path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"PrivateRuntimes"
	);
}

function parseOptions(): BackupOptions {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			"runtime-root": { type: "string" },
			"app-bundle": { type: "string" },
			"destination-root": { type: "string" },
		},
		strict: true,
	});
	return {
		sourceRuntimeRoot: path.resolve(
			values["runtime-root"] ??
				path.join(projectRoot, ".local", "jianying-runtime")
		),
		appBundlePath: path.resolve(
			values["app-bundle"] ?? "/Applications/VideoFusion-macOS.app"
		),
		destinationRoot: path.resolve(
			values["destination-root"] ??
				path.join(privateStorageBase(), "JianyingTransition")
		),
	};
}

async function runProcess({
	command,
	args,
	env = process.env,
}: {
	command: string;
	args: string[];
	env?: NodeJS.ProcessEnv;
}): Promise<ProcessResult> {
	const child = Bun.spawn([command, ...args], {
		cwd: projectRoot,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
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

async function requireLocalOnlyDestination({
	destinationRoot,
}: {
	destinationRoot: string;
}) {
	const allowedBase = privateStorageBase();
	await Promise.all([
		mkdir(allowedBase, { recursive: true, mode: 0o700 }),
		mkdir(destinationRoot, { recursive: true, mode: 0o700 }),
	]);
	const [resolvedBase, resolvedDestination] = await Promise.all([
		realpath(allowedBase),
		realpath(destinationRoot),
	]);
	const relative = path.relative(resolvedBase, resolvedDestination);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(
			`Private runtime backup must stay under ${resolvedBase}: ${resolvedDestination}`
		);
	}
	const cloudRoots = [
		path.join(os.homedir(), "Library", "Mobile Documents"),
		path.join(os.homedir(), "Library", "CloudStorage"),
	];
	if (
		cloudRoots.some(
			(cloudRoot) =>
				resolvedDestination === cloudRoot ||
				resolvedDestination.startsWith(`${cloudRoot}${path.sep}`)
		)
	) {
		throw new Error("Private runtime backup cannot use cloud storage.");
	}
}

function requireSuccessfulProcess({
	result,
	label,
}: {
	result: ProcessResult;
	label: string;
}): string {
	if (result.exitCode === 0) return result.stdout;
	throw new Error(`${label}: ${result.stderr || result.stdout}`.trim());
}

async function readArm64Uuid({ binaryPath }: { binaryPath: string }) {
	const result = await runProcess({
		command: "xcrun",
		args: ["dwarfdump", "--uuid", binaryPath],
	});
	const output = requireSuccessfulProcess({
		result,
		label: "dwarfdump failed",
	});
	const match = output.match(/UUID: ([0-9A-F-]+) \(arm64\)/i);
	if (!match?.[1]) throw new Error(`No arm64 UUID found in ${binaryPath}.`);
	return match[1].toUpperCase();
}

async function readDependencies({ binaryPath }: { binaryPath: string }) {
	const result = await runProcess({
		command: "otool",
		args: ["-arch", "arm64", "-L", binaryPath],
	});
	const output = requireSuccessfulProcess({ result, label: "otool failed" });
	return output
		.split("\n")
		.filter((line) => line.startsWith("\t"))
		.map((line) => line.trim().split(" (compatibility")[0])
		.filter((dependency): dependency is string => Boolean(dependency));
}

function dependencyRelativePath({
	dependency,
	ownerRelativePath,
	appFrameworks,
}: {
	dependency: string;
	ownerRelativePath: string;
	appFrameworks: string;
}): string | null {
	if (dependency.startsWith("/System/") || dependency.startsWith("/usr/lib/")) {
		return null;
	}
	if (dependency.startsWith("@rpath/")) {
		return dependency.slice("@rpath/".length);
	}
	if (dependency.startsWith("@loader_path/")) {
		return path.normalize(
			path.join(
				path.dirname(ownerRelativePath),
				dependency.slice("@loader_path/".length)
			)
		);
	}
	const executableFrameworkPrefix = "@executable_path/../Frameworks/";
	if (dependency.startsWith(executableFrameworkPrefix)) {
		return dependency.slice(executableFrameworkPrefix.length);
	}
	const absoluteFrameworkPrefix = `${appFrameworks}${path.sep}`;
	if (dependency.startsWith(absoluteFrameworkPrefix)) {
		return dependency.slice(absoluteFrameworkPrefix.length);
	}
	throw new Error(`Unsupported non-system dependency: ${dependency}`);
}

async function resolveRuntimeFile({
	relativePath,
	sourceRuntimeFrameworks,
	appFrameworks,
}: {
	relativePath: string;
	sourceRuntimeFrameworks: string;
	appFrameworks: string;
}): Promise<RuntimeFile> {
	const localCandidate = path.join(sourceRuntimeFrameworks, relativePath);
	if (await pathExists({ filePath: localCandidate })) {
		return { relativePath, sourcePath: localCandidate };
	}
	const appCandidate = path.join(appFrameworks, relativePath);
	if (await pathExists({ filePath: appCandidate })) {
		return { relativePath, sourcePath: appCandidate };
	}
	throw new Error(`Missing runtime dependency: ${relativePath}`);
}

async function resolveRuntimeClosure({
	queue,
	index,
	resolved,
	sourceRuntimeFrameworks,
	appFrameworks,
}: {
	queue: RuntimeFile[];
	index: number;
	resolved: ReadonlyMap<string, RuntimeFile>;
	sourceRuntimeFrameworks: string;
	appFrameworks: string;
}): Promise<Map<string, RuntimeFile>> {
	const current = queue[index];
	if (!current) return new Map(resolved);
	if (resolved.has(current.relativePath)) {
		return resolveRuntimeClosure({
			queue,
			index: index + 1,
			resolved,
			sourceRuntimeFrameworks,
			appFrameworks,
		});
	}
	const nextResolved = new Map(resolved);
	nextResolved.set(current.relativePath, current);
	const dependencies = await readDependencies({
		binaryPath: current.sourcePath,
	});
	const relativeDependencies = dependencies.flatMap((dependency) => {
		const relativePath = dependencyRelativePath({
			dependency,
			ownerRelativePath: current.relativePath,
			appFrameworks,
		});
		if (!relativePath || relativePath === current.relativePath) return [];
		return [relativePath];
	});
	const additions = await Promise.all(
		relativeDependencies.map((relativePath) =>
			resolveRuntimeFile({
				relativePath,
				sourceRuntimeFrameworks,
				appFrameworks,
			})
		)
	);
	return resolveRuntimeClosure({
		queue: [...queue, ...additions],
		index: index + 1,
		resolved: nextResolved,
		sourceRuntimeFrameworks,
		appFrameworks,
	});
}

async function copyRuntimeFiles({
	files,
	destinationFrameworks,
}: {
	files: RuntimeFile[];
	destinationFrameworks: string;
}) {
	await Promise.all(
		files.map(async ({ relativePath, sourcePath }) => {
			const destinationPath = path.join(destinationFrameworks, relativePath);
			await mkdir(path.dirname(destinationPath), { recursive: true });
			await copyFile(sourcePath, destinationPath);
		})
	);
}

async function copyRuntimeResources({
	sourceRuntimeRoot,
	destinationRuntimeRoot,
}: {
	sourceRuntimeRoot: string;
	destinationRuntimeRoot: string;
}) {
	await Promise.all(
		RUNTIME_RESOURCES.map(async (resource) => {
			const sourcePath = path.join(sourceRuntimeRoot, "Resources", resource);
			if (!(await pathExists({ filePath: sourcePath }))) {
				throw new Error(`Missing runtime resource: ${sourcePath}`);
			}
			await cp(
				sourcePath,
				path.join(destinationRuntimeRoot, "Resources", resource),
				{
					force: true,
					recursive: true,
				}
			);
		})
	);
}

async function copyPackageBatch({
	remaining,
	destinationPackages,
	packagePaths,
}: {
	remaining: typeof JIANYING_TRANSITIONS;
	destinationPackages: string;
	packagePaths: ReadonlyMap<string, string>;
}): Promise<void> {
	if (remaining.length === 0) return;
	const batch = remaining.slice(0, COPY_CONCURRENCY);
	await Promise.all(
		batch.map(async (transition) => {
			const sourcePath = packagePaths.get(transition.id);
			if (!sourcePath) {
				throw new Error(
					`Missing local package for ${transition.localizedName}.`
				);
			}
			const destinationPath = path.join(
				destinationPackages,
				transition.resourceId,
				transition.metadataMd5
			);
			await cp(sourcePath, destinationPath, { force: true, recursive: true });
		})
	);
	return copyPackageBatch({
		remaining: remaining.slice(COPY_CONCURRENCY),
		destinationPackages,
		packagePaths,
	});
}

async function listFiles({
	directory,
	baseDirectory = directory,
}: {
	directory: string;
	baseDirectory?: string;
}): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				return listFiles({ directory: entryPath, baseDirectory });
			}
			if (!entry.isFile()) return [];
			return [path.relative(baseDirectory, entryPath)];
		})
	);
	return nested.flat().sort();
}

function sha256File({ filePath }: { filePath: string }): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}

async function manifestFileBatch({
	remaining,
	runtimeRoot,
	files,
}: {
	remaining: string[];
	runtimeRoot: string;
	files: ManifestFile[];
}): Promise<ManifestFile[]> {
	if (remaining.length === 0) return files;
	const batch = remaining.slice(0, COPY_CONCURRENCY);
	const completed = await Promise.all(
		batch.map(async (relativePath) => {
			const filePath = path.join(runtimeRoot, relativePath);
			const [metadata, sha256] = await Promise.all([
				stat(filePath),
				sha256File({ filePath }),
			]);
			return { path: relativePath, bytes: metadata.size, sha256 };
		})
	);
	return manifestFileBatch({
		remaining: remaining.slice(COPY_CONCURRENCY),
		runtimeRoot,
		files: [...files, ...completed],
	});
}

async function verifyManifestFileBatch({
	remaining,
	runtimeRoot,
}: {
	remaining: ManifestFile[];
	runtimeRoot: string;
}): Promise<void> {
	if (remaining.length === 0) return;
	const batch = remaining.slice(0, COPY_CONCURRENCY);
	await Promise.all(
		batch.map(async (expected) => {
			const filePath = path.join(runtimeRoot, expected.path);
			const [metadata, sha256] = await Promise.all([
				stat(filePath),
				sha256File({ filePath }),
			]);
			if (metadata.size !== expected.bytes || sha256 !== expected.sha256) {
				throw new Error(`Private runtime checksum mismatch: ${expected.path}`);
			}
		})
	);
	return verifyManifestFileBatch({
		remaining: remaining.slice(COPY_CONCURRENCY),
		runtimeRoot,
	});
}

async function probeOfflineRuntime({ runtimeRoot }: { runtimeRoot: string }) {
	const bridgePath = await resolveJianyingTransitionBridge();
	if (!bridgePath)
		throw new Error("QCut Jianying transition bridge is missing.");
	const result = await runProcess({
		command: bridgePath,
		args: [runtimeRoot, "transition"],
		env: {
			HOME: os.homedir(),
			PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
			DYLD_LIBRARY_PATH: path.join(runtimeRoot, "Frameworks"),
		},
	});
	requireSuccessfulProcess({ result, label: "Offline runtime probe failed" });
}

async function pointCurrentAt({
	destinationRoot,
	backupName,
}: {
	destinationRoot: string;
	backupName: string;
}) {
	const temporaryLink = path.join(
		destinationRoot,
		`.current-${process.pid}-${Date.now()}`
	);
	const currentLink = path.join(destinationRoot, "current");
	await symlink(backupName, temporaryLink, "dir");
	try {
		await rename(temporaryLink, currentLink);
	} catch (cause) {
		const currentMetadata = await lstat(currentLink).catch(() => null);
		if (!currentMetadata?.isSymbolicLink()) throw cause;
		await rm(currentLink);
		await rename(temporaryLink, currentLink);
	}
}

async function verifyExistingBackup({
	destinationPath,
	coreUuid,
	packageCount,
}: {
	destinationPath: string;
	coreUuid: string;
	packageCount: number;
}): Promise<boolean> {
	const manifestPath = path.join(destinationPath, "manifest.json");
	if (!(await pathExists({ filePath: manifestPath }))) return false;
	const manifest = JSON.parse(
		await readFile(manifestPath, "utf8")
	) as PrivateRuntimeManifest;
	if (
		manifest.schemaVersion !== 1 ||
		manifest.localOnly !== true ||
		manifest.cloudUpload !== false ||
		manifest.coreUuid !== coreUuid ||
		manifest.packageCount !== packageCount ||
		!Array.isArray(manifest.files)
	) {
		return false;
	}
	const actualPaths = (await listFiles({ directory: destinationPath })).filter(
		(relativePath) => relativePath !== "manifest.json"
	);
	const expectedPaths = manifest.files.map((file) => file.path).sort();
	if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths))
		return false;
	await verifyManifestFileBatch({
		remaining: manifest.files,
		runtimeRoot: destinationPath,
	});
	await probeOfflineRuntime({ runtimeRoot: destinationPath });
	return true;
}

async function run() {
	const options = parseOptions();
	const sourceRuntimeFrameworks = path.join(
		options.sourceRuntimeRoot,
		"Frameworks"
	);
	const appFrameworks = path.join(
		options.appBundlePath,
		"Contents",
		"Frameworks"
	);
	const coreBinaryPath = path.join(
		sourceRuntimeFrameworks,
		"libcccreator.dylib"
	);
	const coreUuid = await readArm64Uuid({ binaryPath: coreBinaryPath });
	const binaryTransitions = JIANYING_TRANSITIONS.filter(
		(transition) => transition.runtimeKind === "transition-segment"
	);
	const backupName = `${coreUuid}-catalog-${binaryTransitions.length}`;
	const destinationPath = path.join(options.destinationRoot, backupName);
	await requireLocalOnlyDestination({
		destinationRoot: options.destinationRoot,
	});

	if (await pathExists({ filePath: destinationPath })) {
		if (
			!(await verifyExistingBackup({
				destinationPath,
				coreUuid,
				packageCount: binaryTransitions.length,
			}))
		) {
			throw new Error(
				`Existing private backup is incomplete: ${destinationPath}`
			);
		}
		await pointCurrentAt({
			destinationRoot: options.destinationRoot,
			backupName,
		});
		console.log(
			JSON.stringify({ reused: true, destinationPath, coreUuid }, null, 2)
		);
		return;
	}

	const inspection = await inspectJianyingTransitionRuntime();
	if (inspection.status.availableCount !== binaryTransitions.length) {
		throw new Error(inspection.status.message);
	}
	const seeds = await Promise.all(
		CORE_FRAMEWORKS.map((relativePath) =>
			resolveRuntimeFile({
				relativePath,
				sourceRuntimeFrameworks,
				appFrameworks,
			})
		)
	);
	const closure = await resolveRuntimeClosure({
		queue: seeds,
		index: 0,
		resolved: new Map(),
		sourceRuntimeFrameworks,
		appFrameworks,
	});
	const stagingPath = path.join(
		options.destinationRoot,
		`.staging-${backupName}-${process.pid}`
	);
	await rm(stagingPath, { recursive: true, force: true });
	await mkdir(path.join(stagingPath, "Frameworks"), {
		recursive: true,
		mode: 0o700,
	});
	console.log(`Copying ${closure.size} runtime libraries...`);
	await Promise.all([
		copyRuntimeFiles({
			files: Array.from(closure.values()),
			destinationFrameworks: path.join(stagingPath, "Frameworks"),
		}),
		copyRuntimeResources({
			sourceRuntimeRoot: options.sourceRuntimeRoot,
			destinationRuntimeRoot: stagingPath,
		}),
	]);
	console.log(`Copying ${binaryTransitions.length} transition packages...`);
	await copyPackageBatch({
		remaining: binaryTransitions,
		destinationPackages: path.join(stagingPath, "Packages"),
		packagePaths: inspection.packagePaths,
	});
	console.log("Probing the runtime without the Jianying app bundle...");
	await probeOfflineRuntime({ runtimeRoot: stagingPath });
	const relativeFiles = await listFiles({ directory: stagingPath });
	console.log(`Checksumming ${relativeFiles.length} private local files...`);
	const files = await manifestFileBatch({
		remaining: relativeFiles,
		runtimeRoot: stagingPath,
		files: [],
	});
	const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
	await writeFile(
		path.join(stagingPath, "manifest.json"),
		`${JSON.stringify(
			{
				schemaVersion: 1,
				createdAt: new Date().toISOString(),
				localOnly: true,
				cloudUpload: false,
				coreUuid,
				runtimeLibraryCount: closure.size,
				packageCount: binaryTransitions.length,
				totalBytes,
				files,
			},
			null,
			2
		)}\n`
	);
	const permissions = await runProcess({
		command: "chmod",
		args: ["-R", "go-rwx", stagingPath],
	});
	requireSuccessfulProcess({ result: permissions, label: "chmod failed" });
	await rename(stagingPath, destinationPath);
	await pointCurrentAt({
		destinationRoot: options.destinationRoot,
		backupName,
	});
	console.log(
		JSON.stringify(
			{
				reused: false,
				destinationPath,
				currentPath: path.join(options.destinationRoot, "current"),
				coreUuid,
				runtimeLibraryCount: closure.size,
				packageCount: binaryTransitions.length,
				totalBytes,
			},
			null,
			2
		)
	);
}

await run();
