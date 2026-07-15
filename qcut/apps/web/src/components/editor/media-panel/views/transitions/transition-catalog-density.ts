import type {
	ClipTransitionDirection,
	ClipTransitionTuning,
	ClipTransitionType,
} from "@/types/timeline";
import {
	defineTransitionPreset,
	TRANSITION_CONTENT_CATEGORIES,
	type TransitionContentCategory,
	type TransitionPreset,
	type TransitionType,
} from "./transition-preset-types";

interface DensityConfiguration {
	type: TransitionType;
	clipType: ClipTransitionType;
	direction?: ClipTransitionDirection;
	tuning?: ClipTransitionTuning;
}

interface DensityProfile {
	noun: string;
	localizedNoun: string;
	configurations: readonly DensityConfiguration[];
}

const MODIFIERS = [
	["Soft", "柔和"],
	["Cinematic", "电影感"],
	["Swift", "快速"],
	["Elastic", "弹性"],
	["Dreamy", "梦幻"],
	["Retro", "复古"],
	["Clean", "清爽"],
	["Bold", "强力"],
	["Smooth", "丝滑"],
	["Dynamic", "动感"],
	["Organic", "自然"],
	["Punchy", "冲击"],
] as const;

const PROFILES: Record<TransitionContentCategory, DensityProfile> = {
	dissolve: {
		noun: "Blend",
		localizedNoun: "叠化",
		configurations: [
			{ type: "dissolve", clipType: "dissolve" },
			{ type: "fade", clipType: "fade-black" },
			{ type: "flash", clipType: "flash", tuning: { intensity: 0.45 } },
			{
				type: "light",
				clipType: "light-leak",
				tuning: { intensity: 0.5, tint: "#ffd8b0" },
			},
		],
	},
	natural: {
		noun: "Flow",
		localizedNoun: "自然流动",
		configurations: [
			{ type: "dissolve", clipType: "dissolve" },
			{ type: "fade", clipType: "fade-white" },
			{ type: "slide", clipType: "slide", direction: "up" },
			{
				type: "light",
				clipType: "light-leak",
				tuning: { intensity: 0.35, tint: "#fff0c8" },
			},
		],
	},
	slideshow: {
		noun: "Gallery",
		localizedNoun: "相册切换",
		configurations: [
			{ type: "slide", clipType: "slide", direction: "left" },
			{ type: "push", clipType: "push", direction: "right" },
			{ type: "wipe", clipType: "wipe", direction: "up" },
			{ type: "zoom", clipType: "zoom-blur", tuning: { intensity: 0.55 } },
		],
	},
	split: {
		noun: "Split",
		localizedNoun: "分割切换",
		configurations: [
			{ type: "wipe", clipType: "wipe", direction: "left" },
			{ type: "push", clipType: "push", direction: "right" },
			{ type: "slide", clipType: "slide", direction: "down" },
			{
				type: "glitch",
				clipType: "rgb-glitch",
				tuning: { intensity: 0.5, frequency: 2 },
			},
		],
	},
	blur: {
		noun: "Blur",
		localizedNoun: "模糊",
		configurations: [
			{ type: "zoom", clipType: "zoom-blur", tuning: { intensity: 0.45 } },
			{
				type: "whip",
				clipType: "whip-pan",
				direction: "left",
				tuning: { intensity: 0.6 },
			},
			{
				type: "whip",
				clipType: "whip-pan",
				direction: "down",
				tuning: { intensity: 0.7 },
			},
			{
				type: "shake",
				clipType: "shake",
				tuning: { intensity: 0.35, frequency: 2.4 },
			},
		],
	},
	camera: {
		noun: "Camera Move",
		localizedNoun: "运镜",
		configurations: [
			{ type: "whip", clipType: "whip-pan", direction: "right" },
			{ type: "zoom", clipType: "zoom-blur", tuning: { intensity: 1.1 } },
			{
				type: "shake",
				clipType: "shake",
				tuning: { intensity: 0.65, frequency: 1.3 },
			},
			{ type: "push", clipType: "push", direction: "up" },
		],
	},
	shooting: {
		noun: "Lens Cut",
		localizedNoun: "拍摄切镜",
		configurations: [
			{ type: "flash", clipType: "flash", tuning: { intensity: 0.75 } },
			{ type: "whip", clipType: "whip-pan", direction: "left" },
			{
				type: "shake",
				clipType: "shake",
				tuning: { intensity: 0.4, frequency: 1.7 },
			},
			{ type: "fade", clipType: "fade-black" },
		],
	},
	distortion: {
		noun: "Warp",
		localizedNoun: "扭曲",
		configurations: [
			{
				type: "glitch",
				clipType: "rgb-glitch",
				tuning: { intensity: 0.7, frequency: 1.4 },
			},
			{ type: "zoom", clipType: "zoom-blur", tuning: { intensity: 1.4 } },
			{
				type: "shake",
				clipType: "shake",
				tuning: { intensity: 0.9, frequency: 0.7 },
			},
			{
				type: "whip",
				clipType: "whip-pan",
				direction: "up",
				tuning: { intensity: 1.25 },
			},
		],
	},
	light: {
		noun: "Light",
		localizedNoun: "光效",
		configurations: [
			{
				type: "flash",
				clipType: "flash",
				tuning: { intensity: 0.7, tint: "#ffffff" },
			},
			{
				type: "light",
				clipType: "light-leak",
				tuning: { intensity: 0.8, tint: "#ffb56e" },
			},
			{
				type: "light",
				clipType: "light-leak",
				tuning: { intensity: 1.1, tint: "#77d9ff" },
			},
			{
				type: "flash",
				clipType: "flash",
				tuning: { intensity: 1.25, tint: "#ffe2a8" },
			},
		],
	},
	glitch: {
		noun: "Signal",
		localizedNoun: "故障信号",
		configurations: [
			{
				type: "glitch",
				clipType: "rgb-glitch",
				tuning: { intensity: 0.45, frequency: 0.8 },
			},
			{
				type: "glitch",
				clipType: "rgb-glitch",
				tuning: { intensity: 0.9, frequency: 1.8 },
			},
			{
				type: "shake",
				clipType: "shake",
				tuning: { intensity: 0.35, frequency: 3.4 },
			},
			{
				type: "flash",
				clipType: "flash",
				tuning: { intensity: 0.55, tint: "#c6f6ff" },
			},
		],
	},
	variety: {
		noun: "Show",
		localizedNoun: "综艺",
		configurations: [
			{ type: "zoom", clipType: "zoom-blur", tuning: { intensity: 0.9 } },
			{
				type: "shake",
				clipType: "shake",
				tuning: { intensity: 0.6, frequency: 2.6 },
			},
			{
				type: "flash",
				clipType: "flash",
				tuning: { intensity: 0.8, tint: "#fff3a8" },
			},
			{ type: "push", clipType: "push", direction: "right" },
		],
	},
	mg: {
		noun: "Motion",
		localizedNoun: "MG 动画",
		configurations: [
			{ type: "zoom", clipType: "zoom-blur", tuning: { intensity: 1.1 } },
			{ type: "push", clipType: "push", direction: "left" },
			{ type: "wipe", clipType: "wipe", direction: "down" },
			{
				type: "shake",
				clipType: "shake",
				tuning: { intensity: 0.65, frequency: 2.2 },
			},
		],
	},
	emoji: {
		noun: "Reaction",
		localizedNoun: "互动表情",
		configurations: [
			{ type: "zoom", clipType: "zoom-blur", tuning: { intensity: 0.75 } },
			{
				type: "shake",
				clipType: "shake",
				tuning: { intensity: 0.45, frequency: 3 },
			},
			{
				type: "flash",
				clipType: "flash",
				tuning: { intensity: 0.65, tint: "#ffadd2" },
			},
			{
				type: "light",
				clipType: "light-leak",
				tuning: { intensity: 0.55, tint: "#fff1a0" },
			},
		],
	},
};

