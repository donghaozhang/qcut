import { execFile } from "node:child_process";
import { constants, readdirSync } from "node:fs";
import { access, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
	JIANYING_TRANSITIONS,
	type JianyingTransitionRuntimeStatus,
} from "../jianying-transition-contract.js";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";
import {
	findQCutProjectRoot,
	resolveJianyingTransitionBridge,
} from "./bridge-resolver.js";

const REQUIRED_FRAMEWORKS = [
	"libAGFX.dylib",
	"libEGL.dylib",
	"libGLESv2.dylib",
	"libLumiGeneRuntime.dylib",
	"libcccreator.dylib",
] as const;

const execFileAsync = promisify(execFile);
const PACKAGE_INDEX_CONCURRENCY = 8;
const PACKAGE_ROOT_CONCURRENCY = 2;

const LOCAL_RENDER_TRANSITIONS = JIANYING_TRANSITIONS.filter(
	(transition) => transition.runtimeKind === "transition-segment"
);

const AI_GENERATION_TRANSITIONS = JIANYING_TRANSITIONS.filter(
	(transition) => transition.runtimeKind === "ai-generation"
);

export interface JianyingRuntimeInspection {
	status: JianyingTransitionRuntimeStatus;
	appBundlePath: string | null;
	runtimeRootPath: string | null;
	bridgePath: string | null;
	packagePaths: ReadonlyMap<string, string>;
}

interface RuntimeSelection {
	runtimeRootPath: string | null;
	error?: string;
}

async function pathExists({
	filePath,
	mode = constants.F_OK,
}: {
	filePath: string;
	mode?: number;
}): Promise<boolean> {
	try {
		await access(filePath, mode);
		return true;
	} catch {
		return false;
	}
}

function uniquePaths({
	paths,
}: {
	paths: Array<string | undefined>;
}): string[] {
	return Array.from(
		new Set(
			paths.filter((candidate): candidate is string => Boolean(candidate))
		)
	);
}

function appBundleCandidates(): string[] {
	if (process.env.QCUT_JIANYING_DISABLE_APP_BUNDLE === "1") return [];
	const overrides = uniquePaths({
		paths: [process.env.QCUT_JIANYING_APP_BUNDLE, process.env.JY_APP_BUNDLE],
	});
	if (overrides.length > 0) return overrides;
	return uniquePaths({
		paths: [
			"/Applications/VideoFusion-macOS.app",
			path.join(os.homedir(), "Applications", "VideoFusion-macOS.app"),
		],
	});
}

function privateRuntimeRoot(): string {
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

async function isUsableAppBundle({ appBundlePath }: { appBundlePath: string }) {
	const frameworkChecks = REQUIRED_FRAMEWORKS.map((framework) =>
		pathExists({
			filePath: path.join(appBundlePath, "Contents", "Frameworks", framework),
		})
	);
	const [resourcesReady, ...frameworksReady] = await Promise.all([
		pathExists({
			filePath: path.join(
				appBundlePath,
				"Contents",
				"Resources",
				"lumi_js_resources"
			),
		}),
		...frameworkChecks,
	]);
	return resourcesReady && frameworksReady.every(Boolean);
}

async function findAppBundle(): Promise<string | null> {
	const candidates = appBundleCandidates();
	const results = await Promise.all(
		candidates.map(async (candidate) => ({
			candidate,
			usable: await isUsableAppBundle({ appBundlePath: candidate }),
		}))
	);
	return results.find((result) => result.usable)?.candidate ?? null;
}

function runtimeRootCandidates({
	appBundlePath,
}: {
	appBundlePath: string | null;
}): string[] {
	const overrides = uniquePaths({
		paths: [
			process.env.QCUT_JIANYING_RUNTIME_ROOT,
			process.env.JY_RUNTIME_ROOT,
		],
	});
	if (overrides.length > 0) return overrides;
	const projectRoot = findQCutProjectRoot();
	return uniquePaths({
		paths: [
			privateRuntimeRoot(),
			projectRoot
				? path.join(projectRoot, ".local", "jianying-runtime")
				: undefined,
			appBundlePath ? path.join(appBundlePath, "Contents") : undefined,
		],
	});
}

async function isUsableRuntimeRoot({
	runtimeRootPath,
}: {
	runtimeRootPath: string;
}): Promise<boolean> {
	const frameworkChecks = REQUIRED_FRAMEWORKS.map((framework) =>
		pathExists({
			filePath: path.join(runtimeRootPath, "Frameworks", framework),
		})
	);
	const [resourcesReady, ...frameworksReady] = await Promise.all([
		pathExists({
			filePath: path.join(runtimeRootPath, "Resources", "lumi_js_resources"),
		}),
		...frameworkChecks,
	]);
	return resourcesReady && frameworksReady.every(Boolean);
}

function runtimeProbeError({ cause }: { cause: unknown }): string {
	if (!(cause instanceof Error)) return String(cause);
	const processError = cause as Error & { stderr?: string; stdout?: string };
	const output = [processError.stderr, processError.stdout]
		.filter((value): value is string => Boolean(value))
		.join("\n");
	const bridgeError = output
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.startsWith("[error]"));
	return bridgeError?.slice("[error]".length).trim() || cause.message;
}

