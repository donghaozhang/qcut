import { constants } from "node:fs";
import { access } from "node:fs/promises";
import {
	buildJianyingFontCatalog,
	type JianyingFontCatalog,
	isValidJianyingFontId,
} from "../jianying-font-lab-catalog.js";
import type { JianyingTextRuntimeDiagnostic } from "../jianying-text-runtime-contract.js";

const DEFAULT_FONT_CANDIDATES = [
	process.env.QCUT_JIANYING_TEXT_DEFAULT_FONT,
	"/System/Library/Fonts/STHeiti Medium.ttc",
	"/System/Library/Fonts/STHeiti Light.ttc",
	"/System/Library/Fonts/Supplemental/Songti.ttc",
].filter((candidate): candidate is string => Boolean(candidate));

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

async function fontCatalog() {
	catalogPromise ??= buildJianyingFontCatalog();
	return catalogPromise;
}

export async function resolveJianyingTextRuntimeFont({
	fontAssetId,
	getCatalog = fontCatalog,
	fallbackCandidates = DEFAULT_FONT_CANDIDATES,
}: {
	fontAssetId?: string;
	getCatalog?: () => Promise<JianyingFontCatalog>;
	fallbackCandidates?: string[];
}): Promise<JianyingTextRuntimeFontResolution> {
	if (!fontAssetId) {
		return {
			filePath: await defaultFontPath({ candidates: fallbackCandidates }),
			state: "default",
			diagnostics: [],
		};
	}
	if (!isValidJianyingFontId({ fontId: fontAssetId })) {
		throw new Error("时间线字体引用格式无效。");
	}
	const catalog = await getCatalog();
	const entry = catalog.entries.find(({ fontId }) => fontId === fontAssetId);
	if (!entry) {
		return {
			filePath: await defaultFontPath({ candidates: fallbackCandidates }),
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
	const checks = await Promise.all(
		entry.filePaths.map(async (filePath) => ({
			filePath,
			readable: await isReadableFile({ filePath }),
		}))
	);
	const selected = checks.find(({ readable }) => readable)?.filePath;
	if (!selected) {
		return {
			filePath: await defaultFontPath({ candidates: fallbackCandidates }),
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
	return { filePath: selected, state: "requested", diagnostics: [] };
}
