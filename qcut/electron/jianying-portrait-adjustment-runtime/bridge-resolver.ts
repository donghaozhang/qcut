import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME =
	"jianying-portrait-adjustment-host";
const SOURCE_RELATIVE_PATHS = [
	"research/jianying-runtime-probe/filter-host-main.mm",
	"research/jianying-runtime-probe/amazer-context-scope.mm",
	"research/jianying-runtime-probe/filter-host-support.mm",
	"research/jianying-runtime-probe/filter-face-inspect.mm",
	"research/jianying-runtime-probe/filter-sequence-io.cpp",
	"research/jianying-runtime-probe/graphics-runtime.mm",
	"research/jianying-runtime-probe/graphics-probe.mm",
	"research/jianying-runtime-probe/filter-probe.mm",
] as const;

const pendingResolutions = new Map<boolean, Promise<string | null>>();

async function isExecutable({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function projectSources({ projectRoot }: { projectRoot: string }) {
	return SOURCE_RELATIVE_PATHS.map((relativePath) =>
		path.join(projectRoot, relativePath)
	);
}

function findProjectRoot() {
	const candidates = [
		process.cwd(),
		path.resolve(__dirname, "..", ".."),
		path.resolve(__dirname, "..", "..", ".."),
	];
	return (
		candidates.find((candidate) =>
			projectSources({ projectRoot: candidate }).every((source) =>
				existsSync(source)
			)
		) ?? null
	);
}

export async function compileJianyingPortraitAdjustmentHost({
	projectRoot,
	outputPath,
}: {
	projectRoot: string;
	outputPath: string;
}) {
	if (await isExecutable({ filePath: outputPath })) return outputPath;
	await mkdir(path.dirname(outputPath), { recursive: true });
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
			...projectSources({ projectRoot }),
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
		],
		{ maxBuffer: 32 * 1024 * 1024 }
	);
	if (!(await isExecutable({ filePath: outputPath }))) {
		throw new Error("剪映美颜美体本机宿主构建后不可执行");
	}
	return outputPath;
}

async function compileDevelopmentHost({
	projectRoot,
}: {
	projectRoot: string;
}) {
	const fingerprint = createHash("sha256");
	for (const source of projectSources({ projectRoot })) {
		fingerprint.update(await readFile(source));
	}
	fingerprint.update(process.arch);
	const version = fingerprint.digest("hex").slice(0, 16);
	return compileJianyingPortraitAdjustmentHost({
		projectRoot,
		outputPath: path.join(
			os.homedir(),
			"Library",
			"Caches",
			"QCut",
			"jianying-portrait-adjustment-host",
			version,
			JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME
		),
	});
}

async function resolveHost({ allowCompile }: { allowCompile: boolean }) {
	if (process.platform !== "darwin") return null;
	const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
		.resourcesPath;
	const candidates = [
		process.env.QCUT_JIANYING_PORTRAIT_ADJUSTMENT_HOST,
		resourcesPath
			? path.join(
					resourcesPath,
					"bin",
					JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME
				)
			: undefined,
	].filter((candidate): candidate is string => Boolean(candidate));
	for (const candidate of candidates) {
		if (await isExecutable({ filePath: candidate })) return candidate;
	}
	const projectRoot = findProjectRoot();
	if (!allowCompile || !projectRoot) return null;
	return compileDevelopmentHost({ projectRoot });
}

export function resolveJianyingPortraitAdjustmentHost({
	allowCompile = true,
}: {
	allowCompile?: boolean;
} = {}) {
	let pending = pendingResolutions.get(allowCompile);
	if (!pending) {
		pending = resolveHost({ allowCompile }).finally(() => {
			pendingResolutions.delete(allowCompile);
		});
		pendingResolutions.set(allowCompile, pending);
	}
	return pending;
}