async function probeRuntimeRoot({
	runtimeRootPath,
	bridgePath,
}: {
	runtimeRootPath: string;
	bridgePath: string;
}): Promise<{ runtimeRootPath: string; compatible: boolean; error?: string }> {
	try {
		await execFileAsync(bridgePath, [runtimeRootPath, "transition"], {
			env: {
				...process.env,
				DYLD_LIBRARY_PATH: path.join(runtimeRootPath, "Frameworks"),
			},
			maxBuffer: 16 * 1024 * 1024,
			timeout: 15_000,
		});
		return { runtimeRootPath, compatible: true };
	} catch (cause) {
		return {
			runtimeRootPath,
			compatible: false,
			error: runtimeProbeError({ cause }),
		};
	}
}

async function selectRuntimeRoot({
	appBundlePath,
	bridgePath,
}: {
	appBundlePath: string | null;
	bridgePath: string | null;
}): Promise<RuntimeSelection> {
	const candidates = runtimeRootCandidates({ appBundlePath });
	const checks = await Promise.all(
		candidates.map(async (runtimeRootPath) => ({
			runtimeRootPath,
			usable: await isUsableRuntimeRoot({ runtimeRootPath }),
		}))
	);
	const usableRoots = checks
		.filter((check) => check.usable)
		.map((check) => check.runtimeRootPath);
	if (usableRoots.length === 0) {
		return {
			runtimeRootPath: null,
			error: "未找到包含完整 Frameworks 和 Lumi 资源的剪映本机运行时。",
		};
	}
	if (!bridgePath) return { runtimeRootPath: usableRoots[0] ?? null };

	const probes = await Promise.all(
		usableRoots.map((runtimeRootPath) =>
			probeRuntimeRoot({ runtimeRootPath, bridgePath })
		)
	);
	const compatible = probes.find((probe) => probe.compatible);
	if (compatible) return { runtimeRootPath: compatible.runtimeRootPath };
	const details = probes
		.flatMap((probe) => (probe.error ? [probe.error] : []))
		.join("；");
	return {
		runtimeRootPath: null,
		error: details || "本机剪映运行时与当前 QCut bridge ABI 不兼容。",
	};
}

function generatedPackageRootCandidates({
	projectRoot,
}: {
	projectRoot: string | null;
}): string[] {
	if (!projectRoot) return [];
	const generatedRoot = path.join(projectRoot, ".local", "jianying-runtime");
	try {
		return readdirSync(generatedRoot, { withFileTypes: true })
			.filter(
				(entry) => entry.isDirectory() && entry.name.startsWith("category-")
			)
			.map((entry) => path.join(generatedRoot, entry.name, "packages"));
	} catch {
		return [];
	}
}

