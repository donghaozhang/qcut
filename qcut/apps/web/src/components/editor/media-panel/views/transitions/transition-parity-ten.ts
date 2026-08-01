import type { ClipTransitionPresetConfig } from "./transition-preset-types";

export const TRANSITION_PARITY_PROGRESS_STOPS = [
	0, 0.25, 0.5, 0.75, 1,
] as const;

type TransitionParityVisualSemantics =
	| "crossfade"
	| "zoom-crossfade"
	| "page-flip"
	| "cube-rotation"
	| "move-left"
	| "move-right"
	| "zoom-defocus"
	| "horizontal-motion-blur"
	| "circle-mask"
	| "heart-mask";

export interface TransitionParityCase {
	jianyingName: string;
	qcutPresetId: string;
	visualSemantics: TransitionParityVisualSemantics;
	expectedConfig: ClipTransitionPresetConfig;
	expectedDuration?: number;
}

export const TRANSITION_PARITY_CASES = [
	{
		jianyingName: "叠化",
		qcutPresetId: "dissolve",
		visualSemantics: "crossfade",
		expectedConfig: { type: "dissolve", easing: "linear" },
		expectedDuration: 0.5,
	},
	{
		jianyingName: "叠化拉近",
		qcutPresetId: "dissolve-zoom-in",
		visualSemantics: "zoom-crossfade",
		expectedConfig: {
			type: "zoom-in-blur",
			tuning: { intensity: 0.22 },
		},
	},
	{
		jianyingName: "翻页",
		qcutPresetId: "page-flip",
		visualSemantics: "page-flip",
		expectedConfig: {
			type: "page-flip",
			easing: "linear",
			direction: "left",
			tuning: { intensity: 0.7 },
		},
		expectedDuration: 0.5,
	},
	{
		jianyingName: "立方旋转",
		qcutPresetId: "cube-rotate",
		visualSemantics: "cube-rotation",
		expectedConfig: {
			type: "cube",
			easing: "linear",
			tuning: { intensity: 1 },
		},
		expectedDuration: 1,
	},
	{
		jianyingName: "左移",
		qcutPresetId: "move-left",
		visualSemantics: "move-left",
		expectedConfig: {
			type: "push",
			easing: "easeInOutQuint",
			direction: "right",
		},
		expectedDuration: 1,
	},
	{
		jianyingName: "右移",
		qcutPresetId: "move-right",
		visualSemantics: "move-right",
		expectedConfig: {
			type: "push",
			easing: "easeInOutQuint",
			direction: "left",
		},
		expectedDuration: 1,
	},
	{
		jianyingName: "推镜虚化",
		qcutPresetId: "push-zoom-defocus",
		visualSemantics: "zoom-defocus",
		expectedConfig: {
			type: "zoom-blur",
			tuning: { intensity: 0.75 },
		},
	},
	{
		jianyingName: "横移模糊",
		qcutPresetId: "horizontal-motion-blur",
		visualSemantics: "horizontal-motion-blur",
		expectedConfig: {
			type: "motion-blur",
			easing: "linear",
			direction: "left",
			tuning: { intensity: 0.65 },
		},
		expectedDuration: 0.8,
	},
	{
		jianyingName: "圆形遮罩 II",
		qcutPresetId: "circle-expand",
		visualSemantics: "circle-mask",
		expectedConfig: {
			type: "texture-mask",
			maskShape: "circle",
		},
	},
	{
		jianyingName: "心形叠化",
		qcutPresetId: "heart-expand",
		visualSemantics: "heart-mask",
		expectedConfig: {
			type: "texture-mask",
			maskShape: "heart",
		},
	},
] as const satisfies readonly TransitionParityCase[];
