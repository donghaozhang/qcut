import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import { readRegularFileSnapshot } from "./disposable-store-control-file.js";
import { requireCanonicalPath } from "./gui-regression-filesystem.js";

export const CAPCUT_GUI_APP_BUNDLE_IDENTIFIER = "com.lemon.lvoverseas";
export const CAPCUT_GUI_APP_VERSION = "8.1.1";
export const CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES = Object.freeze({
	english: "en.ttf",
	simplifiedChinese: "zh-hans.ttf",
});

const MAXIMUM_CAPCUT_APP_FILE_BYTES = 128 * 1024 * 1024;

export interface CapCutGuiAppFileIntegrity {
	bytes: number;
	device: string;
	inode: string;
	modifiedAtMilliseconds: number;
	path: string;
	sha256: string;
}

function isMissingPathError({ error }: { error: unknown }): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

export interface CapCutGuiAppReport {
	appDirectoryIdentity: {
		device: string;
		inode: string;
		modifiedAtMilliseconds: number;
	};
	bundleIdentifier: typeof CAPCUT_GUI_APP_BUNDLE_IDENTIFIER;
	bundleVersion: typeof CAPCUT_GUI_APP_VERSION;
	canonicalAppPath: string;
	executableIntegrity: Omit<CapCutGuiAppFileIntegrity, "path">;
	executablePath: string;
	infoPlistPath: string;
	infoPlistIntegrity: Omit<CapCutGuiAppFileIntegrity, "path">;
	systemFonts: {
		english: CapCutGuiAppFileIntegrity;
		simplifiedChinese: CapCutGuiAppFileIntegrity;
	};
	shortVersion: typeof CAPCUT_GUI_APP_VERSION;
}

async function inspectBundledFile({
	label,
	path,
}: {
	label: string;
	path: string;
}): Promise<CapCutGuiAppFileIntegrity> {
	let file: Awaited<ReturnType<typeof requireCanonicalPath>>;
	try {
		file = await requireCanonicalPath({
			expectedKind: "file",
			label,
			path,
		});
	} catch (error) {
		if (isMissingPathError({ error })) {
			throw new Error(`${label} is required.`);
		}
		throw error;
	}
	const snapshot = await readRegularFileSnapshot({
		label,
		maximumBytes: MAXIMUM_CAPCUT_APP_FILE_BYTES,
		path: file.canonicalPath,
	});
	return {
		bytes: snapshot.bytes.length,
		device: snapshot.identity.device.toString(),
		inode: snapshot.identity.inode.toString(),
		modifiedAtMilliseconds: snapshot.modifiedAtMilliseconds,
		path: file.canonicalPath,
		sha256: createHash("sha256").update(snapshot.bytes).digest("hex"),
	};
}

function decodeXmlText({ value }: { value: string }): string {
	const decoded = value
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");
	if (/&[^;]+;/.test(decoded)) {
		throw new Error("CapCut Info.plist contains an unsupported XML entity.");
	}
	return decoded;
}

function readPlistString({ key, text }: { key: string; text: string }): string {
	const match = new RegExp(
		`<key>\\s*${key}\\s*</key>\\s*<string>([^<]*)</string>`
	).exec(text);
	if (!match?.[1]) {
		throw new Error(`CapCut Info.plist is missing ${key}.`);
	}
	return decodeXmlText({ value: match[1] });
}

export function parseCapCutAppMetadata({
	infoPlistText,
}: {
	infoPlistText: string;
}): Pick<
	CapCutGuiAppReport,
	"bundleIdentifier" | "bundleVersion" | "shortVersion"
