import type { TransitionPreset } from "../transition-preset-types";
import { categoryExpansion } from "./build-category-expansion";

const lightExpansions = categoryExpansion({
	category: "light",
	rows: [
		[
			"prism-flare",
			"Prism Flare",
			"棱镜光晕",
			"light",
			"light-leak",
			0.58,
			{
				tuning: { intensity: 0.8, frequency: 1.5, tint: "#d8c4ff" },
				tags: ["prism", "flare"],
				popular: true,
			},
		],
		[
			"cyan-flare",
			"Cyan Flare",
			"青色耀斑",
			"light",
			"light-leak",
			0.52,
			{
				tuning: { intensity: 0.9, frequency: 0.8, tint: "#65e8ff" },
				tags: ["cyan", "flare"],
			},
		],
		[
			"amber-flash",
			"Amber Flash",
			"琥珀闪光",
			"flash",
			"flash",
			0.34,
			{
				tuning: { intensity: 1.1, tint: "#ffc266" },
				tags: ["amber", "flash"],
			},
		],
		[
			"white-bloom",
			"White Bloom",
			"白色绽放",
			"flash",
			"flash",
			0.46,
			{
				tuning: { intensity: 1.55, tint: "#ffffff" },
				tags: ["white", "bloom"],
			},
		],
		[
			"red-film-streak",
			"Red Film Streak",
			"红色胶片划光",
			"light",
			"light-leak",
			0.64,
			{
				tuning: { intensity: 1.35, frequency: 2.1, tint: "#ff3b30" },
				tags: ["red", "film", "streak"],
				latest: true,
			},
		],
	],
});

const glitchExpansions = categoryExpansion({
	category: "glitch",
	rows: [
		[
			"vhs-tear",
			"VHS Tear",
			"VHS 撕裂",
			"glitch",
			"rgb-glitch",
			0.42,
			{
				tuning: { intensity: 0.8, frequency: 0.65 },
				tags: ["vhs", "tear"],
				popular: true,
			},
		],
		[
			"data-mosh",
			"Data Mosh",
			"数据熔接",
			"glitch",
			"rgb-glitch",
			0.5,
			{
				tuning: { intensity: 1.65, frequency: 0.35 },
				tags: ["data", "mosh"],
			},
		],
		[
			"crt-roll",
			"CRT Roll",
			"CRT 滚屏",
			"glitch",
			"rgb-glitch",
			0.38,
			{
				tuning: { intensity: 0.55, frequency: 3.6 },
				tags: ["crt", "roll"],
			},
		],
		[
			"chroma-burst",
			"Chroma Burst",
			"色度爆发",
			"glitch",
			"rgb-glitch",
			0.3,
			{
				tuning: { intensity: 2, frequency: 1.4 },
				tags: ["chroma", "burst"],
			},
		],
		[
			"signal-snap",
			"Signal Snap",
			"信号闪断",
			"glitch",
			"rgb-glitch",
			0.24,
			{
				tuning: { intensity: 1.1, frequency: 4 },
				tags: ["signal", "snap"],
				latest: true,
			},
		],
	],
});

const varietyExpansions = categoryExpansion({
	category: "variety",
	rows: [
		[
			"comedy-punch",
			"Comedy Punch",
			"喜剧冲击",
			"zoom",
			"zoom-blur",
			0.34,
			{ tuning: { intensity: 1.4 }, tags: ["comedy", "punch"], popular: true },
		],
		[
			"reaction-wobble",
			"Reaction Wobble",
			"反应摇摆",
			"shake",
			"shake",
			0.46,
			{
				tuning: { intensity: 0.5, frequency: 2.8 },
				tags: ["reaction", "wobble"],
			},
		],
		[
			"applause-flash",
			"Applause Flash",
			"掌声闪光",
			"flash",
			"flash",
			0.3,
			{
				tuning: { intensity: 0.95, tint: "#fff0a8" },
				tags: ["applause", "flash"],
			},
		],
		[
			"sticker-swipe",
			"Sticker Swipe",
			"贴纸扫入",
			"push",
			"push",
			0.42,
			{ direction: "right", tags: ["sticker", "swipe"] },
		],
		[
			"game-show-signal",
			"Game Show Signal",
			"游戏秀信号",
			"glitch",
			"rgb-glitch",
			0.36,
			{
				tuning: { intensity: 0.7, frequency: 2.4 },
				tags: ["game-show", "signal"],
				latest: true,
			},
		],
	],
});

const mgExpansions = categoryExpansion({
	category: "mg",
	rows: [
		[
			"block-push",
			"Block Push",
			"方块推入",
			"push",
			"push",
			0.38,
			{ direction: "left", tags: ["block", "graphic"], popular: true },
		],
		[
			"elastic-wipe-down",
			"Elastic Wipe Down",
			"弹性下擦",
			"wipe",
			"wipe",
			0.44,
			{ direction: "down", tags: ["elastic", "wipe"] },
		],
		[
			"logo-pop",
			"Logo Pop",
			"标志弹出",
			"zoom",
			"zoom-blur",
			0.32,
			{ tuning: { intensity: 1.25 }, tags: ["logo", "pop"] },
		],
		[
			"kinetic-jump",
			"Kinetic Jump",
			"动感跳切",
			"shake",
			"shake",
			0.36,
			{
				tuning: { intensity: 0.75, frequency: 2.35 },
				tags: ["kinetic", "jump"],
			},
		],
		[
			"ribbon-whip",
			"Ribbon Whip",
			"丝带上甩",
			"whip",
			"whip-pan",
			0.4,
			{
				direction: "up",
				tuning: { intensity: 0.85 },
				tags: ["ribbon", "whip"],
				latest: true,
			},
		],
	],
});

const emojiExpansions = categoryExpansion({
	category: "emoji",
	rows: [
		[
			"love-flash",
			"Love Flash",
			"心动闪光",
			"flash",
			"flash",
			0.32,
			{
				tuning: { intensity: 0.7, tint: "#ff9fbd" },
				tags: ["love", "heart"],
				popular: true,
			},
		],
		[
			"wow-pop",
			"Wow Pop",
			"惊叹弹出",
			"zoom",
			"zoom-blur",
			0.3,
			{ tuning: { intensity: 1.45 }, tags: ["wow", "reaction"] },
		],
		[
			"laugh-bounce",
			"Laugh Bounce",
			"大笑弹跳",
			"shake",
			"shake",
			0.42,
			{
				tuning: { intensity: 0.55, frequency: 3 },
				tags: ["laugh", "bounce"],
			},
		],
		[
			"sparkle-reaction",
			"Sparkle Reaction",
			"闪耀回应",
			"light",
			"light-leak",
			0.46,
			{
				tuning: { intensity: 0.65, frequency: 1.8, tint: "#fff3a6" },
				tags: ["sparkle", "reaction"],
			},
		],
		[
			"reaction-swipe",
			"Reaction Swipe",
			"互动扫入",
			"push",
			"push",
			0.4,
			{ direction: "up", tags: ["reaction", "swipe"], latest: true },
		],
	],
});

export const STYLIZED_TRANSITION_CATEGORY_EXPANSIONS: TransitionPreset[] = [
	...lightExpansions,
	...glitchExpansions,
	...varietyExpansions,
	...mgExpansions,
	...emojiExpansions,
];
