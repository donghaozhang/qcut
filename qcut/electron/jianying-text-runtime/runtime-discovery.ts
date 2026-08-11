import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JianyingTextRuntimeStatus } from "../jianying-text-runtime-contract.js";
import {
	materializeJianyingTextRuntimeBridge,
	resolveJianyingTextRuntimeBridge,
} from "./bridge-resolver.js";

const REQUIRED_RUNTIME_PATHS = [
	"Frameworks/libAGFX.dylib",
	"Frameworks/libEGL.dylib",
	"Frameworks/libGLESv2.dylib",
	"Frameworks/libcccreator.dylib",
	"Resources/lumi_js_resources",
] as const;

export interface JianyingTextRuntimeInspection {
	status: JianyingTextRuntimeStatus;
	bridgePath: string | null;
	runtimeRoot: string | null;
	runtimeFingerprint: string | null;
}

let pendingInspection: Promise<JianyingTextRuntimeInspection> | null = null;

function uniquePaths({ paths }: { paths: Array<string | undefined> }) {
	return Array.from(
		new Set(
			paths.filter((candidate): candidate is string => Boolean(candidate))
		)
	);
}

function runtimeCandidates() {
	const overrides = uniquePaths({
		paths: [
			process.env.QCUT_JIANYING_TEXT_RUNTIME_ROOT,
			process.env.QCUT_JIANYING_RUNTIME_ROOT,
			process.env.JY_RUNTIME_ROOT,
		],
	});
	if (overrides.length > 0) return overrides;
	return [
		path.join(
			os.homedir(),
			"Library",
			"Application Support",
			"QCut",
			"PrivateRuntimes",
			"JianyingTransition",
			"current"
		),
		"/Applications/VideoFusion-macOS.app/Contents",
		path.join(
			os.homedir(),
			"Applications",
			"VideoFusion-macOS.app",
			"Contents"
		),
	];
}

async function pathExists({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

async function isUsableRuntime({ runtimeRoot }: { runtimeRoot: string }) {
	const checks = await Promise.all(
		REQUIRED_RUNTIME_PATHS.map((relativePath) =>
			pathExists({ filePath: path.join(runtimeRoot, relativePath) })
		)
	);
	return checks.every(Boolean);
}

async function runtimeFingerprint({
	runtimeRoot,
	bridgePath,
}: {
	runtimeRoot: string;
	bridgePath: string;
}) {
	const files = [
		path.join(runtimeRoot, "Frameworks", "libcccreator.dylib"),
		path.join(runtimeRoot, "Frameworks", "libAGFX.dylib"),
		bridgePath,
	];
	const stats = await Promise.all(files.map((filePath) => stat(filePath)));
	const hash = createHash("sha256");
	for (let index = 0; index < files.length; index += 1) {
		hash.update(files[index]);
		hash.update(String(stats[index].size));
		hash.update(String(stats[index].mtimeMs));
	}
	return hash.digest("hex").slice(0, 24);
}

function status({
	state,
	message,
	bridgeReady,
	runtimeReady,
}: Pick<
	JianyingTextRuntimeStatus,
	"state" | "message" | "bridgeReady" | "runtimeReady"
>): JianyingTextRuntimeStatus {
	return {
		state,
		message,
		platform: process.platform,
		bridgeReady,
		runtimeReady,
		packageReady: false,
	};
}

async function inspectRuntime(): Promise<JianyingTextRuntimeInspection> {
	if (process.platform !== "darwin") {
		return {
			status: status({
				state: "unsupported-platform",
				message: "剪映原版动态花字本机适配器目前只支持 macOS。",
				bridgeReady: false,
				runtimeReady: false,
			}),
			bridgePath: null,
			runtimeRoot: null,
			runtimeFingerprint: null,
		};
	}
	const resolvedBridgePath = await resolveJianyingTextRuntimeBridge().catch(
		() => null
	);
	if (!resolvedBridgePath) {
		return {
			status: status({
				state: "bridge-missing",
				message: "QCut 剪映花字渲染桥未安装或构建失败。",
				bridgeReady: false,
				runtimeReady: false,
			}),
			bridgePath: null,
			runtimeRoot: null,
			runtimeFingerprint: null,
		};
	}
	const candidates = runtimeCandidates();
	const checks = await Promise.all(
		candidates.map(async (runtimeRoot) => ({
			runtimeRoot,
			usable: await isUsableRuntime({ runtimeRoot }),
		}))
	);
	const runtimeRoot = checks.find(({ usable }) => usable)?.runtimeRoot ?? null;
	if (!runtimeRoot) {
		return {
			status: status({
				state: "runtime-missing",
				message: "未找到兼容的本机剪映渲染运行时。",
				bridgeReady: true,
				runtimeReady: false,
			}),
			bridgePath: resolvedBridgePath,
			runtimeRoot: null,
			runtimeFingerprint: null,
		};
	}
	const bridgePath = await materializeJianyingTextRuntimeBridge({
		bridgePath: resolvedBridgePath,
		runtimeRoot,
	});
	return {
		status: status({
			state: "ready",
			message: "剪映原版动态花字本机渲染已就绪。",
			bridgeReady: true,
			runtimeReady: true,
		}),
		bridgePath,
		runtimeRoot,
		runtimeFingerprint: await runtimeFingerprint({ runtimeRoot, bridgePath }),
	};
}

export function inspectJianyingTextRuntime({
	refresh = false,
}: {
	refresh?: boolean;
} = {}) {
	if (refresh) pendingInspection = null;
	if (!pendingInspection) {
		pendingInspection = inspectRuntime().catch((cause) => ({
			status: status({
				state: "error",
				message: cause instanceof Error ? cause.message : String(cause),
				bridgeReady: false,
				runtimeReady: false,
			}),
			bridgePath: null,
			runtimeRoot: null,
			runtimeFingerprint: null,
		}));
	}
	return pendingInspection;
}
