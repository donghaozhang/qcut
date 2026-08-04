import { constants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	JIANYING_TRANSITIONS,
	type JianyingTransitionDefinition,
	type JianyingTransitionRuntimeStatus,
} from "../jianying-transition-contract.js";
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

export interface JianyingRuntimeInspection {
	status: JianyingTransitionRuntimeStatus;
	appBundlePath: string | null;
	bridgePath: string | null;
	packagePaths: ReadonlyMap<string, string>;
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
	return uniquePaths({
		paths: [
			process.env.QCUT_JIANYING_APP_BUNDLE,
			process.env.JY_APP_BUNDLE,
			"/Applications/VideoFusion-macOS.app",
			path.join(os.homedir(), "Applications", "VideoFusion-macOS.app"),
		],
	});
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

function packageRootCandidates(): string[] {
	const home = os.homedir();
	const projectRoot = findQCutProjectRoot();
	const overrides = [
		process.env.QCUT_JIANYING_TRANSITION_PACKAGE_ROOT,
		process.env.QCUT_JIANYING_TRANSITION_CACHE,
	]
		.filter((value): value is string => Boolean(value))
		.flatMap((value) => value.split(path.delimiter));
	return uniquePaths({
		paths: [
			...overrides,
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

async function findDirectPackage({
	root,
	transition,
}: {
	root: string;
	transition: JianyingTransitionDefinition;
}): Promise<string | null> {
	const candidates = [
		path.join(root, transition.resourceId, transition.metadataMd5),
		path.join(root, transition.metadataMd5),
	];
	const checks = await Promise.all(
		candidates.map(async (candidate) => ({
			candidate,
			valid: await isTransitionPackage({ directory: candidate }),
		}))
	);
	return checks.find((check) => check.valid)?.candidate ?? null;
}

async function indexPackageRoot({
	root,
	targetHashes,
	maxDepth = 3,
}: {
	root: string;
	targetHashes: ReadonlySet<string>;
	maxDepth?: number;
}): Promise<Map<string, string>> {
	const found = new Map<string, string>();
	let level = [root];
	for (let depth = 0; depth <= maxDepth && level.length > 0; depth += 1) {
		const listings = await Promise.all(
			level.map(async (directory) => {
				try {
					const entries = await readdir(directory, { withFileTypes: true });
					return { directory, entries };
				} catch {
					return { directory, entries: [] };
				}
			})
		);
		const nextLevel: string[] = [];
		for (const listing of listings) {
			for (const entry of listing.entries) {
				if (!entry.isDirectory()) continue;
				const directory = path.join(listing.directory, entry.name);
				if (targetHashes.has(entry.name)) {
					found.set(entry.name, directory);
					continue;
				}
				nextLevel.push(directory);
			}
		}
		if (found.size === targetHashes.size) break;
		level = nextLevel;
	}
	return found;
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
	const packagePaths = new Map<string, string>();

	const directChecks = await Promise.all(
		JIANYING_TRANSITIONS.flatMap((transition) =>
			existingRoots.map(async (root) => ({
				transition,
				packagePath: await findDirectPackage({ root, transition }),
			}))
		)
	);
	for (const check of directChecks) {
		if (check.packagePath && !packagePaths.has(check.transition.id)) {
			packagePaths.set(check.transition.id, check.packagePath);
		}
	}

	const missing = JIANYING_TRANSITIONS.filter(
		(transition) => !packagePaths.has(transition.id)
	);
	if (missing.length === 0) return packagePaths;
	const targetHashes = new Set(
		missing.map((transition) => transition.metadataMd5)
	);
	const indexes = await Promise.all(
		existingRoots.map((root) => indexPackageRoot({ root, targetHashes }))
	);
	const indexedChecks = await Promise.all(
		missing.map(async (transition) => {
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
		})
	);
	for (const check of indexedChecks) {
		if (check.packagePath && check.valid) {
			packagePaths.set(check.transition.id, check.packagePath);
		}
	}
	return packagePaths;
}

function buildStatus({
	appBundlePath,
	bridgePath,
	packagePaths,
	error,
}: {
	appBundlePath: string | null;
	bridgePath: string | null;
	packagePaths: ReadonlyMap<string, string>;
	error?: string;
}): JianyingTransitionRuntimeStatus {
	const transitions = JIANYING_TRANSITIONS.map((transition) => ({
		id: transition.id,
		available: packagePaths.has(transition.id),
	}));
	const availableCount = transitions.filter(
		(transition) => transition.available
	).length;
	const base = {
		platform: process.platform,
		appInstalled: Boolean(appBundlePath),
		bridgeReady: Boolean(bridgePath),
		availableCount,
		totalCount: JIANYING_TRANSITIONS.length,
		transitions,
	};
	if (error) return { ...base, state: "error", message: error };
	if (process.platform !== "darwin") {
		return {
			...base,
			state: "unsupported-platform",
			message: "剪映本机转场运行时目前仅支持 macOS。",
		};
	}
	if (!appBundlePath) {
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
	if (availableCount < JIANYING_TRANSITIONS.length) {
		return {
			...base,
			state: "packages-missing",
			message: `本机已找到 ${availableCount}/${JIANYING_TRANSITIONS.length} 个剪映转场包。`,
		};
	}
	return {
		...base,
		state: "ready",
		message: `${availableCount} 个剪映本机转场均可用。`,
	};
}

export async function inspectJianyingTransitionRuntime(): Promise<JianyingRuntimeInspection> {
	if (process.platform !== "darwin") {
		const packagePaths = new Map<string, string>();
		return {
			status: buildStatus({
				appBundlePath: null,
				bridgePath: null,
				packagePaths,
			}),
			appBundlePath: null,
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
		return {
			status: buildStatus({ appBundlePath, bridgePath, packagePaths }),
			appBundlePath,
			bridgePath,
			packagePaths,
		};
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		const packagePaths = new Map<string, string>();
		return {
			status: buildStatus({
				appBundlePath: null,
				bridgePath: null,
				packagePaths,
				error: message,
			}),
			appBundlePath: null,
			bridgePath: null,
			packagePaths,
		};
	}
}