function variedTuning({
	tuning,
	index,
}: {
	tuning: ClipTransitionTuning | undefined;
	index: number;
}): ClipTransitionTuning | undefined {
	if (!tuning) return undefined;
	const multiplier = 0.78 + (index % 5) * 0.16;
	return {
		...tuning,
		...(tuning.intensity
			? { intensity: Math.min(2, tuning.intensity * multiplier) }
			: {}),
		...(tuning.frequency
			? { frequency: Math.min(4, tuning.frequency * multiplier) }
			: {}),
	};
}

export function buildTransitionCatalogDensity({
	presets,
	minimumPerCategory = 20,
}: {
	presets: readonly TransitionPreset[];
	minimumPerCategory?: number;
}): TransitionPreset[] {
	const generated: TransitionPreset[] = [];
	for (const category of TRANSITION_CONTENT_CATEGORIES) {
		const currentCount = presets.filter(
			(preset) => preset.category === category
		).length;
		const missingCount = Math.max(0, minimumPerCategory - currentCount);
		const profile = PROFILES[category];
		for (let index = 0; index < missingCount; index += 1) {
			const modifier = MODIFIERS[index % MODIFIERS.length];
			const configuration =
				profile.configurations[index % profile.configurations.length];
			generated.push(
				defineTransitionPreset({
					id: `${category}-collection-${index + 1}`,
					name: `${modifier[0]} ${profile.noun}`,
					localizedName: `${modifier[1]}${profile.localizedNoun}`,
					category,
					type: configuration.type,
					clipType: configuration.clipType,
					direction: configuration.direction,
					tuning: variedTuning({ tuning: configuration.tuning, index }),
					defaultDuration: 0.34 + (index % 6) * 0.08,
					delivery: index % 3 === 2 ? "remote" : "bundled",
					premium: index % 8 === 7,
					popular: index === 0,
					latest: index >= Math.max(0, missingCount - 2),
					tags: ["curated", "category-pack", modifier[0]],
				})
			);
		}
	}
	return generated;
}
