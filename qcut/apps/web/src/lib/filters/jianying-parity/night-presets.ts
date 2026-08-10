import type { FilterPreset } from "../filter-types";
import { COOL_FIREWORKS_RECIPE } from "./cool-fireworks-recipe";
import {
	ORANGE_TEAL_BACKGROUND_RECIPE,
	ORANGE_TEAL_SKIN_TONE_RECIPE,
} from "./orange-teal-recipes";

export const JIANYING_NIGHT_PARITY_FILTER_PRESETS: FilterPreset[] = [
	{
		id: "jy-night-dehaze",
		version: 1,
		name: "Night Dehaze",
		localizedName: "夜景去雾",
		category: "night",
		tags: ["night", "cityscape", "夜景", "夜景去雾", "Night Dehaze"],
		thumbnail: "/images/filter-previews/jy-night-dehaze.webp",
		lutAssetId: "qcut/filter/jy-night-dehaze/v1",
		defaultIntensity: 100,
		isNew: true,
		recipe: {
			polynomialCorrection: {
				offset: [-0.0023, 0.0008, -0.0044],
				linear: [
					[0.4591, -0.0068, 0.0238],
					[0.025, 0.3437, -0.0051],
					[-0.0485, -0.0362, 0.6628],
				],
				squared: [
					[-0.0596, -0.5407, -0.2481],
					[-0.2797, 0.9829, -0.2068],
					[0.2026, -0.2541, -1.8458],
				],
				cross: [
					[1.1247, 0.1761, 0.3214],
					[-0.0536, 0.3971, 0.7346],
					[0.4736, -0.499, 1.1704],
				],
				cubic: {
					pure: [
						[8.4544, 1.7245, 0.9345],
						[1.2607, 3.8116, 0.6004],
						[-0.2051, 1.3066, 11.5849],
					],
					mixed: [
						[-6.2723, -1.5559, -0.365, 0.087, -0.0466, -0.7765],
						[-0.035, -0.792, -0.5132, -3.4745, -0.9302, -0.7762],
						[-1.0386, 0.367, -0.5829, -0.5425, 3.2956, -6.273],
					],
					triple: [-1.718, 0.3082, -0.8444],
				},
				higherOrder: {
					quartic: [
						[
							-14.6691, 13.7423, 3.3903, -3.0636, 2.6095, -0.0584, -0.1463,
							0.619, 1.1589, -0.9803, -2.2795, -0.145, -0.5931, 1.9613, -1.5343,
						],
						[
							-1.757, 0.1544, 0.7829, 0.8082, -0.3763, 0.827, -0.1298, 0.6179,
							-0.2902, 0.547, -7.328, 6.6021, 0.4945, -0.5193, -0.4614,
						],
						[
							-0.0188, 2.1365, -2.0596, 0.0473, 2.1127, 0.8176, 0.9516, -0.4258,
							-1.5054, -4.5592, -2.2789, 0.0118, -0.6683, 12.974, -16.8468,
						],
					],
					quintic: [
						[
							6.983, -9.8357, -2.7183, 6.1145, 1.1715, 1.4938, -1.9892, -3.0868,
							-2.9293, -0.2942, 0.5558, 0.9664, 0.8516, 0.5004, 0.4386, 1.1481,
							-0.2315, 0.0281, 1.0259, -1.8792, 0.9507,
						],
						[
							0.8224, -0.4505, -0.5185, 0.8881, -0.0891, 0.1729, -1.6132,
							0.4066, 0.074, -0.5509, 0.8789, -0.7901, 0.3948, -0.268, 0.0906,
							3.2284, -4.4586, 2.2316, -2.0966, 1.2179, 0.049,
						],
						[
							0.2087, -2.3707, 0.9768, 2.1699, 1.1414, -0.3606, -1.3714,
							-1.3096, -2.656, 0.5352, -0.5246, 1.1011, 0.4131, 1.9509, 1.5167,
							1.3232, 0.0347, -0.7384, 1.9359, -7.9363, 7.3749,
						],
					],
				},
			},
		},
	},
	{
		id: "jy-night-boost-ii",
		version: 1,
		name: "Night Boost II",
		localizedName: "夜景增色II",
		category: "night",
		tags: ["night", "cityscape", "夜景", "夜景增色II", "Night Boost II"],
		thumbnail: "/images/filter-previews/jy-night-boost-ii.webp",
		lutAssetId: "qcut/filter/jy-night-boost-ii/v1",
		defaultIntensity: 100,
		isNew: true,
		recipe: {
			exposure: 0.347,
			gamma: 0.536,
			blackLift: 0.081,
			shadowTint: [-0.35, -0.215, -0.202],
			highlightTint: [-0.35, -0.328, 0.093],
			temperature: 0.974,
			tint: -1.14,
			contrast: 0.04,
			saturation: 2.128,
			hueShift: -0.6,
			monochrome: 0.386,
			fade: 0.839,
		},
	},
	{
		id: "jy-urban-cinema-ii",
		version: 1,
		name: "Urban Cinema II",
		localizedName: "都市电影II",
		category: "night",
		tags: ["night", "cityscape", "夜景", "都市电影II", "Urban Cinema II"],
		thumbnail: "/images/filter-previews/jy-urban-cinema-ii.webp",
		lutAssetId: "qcut/filter/jy-urban-cinema-ii/v1",
		defaultIntensity: 100,
		isNew: true,
		recipe: {
			polynomialCorrection: {
				offset: [-0.0199, -0.0213, -0.012],
				linear: [
					[0.195, 0.2123, 0.1125],
					[-0.2713, 0.9321, 0.0291],
					[-0.0339, 0.4071, -0.1972],
				],
				squared: [
					[2.1381, 1.186, -0.7938],
					[2.0244, -2.6276, 0.2566],
					[1.2444, 0.4377, 2.399],
				],
				cross: [
					[-2.119, -0.608, -0.0258],
					[-0.2911, 0.2698, -0.2917],
					[-1.6337, 1.8438, 0.7282],
				],
				cubic: {
					pure: [
						[-6.9009, -1.6503, 3.0728],
						[-2.4622, 6.4272, -0.5415],
						[-3.47, 0.1836, -7.2459],
					],
					mixed: [
						[9.5256, -1.5406, 0.2024, -1.3233, 2.775, -1.7482],
						[-4.8143, -0.3985, 4.8451, 1.4512, -0.955, 0.6031],
						[-1.0902, -0.8649, 0.0858, -2.9305, -5.076, 0.4896],
					],
					triple: [0.9492, -0.0984, 3.5551],
				},
				higherOrder: {
					quartic: [
						[
							10.2368, -9.0685, 3.4942, -5.8603, -3.9781, -0.2239, -1.5394,
							0.2271, 1.2914, -2.712, 2.4344, 6.3749, -0.6952, 0.3222, -4.0782,
						],
						[
							-0.3343, 5.0704, 0.6651, 4.5592, 1.3965, -0.3988, -8.4047,
							-0.8441, 0.362, 0.8833, -5.2793, -3.5897, 1.6539, -1.5362, 0.6214,
						],
						[
							3.9927, 2.5207, -1.6073, 1.4808, -4.6011, 6.6331, 2.7102, -3.0003,
							-1.8048, 4.4447, -1.0694, 1.6176, 2.5766, -2.123, 9.8162,
						],
					],
					quintic: [
						[
							-4.7771, 2.1661, -1.3488, 4.768, 1.4633, -1.8522, -1.5979, 1.5311,
							-0.5685, 2.4492, 2.8492, -0.3776, -1.7401, 1.162, -0.4447,
							-1.3252, -5.1253, 3.3611, -2.3764, 1.0993, 1.8118,
						],
						[
							1.0872, -2.2407, -0.2581, -0.6725, -0.4049, 0.2234, -2.1592,
							-0.9542, 0.1264, -0.0849, 4.1391, 0.6503, 0.5684, -0.7859, 0.0215,
							1.4425, 2.2429, -1.6416, 0.5117, 0.5824, -0.3055,
						],
						[
							-1.7457, -0.2608, 1.109, -1.4575, 0.468, -1.6552, -1.3599, 3.6441,
							0.0716, -2.457, -1.0757, -0.1967, 0.5678, 0.8713, -1.8575, 0.7994,
							0.2607, -0.3782, -3.0505, 2.4859, -4.2578,
						],
					],
				},
			},
		},
	},
	{
		id: "jy-cool-fireworks",
		version: 2,
		name: "Cool Fireworks",
		localizedName: "冷烟花",
		category: "night",
		tags: ["night", "cityscape", "夜景", "冷烟花", "Cool Fireworks"],
		thumbnail: "/images/filter-previews/jy-cool-fireworks.webp",
		lutAssetId: "qcut/filter/jy-cool-fireworks/v2",
		defaultIntensity: 100,
		isNew: true,
		recipe: COOL_FIREWORKS_RECIPE,
	},
	{
		id: "jy-orange-teal",
		version: 2,
		name: "Orange Teal",
		localizedName: "橙蓝",
		category: "night",
		tags: ["night", "cityscape", "夜景", "橙蓝", "Orange Teal"],
		thumbnail: "/images/filter-previews/jy-orange-teal.webp",
		lutAssetId: "qcut/filter/jy-orange-teal/v2",
		defaultIntensity: 100,
		isNew: true,
		recipe: ORANGE_TEAL_BACKGROUND_RECIPE,
		skinToneRecipe: ORANGE_TEAL_SKIN_TONE_RECIPE,
	},
];
