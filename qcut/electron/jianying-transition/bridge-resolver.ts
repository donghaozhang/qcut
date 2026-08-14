import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const JIANYING_TRANSITION_BRIDGE_FILE_NAME =
	"jianying-transition-bridge";
export const JIANYING_TRANSITION_BRIDGE_SOURCE_FILE_NAMES = [
	"probe.mm",
	"amazer-context-scope.mm",
	"amazer-context-scope.h",
	"filter-host-support.mm",
	"filter-host-support.h",
	"filter-sequence-io.cpp",
	"filter-sequence-io.h",
	"graphics-runtime.mm",
	"graphics-runtime.h",
	"graphics-probe.mm",
	"graphics-probe.h",
	"filter-probe.mm",
	"filter-probe.h",
	"transition-probe.mm",
	"transition-probe.h",
	"text-probe.mm",
	"text-probe.h",
	"text-resource-finder.mm",
	"text-resource-finder.h",
	"video-transition-probe.mm",
	"video-transition-probe.h",
	"probe-utils.h",
] as const;

let pendingBridgeResolution: Promise<string | null> | null = null;

async function isExecutable({
	filePath,
}: {
	filePath: string;
}): Promise<boolean> {
	try {
		await access(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function processResourcesPath(): string | undefined {
	return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

function uniquePaths({
	paths,
}: {
	paths: Array<string | undefined>;
}): string[] {
	return Array.from(
		new Set(paths.filter((value): value is string => Boolean(value)))
	);
}

export function findQCutProjectRoot({
	cwd = process.cwd(),
	moduleDirectory = __dirname,
}: {
	cwd?: string;
	moduleDirectory?: string;
} = {}): string | null {
	const candidates = uniquePaths({
		paths: [
			cwd,
			path.resolve(moduleDirectory, "..", ".."),
			path.resolve(moduleDirectory, "..", "..", ".."),
		],
	});
	for (const candidate of candidates) {
		const sourceDirectory = path.join(
			candidate,
			"research",
			"jianying-runtime-probe"
		);
		if (
			JIANYING_TRANSITION_BRIDGE_SOURCE_FILE_NAMES.every((name) =>
				existsSync(path.join(sourceDirectory, name))
			)
		) {
			return candidate;
		}
	}
	return null;
}

function bridgeCandidates({
	projectRoot,
}: {
	projectRoot: string | null;
}): string[] {
	const resourcesPath = processResourcesPath();
	return uniquePaths({
		paths: [
			process.env.QCUT_JIANYING_TRANSITION_BRIDGE,
			resourcesPath
				? path.join(resourcesPath, "bin", JIANYING_TRANSITION_BRIDGE_FILE_NAME)
				: undefined,
			projectRoot
				? path.join(
						projectRoot,
						"electron",
						"resources",
						"bin",
						JIANYING_TRANSITION_BRIDGE_FILE_NAME
					)
				: undefined,
			projectRoot
				? path.join(
						projectRoot,
						"research",
						"jianying-runtime-probe",
						"build",
						"jianying-runtime-probe"
					)
				: undefined,
		],
	});
}

async function sourceFingerprint({
	sourceDirectory,
}: {
	sourceDirectory: string;
}) {
	const contents = await Promise.all(
		JIANYING_TRANSITION_BRIDGE_SOURCE_FILE_NAMES.map((name) =>
			readFile(path.join(sourceDirectory, name))
		)
	);
	const hash = createHash("sha256");
	for (const content of contents) hash.update(content);
	return hash.digest("hex").slice(0, 16);
}

export function jianyingTransitionBridgeCompilerArguments({
	sourceDirectory,
	outputPath,
}: {
	sourceDirectory: string;
	outputPath: string;
}): string[] {
	const sourcePaths = JIANYING_TRANSITION_BRIDGE_SOURCE_FILE_NAMES.filter(
		(name) => name.endsWith(".mm") || name.endsWith(".cpp")
	).map((name) => path.join(sourceDirectory, name));
	return [
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
		"-o",
		outputPath,
	];
}

export async function compileJianyingTransitionBridge({
	projectRoot,
	outputPath,
}: {
	projectRoot: string;
	outputPath: string;
}): Promise<string> {
	if (process.platform !== "darwin") {
		throw new Error(
			"The Jianying transition bridge can only be built on macOS."
		);
	}
	const sourceDirectory = path.join(
		projectRoot,
		"research",
		"jianying-runtime-probe"
	);
	if (await isExecutable({ filePath: outputPath })) return outputPath;

	await mkdir(path.dirname(outputPath), { recursive: true });
	await execFileAsync(
		"xcrun",
		jianyingTransitionBridgeCompilerArguments({
			sourceDirectory,
			outputPath,
		}),
		{ maxBuffer: 16 * 1024 * 1024 }
	);
	if (!(await isExecutable({ filePath: outputPath }))) {
		throw new Error(
			"The Jianying transition bridge was not executable after build."
		);
	}
	return outputPath;
}

async function compileDevelopmentBridge({
	projectRoot,
}: {
	projectRoot: string;
}): Promise<string> {
	const sourceDirectory = path.join(
		projectRoot,
		"research",
		"jianying-runtime-probe"
	);
	const fingerprint = await sourceFingerprint({ sourceDirectory });
	return compileJianyingTransitionBridge({
		projectRoot,
		outputPath: path.join(
			os.homedir(),
			"Library",
			"Caches",
			"QCut",
			"jianying-transition-bridge",
			fingerprint,
			JIANYING_TRANSITION_BRIDGE_FILE_NAME
		),
	});
}

async function resolveBridgeInternal({
	allowCompile,
}: {
	allowCompile: boolean;
}): Promise<string | null> {
	if (process.platform !== "darwin") return null;
	const projectRoot = findQCutProjectRoot();
	const candidates = bridgeCandidates({ projectRoot });
	const checks = await Promise.all(
		candidates.map(async (candidate) => ({
			candidate,
			executable: await isExecutable({ filePath: candidate }),
		}))
	);
	const existing = checks.find((check) => check.executable)?.candidate;
	if (existing) return existing;
	if (!allowCompile || !projectRoot) return null;
	return compileDevelopmentBridge({ projectRoot });
}

export function resolveJianyingTransitionBridge({
	allowCompile = true,
}: {
	allowCompile?: boolean;
} = {}): Promise<string | null> {
	if (!pendingBridgeResolution) {
		pendingBridgeResolution = resolveBridgeInternal({ allowCompile }).finally(
			() => {
				pendingBridgeResolution = null;
			}
		);
	}
	return pendingBridgeResolution;
}
