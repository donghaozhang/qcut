import type {
	ClipTransitionDirection,
	ClipTransitionTuning,
	ClipTransitionType,
} from "@/types/timeline";
import {
	defineTransitionPreset,
	type TransitionContentCategory,
	type TransitionPreset,
	type TransitionType,
} from "./transition-preset-types";

interface EngineVariant {
	id: string;
	name: string;
	localizedName: string;
	category: TransitionContentCategory;
	direction?: ClipTransitionDirection;
	intensity: number;
	frequency?: number;
	tint?: string;
}

function enginePresetFamily({
	clipType,
	type,
	variants,
}: {
	clipType: ClipTransitionType;
	type: TransitionType;
	variants: readonly EngineVariant[];
}): TransitionPreset[] {
	return variants.map((variant, index) => {
		const tuning: ClipTransitionTuning = {
			intensity: variant.intensity,
			...(variant.frequency ? { frequency: variant.frequency } : {}),
			...(variant.tint ? { tint: variant.tint } : {}),
		};
		return defineTransitionPreset({
			...variant,
			type,
			clipType,
			tuning,
			defaultDuration: 0.36 + (index % 5) * 0.07,
			delivery: index >= 4 ? "remote" : "bundled",
			premium: index === variants.length - 1,
			popular: index === 0,
			latest: index >= variants.length - 2,
			tags: [clipType, type, "advanced-engine"],
		});
	});
}

const motionBlurPresets = enginePresetFamily({
	clipType: "motion-blur",
	type: "motion-blur",
	variants: [
		{
			id: "directional-smear-left",
			name: "Directional Smear Left",
			localizedName: "向左拖影",
			category: "blur",
			direction: "left",
			intensity: 0.65,
		},
		{
			id: "directional-smear-right",
			name: "Directional Smear Right",
			localizedName: "向右拖影",
			category: "blur",
			direction: "right",
			intensity: 0.8,
		},
		{
			id: "vertical-motion-up",
			name: "Vertical Motion Up",
			localizedName: "向上动感模糊",
			category: "blur",
			direction: "up",
			intensity: 0.9,
		},
		{
			id: "vertical-motion-down",
			name: "Vertical Motion Down",
			localizedName: "向下动感模糊",
			category: "blur",
			direction: "down",
			intensity: 1.05,
		},
		{
			id: "speed-trail",
			name: "Speed Trail",
			localizedName: "高速轨迹",
			category: "camera",
			direction: "left",
			intensity: 1.25,
		},
		{
			id: "action-drag",
			name: "Action Drag",
			localizedName: "动作拖影",
			category: "shooting",
			direction: "right",
			intensity: 1.4,
		},
		{
			id: "soft-motion-echo",
			name: "Soft Motion Echo",
			localizedName: "柔和运动残影",
			category: "blur",
			direction: "left",
			intensity: 0.4,
		},
		{
			id: "rush-frame",
			name: "Rush Frame",
			localizedName: "疾驰镜头",
			category: "camera",
			direction: "down",
			intensity: 1.8,
		},
	],
});

const pixelatePresets = enginePresetFamily({
	clipType: "pixelate",
	type: "pixel",
	variants: [
		{
			id: "pixel-collapse",
			name: "Pixel Collapse",
			localizedName: "像素坍缩",
			category: "glitch",
			intensity: 0.55,
		},
		{
			id: "mosaic-burst",
			name: "Mosaic Burst",
			localizedName: "马赛克爆发",
			category: "glitch",
			intensity: 1.25,
		},
		{
			id: "retro-blocks",
			name: "Retro Blocks",
			localizedName: "复古方块",
			category: "mg",
			intensity: 0.8,
		},
		{
			id: "digital-mosaic",
			name: "Digital Mosaic",
			localizedName: "数字马赛克",
			category: "distortion",
			intensity: 1.1,
		},
		{
			id: "pixel-scatter",
			name: "Pixel Scatter",
			localizedName: "像素散开",
			category: "variety",
			intensity: 1.45,
		},
		{
			id: "low-res-snap",
			name: "Low Resolution Snap",
			localizedName: "低清闪切",
			category: "glitch",
			intensity: 0.7,
		},
		{
			id: "block-reveal",
			name: "Block Reveal",
			localizedName: "方块显现",
			category: "mg",
			intensity: 1.65,
		},
		{
			id: "pixel-wipe",
			name: "Pixel Wipe",
			localizedName: "像素擦除",
			category: "split",
			direction: "right",
			intensity: 1.9,
		},
	],
});

