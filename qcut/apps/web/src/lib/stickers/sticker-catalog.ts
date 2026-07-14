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
import {
	THEMED_STICKER_PACKS,
	type ThemedStickerDefinition,
	type ThemedStickerPack,
} from "./sticker-themed-packs";

export { STICKER_CATEGORIES } from "./sticker-categories";
export type { StickerCategoryId } from "./sticker-categories";

export const STICKER_CATEGORY_MINIMUM_SIZE = 10;

const STATIC_CHARACTER_POSE_IDS = new Set([
	"happy",
	"love",
	"wave",
	"cheer",
	"sleepy",
	"surprised",
	"angry",
	"cry",
	"snack",
	"selfie",
]);

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

function escapeSvgText({ value }: { value: string }): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function characterStickerSvg({
	pack,
	pose,
}: {
	pack: (typeof CHARACTER_STICKER_PACKS)[number];
	pose: CharacterStickerPose;
}): string {
	const label = escapeSvgText({ value: pose.message ?? pose.localizedName });
	const labelFontSize = label.length >= 5 ? 34 : 42;
	const earPath =
		pack.species === "rabbit"
			? '<path d="M168 88c-16-56-2-88 28-70 20 12 20 52 4 94M344 88c16-56 2-88-28-70-20 12-20 52-4 94" fill="none" stroke="CURRENT_OUTLINE" stroke-width="18" stroke-linecap="round"/>'
			: '<circle cx="172" cy="104" r="44" fill="CURRENT_BODY" stroke="CURRENT_OUTLINE" stroke-width="14"/><circle cx="340" cy="104" r="44" fill="CURRENT_BODY" stroke="CURRENT_OUTLINE" stroke-width="14"/>';
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${pack.palette.accent}" opacity=".16"/>${earPath.replace(/CURRENT_BODY/g, pack.palette.body).replace(/CURRENT_OUTLINE/g, pack.palette.outline)}<circle cx="256" cy="216" r="128" fill="${pack.palette.body}" stroke="${pack.palette.outline}" stroke-width="16"/><circle cx="212" cy="198" r="13" fill="${pack.palette.outline}"/><circle cx="300" cy="198" r="13" fill="${pack.palette.outline}"/><path d="M228 244c18 18 38 18 56 0" fill="none" stroke="${pack.palette.outline}" stroke-width="12" stroke-linecap="round"/><ellipse cx="180" cy="232" rx="26" ry="15" fill="${pack.palette.inner}" opacity=".72"/><ellipse cx="332" cy="232" rx="26" ry="15" fill="${pack.palette.inner}" opacity=".72"/><rect x="104" y="344" width="304" height="78" rx="39" fill="#fff" stroke="${pack.palette.outline}" stroke-width="10"/><text x="256" y="386" text-anchor="middle" dominant-baseline="middle" font-family="Inter, PingFang SC, Microsoft YaHei, sans-serif" font-size="${labelFontSize}" font-weight="800" fill="${pack.palette.outline}">${label}</text></svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function themedStickerSvg({
	item,
	pack,
}: {
	item: ThemedStickerDefinition;
	pack: ThemedStickerPack;
}): string {
	const label = escapeSvgText({ value: item.localizedName });
	const fontSize = label.length >= 5 ? 40 : 48;
	const styleAttrs = {
		arrow: { rx: 22, path: "M430 128l52 52-52 52v-34H42v-36h388z" },
		burst: {
			rx: 48,
			path: "M256 18l29 56 62-18 7 64 64 7-18 62 56 29-56 29 18 62-64 7-7 64-62-18-29 56-29-56-62 18-7-64-64-7 18-62-56-29 56-29-18-62 64-7 7-64 62 18z",
		},
		caption: { rx: 18, path: "M76 76h360v184H278l-58 56 12-56H76z" },
		frame: { rx: 18, path: "M68 64h376v232H68zM104 100v160h304V100z" },
		label: { rx: 24, path: "M66 96h330l52 80-52 80H66z" },
		note: { rx: 18, path: "M92 62h328v224l-70 70H92zM350 286h70l-70 70z" },
		pill: { rx: 999, path: "M94 86h324a90 90 0 010 180H94a90 90 0 010-180z" },
		progress: { rx: 18, path: "M72 132h368v96H72zM96 156h216v48H96z" },
		speech: { rx: 34, path: "M72 76h368v184H248l-72 62 18-62H72z" },
		stamp: { rx: 12, path: "M82 70h348v222H82zM112 100h288v162H112z" },
	}[item.style];
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="360" viewBox="0 0 512 360"><rect width="512" height="360" rx="52" fill="${pack.palette.background}"/><path d="${styleAttrs.path}" fill="${pack.palette.accent}" stroke="${pack.palette.ink}" stroke-width="8" stroke-linejoin="round"/><rect x="96" y="138" width="320" height="84" rx="${styleAttrs.rx}" fill="${pack.palette.secondary}" opacity=".18"/><text x="256" y="194" text-anchor="middle" dominant-baseline="middle" font-family="Inter, PingFang SC, Microsoft YaHei, sans-serif" font-size="${fontSize}" font-weight="800" fill="${pack.palette.ink}">${label}</text></svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function characterStickerSource({
	pack,
	pose,
}: {
	pack: (typeof CHARACTER_STICKER_PACKS)[number];
	pose: CharacterStickerPose;
}): StickerAssetSource {
	if (STATIC_CHARACTER_POSE_IDS.has(pose.id)) {
		return {
			kind: "bundled",
			mimeType: "image/svg+xml",
			url: characterStickerUrl({ packId: pack.id, poseId: pose.id }),
		};
	}
	return {
		kind: "bundled",
		mimeType: "image/svg+xml",
		url: characterStickerSvg({ pack, pose }),
	};
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
		source: characterStickerSource({ pack, pose }),
		animated: false,
	};
}

function createThemedSticker({
	item,
	pack,
}: {
	item: ThemedStickerDefinition;
	pack: ThemedStickerPack;
}): StickerCatalogItem {
	const icon = `${pack.id}-${item.id}`;
	return {
		id: `qcut-themed:${icon}`,
		category: pack.id,
		collection: "qcut-themed",
		icon,
		name: `${pack.name} ${item.name}`,
		localizedName: `${pack.localizedName}·${item.localizedName}`,
		tags: [pack.name, pack.localizedName, ...item.tags],
		packId: pack.id,
		source: {
			kind: "bundled",
			mimeType: "image/svg+xml",
			url: themedStickerSvg({ item, pack }),
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

const THEMED_STICKERS = THEMED_STICKER_PACKS.flatMap((pack) =>
	pack.items.map((item) => createThemedSticker({ item, pack }))
);

export const CURATED_STICKERS: StickerCatalogItem[] = [
	...FLUENT_STICKERS,
	...CHARACTER_STICKERS,
	...THEMED_STICKERS,
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
