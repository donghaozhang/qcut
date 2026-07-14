export interface StickerCategory {
	id: string;
	label: string;
	localizedLabel: string;
	emoji: string;
}

export const STICKER_CATEGORIES = [
	{
		id: "interaction",
		label: "Interaction",
		localizedLabel: "互动",
		emoji: "👍",
	},
	{ id: "summer", label: "Summer", localizedLabel: "夏日", emoji: "🍉" },
	{
		id: "pink-rabbit",
		label: "Pink Rabbit",
		localizedLabel: "粉红兔子",
		emoji: "🐰",
	},
	{ id: "vlog", label: "Vlog", localizedLabel: "Vlog", emoji: "🎥" },
	{
		id: "milk-tea-mouse",
		label: "Milk Tea Mouse",
		localizedLabel: "奶茶鼠",
		emoji: "🐭",
	},
	{ id: "mood", label: "Mood", localizedLabel: "情绪", emoji: "😊" },
	{ id: "conceal", label: "Conceal", localizedLabel: "遮挡", emoji: "🙈" },
	{
		id: "festival",
		label: "Festival",
		localizedLabel: "节日",
		emoji: "🎉",
	},
	{
		id: "ecommerce",
		label: "E-commerce",
		localizedLabel: "电商",
		emoji: "🛍️",
	},
	{
		id: "doodle",
		label: "Cute Doodles",
		localizedLabel: "涂鸦萌趣",
		emoji: "🖍️",
	},
	{
		id: "butter-bear",
		label: "Butter Bear",
		localizedLabel: "黄油小熊",
		emoji: "🐻",
	},
	{ id: "sports", label: "Sports", localizedLabel: "运动", emoji: "🏃" },
	{
		id: "little-blue",
		label: "Little Blue",
		localizedLabel: "小蓝",
		emoji: "💧",
	},
	{ id: "frames", label: "Frames", localizedLabel: "边框", emoji: "🖼️" },
	{ id: "travel", label: "Travel", localizedLabel: "旅行", emoji: "✈️" },
	{
		id: "handwriting",
		label: "Handwriting",
		localizedLabel: "手写字",
		emoji: "✍️",
	},
	{ id: "romance", label: "Romance", localizedLabel: "浪漫", emoji: "💕" },
	{ id: "beauty", label: "Beauty", localizedLabel: "美妆", emoji: "💄" },
	{ id: "faces", label: "Faces", localizedLabel: "颜表情", emoji: "🤩" },
] as const satisfies readonly StickerCategory[];

export type StickerCategoryId = (typeof STICKER_CATEGORIES)[number]["id"];

export const CHARACTER_STICKER_CATEGORY_IDS = [
	"pink-rabbit",
	"milk-tea-mouse",
	"butter-bear",
] as const satisfies readonly StickerCategoryId[];

export type CharacterStickerCategoryId =
	(typeof CHARACTER_STICKER_CATEGORY_IDS)[number];

export type FluentStickerCategoryId = Exclude<
	StickerCategoryId,
	CharacterStickerCategoryId
>;
