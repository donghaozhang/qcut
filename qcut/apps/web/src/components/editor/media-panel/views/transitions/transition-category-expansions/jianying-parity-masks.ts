import type { TransitionPreset } from "../transition-preset-types";
import { categoryExpansion } from "./build-category-expansion";

/**
 * Mask-shape and distortion/pseudo-3D parity groups: shaped texture-mask
 * wipes, vortex/shockwave/cube presets, and the curtain reveal family.
 */
const maskParityDissolve = categoryExpansion({
	category: "dissolve",
	rows: [
		[
			"circle-expand",
			"Circle Expand",
			"圆形遮罩 II",
			"texture",
			"texture-mask",
			0.6,
			{
				maskShape: "circle",
				tags: ["circle", "mask", "圆圈扩散"],
				popular: true,
			},
		],
	],
});

const maskParitySlideshow = categoryExpansion({
	category: "slideshow",
	rows: [
		[
			"clock-wipe",
			"Clock Wipe",
			"旋转擦除",
			"texture",
			"texture-mask",
			0.7,
			{ maskShape: "clock", tags: ["clock", "sweep"], popular: true },
		],
		[
			"blinds-sweep",
			"Blinds Sweep",
			"百叶窗",
			"texture",
			"texture-mask",
			0.6,
			{ maskShape: "blinds", tags: ["blinds"] },
		],
		[
			"arrow-sweep",
			"Arrow Sweep",
			"箭头右扫",
			"texture",
			"texture-mask",
			0.55,
			{ maskShape: "arrow", tags: ["arrow"] },
		],
	],
});

const maskParitySplit = categoryExpansion({
	category: "split",
	rows: [
		[
			"cross-split",
			"Cross Split",
			"十字分割",
			"texture",
			"texture-mask",
			0.55,
			{ maskShape: "cross", tags: ["cross"], latest: true },
		],
		[
			"triptych-open",
			"Triptych Open",
			"三屏拉开",
			"texture",
			"texture-mask",
			0.6,
			{ maskShape: "triptych", tags: ["panels"] },
		],
	],
});

const maskParityEmoji = categoryExpansion({
	category: "emoji",
	rows: [
		[
			"heart-expand",
			"Heart Expand",
			"心形叠化",
			"texture",
			"texture-mask",
			0.65,
			{
				maskShape: "heart",
				tags: ["heart", "love", "爱心扩散"],
				popular: true,
			},
		],
	],
});

const maskParityVariety = categoryExpansion({
	category: "variety",
	rows: [
		[
			"star-expand",
			"Star Expand",
			"星形扩散",
			"texture",
			"texture-mask",
			0.6,
			{ maskShape: "star", tags: ["star"] },
		],
		[
			"gold-dust-dissolve",
			"Gold Dust Dissolve",
			"金粉消散",
			"particle",
			"particle-dissolve",
			0.75,
			{
				tuning: { intensity: 0.8, frequency: 5, tint: "#ffd76a" },
				tags: ["gold"],
			},
		],
	],
});

const maskParityNatural = categoryExpansion({
	category: "natural",
	rows: [
		[
			"ink-bleed",
			"Ink Bleed",
			"墨水晕染",
			"texture",
			"texture-mask",
			0.8,
			{
				maskShape: "ink",
				tags: ["ink", "水墨", "水墨晕染"],
				popular: true,
			},
		],
		[
			"cloud-drift-wipe",
			"Cloud Drift",
			"云朵漫卷",
			"texture",
			"texture-mask",
			0.85,
			{ maskShape: "cloud", tags: ["cloud", "云"] },
		],
		[
			"fog-roll",
			"Fog Roll",
			"雾漫",
			"texture",
			"texture-mask",
			0.9,
			{ maskShape: "fog", tags: ["fog", "雾"] },
		],
		[
			"water-drip-bleed",
			"Water Drip",
			"水滴晕染",
			"texture",
			"texture-mask",
			0.75,
			{ maskShape: "drip", tags: ["drip", "water"], latest: true },
		],
		[
			"snow-mist-dissolve",
			"Snow Mist Dissolve",
			"雪雾消散",
			"particle",
			"particle-dissolve",
			0.8,
			{
				tuning: { intensity: 0.6, frequency: 3, tint: "#eef4ff" },
				tags: ["snow"],
			},
		],
	],
});

