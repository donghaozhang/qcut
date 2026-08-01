import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import {
	readRegularFileSnapshot,
	type RegularFileSnapshot,
} from "./disposable-store-control-file.js";
import {
	CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
	inspectCapCutAppSignature,
	type CapCutGuiAppSignatureInspector,
	type CapCutGuiAppSignatureReceipt,
} from "./gui-regression-app-signature.js";
import { requireCanonicalPath } from "./gui-regression-filesystem.js";

export { CAPCUT_GUI_APP_BUNDLE_IDENTIFIER };
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
	signature: CapCutGuiAppSignatureReceipt;
	systemFonts: {
		english: CapCutGuiAppFileIntegrity;
		simplifiedChinese: CapCutGuiAppFileIntegrity;
	};
	shortVersion: typeof CAPCUT_GUI_APP_VERSION;
}

interface CapCutGuiAppFileSnapshot {
	integrity: CapCutGuiAppFileIntegrity;
	mode: bigint;
	snapshot: RegularFileSnapshot;
}

async function inspectBundledFile({
	label,
	path,
}: {
	label: string;
	path: string;
}): Promise<CapCutGuiAppFileSnapshot> {
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
		integrity: {
			bytes: snapshot.bytes.length,
			device: snapshot.identity.device.toString(),
			inode: snapshot.identity.inode.toString(),
			modifiedAtMilliseconds: snapshot.modifiedAtMilliseconds,
			path: file.canonicalPath,
			sha256: createHash("sha256").update(snapshot.bytes).digest("hex"),
		},
		mode: file.stats.mode,
		snapshot,
	};
}

