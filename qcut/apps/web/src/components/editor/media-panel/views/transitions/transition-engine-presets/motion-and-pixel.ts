import type { TransitionPreset } from "../transition-preset-types";
import { enginePresetFamily } from "./build-engine-preset-family";

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

export const MOTION_AND_PIXEL_PRESETS: TransitionPreset[] = [
	...motionBlurPresets,
	...pixelatePresets,
];
