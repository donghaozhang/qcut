import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	buildAssetCatalog,
	type AssetLicense,
	type AssetManifestEntry,
	type AssetManifestPack,
} from "@qcut/editor-core";
import { CAPTION_STYLE_PRESETS } from "@/lib/captions/workbench";
import { FILTER_PRESETS } from "@/lib/filters/filter-registry";
import type { IconSet } from "@/lib/stickers/iconify-api";
import { POPULAR_COLLECTIONS } from "@/lib/stickers/iconify-api";
import {
	CURATED_STICKERS,
	findStickerCatalogItem,
	type StickerCatalogItem,
} from "@/lib/stickers/sticker-catalog";
import {
	MOTION_STICKERS,
	findMotionSticker,
	type MotionStickerDefinition,
} from "@/lib/stickers/sticker-motion-packs";
import {
	TEXT_TEMPLATE_DEFINITIONS,
	TEXT_TEMPLATES,
} from "@/lib/text/text-template-registry";
import {
	getTextTemplateResource,
	getTextTemplateResourceFiles,
} from "@/lib/text/text-resource-catalog";
import {
	transitionPresets,
	type TransitionPreset,
} from "@/components/editor/media-panel/views/transitions/transition-presets";
export { createFreesoundAssetEntry } from "./freesound-asset";

export const QCUT_ASSET_MANIFEST_ID = "qcut-creator-library";

const QCUT_BUILT_IN_LICENSE: AssetLicense = {
	name: "QCut built-in asset license",
	commercialUse: "allowed",
	attributionRequired: false,
};

function uniqueTags({ tags }: { tags: readonly string[] }): string[] {
	const normalized = new Set<string>();
	const result: string[] = [];
	for (const tag of tags) {
		const trimmed = tag.trim();
		const key = trimmed.toLocaleLowerCase();
		if (!trimmed || normalized.has(key)) continue;
		normalized.add(key);
		result.push(trimmed);
	}
	return result;
}

function iconifyAssetUrl({
	collection,
	icon,
	size,
}: {
	collection: string;
	icon: string;
	size?: number;
}): string {
	const baseUrl = `https://api.iconify.design/${collection}:${icon}.svg`;
	return size ? `${baseUrl}?width=${size}&height=${size}` : baseUrl;
}

function iconifyLicense({ collection }: { collection: IconSet }): AssetLicense {
	const licenseName = collection.license?.title ?? "Unknown license";
	const author = collection.author?.name ?? collection.name;
	const isPublicDomain = collection.license?.spdx === "CC0-1.0";
	return {
		name: licenseName,
		spdxId: collection.license?.spdx,
		commercialUse: collection.license ? "allowed" : "unknown",
		attributionRequired: !isPublicDomain,
		attributionText: isPublicDomain
			? undefined
			: `${collection.name} by ${author} (${licenseName})`,
		sourceUrl: collection.author?.url ?? collection.license?.url,
	};
}

function filterAssets(): AssetManifestEntry[] {
	return FILTER_PRESETS.map((preset) => ({
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: preset.id,
		kind: "filter",
		version: preset.version,
		name: preset.name,
		localizedNames: { "zh-CN": preset.localizedName },
		category: preset.category,
		tags: uniqueTags({ tags: preset.tags }),
		delivery: "generated",
		files: [{ role: "thumbnail", url: preset.thumbnail }],
		license: QCUT_BUILT_IN_LICENSE,
		metadata: preset,
	}));
}

function textTemplateAssets(): AssetManifestEntry[] {
	const templatesById = new Map(
		TEXT_TEMPLATES.map((template) => [template.id, template])
	);
	return TEXT_TEMPLATE_DEFINITIONS.map((definition) => {
		const resource = getTextTemplateResource({ definition });
		const files = getTextTemplateResourceFiles({ definition });
		return {
			schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
			id: resource.assetId,
			kind: "text-template",
			version: resource.version,
			name: definition.name,
			category: definition.category,
			tags: uniqueTags({
				tags: [
					definition.category,
					definition.stylePresetId,
					definition.groupId,
					resource.packageId,
					resource.entitlement,
					"text",
					...definition.keywords,
				],
			}),
			delivery: definition.downloaded ? "bundled" : "remote",
			files: [
				{
					role: "thumbnail",
					url: files.thumbnailUrl,
					mimeType: "image/webp",
					byteSize: files.thumbnailByteSize,
					checksumSha256: files.thumbnailChecksumSha256,
				},
				{
					role: "source",
					url: files.sourceUrl,
					mimeType: "application/json",
					byteSize: files.sourceByteSize,
					checksumSha256: files.sourceChecksumSha256,
				},
			],
			license: QCUT_BUILT_IN_LICENSE,
			metadata: {
				templateId: definition.id,
				stylePresetId: definition.stylePresetId,
				packageId: resource.packageId,
				cacheKey: resource.cacheKey,
				entitlement: resource.entitlement,
				sizeKb: resource.sizeKb,
				premium: definition.premium,
				template: templatesById.get(definition.id),
			},
		};
	});
}

