import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
	CAPCUT_GUI_APP_VERSION,
	CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES,
} from "../capcut-e2e/gui-regression-app-profile.js";

export const FIXTURE_CAPCUT_EXECUTABLE = "fixture-capcut-executable";
export const FIXTURE_CAPCUT_ENGLISH_FONT = "fixture-capcut-en-font";
export const FIXTURE_CAPCUT_SIMPLIFIED_CHINESE_FONT =
	"fixture-capcut-zh-hans-font";

export function createInfoPlist({
	bundleIdentifier = CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
	bundleVersion = CAPCUT_GUI_APP_VERSION,
	shortVersion = CAPCUT_GUI_APP_VERSION,
}: {
	bundleIdentifier?: string;
	bundleVersion?: string;
	shortVersion?: string;
} = {}): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${bundleIdentifier}</string>
<key>CFBundleVersion</key><string>${bundleVersion}</string>
<key>CFBundleShortVersionString</key><string>${shortVersion}</string>
</dict></plist>\n`;
}

export function getFixtureCapCutSystemFontPath({
	appPath,
	fontFileName,
}: {
	appPath: string;
	fontFileName: (typeof CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES)[keyof typeof CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES];
}): string {
	return join(
		appPath,
		"Contents",
		"Resources",
		"Font",
		"SystemFont",
		fontFileName
	);
}

export async function writeFixtureCapCutApp({
	appPath,
}: {
	appPath: string;
}): Promise<void> {
	await Promise.all([
		mkdir(join(appPath, "Contents", "MacOS"), { recursive: true }),
		mkdir(join(appPath, "Contents", "Resources", "Font", "SystemFont"), {
			recursive: true,
		}),
	]);
	await Promise.all([
		writeFile(
			join(appPath, "Contents", "Info.plist"),
			createInfoPlist(),
			"utf8"
		),
		writeFile(
			join(appPath, "Contents", "MacOS", "CapCut"),
			FIXTURE_CAPCUT_EXECUTABLE,
			{ encoding: "utf8", mode: 0o755 }
		),
		writeFile(
			getFixtureCapCutSystemFontPath({
				appPath,
				fontFileName: CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.english,
			}),
			FIXTURE_CAPCUT_ENGLISH_FONT,
			"utf8"
		),
		writeFile(
			getFixtureCapCutSystemFontPath({
				appPath,
				fontFileName: CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.simplifiedChinese,
			}),
			FIXTURE_CAPCUT_SIMPLIFIED_CHINESE_FONT,
			"utf8"
		),
	]);
}