function packageRootCandidates(): string[] {
	const home = os.homedir();
	const projectRoot = findQCutProjectRoot();
	const generatedPackageRoots = generatedPackageRootCandidates({ projectRoot });
	const overrides = [
		process.env.QCUT_JIANYING_TRANSITION_PACKAGE_ROOT,
		process.env.QCUT_JIANYING_TRANSITION_CACHE,
	]
		.filter((value): value is string => Boolean(value))
		.flatMap((value) => value.split(path.delimiter));
	if (overrides.length > 0) return uniquePaths({ paths: overrides });
	return uniquePaths({
		paths: [
			path.join(privateRuntimeRoot(), "Packages"),
			path.join(
				home,
				"Library",
				"Containers",
				"com.lemon.lvpro",
				"Data",
				"Movies",
				"JianyingPro",
				"User Data",
				"Cache",
				"effect"
			),
			path.join(home, "Movies", "JianyingPro", "User Data", "Cache", "effect"),
			...generatedPackageRoots,
			projectRoot
				? path.join(
						projectRoot,
						".local",
						"jianying-runtime",
						"new-twenty",
						"packages"
					)
				: undefined,
		],
	});
}

async function isTransitionPackage({ directory }: { directory: string }) {
	return pathExists({ filePath: path.join(directory, "config.json") });
}

async function indexPackageLevel({
	level,
	targetHashes,
	depth,
	maxDepth,
	found,
}: {
	level: string[];
	targetHashes: ReadonlySet<string>;
	depth: number;
	maxDepth: number;
	found: Map<string, string>;
}): Promise<Map<string, string>> {
	if (depth > maxDepth || level.length === 0) return found;
	const listings = await mapWithConcurrency({
		items: level,
		limit: PACKAGE_INDEX_CONCURRENCY,
		task: async ({ item: directory }) => {
			try {
				const entries = await readdir(directory, { withFileTypes: true });
				return { directory, entries };
			} catch {
				return { directory, entries: [] };
			}
		},
	});
	const nextLevel: string[] = [];
	for (const listing of listings) {
		for (const entry of listing.entries) {
			if (!entry.isDirectory()) continue;
			const directory = path.join(listing.directory, entry.name);
			if (targetHashes.has(entry.name)) {
				if (!found.has(entry.name)) found.set(entry.name, directory);
				continue;
			}
			nextLevel.push(directory);
		}
	}
	if (found.size === targetHashes.size) return found;
	return indexPackageLevel({
		level: nextLevel,
		targetHashes,
		depth: depth + 1,
		maxDepth,
		found,
	});
}

function indexPackageRoot({
	root,
	targetHashes,
	maxDepth = 3,
}: {
	root: string;
	targetHashes: ReadonlySet<string>;
	maxDepth?: number;
}): Promise<Map<string, string>> {
	return indexPackageLevel({
		level: [root],
		targetHashes,
		depth: 0,
		maxDepth,
		found: new Map(),
	});
}

async function findTransitionPackages(): Promise<Map<string, string>> {
	const roots = packageRootCandidates();
	const existingRoots = (
		await Promise.all(
			roots.map(async (root) => ({
				root,
				exists: await pathExists({ filePath: root }),
			}))
		)
	)
		.filter((candidate) => candidate.exists)
		.map((candidate) => candidate.root);
	const targetHashes = new Set(
		LOCAL_RENDER_TRANSITIONS.map((transition) => transition.metadataMd5)
	);
	const indexes = await mapWithConcurrency({
		items: existingRoots,
		limit: PACKAGE_ROOT_CONCURRENCY,
		task: ({ item: root }) => indexPackageRoot({ root, targetHashes }),
	});
	const indexedChecks = await mapWithConcurrency({
		items: LOCAL_RENDER_TRANSITIONS,
		limit: PACKAGE_INDEX_CONCURRENCY,
		task: async ({ item: transition }) => {
			const packagePath = indexes
				.map((index) => index.get(transition.metadataMd5))
				.find((candidate): candidate is string => Boolean(candidate));
			return {
				transition,
				packagePath,
				valid: packagePath
					? await isTransitionPackage({ directory: packagePath })
					: false,
			};
		},
	});
	const packagePaths = new Map<string, string>();
	for (const check of indexedChecks) {
		if (check.packagePath && check.valid) {
			packagePaths.set(check.transition.id, check.packagePath);
		}
	}
	return packagePaths;
}