function captionStyleAssets(): AssetManifestEntry[] {
	return CAPTION_STYLE_PRESETS.map((preset) => ({
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: preset.id,
		kind: "caption-style",
		version: 1,
		name: preset.name,
		category: "captions",
		tags: uniqueTags({
			tags: ["caption", "subtitle", preset.platform, preset.description],
		}),
		delivery: "generated",
		files: [],
		license: QCUT_BUILT_IN_LICENSE,
		metadata: preset,
	}));
}

export function createTransitionAssetEntry({
	preset,
}: {
	preset: TransitionPreset;
}): AssetManifestEntry {
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: preset.id,
		kind: "transition",
		version: preset.version,
		name: preset.name,
		localizedNames: { "zh-CN": preset.localizedName },
		category: preset.category,
		tags: uniqueTags({ tags: preset.tags }),
		delivery: preset.delivery,
		files: [
			{ role: "thumbnail", url: preset.preview.from, mimeType: "image/webp" },
			{ role: "preview", url: preset.preview.to, mimeType: "image/webp" },
		],
		license: QCUT_BUILT_IN_LICENSE,
		metadata: {
			clipType: preset.clipType,
			direction: preset.direction,
			tuning: preset.tuning,
			defaultDuration: preset.defaultDuration,
		},
	};
}

export function resolveTransitionAssetEntry({
	preset,
}: {
	preset: TransitionPreset;
}): AssetManifestEntry {
	return createTransitionAssetEntry({ preset });
}

function transitionAssets(): AssetManifestEntry[] {
	return transitionPresets.map((preset) =>
		createTransitionAssetEntry({ preset })
	);
}

export function createIconifyStickerAssetEntry({
	catalogItem,
	collection,
	icon,
}: {
	catalogItem?: StickerCatalogItem;
	collection: IconSet;
	icon: string;
}): AssetManifestEntry {
	const animated = collection.category === "Motion";
	const generatedName = icon
		.split("-")
		.map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
		.join(" ");
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: `${collection.prefix}:${icon}`,
		kind: "sticker",
		version: 1,
		name: catalogItem?.name ?? generatedName,
		localizedNames: catalogItem
			? { "zh-CN": catalogItem.localizedName }
			: undefined,
		category:
			catalogItem?.category ??
			(animated
				? "motion"
				: collection.category === "Brands"
					? "brands"
					: "essentials"),
		tags: uniqueTags({
			tags: [
				collection.name,
				collection.category ?? "icons",
				...(catalogItem?.tags ?? []),
				...(catalogItem ? [catalogItem.localizedName] : []),
				...(animated ? ["animated", "motion"] : []),
				...icon.split("-"),
			],
		}),
		delivery: "remote",
		files: [
			{
				role: "thumbnail",
				url: iconifyAssetUrl({ collection: collection.prefix, icon, size: 64 }),
				mimeType: "image/svg+xml",
			},
			{
				role: "source",
				url: iconifyAssetUrl({ collection: collection.prefix, icon }),
				mimeType: "image/svg+xml",
			},
		],
		license: iconifyLicense({ collection }),
		metadata: {
			collection: collection.prefix,
			icon,
			animated,
			author: collection.author,
		},
	};
}

