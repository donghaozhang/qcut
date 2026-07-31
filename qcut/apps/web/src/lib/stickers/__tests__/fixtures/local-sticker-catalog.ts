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
	checksumSha256 = "b964a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
	numericId,
}: {
	checksumSha256?: string;
	numericId: string;
}): PrivateStickerReference {
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
			objectKey: `jianying/2026-07-31/assets/${numericId}.gif`,
			byteSize: 4,
			checksumSha256,
		},
	};
}

export function createPrivateStickerCatalog(): PrivateStickerCatalog {
	return {
		version: 2,
		catalogId: "jianying-2026-07-31",
		categories: [
			{
				id: "hot",
				label: "热门",
				sourcePanel: "剪映贴纸面板 / 热门",
				items: [
					createPrivateStickerReference({ numericId: "7437023238108105995" }),
					createPrivateStickerReference({
						checksumSha256:
							"c964a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
						numericId: "6911930254453984525",
					}),
				],
			},
		],
	};
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
