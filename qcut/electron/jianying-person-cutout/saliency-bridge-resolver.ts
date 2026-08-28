import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const JIANYING_SALIENCY_BRIDGE_FILE_NAME =
	"jianying-saliency-script-bridge";
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
		"alpha-refinement.cpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"effect-input-probe.cpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"effect-texture-context.cpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"video-object-alpha-quality.cpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"saliency-script-bridge.cpp"
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
		"effect-input-probe.hpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"effect-texture-context.hpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"video-object-alpha-quality.hpp"
	),
	path.join(
		"electron",
		"jianying-person-cutout",
		"native",
		"alpha-refinement.hpp"
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
		? path.join(resourcesPath, "bin", JIANYING_SALIENCY_BRIDGE_FILE_NAME)
		: null;
}

export async function resolveJianyingSaliencyBridge() {
	if (process.platform !== "darwin") return null;
	const configured = process.env.QCUT_JIANYING_SALIENCY_BRIDGE;
	const packaged = packagedBridgePath();
	for (const candidate of [configured, packaged]) {
		if (candidate && (await isExecutable({ filePath: candidate }))) {
			return candidate;
		}
	}
	const projectRoot = findProjectRoot();
	if (!projectRoot) return null;
	const sourceContents = await Promise.all(
		FINGERPRINT_RELATIVE_PATHS.map((relativePath) =>
			readFile(path.join(projectRoot, relativePath))
		)
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
		"jianying-saliency-script-bridge",
		fingerprint,
		JIANYING_SALIENCY_BRIDGE_FILE_NAME
	);
	if (await isExecutable({ filePath: outputPath })) return outputPath;
	return compileJianyingSaliencyBridge({ projectRoot, outputPath });
}

export async function compileJianyingSaliencyBridge({
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
			"-DGL_SILENCE_DEPRECATION",
			"-std=c++20",
			"-Wall",
			"-Wextra",
			"-Werror",
			...SOURCE_RELATIVE_PATHS.map((relativePath) =>
				path.join(projectRoot, relativePath)
			),
			"-framework",
			"OpenGL",
			"-ldl",
			"-o",
			outputPath,
		],
		{ maxBuffer: 16 * 1024 * 1024 }
	);
	if (!(await isExecutable({ filePath: outputPath }))) {
		throw new Error("剪映显著性抠像本机桥构建后不可执行");
	}
	return outputPath;
}
