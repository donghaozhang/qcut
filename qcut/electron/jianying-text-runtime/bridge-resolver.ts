import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import {
	access,
	chmod,
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rename,
	rm,
	symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { findQCutProjectRoot } from "../jianying-transition/bridge-resolver.js";

const execFileAsync = promisify(execFile);

export const JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME =
	"jianying-text-runtime-bridge";

const JIANYING_TEXT_RUNTIME_BRIDGE_BUILD_VERSION = "text-animation-slots-v2";

export const JIANYING_TEXT_RUNTIME_BRIDGE_SOURCE_FILE_NAMES = [
	"text-runtime-main.mm",
	"amazer-context-scope.mm",
	"amazer-context-scope.h",
	"graphics-runtime.mm",
	"graphics-runtime.h",
	"graphics-probe.mm",
	"graphics-probe.h",
	"probe-utils.h",
	"text-probe.mm",
	"text-probe.h",
	"text-resource-finder.mm",
	"text-resource-finder.h",
] as const;

let pendingResolution: Promise<string | null> | null = null;

async function isExecutable({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function processResourcesPath() {
	return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

function uniquePaths({ paths }: { paths: Array<string | undefined> }) {
	return Array.from(
		new Set(
			paths.filter((candidate): candidate is string => Boolean(candidate))
		)
	);
}

function installedBridgeCandidates() {
	const resourcesPath = processResourcesPath();
	return uniquePaths({
		paths: [
			process.env.QCUT_JIANYING_TEXT_RUNTIME_BRIDGE,
			resourcesPath
				? path.join(
						resourcesPath,
						"bin",
						JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME
					)
				: undefined,
		],
	});
}

function stagedDevelopmentBridge({ projectRoot }: { projectRoot: string }) {
	return path.join(
		projectRoot,
		"electron",
		"resources",
		"bin",
		JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME
	);
}

async function sourceFingerprint({
	sourceDirectory,
}: {
	sourceDirectory: string;
}) {
	const contents = await Promise.all(
		JIANYING_TEXT_RUNTIME_BRIDGE_SOURCE_FILE_NAMES.map((name) =>
			readFile(path.join(sourceDirectory, name))
		)
	);
	const hash = createHash("sha256");
	hash.update(JIANYING_TEXT_RUNTIME_BRIDGE_BUILD_VERSION);
	for (const content of contents) hash.update(content);
	return hash.digest("hex").slice(0, 16);
}

export async function compileJianyingTextRuntimeBridge({
	projectRoot,
	outputPath,
}: {
	projectRoot: string;
	outputPath: string;
}) {
	if (process.platform !== "darwin") {
		throw new Error("The Jianying text runtime bridge requires macOS.");
	}
	if (await isExecutable({ filePath: outputPath })) return outputPath;
	const sourceDirectory = path.join(
		projectRoot,
		"research",
		"jianying-runtime-probe"
	);
	for (const name of JIANYING_TEXT_RUNTIME_BRIDGE_SOURCE_FILE_NAMES) {
		if (!existsSync(path.join(sourceDirectory, name))) {
			throw new Error(`Missing Jianying text bridge source: ${name}`);
		}
	}
	await mkdir(path.dirname(outputPath), { recursive: true });
	const sourcePaths = JIANYING_TEXT_RUNTIME_BRIDGE_SOURCE_FILE_NAMES.filter(
		(name) => name.endsWith(".mm")
	).map((name) => path.join(sourceDirectory, name));
	await execFileAsync(
		"xcrun",
		[
			"clang++",
			"-std=c++20",
			"-fobjc-arc",
			"-Wall",
			"-Wextra",
			"-Werror",
			"-Wno-deprecated-declarations",
			...sourcePaths,
			"-framework",
			"AppKit",
			"-framework",
			"CoreVideo",
			"-framework",
			"IOSurface",
			"-framework",
			"OpenGL",
			"-Wl,-rpath,@executable_path/../Frameworks",
			"-o",
			outputPath,
		],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
	if (!(await isExecutable({ filePath: outputPath }))) {
		throw new Error("The Jianying text runtime bridge is not executable.");
	}
	return outputPath;
}

function isExistingDirectoryError({ cause }: { cause: unknown }) {
	// Windows reports a rename onto an existing directory as EPERM; tolerating
	// it is safe because the caller re-verifies the launch path afterwards.
	return (
		cause instanceof Error &&
		"code" in cause &&
		(cause.code === "EEXIST" ||
			cause.code === "ENOTEMPTY" ||
			cause.code === "EPERM")
	);
}

export async function materializeJianyingTextRuntimeBridge({
	bridgePath,
	runtimeRoot,
	cacheRoot = path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"jianying-text-runtime-launch"
	),
}: {
	bridgePath: string;
	runtimeRoot: string;
	cacheRoot?: string;
}) {
	const [bridgeContents, frameworksPath] = await Promise.all([
		readFile(bridgePath),
		realpath(path.join(runtimeRoot, "Frameworks")),
	]);
	const fingerprint = createHash("sha256")
		.update(bridgeContents)
		.update(frameworksPath)
		.digest("hex")
		.slice(0, 24);
	const launchRoot = path.join(cacheRoot, fingerprint);
	const launchPath = path.join(
		launchRoot,
		"bin",
		JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME
	);
	if (await isExecutable({ filePath: launchPath })) return launchPath;

	await mkdir(cacheRoot, { recursive: true });
	const temporaryRoot = await mkdtemp(
		path.join(cacheRoot, `${fingerprint}.tmp-`)
	);
	try {
		const temporaryBridgePath = path.join(
			temporaryRoot,
			"bin",
			JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME
		);
		await mkdir(path.dirname(temporaryBridgePath), { recursive: true });
		await copyFile(bridgePath, temporaryBridgePath);
		await chmod(temporaryBridgePath, 0o755);
		await symlink(frameworksPath, path.join(temporaryRoot, "Frameworks"));
		try {
			await rename(temporaryRoot, launchRoot);
		} catch (cause) {
			if (!isExistingDirectoryError({ cause })) throw cause;
		}
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}

	if (!(await isExecutable({ filePath: launchPath }))) {
		throw new Error("Failed to prepare the Jianying text runtime bridge.");
	}
	return launchPath;
}

async function compileDevelopmentBridge({
	projectRoot,
}: {
	projectRoot: string;
}) {
	const sourceDirectory = path.join(
		projectRoot,
		"research",
		"jianying-runtime-probe"
	);
	const fingerprint = await sourceFingerprint({ sourceDirectory });
	return compileJianyingTextRuntimeBridge({
		projectRoot,
		outputPath: path.join(
			os.homedir(),
			"Library",
			"Caches",
			"QCut",
			"jianying-text-runtime-bridge",
			fingerprint,
			JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME
		),
	});
}

async function resolveBridge({ allowCompile }: { allowCompile: boolean }) {
	if (process.platform !== "darwin") return null;
	const projectRoot = findQCutProjectRoot();
	const candidates = installedBridgeCandidates();
	const checks = await Promise.all(
		candidates.map(async (candidate) => ({
			candidate,
			executable: await isExecutable({ filePath: candidate }),
		}))
	);
	const existing = checks.find(({ executable }) => executable)?.candidate;
	if (existing) return existing;
	if (allowCompile && projectRoot) {
		return compileDevelopmentBridge({ projectRoot });
	}
	if (!projectRoot) return null;
	const staged = stagedDevelopmentBridge({ projectRoot });
	return (await isExecutable({ filePath: staged })) ? staged : null;
}

export function resolveJianyingTextRuntimeBridge({
	allowCompile = true,
}: {
	allowCompile?: boolean;
} = {}) {
	if (!pendingResolution) {
		pendingResolution = resolveBridge({ allowCompile }).finally(() => {
			pendingResolution = null;
		});
	}
	return pendingResolution;
}
