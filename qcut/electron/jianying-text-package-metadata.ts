import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { JianyingTextStylePackageKind } from "./jianying-text-style-lab-contract.js";

export const JIANYING_TEXT_RESOURCE_ID_PATTERN = /^\d{1,32}$/;
export const JIANYING_TEXT_PACKAGE_HASH_PATTERN = /^[a-f0-9]{32}$/i;
export const MAXIMUM_JIANYING_TEXT_JSON_BYTES = 2 * 1024 * 1024;
export const DEFAULT_JIANYING_TEXT_TEMPLATE_DURATION = 3;

export function asJianyingRecord(
	value: unknown
): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export async function readBoundedJianyingTextJson({
	filePath,
}: {
	filePath: string;
}) {
	const fileStats = await stat(filePath);
	if (!(fileStats.isFile() && fileStats.size > 0)) {
		throw new Error("JSON file is empty");
	}
	if (fileStats.size > MAXIMUM_JIANYING_TEXT_JSON_BYTES) {
		throw new Error("JSON file is too large");
	}
	return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

export function detectJianyingTextPackageKind({
	config,
}: {
	config: unknown;
}): JianyingTextStylePackageKind {
	const links = asJianyingRecord(asJianyingRecord(config)?.effect)?.Link;
	if (!Array.isArray(links)) return "unknown";
	const linkTypes = new Set(
		links.flatMap((link) => {
			const type = asJianyingRecord(link)?.type;
			return typeof type === "string" ? [type] : [];
		})
	);
	for (const kind of [
		"TextStyle",
		"InfoSticker",
		"ScriptInfoSticker",
		"AmazingFeature",
	] as const) {
		if (linkTypes.has(kind)) return kind;
	}
	return "unknown";
}

function positiveDuration({ value }: { value: unknown }) {
	return typeof value === "number" &&
		Number.isFinite(value) &&
		value > 0 &&
		value <= 60
		? value
		: null;
}

export async function readJianyingTextTemplateDuration({
	packagePath,
	packageKind,
}: {
	packagePath: string;
	packageKind: JianyingTextStylePackageKind;
}) {
	if (packageKind !== "ScriptInfoSticker") {
		return DEFAULT_JIANYING_TEXT_TEMPLATE_DURATION;
	}
	const content = asJianyingRecord(
		await readBoundedJianyingTextJson({
			filePath: path.join(packagePath, "content.json"),
		})
	);
	if (!content) throw new Error("ScriptInfoSticker content.json is invalid");
	const rootDuration = positiveDuration({
		value: asJianyingRecord(content.root)?.duration,
	});
	if (rootDuration) return rootDuration;
	const children = Array.isArray(content.children) ? content.children : [];
	const childDuration = children.reduce((maximum, child) => {
		const record = asJianyingRecord(child);
		const start =
			typeof record?.start_time === "number" &&
			Number.isFinite(record.start_time)
				? Math.max(0, record.start_time)
				: 0;
		const duration = positiveDuration({ value: record?.duration }) ?? 0;
		return Math.max(maximum, start + duration);
	}, 0);
	return positiveDuration({ value: childDuration }) ??
		DEFAULT_JIANYING_TEXT_TEMPLATE_DURATION;
}