export function buildJianyingRuntimeStatus({
	appBundlePath,
	runtimeRootPath,
	bridgePath,
	packagePaths,
	platform = process.platform,
	runtimeError,
	error,
}: {
	appBundlePath: string | null;
	runtimeRootPath: string | null;
	bridgePath: string | null;
	packagePaths: ReadonlyMap<string, string>;
	platform?: NodeJS.Platform;
	runtimeError?: string;
	error?: string;
}): JianyingTransitionRuntimeStatus {
	const runtimeReady = Boolean(runtimeRootPath && bridgePath);
	const transitions = JIANYING_TRANSITIONS.map((transition) => {
		const isAiGeneration = transition.runtimeKind === "ai-generation";
		return {
			id: transition.id,
			available:
				!isAiGeneration && runtimeReady && packagePaths.has(transition.id),
			runtimeKind: transition.runtimeKind,
			...(isAiGeneration
				? { reason: "此效果需要 QCut AI 首尾帧生成，不使用本机双输入转场桥。" }
				: {}),
		};
	});
	const availableCount = transitions.filter(
		(transition) => transition.available
	).length;
	const base = {
		platform,
		appInstalled: Boolean(appBundlePath),
		bridgeReady: Boolean(bridgePath),
		availableCount,
		totalCount: JIANYING_TRANSITIONS.length,
		transitions,
	};
	if (error) return { ...base, state: "error", message: error };
	if (platform !== "darwin") {
		return {
			...base,
			state: "unsupported-platform",
			message: "剪映本机转场运行时目前仅支持 macOS。",
		};
	}
	if (!appBundlePath && !runtimeRootPath) {
		return {
			...base,
			state: "app-missing",
			message: "未找到可用的剪映专业版安装。",
		};
	}
	if (!bridgePath) {
		return {
			...base,
			state: "bridge-missing",
			message: "QCut 本机转场桥未构建。",
		};
	}
	if (!runtimeRootPath) {
		return {
			...base,
			state: "runtime-incompatible",
			message: runtimeError || "本机剪映运行时与当前 QCut bridge ABI 不兼容。",
		};
	}
	if (availableCount < LOCAL_RENDER_TRANSITIONS.length) {
		return {
			...base,
			state: "packages-missing",
			message: `本机已找到 ${availableCount}/${LOCAL_RENDER_TRANSITIONS.length} 个可直接渲染的剪映转场包；另有 ${AI_GENERATION_TRANSITIONS.length} 个 AI 一镜到底效果。`,
		};
	}
	return {
		...base,
		state: "ready",
		message: `${availableCount} 个剪映本机转场可用；${AI_GENERATION_TRANSITIONS.length} 个 AI 一镜到底效果需使用首尾帧生成。`,
	};
}

export async function inspectJianyingTransitionRuntime(): Promise<JianyingRuntimeInspection> {
	if (process.platform !== "darwin") {
		const packagePaths = new Map<string, string>();
		return {
			status: buildJianyingRuntimeStatus({
				appBundlePath: null,
				runtimeRootPath: null,
				bridgePath: null,
				packagePaths,
			}),
			appBundlePath: null,
			runtimeRootPath: null,
			bridgePath: null,
			packagePaths,
		};
	}

	try {
		const [appBundlePath, bridgePath, packagePaths] = await Promise.all([
			findAppBundle(),
			resolveJianyingTransitionBridge(),
			findTransitionPackages(),
		]);
		const runtime = await selectRuntimeRoot({ appBundlePath, bridgePath });
		return {
			status: buildJianyingRuntimeStatus({
				appBundlePath,
				runtimeRootPath: runtime.runtimeRootPath,
				bridgePath,
				packagePaths,
				runtimeError: runtime.error,
			}),
			appBundlePath,
			runtimeRootPath: runtime.runtimeRootPath,
			bridgePath,
			packagePaths,
		};
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		const packagePaths = new Map<string, string>();
		return {
			status: buildJianyingRuntimeStatus({
				appBundlePath: null,
				runtimeRootPath: null,
				bridgePath: null,
				packagePaths,
				error: message,
			}),
			appBundlePath: null,
			runtimeRootPath: null,
			bridgePath: null,
			packagePaths,
		};
	}
}

export const jianyingRuntimeDiscoveryTestUtils = {
	indexPackageRoot,
};
