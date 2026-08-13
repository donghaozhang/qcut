import {
	getDefaultJianyingFlowerDatabaseRoot,
	resolveJianyingFlowerResourceMetadata,
	type JianyingFlowerResourceMetadata,
} from "../../electron/jianying-flower-resource-metadata.js";
import {
	resolveJianyingTextPackageOwnership,
	type JianyingTextPackageOwnership,
	type JianyingTextPackageOwnershipKind,
	type JianyingTextPackageOwnershipMatch,
} from "../../electron/jianying-text-package-ownership.js";
import { isDiscoverableJianyingTextCatalogEntry } from "../../electron/jianying-text-style-discovery.js";
import {
	buildJianyingTextStyleCatalog,
	type JianyingTextStyleCatalog,
} from "../../electron/jianying-text-style-lab-catalog.js";
import type { JianyingTextStylePackageKind } from "../../electron/jianying-text-style-lab-contract.js";

const PACKAGE_KINDS = [
	"TextStyle",
	"InfoSticker",
	"ScriptInfoSticker",
	"AmazingFeature",
	"unknown",
] as const satisfies readonly JianyingTextStylePackageKind[];

const OWNERSHIP_KINDS = [
	"flower",
	"non-flower",
	"component",
	"ambiguous",
	"unclassified",
] as const satisfies readonly JianyingTextPackageOwnershipKind[];

const OWNERSHIP_MATCHES = [
	"exact",
	"resource-lineage",
	"catalog-dependency",
	"project-selection",
	"package-dependency",
	"package-structure",
	"none",
] as const satisfies readonly JianyingTextPackageOwnershipMatch[];

interface JianyingTextCacheAuditKindSummary {
	total: number;
	discoverable: number;
	excluded: number;
	flowerCatalogMatches: number;
	ownership: Record<JianyingTextPackageOwnershipKind, number>;
}

export interface JianyingTextCacheAuditReport {
	schemaVersion: 1;
	generatedAt: string;
	catalog: {
		scannedPackageCount: number;
		recognizedPackageCount: number;
		skippedPackageCount: number;
		invalidPackageCount: number;
		discoverableCardCount: number;
	};
	packageKinds: Record<
		JianyingTextStylePackageKind,
		JianyingTextCacheAuditKindSummary
	>;
	ownershipMatches: Record<JianyingTextPackageOwnershipMatch, number>;
	dependencyTypes: Record<string, number>;
	unresolved: Array<{
		styleId: string;
		packageKind: JianyingTextStylePackageKind;
	}>;
	ambiguous: Array<{
		styleId: string;
		packageKind: JianyingTextStylePackageKind;
	}>;
}

function emptyOwnershipCounts() {
	return Object.fromEntries(OWNERSHIP_KINDS.map((kind) => [kind, 0])) as Record<
		JianyingTextPackageOwnershipKind,
		number
	>;
}

function emptyKindSummaries() {
	return Object.fromEntries(
		PACKAGE_KINDS.map((kind) => [
			kind,
			{
				total: 0,
				discoverable: 0,
				excluded: 0,
				flowerCatalogMatches: 0,
				ownership: emptyOwnershipCounts(),
			},
		])
	) as Record<JianyingTextStylePackageKind, JianyingTextCacheAuditKindSummary>;
}

function emptyOwnershipMatchCounts() {
	return Object.fromEntries(
		OWNERSHIP_MATCHES.map((match) => [match, 0])
	) as Record<JianyingTextPackageOwnershipMatch, number>;
}

export function createJianyingTextCacheAuditReport({
	catalog,
	generatedAt,
	metadata,
	ownership,
}: {
	catalog: JianyingTextStyleCatalog;
	generatedAt: string;
	metadata: ReadonlyMap<string, JianyingFlowerResourceMetadata>;
	ownership: ReadonlyMap<string, JianyingTextPackageOwnership>;
}): JianyingTextCacheAuditReport {
	const packageKinds = emptyKindSummaries();
	const ownershipMatches = emptyOwnershipMatchCounts();
	const dependencyTypes: Record<string, number> = {};
	const unresolved: JianyingTextCacheAuditReport["unresolved"] = [];
	const ambiguous: JianyingTextCacheAuditReport["ambiguous"] = [];
	let discoverableCardCount = 0;

	for (const entry of catalog.entries) {
		const summary = packageKinds[entry.packageKind];
		summary.total += 1;
		if (metadata.has(entry.styleId)) summary.flowerCatalogMatches += 1;
		const packageOwnership = ownership.get(entry.styleId);
		if (packageOwnership) {
			summary.ownership[packageOwnership.kind] += 1;
			ownershipMatches[packageOwnership.match] += 1;
			for (const type of packageOwnership.dependencyTypes ?? []) {
				dependencyTypes[type] = (dependencyTypes[type] ?? 0) + 1;
			}
			if (packageOwnership.kind === "unclassified") {
				unresolved.push({
					styleId: entry.styleId,
					packageKind: entry.packageKind,
				});
			}
			if (packageOwnership.kind === "ambiguous") {
				ambiguous.push({
					styleId: entry.styleId,
					packageKind: entry.packageKind,
				});
			}
		}
		const discoverable = isDiscoverableJianyingTextCatalogEntry({
			entry,
			metadata,
			ownership,
		});
		if (discoverable) {
			summary.discoverable += 1;
			discoverableCardCount += 1;
		} else {
			summary.excluded += 1;
		}
	}

	const skippedPackageCount = Math.max(
		0,
		catalog.packageCount - catalog.entries.length - catalog.invalidPackageCount
	);
	return {
		schemaVersion: 1,
		generatedAt,
		catalog: {
			scannedPackageCount: catalog.packageCount,
			recognizedPackageCount: catalog.entries.length,
			skippedPackageCount,
			invalidPackageCount: catalog.invalidPackageCount,
			discoverableCardCount,
		},
		packageKinds,
		ownershipMatches,
		dependencyTypes,
		unresolved: unresolved.sort((left, right) =>
			left.styleId.localeCompare(right.styleId)
		),
		ambiguous: ambiguous.sort((left, right) =>
			left.styleId.localeCompare(right.styleId)
		),
	};
}

export async function runJianyingTextCacheAudit({
	databaseRoot = getDefaultJianyingFlowerDatabaseRoot(),
	generatedAt = new Date().toISOString(),
	packageRoot,
}: {
	databaseRoot?: string;
	generatedAt?: string;
	packageRoot?: string;
} = {}) {
	const catalog = await buildJianyingTextStyleCatalog(
		packageRoot ? { root: packageRoot } : undefined
	);
	const metadata = await resolveJianyingFlowerResourceMetadata({
		databaseRoot,
		references: catalog.entries,
	});
	const ownershipReferences = catalog.entries.filter(
		({ packageKind, styleId }) =>
			!metadata.has(styleId) &&
			(packageKind === "AmazingFeature" || packageKind === "InfoSticker")
	);
	const ownership = await resolveJianyingTextPackageOwnership({
		databaseRoot,
		references: ownershipReferences,
		...(packageRoot ? { packageRoot } : {}),
	});
	return createJianyingTextCacheAuditReport({
		catalog,
		generatedAt,
		metadata,
		ownership,
	});
}
