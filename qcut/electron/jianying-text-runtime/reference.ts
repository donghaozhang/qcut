import type {
	JianyingTextAnimationReference,
	JianyingTextAnimationReferences,
	JianyingTextAnimationSlot,
	JianyingTextRuntimeReference,
} from "../jianying-text-runtime-contract.js";

const RESOURCE_ID_PATTERN = /^\d{1,32}$/;
const PACKAGE_HASH_PATTERN = /^[a-f0-9]{32}$/i;
const MAXIMUM_DURATION_SECONDS = 60;
const ANIMATION_SLOTS = ["entrance", "exit", "loop"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function normalizeAnimationReference({
	value,
}: {
	value: unknown;
}): JianyingTextAnimationReference | null {
	const record = asRecord(value);
	if (
		!record ||
		record.source !== "jianying-cache" ||
		typeof record.resourceId !== "string" ||
		!RESOURCE_ID_PATTERN.test(record.resourceId) ||
		typeof record.packageHash !== "string" ||
		!PACKAGE_HASH_PATTERN.test(record.packageHash) ||
		typeof record.duration !== "number" ||
		!Number.isFinite(record.duration) ||
		record.duration <= 0 ||
		record.duration > MAXIMUM_DURATION_SECONDS
	) {
		return null;
	}
	return {
		source: "jianying-cache",
		resourceId: record.resourceId,
		packageHash: record.packageHash.toLowerCase(),
		duration: record.duration,
	};
}

function normalizeAnimationReferences({
	value,
}: {
	value: unknown;
}): JianyingTextAnimationReferences | null {
	const record = asRecord(value);
	if (!record) return null;
	const animations: JianyingTextAnimationReferences = {};
	for (const slot of ANIMATION_SLOTS) {
		if (record[slot] === undefined) continue;
		const animation = normalizeAnimationReference({ value: record[slot] });
		if (!animation) return null;
		animations[slot] = animation;
	}
	return animations;
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
		record.packageKind !== "ScriptInfoSticker" &&
		record.packageKind !== "TextStyle"
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
		record.templateDuration > MAXIMUM_DURATION_SECONDS
	) {
		return null;
	}
	const animations =
		record.animations === undefined
			? undefined
			: normalizeAnimationReferences({ value: record.animations });
	if (animations === null) return null;
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
		...(animations && Object.keys(animations).length > 0 ? { animations } : {}),
	};
}
