import {
	defineTransitionPreset,
	type TransitionPreset,
} from "./transition-preset-types";

const slideshowPresets: TransitionPreset[] = [
	defineTransitionPreset({
		id: "page-turn-left",
		name: "Page Turn Left",
		localizedName: "向左翻页",
		category: "slideshow",
		type: "wipe",
		clipType: "wipe",
		direction: "left",
		defaultDuration: 0.65,
		tags: ["page", "album", "photo", "翻页"],
		popular: true,
	}),
	defineTransitionPreset({
		id: "photo-stack-up",
		name: "Photo Stack Up",
		localizedName: "照片上叠",
		category: "slideshow",
		type: "push",
		clipType: "push",
		direction: "up",
		defaultDuration: 0.55,
		tags: ["photo", "stack", "album", "相册"],
		latest: true,
	}),
];

const shootingPresets: TransitionPreset[] = [
	defineTransitionPreset({
		id: "shutter-flash",
		name: "Shutter Flash",
		localizedName: "快门闪白",
		category: "shooting",
		type: "flash",
		clipType: "flash",
		defaultDuration: 0.28,
		tuning: { intensity: 1.35, tint: "#ffffff" },
		tags: ["camera", "shutter", "snapshot", "快门"],
		popular: true,
	}),
	defineTransitionPreset({
		id: "handheld-cut",
		name: "Handheld Cut",
		localizedName: "手持切镜",
		category: "shooting",
		type: "shake",
		clipType: "shake",
		defaultDuration: 0.34,
		tuning: { intensity: 0.48, frequency: 2.15 },
		tags: ["camera", "handheld", "documentary", "手持"],
		latest: true,
	}),
];

const distortionPresets: TransitionPreset[] = [
	defineTransitionPreset({
		id: "liquid-warp",
		name: "Liquid Warp",
		localizedName: "液态扭曲",
		category: "distortion",
		type: "zoom",
		clipType: "zoom-blur",
		defaultDuration: 0.58,
		tuning: { intensity: 1.25 },
		tags: ["warp", "liquid", "stretch", "扭曲"],
		popular: true,
	}),
	defineTransitionPreset({
		id: "chromatic-twist",
		name: "Chromatic Twist",
		localizedName: "色散扭转",
		category: "distortion",
		type: "glitch",
		clipType: "rgb-glitch",
		defaultDuration: 0.42,
		tuning: { intensity: 0.85, frequency: 0.55 },
		tags: ["warp", "chromatic", "twist", "色散"],
		latest: true,
	}),
];

const varietyPresets: TransitionPreset[] = [
	defineTransitionPreset({
		id: "comic-pop",
		name: "Comic Pop",
		localizedName: "漫画弹出",
		category: "variety",
		type: "zoom",
		clipType: "zoom-blur",
		defaultDuration: 0.36,
		tuning: { intensity: 0.7 },
		tags: ["comic", "reaction", "pop", "综艺"],
		popular: true,
	}),
	defineTransitionPreset({
		id: "variety-bounce",
		name: "Variety Bounce",
		localizedName: "综艺弹跳",
		category: "variety",
		type: "shake",
		clipType: "shake",
		defaultDuration: 0.4,
		tuning: { intensity: 0.65, frequency: 2.2 },
		tags: ["show", "bounce", "reaction", "综艺"],
		latest: true,
	}),
];

const emojiPresets: TransitionPreset[] = [
	defineTransitionPreset({
		id: "heart-pulse",
		name: "Heart Pulse",
		localizedName: "心动脉冲",
		category: "emoji",
		type: "zoom",
		clipType: "zoom-blur",
		defaultDuration: 0.42,
		tuning: { intensity: 0.45 },
		tags: ["heart", "reaction", "pulse", "心动", "emoji"],
		popular: true,
	}),
	defineTransitionPreset({
		id: "star-bounce",
		name: "Star Bounce",
		localizedName: "星星弹跳",
		category: "emoji",
		type: "shake",
		clipType: "shake",
		defaultDuration: 0.38,
		tuning: { intensity: 0.45, frequency: 2.7 },
		tags: ["star", "reaction", "bounce", "星星", "emoji"],
		latest: true,
	}),
];

export const ADDITIONAL_TRANSITION_PRESETS: TransitionPreset[] = [
	...slideshowPresets,
	...shootingPresets,
	...distortionPresets,
	...varietyPresets,
	...emojiPresets,
];
