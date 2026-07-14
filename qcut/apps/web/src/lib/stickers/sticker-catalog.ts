import {
	CHARACTER_STICKER_PACKS,
	type CharacterStickerPose,
} from "./sticker-character-packs";
import {
	STICKER_CATEGORIES,
	type FluentStickerCategoryId,
	type StickerCategoryId,
} from "./sticker-categories";
import {
	FLUENT_STICKER_SETS,
	type FluentStickerDefinition,
} from "./sticker-fluent-definitions";

export { STICKER_CATEGORIES } from "./sticker-categories";
export type { StickerCategoryId } from "./sticker-categories";

export const STICKER_CATEGORY_MINIMUM_SIZE = 10;

export type StickerAssetSource =
	| { kind: "bundled"; mimeType: "image/svg+xml"; url: string }
	| { kind: "iconify" };

export interface StickerCatalogItem {
	id: string;
	category: StickerCategoryId;
	collection: string;
	icon: string;
	name: string;
	localizedName: string;
	tags: string[];
	packId?: string;
	source: StickerAssetSource;
	animated: boolean;
}

function createFluentSticker({
	category,
	definition,
}: {
	category: FluentStickerCategoryId;
	definition: FluentStickerDefinition;
}): StickerCatalogItem {
	const categoryDefinition = STICKER_CATEGORIES.find(
		(candidate) => candidate.id === category
	);
	return {
		...definition,
		id: `fluent-emoji:${definition.icon}`,
		category,
		collection: "fluent-emoji",
		tags: [
			categoryDefinition?.label ?? category,
			categoryDefinition?.localizedLabel ?? category,
			...definition.icon.split("-"),
		],
		source: { kind: "iconify" },
		animated: false,
	};
}

function characterStickerUrl({
	packId,
	poseId,
}: {
	packId: string;
	poseId: string;
}): string {
	return `${import.meta.env.BASE_URL}stickers/qcut-original/${packId}/${poseId}.svg`;
}

function createCharacterSticker({
	pack,
	pose,
}: {
	pack: (typeof CHARACTER_STICKER_PACKS)[number];
	pose: CharacterStickerPose;
}): StickerCatalogItem {
	const icon = `${pack.id}-${pose.id}`;
	return {
		id: `qcut-original:${icon}`,
		category: pack.id,
		collection: "qcut-original",
		icon,
		name: `${pack.name} ${pose.name}`,
		localizedName: `${pack.localizedName}·${pose.localizedName}`,
		tags: [
			pack.name,
			pack.localizedName,
			pose.name,
			pose.localizedName,
			...pose.tags,
		],
		packId: pack.id,
		source: {
			kind: "bundled",
			mimeType: "image/svg+xml",
			url: characterStickerUrl({ packId: pack.id, poseId: pose.id }),
		},
		animated: false,
	};
}

const FLUENT_STICKERS = Object.entries(FLUENT_STICKER_SETS).flatMap(
	([category, definitions]) =>
		definitions.map((definition) =>
			createFluentSticker({
				category: category as FluentStickerCategoryId,
				definition,
			})
		)
);

const CHARACTER_STICKERS = CHARACTER_STICKER_PACKS.flatMap((pack) =>
	pack.poses.map((pose) => createCharacterSticker({ pack, pose }))
);

export const CURATED_STICKERS: StickerCatalogItem[] = [
	...FLUENT_STICKERS,
	...CHARACTER_STICKERS,
];

export function getStickerCategoryItems({
	category,
}: {
	category: StickerCategoryId;
}): StickerCatalogItem[] {
	return CURATED_STICKERS.filter((sticker) => sticker.category === category);
}

export function findStickerCatalogItem({
	collection,
	icon,
}: {
	collection: string;
	icon: string;
}): StickerCatalogItem | undefined {
	return CURATED_STICKERS.find(
		(sticker) => sticker.collection === collection && sticker.icon === icon
	);
}

export function searchStickerCatalog({
	query,
}: {
	query: string;
}): StickerCatalogItem[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return CURATED_STICKERS;
	return CURATED_STICKERS.filter((sticker) =>
		[sticker.name, sticker.localizedName, sticker.category, ...sticker.tags]
			.join(" ")
			.toLocaleLowerCase()
			.includes(normalizedQuery)
	);
}
