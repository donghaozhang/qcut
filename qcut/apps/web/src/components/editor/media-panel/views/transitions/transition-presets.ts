import type { ClipTransitionType } from "@/types/timeline";
import { ADDITIONAL_TRANSITION_PRESETS } from "./transition-additional-presets";
import { TRANSITION_CATEGORY_EXPANSIONS } from "./transition-category-expansions";
import { buildTransitionCatalogDensity } from "./transition-catalog-density";
import { TRANSITION_ENGINE_PRESETS } from "./transition-engine-presets/index";
import { SELECTED_JIANYING_TRANSITION_PRESETS } from "./transition-jianying-selected-presets";
import { JIANYING_LOCAL_TRANSITION_PRESETS } from "./transition-jianying-local-presets";
import { TRANSITION_LAB_PRESETS } from "./transition-lab-presets";
import {
	defineTransitionPreset as definePreset,
	type ClipTransitionPresetConfig,
	type TransitionCategory,
	type TransitionPreset,
	type TransitionType,
} from "./transition-preset-types";

export {
	TRANSITION_CONTENT_CATEGORIES,
	type ClipTransitionPresetConfig,
	type TransitionCategory,
	type TransitionContentCategory,
	type TransitionPresetCategory,
	type TransitionPreset,
	type TransitionType,
} from "./transition-preset-types";

const DIRECTIONS = ["left", "right", "up", "down"] as const;
const DIRECTION_NAMES = {
	left: ["Left", "向左"],
	right: ["Right", "向右"],
	up: ["Up", "向上"],
	down: ["Down", "向下"],
} as const;

function directionalPresets({
	idPrefix,
	name,
	localizedName,
	type,
	clipType,
	duration,
}: {
	idPrefix: string;
	name: string;
	localizedName: string;
	type: Extract<TransitionType, "slide" | "wipe" | "push" | "whip">;
	clipType: Extract<ClipTransitionType, "slide" | "wipe" | "push" | "whip-pan">;
	duration: number;
}): TransitionPreset[] {
	return DIRECTIONS.map((direction) =>
		definePreset({
			id: `${idPrefix}-${direction}`,
			name: `${name} ${DIRECTION_NAMES[direction][0]}`,
			localizedName: `${localizedName}${DIRECTION_NAMES[direction][1]}`,
			category: type === "whip" ? "camera" : "split",
			type,
			clipType,
			direction,
			defaultDuration: duration,
			tags: [direction, "motion"],
			popular: direction === "left",
		})
	);
}

const dissolvePresets: TransitionPreset[] = [
	definePreset({
		id: "dissolve",
		name: "Dissolve",
		localizedName: "叠化",
		category: "dissolve",
		type: "dissolve",
		clipType: "dissolve",
		defaultDuration: 0.5,
		easing: "linear",
		tags: ["crossfade", "soft", "classic"],
		popular: true,
	}),
	definePreset({
		id: "soft-dissolve",
		name: "Soft Dissolve",
		localizedName: "柔和叠化",
		category: "dissolve",
		type: "dissolve",
		clipType: "dissolve",
		defaultDuration: 0.85,
		tags: ["crossfade", "gentle", "slow"],
		latest: true,
	}),
];

const naturalPresets: TransitionPreset[] = [
	definePreset({
		id: "fade-to-black",
		name: "Fade Through Black",
		localizedName: "黑场过渡",
		category: "natural",
		type: "fade",
		clipType: "fade-black",
		defaultDuration: 0.6,
		tags: ["black", "cinematic"],
		popular: true,
	}),
	definePreset({
		id: "fade-to-white",
		name: "Fade Through White",
		localizedName: "白场过渡",
		category: "natural",
		type: "fade",
		clipType: "fade-white",
		defaultDuration: 0.55,
		tags: ["white", "bright"],
		latest: true,
	}),
];

const splitPresets = [
	...directionalPresets({
		idPrefix: "slide",
		name: "Slide",
		localizedName: "滑动",
		type: "slide",
		clipType: "slide",
		duration: 0.45,
	}),
	...directionalPresets({
		idPrefix: "wipe",
		name: "Wipe",
		localizedName: "擦除",
		type: "wipe",
		clipType: "wipe",
		duration: 0.5,
	}),
	...directionalPresets({
		idPrefix: "push",
		name: "Push",
		localizedName: "推拉",
		type: "push",
		clipType: "push",
		duration: 0.45,
	}),
];

