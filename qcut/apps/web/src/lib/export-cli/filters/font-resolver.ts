/**
 * Cross-Platform Font Resolution
 *
 * Resolves font family names to FFmpeg-compatible font specifiers.
 * - Linux/macOS: Uses fontconfig (font='Arial:style=Bold')
 * - Windows: Uses explicit file paths (fontfile='C:/Windows/Fonts/arial.ttf')
 *
 * Extracted from export-engine-cli.ts lines 139-263.
 */

import type { FontConfig, Platform } from "../types";

/**
 * Font file mapping for Windows.
 * Maps font family names to actual .ttf files in C:\Windows\Fonts
 */
const WINDOWS_FONT_MAP: Record<
	string,
	{ regular: string; bold?: string; italic?: string; boldItalic?: string }
> = {
	arial: {
		regular: "arial.ttf",
		bold: "arialbd.ttf",
		italic: "ariali.ttf",
		boldItalic: "arialbi.ttf",
	},
	"times new roman": {
		regular: "times.ttf",
		bold: "timesbd.ttf",
		italic: "timesi.ttf",
		boldItalic: "timesbi.ttf",
	},
	"courier new": {
		regular: "cour.ttf",
		bold: "courbd.ttf",
		italic: "couri.ttf",
		boldItalic: "courbi.ttf",
	},
};

/**
 * Font name mapping for Linux/macOS (fontconfig).
 * Maps common Windows fonts to system equivalents.
 */
const FONTCONFIG_MAP: Record<string, { mac: string; linux: string }> = {
	arial: { mac: "Helvetica", linux: "Liberation Sans" },
	"times new roman": { mac: "Times", linux: "Liberation Serif" },
	"courier new": { mac: "Courier", linux: "Liberation Mono" },
};

/**
 * Windows font base path.
 * Exported for testing and custom font directory support.
 */
export const WINDOWS_FONT_BASE_PATH = "C:/Windows/Fonts/";

/**
 * Resolve font family to FFmpeg-compatible font configuration.
 *
 * Platform-specific approach:
 * - **Linux/macOS**: Use fontconfig (font='Arial:style=Bold')
 * - **Windows**: Use explicit fontfile path (no fontconfig support)
 *
 * @param fontFamily - CSS font family name (e.g., 'Arial', 'Times New Roman')
 * @param fontWeight - CSS font weight (e.g., 'bold')
 * @param fontStyle - CSS font style (e.g., 'italic')
 * @param platform - Platform string (e.g., 'darwin', 'win32', 'linux')
 * @returns FontConfig object with platform-appropriate font specifier
 * @throws Error if platform detection fails (Electron API unavailable)
 */
export function resolveFontPath(
	fontFamily: string,
	fontWeight?: string,
	fontStyle?: string,
	platform?: Platform
): FontConfig {
	const normalizedFamily = fontFamily.toLowerCase().replace(/['"]/g, "");
	const isBold = fontWeight === "bold";
	const isItalic = fontStyle === "italic";

	// Get platform from parameter or Electron API
	const detectedPlatform = platform;
	if (!detectedPlatform) {
		throw new Error(
			"Platform information not available. Pass platform parameter explicitly."
		);
	}

	const isWindows = detectedPlatform === "win32";
	const isMac = detectedPlatform === "darwin";

	// Linux/macOS: Use fontconfig
	if (!isWindows) {
		const fontMapping = FONTCONFIG_MAP[normalizedFamily];
		const fontName = fontMapping
			? isMac
				? fontMapping.mac
				: fontMapping.linux
			: normalizedFamily;

		const styles: string[] = [];
		if (isBold) styles.push("Bold");
		if (isItalic) styles.push("Italic");
		const styleString = styles.length > 0 ? `:style=${styles.join(" ")}` : "";

		return { useFontconfig: true, fontName: `${fontName}${styleString}` };
	}

	// Windows: Use explicit font file paths
	const fontConfig =
		WINDOWS_FONT_MAP[normalizedFamily] || WINDOWS_FONT_MAP.arial;
	let fontFile = fontConfig.regular;

	if (isBold && isItalic && fontConfig.boldItalic) {
		fontFile = fontConfig.boldItalic;
	} else if (isBold && fontConfig.bold) {
		fontFile = fontConfig.bold;
	} else if (isItalic && fontConfig.italic) {
		fontFile = fontConfig.italic;
	}

	return {
		useFontconfig: false,
		fontPath: `${WINDOWS_FONT_BASE_PATH}${fontFile}`,
	};
}
