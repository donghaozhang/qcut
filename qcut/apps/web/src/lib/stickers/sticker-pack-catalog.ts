import type { Plan } from "@/lib/feature-gates";
import { POPULAR_COLLECTIONS } from "./iconify-api";
import { CURATED_STICKERS } from "./sticker-catalog";

export type StickerPackAccessTier = "free" | "pro";

export interface StickerPackItem {
	id: string;
	animated: boolean;
	collection: string;
	icon: string;
	name: string;
}

export interface StickerStorePack {
	id: string;
	accessTier: StickerPackAccessTier;
	animated: boolean;
	description: string;
	emoji: string;
	items: readonly StickerPackItem[];
	localizedName: string;
	name: string;
}

function titleFromIcon({ icon }: { icon: string }): string {
	return icon
		.split("-")
		.map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
		.join(" ");
}

function motionPack({
	collectionPrefix,
	description,
	emoji,
	id,
	localizedName,
}: {
	collectionPrefix: string;
	description: string;
	emoji: string;
	id: string;
	localizedName: string;
}): StickerStorePack {
	const collection = POPULAR_COLLECTIONS.find(
		(candidate) => candidate.prefix === collectionPrefix
	);
	if (!collection?.samples) {
		throw new Error(
			`Motion sticker collection is missing: ${collectionPrefix}`
		);
	}
	return {
		id,
		accessTier: "pro",
		animated: true,
		description,
		emoji,
		localizedName,
		name: collection.name,
		items: collection.samples.map((icon) => ({
			id: `${collection.prefix}:${icon}`,
			animated: true,
			collection: collection.prefix,
			icon,
			name: titleFromIcon({ icon }),
		})),
	};
}

const ORIGINAL_ITEMS = CURATED_STICKERS.filter(
	(sticker) => sticker.collection === "qcut-original"
).map((sticker) => ({
	id: sticker.id,
	animated: sticker.animated,
	collection: sticker.collection,
	icon: sticker.icon,
	name: sticker.localizedName,
}));

const THEMED_ITEMS = CURATED_STICKERS.filter(
	(sticker) => sticker.collection === "qcut-themed"
).map((sticker) => ({
	id: sticker.id,
	animated: sticker.animated,
	collection: sticker.collection,
	icon: sticker.icon,
	name: sticker.localizedName,
}));

const FLUENT_ITEMS = CURATED_STICKERS.filter(
	(sticker) => sticker.source.kind === "iconify"
).map((sticker) => ({
	id: sticker.id,
	animated: sticker.animated,
	collection: sticker.collection,
	icon: sticker.icon,
	name: sticker.localizedName,
}));

export const DEFAULT_INSTALLED_STICKER_PACK_IDS = [
	"qcut-original-characters",
	"qcut-themed-creator",
	"fluent-creator-essentials",
] as const;

export const STICKER_STORE_PACKS: readonly StickerStorePack[] = [
	{
		id: "qcut-original-characters",
		accessTier: "free",
		animated: false,
		description: "90 个本地内置角色贴纸，断网也能使用",
		emoji: "✨",
		items: ORIGINAL_ITEMS,
		localizedName: "QCut 原创角色",
		name: "QCut Original Characters",
	},
	{
		id: "qcut-themed-creator",
		accessTier: "free",
		animated: false,
		description: `${THEMED_ITEMS.length} 个花字、横幅、箭头与专题贴纸`,
		emoji: "🪄",
		items: THEMED_ITEMS,
		localizedName: "QCut 创作主题包",
		name: "QCut Themed Creator Pack",
	},
	{
		id: "fluent-creator-essentials",
		accessTier: "free",
		animated: false,
		description: "160 个创作常用贴纸，下载后可离线使用",
		emoji: "🎨",
		items: FLUENT_ITEMS,
		localizedName: "Fluent 创作基础包",
		name: "Fluent Creator Essentials",
	},
	motionPack({
		collectionPrefix: "line-md",
		description: "12 个循环动画贴纸，适合提示与强调",
		emoji: "💫",
		id: "material-line-motion",
		localizedName: "线性动态贴纸",
	}),
	motionPack({
		collectionPrefix: "svg-spinners",
		description: "12 个节奏动画贴纸，适合加载与转场提示",
		emoji: "⚡",
		id: "svg-motion-loops",
		localizedName: "节奏动态贴纸",
	}),
];

export function canAccessStickerPack({
	accessTier,
	plan,
	status,
}: {
	accessTier: StickerPackAccessTier;
	plan: Plan | undefined;
	status: "active" | "past_due" | "cancelled" | "expired" | undefined;
}): boolean {
	if (accessTier === "free") return true;
	return status === "active" && (plan === "pro" || plan === "team");
}
