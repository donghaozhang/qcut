import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { JianyingTextRuntimeStatus } from "../jianying-text-runtime-contract.js";
import {
	materializeJianyingTextRuntimeBridge,
	resolveJianyingTextRuntimeBridge,
} from "./bridge-resolver.js";

const execFileAsync = promisify(execFile);
const RUNTIME_PROBE_TIMEOUT_MS = 15_000;
const RUNTIME_PROBE_OUTPUT_PATTERN =
	/^\[text-runtime\] abi-profile=([a-z0-9._-]+) core-uuid=([0-9a-f-]+)$/im;

const REQUIRED_RUNTIME_PATHS = [
	"Frameworks/libAGFX.dylib",
	"Frameworks/libEGL.dylib",
	"Frameworks/libGLESv2.dylib",
	"Frameworks/libcccreator.dylib",
	"Resources/lumi_js_resources",
] as const;

interface JianyingTextRuntimeCompatibility {
	abiProfile: string;
	coreUuid: string;
}

interface JianyingTextRuntimeProbeResult {
	runtimeRoot: string;
	bridgePath: string;
	compatibility: JianyingTextRuntimeCompatibility | null;
	error?: string;
}

export type JianyingTextRuntimeProbeExecutor = ({
	command,
	args,
	environment,
	timeoutMs,
}: {
	command: string;
	args: string[];
	environment: NodeJS.ProcessEnv;
	timeoutMs: number;
}) => Promise<{ stdout: string }>;

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

function runtimeCandidates({
	environment = process.env,
	homeDirectory = os.homedir(),
}: {
	environment?: NodeJS.ProcessEnv;
	homeDirectory?: string;
} = {}) {
	const overrides = uniquePaths({
		paths: [
			environment.QCUT_JIANYING_TEXT_RUNTIME_ROOT,
			environment.QCUT_JIANYING_RUNTIME_ROOT,
			environment.JY_RUNTIME_ROOT,
		],
	});
	if (overrides.length > 0) return overrides;
	return [
		"/Applications/VideoFusion-macOS.app/Contents",
		path.posix.join(
			homeDirectory,
			"Applications",
			"VideoFusion-macOS.app",
			"Contents"
		),
		path.posix.join(
			homeDirectory,
			"Library",
			"Application Support",
			"QCut",
			"PrivateRuntimes",
			"JianyingTransition",
			"current"
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
	compatibility,
}: {
	runtimeRoot: string;
	bridgePath: string;
	compatibility: JianyingTextRuntimeCompatibility;
}) {
	const files = [
		path.join(runtimeRoot, "Frameworks", "libcccreator.dylib"),
		path.join(runtimeRoot, "Frameworks", "libAGFX.dylib"),
		bridgePath,
	];
	const stats = await Promise.all(files.map((filePath) => stat(filePath)));
	const hash = createHash("sha256");
	hash.update(compatibility.abiProfile);
	hash.update(compatibility.coreUuid);
	for (let index = 0; index < files.length; index += 1) {
		hash.update(files[index]);
		hash.update(String(stats[index].size));
		hash.update(String(stats[index].mtimeMs));
	}
	return hash.digest("hex").slice(0, 24);
}

function parseRuntimeProbeOutput({
	stdout,
}: {
	stdout: string;
}): JianyingTextRuntimeCompatibility | null {
	const match = RUNTIME_PROBE_OUTPUT_PATTERN.exec(stdout);
	if (!match?.[1] || !match[2]) return null;
	return {
		abiProfile: match[1],
		coreUuid: match[2].toUpperCase(),
	};
}

function boundedProbeMessage({ message }: { message: string }) {
	const normalized = message.replace(/\s+/g, " ").trim();
	return normalized.length > 600
		? `${normalized.slice(0, 597)}...`
		: normalized;
}

function runtimeProbeError({ cause }: { cause: unknown }): string {
	if (!(cause instanceof Error)) {
		return boundedProbeMessage({ message: String(cause) });
	}
	const processError = cause as Error & {
		stderr?: string | Buffer;
		stdout?: string | Buffer;
		killed?: boolean;
	};
	if (processError.killed) return "剪映文字运行时 ABI 自检超时。";
	const output = [processError.stderr, processError.stdout]
		.flatMap((value) => {
			if (typeof value === "string") return [value];
			return value ? [value.toString("utf8")] : [];
		})
		.join("\n");
	const bridgeError = output
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.startsWith("[error]"));
	return boundedProbeMessage({
		message: bridgeError?.slice("[error]".length).trim() || cause.message,
	});
}

const executeRuntimeProbe: JianyingTextRuntimeProbeExecutor = async ({
	command,
	args,
	environment,
	timeoutMs,
}) => {
	const { stdout } = await execFileAsync(command, args, {
		encoding: "utf8",
		env: environment,
		maxBuffer: 16 * 1024 * 1024,
		timeout: timeoutMs,
	});
	return { stdout };
};

