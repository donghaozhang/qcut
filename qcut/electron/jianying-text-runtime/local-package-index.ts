import { readdir } from "node:fs/promises";
import path from "node:path";
import { JIANYING_TEXT_PACKAGE_HASH_PATTERN } from "../jianying-text-package-metadata.js";

const INDEX_TTL_MS = 5_000;

interface CachedPackageIndex {
	createdAt: number;
	promise: Promise<ReadonlyMap<string, string[]>>;
}

const packageIndexes = new Map<string, CachedPackageIndex>();

async function buildPackageIndex({ containerRoot }: { containerRoot: string }) {
	const resourceEntries = await readdir(containerRoot, {
		withFileTypes: true,
	}).catch(() => []);
	const versionsByResource = await Promise.all(
		resourceEntries.flatMap((resourceEntry) =>
			resourceEntry.isDirectory()
				? [
						(async () => {
							const resourceRoot = path.join(containerRoot, resourceEntry.name);
							const versionEntries = await readdir(resourceRoot, {
								withFileTypes: true,
							}).catch(() => []);
							return versionEntries.flatMap((versionEntry) =>
								versionEntry.isDirectory() &&
								JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(versionEntry.name)
									? [
											{
												hash: versionEntry.name.toLowerCase(),
												packagePath: path.join(resourceRoot, versionEntry.name),
											},
										]
									: []
							);
						})(),
					]
				: []
		)
	);
	const byHash = new Map<string, string[]>();
	for (const version of versionsByResource.flat()) {
		const paths = byHash.get(version.hash) ?? [];
		paths.push(version.packagePath);
		byHash.set(version.hash, paths);
	}
	for (const paths of byHash.values()) paths.sort();
	return byHash;
}

function packageIndex({ containerRoot }: { containerRoot: string }) {
	const cached = packageIndexes.get(containerRoot);
	if (cached && Date.now() - cached.createdAt < INDEX_TTL_MS) {
		return cached.promise;
	}
	const promise = buildPackageIndex({ containerRoot }).catch((cause) => {
		packageIndexes.delete(containerRoot);
		throw cause;
	});
	packageIndexes.set(containerRoot, { createdAt: Date.now(), promise });
	return promise;
}

export async function findJianyingLocalPackagesByHash({
	cacheRoots,
	containers,
	packageHash,
}: {
	cacheRoots: string[];
	containers: string[];
	packageHash: string;
}) {
	if (!JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(packageHash)) return [];
	const roots = Array.from(new Set(cacheRoots));
	const indexes = await Promise.all(
		roots.flatMap((cacheRoot) =>
			containers.map((container) =>
				packageIndex({ containerRoot: path.join(cacheRoot, container) })
			)
		)
	);
	return Array.from(
		new Set(
			indexes.flatMap((index) => index.get(packageHash.toLowerCase()) ?? [])
		)
	).sort();
}
