#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
	access,
	copyFile,
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
import { mapWithConcurrency } from "../../electron/lib/map-with-concurrency";
import {
	runBoundedProcess,
	type BoundedProcessResult,
} from "../jianying-runtime-probe/bounded-process";

const EXPECTED_BUNDLE_ID = "com.lemon.lvpro";
const CORE_LIBRARY = "libcccreator.dylib";
const COPY_CONCURRENCY = 4;
const MODEL_PATHS = [
	"models/object_tracking/bingo_objectTracking_v1.0.dat",
	"models/single_object_tracking_v1.0.model",
] as const;
const projectRoot = path.resolve(import.meta.dir, "../..");

interface Options {
	appBundlePath: string;
	destinationRoot: string;
	verifyOnly: boolean;
}

interface RuntimeSource {
	relativePath: string;
	sourcePath: string;
}

interface ManifestFile {
	bytes: number;
	path: string;
	sha256: string;
}

interface TrackingRuntimeManifest {
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
	files: ManifestFile[];
	localOnly: true;
	modelPaths: string[];
	purpose: "jianying-motion-tracking-research-oracle";
	runtimeLibraryCount: number;
	schemaVersion: 1;
	totalBytes: number;
}

function privateRuntimeBase() {
	return path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"PrivateRuntimes"
	);
}

function parseOptions(): Options {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			"app-bundle": { type: "string" },
			"destination-root": { type: "string" },
			"verify-only": { type: "boolean" },
		},
		strict: true,
	});
	return {
		appBundlePath: path.resolve(
			values["app-bundle"] ?? "/Applications/VideoFusion-macOS.app"
		),
		destinationRoot: path.resolve(
			values["destination-root"] ??
				path.join(privateRuntimeBase(), "JianyingTracking")
		),
		verifyOnly: values["verify-only"] ?? false,
	};
}

async function pathExists({ filePath }: { filePath: string }) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

function requireSuccessfulProcess({
	label,
	result,
}: {
	label: string;
	result: BoundedProcessResult;
}) {
	if (result.exitCode === 0) return result.stdout.trim();
	throw new Error(`${label}: ${result.stderr || result.stdout}`.trim());
}

async function readPlistValue({
	appBundlePath,
	key,
}: {
	appBundlePath: string;
	key: string;
}) {
	const result = await runBoundedProcess({
		command: "plutil",
		args: [
			"-extract",
			key,
			"raw",
			path.join(appBundlePath, "Contents", "Info.plist"),
		],
		cwd: projectRoot,
	});
	return requireSuccessfulProcess({ label: `Cannot read ${key}`, result });
}

async function readArm64Uuid({ binaryPath }: { binaryPath: string }) {
	const result = await runBoundedProcess({
		command: "xcrun",
		args: ["dwarfdump", "--uuid", binaryPath],
		cwd: projectRoot,
	});
	const output = requireSuccessfulProcess({
		label: "Cannot inspect runtime UUID",
		result,
	});
	const match = output.match(/UUID: ([0-9A-F-]+) \(arm64\)/i);
	if (!match?.[1]) throw new Error(`No arm64 UUID found in ${binaryPath}`);
	return match[1].toUpperCase();
}

async function readDependencies({ binaryPath }: { binaryPath: string }) {
	const result = await runBoundedProcess({
		command: "otool",
		args: ["-arch", "arm64", "-L", binaryPath],
		cwd: projectRoot,
	});
	const output = requireSuccessfulProcess({
		label: "Cannot inspect runtime dependencies",
		result,
	});
	return output
		.split("\n")
		.filter((line) => line.startsWith("\t"))
		.map((line) => line.trim().split(" (compatibility")[0])
		.filter((dependency): dependency is string => Boolean(dependency));
}

