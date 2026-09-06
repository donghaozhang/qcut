import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const SOFT_GLOW_HOST = "qcut-independent-soft-glow-host";
const SOURCE = "research/independent-soft-glow";
const UNITS = [
	"image",
	"gaussian",
	"glow",
	"layer",
	"lut",
	"pipeline",
	"image_io",
	"stream_io",
	"stream_main",
];
let pending: Promise<string> | undefined;

export async function compileSoftGlowHost({
	projectRoot,
	outputPath,
}: {
	projectRoot: string;
	outputPath: string;
}) {
	await mkdir(dirname(outputPath), { recursive: true });
	const temporary = await mkdtemp(
		join(dirname(outputPath), ".soft-glow-build-")
	);
	try {
		const binary = join(temporary, SOFT_GLOW_HOST);
		await execFileAsync(
			"xcrun",
			[
				"clang++",
				"-std=c++20",
				"-O2",
				"-Wall",
				"-Wextra",
				"-Wpedantic",
				"-Werror",
				"-ffp-contract=off",
				...UNITS.map((name) => join(projectRoot, SOURCE, `${name}.cpp`)),
				"-o",
				binary,
			],
			{ timeout: 120_000, maxBuffer: 1024 * 1024 }
		);
		await rename(binary, outputPath);
		return outputPath;
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

async function executable({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function resolveHost() {
	if (process.platform !== "darwin")
		throw new Error(
			"Independent cinematic soft glow is currently available in QCut for macOS."
		);
	const resources = (process as NodeJS.Process & { resourcesPath?: string })
		.resourcesPath;
	if (resources) {
		const bundled = join(resources, "bin", SOFT_GLOW_HOST);
		if (await executable({ filePath: bundled })) return bundled;
	}
	const root = [
		process.cwd(),
		resolve(__dirname, "../.."),
		resolve(__dirname, "../../.."),
	].find((directory) => existsSync(join(directory, SOURCE, "stream_main.cpp")));
	if (!root)
		throw new Error(
			"Independent cinematic soft glow host is not installed. Rebuild QCut with its staged CPU helper."
		);
	const names = [
		...UNITS.map((name) => `${name}.cpp`),
		...UNITS.filter((name) => name !== "stream_main").map(
			(name) => `${name}.hpp`
		),
	];
	const sources = await Promise.all(
		names.map((name) => readFile(join(root, SOURCE, name)))
	);
	const hash = createHash("sha256")
		.update(process.arch)
		.update("ui-snapshot-protocol-v1-c++20-O2-ffp-contract-off");
	for (const source of sources) hash.update(source);
	const outputPath = join(
		homedir(),
		"Library/Caches/QCut/independent-soft-glow",
		hash.digest("hex"),
		SOFT_GLOW_HOST
	);
	if (await executable({ filePath: outputPath })) return outputPath;
	return compileSoftGlowHost({ projectRoot: root, outputPath });
}

export function resolveSoftGlowHost() {
	pending ??= resolveHost().catch((error) => {
		pending = undefined;
		throw error;
	});
	return pending;
}
