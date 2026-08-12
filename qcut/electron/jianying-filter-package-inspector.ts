import { readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { JianyingKnownFilter } from "./jianying-filter-metadata.js";
import type {
	JianyingFilterCacheStatus,
	JianyingFilterImplementation,
} from "./jianying-filter-lab-contract.js";
import {
	jianyingEffectCacheRoot,
	type JianyingLutReference,
} from "./native-pipeline/filters/filter-lab-lut.js";
import {
	inspectDualTiledLutRenderer,
	inspectTiledLutRenderer,
	type JianyingDualTiledLutRenderer,
	type JianyingTiledLutRenderer,
} from "./native-pipeline/filters/filter-lab-tiled-lut.js";
import {
	inspectJianyingMultiPassRenderer,
	type JianyingFilterMultiPassRenderer,
} from "./native-pipeline/filters/filter-lab-multi-pass.js";
import {
	inspectJianyingNativePortraitRenderer,
	type JianyingNativePortraitRenderer,
} from "./native-pipeline/filters/filter-lab-native-portrait.js";

const PACKAGE_CONTAINERS = ["artistEffect", "effect"] as const;
const MAX_PACKAGE_FILES = 5000;
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

interface PackageLocation {
	container: (typeof PACKAGE_CONTAINERS)[number];
	identifier: string;
	version: string;
	root: string;
}

interface PackageFiles {
	paths: string[];
	issues: string[];
}

export interface JianyingFilterPackageSummary {
	cacheStatus: JianyingFilterCacheStatus;
	implementation: JianyingFilterImplementation;
	versions: string[];
	hasThumbnail: boolean;
	thumbnailPath?: string;
	issues: string[];
	renderer?: JianyingTiledLutRenderer;
	dualRenderer?: JianyingDualTiledLutRenderer;
	nativePortraitRenderer?: JianyingNativePortraitRenderer;
	multiPassRenderer?: JianyingFilterMultiPassRenderer;
}

function isSafeSegment({ value }: { value: string }): boolean {
	return SAFE_SEGMENT.test(value) && value !== "." && value !== "..";
}

async function directoryNames({ directory }: { directory: string }) {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		return entries
			.filter(
				(entry) => entry.isDirectory() && isSafeSegment({ value: entry.name })
			)
			.map((entry) => entry.name);
	} catch {
		return [] as string[];
	}
}

async function indexPackageLocations({
	cacheRoot,
}: {
	cacheRoot: string;
}): Promise<Map<string, PackageLocation[]>> {
	const byIdentifier = new Map<string, PackageLocation[]>();
	for (const container of PACKAGE_CONTAINERS) {
		const containerRoot = join(cacheRoot, container);
		const identifiers = await directoryNames({ directory: containerRoot });
		const versionsByIdentifier = await Promise.all(
			identifiers.map(async (identifier) => ({
				identifier,
				versions: await directoryNames({
					directory: join(containerRoot, identifier),
				}),
			}))
		);
		for (const { identifier, versions } of versionsByIdentifier) {
			const locations = byIdentifier.get(identifier) ?? [];
			for (const version of versions) {
				locations.push({
					container,
					identifier,
					version,
					root: join(containerRoot, identifier, version),
				});
			}
			byIdentifier.set(identifier, locations);
		}
	}
	return byIdentifier;
}

async function listPackageFiles({
	root,
}: {
	root: string;
}): Promise<PackageFiles> {
	const paths: string[] = [];
	const issues: string[] = [];
	const pending = [root];
	while (pending.length > 0 && paths.length < MAX_PACKAGE_FILES) {
		const directory = pending.pop();
		if (!directory) continue;
		try {
			const entries = await readdir(directory, { withFileTypes: true });
			for (const entry of entries) {
				const absolutePath = join(directory, entry.name);
				if (entry.isDirectory()) {
					pending.push(absolutePath);
					continue;
				}
				if (entry.isFile()) {
					paths.push(relative(root, absolutePath).split(sep).join("/"));
				}
			}
		} catch (error) {
			issues.push(error instanceof Error ? error.message : String(error));
		}
	}
	if (pending.length > 0) {
		issues.push(`Package inspection exceeded ${MAX_PACKAGE_FILES} files`);
	}
	return { paths: paths.sort(), issues };
}

