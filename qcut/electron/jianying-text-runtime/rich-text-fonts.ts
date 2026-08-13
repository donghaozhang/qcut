import path from "node:path";
import { JIANYING_TEXT_RESOURCE_ID_PATTERN } from "../jianying-text-package-metadata.js";

const FONT_TAG_PATTERN = /<font\b[^>]*>/g;

function richTextAttribute({
	tag,
	name,
}: {
	tag: string;
	name: "id" | "path";
}) {
	const match = new RegExp(
		`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`
	).exec(tag);
	return match?.[1] ?? match?.[2] ?? match?.[3];
}

function fontResourceId({ tag }: { tag: string }) {
	const resourceId = richTextAttribute({ tag, name: "id" });
	if (resourceId === undefined || resourceId === "") return undefined;
	if (!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId)) {
		throw new Error("ScriptInfoSticker font id is invalid");
	}
	return resourceId;
}

function escapeRichTextAttribute({ value }: { value: string }) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function replaceFontPathAttribute({
	tag,
	value,
}: {
	tag: string;
	value: string;
}) {
	const pathAttribute = /\bpath\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/;
	const replacement = `path="${escapeRichTextAttribute({ value })}"`;
	if (richTextAttribute({ tag, name: "path" }) !== undefined) {
		return tag.replace(pathAttribute, replacement);
	}
	return `${tag.slice(0, -1)} ${replacement}>`;
}

function requireAbsoluteFontPath({ fontPath }: { fontPath: string }) {
	if (!path.isAbsolute(fontPath)) {
		throw new Error("Jianying text font path must be absolute");
	}
	return fontPath;
}

export function collectJianyingRichTextFontIds({
	richText,
}: {
	richText: string;
}) {
	const resourceIds = new Set<string>();
	for (const match of richText.matchAll(FONT_TAG_PATTERN)) {
		const resourceId = fontResourceId({ tag: match[0] });
		if (resourceId) resourceIds.add(resourceId);
	}
	return [...resourceIds].sort();
}

export function hydrateJianyingRichTextFontPaths({
	fallbackFontPath,
	fontPaths,
	overrideFontPath,
	richText,
}: {
	fallbackFontPath?: string;
	fontPaths: Readonly<Record<string, string>>;
	overrideFontPath?: string;
	richText: string;
}) {
	return richText.replace(FONT_TAG_PATTERN, (tag) => {
		const resourceId = fontResourceId({ tag });
		const selected =
			overrideFontPath ??
			(resourceId ? fontPaths[resourceId] : undefined) ??
			fallbackFontPath;
		if (!selected) return tag;
		return replaceFontPathAttribute({
			tag,
			value: requireAbsoluteFontPath({ fontPath: selected }),
		});
	});
}
