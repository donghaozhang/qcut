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
	type: "none" | "gradient" | "solid" | "wallpaper";
	gradientId?: string;
	gradientColors?: [string, string];
	gradientAngle?: number;
	solidColor?: string;
	/** Wallpaper ID (references a discovered wallpaper) */
	wallpaperId?: string;
	/** Resolved file path or public path for the wallpaper image */
	wallpaperPath?: string;
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

const IMAGE_FILE_PATTERN = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

/** Convert a filename to a kebab-case wallpaper ID. */
export function toWallpaperId(fileName: string): string {
	return fileName
		.replace(/\.[^.]+$/, "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Convert a filename to a title-cased label. */
export function toWallpaperLabel(fileName: string): string {
	const baseName = fileName.replace(/\.[^.]+$/, "").trim();
	if (!baseName) return "Wallpaper";

	return baseName
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\b\w/g, (match) => match.toUpperCase());
}

/** Create a wallpaper entry from a filename. */
export function createWallpaperEntry(fileName: string): BuiltInWallpaper {
	const encodedFileName = encodeURIComponent(fileName);
	return {
		id: toWallpaperId(fileName) || `wallpaper-${encodedFileName.toLowerCase()}`,
		label: toWallpaperLabel(fileName),
		relativePath: `wallpapers/${fileName}`,
	};
}

/** Sort wallpaper filenames with locale-aware numeric sorting. */
export function sortWallpaperFiles(fileNames: string[]): string[] {
	return [...fileNames].sort(
		new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare
	);
}

/** Test if a filename is a supported image format. */
export function isImageFile(fileName: string): boolean {
	return IMAGE_FILE_PATTERN.test(fileName);
}
