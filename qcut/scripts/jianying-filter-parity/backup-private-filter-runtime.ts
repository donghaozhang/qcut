import os from "node:os";
import path from "node:path";
import {
	buildJianyingFilterLabCatalog,
	mergeKnownFiltersWithReferences,
} from "../../electron/jianying-filter-lab-catalog.js";
import { scanJianyingFilterMetadata } from "../../electron/jianying-filter-metadata.js";
import { inspectJianyingFilterPackages } from "../../electron/jianying-filter-package-inspector.js";
import { backupJianyingFilterRuntime } from "../../electron/jianying-filter-local-runtime/runtime-backup.js";
import { inspectJianyingFilterLocalRuntime } from "../../electron/jianying-filter-local-runtime/runtime-discovery.js";
import {
	listJianyingLutReferences,
	qcutManagedFilterPackageRoot,
	type JianyingLutReference,
} from "../../electron/native-pipeline/filters/filter-lab-lut.js";

function installedCacheRoot() {
	return path.join(os.homedir(), "Movies", "JianyingPro", "User Data", "Cache");
}

function titlesByResource({
	references,
	titles,
}: {
	references: JianyingLutReference[];
	titles: ReadonlyMap<string, string>;
}) {
	const result = new Map<string, string>();
	for (const reference of references) {
		const title = titles.get(`${reference.resourceId}/${reference.version}`);
		if (title && !result.has(reference.resourceId)) {
			result.set(reference.resourceId, title);
		}
	}
	return result;
}

async function run() {
	const sourceCacheRoot = installedCacheRoot();
	const references = await listJianyingLutReferences({
		root: path.join(sourceCacheRoot, "artistEffect"),
	});
	const metadata = await scanJianyingFilterMetadata({
		references,
		databaseRoot: path.join(sourceCacheRoot, "ressdk_db"),
	});
	const catalog = mergeKnownFiltersWithReferences({
		catalog: metadata.knownCatalog,
		references,
		fallbackTitles: titlesByResource({
			references,
			titles: metadata.titles,
		}),
		fallbackCategories: metadata.categories.byResourceId,
	});
	const runtime = await inspectJianyingFilterLocalRuntime({ refresh: true });
	const packages = await inspectJianyingFilterPackages({
		filters: catalog.filters,
		references,
		cacheRoot: sourceCacheRoot,
	});
	const summary = buildJianyingFilterLabCatalog({
		catalog,
		references,
		packages,
	});
	const result = await backupJianyingFilterRuntime({
		filters: catalog.filters,
		runtime,
		sourceCacheRoot,
		managedPackageRoot: qcutManagedFilterPackageRoot(),
	});
	const refreshed = await inspectJianyingFilterLocalRuntime({ refresh: true });
	console.log(
		JSON.stringify(
			{
				catalogCount: summary.count,
				referenceCount: references.length,
				cachedCount: summary.cachedCount,
				availableCount: summary.availableCount,
				cachedUnavailable: summary.filters
					.filter(
						(filter) => filter.cacheStatus === "cached" && !filter.available
					)
					.map(({ resourceId, title, implementation, version }) => ({
						resourceId,
						title,
						implementation,
						version,
						packageVersions: packages.get(resourceId)?.versions,
						dualRendererVersion:
							packages.get(resourceId)?.dualRenderer?.background.version,
						nativePortraitVersion:
							packages.get(resourceId)?.nativePortraitRenderer?.version,
						multiPassKind: packages.get(resourceId)?.multiPassRenderer?.kind,
						issues: packages.get(resourceId)?.issues,
					})),
				...result,
				status: refreshed.status,
			},
			null,
			2
		)
	);
}

void run().catch((cause) => {
	console.error(cause instanceof Error ? cause.message : String(cause));
	process.exitCode = 1;
});
