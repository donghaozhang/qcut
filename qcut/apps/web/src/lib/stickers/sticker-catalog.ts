import {
	Clapperboard,
	CupSoda,
	Droplets,
	Dumbbell,
	EyeOff,
	Frame,
	Hand,
	Heart,
	Laugh,
	PartyPopper,
	PawPrint,
	PencilLine,
	Plane,
	Rabbit,
	ShoppingBag,
	Signature,
	Smile,
	Sun,
	WandSparkles,
	type LucideIcon,
} from "lucide-react";

export const STICKER_CATEGORY_MINIMUM_SIZE = 5;

export interface StickerCategory {
	id: string;
	label: string;
	localizedLabel: string;
	icon: LucideIcon;
}

export const STICKER_CATEGORIES = [
	{
		id: "interaction",
		label: "Interaction",
		localizedLabel: "互动",
		icon: Hand,
	},
	{ id: "summer", label: "Summer", localizedLabel: "夏日", icon: Sun },
	{
		id: "pink-rabbit",
		label: "Pink Rabbit",
		localizedLabel: "粉红兔子",
		icon: Rabbit,
	},
	{ id: "vlog", label: "Vlog", localizedLabel: "Vlog", icon: Clapperboard },
	{
		id: "milk-tea-mouse",
		label: "Milk Tea Mouse",
		localizedLabel: "奶茶鼠",
		icon: CupSoda,
	},
	{ id: "mood", label: "Mood", localizedLabel: "情绪", icon: Smile },
	{ id: "conceal", label: "Conceal", localizedLabel: "遮挡", icon: EyeOff },
	{
		id: "festival",
		label: "Festival",
		localizedLabel: "节日",
		icon: PartyPopper,
	},
	{
		id: "ecommerce",
		label: "E-commerce",
		localizedLabel: "电商",
		icon: ShoppingBag,
	},
	{
		id: "doodle",
		label: "Cute Doodles",
		localizedLabel: "涂鸦萌趣",
		icon: PencilLine,
	},
	{
		id: "butter-bear",
		label: "Butter Bear",
		localizedLabel: "黄油小熊",
		icon: PawPrint,
	},
	{ id: "sports", label: "Sports", localizedLabel: "运动", icon: Dumbbell },
	{
		id: "little-blue",
		label: "Little Blue",
		localizedLabel: "小蓝",
		icon: Droplets,
	},
	{ id: "frames", label: "Frames", localizedLabel: "边框", icon: Frame },
	{ id: "travel", label: "Travel", localizedLabel: "旅行", icon: Plane },
	{
		id: "handwriting",
		label: "Handwriting",
		localizedLabel: "手写字",
		icon: Signature,
	},
	{ id: "romance", label: "Romance", localizedLabel: "浪漫", icon: Heart },
	{
		id: "beauty",
		label: "Beauty",
		localizedLabel: "美妆",
		icon: WandSparkles,
	},
	{ id: "faces", label: "Faces", localizedLabel: "颜表情", icon: Laugh },
] as const satisfies readonly StickerCategory[];

export type StickerCategoryId = (typeof STICKER_CATEGORIES)[number]["id"];

interface StickerDefinition {
	icon: string;
	name: string;
	localizedName: string;
}

export interface StickerCatalogItem extends StickerDefinition {
	id: string;
	category: StickerCategoryId;
	collection: "fluent-emoji";
	tags: string[];
}