const distortionParity = categoryExpansion({
	category: "distortion",
	rows: [
		[
			"shockwave-cut",
			"Shockwave Cut",
			"冲击波切换",
			"ripple",
			"shockwave",
			0.55,
			{
				tuning: { intensity: 1, frequency: 1 },
				tags: ["shockwave"],
				popular: true,
			},
		],
		[
			"shockwave-heavy",
			"Shockwave II",
			"冲击波Ⅱ",
			"ripple",
			"shockwave",
			0.5,
			{ tuning: { intensity: 1.6, frequency: 0.7 }, tags: ["impact"] },
		],
		[
			"vortex-twist",
			"Vortex Twist",
			"涡旋扭转",
			"ripple",
			"vortex",
			0.65,
			{ tuning: { intensity: 1 }, tags: ["vortex", "swirl"], popular: true },
		],
		[
			"vortex-gentle",
			"Vortex Soft",
			"涡旋轻旋",
			"ripple",
			"vortex",
			0.75,
			{ tuning: { intensity: 0.5 }, tags: ["swirl", "soft"] },
		],
		[
			"water-pierce",
			"Water Pierce",
			"水波穿越",
			"ripple",
			"water-ripple",
			0.6,
			{
				tuning: { intensity: 1.3, frequency: 1.4 },
				tags: ["water"],
				latest: true,
			},
		],
		[
			"ripple-touch",
			"Ripple Touch",
			"涟漪轻探",
			"ripple",
			"water-ripple",
			0.8,
			{ tuning: { intensity: 0.5, frequency: 0.8 }, tags: ["gentle"] },
		],
		[
			"fisheye-pierce",
			"Fisheye Pierce",
			"鱼眼穿越Ⅲ",
			"zoom",
			"zoom-blur",
			0.5,
			{ tuning: { intensity: 1.7 }, tags: ["fisheye", "punch"] },
		],
		[
			"glass-shock",
			"Glass Shock",
			"玻璃冲击",
			"glass",
			"glass-refraction",
			0.5,
			{ tuning: { intensity: 1.25, frequency: 1.2 }, tags: ["glass"] },
		],
	],
});

const pseudo3dSlideshow = categoryExpansion({
	category: "slideshow",
	rows: [
		[
			"cube-rotate",
			"Cube Rotate",
			"立方旋转",
			"page",
			"cube",
			1,
			{
				easing: "linear",
				tuning: { intensity: 1 },
				tags: ["cube", "3d"],
				popular: true,
			},
		],
		[
			"cube-rotate-2",
			"Cube Rotate II",
			"立方旋转Ⅱ",
			"page",
			"cube",
			0.55,
			{ tuning: { intensity: 1.5 }, tags: ["cube", "fast"] },
		],
		[
			"curtain-open",
			"Curtain Open",
			"开幕",
			"texture",
			"texture-mask",
			0.7,
			{ maskShape: "curtain", tags: ["curtain", "reveal"], popular: true },
		],
		[
			"curtain-open-slow",
			"Curtain Open II",
			"开幕Ⅱ",
			"texture",
			"texture-mask",
			1,
			{ maskShape: "curtain", tags: ["curtain", "cinematic"] },
		],
		[
			"page-flip-up-2",
			"Page Flip Up II",
			"翻页Ⅱ",
			"page",
			"page-flip",
			0.6,
			{ direction: "up", tuning: { intensity: 0.9 }, tags: ["page"] },
		],
		[
			"fold-unfold",
			"Fold Unfold",
			"对折展开",
			"page",
			"page-flip",
			0.65,
			{
				direction: "left",
				tuning: { intensity: 1.4 },
				tags: ["fold"],
				latest: true,
			},
		],
	],
});

export const JIANYING_MASK_PARITY_EXPANSIONS: TransitionPreset[] = [
	...maskParityDissolve,
	...maskParitySlideshow,
	...maskParitySplit,
	...maskParityEmoji,
	...maskParityVariety,
	...maskParityNatural,
	...distortionParity,
	...pseudo3dSlideshow,
];
