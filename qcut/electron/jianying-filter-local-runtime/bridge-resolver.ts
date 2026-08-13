import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME =
	"jianying-filter-local-bridge";
const SOURCE_RELATIVE_PATH = path.join(
	"docs",
	"task",
	"jianying-filter-runtime-research",
	"probes",
	"effect-cgl-render-probe.cpp"
);

// Keyed by `allowCompile`: a caller that forbids compiling must not share an
// in-flight resolution that is allowed to compile (and vice versa).
const pendingResolutions = new Map<boolean, Promise<string | null>>();

async function isExecutable({ filePath }: { filePath: string }) {
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

function uniquePaths({ paths }: { paths: Array<string | undefined> }) {
	return Array.from(
		new Set(
			paths.filter((candidate): candidate is string => Boolean(candidate))
		)
	);
}

function sourcePath({ projectRoot }: { projectRoot: string }) {
	return path.join(projectRoot, SOURCE_RELATIVE_PATH);
}

function findProjectRoot({
	cwd = process.cwd(),
	moduleDirectory = __dirname,
}: {
	cwd?: string;
	moduleDirectory?: string;
} = {}) {
	const candidates = uniquePaths({
		paths: [
			cwd,
			path.resolve(moduleDirectory, "..", ".."),
			path.resolve(moduleDirectory, "..", "..", ".."),
		],
	});
	return (
		candidates.find((candidate) =>
			existsSync(sourcePath({ projectRoot: candidate }))
		) ?? null
	);
}

export async function compileJianyingFilterLocalBridge({
	projectRoot,
	outputPath,
}: {
	projectRoot: string;
	outputPath: string;
}) {
	const source = sourcePath({ projectRoot });
	if (await isExecutable({ filePath: outputPath })) return outputPath;
	await mkdir(path.dirname(outputPath), { recursive: true });
	await execFileAsync(
		"xcrun",
		[
			"clang++",
			"-std=c++20",
			"-Wall",
			"-Wextra",
			"-Werror",
			"-Wno-deprecated-declarations",
			source,
			"-framework",
			"OpenGL",
			"-o",
			outputPath,
		],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
	if (!(await isExecutable({ filePath: outputPath }))) {
		throw new Error("剪映人像滤镜本机桥构建后不可执行");
	}
	return outputPath;
}

async function compileDevelopmentBridge({
	projectRoot,
}: {
	projectRoot: string;
}) {
	const source = sourcePath({ projectRoot });
	const fingerprint = createHash("sha256")
		.update(await readFile(source))
		.update(process.arch)
		.digest("hex")
		.slice(0, 16);
	return compileJianyingFilterLocalBridge({
		projectRoot,
		outputPath: path.join(
			os.homedir(),
			"Library",
			"Caches",
			"QCut",
			"jianying-filter-local-bridge",
			fingerprint,
			JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME
		),
	});
}

async function resolveBridgeInternal({
	allowCompile,
}: {
	allowCompile: boolean;
}) {
	if (process.platform !== "darwin") return null;
	const projectRoot = findProjectRoot();
	const resourcesPath = processResourcesPath();
	const candidates = uniquePaths({
		paths: [
			process.env.QCUT_JIANYING_FILTER_LOCAL_BRIDGE,
			resourcesPath
				? path.join(
						resourcesPath,
						"bin",
						JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME
					)
				: undefined,
		],
	});
	const checks = await Promise.all(
		candidates.map(async (candidate) => ({
			candidate,
			executable: await isExecutable({ filePath: candidate }),
		}))
	);
	const existing = checks.find(({ executable }) => executable)?.candidate;
	if (existing) return existing;
	if (
		!allowCompile ||
		!projectRoot ||
		!existsSync(sourcePath({ projectRoot }))
	) {
		return null;
	}
	return compileDevelopmentBridge({ projectRoot });
}

export function resolveJianyingFilterLocalBridge({
	allowCompile = true,
}: {
	allowCompile?: boolean;
} = {}) {
	let pending = pendingResolutions.get(allowCompile);
	if (!pending) {
		pending = resolveBridgeInternal({ allowCompile }).finally(() => {
			pendingResolutions.delete(allowCompile);
		});
		pendingResolutions.set(allowCompile, pending);
	}
	return pending;
}
