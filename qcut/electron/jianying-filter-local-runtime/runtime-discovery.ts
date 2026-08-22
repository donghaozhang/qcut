import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { JianyingFilterLocalRuntimeStatus } from "../jianying-filter-lab-contract.js";
import { resolveJianyingFilterLocalBridge } from "./bridge-resolver.js";
import {
	hasJianyingFilterPrivateRuntime,
	jianyingFilterPrivateModelDirectory,
	jianyingFilterPrivateRuntimeCurrent,
} from "./private-runtime.js";

const execFileAsync = promisify(execFile);
const KNOWN_LIBCCCREATOR_UUIDS = new Set([
	"D6342ECD-5432-33F0-A2AD-0C28F5699994",
	"9A8A8F6B-31C0-3DDC-85AC-5F11087D7965",
	"FDF42EF4-427D-30DF-9310-A8C7B352C5CD",
	"9723BA50-5F7F-353D-8CEF-3472AAE6643D",
]);

export interface JianyingFilterLocalRuntimeInspection {
	status: JianyingFilterLocalRuntimeStatus;
	bridgePath: string | null;
	effectLibraryPath: string | null;
	frameworkDirectory: string | null;
	modelDirectory: string | null;
}

type RuntimeSource = NonNullable<
	JianyingFilterLocalRuntimeStatus["runtimeSource"]
>;

interface RuntimeCandidate {
	frameworkDirectory: string;
	source: RuntimeSource;
}

interface ModelCandidate {
	modelDirectory: string;
	source: RuntimeSource;
}

let pendingInspection: Promise<JianyingFilterLocalRuntimeInspection> | null =
	null;

function uniquePaths({ paths }: { paths: Array<string | undefined> }) {
	return Array.from(
		new Set(
			paths.filter((candidate): candidate is string => Boolean(candidate))
		)
	);
}

async function isReadable({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

async function hasSkinSegModel({ directory }: { directory: string }) {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		return entries.some(
			(entry) => entry.isFile() && /^tt_skin_seg.*\.model$/i.test(entry.name)
		);
	} catch {
		return false;
	}
}

function appBundleCandidates() {
	if (process.env.QCUT_JIANYING_DISABLE_APP_BUNDLE === "1") return [];
	return uniquePaths({
		paths: [
			process.env.QCUT_JIANYING_APP_BUNDLE,
			process.env.JY_APP_BUNDLE,
			"/Applications/VideoFusion-macOS.app",
			path.join(os.homedir(), "Applications", "VideoFusion-macOS.app"),
		],
	});
}

function transitionPrivateRuntimeCurrent() {
	return path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"PrivateRuntimes",
		"JianyingTransition",
		"current"
	);
}

function runtimeCandidates(): RuntimeCandidate[] {
	const override = process.env.QCUT_JIANYING_FILTER_FRAMEWORK_DIRECTORY;
	if (override) {
		return [{ frameworkDirectory: override, source: "environment" }];
	}
	const privateRoots = [
		jianyingFilterPrivateRuntimeCurrent(),
		transitionPrivateRuntimeCurrent(),
	];
	return [
		...privateRoots.map((runtimeRoot) => ({
			frameworkDirectory: path.join(runtimeRoot, "Frameworks"),
			source: "qcut-private" as const,
		})),
		...appBundleCandidates().map((appBundlePath) => ({
			frameworkDirectory: path.join(appBundlePath, "Contents", "Frameworks"),
			source: "jianying-installation" as const,
		})),
	];
}

function modelDirectoryCandidates(): ModelCandidate[] {
	const override = process.env.QCUT_JIANYING_FILTER_MODEL_DIRECTORY;
	if (override) return [{ modelDirectory: override, source: "environment" }];
	const candidates: ModelCandidate[] = [
		{
			modelDirectory: jianyingFilterPrivateModelDirectory(),
			source: "qcut-private",
		},
	];
	if (process.env.QCUT_JIANYING_DISABLE_USER_CACHE !== "1") {
		candidates.push({
			modelDirectory: path.join(
				os.homedir(),
				"Movies",
				"JianyingPro",
				"User Data",
				"Cache",
				"effect",
				"model"
			),
			source: "jianying-installation",
		});
	}
	return candidates;
}

function status({
	state,
	message,
	bridgeReady,
	runtimeReady,
	modelReady,
	runtimeSource = "none",
	modelSource = "none",
	snapshotReady = false,
}: Omit<
	JianyingFilterLocalRuntimeStatus,
	"provider" | "platform" | "offlineReady"
>) {
	return {
		state,
		message,
		provider: "jianying-local-effect-v1" as const,
		platform: process.platform,
		bridgeReady,
		runtimeReady,
		modelReady,
		runtimeSource,
		modelSource,
		snapshotReady,
		offlineReady:
			state === "ready" &&
			runtimeSource === "qcut-private" &&
			modelSource === "qcut-private",
	};
}