> {
	if (
		!infoPlistText.trimStart().startsWith("<?xml") ||
		!infoPlistText.includes("<plist")
	) {
		throw new Error("CapCut Info.plist must use the verified XML format.");
	}
	const bundleIdentifier = readPlistString({
		key: "CFBundleIdentifier",
		text: infoPlistText,
	});
	const bundleVersion = readPlistString({
		key: "CFBundleVersion",
		text: infoPlistText,
	});
	const shortVersion = readPlistString({
		key: "CFBundleShortVersionString",
		text: infoPlistText,
	});
	if (bundleIdentifier !== CAPCUT_GUI_APP_BUNDLE_IDENTIFIER) {
		throw new Error(
			`CapCut GUI regression requires bundle ID ${CAPCUT_GUI_APP_BUNDLE_IDENTIFIER}.`
		);
	}
	if (
		bundleVersion !== CAPCUT_GUI_APP_VERSION ||
		shortVersion !== CAPCUT_GUI_APP_VERSION
	) {
		throw new Error(
			`CapCut GUI regression requires exact version ${CAPCUT_GUI_APP_VERSION}; received short=${shortVersion}, bundle=${bundleVersion}.`
		);
	}
	return {
		bundleIdentifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
		bundleVersion: CAPCUT_GUI_APP_VERSION,
		shortVersion: CAPCUT_GUI_APP_VERSION,
	};
}

export async function inspectCapCutApp({
	capCutAppPath,
}: {
	capCutAppPath: string;
}): Promise<CapCutGuiAppReport> {
	if (extname(capCutAppPath).toLowerCase() !== ".app") {
		throw new Error("CapCut application path must point to a .app bundle.");
	}
	const app = await requireCanonicalPath({
		expectedKind: "directory",
		label: "CapCut application bundle",
		path: capCutAppPath,
	});
	const infoPlistPath = join(app.canonicalPath, "Contents", "Info.plist");
	const executablePath = join(app.canonicalPath, "Contents", "MacOS", "CapCut");
	const systemFontDirectory = join(
		app.canonicalPath,
		"Contents",
		"Resources",
		"Font",
		"SystemFont"
	);
	const englishFontPath = join(
		systemFontDirectory,
		CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.english
	);
	const simplifiedChineseFontPath = join(
		systemFontDirectory,
		CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.simplifiedChinese
	);
	const [infoPlist, executable, englishFont, simplifiedChineseFont] =
		await Promise.all([
			requireCanonicalPath({
				expectedKind: "file",
				label: "CapCut Info.plist",
				path: infoPlistPath,
			}),
			requireCanonicalPath({
				expectedKind: "file",
				label: "CapCut executable",
				path: executablePath,
			}),
			inspectBundledFile({
				label: "CapCut English system font",
				path: englishFontPath,
			}),
			inspectBundledFile({
				label: "CapCut Simplified Chinese system font",
				path: simplifiedChineseFontPath,
			}),
		]);
	if ((executable.stats.mode & 0o111n) === 0n) {
		throw new Error("CapCut executable is not executable.");
	}
	const [infoPlistSnapshot, executableSnapshot] = await Promise.all([
		readRegularFileSnapshot({
			label: "CapCut Info.plist",
			path: infoPlist.canonicalPath,
		}),
		readRegularFileSnapshot({
			label: "CapCut executable",
			path: executable.canonicalPath,
		}),
	]);
	return {
		appDirectoryIdentity: {
			device: app.stats.dev.toString(),
			inode: app.stats.ino.toString(),
			modifiedAtMilliseconds: Number(app.stats.mtimeNs) / 1_000_000,
		},
		...parseCapCutAppMetadata({
			infoPlistText: infoPlistSnapshot.bytes.toString("utf8"),
		}),
		canonicalAppPath: app.canonicalPath,
		executableIntegrity: {
			bytes: executableSnapshot.bytes.length,
			device: executableSnapshot.identity.device.toString(),
			inode: executableSnapshot.identity.inode.toString(),
			modifiedAtMilliseconds: executableSnapshot.modifiedAtMilliseconds,
			sha256: createHash("sha256")
				.update(executableSnapshot.bytes)
				.digest("hex"),
		},
		executablePath: executable.canonicalPath,
		infoPlistIntegrity: {
			bytes: infoPlistSnapshot.bytes.length,
			device: infoPlistSnapshot.identity.device.toString(),
			inode: infoPlistSnapshot.identity.inode.toString(),
			modifiedAtMilliseconds: infoPlistSnapshot.modifiedAtMilliseconds,
			sha256: createHash("sha256")
				.update(infoPlistSnapshot.bytes)
				.digest("hex"),
		},
		infoPlistPath: infoPlist.canonicalPath,
		systemFonts: {
			english: englishFont,
			simplifiedChinese: simplifiedChineseFont,
		},
	};
}

export type CapCutGuiAppInspector = typeof inspectCapCutApp;
