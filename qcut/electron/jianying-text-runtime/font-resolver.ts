import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	access,
	mkdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	buildJianyingFontCatalog,
	type JianyingFontCatalog,
	isValidJianyingFontId,
} from "../jianying-font-lab-catalog.js";
import type { JianyingTextRuntimeDiagnostic } from "../jianying-text-runtime-contract.js";

const FONT_CACHE_EXTENSIONS = ["otf", "ttf"] as const;
const MAXIMUM_FONT_BYTES = 128 * 1024 * 1024;

let catalogPromise: ReturnType<typeof buildJianyingFontCatalog> | null = null;

async function isReadableFile({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

export interface JianyingTextRuntimeFontResolution {
	filePath: string;
	state: "default" | "fallback" | "requested";
	diagnostics: JianyingTextRuntimeDiagnostic[];
}

async function defaultFontPath({ candidates }: { candidates: string[] }) {
	const checks = await Promise.all(
		candidates.map(async (filePath) => ({
			filePath,
			readable: await isReadableFile({ filePath }),
		}))
	);
	const selected = checks.find(({ readable }) => readable)?.filePath;
	if (!selected) throw new Error("未找到可用于剪映花字渲染的本机中文字体。");
	return selected;
}

function defaultFontCandidates({ runtimeRoot }: { runtimeRoot?: string }) {
	return [
		process.env.QCUT_JIANYING_TEXT_DEFAULT_FONT,
		runtimeRoot
			? path.join(runtimeRoot, "Resources", "Font", "SystemFont", "zh-hans.ttf")
			: undefined,
		"/System/Library/Fonts/STHeiti Medium.ttc",
		"/System/Library/Fonts/STHeiti Light.ttc",
		"/System/Library/Fonts/Supplemental/Songti.ttc",
	].filter((candidate): candidate is string => Boolean(candidate));
}

async function fontCatalog() {
	catalogPromise ??= buildJianyingFontCatalog();
	return catalogPromise;
}

function defaultPersistentFontCacheRoot() {
	return path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"jianying-text-runtime",
		"fonts"
	);
}

function fontSha256({ fontAssetId }: { fontAssetId: string }) {
	return fontAssetId.slice("sha256:".length);
}

async function readVerifiedFont({
	expectedSha256,
	filePath,
}: {
	expectedSha256: string;
	filePath: string;
}) {
	try {
		const metadata = await stat(filePath);
		if (
			!metadata.isFile() ||
			metadata.size <= 0 ||
			metadata.size > MAXIMUM_FONT_BYTES
		) {
			return null;
		}
		const bytes = await readFile(filePath);
		return createHash("sha256").update(bytes).digest("hex") === expectedSha256
			? { bytes, filePath }
			: null;
	} catch {
		return null;
	}
}

async function resolvePersistentFont({
	fontAssetId,
	persistentCacheRoot,
}: {
	fontAssetId: string;
	persistentCacheRoot: string;
}) {
	const expectedSha256 = fontSha256({ fontAssetId });
	const attempts = await Promise.all(
		FONT_CACHE_EXTENSIONS.map((extension) =>
			readVerifiedFont({
				expectedSha256,
				filePath: path.join(
					persistentCacheRoot,
					`${expectedSha256}.${extension}`
				),
			})
		)
	);
	return attempts.find((attempt) => attempt !== null) ?? null;
}

async function persistVerifiedFont({
	bytes,
	format,
	fontAssetId,
	persistentCacheRoot,
}: {
	bytes: Buffer;
	format: "otf" | "ttf";
	fontAssetId: string;
	persistentCacheRoot: string;
}) {
	const expectedSha256 = fontSha256({ fontAssetId });
	const destination = path.join(
		persistentCacheRoot,
		`${expectedSha256}.${format}`
	);
	const ready = await readVerifiedFont({
		expectedSha256,
		filePath: destination,
	});
	if (ready) return ready.filePath;
	await mkdir(persistentCacheRoot, { recursive: true, mode: 0o700 });
	const temporary = path.join(
		persistentCacheRoot,
		`.${expectedSha256}-${randomUUID()}.tmp`
	);
	try {
		await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
		await rename(temporary, destination);
		const installed = await readVerifiedFont({
			expectedSha256,
			filePath: destination,
		});
		return installed?.filePath ?? null;
	} finally {
		await rm(temporary, { force: true });
	}
}

async function resolveCatalogFont({
	entry,
}: {
	entry: JianyingFontCatalog["entries"][number];
}) {
	const attempts = await Promise.all(
		entry.filePaths.map((filePath) =>
			readVerifiedFont({ expectedSha256: entry.sha256, filePath })
		)
	);
	return attempts.find((attempt) => attempt !== null) ?? null;
}

export async function resolveJianyingTextRuntimeFont({
	fontAssetId,
	runtimeRoot,
	getCatalog = fontCatalog,
	fallbackCandidates,
	persistentCacheRoot = defaultPersistentFontCacheRoot(),
}: {
	fontAssetId?: string;
	runtimeRoot?: string;
	getCatalog?: () => Promise<JianyingFontCatalog>;
	fallbackCandidates?: string[];
	persistentCacheRoot?: string;
}): Promise<JianyingTextRuntimeFontResolution> {
	const resolvedFallbackCandidates =
		fallbackCandidates ?? defaultFontCandidates({ runtimeRoot });
	if (!fontAssetId) {
		return {
			filePath: await defaultFontPath({
				candidates: resolvedFallbackCandidates,
			}),
			state: "default",
			diagnostics: [],
		};
	}
	if (!isValidJianyingFontId({ fontId: fontAssetId })) {
		throw new Error("时间线字体引用格式无效。");
	}
	const persistent = await resolvePersistentFont({
		fontAssetId,
		persistentCacheRoot,
	});
	if (persistent) {
		return {
			filePath: persistent.filePath,
			state: "requested",
			diagnostics: [],
		};
	}
	const catalog = await getCatalog();
	const entry = catalog.entries.find(({ fontId }) => fontId === fontAssetId);
	if (!entry) {
		return {
			filePath: await defaultFontPath({
				candidates: resolvedFallbackCandidates,
			}),
			state: "fallback",
			diagnostics: [
				{
					code: "font-asset-missing",
					severity: "warning",
					message: "时间线引用的本机剪映字体已经缺失，已改用系统中文字体。",
					fontAssetId,
				},
			],
		};
	}
	const selected = await resolveCatalogFont({ entry });
	if (!selected) {
		return {
			filePath: await defaultFontPath({
				candidates: resolvedFallbackCandidates,
			}),
			state: "fallback",
			diagnostics: [
				{
					code: "font-file-missing",
					severity: "warning",
					message: "时间线引用的本机剪映字体文件已经缺失，已改用系统中文字体。",
					fontAssetId,
				},
			],
		};
	}
	const cachedPath = await persistVerifiedFont({
		bytes: selected.bytes,
		format: entry.format,
		fontAssetId,
		persistentCacheRoot,
	}).catch(() => null);
	return {
		filePath: cachedPath ?? selected.filePath,
		state: "requested",
		diagnostics: [],
	};
}
