import { buildJianyingFontCatalog } from "../../jianying-font-lab-catalog.js";
import { loadTextLabCatalogDefault } from "../cli/text-lab-cli-process.js";
import { exportCatalogDefault } from "../cli/cli-handlers-filter-lab-catalog.js";
import type { ComposeAssetReference } from "./compose-protocol.js";

export async function discoverComposeLabCandidates({
	dependencies = {
		fonts: buildJianyingFontCatalog,
		text: loadTextLabCatalogDefault,
		filters: exportCatalogDefault,
	},
}: {
	dependencies?: {
		fonts: typeof buildJianyingFontCatalog;
		text: typeof loadTextLabCatalogDefault;
		filters: typeof exportCatalogDefault;
	};
} = {}): Promise<{ resources: ComposeAssetReference[]; warnings: string[] }> {
	const warnings: string[] = [];
	const resources: ComposeAssetReference[] = [];
	const results = await Promise.allSettled([
		dependencies.fonts(),
		dependencies.text(),
		dependencies.filters(),
	] as const);
	const [fonts, text, filters] = results;
	const capabilities = {
		preview: true,
		editorApply: true,
		editorExport: true,
		headlessRender: false,
	};
	if (fonts.status === "fulfilled") {
		resources.push(
			...fonts.value.entries.map(
				(font): ComposeAssetReference => ({
					provider: "local",
					assetType: "font",
					assetId: font.fontId,
					displayName: font.fullName,
					tags: [font.familyName, font.subfamilyName],
					availability: "ready",
					license: "unknown",
					capabilities,
				})
			)
		);
	}
	if (text.status === "fulfilled") {
		for (const style of text.value.styles.styles) {
			if (
				style.compatibility === "preview-only" ||
				(!style.runtimeReference && !style.approximation)
			)
				continue;
			resources.push({
				provider: "local",
				assetType:
					style.packageKind === "TextStyle" ? "fancy-word" : "text-template",
				assetId: style.styleId,
				displayName: style.title ?? style.resourceId,
				tags: [...style.categoryIds, style.fillKind, style.compatibility],
				availability: "ready",
				license: "personal-only",
				capabilities: {
					...capabilities,
					requiresLocalRuntime: Boolean(style.runtimeReference),
				},
			});
		}
		resources.push(
			...text.value.animations.animations.map(
				(animation): ComposeAssetReference => ({
					provider: "local",
					assetType: "text-animation",
					assetId: animation.animationId,
					displayName: animation.title ?? animation.resourceId,
					tags: [animation.slot, "requires-runtime-text-template"],
					duration: animation.duration,
					availability: "ready",
					license: "personal-only",
					capabilities: { ...capabilities, requiresLocalRuntime: true },
				})
			)
		);
	}
	if (filters.status === "fulfilled") {
		resources.push(
			...filters.value.cards
				.filter((card) => card.available)
				.map(
					(card): ComposeAssetReference => ({
						provider: "local",
						assetType: "filter",
						assetId: card.resourceId,
						displayName: card.title,
						tags: [...card.categories, card.implementation],
						availability: "ready",
						license: "personal-only",
						capabilities,
						provenance: {
							version: card.version,
							verification: card.verification,
						},
					})
				)
		);
	}
	for (const [index, result] of results.entries()) {
		if (result.status === "rejected")
			warnings.push(
				`Compose ${["Font", "Text", "Filter"][index]} Lab discovery unavailable.`
			);
	}
	return { resources, warnings };
}
