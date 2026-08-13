import type {
	JianyingTextAnimationReference,
	JianyingTextAnimationReferences,
	JianyingTextStyleReference,
} from "./types/timeline.js";

const RESOURCE_ID_PATTERN = /^\d{1,32}$/;
const PACKAGE_HASH_PATTERN = /^[a-f0-9]{32}$/i;
const MAX_TEMPLATE_DURATION_SECONDS = 60;
const ANIMATION_SLOTS = ["entrance", "exit", "loop"] as const;

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function normalizeAnimationReference({
	value,
}: {
	value: unknown;
}): JianyingTextAnimationReference | undefined {
	const reference = asRecord({ value });
	if (
		!reference ||
		reference.source !== "jianying-cache" ||
		typeof reference.resourceId !== "string" ||
		!RESOURCE_ID_PATTERN.test(reference.resourceId) ||
		typeof reference.packageHash !== "string" ||
		!PACKAGE_HASH_PATTERN.test(reference.packageHash) ||
		typeof reference.duration !== "number" ||
		!Number.isFinite(reference.duration) ||
		reference.duration <= 0 ||
		reference.duration > MAX_TEMPLATE_DURATION_SECONDS
	) {
		return undefined;
	}
	return {
		source: "jianying-cache",
		resourceId: reference.resourceId,
		packageHash: reference.packageHash.toLowerCase(),
		duration: reference.duration,
	};
}

function normalizeAnimationReferences({
	value,
}: {
	value: unknown;
}): JianyingTextAnimationReferences | undefined {
	const reference = asRecord({ value });
	if (!reference) return undefined;
	const animations: JianyingTextAnimationReferences = {};
	for (const slot of ANIMATION_SLOTS) {
		if (reference[slot] === undefined) continue;
		const animation = normalizeAnimationReference({ value: reference[slot] });
		if (!animation) return undefined;
		animations[slot] = animation;
	}
	return animations;
}

export function normalizeJianyingTextStyleReference({
	value,
}: {
	value: unknown;
}): JianyingTextStyleReference | undefined {
	const reference = asRecord({ value });
	if (!reference) return undefined;
	if (reference.schemaVersion !== 1) return undefined;
	if (reference.source !== "jianying-cache") return undefined;
	const packageKind = reference.packageKind;
	if (
		packageKind !== "InfoSticker" &&
		packageKind !== "ScriptInfoSticker" &&
		packageKind !== "TextStyle"
	) {
		return undefined;
	}
	if (
		typeof reference.resourceId !== "string" ||
		!RESOURCE_ID_PATTERN.test(reference.resourceId)
	) {
		return undefined;
	}
	if (
		typeof reference.packageHash !== "string" ||
		!PACKAGE_HASH_PATTERN.test(reference.packageHash)
	) {
		return undefined;
	}
	if (reference.editMode !== "runtime-with-preload-fallback") return undefined;
	if (reference.slotMapping !== "line-to-widget") return undefined;
	if (reference.timeMapping !== "stretch") return undefined;
	if (
		typeof reference.templateDuration !== "number" ||
		!Number.isFinite(reference.templateDuration) ||
		reference.templateDuration <= 0 ||
		reference.templateDuration > MAX_TEMPLATE_DURATION_SECONDS
	) {
		return undefined;
	}
	const animations =
		reference.animations === undefined
			? undefined
			: normalizeAnimationReferences({ value: reference.animations });
	if (reference.animations !== undefined && !animations) return undefined;

	return {
		schemaVersion: 1,
		source: "jianying-cache",
		packageKind,
		resourceId: reference.resourceId,
		packageHash: reference.packageHash.toLowerCase(),
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: reference.templateDuration,
		...(animations && Object.keys(animations).length > 0 ? { animations } : {}),
	};
}