const STICKER_SETS: Record<StickerCategoryId, readonly StickerDefinition[]> = {
	interaction: [
		{ icon: "thumbs-up", name: "Thumbs up", localizedName: "点赞" },
		{ icon: "clapping-hands", name: "Clapping hands", localizedName: "鼓掌" },
		{ icon: "red-heart", name: "Red heart", localizedName: "爱心" },
		{ icon: "sparkles", name: "Sparkles", localizedName: "闪亮" },
		{ icon: "party-popper", name: "Party popper", localizedName: "庆祝" },
	],
	summer: [
		{ icon: "watermelon", name: "Watermelon", localizedName: "西瓜" },
		{ icon: "sun", name: "Sun", localizedName: "太阳" },
		{
			icon: "beach-with-umbrella",
			name: "Beach umbrella",
			localizedName: "沙滩伞",
		},
		{ icon: "palm-tree", name: "Palm tree", localizedName: "棕榈树" },
		{ icon: "ice-cream", name: "Ice cream", localizedName: "冰淇淋" },
	],
	"pink-rabbit": [
		{ icon: "rabbit-face", name: "Rabbit face", localizedName: "兔兔脸" },
		{ icon: "rabbit", name: "Rabbit", localizedName: "小兔子" },
		{ icon: "pink-heart", name: "Pink heart", localizedName: "粉色爱心" },
		{ icon: "ribbon", name: "Ribbon", localizedName: "蝴蝶结" },
		{
			icon: "cherry-blossom",
			name: "Cherry blossom",
			localizedName: "樱花",
		},
	],
	vlog: [
		{ icon: "camera", name: "Camera", localizedName: "相机" },
		{ icon: "movie-camera", name: "Movie camera", localizedName: "电影机" },
		{ icon: "clapper-board", name: "Clapperboard", localizedName: "场记板" },
		{ icon: "video-camera", name: "Video camera", localizedName: "摄像机" },
		{ icon: "microphone", name: "Microphone", localizedName: "麦克风" },
	],
	"milk-tea-mouse": [
		{ icon: "bubble-tea", name: "Bubble tea", localizedName: "奶茶" },
		{ icon: "mouse-face", name: "Mouse face", localizedName: "鼠鼠脸" },
		{ icon: "mouse", name: "Mouse", localizedName: "小鼠" },
		{ icon: "cheese-wedge", name: "Cheese", localizedName: "芝士" },
		{ icon: "cookie", name: "Cookie", localizedName: "曲奇" },
	],
	mood: [
		{ icon: "grinning-face", name: "Grinning", localizedName: "开心" },
		{
			icon: "smiling-face-with-heart-eyes",
			name: "Heart eyes",
			localizedName: "心动",
		},
		{ icon: "loudly-crying-face", name: "Crying", localizedName: "大哭" },
		{ icon: "angry-face", name: "Angry", localizedName: "生气" },
		{
			icon: "face-with-tears-of-joy",
			name: "Tears of joy",
			localizedName: "笑哭",
		},
	],
	conceal: [
		{
			icon: "see-no-evil-monkey",
			name: "See no evil",
			localizedName: "捂眼",
		},
		{ icon: "eyes", name: "Eyes", localizedName: "眼睛" },
		{
			icon: "face-with-hand-over-mouth",
			name: "Hand over mouth",
			localizedName: "捂嘴",
		},
		{
			icon: "zipper-mouth-face",
			name: "Zipper mouth",
			localizedName: "闭嘴",
		},
		{ icon: "shield", name: "Shield", localizedName: "遮挡盾牌" },
	],
	festival: [
		{ icon: "wrapped-gift", name: "Gift", localizedName: "礼物" },
		{ icon: "fireworks", name: "Fireworks", localizedName: "烟花" },
		{ icon: "christmas-tree", name: "Christmas tree", localizedName: "圣诞树" },
		{ icon: "red-envelope", name: "Red envelope", localizedName: "红包" },
		{ icon: "balloon", name: "Balloon", localizedName: "气球" },
	],
	ecommerce: [
		{ icon: "shopping-bags", name: "Shopping bags", localizedName: "购物袋" },
		{ icon: "shopping-cart", name: "Shopping cart", localizedName: "购物车" },
		{ icon: "money-bag", name: "Money bag", localizedName: "钱袋" },
		{ icon: "package", name: "Package", localizedName: "包裹" },
		{ icon: "delivery-truck", name: "Delivery truck", localizedName: "快递" },
	],
	doodle: [
		{ icon: "crayon", name: "Crayon", localizedName: "蜡笔" },
		{ icon: "artist-palette", name: "Artist palette", localizedName: "调色盘" },
		{ icon: "paintbrush", name: "Paintbrush", localizedName: "画笔" },
		{ icon: "pencil", name: "Pencil", localizedName: "铅笔" },
		{
			icon: "thought-balloon",
			name: "Thought bubble",
			localizedName: "想法气泡",
		},
	],
	"butter-bear": [
		{ icon: "bear", name: "Bear", localizedName: "小熊" },
		{ icon: "teddy-bear", name: "Teddy bear", localizedName: "泰迪熊" },
		{ icon: "honey-pot", name: "Honey pot", localizedName: "蜂蜜罐" },
		{ icon: "butter", name: "Butter", localizedName: "黄油" },
		{ icon: "pancakes", name: "Pancakes", localizedName: "松饼" },
	],
	sports: [
		{ icon: "person-running", name: "Running", localizedName: "跑步" },
		{ icon: "basketball", name: "Basketball", localizedName: "篮球" },
		{ icon: "soccer-ball", name: "Football", localizedName: "足球" },
		{ icon: "trophy", name: "Trophy", localizedName: "奖杯" },
		{ icon: "running-shoe", name: "Running shoe", localizedName: "跑鞋" },
	],
	"little-blue": [
		{ icon: "blue-heart", name: "Blue heart", localizedName: "蓝心" },
		{ icon: "blueberries", name: "Blueberries", localizedName: "蓝莓" },
		{ icon: "dolphin", name: "Dolphin", localizedName: "海豚" },
		{ icon: "water-wave", name: "Water wave", localizedName: "海浪" },
		{
			icon: "light-blue-heart",
			name: "Light blue heart",
			localizedName: "浅蓝心",
		},
	],
	frames: [
		{ icon: "film-frames", name: "Film frames", localizedName: "胶片框" },
		{ icon: "framed-picture", name: "Picture frame", localizedName: "相框" },
		{ icon: "mirror", name: "Mirror frame", localizedName: "镜框" },
		{ icon: "window", name: "Window frame", localizedName: "窗框" },
		{
			icon: "identification-card",
			name: "Card frame",
			localizedName: "卡片框",
		},
	],
	travel: [
		{ icon: "airplane", name: "Airplane", localizedName: "飞机" },
		{ icon: "luggage", name: "Luggage", localizedName: "行李箱" },
		{ icon: "world-map", name: "World map", localizedName: "世界地图" },
		{ icon: "compass", name: "Compass", localizedName: "指南针" },
		{ icon: "camping", name: "Camping", localizedName: "露营" },
	],
	handwriting: [
		{ icon: "memo", name: "Memo", localizedName: "便签" },
		{ icon: "fountain-pen", name: "Fountain pen", localizedName: "钢笔" },
		{ icon: "pen", name: "Pen", localizedName: "签字笔" },
		{ icon: "writing-hand", name: "Writing hand", localizedName: "手写" },
		{ icon: "open-book", name: "Open book", localizedName: "手账" },
	],
	romance: [
		{ icon: "kiss-mark", name: "Kiss mark", localizedName: "唇印" },
		{ icon: "love-letter", name: "Love letter", localizedName: "情书" },
		{ icon: "two-hearts", name: "Two hearts", localizedName: "双心" },
		{ icon: "rose", name: "Rose", localizedName: "玫瑰" },
		{
			icon: "heart-with-arrow",
			name: "Heart with arrow",
			localizedName: "丘比特之心",
		},
	],
	beauty: [
		{ icon: "lipstick", name: "Lipstick", localizedName: "口红" },
		{ icon: "nail-polish", name: "Nail polish", localizedName: "美甲" },
		{ icon: "mirror-ball", name: "Mirror ball", localizedName: "闪耀妆容" },
		{ icon: "high-heeled-shoe", name: "High heel", localizedName: "高跟鞋" },
		{ icon: "ring", name: "Ring", localizedName: "戒指" },
	],
	faces: [
		{
			icon: "smiling-face-with-hearts",
			name: "Smiling with hearts",
			localizedName: "幸福脸",
		},
		{
			icon: "face-blowing-a-kiss",
			name: "Blowing a kiss",
			localizedName: "飞吻",
		},
		{ icon: "winking-face", name: "Winking", localizedName: "眨眼" },
		{
			icon: "smiling-face-with-smiling-eyes",
			name: "Warm smile",
			localizedName: "微笑",
		},
		{
			icon: "beaming-face-with-smiling-eyes",
			name: "Beaming face",
			localizedName: "灿烂笑脸",
		},
	],
};

export const CURATED_STICKERS: StickerCatalogItem[] =
	STICKER_CATEGORIES.flatMap((category) =>
		STICKER_SETS[category.id].map((sticker) => ({
			...sticker,
			id: `fluent-emoji:${sticker.icon}`,
			category: category.id,
			collection: "fluent-emoji" as const,
			tags: [
				category.label,
				category.localizedLabel,
				...sticker.icon.split("-"),
			],
		}))
	);

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