function dependencyRelativePath({
	appFrameworks,
	dependency,
	ownerRelativePath,
}: {
	appFrameworks: string;
	dependency: string;
	ownerRelativePath: string;
}) {
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

async function resolveRuntimeClosure({
	appFrameworks,
}: {
	appFrameworks: string;
}) {
	const queue: RuntimeSource[] = [
		{
			relativePath: CORE_LIBRARY,
			sourcePath: path.join(appFrameworks, CORE_LIBRARY),
		},
	];
	const knownPaths = new Set([CORE_LIBRARY]);
	const resolved: RuntimeSource[] = [];
	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index];
		resolved.push(current);
		const dependencies = await readDependencies({
			binaryPath: current.sourcePath,
		});
		for (const dependency of dependencies) {
			const relativePath = dependencyRelativePath({
				appFrameworks,
				dependency,
				ownerRelativePath: current.relativePath,
			});
			if (!relativePath || knownPaths.has(relativePath)) continue;
			const sourcePath = path.join(appFrameworks, relativePath);
			if (!(await pathExists({ filePath: sourcePath }))) {
				throw new Error(`Missing runtime dependency: ${relativePath}`);
			}
			knownPaths.add(relativePath);
			queue.push({ relativePath, sourcePath });
		}
	}
	return resolved.sort((left, right) =>
		left.relativePath.localeCompare(right.relativePath)
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

async function inspectFiles({
	relativePaths,
	runtimeRoot,
}: {
	relativePaths: string[];
	runtimeRoot: string;
}) {
	return mapWithConcurrency({
		items: relativePaths,
		limit: COPY_CONCURRENCY,
		task: async ({ item: relativePath }) => {
			const filePath = path.join(runtimeRoot, relativePath);
			const [metadata, sha256] = await Promise.all([
				stat(filePath),
				sha256File({ filePath }),
			]);
			return { bytes: metadata.size, path: relativePath, sha256 };
		},
	});
}

async function requirePrivateDestination({
	destinationRoot,
}: {
	destinationRoot: string;
}) {
	const base = privateRuntimeBase();
	await Promise.all([
		mkdir(base, { mode: 0o700, recursive: true }),
		mkdir(destinationRoot, { mode: 0o700, recursive: true }),
	]);
	const [resolvedBase, resolvedDestination] = await Promise.all([
		realpath(base),
		realpath(destinationRoot),
	]);
	const relative = path.relative(resolvedBase, resolvedDestination);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`Private runtime must stay below ${resolvedBase}`);
	}
	const cloudRoots = [
		path.join(os.homedir(), "Library", "CloudStorage"),
		path.join(os.homedir(), "Library", "Mobile Documents"),
	];
	if (
		cloudRoots.some(
			(root) =>
				resolvedDestination === root ||
				resolvedDestination.startsWith(`${root}${path.sep}`)
		)
	) {
		throw new Error("Private runtime cannot be stored in a cloud directory");
	}
}

function isManifest(value: unknown): value is TrackingRuntimeManifest {
	if (!value || typeof value !== "object") return false;
	const manifest = value as Partial<TrackingRuntimeManifest>;
	return (
		manifest.schemaVersion === 1 &&
		manifest.localOnly === true &&
		manifest.cloudUpload === false &&
		manifest.architecture === "arm64" &&
		manifest.purpose === "jianying-motion-tracking-research-oracle" &&
		manifest.app?.bundleId === EXPECTED_BUNDLE_ID &&
		Array.isArray(manifest.files)
	);
}

export async function verifyTrackingRuntimeSnapshot({
	snapshotPath,
}: {
	snapshotPath: string;
}) {
	const manifest = JSON.parse(
		await readFile(path.join(snapshotPath, "manifest.json"), "utf8")
	) as unknown;
	if (!isManifest(manifest)) {
		throw new Error(`Invalid tracking runtime manifest: ${snapshotPath}`);
	}
	const actualPaths = (await listFiles({ baseDirectory: snapshotPath })).filter(
		(relativePath) => relativePath !== "manifest.json"
	);
	const expectedPaths = manifest.files.map((file) => file.path).sort();
	if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
		throw new Error(
			"Private tracking runtime file list does not match manifest"
		);
	}
	const inspected = await inspectFiles({
		relativePaths: expectedPaths,
		runtimeRoot: snapshotPath,
	});
	for (const actual of inspected) {
		const expected = manifest.files.find((file) => file.path === actual.path);
		if (
			!expected ||
			expected.bytes !== actual.bytes ||
			expected.sha256 !== actual.sha256
		) {
			throw new Error(`Private runtime checksum mismatch: ${actual.path}`);
		}
	}
	return manifest;
}

