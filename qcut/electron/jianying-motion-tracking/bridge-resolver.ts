import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { withAtomicPublishLock } from "../jianying-person-cutout/atomic-publish-lock.js";
import {
	EXPECTED_BINGO_MODEL_SHA256,
	EXPECTED_TRACKING_CORE_SHA256,
	EXPECTED_TRACKING_CORE_UUID,
	JIANYING_MOTION_TRACKING_ROUTE,
} from "./runtime-assets.js";

const execFileAsync = promisify(execFile);
const MINIMUM_BRIDGE_BYTES = 4096;
const NATIVE_SOURCE_RELATIVE_PATH = path.join(
	"research",
	"jianying-tracking-probe",
	"bingo-tracking-bridge.cpp"
);
const MACH_O_MAGICS = [
	Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
	Buffer.from([0xfe, 0xed, 0xfa, 0xcf]),
	Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
	Buffer.from([0xca, 0xfe, 0xba, 0xbf]),
] as const;
const REQUIRED_MARKERS = [
	JIANYING_MOTION_TRACKING_ROUTE,
	EXPECTED_TRACKING_CORE_SHA256,
	EXPECTED_TRACKING_CORE_UUID,
	EXPECTED_BINGO_MODEL_SHA256,
	"Bingo_ObjectTracking_trackFrame",
] as const;

export const JIANYING_MOTION_TRACKING_BRIDGE_FILE_NAME =
	"qcut-jianying-motion-tracking-bridge";

async function isExecutable({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export async function isValidJianyingMotionTrackingBridge({
	filePath,
}: {
	filePath: string;
}) {
	if (!(await isExecutable({ filePath }))) return false;
	try {
		const image = await readFile(filePath);
		return (
			image.length >= MINIMUM_BRIDGE_BYTES &&
			MACH_O_MAGICS.some((magic) =>
				image.subarray(0, magic.length).equals(magic)
			) &&
			REQUIRED_MARKERS.every((marker) => image.includes(marker))
		);
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
			existsSync(path.join(candidate, NATIVE_SOURCE_RELATIVE_PATH))
		) ?? null
	);
}

async function bridgeFingerprint({
	projectRoot,
	runtimeRoot,
	runtimeSha256,
}: {
	projectRoot: string;
	runtimeRoot: string;
	runtimeSha256: string;
}) {
	const source = await readFile(
		path.join(projectRoot, NATIVE_SOURCE_RELATIVE_PATH)
	);
	return createHash("sha256")
		.update(source)
		.update(process.arch)
		.update(runtimeRoot)
		.update(runtimeSha256)
		.digest("hex")
		.slice(0, 20);
}

export async function resolveJianyingMotionTrackingBridge({
	runtimeRoot,
	runtimeSha256,
}: {
	runtimeRoot: string;
	runtimeSha256: string;
}) {
	if (process.platform !== "darwin" || process.arch !== "arm64") return null;
	const configuredBridge = process.env.QCUT_JIANYING_MOTION_TRACKING_BRIDGE;
	if (
		configuredBridge &&
		(await isValidJianyingMotionTrackingBridge({
			filePath: configuredBridge,
		}))
	) {
		return configuredBridge;
	}
	const projectRoot = findProjectRoot();
	if (!projectRoot) return null;
	const fingerprint = await bridgeFingerprint({
		projectRoot,
		runtimeRoot,
		runtimeSha256,
	});
	const outputPath = path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"JianyingMotionTrackingBridge",
		fingerprint,
		JIANYING_MOTION_TRACKING_BRIDGE_FILE_NAME
	);
	if (await isValidJianyingMotionTrackingBridge({ filePath: outputPath })) {
		return outputPath;
	}
	return compileJianyingMotionTrackingBridge({
		outputPath,
		projectRoot,
		runtimeRoot,
	});
}

export async function compileJianyingMotionTrackingBridge({
	outputPath,
	projectRoot,
	runtimeRoot,
}: {
	outputPath: string;
	projectRoot: string;
	runtimeRoot: string;
}) {
	if (await isValidJianyingMotionTrackingBridge({ filePath: outputPath })) {
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
				"-Wall",
				"-Wextra",
				"-Werror",
				"-Wno-deprecated-declarations",
				`-Wl,-rpath,${path.join(runtimeRoot, "Frameworks")}`,
				path.join(projectRoot, NATIVE_SOURCE_RELATIVE_PATH),
				"-o",
				temporaryPath,
			],
			{
				killSignal: "SIGKILL",
				maxBuffer: 16 * 1024 * 1024,
				timeout: 120_000,
			}
		);
		if (
			!(await isValidJianyingMotionTrackingBridge({ filePath: temporaryPath }))
		) {
			throw new Error("本机运动跟踪桥构建产物无效");
		}
		return await withAtomicPublishLock({
			lockPath: `${outputPath}.publish-lock`,
			action: async () => {
				if (
					await isValidJianyingMotionTrackingBridge({ filePath: outputPath })
				) {
					return outputPath;
				}
				await rm(outputPath, { force: true });
				await rename(temporaryPath, outputPath);
				if (
					!(await isValidJianyingMotionTrackingBridge({ filePath: outputPath }))
				) {
					await rm(outputPath, { force: true });
					throw new Error("本机运动跟踪桥发布校验失败");
				}
				return outputPath;
			},
		});
	} finally {
		await rm(temporaryPath, { force: true });
	}
}
