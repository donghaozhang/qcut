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
	TEXT_TEMPLATE_DEFINITIONS,
	TEXT_TEMPLATES,
} from "@/lib/text/text-template-registry";
import { transitionPresets } from "@/components/editor/media-panel/views/transitions/transition-presets";
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
	return TEXT_TEMPLATE_DEFINITIONS.map((definition) => ({
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: definition.id,
		kind: "text-template",
		version: 1,
		name: definition.name,
		category: definition.category,
		tags: uniqueTags({
			tags: [definition.category, definition.stylePresetId, "text"],
		}),
		delivery: "generated",
		files: [],
		license: QCUT_BUILT_IN_LICENSE,
		metadata: {
			stylePresetId: definition.stylePresetId,
			template: templatesById.get(definition.id),
		},
	}));
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

function transitionAssets(): AssetManifestEntry[] {
	return transitionPresets.map((preset) => ({
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: preset.id,
		kind: "transition",
		version: preset.version,
		name: preset.name,
		localizedNames: { "zh-CN": preset.localizedName },
		category: preset.category,
		tags: uniqueTags({ tags: preset.tags }),
		delivery: "generated",
		files: [],
		license: QCUT_BUILT_IN_LICENSE,
		metadata: {
			clipType: preset.clipType,
			direction: preset.direction,
			tuning: preset.tuning,
			defaultDuration: preset.defaultDuration,
		},
	}));
}

export function createIconifyStickerAssetEntry({
	collection,
	icon,
}: {
	collection: IconSet;
	icon: string;
}): AssetManifestEntry {
	const animated = collection.category === "Motion";
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: `${collection.prefix}:${icon}`,
		kind: "sticker",
		version: 1,
		name: icon
			.split("-")
			.map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
			.join(" "),
		category: animated
			? "motion"
			: collection.category === "Brands"
				? "brands"
				: "essentials",
		tags: uniqueTags({
			tags: [
				collection.name,
				collection.category ?? "icons",
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

export function resolveIconifyStickerAssetEntry({
	collectionPrefix,
	icon,
}: {
	collectionPrefix: string;
	icon: string;
}): AssetManifestEntry {
	const collection = POPULAR_COLLECTIONS.find(
		(candidate) => candidate.prefix === collectionPrefix
	) ?? {
		prefix: collectionPrefix,
		name: collectionPrefix,
		total: 0,
		category: "Community",
	};
	return createIconifyStickerAssetEntry({ collection, icon });
}

function stickerAssets(): AssetManifestEntry[] {
	return POPULAR_COLLECTIONS.flatMap((collection) =>
		(collection.samples ?? []).map((icon) =>
			createIconifyStickerAssetEntry({ collection, icon })
		)
	);
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
