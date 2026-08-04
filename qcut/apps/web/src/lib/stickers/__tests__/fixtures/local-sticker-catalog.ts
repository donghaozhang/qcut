import {
	DEFAULT_PRIVATE_STICKER_CATALOG_ID,
	getPrivateStickerCatalogDefinition,
	PRIVATE_STICKER_CATALOG_IDS,
	type PrivateStickerCatalogId,
} from "@qcut/editor-core/sticker-lab";
import type {
	LocalStickerCatalog,
	LocalStickerCategory,
	LocalStickerReference,
	PrivateStickerCatalog,
	PrivateStickerReference,
	RemoteStickerCatalog,
	RemoteStickerReference,
} from "../../local-sticker-manifest";

export function createLocalStickerReference({
	id,
	isAnimated = true,
}: {
	id: string;
	isAnimated?: boolean;
}): LocalStickerReference {
	return {
		id,
		displayName: `贴纸 ${id}`,
		fileName: `${id}.png`,
		filePath: `/tmp/sticker-lab/${id}.png`,
		mimeType: "image/png",
		sourceKind: isAnimated ? "atlas-animation" : "static-image",
		playback: isAnimated
			? {
					kind: "animated",
					frameCount: 4,
					frameRate: 5,
					cycleDuration: 0.8,
					loop: true,
				}
			: { kind: "static" },
	};
}

export function createLocalStickerCategory({
	id,
	itemCount = 4,
	label,
}: {
	id: string;
	itemCount?: number;
	label: string;
}): LocalStickerCategory {
	return {
		id,
		label,
		sourcePanel: `贴纸库 / ${label}`,
		items: Array.from({ length: itemCount }, (_, index) =>
			createLocalStickerReference({
				id: `${id}-${index + 1}`,
				isAnimated: index !== itemCount - 1,
			})
		),
	};
}

export function createLocalStickerCatalog(): LocalStickerCatalog {
	return {
		version: 1,
		categories: [
			createLocalStickerCategory({ id: "popular", label: "热门" }),
			createLocalStickerCategory({ id: "mood", label: "情绪", itemCount: 5 }),
		],
	};
}

export function createRemoteStickerReference({
	checksumSha256 = "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
	id,
	mimeType = "image/gif",
}: {
	checksumSha256?: string;
	id: string;
	mimeType?: "image/gif" | "image/png";
}): RemoteStickerReference {
	const extension = mimeType === "image/gif" ? "gif" : "png";
	const isAnimated = mimeType === "image/gif";
	return {
		id,
		displayName: `贴纸 ${id}`,
		fileName: `${id}.${extension}`,
		mimeType,
		sourceKind: isAnimated ? "preview-gif" : "static-image",
		playback: isAnimated
			? {
					kind: "animated",
					frameCount: 12,
					frameRate: 12,
					cycleDuration: 1,
					loop: true,
				}
			: { kind: "static" },
		sourceAsset: {
			collection: "qcut-original",
			id: `qcut-original:${id}`,
			path: `apps/web/public/stickers/qcut-original/capybara/${id}.svg`,
			checksumSha256,
		},
		asset: {
			kind: "supabase-storage",
			objectKey: `catalogs/qcut-original-test/assets/${id}.${extension}`,
			byteSize: 4,
			checksumSha256,
		},
	};
}

export function createPrivateStickerReference({
	catalogId = DEFAULT_PRIVATE_STICKER_CATALOG_ID,
	checksumSha256,
	numericId,
}: {
	catalogId?: PrivateStickerCatalogId;
	checksumSha256?: string;
	numericId: string;
}): PrivateStickerReference {
	const catalogDefinition = getPrivateStickerCatalogDefinition({ catalogId });
	if (!catalogDefinition) throw new Error(`Unknown test catalog: ${catalogId}`);
	return {
		id: numericId,
		displayName: `参照贴纸 ${numericId}`,
		fileName: `${numericId}-参照.gif`,
		mimeType: "image/gif",
		sourceKind: "preview-gif",
		playback: {
			kind: "animated",
			frameCount: 8,
			frameRate: 5,
			cycleDuration: 1.6,
			loop: true,
		},
		asset: {
			kind: "supabase-storage",
			objectKey: `${catalogDefinition.assetObjectPrefix}${numericId}.gif`,
			byteSize: 4,
			checksumSha256: checksumSha256 ?? numericId.padStart(64, "0"),
		},
	};
}

const PRIVATE_CATALOG_NUMERIC_IDS: Record<
	PrivateStickerCatalogId,
	readonly string[]
> = {
	"jianying-2026-07-31": [
		"7437023238108105995",
		"6911930254453984525",
		"7437023238108105996",
		"6911930254453984526",
	],
	"jianying-2026-08-01-batch-2": [
		"7576165100781079870",
		"7576165100781079871",
		"7576165100781079872",
		"7576165100781079873",
	],
	"jianying-2026-08-01-batch-3": [
		"7613240652788239678",
		"7613240652788239679",
		"7613240652788239680",
		"7613240652788239681",
	],
};

export function createPrivateStickerCatalog({
	catalogId = DEFAULT_PRIVATE_STICKER_CATALOG_ID,
	itemCount = 2,
}: {
	catalogId?: PrivateStickerCatalogId;
	itemCount?: number;
} = {}): PrivateStickerCatalog {
	const numericIds = PRIVATE_CATALOG_NUMERIC_IDS[catalogId];
	if (itemCount > numericIds.length) {
		throw new Error(
			`Private sticker fixture supports at most ${numericIds.length}`
		);
	}
	return {
		version: 2,
		catalogId,
		categories: [
			{
				id: "hot",
				label: "热门",
				sourcePanel: "剪映贴纸面板 / 热门",
				items: numericIds
					.slice(0, itemCount)
					.map((numericId) =>
						createPrivateStickerReference({ catalogId, numericId })
					),
			},
		],
	};
}

export function createPrivateStickerCatalogs({
	itemCount = 2,
}: {
	itemCount?: number;
} = {}): PrivateStickerCatalog[] {
	return PRIVATE_STICKER_CATALOG_IDS.map((catalogId) =>
		createPrivateStickerCatalog({ catalogId, itemCount })
	);
}

export function createRemoteStickerCatalog(): RemoteStickerCatalog {
	return {
		version: 2,
		catalogId: "qcut-original-test",
		provenance: {
			creator: "QCut",
			license: {
				name: "MIT",
				commercialUse: "allowed",
				attributionRequired: false,
				licenseFile: "LICENSE",
			},
			sourceCollections: ["qcut-original"],
			sourceTreeGitOid: "1ae49f649f9e3950609f874085048669e0f76232",
			transformation: "Rasterized QCut-authored SVG assets to PNG",
		},
		categories: [
			{
				id: "popular",
				label: "热门",
				sourcePanel: "贴纸库 / 热门",
				items: [
					createRemoteStickerReference({ id: "popular-1" }),
					createRemoteStickerReference({
						checksumSha256:
							"af64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
						id: "popular-2",
						mimeType: "image/png",
					}),
				],
			},
		],
	};
}
