import type { TransitionPreset } from "../transition-preset-types";
import { categoryExpansion } from "./build-category-expansion";

/**
 * JianYing-parity parameter sweep: named looks from 剪映's 热门/叠化/运镜/
 * 光效/故障/综艺/模糊/幻灯片/自然/拍摄 shelves, expressed entirely through
 * the existing 20 clip transition types with tuned direction/intensity/
 * frequency/tint — no new render pipeline.
 */
const dissolveParity = categoryExpansion({
	category: "dissolve",
	rows: [
		[
			"dissolve-zoom-in",
			"Dissolve Zoom",
			"叠化拉近",
			"zoom",
			"zoom-blur",
			0.6,
			{ tuning: { intensity: 0.22 }, tags: ["zoom", "soft"], popular: true },
		],
		[
			"overlap-fade-2",
			"Overlap Fade II",
			"交叠渐隐Ⅱ",
			"dissolve",
			"dissolve",
			0.9,
			{ tuning: { intensity: 0.7 }, tags: ["overlap", "gentle"] },
		],
		[
			"additive-overlay",
			"Additive Overlay",
			"叠加",
			"flash",
			"flash",
			0.55,
			{ tuning: { intensity: 0.32, tint: "#ffffff" }, tags: ["additive"] },
		],
		[
			"starlight-dissolve",
			"Starlight Dissolve",
			"星光叠化",
			"particle",
			"particle-dissolve",
			0.8,
			{
				tuning: { intensity: 0.85, frequency: 6 },
				tags: ["star", "sparkle"],
				popular: true,
			},
		],
		[
			"mist-crossfade",
			"Mist Crossfade",
			"雾化交叠",
			"particle",
			"particle-dissolve",
			0.85,
			{
				tuning: { intensity: 0.35, frequency: 2, tint: "#f3f5f7" },
				tags: ["mist", "fog"],
			},
		],
		[
			"white-flash-dissolve",
			"White Flash Dissolve",
			"白闪叠化",
			"flash",
			"flash",
			0.4,
			{ tuning: { intensity: 0.6, tint: "#ffffff" }, tags: ["white", "flash"] },
		],
	],
});

const cameraParity = categoryExpansion({
	category: "camera",
	rows: [
		[
			"radial-burst",
			"Radial Burst",
			"放射",
			"zoom",
			"zoom-blur",
			0.5,
			{ tuning: { intensity: 0.85 }, tags: ["radial", "burst"], popular: true },
		],
		[
			"shake-zoom",
			"Shake Zoom",
			"抖动放大",
			"shake",
			"shake",
			0.5,
			{ tuning: { intensity: 0.9, frequency: 7 }, tags: ["zoom", "impact"] },
		],
		[
			"zoom-slide-left",
			"Zoom Slide Left",
			"放大左移",
			"whip",
			"whip-pan",
			0.5,
			{ direction: "left", tuning: { intensity: 0.5 }, tags: ["zoom", "pan"] },
		],
		[
			"push-in-2",
			"Push In II",
			"推近Ⅱ",
			"zoom",
			"zoom-blur",
			0.42,
			{ tuning: { intensity: 0.6 }, tags: ["push"], popular: true },
		],
		[
			"pull-back-2",
			"Pull Back II",
			"拉远Ⅱ",
			"zoom",
			"zoom-blur",
			0.42,
			{ tuning: { intensity: 0.6, frequency: 1 }, tags: ["pull"] },
		],
		[
			"memory-slide-down",
			"Memory Slide Down",
			"回忆下滑",
			"whip",
			"whip-pan",
			0.55,
			{
				direction: "down",
				tuning: { intensity: 0.55, tint: "#fff6e8" },
				tags: ["memory"],
			},
		],
		[
			"memory-pull-up",
			"Memory Pull",
			"回忆拉屏",
			"whip",
			"whip-pan",
			0.6,
			{
				direction: "up",
				tuning: { intensity: 0.75, tint: "#ffffff" },
				tags: ["memory", "white"],
				latest: true,
			},
		],
	],
});

const lightParity = categoryExpansion({
	category: "light",
	rows: [
		[
			"light-sweep",
			"Light Sweep",
			"扫光",
			"light",
			"light-leak",
			0.5,
			{
				direction: "right",
				tuning: { intensity: 0.8, tint: "#ffd27a" },
				tags: ["sweep"],
				popular: true,
			},
		],
		[
			"star-flash-cut",
			"Star Flash Cut",
			"星光闪切",
			"flare",
			"lens-flare",
			0.45,
			{ tuning: { intensity: 0.85, tint: "#fff3c4" }, tags: ["star", "flash"] },
		],
		[
			"golden-leak-2",
			"Golden Leak II",
			"金色漏光Ⅱ",
			"light",
			"light-leak",
			0.6,
			{ tuning: { intensity: 0.6, tint: "#ffb347" }, tags: ["golden"] },
		],
	],
});

