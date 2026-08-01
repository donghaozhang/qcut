import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { CAPCUT_8_1_APP_VERSION } from "@qcut/editor-core/jianying-draft";
import {
	CAPCUT_OFFICIAL_BUNDLE_IDENTIFIER,
	parseCapCutBundleMetadata,
} from "./capcut-app-bundle-metadata.js";
import {
	inspectFontBytesGlyphCoverage,
	type FontGlyphCoverageReport,
	type MissingFontGlyph,
} from "./font-glyph-coverage.js";

const MAXIMUM_INFO_PLIST_BYTES = 1024 * 1024;
const MAXIMUM_APP_EXECUTABLE_BYTES = 64 * 1024 * 1024;
const MAXIMUM_SYSTEM_FONT_BYTES = 128 * 1024 * 1024;
const SYSTEM_FONT_DIRECTORY_PARTS = [
	"Contents",
	"Resources",
	"Font",
	"SystemFont",
] as const;

export type CapCut81FontStackInspectionErrorCode =
	| "CAPCUT_8_1_APP_INVALID"
	| "CAPCUT_8_1_APP_ID_MISMATCH"
	| "CAPCUT_8_1_APP_VERSION_MISMATCH"
	| "CAPCUT_8_1_SYSTEM_FONT_INVALID";

export interface CapCut81RegularFileEvidence {
	bytes: number;
	canonicalPath: string;
	sha256: string;
}

export interface CapCut81SystemFontEvidence
	extends CapCut81RegularFileEvidence {
	familyName: string;
	fileName: "en.ttf" | "zh-hans.ttf";
	fullName: string;
	postscriptName: string;
}

export interface CapCut81SystemFontStackEvidence {
	app: {
		bundleIdentifier: typeof CAPCUT_OFFICIAL_BUNDLE_IDENTIFIER;
		bundleVersion: typeof CAPCUT_8_1_APP_VERSION;
		canonicalPath: string;
		executable: CapCut81RegularFileEvidence;
		infoPlist: CapCut81RegularFileEvidence;
		shortVersion: typeof CAPCUT_8_1_APP_VERSION;
	};
	fonts: readonly CapCut81SystemFontEvidence[];
}

export interface CapCut81SystemFontStackInspection {
	evidence: CapCut81SystemFontStackEvidence;
	missing: readonly MissingFontGlyph[];
}

export type CapCut81FontGlyphCoverageInspector = (options: {
	fontBytes: Buffer;
	fontPath: string;
	text: string;
}) => FontGlyphCoverageReport | Promise<FontGlyphCoverageReport>;

export class CapCut81FontStackInspectionError extends Error {
	readonly code: CapCut81FontStackInspectionErrorCode;

	constructor({
		code,
		message,
	}: {
		code: CapCut81FontStackInspectionErrorCode;
		message: string;
	}) {
		super(message);
		this.code = code;
		this.name = "CapCut81FontStackInspectionError";
	}
}

interface RegularFileSnapshot {
	bytes: Buffer;
	evidence: CapCut81RegularFileEvidence;
}

