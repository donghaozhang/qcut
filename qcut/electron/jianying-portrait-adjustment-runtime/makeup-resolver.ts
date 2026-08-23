import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { jianyingFilterPrivateRuntimeCurrent } from "../jianying-filter-local-runtime/private-runtime.js";
import {
	JIANYING_PORTRAIT_MAKEUP_CARDS,
	type JianyingPortraitMakeupCardDefinition,
} from "./makeup-catalog.js";

export interface JianyingPortraitMakeupCardResolution {
	card: JianyingPortraitMakeupCardDefinition;
	packagePath: string | null;
	source: "qcut-private" | "jianying-installation" | "none";
	thumbnailDataUrl?: string;
}

function installedEffectRoot() {
	return path.join(
		os.homedir(),
		"Movies",
		"JianyingPro",
		"User Data",
		"Cache",
		"effect"
	);
}

async function isReadableCardPackage({
	card,
	directory,
}: {
	card: JianyingPortraitMakeupCardDefinition;
	directory: string;
}) {
	const payload =
		card.kind === "dynamic"
			? path.join(directory, "makeup.prefab")
			: path.join(directory, "AmazingFeature", "main.scene");
	try {
		await Promise.all([
			access(path.join(directory, "config.json"), constants.R_OK),
			access(payload, constants.R_OK),
		]);
		return true;
	} catch {
		return false;
	}
}

function imageMimeType({ filePath }: { filePath: string }) {
	switch (path.extname(filePath).toLowerCase()) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".webp":
			return "image/webp";
		default:
			return "image/png";
	}
}

async function readThumbnail({
	card,
	packagePath,
}: {
	card: JianyingPortraitMakeupCardDefinition;
	packagePath: string;
}) {
	const filePath = path.join(packagePath, card.thumbnailRelativePath);
	try {
		const fileStats = await stat(filePath);
		if (!fileStats.isFile() || fileStats.size > 768 * 1024) return undefined;
		const bytes = await readFile(filePath);
		return `data:${imageMimeType({ filePath })};base64,${bytes.toString("base64")}`;
	} catch {
		return undefined;
	}
}

export async function resolveJianyingPortraitMakeupCard({
	card,
}: {
	card: JianyingPortraitMakeupCardDefinition;
}): Promise<JianyingPortraitMakeupCardResolution> {
	const relativePath = path.join(card.resourceId, card.version);
	const candidates = [
		{
			packagePath: path.join(
				jianyingFilterPrivateRuntimeCurrent(),
				"Cache",
				"effect",
				relativePath
			),
			source: "qcut-private" as const,
		},
		{
			packagePath: path.join(installedEffectRoot(), relativePath),
			source: "jianying-installation" as const,
		},
	];
	for (const candidate of candidates) {
		if (
			!(await isReadableCardPackage({ card, directory: candidate.packagePath }))
		) {
			continue;
		}
		return {
			card,
			...candidate,
			thumbnailDataUrl: await readThumbnail({
				card,
				packagePath: candidate.packagePath,
			}),
		};
	}
	return { card, packagePath: null, source: "none" };
}

export function resolveJianyingPortraitMakeupCards() {
	return Promise.all(
		JIANYING_PORTRAIT_MAKEUP_CARDS.map((card) =>
			resolveJianyingPortraitMakeupCard({ card })
		)
	);
}
