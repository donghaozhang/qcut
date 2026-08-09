import type { JianyingTransitionOverride } from "./catalog-types.js";

export const LEGACY_TRANSITION_OVERRIDES: Readonly<
	Record<string, JianyingTransitionOverride>
> = {
	"7049979667406656014": {
		id: "jianying-local-3d-space",
		name: "3D Space",
		family: "multi-pass-glsl",
		preview: {
			type: "glass",
			clipType: "glass-refraction",
			tuning: { intensity: 1.25 },
		},
	},
	"6748289440130535947": {
		id: "jianying-local-heart",
		name: "Heart",
		family: "simple-glsl",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "heart",
		},
	},
	"7343136487182963211": {
		id: "jianying-local-white-flash",
		name: "White Flash",
		family: "sequence-composite",
		preview: {
			type: "flash",
			clipType: "flash",
			tuning: { intensity: 1.4, tint: "#ffffff" },
		},
	},
	"6858191556055142919": {
		id: "jianying-local-white-ink",
		name: "White Ink Bloom",
		family: "sequence-composite",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "ink",
		},
	},
	"6789847331060584974": {
		id: "jianying-local-blinds",
		name: "Blinds",
		family: "sequence-composite",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "blinds",
		},
	},
	"6858191541706428941": {
		id: "jianying-local-dots-right",
		name: "Dots Right",
		family: "sequence-composite",
		preview: { type: "wipe", clipType: "wipe", direction: "right" },
	},
	"6747989545448378888": {
		id: "jianying-local-window-grid",
		name: "Window Grid",
		family: "simple-glsl",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "triptych",
		},
	},
	"6747865141120864779": {
		id: "jianying-local-bounce",
		name: "Bounce",
		family: "simple-glsl",
		preview: {
			type: "shake",
			clipType: "shake",
			tuning: { intensity: 0.7, frequency: 2.4 },
		},
	},
	"6748313807031898627": {
		id: "jianying-local-reflection",
		name: "Reflection",
		family: "simple-glsl",
		preview: { type: "page", clipType: "page-flip" },
	},
	"7046293801123451405": {
		id: "jianying-local-tv-glitch-1",
		name: "TV Glitch I",
		family: "sequence-composite",
		preview: {
			type: "glitch",
			clipType: "rgb-glitch",
			tuning: { intensity: 1.5, frequency: 2.5 },
		},
	},
	"6914112332205396488": {
		id: "jianying-local-overlay",
		name: "Overlay",
		family: "simple-glsl",
		preview: { type: "dissolve", clipType: "dissolve" },
	},
	"6858191448827761160": {
		id: "jianying-local-anime-vortex",
		name: "Anime Vortex",
		family: "sequence-composite",
		preview: { type: "ripple", clipType: "vortex" },
	},
	"7252544245444121148": {
		id: "jianying-local-shake",
		name: "Shake",
		family: "lua-pipeline",
		preview: {
			type: "shake",
			clipType: "shake",
			tuning: { intensity: 1.5, frequency: 2 },
		},
	},
	"7034446419641504264": {
		id: "jianying-local-page-turn",
		name: "Page Turn",
		family: "simple-glsl",
		preview: { type: "page", clipType: "page-flip" },
	},
	"6949828109663212045": {
		id: "jianying-local-white-bloom",
		name: "White Bloom",
		family: "single-input-glsl",
		preview: { type: "fade", clipType: "fade-white" },
	},
	"6724239584663704071": {
		id: "jianying-local-radial",
		name: "Radial",
		family: "simple-glsl",
		preview: {
			type: "zoom",
			clipType: "zoom-blur",
			tuning: { intensity: 1.35 },
		},
	},
	"6748286529921094157": {
		id: "jianying-local-pinwheel",
		name: "Pinwheel",
		family: "simple-glsl",
		preview: { type: "ripple", clipType: "vortex" },
	},
	"7341295618863665690": {
		id: "jianying-local-traverse-3",
		name: "Traverse III",
		family: "sequence-composite",
		preview: {
			type: "zoom",
			clipType: "zoom-in-blur",
			tuning: { intensity: 1.6 },
		},
	},
	"7246288124110705209": {
		id: "jianying-local-suction",
		name: "Suction",
		family: "multi-feature-lua",
		preview: {
			type: "zoom",
			clipType: "zoom-in-blur",
			tuning: { intensity: 1.8 },
		},
	},
	"7450031574923350555": {
		id: "jianying-local-smoke",
		name: "Smoke Transition",
		family: "lumi-ae",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "fog",
		},
	},
};