const waterRipplePresets = enginePresetFamily({
	clipType: "water-ripple",
	type: "ripple",
	variants: [
		{
			id: "pond-ripple",
			name: "Pond Ripple",
			localizedName: "池水涟漪",
			category: "natural",
			intensity: 0.45,
			frequency: 0.65,
		},
		{
			id: "water-drop-ring",
			name: "Water Drop Ring",
			localizedName: "水滴圆环",
			category: "natural",
			intensity: 0.7,
			frequency: 1.1,
		},
		{
			id: "liquid-ring",
			name: "Liquid Ring",
			localizedName: "液态波环",
			category: "distortion",
			intensity: 1.05,
			frequency: 1.4,
		},
		{
			id: "wave-lens",
			name: "Wave Lens",
			localizedName: "波浪镜头",
			category: "distortion",
			intensity: 1.3,
			frequency: 0.8,
		},
		{
			id: "aqua-pulse",
			name: "Aqua Pulse",
			localizedName: "水光脉冲",
			category: "light",
			intensity: 0.8,
			frequency: 1.8,
			tint: "#8ee8ff",
		},
		{
			id: "echo-ripple",
			name: "Echo Ripple",
			localizedName: "回声涟漪",
			category: "variety",
			intensity: 1.55,
			frequency: 2.2,
		},
		{
			id: "rain-circle",
			name: "Rain Circle",
			localizedName: "雨点波纹",
			category: "shooting",
			intensity: 0.65,
			frequency: 2.8,
		},
		{
			id: "dream-ripple",
			name: "Dream Ripple",
			localizedName: "梦境水波",
			category: "slideshow",
			intensity: 1.75,
			frequency: 0.5,
		},
	],
});

const particlePresets = enginePresetFamily({
	clipType: "particle-dissolve",
	type: "particle",
	variants: [
		{
			id: "dust-dissolve",
			name: "Dust Dissolve",
			localizedName: "尘埃消散",
			category: "dissolve",
			intensity: 0.65,
			frequency: 0.8,
		},
		{
			id: "grain-scatter",
			name: "Grain Scatter",
			localizedName: "颗粒散开",
			category: "dissolve",
			intensity: 1,
			frequency: 1.4,
		},
		{
			id: "spark-particles",
			name: "Spark Particles",
			localizedName: "火花粒子",
			category: "light",
			intensity: 1.2,
			frequency: 1.8,
			tint: "#ffd56a",
		},
		{
			id: "confetti-dissolve",
			name: "Confetti Dissolve",
			localizedName: "彩纸消散",
			category: "variety",
			intensity: 1.35,
			frequency: 2.1,
		},
		{
			id: "heart-dust",
			name: "Heart Dust",
			localizedName: "心形微尘",
			category: "emoji",
			intensity: 0.8,
			frequency: 1.2,
			tint: "#ff8fb4",
		},
		{
			id: "star-scatter",
			name: "Star Scatter",
			localizedName: "星光散落",
			category: "emoji",
			intensity: 1.55,
			frequency: 2.5,
		},
		{
			id: "pixel-dust",
			name: "Pixel Dust",
			localizedName: "像素尘粒",
			category: "mg",
			intensity: 1.7,
			frequency: 3,
		},
		{
			id: "ash-transition",
			name: "Ash Transition",
			localizedName: "灰烬过渡",
			category: "natural",
			intensity: 1.9,
			frequency: 0.55,
		},
	],
});

const glassPresets = enginePresetFamily({
	clipType: "glass-refraction",
	type: "glass",
	variants: [
		{
			id: "glass-slice",
			name: "Glass Slice",
			localizedName: "玻璃切片",
			category: "distortion",
			direction: "left",
			intensity: 0.7,
			frequency: 1,
		},
		{
			id: "prism-bars",
			name: "Prism Bars",
			localizedName: "棱镜条纹",
			category: "light",
			direction: "right",
			intensity: 0.95,
			frequency: 1.6,
		},
		{
			id: "crystal-shift",
			name: "Crystal Shift",
			localizedName: "水晶偏移",
			category: "slideshow",
			direction: "up",
			intensity: 0.55,
			frequency: 0.7,
		},
		{
			id: "glass-pan",
			name: "Glass Pan",
			localizedName: "玻璃摇镜",
			category: "camera",
			direction: "down",
			intensity: 1.15,
			frequency: 1.2,
		},
		{
			id: "refraction-cut",
			name: "Refraction Cut",
			localizedName: "折射切镜",
			category: "shooting",
			direction: "left",
			intensity: 1.35,
			frequency: 2,
		},
		{
			id: "shard-sweep",
			name: "Shard Sweep",
			localizedName: "碎片扫过",
			category: "split",
			direction: "right",
			intensity: 1.6,
			frequency: 2.4,
		},
		{
			id: "kaleido-glass",
			name: "Kaleido Glass",
			localizedName: "万花玻璃",
			category: "variety",
			direction: "up",
			intensity: 1.8,
			frequency: 3,
		},
		{
			id: "neon-glass",
			name: "Neon Glass",
			localizedName: "霓虹玻璃",
			category: "glitch",
			direction: "down",
			intensity: 2,
			frequency: 3.6,
			tint: "#70f4ff",
		},
	],
});

