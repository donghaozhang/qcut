import path from "node:path";
import { asJianyingRecord } from "../jianying-text-package-metadata.js";
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

function escapeRichTextAttribute({ value }: { value: string }) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
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
	const escaped = escapeRichTextAttribute({ value: fontPath });
	return richText.replace(
		/(<font\b[^>]*\bpath=")[^"]*(")/g,
		(_match, prefix: string, suffix: string) => `${prefix}${escaped}${suffix}`
	);
}

export function hydrateJianyingScriptContent({
	value,
	resourcePaths,
	fontPath,
	degradedResourceIds = new Set<string>(),
}: {
	value: unknown;
	resourcePaths: Readonly<Record<string, string>>;
	fontPath?: string;
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
			record.richText = fontPath
				? replaceJianyingRichTextFontPaths({
						richText: effectStyleHydrated,
						fontPath,
					})
				: effectStyleHydrated;
		}
		pending.push(...Object.values(record));
	}
	return hydrated;
}
