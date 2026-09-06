import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const INDEPENDENT_FILTER_HOST = "qcut-independent-filter-host";
const SOURCE = "electron/qcut-independent-filter";
let pending: Promise<string> | undefined;

export async function compileIndependentFilterHost({
	projectRoot,
	outputPath,
}: {
	projectRoot: string;
	outputPath: string;
}) {
	const source = join(projectRoot, SOURCE);
	await mkdir(dirname(outputPath), { recursive: true });
	const temporary = await mkdtemp(
		join(dirname(outputPath), ".qcut-metal-build-")
	);
	try {
		const shader = (
			await Promise.all(
				["fog.metal", "graph.metal", "dual.metal"].map((name) =>
					readFile(join(source, name), "utf8")
				)
			)
		).join("\n");
		await writeFile(
			join(temporary, "fog-shader-source.h"),
			`static const char* kFogShaderSource = ${JSON.stringify(shader)};\n`
		);
		const binary = join(temporary, INDEPENDENT_FILTER_HOST);
		await execFileAsync(
			"xcrun",
			[
				"clang++",
				"-std=c++20",
				"-fobjc-arc",
				"-O2",
				"-Wall",
				"-Wextra",
				"-Werror",
				"-Wno-deprecated-declarations",
				"-I",
				temporary,
				join(source, "host.mm"),
				"-framework",
				"Foundation",
				"-framework",
				"Metal",
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
		throw new Error("QCut Metal filters require macOS.");
	const resources = (process as NodeJS.Process & { resourcesPath?: string })
		.resourcesPath;
	if (resources) {
		const bundled = join(resources, "bin", INDEPENDENT_FILTER_HOST);
		if (await executable({ filePath: bundled })) return bundled;
	}
	const root = [
		process.cwd(),
		resolve(__dirname, "../.."),
		resolve(__dirname, "../../.."),
	].find((directory) => existsSync(join(directory, SOURCE, "host.mm")));
	if (!root)
		throw new Error(
			"QCut Metal filter host is not installed. Rebuild QCut with its independent filter host."
		);
	const sources = await Promise.all(
		["host.mm", "fog.metal", "graph.metal", "graph-plan.h", "dual.metal"].map(
			(name) => readFile(join(root, SOURCE, name))
		)
	);
	const fingerprint = createHash("sha256")
		.update(process.arch)
		.update(sources[0])
		.update(sources[1])
		.update(sources[2])
		.update(sources[3])
		.update(sources[4])
		.digest("hex");
	const outputPath = join(
		homedir(),
		"Library/Caches/QCut/independent-filter",
		fingerprint,
		INDEPENDENT_FILTER_HOST
	);
	if (await executable({ filePath: outputPath })) return outputPath;
	return compileIndependentFilterHost({ projectRoot: root, outputPath });
}

export function resolveIndependentFilterHost() {
	pending ??= resolveHost().catch((error) => {
		pending = undefined;
		throw error;
	});
	return pending;
}