const blurPresets: TransitionPreset[] = [
	["soft-zoom-blur", "Soft Zoom Blur", "柔和变焦", 0.45],
	["silky-zoom-blur", "Silky Zoom Blur", "丝滑变焦", 0.65],
	["zoom-blur", "Zoom Blur", "变焦模糊", 0.85],
	["tunnel-blur", "Tunnel Blur", "隧道模糊", 1],
	["dream-blur", "Dream Blur", "梦境模糊", 1.2],
	["speed-blur", "Speed Blur", "速度模糊", 1.45],
	["deep-zoom-blur", "Deep Zoom Blur", "深度变焦", 1.75],
].map(([id, name, localizedName, intensity], index) =>
	definePreset({
		id: String(id),
		name: String(name),
		localizedName: String(localizedName),
		category: "blur",
		type: "zoom",
		clipType: "zoom-blur",
		defaultDuration: 0.5 + index * 0.025,
		tuning: { intensity: Number(intensity) },
		tags: ["zoom", "blur", "dynamic"],
		popular: id === "zoom-blur",
		latest: id === "deep-zoom-blur",
	})
);

const cameraPresets: TransitionPreset[] = [
	...directionalPresets({
		idPrefix: "whip-pan",
		name: "Whip Pan",
		localizedName: "甩镜",
		type: "whip",
		clipType: "whip-pan",
		duration: 0.4,
	}),
	...[
		["camera-shake", "Camera Shake", "镜头抖动", 1, 1],
		["handheld-shake", "Handheld Shake", "手持抖动", 0.55, 0.7],
		["impact-shake", "Impact Shake", "冲击抖动", 1.55, 0.75],
		["micro-shake", "Micro Shake", "轻微抖动", 0.3, 1.8],
		["rolling-shake", "Rolling Shake", "滚动抖动", 0.85, 1.35],
	].map(([id, name, localizedName, intensity, frequency], index) =>
		definePreset({
			id: String(id),
			name: String(name),
			localizedName: String(localizedName),
			category: "camera",
			type: "shake",
			clipType: "shake",
			defaultDuration: 0.35 + index * 0.025,
			tuning: {
				intensity: Number(intensity),
				frequency: Number(frequency),
			},
			tags: ["camera", "impact", "motion"],
			latest: id === "rolling-shake",
		})
	),
];

const lightPresets: TransitionPreset[] = [
	["flash", "Camera Flash", "相机闪光", "flash", 1, "#ffffff"],
	["soft-flash", "Soft Flash", "柔光闪白", "flash", 0.55, "#ffffff"],
	["warm-flash", "Warm Flash", "暖色闪光", "flash", 0.8, "#ffd6a1"],
	["blue-flash", "Blue Flash", "冷色闪光", "flash", 0.9, "#b8e6ff"],
	["light-leak", "Light Leak", "漏光", "light", 1, "#ff5a1f"],
	["golden-leak", "Golden Leak", "金色漏光", "light", 0.8, "#ffb020"],
	["red-leak", "Red Leak", "红色漏光", "light", 1.2, "#ff304f"],
	["cool-leak", "Cool Leak", "蓝色漏光", "light", 0.7, "#38bdf8"],
	["film-burn", "Film Burn", "胶片灼烧", "light", 1.6, "#ff6b00"],
].map(([id, name, localizedName, type, intensity, tint], index) =>
	definePreset({
		id: String(id),
		name: String(name),
		localizedName: String(localizedName),
		category: "light",
		type: type as "flash" | "light",
		clipType: type === "flash" ? "flash" : "light-leak",
		defaultDuration:
			type === "flash" ? 0.3 + index * 0.01 : 0.55 + index * 0.015,
		tuning: { intensity: Number(intensity), tint: String(tint) },
		tags: ["light", "color", "film"],
		popular: id === "light-leak",
		latest: id === "film-burn",
	})
);

const glitchPresets: TransitionPreset[] = [
	["rgb-glitch", "RGB Glitch", "RGB 故障", 1, 1],
	["digital-glitch", "Digital Glitch", "数字故障", 0.75, 1.7],
	["channel-jump", "Channel Jump", "通道跳动", 1.25, 0.8],
	["scanline-glitch", "Scanline Glitch", "扫描线故障", 0.55, 2.4],
	["heavy-glitch", "Heavy Glitch", "强烈故障", 1.75, 1.2],
	["micro-glitch", "Micro Glitch", "轻微故障", 0.3, 2.8],
	["neon-glitch", "Neon Glitch", "霓虹故障", 1.4, 1.9],
	["broken-signal", "Broken Signal", "信号中断", 1.1, 3.2],
].map(([id, name, localizedName, intensity, frequency], index) =>
	definePreset({
		id: String(id),
		name: String(name),
		localizedName: String(localizedName),
		category: "glitch",
		type: "glitch",
		clipType: "rgb-glitch",
		defaultDuration: 0.3 + index * 0.015,
		tuning: {
			intensity: Number(intensity),
			frequency: Number(frequency),
		},
		tags: ["rgb", "digital", "distortion"],
		popular: id === "rgb-glitch",
		latest: id === "broken-signal",
	})
);

