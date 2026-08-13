import type { JianyingFlowerResourceMetadata } from "./jianying-flower-resource-metadata.js";
import type { JianyingTextPackageOwnership } from "./jianying-text-package-ownership.js";
import type { JianyingTextStyleCatalogEntry } from "./jianying-text-style-lab-catalog.js";

export function isDiscoverableJianyingTextCatalogEntry({
	entry,
	metadata,
	ownership,
}: {
	entry: JianyingTextStyleCatalogEntry;
	metadata: ReadonlyMap<string, JianyingFlowerResourceMetadata>;
	ownership: ReadonlyMap<string, JianyingTextPackageOwnership>;
}) {
	if (metadata.has(entry.styleId)) return true;
	if (
		entry.packageKind === "AmazingFeature" ||
		entry.packageKind === "InfoSticker"
	) {
		return ownership.get(entry.styleId)?.kind === "flower";
	}
	return Boolean(entry.runtimeReference);
}
