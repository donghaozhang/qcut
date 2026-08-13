import path from "node:path";
import { asJianyingRecord } from "../jianying-text-package-metadata.js";
import { hydrateJianyingRichTextFontPaths } from "./rich-text-fonts.js";
import { replaceJianyingRichTextEffectStylePaths } from "./rich-text-resources.js";

function requireResourcePath({
	degradedResourceIds,
	resourceId,
	resourcePaths,
}: {
	degradedResourceIds: ReadonlySet<string>;
	resourceId: string;
	resourcePaths: Readonly<Record<string, string>>;
}) {
	const resolved = resourcePaths[resourceId];
	if (!resolved && degradedResourceIds.has(resourceId)) return "";
	if (!(resolved && path.isAbsolute(resolved))) {
		throw new Error(`Missing resolved Jianying resource ${resourceId}`);
	}
	return resolved;
}

function hasDegradedAnimation({
	value,
	degradedResourceIds,
}: {
	value: unknown;
	degradedResourceIds: ReadonlySet<string>;
}) {
	const record = asJianyingRecord(value);
	if (!(record?.type === "shape" && Array.isArray(record.anims))) return false;
	return record.anims.some((animation) => {
		const animationRecord = asJianyingRecord(animation);
		const resourceId = animationRecord?.anim_resource_id;
		return (
			typeof resourceId === "string" && degradedResourceIds.has(resourceId)
		);
	});
}

export function replaceJianyingRichTextFontPaths({
	richText,
	fontPath,
}: {
	richText: string;
	fontPath: string;
}) {
	if (!path.isAbsolute(fontPath)) {
		throw new Error("Jianying text font path must be absolute");
	}
	return hydrateJianyingRichTextFontPaths({
		richText,
		fontPaths: {},
		overrideFontPath: fontPath,
	});
}

export function hydrateJianyingScriptContent({
	value,
	resourcePaths,
	fallbackFontPath,
	fontOverridePath,
	fontPaths = {},
	degradedResourceIds = new Set<string>(),
}: {
	value: unknown;
	resourcePaths: Readonly<Record<string, string>>;
	fallbackFontPath?: string;
	fontOverridePath?: string;
	fontPaths?: Readonly<Record<string, string>>;
	degradedResourceIds?: ReadonlySet<string>;
}) {
	const hydrated = structuredClone(value);
	const pending: unknown[] = [hydrated];
	while (pending.length > 0) {
		const current = pending.pop();
		if (Array.isArray(current)) {
			pending.push(...current);
			continue;
		}
		const record = asJianyingRecord(current);
		if (!record) continue;
		if (Array.isArray(record.children)) {
			record.children = record.children.filter(
				(child) =>
					!hasDegradedAnimation({
						value: child,
						degradedResourceIds,
					})
			);
		}
		if (Array.isArray(record.anims)) {
			record.anims = record.anims.filter((animation) => {
				const animationRecord = asJianyingRecord(animation);
				const resourceId = animationRecord?.anim_resource_id;
				return !(
					typeof resourceId === "string" && degradedResourceIds.has(resourceId)
				);
			});
		}
		const animationId = record.anim_resource_id;
		if (typeof animationId === "string" && animationId.length > 0) {
			record.anim_resource_path = requireResourcePath({
				degradedResourceIds,
				resourceId: animationId,
				resourcePaths,
			});
		}
		const stickerId = record.sticker_resource_id;
		if (typeof stickerId === "string" && stickerId.length > 0) {
			record.sticker_path = requireResourcePath({
				degradedResourceIds,
				resourceId: stickerId,
				resourcePaths,
			});
		}
		if (typeof record.richText === "string") {
			const effectStyleHydrated = replaceJianyingRichTextEffectStylePaths({
				richText: record.richText,
				resourcePaths,
				missingBehavior: "clear-path",
			});
			record.richText = hydrateJianyingRichTextFontPaths({
				richText: effectStyleHydrated,
				fontPaths,
				fallbackFontPath,
				overrideFontPath: fontOverridePath,
			});
		}
		pending.push(...Object.values(record));
	}
	return hydrated;
}