function errorDetail({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

function createInspectionError({
	code,
	detail,
}: {
	code: CapCut81FontStackInspectionErrorCode;
	detail: string;
}): CapCut81FontStackInspectionError {
	return new CapCut81FontStackInspectionError({ code, message: detail });
}

function isSameOrDescendant({
	candidatePath,
	parentPath,
}: {
	candidatePath: string;
	parentPath: string;
}): boolean {
	const relativePath = relative(parentPath, candidatePath);
	return (
		relativePath === "" ||
		(relativePath !== ".." &&
			!relativePath.startsWith(`..${sep}`) &&
			!isAbsolute(relativePath))
	);
}

async function requireCanonicalAppDirectory({
	capCutAppPath,
}: {
	capCutAppPath: string;
}): Promise<string> {
	if (extname(capCutAppPath).toLowerCase() !== ".app") {
		throw createInspectionError({
			code: "CAPCUT_8_1_APP_INVALID",
			detail: "CapCut font preflight requires a .app bundle path.",
		});
	}
	const absolutePath = resolve(capCutAppPath);
	try {
		const metadata = await lstat(absolutePath);
		if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
			throw new Error("the application bundle is not a regular directory");
		}
		return await realpath(absolutePath);
	} catch (error) {
		if (error instanceof CapCut81FontStackInspectionError) throw error;
		throw createInspectionError({
			code: "CAPCUT_8_1_APP_INVALID",
			detail: `CapCut application bundle is unavailable or invalid: ${errorDetail({ error })}`,
		});
	}
}

async function readRegularFileSnapshot({
	code,
	filePath,
	label,
	maximumBytes,
	parentPath,
	requireExecutable = false,
}: {
	code: CapCut81FontStackInspectionErrorCode;
	filePath: string;
	label: string;
	maximumBytes: number;
	parentPath: string;
	requireExecutable?: boolean;
}): Promise<RegularFileSnapshot> {
	try {
		const before = await lstat(filePath);
		if (!before.isFile() || before.isSymbolicLink()) {
			throw new Error("path is not a regular file");
		}
		if (requireExecutable && (before.mode & 0o111) === 0) {
			throw new Error("file has no executable mode bit");
		}
		if (before.size <= 0 || before.size > maximumBytes) {
			throw new Error(`file size must be between 1 and ${maximumBytes} bytes`);
		}
		const canonicalPath = await realpath(filePath);
		if (!isSameOrDescendant({ candidatePath: canonicalPath, parentPath })) {
			throw new Error("canonical path escapes the CapCut application bundle");
		}
		const bytes = await readFile(canonicalPath);
		const after = await lstat(canonicalPath);
		if (
			!after.isFile() ||
			after.isSymbolicLink() ||
			before.dev !== after.dev ||
			before.ino !== after.ino ||
			before.mode !== after.mode ||
			before.mtimeMs !== after.mtimeMs ||
			before.size !== after.size ||
			bytes.length !== after.size
		) {
			throw new Error("file changed while it was being inspected");
		}
		return {
			bytes,
			evidence: {
				bytes: bytes.length,
				canonicalPath,
				sha256: createHash("sha256").update(bytes).digest("hex"),
			},
		};
	} catch (error) {
		if (error instanceof CapCut81FontStackInspectionError) throw error;
		throw createInspectionError({
			code,
			detail: `${label} is unavailable or invalid: ${errorDetail({ error })}`,
		});
	}
}

function collectMissingFromFontUnion({
	reports,
	text,
}: {
	reports: readonly FontGlyphCoverageReport[];
	text: string;
}): MissingFontGlyph[] {
	const missingByFont = reports.map(
		(report) => new Set(report.missing.map(({ codePoint }) => codePoint))
	);
	const seen = new Set<number>();
	return Array.from(text).flatMap((character, index) => {
		const codePoint = character.codePointAt(0);
		if (
			codePoint === undefined ||
			seen.has(codePoint) ||
			missingByFont.some((missing) => !missing.has(codePoint))
		) {
			return [];
		}
		seen.add(codePoint);
		return [
			{
				character,
				codePoint,
				index,
				unicode: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
			},
		];
	});
}

export async function inspectCapCut81SystemFontStack({
	capCutAppPath,
	inspectGlyphCoverage = inspectFontBytesGlyphCoverage,
	text,
}: {
	capCutAppPath: string;
	inspectGlyphCoverage?: CapCut81FontGlyphCoverageInspector;
	text: string;
}): Promise<CapCut81SystemFontStackInspection> {
	const canonicalAppPath = await requireCanonicalAppDirectory({
		capCutAppPath,
	});
	const [executable, infoPlist] = await Promise.all([
		readRegularFileSnapshot({
			code: "CAPCUT_8_1_APP_INVALID",
			filePath: join(canonicalAppPath, "Contents", "MacOS", "CapCut"),
			label: "CapCut application executable",
			maximumBytes: MAXIMUM_APP_EXECUTABLE_BYTES,
			parentPath: canonicalAppPath,
			requireExecutable: true,
		}),
		readRegularFileSnapshot({
			code: "CAPCUT_8_1_APP_INVALID",
			filePath: join(canonicalAppPath, "Contents", "Info.plist"),
			label: "CapCut Info.plist",
			maximumBytes: MAXIMUM_INFO_PLIST_BYTES,
			parentPath: canonicalAppPath,
		}),
	]);
	let metadata;
	try {
		metadata = parseCapCutBundleMetadata({
			infoPlistText: infoPlist.bytes.toString("utf8"),
		});
	} catch (error) {
		throw createInspectionError({
			code: "CAPCUT_8_1_APP_INVALID",
			detail: `CapCut Info.plist is invalid: ${errorDetail({ error })}`,
		});
	}
	if (metadata.bundleIdentifier !== CAPCUT_OFFICIAL_BUNDLE_IDENTIFIER) {
		throw createInspectionError({
			code: "CAPCUT_8_1_APP_ID_MISMATCH",
			detail: `Expected CapCut bundle id ${CAPCUT_OFFICIAL_BUNDLE_IDENTIFIER}, received ${metadata.bundleIdentifier}.`,
		});
	}
	if (
		metadata.shortVersion !== CAPCUT_8_1_APP_VERSION ||
		metadata.bundleVersion !== CAPCUT_8_1_APP_VERSION
	) {
		throw createInspectionError({
			code: "CAPCUT_8_1_APP_VERSION_MISMATCH",
			detail: `CapCut font preflight requires short and bundle version ${CAPCUT_8_1_APP_VERSION}; received ${metadata.shortVersion} and ${metadata.bundleVersion}.`,
		});
	}

	const fontFiles = await Promise.all(
		(["en.ttf", "zh-hans.ttf"] as const).map(async (fileName) => ({
			fileName,
			snapshot: await readRegularFileSnapshot({
				code: "CAPCUT_8_1_SYSTEM_FONT_INVALID",
				filePath: join(
					canonicalAppPath,
					...SYSTEM_FONT_DIRECTORY_PARTS,
					fileName
				),
				label: `CapCut system font ${fileName}`,
				maximumBytes: MAXIMUM_SYSTEM_FONT_BYTES,
				parentPath: canonicalAppPath,
			}),
		}))
	);
	let reports: FontGlyphCoverageReport[];
	try {
		reports = await Promise.all(
			fontFiles.map(({ snapshot }) =>
				inspectGlyphCoverage({
					fontBytes: snapshot.bytes,
					fontPath: snapshot.evidence.canonicalPath,
					text,
				})
			)
		);
	} catch (error) {
		throw createInspectionError({
			code: "CAPCUT_8_1_SYSTEM_FONT_INVALID",
			detail: `CapCut system font cmap inspection failed: ${errorDetail({ error })}`,
		});
	}

	return {
		evidence: {
			app: {
				bundleIdentifier: CAPCUT_OFFICIAL_BUNDLE_IDENTIFIER,
				bundleVersion: CAPCUT_8_1_APP_VERSION,
				canonicalPath: canonicalAppPath,
				executable: executable.evidence,
				infoPlist: infoPlist.evidence,
				shortVersion: CAPCUT_8_1_APP_VERSION,
			},
			fonts: fontFiles.map(({ fileName, snapshot }, index) => {
				const report = reports[index];
				if (!report) {
					throw new Error(`Missing cmap report for ${fileName}.`);
				}
				return {
					...snapshot.evidence,
					familyName: report.familyName,
					fileName,
					fullName: report.fullName,
					postscriptName: report.postscriptName,
				};
			}),
		},
		missing: collectMissingFromFontUnion({ reports, text }),
	};
}
