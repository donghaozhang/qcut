import type { TransitionPreset } from "../transition-preset-types";
import { categoryExpansion } from "./build-category-expansion";

/**
 * Round-two/three parity sweeps: remaining named looks from 剪映's shelves
 * (阴影斜扫/穿越Ⅲ/回忆拉屏Ⅱ…), the MG color-swipe family, emoji looks, and
 * the final filler-displacement batch.
 */
const parityRoundTwo = categoryExpansion({
	category: "dissolve",
	rows: [
		[
			"shadow-diagonal-sweep",
			"Shadow Diagonal Sweep",
			"阴影斜扫",
			"texture",
			"texture-mask",
			0.6,
			{ maskShape: "diagonal", tags: ["shadow", "diagonal"], popular: true },
		],
		[
			"push-zoom-defocus",
			"Push Zoom Defocus",
			"推镜虚化",
			"zoom",
			"zoom-blur",
			0.6,
			{ tuning: { intensity: 0.75 }, tags: ["defocus", "push"] },
		],
	],
});

const parityRoundTwoCamera = categoryExpansion({
	category: "camera",
	rows: [
		[
			"punch-through-3",
			"Punch Through III",
			"穿越Ⅲ",
			"zoom",
			"zoom-blur",
			0.4,
			{ tuning: { intensity: 1.9 }, tags: ["punch", "through"], popular: true },
		],
		[
			"shake-cut-2",
			"Shake Cut II",
			"震动Ⅱ",
			"shake",
			"shake",
			0.42,
			{ tuning: { intensity: 1.2, frequency: 9 }, tags: ["shake"] },
		],
		[
			"memory-pull-2",
			"Memory Pull II",
			"回忆拉屏Ⅱ",
			"whip",
			"whip-pan",
			0.75,
			{
				direction: "up",
				tuning: { intensity: 1, tint: "#ffffff" },
				tags: ["memory"],
			},
		],
		[
			"screen-pull-left",
			"Screen Pull Left",
			"向左拉屏",
			"whip",
			"whip-pan",
			0.5,
			{
				direction: "left",
				tuning: { intensity: 0.85, tint: "#ffffff" },
				tags: ["pull"],
				latest: true,
			},
		],
	],
});

const parityRoundTwoSlideshow = categoryExpansion({
	category: "slideshow",
	rows: [
		[
			"circle-spin",
			"Circle Spin",
			"圆圈旋转",
			"texture",
			"texture-mask",
			0.5,
			{ maskShape: "clock", tags: ["circle", "spin"] },
		],
	],
});

const parityRoundTwoNatural = categoryExpansion({
	category: "natural",
	rows: [
		[
			"cloud-drift-2",
			"Cloud Drift II",
			"云朵Ⅱ",
			"texture",
			"texture-mask",
			1.1,
			{ maskShape: "cloud", tags: ["cloud", "slow"] },
		],
	],
});

const parityRoundTwoShooting = categoryExpansion({
	category: "shooting",
	rows: [
		[
			"exposure-pop-2",
			"Exposure Pop II",
			"曝光闪切Ⅱ",
			"flash",
			"flash",
			0.32,
			{ tuning: { intensity: 1.2, tint: "#ffffff" }, tags: ["exposure"] },
		],
		[
			"zoom-shutter",
			"Zoom Shutter",
			"变焦快门",
			"zoom",
			"zoom-blur",
			0.36,
			{ tuning: { intensity: 0.9 }, tags: ["shutter", "zoom"] },
		],
	],
});

const parityRoundTwoBlur = categoryExpansion({
	category: "blur",
	rows: [
		[
			"depth-defocus",
			"Depth Defocus",
			"纵深虚化",
			"motion-blur",
			"motion-blur",
			0.55,
			{ direction: "up", tuning: { intensity: 0.5 }, tags: ["depth"] },
		],
	],
});

const mgParity = categoryExpansion({
	category: "mg",
	rows: [
		[
			"color-swipe-left",
			"Color Swipe Left",
			"色块左扫",
			"wipe",
			"color-swipe",
			0.5,
			{
				direction: "left",
				tuning: { tint: "#ffd233" },
				tags: ["mg", "color"],
				popular: true,
			},
		],
		[
			"color-swipe-right",
			"Color Swipe Right",
			"色块右扫",
			"wipe",
			"color-swipe",
			0.5,
			{
				direction: "right",
				tuning: { tint: "#4f8bff" },
				tags: ["mg", "color"],
			},
		],
		[
			"color-swipe-up",
			"Color Swipe Up",
			"色块上扫",
			"wipe",
			"color-swipe",
			0.45,
			{ direction: "up", tuning: { tint: "#ff5f8f" }, tags: ["mg", "color"] },
		],
		[
			"color-swipe-dark",
			"Ink Panel Swipe",
			"墨色幕扫",
			"wipe",
			"color-swipe",
			0.55,
			{
				direction: "down",
				tuning: { tint: "#181818" },
				tags: ["mg", "dark"],
				latest: true,
			},
		],
		[
			"circle-dash",
			"Circle Dash",
			"圆形穿梭",
			"texture",
			"texture-mask",
			0.45,
			{ maskShape: "circle", tags: ["mg", "circle"] },
		],
		[
			"star-pop-in",
			"Star Pop In",
			"星形弹入",
			"texture",
			"texture-mask",
			0.5,
			{ maskShape: "star", tags: ["mg", "star"] },
		],
		[
			"arrow-dash",
			"Arrow Dash",
			"箭头冲屏",
			"texture",
			"texture-mask",
			0.4,
			{ maskShape: "arrow", tags: ["mg", "arrow"] },
		],
	],
});

