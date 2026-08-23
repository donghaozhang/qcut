import { buildJianyingTextAnimationCatalog } from "./jianying-text-animation-lab-catalog.js";
import { resolveJianyingFlowerCatalogMetadata } from "./jianying-flower-resource-metadata.js";
import { ensureQCutJianyingTextPrivateArchive } from "./jianying-text-private-archive.js";
import { resolveJianyingTextPackageOwnership } from "./jianying-text-package-ownership.js";
import { isDiscoverableJianyingTextCatalogEntry } from "./jianying-text-style-discovery.js";
import { buildJianyingTextStyleCatalog } from "./jianying-text-style-lab-catalog.js";
import type {
	JianyingTextAnimationLabListResult,
	JianyingTextStyleLabListResult,
} from "./jianying-text-style-lab-contract.js";
import {
	compareStyleSummaries,
	normalizeResolvedMetadata,
	summarizeCategories,
	summarizeCategoryGroups,
	summarizeEntry,
} from "./jianying-text-style-lab-summary.js";

export interface QCutJianyingTextLabCatalog {
	styles: JianyingTextStyleLabListResult;
	animations: JianyingTextAnimationLabListResult;
}

export async function buildQCutJianyingTextLabCatalog(): Promise<QCutJianyingTextLabCatalog> {
	const archive = await ensureQCutJianyingTextPrivateArchive();
	const [catalog, animations] = await Promise.all([
		buildJianyingTextStyleCatalog({ root: archive.packageRoot }),
		buildJianyingTextAnimationCatalog({
			cacheRoot: archive.cacheRoot,
			databaseRoot: archive.databaseRoot,
		}),
	]);
	const resolvedMetadata = normalizeResolvedMetadata({
		resolved: await resolveJianyingFlowerCatalogMetadata({
			references: catalog.entries,
			databaseRoot: archive.databaseRoot,
		}),
	});
	const { categories, categoryGroups, metadata } = resolvedMetadata;
	const ownershipCandidates = catalog.entries.filter(
		({ packageKind, styleId }) =>
			!metadata.has(styleId) &&
			(packageKind === "AmazingFeature" || packageKind === "InfoSticker")
	);
	const ownership =
		ownershipCandidates.length > 0
			? await resolveJianyingTextPackageOwnership({
					references: ownershipCandidates,
					databaseRoot: archive.databaseRoot,
					packageRoot: archive.packageRoot,
					projectRoot: archive.projectEvidenceRoot,
				})
			: new Map();
	const entries = catalog.entries.filter((entry) =>
		isDiscoverableJianyingTextCatalogEntry({ entry, metadata, ownership })
	);
	const styles = entries
		.map((entry) => summarizeEntry({ entry, metadata, ownership }))
		.sort((left, right) => compareStyleSummaries({ left, right }));
	return {
		styles: {
			count: styles.length,
			styles,
			categories: summarizeCategories({ categories, styles }),
			categoryGroups: summarizeCategoryGroups({
				groups: categoryGroups,
				styles,
			}),
			packageCount: catalog.packageCount,
			invalidPackageCount: catalog.invalidPackageCount,
		},
		animations,
	};
}
