import type {
	JianyingFilterLabCategorySummary,
	JianyingFilterLabFilterSummary,
	JianyingFilterLabListResult,
	JianyingFilterLabLutSummary,
	JianyingFilterVerification,
} from "./jianying-filter-lab-contract.js";
import {
	selectVerificationForCard,
	type JianyingFilterVerificationCandidates,
} from "./jianying-filter-verification-gate.js";
import type {
	JianyingFilterKnownCatalog,
	JianyingKnownFilter,
} from "./jianying-filter-metadata.js";
import type { JianyingFilterPackageSummary } from "./jianying-filter-package-inspector.js";
import type { JianyingLutReference } from "./native-pipeline/filters/filter-lab-lut.js";
import {
	createTiledLutId,
	type JianyingTiledLutRenderer,
	resolveTiledLutPath,
} from "./native-pipeline/filters/filter-lab-tiled-lut.js";

interface TiledRendererRole {
	renderer: JianyingTiledLutRenderer;
	role: JianyingLutReference["role"];
}

function tiledRendererRoles({
	packageSummary,
}: {
	packageSummary: JianyingFilterPackageSummary;
}): TiledRendererRole[] {
	if (packageSummary.dualRenderer) {
		return [
			{
				renderer: packageSummary.dualRenderer.background,
				role: "background",
			},
			{ renderer: packageSummary.dualRenderer.skin, role: "skin" },
		];
	}
	return packageSummary.renderer
		? [{ renderer: packageSummary.renderer, role: "single" }]
		: [];
}

export function tiledReferencesFromPackages({
	packages,
	cacheRoot,
}: {
	packages: ReadonlyMap<string, JianyingFilterPackageSummary>;
	cacheRoot: string;
}): Map<string, JianyingLutReference> {
	const references = new Map<string, JianyingLutReference>();
	for (const [resourceId, summary] of packages) {
		for (const { renderer, role } of tiledRendererRoles({
			packageSummary: summary,
		})) {
			const lutId = createTiledLutId({ resourceId, renderer });
			references.set(lutId, {
				lutId,
				resourceId,
				version: renderer.version,
				fileName: renderer.relativePath.split("/").slice(-1)[0] ?? "filter.png",
				filePath: resolveTiledLutPath({ cacheRoot, renderer }),
				role,
				size: renderer.cubeSize,
			});
		}
	}
	return references;
}

function referencesByVersion({
	references,
}: {
	references: JianyingLutReference[];
}): Map<string, JianyingLutReference[]> {
	const grouped = new Map<string, JianyingLutReference[]>();
	for (const reference of references) {
		const versionReferences = grouped.get(reference.version) ?? [];
		versionReferences.push(reference);
		grouped.set(reference.version, versionReferences);
	}
	return grouped;
}

function referenceGroupScore({
	references,
}: {
	references: JianyingLutReference[];
}): number {
	const roles = new Set(references.map(({ role }) => role));
	if (roles.has("background") && roles.has("skin")) return 3;
	if (roles.has("single")) return 2;
	return 1;
}

function selectedReferences({
	filter,
	references,
}: {
	filter: JianyingKnownFilter;
	references: JianyingLutReference[];
}): { version?: string; references: JianyingLutReference[]; exact: boolean } {
	const grouped = referencesByVersion({ references });
	if (filter.version && grouped.has(filter.version)) {
		return {
			version: filter.version,
			references: grouped.get(filter.version) ?? [],
			exact: true,
		};
	}
	const candidates = [...grouped.entries()].sort(
		([leftVersion, left], [rightVersion, right]) =>
			referenceGroupScore({ references: right }) -
				referenceGroupScore({ references: left }) ||
			rightVersion.localeCompare(leftVersion)
	);
	const selected = candidates[0];
	if (!selected) {
		return { version: filter.version, references: [], exact: true };
	}
	return {
		version: filter.version ?? selected[0],
		references: selected[1],
		exact: !filter.version,
	};
}