function packageIdentifiers({ filter }: { filter: JianyingKnownFilter }) {
	return [filter.resourceId, filter.effectId, filter.thirdResourceId].filter(
		(value): value is string => Boolean(value && isSafeSegment({ value }))
	);
}

function matchingLocations({
	filter,
	byIdentifier,
	referenceVersions,
}: {
	filter: JianyingKnownFilter;
	byIdentifier: ReadonlyMap<string, PackageLocation[]>;
	referenceVersions: ReadonlySet<string>;
}): PackageLocation[] {
	const candidates = packageIdentifiers({ filter }).flatMap(
		(identifier) => byIdentifier.get(identifier) ?? []
	);
	const exactVersions = new Set(
		[filter.version, ...referenceVersions].filter((value): value is string =>
			Boolean(value)
		)
	);
	const exact = candidates.filter(({ version }) => exactVersions.has(version));
	const selected = exact.length > 0 ? exact : candidates;
	const unique = new Map(selected.map((entry) => [entry.root, entry]));
	return [...unique.values()].sort((left, right) =>
		left.root.localeCompare(right.root)
	);
}

function hasAny({ paths, suffixes }: { paths: string[]; suffixes: string[] }) {
	return paths.some((path) =>
		suffixes.some((suffix) => path.toLowerCase().endsWith(suffix))
	);
}

function classifyImplementation({
	filter,
	references,
	paths,
}: {
	filter: JianyingKnownFilter;
	references: JianyingLutReference[];
	paths: string[];
}): JianyingFilterImplementation {
	const roles = new Set(references.map(({ role }) => role));
	const hasDualCubes = roles.has("background") && roles.has("skin");
	const hasDualImages =
		hasAny({ paths, suffixes: ["filter_bg.png"] }) &&
		hasAny({ paths, suffixes: ["filter_skin.png"] });
	if (hasDualCubes || hasDualImages) return "dual-lut";

	const hasSingleCube =
		roles.has("single") ||
		hasAny({ paths, suffixes: [".cube", ".cube.vf", ".3dl.vf"] });
	if (hasSingleCube) return "single-lut";

	const capabilitySignals = [
		...paths,
		...(filter.requirements ?? []),
		filter.sdkModel ?? "",
	]
		.join(" ")
		.toLowerCase();
	if (
		/(face[_-]?makeup|face[_-]?detect|skin[_-]?seg|skinsegmask|portrait[_-]?seg|beauty[_-]?gan)/.test(
			capabilitySignals
		)
	) {
		return "face-ai";
	}
	if (
		hasAny({
			paths,
			suffixes: [".frag", ".vert", ".xshader", ".material", ".lua"],
		})
	) {
		return "shader";
	}
	return "unknown";
}

function thumbnailPath({
	locations,
	pathsByRoot,
}: {
	locations: PackageLocation[];
	pathsByRoot: ReadonlyMap<string, string[]>;
}): string | undefined {
	const preferredNames = ["cover_icon.png", "cover.png", "icon.png"];
	for (const location of locations) {
		const paths = pathsByRoot.get(location.root) ?? [];
		for (const preferredName of preferredNames) {
			const match = paths.find((path) =>
				path.toLowerCase().endsWith(preferredName)
			);
			if (match) return join(location.root, match);
		}
	}
}

function cacheStatus({
	locations,
	references,
	issues,
}: {
	locations: PackageLocation[];
	references: JianyingLutReference[];
	issues: string[];
}): JianyingFilterCacheStatus {
	if (locations.length === 0 && references.length === 0) return "uncached";
	if (issues.length > 0 || locations.length === 0) return "partial";
	return "cached";
}

/**
 * Inspects only packages already present in Jianying's cache. Paths stay in the
 * Electron process and cached assets are never copied into QCut.
 */
