import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME =
	"jianying-person-cutout-bridge";
const SOURCE_RELATIVE_PATHS = [
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"alpha-resize.cpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"alpha-mask-fusion.cpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"alpha-refinement.cpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"alpha-temporal-stabilizer.cpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"matting-gru-bridge.cpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"metal-matting-blend.cpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"vision-person-segmentation.mm"
	),
] as const;
const FINGERPRINT_RELATIVE_PATHS = [
	...SOURCE_RELATIVE_PATHS,
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"alpha-resize.hpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"alpha-mask-fusion.hpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"alpha-refinement.hpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"alpha-temporal-stabilizer.hpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"metal-matting-blend.hpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"vision-person-segmentation.hpp"
	),
] as const;

async function isExecutable({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function findProjectRoot() {
	const candidates = [
		process.cwd(),
		path.resolve(__dirname, "..", ".."),
		path.resolve(__dirname, "..", "..", ".."),
	];
	return (
		candidates.find((candidate) =>
			FINGERPRINT_RELATIVE_PATHS.every((relativePath) =>
				existsSync(path.join(candidate, relativePath))
			)
		) ?? null
	);
}

function packagedBridgePath() {
	const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
		.resourcesPath;
	return resourcesPath
		? path.join(resourcesPath, "bin", JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME)
		: null;
}

export async function resolveJianyingPersonCutoutBridge() {
	if (process.platform !== "darwin") return null;
	const configured = process.env.QCUT_JIANYING_PERSON_CUTOUT_BRIDGE;
	const packaged = packagedBridgePath();
	for (const candidate of [configured, packaged]) {
		if (candidate && (await isExecutable({ filePath: candidate }))) {
			return candidate;
		}
	}
	const projectRoot = findProjectRoot();
	if (!projectRoot) return null;
	const sourcePaths = FINGERPRINT_RELATIVE_PATHS.map((relativePath) =>
		path.join(projectRoot, relativePath)
	);
	const sourceContents = await Promise.all(
		sourcePaths.map((sourcePath) => readFile(sourcePath))
	);
	const sourceHash = createHash("sha256");
	for (const contents of sourceContents) sourceHash.update(contents);
	const fingerprint = sourceHash
		.update(process.arch)
		.digest("hex")
		.slice(0, 16);
	const outputPath = path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"jianying-person-cutout-bridge",
		fingerprint,
		JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME
	);
	if (await isExecutable({ filePath: outputPath })) return outputPath;
	return compileJianyingPersonCutoutBridge({ projectRoot, outputPath });
}

export async function compileJianyingPersonCutoutBridge({
	projectRoot,
	outputPath,
}: {
	projectRoot: string;
	outputPath: string;
}) {
	const sourcePaths = SOURCE_RELATIVE_PATHS.map((relativePath) =>
		path.join(projectRoot, relativePath)
	);
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
			...sourcePaths,
			"-framework",
			"OpenGL",
			"-framework",
			"Vision",
			"-framework",
			"CoreVideo",
			"-framework",
			"Foundation",
			"-framework",
			"ImageIO",
			"-ldl",
			"-o",
			outputPath,
		],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
	if (!(await isExecutable({ filePath: outputPath }))) {
		throw new Error("精细抠像本机桥构建后不可执行");
	}
	return outputPath;
}