async function pointCurrentAt({
	backupName,
	destinationRoot,
}: {
	backupName: string;
	destinationRoot: string;
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

async function copySnapshotFiles({
	appBundlePath,
	runtimeFiles,
	stagingPath,
}: {
	appBundlePath: string;
	runtimeFiles: RuntimeSource[];
	stagingPath: string;
}) {
	await mapWithConcurrency({
		items: runtimeFiles,
		limit: COPY_CONCURRENCY,
		task: async ({ item }) => {
			const destinationPath = path.join(
				stagingPath,
				"Frameworks",
				item.relativePath
			);
			await mkdir(path.dirname(destinationPath), {
				mode: 0o700,
				recursive: true,
			});
			await copyFile(item.sourcePath, destinationPath);
		},
	});
	await mapWithConcurrency({
		items: [...MODEL_PATHS],
		limit: COPY_CONCURRENCY,
		task: async ({ item: modelPath }) => {
			const sourcePath = path.join(
				appBundlePath,
				"Contents",
				"Resources",
				modelPath
			);
			const destinationPath = path.join(stagingPath, "Resources", modelPath);
			await mkdir(path.dirname(destinationPath), {
				mode: 0o700,
				recursive: true,
			});
			await copyFile(sourcePath, destinationPath);
		},
	});
}

async function run() {
	const options = parseOptions();
	await requirePrivateDestination({
		destinationRoot: options.destinationRoot,
	});
	if (options.verifyOnly) {
		const currentPath = path.join(options.destinationRoot, "current");
		const manifest = await verifyTrackingRuntimeSnapshot({
			snapshotPath: currentPath,
		});
		console.log(
			JSON.stringify({ currentPath, manifest, verified: true }, null, 2)
		);
		return;
	}

	const [bundleId, version] = await Promise.all([
		readPlistValue({
			appBundlePath: options.appBundlePath,
			key: "CFBundleIdentifier",
		}),
		readPlistValue({
			appBundlePath: options.appBundlePath,
			key: "CFBundleShortVersionString",
		}),
	]);
	if (bundleId !== EXPECTED_BUNDLE_ID) {
		throw new Error(
			`Expected domestic Jianying ${EXPECTED_BUNDLE_ID}, received ${bundleId}`
		);
	}
	const appFrameworks = path.join(
		options.appBundlePath,
		"Contents",
		"Frameworks"
	);
	const coreSourcePath = path.join(appFrameworks, CORE_LIBRARY);
	const [coreUuid, coreSha256, runtimeFiles] = await Promise.all([
		readArm64Uuid({ binaryPath: coreSourcePath }),
		sha256File({ filePath: coreSourcePath }),
		resolveRuntimeClosure({ appFrameworks }),
	]);
	const backupName = `${version}-${coreUuid}-${coreSha256.slice(0, 12)}`;
	const destinationPath = path.join(options.destinationRoot, backupName);
	if (await pathExists({ filePath: destinationPath })) {
		const manifest = await verifyTrackingRuntimeSnapshot({
			snapshotPath: destinationPath,
		});
		await pointCurrentAt({
			backupName,
			destinationRoot: options.destinationRoot,
		});
		console.log(
			JSON.stringify(
				{ destinationPath, manifest, reused: true, verified: true },
				null,
				2
			)
		);
		return;
	}

	const stagingPath = path.join(
		options.destinationRoot,
		`.staging-${backupName}-${process.pid}`
	);
	await rm(stagingPath, { force: true, recursive: true });
	await mkdir(stagingPath, { mode: 0o700, recursive: true });
	await copySnapshotFiles({
		appBundlePath: options.appBundlePath,
		runtimeFiles,
		stagingPath,
	});
	const relativePaths = await listFiles({ baseDirectory: stagingPath });
	const files = await inspectFiles({
		relativePaths,
		runtimeRoot: stagingPath,
	});
	const coreRelativePath = path.join("Frameworks", CORE_LIBRARY);
	const coreFile = files.find((file) => file.path === coreRelativePath);
	if (!coreFile || coreFile.sha256 !== coreSha256) {
		throw new Error("Copied libcccreator does not match its source hash");
	}
	const manifest: TrackingRuntimeManifest = {
		app: { bundleId, version },
		architecture: "arm64",
		cloudUpload: false,
		core: {
			path: coreRelativePath,
			sha256: coreSha256,
			uuid: coreUuid,
		},
		createdAt: new Date().toISOString(),
		files,
		localOnly: true,
		modelPaths: MODEL_PATHS.map((modelPath) =>
			path.join("Resources", modelPath)
		),
		purpose: "jianying-motion-tracking-research-oracle",
		runtimeLibraryCount: runtimeFiles.length,
		schemaVersion: 1,
		totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
	};
	await writeFile(
		path.join(stagingPath, "manifest.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
		{ mode: 0o600 }
	);
	const permissions = await runBoundedProcess({
		command: "chmod",
		args: ["-R", "go-rwx", stagingPath],
		cwd: projectRoot,
		timeoutMs: 5 * 60_000,
	});
	requireSuccessfulProcess({
		label: "Cannot protect private runtime",
		result: permissions,
	});
	await rename(stagingPath, destinationPath);
	await verifyTrackingRuntimeSnapshot({ snapshotPath: destinationPath });
	await pointCurrentAt({
		backupName,
		destinationRoot: options.destinationRoot,
	});
	console.log(
		JSON.stringify(
			{
				coreSha256,
				coreUuid,
				currentPath: path.join(options.destinationRoot, "current"),
				destinationPath,
				runtimeLibraryCount: runtimeFiles.length,
				totalBytes: manifest.totalBytes,
				verified: true,
			},
			null,
			2
		)
	);
}

if (import.meta.main) await run();
