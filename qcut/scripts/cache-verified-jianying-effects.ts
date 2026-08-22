import os from "node:os";
import path from "node:path";

const CACHE_CONCURRENCY = 3;

function uniquePaths({ paths }: { paths: string[] }): string[] {
	return [...new Set(paths.filter((entry) => entry.length > 0))];
}

function configureLocalCacheRoots(): void {
	const projectRoot = path.resolve(__dirname, "..");
	const home = os.homedir();
	process.env.QCUT_JIANYING_EFFECT_MANAGED_PACKAGE_ROOT ??= path.join(
		home,
		"Library",
		"Application Support",
		"QCut",
		"JianyingEffectPackages"
	);
	process.env.QCUT_JIANYING_EFFECT_PACKAGE_ROOT ??= uniquePaths({
		paths: [
			path.join(
				projectRoot,
				".local",
				"jianying-effect-references",
				"_packages"
			),
			path.join(home, "Movies", "JianyingPro", "User Data", "Cache", "effect"),
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
		],
	}).join(path.delimiter);
}

interface CacheResult {
	effectId: string;
	title: string;
	ok: boolean;
	message?: string;
}

async function main(): Promise<void> {
	configureLocalCacheRoots();
	const [catalog, downloader, concurrency] = await Promise.all([
		import("../electron/jianying-effect/catalog.js"),
		import("../electron/jianying-effect/download.js"),
		import("../electron/lib/map-with-concurrency.js"),
	]);
	const library = await catalog.discoverJianyingEffectLibrary();
	const effects = library.effects.filter(
		(effect) => effect.supported && effect.requiresAlgorithm
	);
	if (effects.length === 0) {
		throw new Error("没有找到已验证的本机算法特效。");
	}

	console.log(`开始缓存 ${effects.length} 个已验证算法特效。`);
	let completed = 0;
	const results = await concurrency.mapWithConcurrency({
		items: effects,
		limit: CACHE_CONCURRENCY,
		task: async ({ item }): Promise<CacheResult> => {
			try {
				await downloader.downloadJianyingEffectPackage({
					effectId: item.effectId,
				});
				completed += 1;
				console.log(`[${completed}/${effects.length}] ${item.name}`);
				return { effectId: item.effectId, title: item.name, ok: true };
			} catch (cause) {
				completed += 1;
				const message = cause instanceof Error ? cause.message : String(cause);
				console.error(
					`[${completed}/${effects.length}] ${item.name}: ${message}`
				);
				return {
					effectId: item.effectId,
					title: item.name,
					ok: false,
					message,
				};
			}
		},
	});
	const failures = results.filter((result) => !result.ok);
	console.log(
		`缓存完成：成功 ${results.length - failures.length}，失败 ${failures.length}。`
	);
	if (failures.length > 0) process.exitCode = 1;
}

main().catch((cause: unknown) => {
	console.error(cause instanceof Error ? cause.message : String(cause));
	process.exitCode = 1;
});
