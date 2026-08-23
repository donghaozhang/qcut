import { buildJianyingTextAnimationCatalog } from "./jianying-text-animation-lab-catalog.js";
import { resolveJianyingFlowerCatalogMetadata } from "./jianying-flower-resource-metadata.js";
import { ensureQCutJianyingTextPrivateArchive } from "./jianying-text-private-archive.js";
import { resolveJianyingTextPackageOwnership } from "./jianying-text-package-ownership.js";
import { isDiscoverableJianyingTextCatalogEntry } from "./jianying-text-style-discovery.js";
import {
	attachJianyingTextStyleCoverUrls,
	resolveJianyingTextStyleCoverUrls,
} from "./jianying-text-style-cover-metadata.js";
import { classifyLocalJianyingTextStyles } from "./jianying-text-style-local-categories.js";
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
	const ownershipCandidates = catalog.entries.filter(
		({ styleId }) => !resolvedMetadata.metadata.has(styleId)
	);
	const [ownership, coverUrls] = await Promise.all([
		ownershipCandidates.length > 0
			? resolveJianyingTextPackageOwnership({
					references: ownershipCandidates,
					databaseRoot: archive.databaseRoot,
					packageRoot: archive.packageRoot,
					projectRoot: archive.projectEvidenceRoot,
				})
			: Promise.resolve(new Map()),
		resolveJianyingTextStyleCoverUrls({
			references: catalog.entries.filter(({ hasCover }) => !hasCover),
			databaseRoot: archive.databaseRoot,
		}),
	]);
	const entries = catalog.entries.filter((entry) =>
		isDiscoverableJianyingTextCatalogEntry({
			entry,
			metadata: resolvedMetadata.metadata,
			ownership,
		})
	);
	const classifiedMetadata = classifyLocalJianyingTextStyles({
		entries,
		ownership,
		resolvedMetadata,
	});
	const metadata = attachJianyingTextStyleCoverUrls({
		coverUrls,
		metadata: classifiedMetadata.metadata,
	});
	const { categories, categoryGroups } = classifiedMetadata;
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
