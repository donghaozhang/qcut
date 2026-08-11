import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { create, type Font, type FontCollection } from "fontkit";
import type {
	JianyingFontFormat,
	JianyingFontLabFontSummary,
	JianyingFontLabInspectResult,
	JianyingFontSourceKind,
} from "./jianying-font-lab-contract.js";
import { makeJianyingFontBrowserCompatible } from "./jianying-font-browser-compatibility.js";

const MAXIMUM_FONT_BYTES = 128 * 1024 * 1024;
const FONT_FILE_PATTERN = /\.(?:otf|ttf)$/i;
const FONT_HASH_PATTERN = /^[a-f0-9]{64}$/;
const FONT_ID_PREFIX = "sha256:";
const SCAN_CONCURRENCY = 8;
const MAXIMUM_MISSING_GLYPHS = 128;

export interface JianyingFontSearchRoot {
	path: string;
	sourceKind: JianyingFontSourceKind;
}

export interface JianyingFontMetadata {
	familyName: string;
	fullName: string;
	postscriptName: string;
	subfamilyName: string;
}

export interface JianyingFontCatalogEntry extends JianyingFontLabFontSummary {
	filePaths: string[];
	sha256: string;
}

export interface JianyingFontCatalog {
	entries: JianyingFontCatalogEntry[];
	rootCount: number;
	fileCount: number;
	duplicateFileCount: number;
	invalidFileCount: number;
	oversizedFileCount: number;
}

export interface BuildJianyingFontCatalogOptions {
	roots?: JianyingFontSearchRoot[];
	readFontMetadata?: ({ bytes }: { bytes: Buffer }) => JianyingFontMetadata;
}

interface FontFileCandidate {
	filePath: string;
	format: JianyingFontFormat;
	sourceKind: JianyingFontSourceKind;
}

interface ValidFontFile extends FontFileCandidate {
	bytesLength: number;
	metadata: JianyingFontMetadata;
	sha256: string;
}

type ScannedFontFile =
	| { kind: "valid"; font: ValidFontFile }
	| { kind: "invalid" }
	| { kind: "oversized" };

function requireSingleFont({ font }: { font: Font | FontCollection }): Font {
	if ("fonts" in font) {
		throw new Error("Font collections are not supported by the local font lab");
	}
	return font;
}

export function readFontkitMetadata({
	bytes,
}: {
	bytes: Buffer;
}): JianyingFontMetadata {
	const font = requireSingleFont({ font: create(bytes) });
	const familyName = font.familyName.trim();
	const fullName = font.fullName.trim();
	const postscriptName = font.postscriptName.trim();
	if (!(familyName && fullName && postscriptName)) {
		throw new Error("Font name metadata is incomplete");
	}
	return {
		familyName,
		fullName,
		postscriptName,
		subfamilyName: font.subfamilyName.trim() || "Regular",
	};
}

export function getDefaultJianyingFontSearchRoots(): JianyingFontSearchRoot[] {
	const cacheRoot = join(
		homedir(),
		"Movies",
		"JianyingPro",
		"User Data",
		"Cache"
	);
	return [
		{ path: join(cacheRoot, "effect"), sourceKind: "effect" },
		{
			path: join(cacheRoot, "artistEffect"),
			sourceKind: "artist-effect",
		},
		{
			path: join(cacheRoot, "AITextTemplate"),
			sourceKind: "ai-text-template",
		},
		{ path: join(cacheRoot, "GeckoCpp"), sourceKind: "gecko" },
	];
}

function resolveFontFormat({ filePath }: { filePath: string }) {
	return extname(filePath).toLowerCase() === ".otf" ? "otf" : "ttf";
}

async function listFontFiles({
	root,
}: {
	root: JianyingFontSearchRoot;
}): Promise<FontFileCandidate[]> {
	const entries = await readdir(root.path, { withFileTypes: true }).catch(
		() => null
	);
	if (!entries) return [];
	const nested = await Promise.all(
		entries.map(async (entry): Promise<FontFileCandidate[]> => {
			if (entry.name.startsWith("._")) return [];
			const filePath = join(root.path, entry.name);
			if (entry.isDirectory()) {
				return listFontFiles({
					root: { path: filePath, sourceKind: root.sourceKind },
				});
			}
			if (!(entry.isFile() && FONT_FILE_PATTERN.test(entry.name))) return [];
			return [
				{
					filePath,
					format: resolveFontFormat({ filePath }),
					sourceKind: root.sourceKind,
				},
			];
		})
	);
	return nested.flat();
}

