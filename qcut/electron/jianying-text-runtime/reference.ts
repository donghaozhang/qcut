import type { JianyingTextRuntimeReference } from "../jianying-text-runtime-contract.js";

const RESOURCE_ID_PATTERN = /^\d{1,32}$/;
const PACKAGE_HASH_PATTERN = /^[a-f0-9]{32}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function normalizeJianyingTextRuntimeReference({
	value,
}: {
	value: unknown;
}): JianyingTextRuntimeReference | null {
	const record = asRecord(value);
	if (!record) return null;
	if (record.schemaVersion !== 1 || record.source !== "jianying-cache") {
		return null;
	}
	if (
		record.packageKind !== "InfoSticker" &&
		record.packageKind !== "ScriptInfoSticker"
	) {
		return null;
	}
	if (
		typeof record.resourceId !== "string" ||
		!RESOURCE_ID_PATTERN.test(record.resourceId) ||
		typeof record.packageHash !== "string" ||
		!PACKAGE_HASH_PATTERN.test(record.packageHash)
	) {
		return null;
	}
	if (
		record.editMode !== "runtime-with-preload-fallback" ||
		record.slotMapping !== "line-to-widget" ||
		record.timeMapping !== "stretch" ||
		typeof record.templateDuration !== "number" ||
		!Number.isFinite(record.templateDuration) ||
		record.templateDuration <= 0 ||
		record.templateDuration > 60
	) {
		return null;
	}
	return {
		schemaVersion: 1,
		source: "jianying-cache",
		packageKind: record.packageKind,
		resourceId: record.resourceId,
		packageHash: record.packageHash.toLowerCase(),
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: record.templateDuration,
	};
}
