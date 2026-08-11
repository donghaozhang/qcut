import { constants } from "node:fs";
import { access } from "node:fs/promises";
import {
	buildJianyingFontCatalog,
	isValidJianyingFontId,
} from "../jianying-font-lab-catalog.js";

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

async function defaultFontPath() {
	const checks = await Promise.all(
		DEFAULT_FONT_CANDIDATES.map(async (filePath) => ({
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
}: {
	fontAssetId?: string;
}) {
	if (!fontAssetId) return defaultFontPath();
	if (!isValidJianyingFontId({ fontId: fontAssetId })) {
		throw new Error("时间线字体引用格式无效。");
	}
	const catalog = await fontCatalog();
	const entry = catalog.entries.find(({ fontId }) => fontId === fontAssetId);
	if (!entry) throw new Error("时间线引用的本机剪映字体已经缺失。");
	const checks = await Promise.all(
		entry.filePaths.map(async (filePath) => ({
			filePath,
			readable: await isReadableFile({ filePath }),
		}))
	);
	const selected = checks.find(({ readable }) => readable)?.filePath;
	if (!selected) throw new Error("时间线引用的本机剪映字体文件已经缺失。");
	return selected;
}
