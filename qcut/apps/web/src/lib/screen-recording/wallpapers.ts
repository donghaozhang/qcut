/** Built-in wallpaper presets and gradient definitions. */

export interface BuiltInWallpaper {
	id: string;
	label: string;
	relativePath: string;
	thumbnail?: string;
}

/** Gradient presets for background beautification. */
export const GRADIENT_PRESETS: {
	id: string;
	label: string;
	colors: [string, string];
}[] = [
	{ id: "sunset", label: "Sunset", colors: ["#ff6b6b", "#ffa726"] },
	{ id: "ocean", label: "Ocean", colors: ["#2196f3", "#00bcd4"] },
	{ id: "forest", label: "Forest", colors: ["#2e7d32", "#66bb6a"] },
	{ id: "lavender", label: "Lavender", colors: ["#7c4dff", "#e040fb"] },
	{ id: "midnight", label: "Midnight", colors: ["#1a237e", "#283593"] },
	{ id: "rose", label: "Rose", colors: ["#e91e63", "#f48fb1"] },
	{ id: "ember", label: "Ember", colors: ["#ff5722", "#ff9800"] },
	{ id: "slate", label: "Slate", colors: ["#37474f", "#78909c"] },
	{ id: "aurora", label: "Aurora", colors: ["#00e676", "#1de9b6"] },
	{ id: "twilight", label: "Twilight", colors: ["#311b92", "#f50057"] },
	{ id: "charcoal", label: "Charcoal", colors: ["#212121", "#424242"] },
	{ id: "sky", label: "Sky", colors: ["#03a9f4", "#b3e5fc"] },
];

export interface BackgroundConfig {
	type: "none" | "gradient" | "solid";
	gradientId?: string;
	gradientColors?: [string, string];
	gradientAngle?: number;
	solidColor?: string;
	padding: number;
	borderRadius: number;
	shadow: boolean;
}

export const DEFAULT_BACKGROUND: BackgroundConfig = {
	type: "none",
	padding: 40,
	borderRadius: 12,
	shadow: true,
	gradientAngle: 135,
};