const emojiParity = categoryExpansion({
	category: "emoji",
	rows: [
		[
			"heart-flash",
			"Heart Flash",
			"爱心闪现",
			"texture",
			"texture-mask",
			0.5,
			{ maskShape: "heart", tags: ["emoji", "heart"], popular: true },
		],
		[
			"star-mood",
			"Star Mood",
			"星星心情",
			"texture",
			"texture-mask",
			0.55,
			{ maskShape: "star", tags: ["emoji", "star"] },
		],
	],
});

const shootingRoundThree = categoryExpansion({
	category: "shooting",
	rows: [
		[
			"focus-breath",
			"Focus Breath",
			"对焦呼吸",
			"zoom",
			"zoom-blur",
			0.7,
			{ tuning: { intensity: 0.35 }, tags: ["focus", "breath"] },
		],
	],
});

const fillerSweepDissolve = categoryExpansion({
	category: "dissolve",
	rows: [
		[
			"slow-cinema-dissolve",
			"Slow Cinema Dissolve",
			"慢速叠化",
			"dissolve",
			"dissolve",
			1.5,
			{ tuning: { intensity: 0.9 }, tags: ["slow", "cinematic"] },
		],
	],
});

const fillerSweepShooting = categoryExpansion({
	category: "shooting",
	rows: [
		[
			"film-burn-flare",
			"Film Burn Flare",
			"胶片烧灼",
			"light",
			"light-leak",
			0.6,
			{ tuning: { intensity: 1.1, tint: "#ff8c42" }, tags: ["film", "burn"] },
		],
		[
			"slow-shutter-smear",
			"Slow Shutter Smear",
			"慢门拖影",
			"motion-blur",
			"motion-blur",
			0.8,
			{ direction: "right", tuning: { intensity: 0.85 }, tags: ["shutter"] },
		],
		[
			"snap-freeze-flash",
			"Snap Freeze Flash",
			"闪拍定格",
			"flash",
			"flash",
			0.34,
			{
				tuning: { intensity: 1.1, frequency: 2, tint: "#ffffff" },
				tags: ["snap"],
			},
		],
	],
});

const fillerSweepDistortion = categoryExpansion({
	category: "distortion",
	rows: [
		[
			"vortex-storm",
			"Vortex Storm",
			"涡旋强旋",
			"ripple",
			"vortex",
			0.55,
			{ tuning: { intensity: 1.6 }, tags: ["vortex", "storm"] },
		],
	],
});

const fillerSweepVariety = categoryExpansion({
	category: "variety",
	rows: [
		[
			"variety-color-swipe",
			"Variety Color Swipe",
			"综艺色扫",
			"wipe",
			"color-swipe",
			0.4,
			{ direction: "right", tuning: { tint: "#ff5f8f" }, tags: ["variety"] },
		],
	],
});

const fillerSweepEmoji = categoryExpansion({
	category: "emoji",
	rows: [
		[
			"heart-multi-flash",
			"Heart Multi Flash",
			"爱心连闪",
			"flash",
			"flash",
			0.4,
			{
				tuning: { intensity: 0.85, frequency: 3, tint: "#ff9fbd" },
				tags: ["heart"],
			},
		],
		[
			"star-spin-wipe",
			"Star Spin Wipe",
			"星星旋转",
			"texture",
			"texture-mask",
			0.45,
			{ maskShape: "star", tags: ["star", "spin"] },
		],
		[
			"heartbeat-zoom",
			"Heartbeat Zoom",
			"心跳缩放",
			"zoom",
			"zoom-blur",
			0.4,
			{ tuning: { intensity: 0.5 }, tags: ["heartbeat"] },
		],
		[
			"rainbow-swipe",
			"Rainbow Swipe",
			"彩虹色扫",
			"wipe",
			"color-swipe",
			0.45,
			{ direction: "up", tuning: { tint: "#7c5cff" }, tags: ["rainbow"] },
		],
		[
			"candy-bounce",
			"Candy Bounce",
			"糖果弹跳",
			"shake",
			"shake",
			0.5,
			{ tuning: { intensity: 0.6, frequency: 3 }, tags: ["candy"] },
		],
		[
			"bubble-dissolve",
			"Bubble Dissolve",
			"泡泡消散",
			"particle",
			"particle-dissolve",
			0.65,
			{
				tuning: { intensity: 0.7, frequency: 4, tint: "#bfe7ff" },
				tags: ["bubble"],
			},
		],
	],
});

export const JIANYING_EXTRA_PARITY_EXPANSIONS: TransitionPreset[] = [
	...parityRoundTwo,
	...parityRoundTwoCamera,
	...parityRoundTwoSlideshow,
	...parityRoundTwoNatural,
	...parityRoundTwoShooting,
	...parityRoundTwoBlur,
	...mgParity,
	...emojiParity,
	...shootingRoundThree,
	...fillerSweepDissolve,
	...fillerSweepShooting,
	...fillerSweepDistortion,
	...fillerSweepVariety,
	...fillerSweepEmoji,
];
