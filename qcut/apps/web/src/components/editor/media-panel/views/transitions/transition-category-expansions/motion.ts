import type { TransitionPreset } from "../transition-preset-types";
import { categoryExpansion } from "./build-category-expansion";

const blurExpansions = categoryExpansion({
	category: "blur",
	rows: [
		[
			"mist-pulse-blur",
			"Mist Pulse Blur",
			"薄雾脉冲",
			"zoom",
			"zoom-blur",
			0.72,
			{ tuning: { intensity: 0.25 }, tags: ["mist", "soft"], popular: true },
		],
		[
			"horizontal-smear",
			"Horizontal Smear",
			"横向拖影",
			"whip",
			"whip-pan",
			0.48,
			{
				direction: "left",
				tuning: { intensity: 0.45 },
				tags: ["horizontal", "smear"],
			},
		],
		[
			"vertical-smear",
			"Vertical Smear",
			"竖向拖影",
			"whip",
			"whip-pan",
			0.5,
			{
				direction: "down",
				tuning: { intensity: 0.55 },
				tags: ["vertical", "smear"],
			},
		],
		[
			"radial-rush-blur",
			"Radial Rush Blur",
			"径向疾驰",
			"zoom",
			"zoom-blur",
			0.42,
			{ tuning: { intensity: 2 }, tags: ["radial", "rush"] },
		],
		[
			"tremor-blur",
			"Tremor Blur",
			"震颤模糊",
			"shake",
			"shake",
			0.44,
			{
				tuning: { intensity: 0.25, frequency: 3.2 },
				tags: ["tremor", "blur"],
				latest: true,
			},
		],
	],
});

const cameraExpansions = categoryExpansion({
	category: "camera",
	rows: [
		[
			"crash-zoom",
			"Crash Zoom",
			"急速推镜",
			"zoom",
			"zoom-blur",
			0.36,
			{
				tuning: { intensity: 1.8 },
				tags: ["camera", "crash-zoom"],
				popular: true,
			},
		],
		[
			"soft-pan-left",
			"Soft Pan Left",
			"柔和左摇",
			"whip",
			"whip-pan",
			0.58,
			{
				direction: "left",
				tuning: { intensity: 0.6 },
				tags: ["camera", "pan"],
			},
		],
		[
			"hard-pan-down",
			"Hard Pan Down",
			"强力下摇",
			"whip",
			"whip-pan",
			0.34,
			{
				direction: "down",
				tuning: { intensity: 1.4 },
				tags: ["camera", "pan"],
			},
		],
		[
			"documentary-jolt",
			"Documentary Jolt",
			"纪实顿挫",
			"shake",
			"shake",
			0.42,
			{
				tuning: { intensity: 0.65, frequency: 1.2 },
				tags: ["documentary", "jolt"],
			},
		],
		[
			"orbit-hit",
			"Orbit Hit",
			"环绕冲击",
			"shake",
			"shake",
			0.52,
			{
				tuning: { intensity: 1.1, frequency: 0.45 },
				tags: ["orbit", "impact"],
				latest: true,
			},
		],
	],
});

const shootingExpansions = categoryExpansion({
	category: "shooting",
	rows: [
		[
			"rack-focus-cut",
			"Rack Focus Cut",
			"移焦切镜",
			"zoom",
			"zoom-blur",
			0.46,
			{ tuning: { intensity: 0.28 }, tags: ["focus", "lens"], popular: true },
		],
		[
			"snap-pan",
			"Snap Pan",
			"快速摇镜",
			"whip",
			"whip-pan",
			0.32,
			{
				direction: "right",
				tuning: { intensity: 1.2 },
				tags: ["camera", "snap"],
			},
		],
		[
			"exposure-pop",
			"Exposure Pop",
			"曝光闪变",
			"flash",
			"flash",
			0.3,
			{
				tuning: { intensity: 0.75, tint: "#fff2d6" },
				tags: ["exposure", "flash"],
			},
		],
		[
			"tripod-bump",
			"Tripod Bump",
			"脚架轻碰",
			"shake",
			"shake",
			0.4,
			{
				tuning: { intensity: 0.3, frequency: 0.85 },
				tags: ["tripod", "bump"],
			},
		],
		[
			"lens-cap-cut",
			"Lens Cap Cut",
			"镜头盖切黑",
			"fade",
			"fade-black",
			0.48,
			{ tags: ["lens", "black"], latest: true },
		],
	],
});

const distortionExpansions = categoryExpansion({
	category: "distortion",
	rows: [
		[
			"ripple-warp",
			"Ripple Warp",
			"涟漪扭曲",
			"zoom",
			"zoom-blur",
			0.58,
			{ tuning: { intensity: 1.6 }, tags: ["ripple", "warp"], popular: true },
		],
		[
			"digital-twist",
			"Digital Twist",
			"数字扭转",
			"glitch",
			"rgb-glitch",
			0.4,
			{
				tuning: { intensity: 0.5, frequency: 3 },
				tags: ["digital", "twist"],
			},
		],
		[
			"stretch-whip",
			"Stretch Whip",
			"拉伸甩动",
			"whip",
			"whip-pan",
			0.42,
			{
				direction: "up",
				tuning: { intensity: 1.4 },
				tags: ["stretch", "whip"],
			},
		],
		[
			"warped-flash",
			"Warped Flash",
			"扭曲闪光",
			"flash",
			"flash",
			0.36,
			{
				tuning: { intensity: 1.25, tint: "#d8c4ff" },
				tags: ["warp", "flash"],
			},
		],
		[
			"seismic-warp",
			"Seismic Warp",
			"地震扭曲",
			"shake",
			"shake",
			0.5,
			{
				tuning: { intensity: 1.6, frequency: 0.4 },
				tags: ["seismic", "warp"],
				latest: true,
			},
		],
	],
});

export const MOTION_TRANSITION_CATEGORY_EXPANSIONS: TransitionPreset[] = [
	...blurExpansions,
	...cameraExpansions,
	...shootingExpansions,
	...distortionExpansions,
];