const pageFlipPresets = enginePresetFamily({
	clipType: "page-flip",
	type: "page",
	variants: [
		{
			id: "page-flip-left",
			name: "Page Flip Left",
			localizedName: "向左翻页",
			category: "slideshow",
			direction: "left",
			intensity: 0.7,
		},
		{
			id: "page-flip-right",
			name: "Page Flip Right",
			localizedName: "向右翻页",
			category: "slideshow",
			direction: "right",
			intensity: 0.8,
		},
		{
			id: "page-flip-up",
			name: "Page Flip Up",
			localizedName: "向上翻页",
			category: "slideshow",
			direction: "up",
			intensity: 0.95,
		},
		{
			id: "page-flip-down",
			name: "Page Flip Down",
			localizedName: "向下翻页",
			category: "slideshow",
			direction: "down",
			intensity: 1.05,
		},
		{
			id: "card-turn",
			name: "Card Turn",
			localizedName: "卡片翻转",
			category: "mg",
			direction: "right",
			intensity: 1.2,
		},
		{
			id: "album-leaf",
			name: "Album Leaf",
			localizedName: "相册揭页",
			category: "slideshow",
			direction: "left",
			intensity: 0.55,
		},
		{
			id: "panel-fold",
			name: "Panel Fold",
			localizedName: "面板折叠",
			category: "split",
			direction: "up",
			intensity: 1.45,
		},
		{
			id: "poster-flip",
			name: "Poster Flip",
			localizedName: "海报翻转",
			category: "variety",
			direction: "down",
			intensity: 1.8,
		},
	],
});

const texturePresets = enginePresetFamily({
	clipType: "texture-mask",
	type: "texture",
	variants: [
		{
			id: "paper-grain-reveal",
			name: "Paper Grain Reveal",
			localizedName: "纸张颗粒显现",
			category: "dissolve",
			intensity: 0.55,
			frequency: 0.7,
		},
		{
			id: "ink-texture",
			name: "Ink Texture",
			localizedName: "墨迹纹理",
			category: "natural",
			intensity: 0.8,
			frequency: 1.1,
		},
		{
			id: "brush-reveal",
			name: "Brush Reveal",
			localizedName: "笔刷显现",
			category: "slideshow",
			direction: "right",
			intensity: 1,
			frequency: 1.5,
		},
		{
			id: "canvas-wipe",
			name: "Canvas Wipe",
			localizedName: "画布擦除",
			category: "split",
			direction: "left",
			intensity: 1.2,
			frequency: 1.8,
		},
		{
			id: "film-grain-mask",
			name: "Film Grain Mask",
			localizedName: "胶片颗粒蒙版",
			category: "shooting",
			intensity: 1.35,
			frequency: 2.1,
		},
		{
			id: "halftone-texture",
			name: "Halftone Texture",
			localizedName: "半调纹理",
			category: "variety",
			intensity: 1.55,
			frequency: 2.6,
		},
		{
			id: "scribble-reveal",
			name: "Scribble Reveal",
			localizedName: "涂鸦显现",
			category: "emoji",
			intensity: 1.75,
			frequency: 3,
		},
		{
			id: "geometric-texture",
			name: "Geometric Texture",
			localizedName: "几何纹理",
			category: "mg",
			intensity: 2,
			frequency: 3.5,
		},
	],
});

const lensFlarePresets = enginePresetFamily({
	clipType: "lens-flare",
	type: "flare",
	variants: [
		{
			id: "golden-lens-flare",
			name: "Golden Lens Flare",
			localizedName: "金色镜头光晕",
			category: "light",
			intensity: 0.7,
			tint: "#ffd38a",
		},
		{
			id: "blue-anamorphic-flare",
			name: "Blue Anamorphic Flare",
			localizedName: "蓝色宽银幕耀斑",
			category: "light",
			intensity: 0.9,
			tint: "#78c8ff",
		},
		{
			id: "sunset-flare",
			name: "Sunset Flare",
			localizedName: "落日光晕",
			category: "natural",
			intensity: 0.6,
			tint: "#ffad6b",
		},
		{
			id: "camera-flare-sweep",
			name: "Camera Flare Sweep",
			localizedName: "镜头扫光",
			category: "shooting",
			direction: "right",
			intensity: 1.15,
			tint: "#fff4d6",
		},
		{
			id: "prism-camera-flare",
			name: "Prism Camera Flare",
			localizedName: "棱镜镜光",
			category: "camera",
			intensity: 1.35,
			tint: "#d7b8ff",
		},
		{
			id: "neon-flare",
			name: "Neon Flare",
			localizedName: "霓虹耀斑",
			category: "glitch",
			intensity: 1.5,
			tint: "#57f4ff",
		},
		{
			id: "stage-beam",
			name: "Stage Beam",
			localizedName: "舞台光束",
			category: "variety",
			intensity: 1.7,
			tint: "#ff7dd8",
		},
		{
			id: "starburst-flare",
			name: "Starburst Flare",
			localizedName: "星芒耀斑",
			category: "emoji",
			intensity: 2,
			tint: "#fff1a6",
		},
	],
});

export const TRANSITION_ENGINE_PRESETS: TransitionPreset[] = [
	...motionBlurPresets,
	...pixelatePresets,
	...waterRipplePresets,
	...particlePresets,
	...glassPresets,
	...pageFlipPresets,
	...texturePresets,
	...lensFlarePresets,
];