function summarizeLut({
	reference,
	filter,
}: {
	reference: JianyingLutReference;
	filter: JianyingKnownFilter;
}): JianyingFilterLabLutSummary {
	return {
		lutId: reference.lutId,
		resourceId: reference.resourceId,
		version: reference.version,
		fileName: reference.fileName,
		role: reference.role,
		size: reference.size,
		title: filter.title,
		categories: filter.categories,
	};
}

function implementationFromLuts({
	luts,
	fallback,
}: {
	luts: JianyingFilterLabLutSummary[];
	fallback: JianyingFilterPackageSummary["implementation"];
}) {
	const roles = new Set(luts.map(({ role }) => role));
	if (roles.has("background") && roles.has("skin")) return "dual-lut" as const;
	if (roles.has("single")) return "single-lut" as const;
	return fallback;
}

function isSingleLutAvailable({
	luts,
	exactVersion,
	cacheStatus,
}: {
	luts: JianyingFilterLabLutSummary[];
	exactVersion: boolean;
	cacheStatus: JianyingFilterPackageSummary["cacheStatus"];
}): boolean {
	return (
		exactVersion &&
		cacheStatus === "cached" &&
		luts.length === 1 &&
		luts[0]?.role === "single"
	);
}

function isDualLutAvailable({
	luts,
	exactVersion,
	cacheStatus,
}: {
	luts: JianyingFilterLabLutSummary[];
	exactVersion: boolean;
	cacheStatus: JianyingFilterPackageSummary["cacheStatus"];
}): boolean {
	const roles = new Set(luts.map(({ role }) => role));
	return (
		exactVersion &&
		cacheStatus === "cached" &&
		roles.has("background") &&
		roles.has("skin")
	);
}

function summarizeTiledRenderers({
	filter,
	packageSummary,
}: {
	filter: JianyingKnownFilter;
	packageSummary: JianyingFilterPackageSummary;
}): JianyingFilterLabLutSummary[] {
	return tiledRendererRoles({ packageSummary })
		.filter(
			({ renderer }) => !filter.version || renderer.version === filter.version
		)
		.map(({ renderer, role }) => ({
			lutId: createTiledLutId({ resourceId: filter.resourceId, renderer }),
			resourceId: filter.resourceId,
			version: renderer.version,
			fileName: renderer.relativePath.split("/").slice(-1)[0] ?? "filter.png",
			role,
			size: renderer.cubeSize,
			title: filter.title,
			categories: filter.categories,
		}));
}

function summarizeMultiPassRenderer({
	filter,
	packageSummary,
}: {
	filter: JianyingKnownFilter;
	packageSummary: JianyingFilterPackageSummary;
}) {
	const renderer = packageSummary.multiPassRenderer;
	if (!renderer || (filter.version && renderer.version !== filter.version)) {
		return;
	}
	return {
		kind: renderer.kind,
		passCount: renderer.passCount,
		fidelity: renderer.fidelity,
	} as const;
}

function verificationForFilter({
	resourceId,
	version,
	implementation,
	verifications,
}: {
	resourceId: string;
	version?: string;
	implementation: JianyingFilterLabFilterSummary["implementation"];
	verifications: ReadonlyMap<string, JianyingFilterVerificationCandidates>;
}): JianyingFilterVerification {
	return selectVerificationForCard({
		candidates: verifications.get(resourceId),
		version,
		implementation,
	});
}

function categorySummaries({
	order,
	filters,
}: {
	order: string[];
	filters: JianyingFilterLabFilterSummary[];
}): JianyingFilterLabCategorySummary[] {
	return order.map((name) => {
		const members = filters.filter(({ categories }) =>
			categories.includes(name)
		);
		return {
			name,
			total: members.length,
			cached: members.filter(({ cacheStatus }) => cacheStatus !== "uncached")
				.length,
			available: members.filter(({ available }) => available).length,
		};
	});
}