export async function inspectJianyingFilterPackages({
	filters,
	references,
	cacheRoot = dirname(jianyingEffectCacheRoot()),
}: {
	filters: JianyingKnownFilter[];
	references: JianyingLutReference[];
	cacheRoot?: string;
}): Promise<Map<string, JianyingFilterPackageSummary>> {
	const byIdentifier = await indexPackageLocations({ cacheRoot });
	const referencesByResource = new Map<string, JianyingLutReference[]>();
	for (const reference of references) {
		const grouped = referencesByResource.get(reference.resourceId) ?? [];
		grouped.push(reference);
		referencesByResource.set(reference.resourceId, grouped);
	}

	const inspected = await Promise.all(
		filters.map(async (filter) => {
			const filterReferences =
				referencesByResource.get(filter.resourceId) ?? [];
			const referenceVersions = new Set(
				filterReferences.map(({ version }) => version)
			);
			const locations = matchingLocations({
				filter,
				byIdentifier,
				referenceVersions,
			});
			const packageScans = await Promise.all(
				locations.map(async ({ root }) => ({
					root,
					files: await listPackageFiles({ root }),
				}))
			);
			const pathsByRoot = new Map(
				packageScans.map(({ root, files }) => [root, files.paths])
			);
			const paths = packageScans.flatMap(({ files }) => files.paths);
			const issues = packageScans.flatMap(({ files }) => files.issues);
			const thumbnail = thumbnailPath({ locations, pathsByRoot });
			const [
				rendererCandidates,
				dualRendererCandidates,
				nativePortraitRendererCandidates,
				multiPassCandidates,
			] = await Promise.all([
				Promise.all(
					locations.map((location) =>
						inspectTiledLutRenderer({
							...location,
							paths: pathsByRoot.get(location.root) ?? [],
						})
					)
				),
				Promise.all(
					locations.map((location) =>
						inspectDualTiledLutRenderer({
							...location,
							paths: pathsByRoot.get(location.root) ?? [],
						})
					)
				),
				Promise.all(
					locations.map((location) =>
						inspectJianyingNativePortraitRenderer({
							container: location.container,
							packageIdentifier: location.identifier,
							paths: pathsByRoot.get(location.root) ?? [],
							root: location.root,
							version: location.version,
						})
					)
				),
				Promise.all(
					locations.map((location) =>
						inspectJianyingMultiPassRenderer({
							...location,
							paths: pathsByRoot.get(location.root) ?? [],
						})
					)
				),
			]);
			const renderer = rendererCandidates.find(
				(candidate): candidate is JianyingTiledLutRenderer => candidate !== null
			);
			const dualRenderer = dualRendererCandidates.find(
				(candidate): candidate is JianyingDualTiledLutRenderer =>
					candidate !== null
			);
			const nativePortraitRenderer = nativePortraitRendererCandidates.find(
				(candidate): candidate is JianyingNativePortraitRenderer =>
					candidate !== null
			);
			const multiPassRenderer = multiPassCandidates.find(
				(candidate): candidate is JianyingFilterMultiPassRenderer =>
					candidate !== null
			);
			return [
				filter.resourceId,
				{
					cacheStatus: cacheStatus({
						locations,
						references: filterReferences,
						issues,
					}),
					implementation: classifyImplementation({
						filter,
						references: filterReferences,
						paths,
					}),
					versions: [
						...new Set([
							...locations.map(({ version }) => version),
							...referenceVersions,
						]),
					].sort(),
					hasThumbnail: Boolean(thumbnail),
					...(thumbnail ? { thumbnailPath: thumbnail } : {}),
					...(renderer ? { renderer } : {}),
					...(dualRenderer ? { dualRenderer } : {}),
					...(nativePortraitRenderer ? { nativePortraitRenderer } : {}),
					...(multiPassRenderer ? { multiPassRenderer } : {}),
					issues,
				} satisfies JianyingFilterPackageSummary,
			] as const;
		})
	);
	return new Map(inspected);
}