function assertFileSnapshotUnchanged({
	after,
	before,
	label,
}: {
	after: CapCutGuiAppFileSnapshot;
	before: CapCutGuiAppFileSnapshot;
	label: string;
}): void {
	const afterIdentity = after.snapshot.identity;
	const beforeIdentity = before.snapshot.identity;
	if (
		after.integrity.path !== before.integrity.path ||
		after.mode !== before.mode ||
		afterIdentity.device !== beforeIdentity.device ||
		afterIdentity.inode !== beforeIdentity.inode ||
		afterIdentity.modifiedAtNanoseconds !==
			beforeIdentity.modifiedAtNanoseconds ||
		afterIdentity.size !== beforeIdentity.size ||
		!after.snapshot.bytes.equals(before.snapshot.bytes)
	) {
		throw new Error(`${label} changed while verifying the CapCut signature.`);
	}
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

interface CapCutGuiAppFilesSnapshot {
	englishFont: CapCutGuiAppFileSnapshot;
	executable: CapCutGuiAppFileSnapshot;
	infoPlist: CapCutGuiAppFileSnapshot;
	simplifiedChineseFont: CapCutGuiAppFileSnapshot;
}

async function captureAppFiles({
	englishFontPath,
	executablePath,
	infoPlistPath,
	simplifiedChineseFontPath,
}: {
	englishFontPath: string;
	executablePath: string;
	infoPlistPath: string;
	simplifiedChineseFontPath: string;
}): Promise<CapCutGuiAppFilesSnapshot> {
	const [englishFont, executable, infoPlist, simplifiedChineseFont] =
		await Promise.all([
			inspectBundledFile({
				label: "CapCut English system font",
				path: englishFontPath,
			}),
			inspectBundledFile({
				label: "CapCut executable",
				path: executablePath,
			}),
			inspectBundledFile({
				label: "CapCut Info.plist",
				path: infoPlistPath,
			}),
			inspectBundledFile({
				label: "CapCut Simplified Chinese system font",
				path: simplifiedChineseFontPath,
			}),
		]);
	return { englishFont, executable, infoPlist, simplifiedChineseFont };
}

function assertAppDirectoryUnchanged({
	after,
	before,
}: {
	after: Awaited<ReturnType<typeof requireCanonicalPath>>;
	before: Awaited<ReturnType<typeof requireCanonicalPath>>;
}): void {
	if (
		after.canonicalPath !== before.canonicalPath ||
		after.stats.dev !== before.stats.dev ||
		after.stats.ino !== before.stats.ino ||
		after.stats.mode !== before.stats.mode ||
		after.stats.mtimeNs !== before.stats.mtimeNs ||
		after.stats.ctimeNs !== before.stats.ctimeNs
	) {
		throw new Error(
			"CapCut application bundle changed while verifying its signature."
		);
	}
}

function assertAppFilesUnchanged({
	after,
	before,
}: {
	after: CapCutGuiAppFilesSnapshot;
	before: CapCutGuiAppFilesSnapshot;
}): void {
	assertFileSnapshotUnchanged({
		after: after.infoPlist,
		before: before.infoPlist,
		label: "CapCut Info.plist",
	});
	assertFileSnapshotUnchanged({
		after: after.executable,
		before: before.executable,
		label: "CapCut executable",
	});
	assertFileSnapshotUnchanged({
		after: after.englishFont,
		before: before.englishFont,
		label: "CapCut English system font",
	});
	assertFileSnapshotUnchanged({
		after: after.simplifiedChineseFont,
		before: before.simplifiedChineseFont,
		label: "CapCut Simplified Chinese system font",
	});
}

function withoutPath({
	integrity,
}: {
	integrity: CapCutGuiAppFileIntegrity;
}): Omit<CapCutGuiAppFileIntegrity, "path"> {
	return {
		bytes: integrity.bytes,
		device: integrity.device,
		inode: integrity.inode,
		modifiedAtMilliseconds: integrity.modifiedAtMilliseconds,
		sha256: integrity.sha256,
	};
}

async function inspectCapCutAppWithSignatureInspector({
	capCutAppPath,
	inspectSignature,
}: {
	capCutAppPath: string;
	inspectSignature: CapCutGuiAppSignatureInspector;
}): Promise<CapCutGuiAppReport> {
	if (extname(capCutAppPath).toLowerCase() !== ".app") {
		throw new Error("CapCut application path must point to a .app bundle.");
	}
	const appBeforeSignature = await requireCanonicalPath({
		expectedKind: "directory",
		label: "CapCut application bundle",
		path: capCutAppPath,
	});
	const infoPlistPath = join(
		appBeforeSignature.canonicalPath,
		"Contents",
		"Info.plist"
	);
	const executablePath = join(
		appBeforeSignature.canonicalPath,
		"Contents",
		"MacOS",
		"CapCut"
	);
	const systemFontDirectory = join(
		appBeforeSignature.canonicalPath,
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
	const filesBeforeSignature = await captureAppFiles({
		englishFontPath,
		executablePath,
		infoPlistPath,
		simplifiedChineseFontPath,
	});
	if ((filesBeforeSignature.executable.mode & 0o111n) === 0n) {
		throw new Error("CapCut executable is not executable.");
	}
	const signature = await inspectSignature({
		canonicalAppPath: appBeforeSignature.canonicalPath,
	});
	const [appAfterSignature, filesAfterSignature] = await Promise.all([
		requireCanonicalPath({
			expectedKind: "directory",
			label: "CapCut application bundle",
			path: appBeforeSignature.canonicalPath,
		}),
		captureAppFiles({
			englishFontPath,
			executablePath,
			infoPlistPath,
			simplifiedChineseFontPath,
		}),
	]);
	assertAppDirectoryUnchanged({
		after: appAfterSignature,
		before: appBeforeSignature,
	});
	assertAppFilesUnchanged({
		after: filesAfterSignature,
		before: filesBeforeSignature,
	});

	return {
		appDirectoryIdentity: {
			device: appBeforeSignature.stats.dev.toString(),
			inode: appBeforeSignature.stats.ino.toString(),
			modifiedAtMilliseconds:
				Number(appBeforeSignature.stats.mtimeNs) / 1_000_000,
		},
		...parseCapCutAppMetadata({
			infoPlistText:
				filesBeforeSignature.infoPlist.snapshot.bytes.toString("utf8"),
		}),
		canonicalAppPath: appBeforeSignature.canonicalPath,
		executableIntegrity: withoutPath({
			integrity: filesBeforeSignature.executable.integrity,
		}),
		executablePath: filesBeforeSignature.executable.integrity.path,
		infoPlistIntegrity: withoutPath({
			integrity: filesBeforeSignature.infoPlist.integrity,
		}),
		infoPlistPath: filesBeforeSignature.infoPlist.integrity.path,
		signature,
		systemFonts: {
			english: filesBeforeSignature.englishFont.integrity,
			simplifiedChinese: filesBeforeSignature.simplifiedChineseFont.integrity,
		},
	};
}

export async function inspectCapCutApp({
	capCutAppPath,
}: {
	capCutAppPath: string;
}): Promise<CapCutGuiAppReport> {
	return inspectCapCutAppWithSignatureInspector({
		capCutAppPath,
		inspectSignature: inspectCapCutAppSignature,
	});
}

export type CapCutGuiAppInspector = typeof inspectCapCutApp;

export const capCutGuiAppProfileTesting = Object.freeze({
	inspectCapCutAppWithSignatureInspector,
});
