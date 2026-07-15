import type { TransitionPreset } from "../transition-preset-types";
import { categoryExpansion } from "./build-category-expansion";

const dissolveExpansions = categoryExpansion({
	category: "dissolve",
	rows: [
		[
			"filmic-dissolve",
			"Filmic Dissolve",
			"电影叠化",
			"dissolve",
			"dissolve",
			0.75,
			{ tags: ["cinematic", "blend"], popular: true },
		],
		[
			"luminous-dissolve",
			"Luminous Dissolve",
			"柔光叠化",
			"flash",
			"flash",
			0.6,
			{
				tuning: { intensity: 0.35, tint: "#fff4dc" },
				tags: ["luminous", "soft"],
			},
		],
		[
			"warm-dissolve",
			"Warm Dissolve",
			"暖色叠化",
			"light",
			"light-leak",
			0.72,
			{
				tuning: { intensity: 0.35, frequency: 0.55, tint: "#ffbf8a" },
				tags: ["warm", "organic"],
			},
		],
		[
			"zoom-dissolve",
			"Zoom Dissolve",
			"变焦叠化",
			"zoom",
			"zoom-blur",
			0.55,
			{ tuning: { intensity: 0.35 }, tags: ["zoom", "blend"] },
		],
		[
			"charcoal-dissolve",
			"Charcoal Dissolve",
			"暗部叠化",
			"fade",
			"fade-black",
			0.7,
			{ tags: ["dark", "cinematic"], latest: true },
		],
	],
});

const naturalExpansions = categoryExpansion({
	category: "natural",
	rows: [
		[
			"gentle-crossfade",
			"Gentle Crossfade",
			"轻柔过渡",
			"dissolve",
			"dissolve",
			0.9,
			{ tags: ["gentle", "calm"], popular: true },
		],
		[
			"sunrise-fade",
			"Sunrise Fade",
			"晨光渐入",
			"fade",
			"fade-white",
			0.8,
			{ tags: ["sunrise", "bright"] },
		],
		[
			"dusk-fade",
			"Dusk Fade",
			"暮色渐隐",
			"fade",
			"fade-black",
			0.85,
			{ tags: ["dusk", "quiet"] },
		],
		[
			"breeze-glide",
			"Breeze Glide",
			"清风滑入",
			"slide",
			"slide",
			0.7,
			{ direction: "up", tags: ["breeze", "gentle-motion"] },
		],
		[
			"daylight-leak",
			"Daylight Leak",
			"日光漫入",
			"light",
			"light-leak",
			0.78,
			{
				tuning: { intensity: 0.3, frequency: 0.7, tint: "#fff0c2" },
				tags: ["daylight", "soft"],
				latest: true,
			},
		],
	],
});

const slideshowExpansions = categoryExpansion({
	category: "slideshow",
	rows: [
		[
			"album-slide-left",
			"Album Slide Left",
			"相册左滑",
			"slide",
			"slide",
			0.6,
			{ direction: "left", tags: ["album", "gallery"], popular: true },
		],
		[
			"carousel-push-right",
			"Carousel Push Right",
			"轮播右推",
			"push",
			"push",
			0.58,
			{ direction: "right", tags: ["carousel", "photo"] },
		],
		[
			"vertical-page-reveal",
			"Vertical Page Reveal",
			"竖向揭页",
			"wipe",
			"wipe",
			0.68,
			{ direction: "up", tags: ["page", "reveal"] },
		],
		[
			"photo-flash",
			"Photo Flash",
			"照片闪切",
			"flash",
			"flash",
			0.34,
			{
				tuning: { intensity: 0.8, tint: "#ffffff" },
				tags: ["photo", "flash"],
			},
		],
		[
			"scrapbook-zoom",
			"Scrapbook Zoom",
			"剪贴簿缩放",
			"zoom",
			"zoom-blur",
			0.52,
			{
				tuning: { intensity: 0.55 },
				tags: ["scrapbook", "zoom"],
				latest: true,
			},
		],
	],
});

const splitExpansions = categoryExpansion({
	category: "split",
	rows: [
		[
			"split-flash-cut",
			"Split Flash Cut",
			"分屏闪切",
			"flash",
			"flash",
			0.3,
			{
				tuning: { intensity: 0.65, tint: "#ffffff" },
				tags: ["split", "flash"],
				popular: true,
			},
		],
		[
			"split-zoom-in",
			"Split Zoom In",
			"分屏推进",
			"zoom",
			"zoom-blur",
			0.4,
			{ tuning: { intensity: 0.75 }, tags: ["split", "zoom"] },
		],
		[
			"split-signal",
			"Split Signal",
			"分屏信号切换",
			"glitch",
			"rgb-glitch",
			0.34,
			{
				tuning: { intensity: 0.45, frequency: 2.1 },
				tags: ["split", "signal"],
			},
		],
		[
			"split-whip-down",
			"Split Whip Down",
			"分屏下甩",
			"whip",
			"whip-pan",
			0.38,
			{
				direction: "down",
				tuning: { intensity: 0.7 },
				tags: ["split", "whip"],
			},
		],
		[
			"split-impact",
			"Split Impact",
			"分屏冲击",
			"shake",
			"shake",
			0.36,
			{
				tuning: { intensity: 0.55, frequency: 1.5 },
				tags: ["split", "impact"],
				latest: true,
			},
		],
	],
});

export const CLASSIC_TRANSITION_CATEGORY_EXPANSIONS: TransitionPreset[] = [
	...dissolveExpansions,
	...naturalExpansions,
	...slideshowExpansions,
	...splitExpansions,
];
