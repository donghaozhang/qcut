export type StickerMotionKind =
	| "bounce"
	| "check"
	| "confetti"
	| "heart"
	| "orbit"
	| "progress"
	| "pulse"
	| "ring"
	| "sparkle"
	| "spin"
	| "tap"
	| "wave";

export interface MotionStickerDefinition {
	id: string;
	collection: string;
	icon: string;
	name: string;
	localizedName: string;
	motion: StickerMotionKind;
	primaryColor: string;
	secondaryColor: string;
	tags: readonly string[];
	url: string;
}

export interface MotionStickerPack {
	id: string;
	name: string;
	localizedName: string;
	description: string;
	emoji: string;
	items: readonly MotionStickerDefinition[];
}

interface MotionStickerSeed {
	icon: string;
	name: string;
	localizedName: string;
	motion: StickerMotionKind;
	tags: readonly string[];
}

const MOTION_SEEDS = [
	{
		icon: "attention-pulse",
		name: "Attention Pulse",
		localizedName: "注意脉冲",
		motion: "pulse",
		tags: ["attention", "pulse"],
	},
	{
		icon: "tap-here",
		name: "Tap Here",
		localizedName: "点击这里",
		motion: "tap",
		tags: ["tap", "pointer"],
	},
	{
		icon: "approved-check",
		name: "Approved Check",
		localizedName: "确认完成",
		motion: "check",
		tags: ["check", "complete"],
	},
	{
		icon: "heart-beat",
		name: "Heart Beat",
		localizedName: "心动",
		motion: "heart",
		tags: ["heart", "love"],
	},
	{
		icon: "sparkle-pop",
		name: "Sparkle Pop",
		localizedName: "闪耀",
		motion: "sparkle",
		tags: ["sparkle", "shine"],
	},
	{
		icon: "bounce-arrow",
		name: "Bounce Arrow",
		localizedName: "弹跳箭头",
		motion: "bounce",
		tags: ["arrow", "bounce"],
	},
	{
		icon: "focus-ring",
		name: "Focus Ring",
		localizedName: "焦点圆环",
		motion: "ring",
		tags: ["focus", "ring"],
	},
	{
		icon: "celebration-burst",
		name: "Celebration Burst",
		localizedName: "庆祝爆发",
		motion: "confetti",
		tags: ["celebration", "confetti"],
	},
	{
		icon: "signal-wave",
		name: "Signal Wave",
		localizedName: "信号波纹",
		motion: "wave",
		tags: ["signal", "wave"],
	},
	{
		icon: "orbit-dot",
		name: "Orbit Dot",
		localizedName: "环绕圆点",
		motion: "orbit",
		tags: ["orbit", "dot"],
	},
	{
		icon: "loading-progress",
		name: "Loading Progress",
		localizedName: "加载进度",
		motion: "progress",
		tags: ["loading", "progress"],
	},
	{
		icon: "radial-spin",
		name: "Radial Spin",
		localizedName: "旋转强调",
		motion: "spin",
		tags: ["spin", "radial"],
	},
] as const satisfies readonly MotionStickerSeed[];

function motionStickerUrl({
	collection,
	icon,
}: {
	collection: string;
	icon: string;
}): string {
	return `${import.meta.env.BASE_URL}stickers/qcut-motion/${collection}/${icon}.png`;
}

function createMotionItems({
	collection,
	creatorVariant,
}: {
	collection: string;
	creatorVariant: boolean;
}): MotionStickerDefinition[] {
	return MOTION_SEEDS.map((seed, index) => {
		const icon = creatorVariant ? `creator-${seed.icon}` : seed.icon;
		return {
			...seed,
			id: `${collection}:${icon}`,
			collection,
			icon,
			name: creatorVariant ? `Creator ${seed.name}` : seed.name,
			localizedName: creatorVariant
				? `创作·${seed.localizedName}`
				: seed.localizedName,
			primaryColor: creatorVariant
				? index % 2 === 0
					? "#f472b6"
					: "#facc15"
				: index % 2 === 0
					? "#38bdf8"
					: "#34d399",
			secondaryColor: creatorVariant
				? index % 2 === 0
					? "#fce7f3"
					: "#fef3c7"
				: "#ffffff",
			url: motionStickerUrl({ collection, icon }),
		};
	});
}

export const MOTION_STICKER_PACKS: readonly MotionStickerPack[] = [
	{
		id: "qcut-motion-emphasis",
		name: "QCut Motion Emphasis",
		localizedName: "动态强调贴纸",
		description: "12 个透明循环动画，适合提示与强调",
		emoji: "💫",
		items: createMotionItems({
			collection: "qcut-motion-emphasis",
			creatorVariant: false,
		}),
	},
	{
		id: "qcut-motion-creator",
		name: "QCut Creator Loops",
		localizedName: "创作循环贴纸",
		description: "12 个透明节奏动画，适合 Vlog 与转场提示",
		emoji: "⚡",
		items: createMotionItems({
			collection: "qcut-motion-creator",
			creatorVariant: true,
		}),
	},
];

export const MOTION_STICKERS = MOTION_STICKER_PACKS.flatMap(
	(pack) => pack.items
);

export function findMotionSticker({
	collection,
	icon,
}: {
	collection: string;
	icon: string;
}): MotionStickerDefinition | undefined {
	return MOTION_STICKERS.find(
		(sticker) => sticker.collection === collection && sticker.icon === icon
	);
}
