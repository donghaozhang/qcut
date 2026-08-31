import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import {
	access,
	chmod,
	copyFile,
	mkdir,
	readFile,
	realpath,
	rename,
	rm,
	symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { withAtomicPublishLock } from "../jianying-person-cutout/atomic-publish-lock.js";
import { JIANYING_PRIVATE_DEFLICKER_ROUTE } from "../jianying-basic-video-contract.js";

const execFileAsync = promisify(execFile);
const MINIMUM_HOST_BYTES = 4096;
const NATIVE_SOURCE_RELATIVE_PATH = path.join(
	"research",
	"jianying-basic-video-probe",
	"native",
	"deflicker-stream-host.mm"
);
export const JIANYING_DEFLICKER_HOST_FILE_NAME = "qcut-jianying-deflicker-host";
const MACH_O_MAGICS = [
	Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
	Buffer.from([0xfe, 0xed, 0xfa, 0xcf]),
	Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
	Buffer.from([0xca, 0xfe, 0xba, 0xbf]),
] as const;
export const JIANYING_DEFLICKER_HOST_REQUIRED_MARKERS = [
	JIANYING_PRIVATE_DEFLICKER_ROUTE,
	"VideoDeflickerGpuBackend13ExecuteStream",
] as const;

function processResourcesPath() {
	return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

function findProjectRoot() {
	const candidates = [
		process.cwd(),
		path.resolve(__dirname, "..", ".."),
		path.resolve(__dirname, "..", "..", ".."),
	];
	return (
		candidates.find((candidate) =>
			existsSync(path.join(candidate, NATIVE_SOURCE_RELATIVE_PATH))
		) ?? null
	);
}

async function isExecutable({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export async function isValidJianyingDeflickerHost({
	filePath,
}: {
	filePath: string;
}) {
	if (!(await isExecutable({ filePath }))) return false;
	try {
		const image = await readFile(filePath);
		return (
			image.length >= MINIMUM_HOST_BYTES &&
			MACH_O_MAGICS.some((magic) =>
				image.subarray(0, magic.length).equals(magic)
			) &&
			JIANYING_DEFLICKER_HOST_REQUIRED_MARKERS.every((marker) =>
				image.includes(marker)
			)
		);
	} catch {
		return false;
	}
}

async function hostFingerprint({
	frameworkDirectory,
	templatePath,
	runtimeIdentity,
}: {
	frameworkDirectory: string;
	templatePath: string;
	runtimeIdentity: string;
}) {
	const source = await readFile(templatePath);
	return createHash("sha256")
		.update(source)
		.update(process.arch)
		.update(frameworkDirectory)
		.update(runtimeIdentity)
		.digest("hex")
		.slice(0, 20);
}

async function ensureFrameworkLink({
	frameworkDirectory,
	hostPath,
}: {
	frameworkDirectory: string;
	hostPath: string;
}) {
	const linkPath = path.join(path.dirname(hostPath), "Frameworks");
	try {
		if ((await realpath(linkPath)) === (await realpath(frameworkDirectory))) {
			return;
		}
	} catch {
		// Recreate missing or stale cache links below.
	}
	await rm(linkPath, { force: true, recursive: true });
	await symlink(frameworkDirectory, linkPath, "dir");
}

async function publishTemplateHost({
	outputPath,
	templatePath,
}: {
	outputPath: string;
	templatePath: string;
}) {
	await mkdir(path.dirname(outputPath), { mode: 0o700, recursive: true });
	const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await copyFile(templatePath, temporaryPath);
		await chmod(temporaryPath, 0o700);
		if (!(await isValidJianyingDeflickerHost({ filePath: temporaryPath }))) {
			throw new Error("随包防闪烁桥无效");
		}
		return await withAtomicPublishLock({
			lockPath: `${outputPath}.publish-lock`,
			action: async () => {
				if (await isValidJianyingDeflickerHost({ filePath: outputPath })) {
					return outputPath;
				}
				await rm(outputPath, { force: true });
				await rename(temporaryPath, outputPath);
				return outputPath;
			},
		});
	} finally {
		await rm(temporaryPath, { force: true });
	}
}

export async function resolveJianyingDeflickerHost({
	frameworkDirectory,
	runtimeIdentity,
}: {
	frameworkDirectory: string;
	runtimeIdentity: string;
}) {
	if (process.platform !== "darwin" || process.arch !== "arm64") return null;
	const configuredHost = process.env.QCUT_JIANYING_DEFLICKER_HOST;
	const resourcesPath = processResourcesPath();
	const packagedHost = resourcesPath
		? path.join(resourcesPath, "bin", JIANYING_DEFLICKER_HOST_FILE_NAME)
		: undefined;
	const prebuiltCandidates = [configuredHost, packagedHost].filter(
		(candidate): candidate is string => Boolean(candidate)
	);
	const prebuiltChecks = await Promise.all(
		prebuiltCandidates.map(async (candidate) => ({
			candidate,
			valid: await isValidJianyingDeflickerHost({ filePath: candidate }),
		}))
	);
	const prebuiltTemplate = prebuiltChecks.find(({ valid }) => valid)?.candidate;
	const projectRoot = findProjectRoot();
	const sourcePath = projectRoot
		? path.join(projectRoot, NATIVE_SOURCE_RELATIVE_PATH)
		: null;
	const templatePath = prebuiltTemplate ?? sourcePath;
	if (!templatePath) return null;
	const fingerprint = await hostFingerprint({
		frameworkDirectory,
		templatePath,
		runtimeIdentity,
	});
	const outputPath = path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"JianyingBasicVideoBridge",
		fingerprint,
		JIANYING_DEFLICKER_HOST_FILE_NAME
	);
	if (await isValidJianyingDeflickerHost({ filePath: outputPath })) {
		await ensureFrameworkLink({ frameworkDirectory, hostPath: outputPath });
		return outputPath;
	}
	const resolvedHost = prebuiltTemplate
		? await publishTemplateHost({ outputPath, templatePath: prebuiltTemplate })
		: projectRoot
			? await compileJianyingDeflickerHost({ outputPath, projectRoot })
			: null;
	if (!resolvedHost) return null;
	await ensureFrameworkLink({ frameworkDirectory, hostPath: resolvedHost });
	return resolvedHost;
}

export async function compileJianyingDeflickerHost({
	outputPath,
	projectRoot,
}: {
	outputPath: string;
	projectRoot: string;
}) {
	if (await isValidJianyingDeflickerHost({ filePath: outputPath })) {
		return outputPath;
	}
	await mkdir(path.dirname(outputPath), { mode: 0o700, recursive: true });
	const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await execFileAsync(
			"xcrun",
			[
				"clang++",
				"-std=c++20",
				"-fobjc-arc",
				"-Wall",
				"-Wextra",
				"-Werror",
				path.join(projectRoot, NATIVE_SOURCE_RELATIVE_PATH),
				"-framework",
				"Foundation",
				"-framework",
				"Metal",
				"-framework",
				"CoreVideo",
				"-o",
				temporaryPath,
			],
			{
				killSignal: "SIGKILL",
				maxBuffer: 16 * 1024 * 1024,
				timeout: 120_000,
			}
		);
		if (!(await isValidJianyingDeflickerHost({ filePath: temporaryPath }))) {
			throw new Error("本机防闪烁桥构建产物无效");
		}
		return await withAtomicPublishLock({
			lockPath: `${outputPath}.publish-lock`,
			action: async () => {
				if (await isValidJianyingDeflickerHost({ filePath: outputPath })) {
					return outputPath;
				}
				await rm(outputPath, { force: true });
				await rename(temporaryPath, outputPath);
				if (!(await isValidJianyingDeflickerHost({ filePath: outputPath }))) {
					await rm(outputPath, { force: true });
					throw new Error("本机防闪烁桥发布校验失败");
				}
				return outputPath;
			},
		});
	} finally {
		await rm(temporaryPath, { force: true });
	}
}
