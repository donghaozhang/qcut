import type { ClipTransitionPresetConfig } from "./transition-preset-types";

export const TRANSITION_PARITY_PROGRESS_STOPS = [0.25, 0.5, 0.75] as const;

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
}

export const TRANSITION_PARITY_CASES = [
	{
		jianyingName: "叠化",
		qcutPresetId: "dissolve",
		visualSemantics: "crossfade",
		expectedConfig: { type: "dissolve" },
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
			direction: "left",
			tuning: { intensity: 0.7 },
		},
	},
	{
		jianyingName: "立方旋转",
		qcutPresetId: "cube-rotate",
		visualSemantics: "cube-rotation",
		expectedConfig: {
			type: "cube",
			tuning: { intensity: 1 },
		},
	},
	{
		jianyingName: "左移",
		qcutPresetId: "move-left",
		visualSemantics: "move-left",
		expectedConfig: {
			type: "push",
			direction: "right",
		},
	},
	{
		jianyingName: "右移",
		qcutPresetId: "move-right",
		visualSemantics: "move-right",
		expectedConfig: {
			type: "push",
			direction: "left",
		},
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
			direction: "left",
			tuning: { intensity: 0.65 },
		},
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
