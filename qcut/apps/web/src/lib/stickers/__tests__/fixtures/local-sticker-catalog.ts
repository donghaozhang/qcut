import type {
	LocalStickerCatalog,
	LocalStickerCategory,
	LocalStickerReference,
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