const mgPresets: TransitionPreset[] = [
	["pop-zoom", "Pop Zoom", "弹跳缩放", "zoom", 0.55, 1],
	["bounce-zoom", "Bounce Zoom", "回弹缩放", "zoom", 0.8, 1],
	["punch-zoom", "Punch Zoom", "冲击缩放", "zoom", 1.1, 1],
	["elastic-zoom", "Elastic Zoom", "弹性缩放", "zoom", 1.35, 1],
	["snap-zoom", "Snap Zoom", "快速缩放", "zoom", 1.6, 1],
	["snap-shake", "Snap Shake", "弹跳震动", "shake", 0.65, 1.7],
	["impact-pop", "Impact Pop", "冲击弹出", "shake", 1.3, 0.7],
	["elastic-whip", "Elastic Whip", "弹性甩动", "whip", 0.75, 1],
].map(([id, name, localizedName, type, intensity, frequency], index) =>
	definePreset({
		id: String(id),
		name: String(name),
		localizedName: String(localizedName),
		category: "mg",
		type: type as "zoom" | "shake" | "whip",
		clipType:
			type === "zoom" ? "zoom-blur" : type === "shake" ? "shake" : "whip-pan",
		direction: type === "whip" ? "right" : undefined,
		defaultDuration: 0.3 + index * 0.025,
		tuning: {
			intensity: Number(intensity),
			frequency: Number(frequency),
		},
		tags: ["motion-graphics", "pop", "dynamic"],
		latest: index >= 6,
	})
);

const BASE_TRANSITION_PRESETS: TransitionPreset[] = [
	...dissolvePresets,
	...naturalPresets,
	...splitPresets,
	...blurPresets,
	...cameraPresets,
	...lightPresets,
	...glitchPresets,
	...mgPresets,
	...ADDITIONAL_TRANSITION_PRESETS,
	...SELECTED_JIANYING_TRANSITION_PRESETS,
	...JIANYING_LOCAL_TRANSITION_PRESETS,
	...TRANSITION_LAB_PRESETS,
	...TRANSITION_CATEGORY_EXPANSIONS,
	...TRANSITION_ENGINE_PRESETS,
];

export const transitionPresets: TransitionPreset[] = [
	...BASE_TRANSITION_PRESETS,
	...buildTransitionCatalogDensity({ presets: BASE_TRANSITION_PRESETS }),
];

export function filterTransitionPresets({
	category,
	query,
	favoriteIds = new Set<string>(),
}: {
	category: TransitionCategory;
	query: string;
	favoriteIds?: ReadonlySet<string>;
}): TransitionPreset[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();

	return transitionPresets.filter((preset) => {
		const matchesCategory =
			(category === "all" && preset.category !== "lab") ||
			preset.category === category ||
			(category === "favorites" && favoriteIds.has(preset.id)) ||
			(category === "popular" && preset.popular) ||
			(category === "latest" && preset.latest);

		if (!matchesCategory) return false;
		if (!normalizedQuery) return true;

		return [
			preset.name,
			preset.localizedName,
			preset.category,
			preset.type,
			preset.description,
			preset.jianyingGroup ?? "",
			...preset.tags,
		]
			.join(" ")
			.toLocaleLowerCase()
			.includes(normalizedQuery);
	});
}

export function getClipTransitionPresetConfig({
	preset,
}: {
	preset: TransitionPreset;
}): ClipTransitionPresetConfig | null {
	return {
		type: preset.clipType,
		...(preset.easing ? { easing: preset.easing } : {}),
		...(preset.direction ? { direction: preset.direction } : {}),
		...(preset.tuning ? { tuning: preset.tuning } : {}),
		...(preset.maskShape ? { maskShape: preset.maskShape } : {}),
	};
}

export function getTransitionPresetById({
	presetId,
}: {
	presetId: string;
}): TransitionPreset | undefined {
	return transitionPresets.find((preset) => preset.id === presetId);
}
