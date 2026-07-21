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

const maskParityDissolve = categoryExpansion({
	category: "dissolve",
	rows: [
		[
			"circle-expand",
			"Circle Expand",
			"圆圈扩散",
			"texture",
			"texture-mask",
			0.6,
			{ maskShape: "circle", tags: ["circle", "mask"], popular: true },
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
			"爱心扩散",
			"texture",
			"texture-mask",
			0.65,
			{ maskShape: "heart", tags: ["heart", "love"], popular: true },
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
			"水墨晕染",
			"texture",
			"texture-mask",
			0.8,
			{ maskShape: "ink", tags: ["ink", "水墨"], popular: true },
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
			0.7,
			{ tuning: { intensity: 1 }, tags: ["cube", "3d"], popular: true },
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
	...maskParityDissolve,
	...maskParitySlideshow,
	...maskParitySplit,
	...maskParityEmoji,
	...maskParityVariety,
	...maskParityNatural,
	...distortionParity,
	...pseudo3dSlideshow,
];
