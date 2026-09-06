import type { IndependentGraphProfile } from "./graph-profiles.js";

// Both LUTs and both mix weights match; the sampled mask cancels algebraically.
export const INDEPENDENT_INVARIANT_PROFILES: readonly IndependentGraphProfile[] =
	[
		{
			resourceId: "7127609569416711455",
			version: "f13edb0a953cb79f0fac124fdbfaf536",
			title: "侘寂灰",
			kind: "direct",
			alphaWeighted: true,
			maskInvariant: "vf",
			corner: 0.5,
			controlHash:
				"5c0bbff9375ec53061684cab6d79bf0804c8182f592c7ce180b1b003f050ac7e",
			assetHash:
				"f461a6f7b8c918e2688431b3bf05d124fcdb922c942c1b6056d16bcbf05a1a2b",
		},
		{
			resourceId: "7617811957558611206",
			version: "58507e2aa60fda125bb7c2ccaa50639e",
			title: "小麦肌",
			kind: "mask-invariant",
			alphaWeighted: false,
			maskInvariant: "tiled",
			corner: 0.5,
			controlHash:
				"54547b8c7885f38cb56e4274447ddead8d6208771355ae9b749abae3b1acd3cd",
			assetHash:
				"51a0a459b5ed8dfcb092cc7f0eccbfef9ae08216c5fd5da26f606249f4b593c8",
		},
		{
			resourceId: "7617811803829046591",
			version: "79e29affbb62231957a139cb648aa553",
			title: "蜜桃肌",
			kind: "mask-invariant",
			alphaWeighted: false,
			maskInvariant: "tiled",
			corner: 0.5,
			controlHash:
				"54547b8c7885f38cb56e4274447ddead8d6208771355ae9b749abae3b1acd3cd",
			assetHash:
				"779705edf34ade865b513b72f8c4ebc179eb609b789dedf385922e9b0110aedf",
		},
		{
			resourceId: "7356885346841349410",
			version: "dda45c5c737465fb7e29ae1a150170a8",
			title: "风铃II",
			kind: "mask-invariant-sharpen",
			alphaWeighted: false,
			maskInvariant: "tiled",
			corner: 0.5,
			controlHash:
				"afa9ec9a793bea61c560cb441623d18db227e3a23c0ccec80ea2d37af99c8596",
			assetHash:
				"7d566ad44e4cf95123f1a9acc723dd00f517fd12b29f4d61425eae0c5bdb9855",
		},
	];
