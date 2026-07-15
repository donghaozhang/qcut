export type StickerCategoryGroup = "featured" | "library" | "resources";

export interface StickerCategory {
	id: string;
	label: string;
	localizedLabel: string;
	emoji: string;
	group: StickerCategoryGroup;
}

export const STICKER_CATEGORIES = [
	{
		id: "popular",
		label: "Popular",
		localizedLabel: "热门",
		emoji: "🔥",
		group: "featured",
	},
	{
		id: "world-cup",
		label: "World Cup",
		localizedLabel: "世界杯",
		emoji: "⚽",
		group: "featured",
	},
	{
		id: "line-friends",
		label: "Line Friends",
		localizedLabel: "线条伙伴",
		emoji: "🐶",
		group: "featured",
	},
	{
		id: "interaction",
		label: "Interaction",
		localizedLabel: "互动",
		emoji: "👍",
		group: "library",
	},
	{
		id: "summer",
		label: "Summer",
		localizedLabel: "夏日",
		emoji: "🍉",
		group: "library",
	},
	{
		id: "pink-rabbit",
		label: "Pink Rabbit",
		localizedLabel: "粉红兔子",
		emoji: "🐰",
		group: "library",
	},
	{
		id: "vlog",
		label: "Vlog",
		localizedLabel: "Vlog",
		emoji: "🎥",
		group: "library",
	},
	{
		id: "milk-tea-mouse",
		label: "Milk Tea Mouse",
		localizedLabel: "奶茶鼠",
		emoji: "🐭",
		group: "library",
	},
	{
		id: "mood",
		label: "Mood",
		localizedLabel: "情绪",
		emoji: "😊",
		group: "library",
	},
	{
		id: "conceal",
		label: "Conceal",
		localizedLabel: "遮挡",
		emoji: "🙈",
		group: "library",
	},
	{
		id: "festival",
		label: "Festival",
		localizedLabel: "节日",
		emoji: "🎉",
		group: "library",
	},
	{
		id: "ecommerce",
		label: "E-commerce",
		localizedLabel: "电商",
		emoji: "🛍️",
		group: "library",
	},
	{
		id: "doodle",
		label: "Cute Doodles",
		localizedLabel: "涂鸦萌趣",
		emoji: "🖍️",
		group: "library",
	},
	{
		id: "butter-bear",
		label: "Butter Bear",
		localizedLabel: "黄油小熊",
		emoji: "🐻",
		group: "library",
	},
	{
		id: "sports",
		label: "Sports",
		localizedLabel: "运动",
		emoji: "🏃",
		group: "library",
	},
	{
		id: "little-blue",
		label: "Little Blue",
		localizedLabel: "小蓝",
		emoji: "💧",
		group: "library",
	},
	{
		id: "frames",
		label: "Frames",
		localizedLabel: "边框",
		emoji: "🖼️",
		group: "library",
	},
	{
		id: "travel",
		label: "Travel",
		localizedLabel: "旅行",
		emoji: "✈️",
		group: "library",
	},
	{
		id: "handwriting",
		label: "Handwriting",
		localizedLabel: "手写字",
		emoji: "✍️",
		group: "library",
	},
	{
		id: "romance",
		label: "Romance",
		localizedLabel: "浪漫",
		emoji: "💕",
		group: "library",
	},
	{
		id: "beauty",
		label: "Beauty",
		localizedLabel: "美妆",
		emoji: "💄",
		group: "library",
	},
	{
		id: "faces",
		label: "Faces",
		localizedLabel: "颜表情",
		emoji: "🤩",
		group: "library",
	},
	{
		id: "graphics",
		label: "Graphics",
		localizedLabel: "图形库",
		emoji: "🔷",
		group: "resources",
	},
] as const satisfies readonly StickerCategory[];

export type StickerCategoryId = (typeof STICKER_CATEGORIES)[number]["id"];

export const CHARACTER_STICKER_CATEGORY_IDS = [
	"pink-rabbit",
	"milk-tea-mouse",
	"butter-bear",
] as const satisfies readonly StickerCategoryId[];

export type CharacterStickerCategoryId =
	(typeof CHARACTER_STICKER_CATEGORY_IDS)[number];

export const FLUENT_STICKER_CATEGORY_IDS = [
	"interaction",
	"summer",
	"vlog",
	"mood",
	"conceal",
	"festival",
	"ecommerce",
	"doodle",
	"sports",
	"little-blue",
	"frames",
	"travel",
	"handwriting",
	"romance",
	"beauty",
	"faces",
] as const satisfies readonly StickerCategoryId[];

export type FluentStickerCategoryId =
	(typeof FLUENT_STICKER_CATEGORY_IDS)[number];

export const ORIGINAL_ONLY_STICKER_CATEGORY_IDS = [
	"popular",
	"world-cup",
	"line-friends",
	"graphics",
] as const satisfies readonly StickerCategoryId[];

export type OriginalOnlyStickerCategoryId =
	(typeof ORIGINAL_ONLY_STICKER_CATEGORY_IDS)[number];

export type ThemedStickerCategoryId =
	| FluentStickerCategoryId
	| OriginalOnlyStickerCategoryId;