async function probeRuntimeRoot({
	runtimeRoot,
	bridgePath,
	execute = executeRuntimeProbe,
}: {
	runtimeRoot: string;
	bridgePath: string;
	execute?: JianyingTextRuntimeProbeExecutor;
}): Promise<JianyingTextRuntimeProbeResult> {
	try {
		const { DYLD_LIBRARY_PATH: _ignored, ...environment } = process.env;
		const { stdout } = await execute({
			command: bridgePath,
			args: [runtimeRoot, "inspect"],
			environment,
			timeoutMs: RUNTIME_PROBE_TIMEOUT_MS,
		});
		const compatibility = parseRuntimeProbeOutput({ stdout });
		if (!compatibility) {
			throw new Error("剪映文字运行时自检未返回可识别的 ABI 身份。");
		}
		return { runtimeRoot, bridgePath, compatibility };
	} catch (cause) {
		return {
			runtimeRoot,
			bridgePath,
			compatibility: null,
			error: runtimeProbeError({ cause }),
		};
	}
}

async function inspectRuntimeCandidate({
	runtimeRoot,
	resolvedBridgePath,
}: {
	runtimeRoot: string;
	resolvedBridgePath: string;
}): Promise<JianyingTextRuntimeProbeResult> {
	try {
		const bridgePath = await materializeJianyingTextRuntimeBridge({
			bridgePath: resolvedBridgePath,
			runtimeRoot,
		});
		return probeRuntimeRoot({ runtimeRoot, bridgePath });
	} catch (cause) {
		return {
			runtimeRoot,
			bridgePath: resolvedBridgePath,
			compatibility: null,
			error: runtimeProbeError({ cause }),
		};
	}
}

function status({
	state,
	message,
	bridgeReady,
	runtimeReady,
	compatibility,
}: Pick<
	JianyingTextRuntimeStatus,
	"state" | "message" | "bridgeReady" | "runtimeReady"
> & {
	compatibility?: JianyingTextRuntimeCompatibility;
}): JianyingTextRuntimeStatus {
	return {
		state,
		message,
		platform: process.platform,
		bridgeReady,
		runtimeReady,
		packageReady: false,
		...(compatibility
			? {
					runtimeAbiProfile: compatibility.abiProfile,
					runtimeCoreUuid: compatibility.coreUuid,
				}
			: {}),
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
	const checks = await Promise.all(
		runtimeCandidates().map(async (runtimeRoot) => ({
			runtimeRoot,
			usable: await isUsableRuntime({ runtimeRoot }),
		}))
	);
	const usableRoots = checks
		.filter(({ usable }) => usable)
		.map(({ runtimeRoot }) => runtimeRoot);
	if (usableRoots.length === 0) {
		return {
			status: status({
				state: "runtime-missing",
				message: "未找到包含完整 Frameworks 和 Lumi 资源的本机剪映运行时。",
				bridgeReady: true,
				runtimeReady: false,
			}),
			bridgePath: resolvedBridgePath,
			runtimeRoot: null,
			runtimeFingerprint: null,
		};
	}
	const probes = await Promise.all(
		usableRoots.map((runtimeRoot) =>
			inspectRuntimeCandidate({ runtimeRoot, resolvedBridgePath })
		)
	);
	const compatible = probes.find((probe) => probe.compatibility);
	if (!compatible?.compatibility) {
		const details = Array.from(
			new Set(probes.flatMap((probe) => (probe.error ? [probe.error] : [])))
		).join("；");
		return {
			status: status({
				state: "runtime-incompatible",
				message: details
					? `本机剪映运行时未通过文字 ABI 自检：${details}`
					: "本机剪映运行时与当前 QCut 文字桥 ABI 不兼容。",
				bridgeReady: true,
				runtimeReady: false,
			}),
			bridgePath: resolvedBridgePath,
			runtimeRoot: null,
			runtimeFingerprint: null,
		};
	}
	return {
		status: status({
			state: "ready",
			message: "剪映原版动态花字本机渲染已通过 ABI 自检。",
			bridgeReady: true,
			runtimeReady: true,
			compatibility: compatible.compatibility,
		}),
		bridgePath: compatible.bridgePath,
		runtimeRoot: compatible.runtimeRoot,
		runtimeFingerprint: await runtimeFingerprint({
			runtimeRoot: compatible.runtimeRoot,
			bridgePath: compatible.bridgePath,
			compatibility: compatible.compatibility,
		}),
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

export const jianyingTextRuntimeDiscoveryTestUtils = {
	parseRuntimeProbeOutput,
	probeRuntimeRoot,
	runtimeCandidates,
	runtimeProbeError,
};
