import type { IndependentGraphProfile } from "./graph-profiles.js";

// Exact local package identities; no third-party model or LUT data is bundled.
export const PROFILES: readonly IndependentGraphProfile[] = [
	{
		"resourceId": "7617815643072564499",
		"version": "589834e53e6cd318d8d657b587557faf",
		"title": "夏日甜心",
		"kind": "skin-dual-lut",
		"featureDirectory": "AmazingFeature",
		"alphaWeighted": false,
		"corner": 0.5,
		"dualLut": {
			"format": "tiled",
			"backgroundPath": "image/filter_bg.png",
			"skinPath": "image/filter_skin.png",
			"backgroundStrength": 1,
			"skinStrength": 1,
			"clampAlpha": true,
		},
		"controlHash":
			"c53b50645d35fa14ebaf17ca70c7aab2c9033c07759ae76b99e4cb24b912f177",
		"assetHash":
			"b63aef5259268482dd07654da9b75f7decc2b3ba3e37c1cf42a6ed2946465b4e",
	},
	{
		"resourceId": "7617817262107413802",
		"version": "04fdc926d511691ede80697d93fe3f69",
		"title": "粉霓虹",
		"kind": "skin-dual-lut",
		"featureDirectory": "AmazingFeature",
		"alphaWeighted": false,
		"corner": 0.5,
		"dualLut": {
			"format": "tiled",
			"backgroundPath": "image/filter_bg.png",
			"skinPath": "image/filter_skin.png",
			"backgroundStrength": 1,
			"skinStrength": 1,
			"clampAlpha": true,
		},
		"controlHash":
			"b01158379baec7bae882378852c9586c254f47b2eb848826028339d1b085666d",
		"assetHash":
			"09d97fcdf5bdc99ea4fbd21e3e85b26a6c65f6083a51083e262085bb3e4047a2",
	},
	{
		"resourceId": "7617814012545371398",
		"version": "f871b5852e84b04c5adba2f51d1b9ac2",
		"title": "松弛假日",
		"kind": "skin-dual-lut",
		"featureDirectory": "AmazingFeature",
		"alphaWeighted": false,
		"corner": 0.5,
		"dualLut": {
			"format": "tiled",
			"backgroundPath": "image/filter_bg.png",
			"skinPath": "image/filter_skin.png",
			"backgroundStrength": 0.8,
			"skinStrength": 0.6,
			"clampAlpha": true,
		},
		"controlHash":
			"11efdbbb29f3e4638f0272c3f8da5ff0c66dc93f5176f63f42c9c73d577d8c1c",
		"assetHash":
			"3cebe28c9d654ae36c60595faa74b49735870ac7b2507b95a1a64e6860540195",
	},
];