async function mapWithConcurrency<TItem, TResult>({
	items,
	limit,
	mapper,
}: {
	items: TItem[];
	limit: number;
	mapper: ({ item, index }: { item: TItem; index: number }) => Promise<TResult>;
}): Promise<TResult[]> {
	const results = new Array<TResult>(items.length);
	let nextIndex = 0;
	const runNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= items.length) return;
		results[index] = await mapper({ item: items[index], index });
		await runNext();
	};
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, () => runNext())
	);
	return results;
}

async function scanFontFile({
	candidate,
	readMetadata,
}: {
	candidate: FontFileCandidate;
	readMetadata: ({ bytes }: { bytes: Buffer }) => JianyingFontMetadata;
}): Promise<ScannedFontFile> {
	try {
		const fileStats = await stat(candidate.filePath);
		if (!(fileStats.isFile() && fileStats.size > 0)) return { kind: "invalid" };
		if (fileStats.size > MAXIMUM_FONT_BYTES) return { kind: "oversized" };
		const bytes = await readFile(candidate.filePath);
		if (bytes.length === 0 || bytes.length > MAXIMUM_FONT_BYTES) {
			return bytes.length > MAXIMUM_FONT_BYTES
				? { kind: "oversized" }
				: { kind: "invalid" };
		}
		return {
			kind: "valid",
			font: {
				...candidate,
				bytesLength: bytes.length,
				metadata: readMetadata({ bytes }),
				sha256: createHash("sha256").update(bytes).digest("hex"),
			},
		};
	} catch {
		return { kind: "invalid" };
	}
}

function toFontId({ sha256 }: { sha256: string }) {
	return `${FONT_ID_PREFIX}${sha256}`;
}

export function isValidJianyingFontId({ fontId }: { fontId: string }) {
	return (
		fontId.startsWith(FONT_ID_PREFIX) &&
		FONT_HASH_PATTERN.test(fontId.slice(FONT_ID_PREFIX.length))
	);
}

function toCssFamily({ sha256 }: { sha256: string }) {
	return `QCutLocal_${sha256.slice(0, 20)}`;
}

function compareFontEntries({
	left,
	right,
}: {
	left: JianyingFontCatalogEntry;
	right: JianyingFontCatalogEntry;
}) {
	return (
		left.familyName.localeCompare(right.familyName, "zh-CN") ||
		left.fullName.localeCompare(right.fullName, "zh-CN") ||
		left.fontId.localeCompare(right.fontId)
	);
}

export async function buildJianyingFontCatalog({
	roots = getDefaultJianyingFontSearchRoots(),
	readFontMetadata = readFontkitMetadata,
}: BuildJianyingFontCatalogOptions = {}): Promise<JianyingFontCatalog> {
	const candidatesByRoot = await Promise.all(
		roots.map(async (root) => ({
			root,
			candidates: await listFontFiles({ root }),
		}))
	);
	const candidates = candidatesByRoot.flatMap(({ candidates: files }) => files);
	const scanned = await mapWithConcurrency({
		items: candidates,
		limit: SCAN_CONCURRENCY,
		mapper: ({ item }) =>
			scanFontFile({ candidate: item, readMetadata: readFontMetadata }),
	});
	const validFonts = scanned.flatMap((result) =>
		result.kind === "valid" ? [result.font] : []
	);
	const byHash = new Map<string, ValidFontFile[]>();
	for (const font of validFonts) {
		const matches = byHash.get(font.sha256) ?? [];
		matches.push(font);
		byHash.set(font.sha256, matches);
	}
	const entries = Array.from(byHash.entries()).map(
		([sha256, matches]): JianyingFontCatalogEntry => {
			const orderedMatches = [...matches].sort((left, right) =>
				left.filePath.localeCompare(right.filePath)
			);
			const primary = orderedMatches[0];
			const sourceKinds = Array.from(
				new Set(orderedMatches.map(({ sourceKind }) => sourceKind))
			).sort();
			return {
				fontId: toFontId({ sha256 }),
				cssFamily: toCssFamily({ sha256 }),
				...primary.metadata,
				format: primary.format,
				size: primary.bytesLength,
				sourceKinds,
				filePaths: orderedMatches.map(({ filePath }) => filePath),
				sha256,
			};
		}
	);
	return {
		entries: entries.sort((left, right) => compareFontEntries({ left, right })),
		rootCount: candidatesByRoot.filter(
			({ candidates: rootCandidates }) => rootCandidates.length > 0
		).length,
		fileCount: candidates.length,
		duplicateFileCount: validFonts.length - entries.length,
		invalidFileCount: scanned.filter(({ kind }) => kind === "invalid").length,
		oversizedFileCount: scanned.filter(({ kind }) => kind === "oversized")
			.length,
	};
}