/** Adds cached resources missing from stale metadata without duplicating IDs. */
export function mergeKnownFiltersWithReferences({
	catalog,
	references,
	fallbackTitles = new Map(),
	fallbackCategories = new Map(),
}: {
	catalog: JianyingFilterKnownCatalog;
	references: JianyingLutReference[];
	fallbackTitles?: ReadonlyMap<string, string>;
	fallbackCategories?: ReadonlyMap<string, string[]>;
}): JianyingFilterKnownCatalog {
	const filters = [...catalog.filters];
	const knownIds = new Set(filters.map(({ resourceId }) => resourceId));
	for (const reference of references) {
		if (knownIds.has(reference.resourceId)) continue;
		knownIds.add(reference.resourceId);
		filters.push({
			resourceId: reference.resourceId,
			title:
				fallbackTitles.get(reference.resourceId) ??
				`滤镜 ${reference.resourceId.slice(-6)}`,
			categories: fallbackCategories.get(reference.resourceId) ?? [],
			version: reference.version,
		});
	}
	return { order: catalog.order, filters };
}

/** Builds the renderer-facing catalog with exactly one row per filter card. */
export function buildJianyingFilterLabCatalog({
	catalog,
	references,
	packages,
	verifications = new Map(),
}: {
	catalog: JianyingFilterKnownCatalog;
	references: JianyingLutReference[];
	packages: ReadonlyMap<string, JianyingFilterPackageSummary>;
	verifications?: ReadonlyMap<string, JianyingFilterVerificationCandidates>;
}): JianyingFilterLabListResult {
	const referencesByResource = new Map<string, JianyingLutReference[]>();
	for (const reference of references) {
		const grouped = referencesByResource.get(reference.resourceId) ?? [];
		grouped.push(reference);
		referencesByResource.set(reference.resourceId, grouped);
	}
	const filters = catalog.filters.map((filter) => {
		const selected = selectedReferences({
			filter,
			references: referencesByResource.get(filter.resourceId) ?? [],
		});
		const referenceLuts = selected.references
			.map((reference) => summarizeLut({ reference, filter }))
			.sort((left, right) => left.role.localeCompare(right.role));
		const packageSummary = packages.get(filter.resourceId) ?? {
			cacheStatus: "uncached" as const,
			implementation: "unknown" as const,
			versions: [],
			hasThumbnail: false,
			issues: [],
		};
		const tiledLuts = summarizeTiledRenderers({ filter, packageSummary });
		const multiPassRenderer = summarizeMultiPassRenderer({
			filter,
			packageSummary,
		});
		const luts = [...referenceLuts, ...tiledLuts];
		const implementation =
			packageSummary.renderer || packageSummary.multiPassRenderer
				? ("shader" as const)
				: implementationFromLuts({
						luts,
						fallback: packageSummary.implementation,
					});
		const availabilityInput = {
			luts,
			exactVersion: selected.exact,
			cacheStatus: packageSummary.cacheStatus,
		};
		const available =
			(implementation === "single-lut" &&
				isSingleLutAvailable(availabilityInput)) ||
			(implementation === "dual-lut" &&
				isDualLutAvailable(availabilityInput)) ||
			(implementation === "shader" &&
				packageSummary.cacheStatus === "cached" &&
				Boolean(packageSummary.renderer || multiPassRenderer));
		const version =
			selected.version ??
			tiledLuts[0]?.version ??
			packageSummary.multiPassRenderer?.version;
		return {
			resourceId: filter.resourceId,
			title: filter.title,
			categories: filter.categories,
			...(version ? { version } : {}),
			cacheStatus:
				selected.exact || packageSummary.cacheStatus === "uncached"
					? packageSummary.cacheStatus
					: "partial",
			implementation,
			available,
			hasThumbnail: packageSummary.hasThumbnail || Boolean(filter.thumbnailUrl),
			verification: verificationForFilter({
				resourceId: filter.resourceId,
				version,
				implementation,
				verifications,
			}),
			luts,
			...(multiPassRenderer ? { renderer: multiPassRenderer } : {}),
		} satisfies JianyingFilterLabFilterSummary;
	});
	return {
		count: filters.length,
		cachedCount: filters.filter(({ cacheStatus }) => cacheStatus !== "uncached")
			.length,
		availableCount: filters.filter(({ available }) => available).length,
		filters,
		categories: categorySummaries({ order: catalog.order, filters }),
	};
}
