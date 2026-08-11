import path from "node:path";
import { asJianyingRecord } from "../jianying-text-package-metadata.js";

function requireResourcePath({
	resourceId,
	resourcePaths,
}: {
	resourceId: string;
	resourcePaths: Readonly<Record<string, string>>;
}) {
	const resolved = resourcePaths[resourceId];
	if (!(resolved && path.isAbsolute(resolved))) {
		throw new Error(`Missing resolved Jianying resource ${resourceId}`);
	}
	return resolved;
}

function escapeRichTextAttribute({ value }: { value: string }) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
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
}: {
	value: unknown;
	resourcePaths: Readonly<Record<string, string>>;
	fontPath?: string;
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
		const animationId = record.anim_resource_id;
		if (typeof animationId === "string" && animationId.length > 0) {
			record.anim_resource_path = requireResourcePath({
				resourceId: animationId,
				resourcePaths,
			});
		}
		const stickerId = record.sticker_resource_id;
		if (typeof stickerId === "string" && stickerId.length > 0) {
			record.sticker_path = requireResourcePath({
				resourceId: stickerId,
				resourcePaths,
			});
		}
		if (fontPath && typeof record.richText === "string") {
			record.richText = replaceJianyingRichTextFontPaths({
				richText: record.richText,
				fontPath,
			});
		}
		pending.push(...Object.values(record));
	}
	return hydrated;
}