function summarizeEntry({
	entry,
}: {
	entry: JianyingFontCatalogEntry;
}): JianyingFontLabFontSummary {
	return {
		fontId: entry.fontId,
		cssFamily: entry.cssFamily,
		familyName: entry.familyName,
		fullName: entry.fullName,
		postscriptName: entry.postscriptName,
		subfamilyName: entry.subfamilyName,
		format: entry.format,
		size: entry.size,
		sourceKinds: [...entry.sourceKinds],
	};
}

export function summarizeJianyingFontCatalog({
	catalog,
}: {
	catalog: JianyingFontCatalog;
}) {
	return {
		count: catalog.entries.length,
		fonts: catalog.entries.map((entry) => summarizeEntry({ entry })),
		rootCount: catalog.rootCount,
		fileCount: catalog.fileCount,
		duplicateFileCount: catalog.duplicateFileCount,
		invalidFileCount: catalog.invalidFileCount,
		oversizedFileCount: catalog.oversizedFileCount,
	};
}

export async function readVerifiedJianyingFontBytes({
	entry,
}: {
	entry: JianyingFontCatalogEntry;
}): Promise<Buffer> {
	const attempts = await Promise.all(
		entry.filePaths.map(async (filePath) => {
			try {
				const bytes = await readFile(filePath);
				if (bytes.length === 0 || bytes.length > MAXIMUM_FONT_BYTES)
					return null;
				const sha256 = createHash("sha256").update(bytes).digest("hex");
				return sha256 === entry.sha256 ? bytes : null;
			} catch {
				return null;
			}
		})
	);
	const bytes = attempts.find((candidate) => candidate !== null);
	if (!bytes) throw new Error("本机剪映字体缓存已经变化或消失");
	return makeJianyingFontBrowserCompatible({ bytes });
}

function shouldInspectCodePoint({ codePoint }: { codePoint: number }) {
	return !(
		codePoint === 0x09 ||
		codePoint === 0x0a ||
		codePoint === 0x0d ||
		codePoint === 0x200c ||
		codePoint === 0x200d ||
		(codePoint >= 0xfe00 && codePoint <= 0xfe0f)
	);
}

function formatUnicode({ codePoint }: { codePoint: number }) {
	return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function inspectJianyingFontBytes({
	entry,
	bytes,
	text,
}: {
	entry: JianyingFontCatalogEntry;
	bytes: Buffer;
	text: string;
}): JianyingFontLabInspectResult {
	const font = requireSingleFont({ font: create(bytes) });
	const seen = new Set<number>();
	const codePoints = Array.from(text).flatMap((character) => {
		const codePoint = character.codePointAt(0);
		if (
			codePoint === undefined ||
			seen.has(codePoint) ||
			!shouldInspectCodePoint({ codePoint })
		) {
			return [];
		}
		seen.add(codePoint);
		return [{ character, codePoint }];
	});
	const missing = codePoints
		.filter(({ codePoint }) => !font.hasGlyphForCodePoint(codePoint))
		.slice(0, MAXIMUM_MISSING_GLYPHS)
		.map(({ character, codePoint }) => ({
			character,
			codePoint,
			unicode: formatUnicode({ codePoint }),
		}));
	return {
		fontId: entry.fontId,
		covered: missing.length === 0,
		checkedCodePointCount: codePoints.length,
		missing,
	};
}

export function toJianyingFontLoadResult({
	entry,
	bytes,
}: {
	entry: JianyingFontCatalogEntry;
	bytes: Buffer;
}) {
	return {
		font: summarizeEntry({ entry }),
		bytes: new Uint8Array(bytes),
	};
}
