import type {
	LocalStickerCatalog,
	LocalStickerCategory,
	LocalStickerReference,
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
	id,
	mimeType = "image/gif",
}: {
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
		asset: {
			kind: "supabase-storage",
			objectKey: `jianying/2026-07-31/assets/${id}.${extension}`,
			byteSize: 4,
			checksumSha256:
				"9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
		},
	};
}

export function createRemoteStickerCatalog(): RemoteStickerCatalog {
	return {
		version: 2,
		catalogId: "jianying-2026-07-31",
		categories: [
			{
				id: "popular",
				label: "热门",
				sourcePanel: "贴纸库 / 热门",
				items: [
					createRemoteStickerReference({ id: "popular-1" }),
					createRemoteStickerReference({
						id: "popular-2",
						mimeType: "image/png",
					}),
				],
			},
		],
	};
}