const glitchParity = categoryExpansion({
	category: "glitch",
	rows: [
		[
			"signal-tear",
			"Signal Tear",
			"信号撕裂",
			"glitch",
			"rgb-glitch",
			0.4,
			{
				tuning: { intensity: 0.9, frequency: 9 },
				tags: ["signal", "tear"],
				popular: true,
			},
		],
		[
			"chroma-jitter",
			"Chroma Jitter",
			"色差抖动",
			"glitch",
			"rgb-glitch",
			0.36,
			{ tuning: { intensity: 0.55, frequency: 12 }, tags: ["chroma"] },
		],
		[
			"scanline-break",
			"Scanline Break",
			"扫描线断裂",
			"glitch",
			"rgb-glitch",
			0.44,
			{ tuning: { intensity: 0.7, frequency: 4 }, tags: ["scanline"] },
		],
	],
});

const varietyParity = categoryExpansion({
	category: "variety",
	rows: [
		[
			"bounce-pop-2",
			"Bounce Pop II",
			"弹跳缩放Ⅱ",
			"shake",
			"shake",
			0.5,
			{ tuning: { intensity: 0.7, frequency: 3 }, tags: ["bounce"] },
		],
		[
			"spotlight-swing",
			"Spotlight Swing",
			"聚光摇摆",
			"light",
			"light-leak",
			0.55,
			{ tuning: { intensity: 0.8, tint: "#fff1b8" }, tags: ["spotlight"] },
		],
		[
			"zoom-punch",
			"Zoom Punch",
			"重击推近",
			"zoom",
			"zoom-blur",
			0.32,
			{ tuning: { intensity: 1 }, tags: ["punch", "impact"], popular: true },
		],
	],
});

const blurParity = categoryExpansion({
	category: "blur",
	rows: [
		[
			"defocus-cross",
			"Defocus Cross",
			"失焦交叠",
			"motion-blur",
			"motion-blur",
			0.6,
			{ tuning: { intensity: 0.6 }, tags: ["defocus"] },
		],
		[
			"dreamy-blur",
			"Dreamy Blur",
			"梦境虚化",
			"motion-blur",
			"motion-blur",
			0.7,
			{ tuning: { intensity: 0.4, tint: "#ffe3f2" }, tags: ["dream"] },
		],
		[
			"whip-up-blur",
			"Whip Up Blur",
			"上甩模糊",
			"whip",
			"whip-pan",
			0.42,
			{ direction: "up", tuning: { intensity: 0.75 }, tags: ["whip"] },
		],
	],
});

const slideshowParity = categoryExpansion({
	category: "slideshow",
	rows: [
		[
			"photo-swap",
			"Photo Swap",
			"相片切换",
			"push",
			"push",
			0.55,
			{ direction: "right", tags: ["photo"], popular: true },
		],
		[
			"reflect-flip",
			"Reflect Flip",
			"倒影翻转",
			"page",
			"page-flip",
			0.65,
			{ tuning: { intensity: 0.5 }, tags: ["reflect"] },
		],
		[
			"before-after-slide",
			"Before After Slide",
			"前后对比",
			"wipe",
			"wipe",
			0.6,
			{ direction: "left", tags: ["compare"], latest: true },
		],
	],
});

const splitParity = categoryExpansion({
	category: "split",
	rows: [
		[
			"split-pull",
			"Split Pull",
			"拉开",
			"wipe",
			"wipe",
			0.5,
			{ direction: "left", tuning: { intensity: 0.8 }, tags: ["pull"] },
		],
		[
			"lift-open",
			"Lift Open",
			"上下拉开",
			"push",
			"push",
			0.5,
			{ direction: "up", tuning: { intensity: 0.7 }, tags: ["open"] },
		],
		[
			"mosaic-shuffle",
			"Mosaic Shuffle",
			"方块重组",
			"pixel",
			"pixelate",
			0.55,
			{ tuning: { intensity: 0.85, frequency: 8 }, tags: ["mosaic", "block"] },
		],
	],
});

const naturalParity = categoryExpansion({
	category: "natural",
	rows: [
		[
			"ripple-cross-2",
			"Ripple Cross II",
			"水波交叠Ⅱ",
			"ripple",
			"water-ripple",
			0.7,
			{ tuning: { intensity: 0.7, frequency: 3 }, tags: ["ripple", "water"] },
		],
		[
			"glass-drift",
			"Glass Drift",
			"琉璃漂移",
			"glass",
			"glass-refraction",
			0.6,
			{ tuning: { intensity: 0.5 }, tags: ["glass"] },
		],
	],
});

const shootingParity = categoryExpansion({
	category: "shooting",
	rows: [
		[
			"shutter-burst",
			"Shutter Burst",
			"快门连拍",
			"flash",
			"flash",
			0.3,
			{
				tuning: { intensity: 0.9, frequency: 3 },
				tags: ["shutter"],
				popular: true,
			},
		],
		[
			"film-jump",
			"Film Jump",
			"胶片跳切",
			"shake",
			"shake",
			0.3,
			{
				tuning: { intensity: 0.5, frequency: 2, tint: "#d8c49a" },
				tags: ["film"],
			},
		],
	],
});

export const JIANYING_PARITY_TRANSITION_EXPANSIONS: TransitionPreset[] = [
	...dissolveParity,
	...cameraParity,
	...lightParity,
	...glitchParity,
	...varietyParity,
	...blurParity,
	...slideshowParity,
	...splitParity,
	...naturalParity,
	...shootingParity,
];