export function createBundledStickerAssetEntry({
	catalogItem,
}: {
	catalogItem: StickerCatalogItem;
}): AssetManifestEntry {
	if (catalogItem.source.kind !== "bundled") {
		throw new Error(`Sticker is not bundled: ${catalogItem.id}`);
	}
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: catalogItem.id,
		kind: "sticker",
		version: 1,
		name: catalogItem.name,
		localizedNames: { "zh-CN": catalogItem.localizedName },
		category: catalogItem.category,
		tags: uniqueTags({
			tags: [...catalogItem.tags, catalogItem.localizedName, "qcut-original"],
		}),
		delivery: "bundled",
		files: [
			{
				role: "thumbnail",
				url: catalogItem.source.url,
				mimeType: catalogItem.source.mimeType,
			},
			{
				role: "source",
				url: catalogItem.source.url,
				mimeType: catalogItem.source.mimeType,
			},
		],
		license: QCUT_BUILT_IN_LICENSE,
		metadata: {
			collection: catalogItem.collection,
			icon: catalogItem.icon,
			animated: catalogItem.animated,
			packId: catalogItem.packId,
		},
	};
}

export function createMotionStickerAssetEntry({
	sticker,
}: {
	sticker: MotionStickerDefinition;
}): AssetManifestEntry {
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: sticker.id,
		kind: "sticker",
		version: 1,
		name: sticker.name,
		localizedNames: { "zh-CN": sticker.localizedName },
		category: "motion",
		tags: uniqueTags({
			tags: [...sticker.tags, sticker.localizedName, "animated", "motion"],
		}),
		delivery: "bundled",
		files: [
			{ role: "thumbnail", url: sticker.url, mimeType: "image/png" },
			{ role: "source", url: sticker.url, mimeType: "image/png" },
		],
		license: QCUT_BUILT_IN_LICENSE,
		metadata: {
			collection: sticker.collection,
			icon: sticker.icon,
			animated: true,
			motion: sticker.motion,
		},
	};
}

function stickerCollection({ collectionPrefix }: { collectionPrefix: string }) {
	return (
		POPULAR_COLLECTIONS.find(
			(candidate) => candidate.prefix === collectionPrefix
		) ?? {
			prefix: collectionPrefix,
			name: collectionPrefix,
			total: 0,
			category: "Community",
		}
	);
}

export function resolveStickerAssetEntry({
	collectionPrefix,
	icon,
}: {
	collectionPrefix: string;
	icon: string;
}): AssetManifestEntry {
	const motionSticker = findMotionSticker({
		collection: collectionPrefix,
		icon,
	});
	if (motionSticker)
		return createMotionStickerAssetEntry({ sticker: motionSticker });
	const catalogItem = findStickerCatalogItem({
		collection: collectionPrefix,
		icon,
	});
	if (catalogItem?.source.kind === "bundled") {
		return createBundledStickerAssetEntry({ catalogItem });
	}
	return createIconifyStickerAssetEntry({
		catalogItem,
		collection: stickerCollection({ collectionPrefix }),
		icon,
	});
}

export function resolveIconifyStickerAssetEntry({
	collectionPrefix,
	icon,
}: {
	collectionPrefix: string;
	icon: string;
}): AssetManifestEntry {
	return resolveStickerAssetEntry({ collectionPrefix, icon });
}

function stickerAssets(): AssetManifestEntry[] {
	const assetsById = new Map<string, AssetManifestEntry>();
	for (const collection of POPULAR_COLLECTIONS) {
		for (const icon of collection.samples ?? []) {
			const asset = createIconifyStickerAssetEntry({ collection, icon });
			assetsById.set(asset.id, asset);
		}
	}
	for (const catalogItem of CURATED_STICKERS) {
		const asset =
			catalogItem.source.kind === "bundled"
				? createBundledStickerAssetEntry({ catalogItem })
				: createIconifyStickerAssetEntry({
						catalogItem,
						collection: stickerCollection({
							collectionPrefix: catalogItem.collection,
						}),
						icon: catalogItem.icon,
					});
		assetsById.set(asset.id, asset);
	}
	for (const sticker of MOTION_STICKERS) {
		const asset = createMotionStickerAssetEntry({ sticker });
		assetsById.set(asset.id, asset);
	}
	return [...assetsById.values()];
}

export const QCUT_ASSET_MANIFEST: AssetManifestPack = {
	schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
	id: QCUT_ASSET_MANIFEST_ID,
	version: 1,
	assets: [
		...filterAssets(),
		...textTemplateAssets(),
		...captionStyleAssets(),
		...transitionAssets(),
		...stickerAssets(),
	],
};

export const QCUT_ASSET_CATALOG = buildAssetCatalog({
	manifests: [QCUT_ASSET_MANIFEST],
});