async function compatibleLibrary({ filePath }: { filePath: string }) {
	try {
		const { stdout } = await execFileAsync("dwarfdump", ["--uuid", filePath], {
			maxBuffer: 1024 * 1024,
			timeout: 5000,
		});
		return hasCompatibleLibrarySlice({ stdout, architecture: process.arch });
	} catch {
		return false;
	}
}

function hasCompatibleLibrarySlice({
	stdout,
	architecture,
}: {
	stdout: string;
	architecture: NodeJS.Architecture;
}) {
	const expectedArchitecture = architecture === "x64" ? "x86_64" : architecture;
	return stdout.split("\n").some((line) => {
		const match = /UUID:\s+([0-9A-F-]+)\s+\(([^)]+)\)/i.exec(line);
		if (!match) return false;
		const [, uuid, libraryArchitecture] = match;
		return (
			libraryArchitecture === expectedArchitecture &&
			KNOWN_LIBCCCREATOR_UUIDS.has(uuid.toUpperCase())
		);
	});
}

async function inspectRuntime(): Promise<JianyingFilterLocalRuntimeInspection> {
	const snapshotReady = await hasJianyingFilterPrivateRuntime();
	if (process.platform !== "darwin") {
		return {
			status: status({
				state: "unsupported-platform",
				message: "剪映人像滤镜本机适配器目前只支持 macOS。",
				bridgeReady: false,
				runtimeReady: false,
				modelReady: false,
				snapshotReady,
			}),
			bridgePath: null,
			effectLibraryPath: null,
			frameworkDirectory: null,
			modelDirectory: null,
		};
	}

	const bridgePath = await resolveJianyingFilterLocalBridge().catch(() => null);
	if (!bridgePath) {
		return {
			status: status({
				state: "bridge-missing",
				message: "QCut 剪映人像滤镜本机桥未安装或构建失败。",
				bridgeReady: false,
				runtimeReady: false,
				modelReady: false,
				snapshotReady,
			}),
			bridgePath: null,
			effectLibraryPath: null,
			frameworkDirectory: null,
			modelDirectory: null,
		};
	}

	const runtimeChecks = await Promise.all(
		runtimeCandidates().map(async ({ frameworkDirectory, source }) => {
			const effectLibraryPath = path.join(
				frameworkDirectory,
				"libcccreator.dylib"
			);
			return {
				effectLibraryPath,
				frameworkDirectory,
				source,
				usable:
					(await isReadable({ filePath: effectLibraryPath })) &&
					(await compatibleLibrary({ filePath: effectLibraryPath })),
			};
		})
	);
	const runtime = runtimeChecks.find(({ usable }) => usable);
	if (!runtime) {
		return {
			status: status({
				state: "runtime-incompatible",
				message: "未找到已验证 ABI 的本机剪映 libcccreator 运行时。",
				bridgeReady: true,
				runtimeReady: false,
				modelReady: false,
				snapshotReady,
			}),
			bridgePath,
			effectLibraryPath: null,
			frameworkDirectory: null,
			modelDirectory: null,
		};
	}

	const modelChecks = await Promise.all(
		modelDirectoryCandidates().map(async ({ modelDirectory, source }) => ({
			modelDirectory,
			source,
			usable:
				(await isReadable({ filePath: modelDirectory })) &&
				(await hasSkinSegModel({ directory: modelDirectory })),
		}))
	);
	const model = modelChecks.find(({ usable }) => usable);
	if (!model) {
		return {
			status: status({
				state: "model-missing",
				message: "未找到剪映本机人像与皮肤分割模型目录。",
				bridgeReady: true,
				runtimeReady: true,
				modelReady: false,
				runtimeSource: runtime.source,
				snapshotReady,
			}),
			bridgePath,
			effectLibraryPath: runtime.effectLibraryPath,
			frameworkDirectory: runtime.frameworkDirectory,
			modelDirectory: null,
		};
	}

	return {
		status: status({
			state: "ready",
			message: "剪映原版人像皮肤分割本机渲染已就绪。",
			bridgeReady: true,
			runtimeReady: true,
			modelReady: true,
			runtimeSource: runtime.source,
			modelSource: model.source,
			snapshotReady,
		}),
		bridgePath,
		effectLibraryPath: runtime.effectLibraryPath,
		frameworkDirectory: runtime.frameworkDirectory,
		modelDirectory: model.modelDirectory,
	};
}

export function inspectJianyingFilterLocalRuntime({
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
				modelReady: false,
				snapshotReady: false,
			}),
			bridgePath: null,
			effectLibraryPath: null,
			frameworkDirectory: null,
			modelDirectory: null,
		}));
	}
	return pendingInspection;
}

export const jianyingFilterLocalRuntimeDiscoveryTestUtils = {
	hasCompatibleLibrarySlice,
};
